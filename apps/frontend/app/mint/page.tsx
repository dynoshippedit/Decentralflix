'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { createWalletClient, createPublicClient, custom, http, formatEther, parseEther, defineChain } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { useSearchParams } from 'next/navigation';
import { TICKET_NFT_ADDRESS, TICKET_NFT_ABI, PLATFORM_FEE_BPS } from '@/lib/contracts';
import { ticketFilmIdForVideoHash } from '@/lib/contracts/ticketFilmId';
import LegalConsentModal, { hasLegalConsent, acceptLegalConsent } from '@/components/LegalConsentModal';
import { getDemoFilm } from '@/lib/demo-content';
import { LICENSE_TABLE, APPLE_NFT_NOTE, BUNDLES_BEFORE_WALLET_NOTE } from '@/lib/licensing';
import Link from 'next/link';

const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
// Well-known address of the first contract deployed on a fresh Hardhat node
// (deployer 0xf39F…2266, nonce 0). Same heuristic the previous revision used:
// when the configured TicketNFT deployment is local we target chain 31337,
// otherwise Arbitrum Sepolia. A locally-deployed TicketNFT that is NOT the
// first deployment will miss this heuristic and target Sepolia — set the
// address accordingly in local testing.
const LOCAL_FIRST_DEPLOY = '0x5fbdb2315678afecb367f032d93f642f64180aa3';

type OnChainFilm = {
  title: string;
  priceWei: bigint;
  filmmaker: string;
  active: boolean;
};

function MintPageInner() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const searchParams = useSearchParams();

  const filmHashParam = searchParams.get('film') || '';
  const demoFilm = getDemoFilm(filmHashParam);

  const [videoHash, setVideoHash] = useState(filmHashParam);
  const [isMinting, setIsMinting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [step, setStep] = useState<'choose' | 'confirm' | 'success'>('choose');

  // F-1: the purchase flow is TicketNFT.mintTicket (user-payable). The filmId
  // is derived deterministically from the videoHash — registration MUST use
  // ticketFilmIdForVideoHash for the same hash (see lib/contracts/ticketFilmId).
  // F-2: there is no `creator` parameter anywhere in this flow — no silent
  // default to the buyer. The 75% creator share goes to the filmmaker
  // recorded on-chain at registration.
  const filmId = useMemo(() => {
    if (!videoHash) return null;
    try {
      return ticketFilmIdForVideoHash(videoHash);
    } catch {
      return null;
    }
  }, [videoHash]);

  const [film, setFilm] = useState<OnChainFilm | null>(null);
  const [filmState, setFilmState] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle');
  const [filmError, setFilmError] = useState<string | null>(null);

  const connectedAddress = user?.wallet?.address as `0x${string}` | undefined;

  const isLocalAddress = TICKET_NFT_ADDRESS.toLowerCase() === LOCAL_FIRST_DEPLOY;
  const targetChain = isLocalAddress ? hardhatLocal : arbitrumSepolia;
  const isDemoMode = TICKET_NFT_ADDRESS === ZERO_ADDRESS;

  // Read the on-chain film (exact price, active flag) before offering the buy.
  // A film that was never registered shows as missing instead of letting the
  // buyer submit a transaction that is guaranteed to revert (the F-1 shape).
  useEffect(() => {
    if (isDemoMode || !filmId) {
      setFilm(null);
      setFilmState('idle');
      setFilmError(null);
      return;
    }
    let cancelled = false;
    setFilmState('loading');
    setFilmError(null);
    const client = createPublicClient({ chain: targetChain, transport: http() });
    client
      .readContract({
        address: TICKET_NFT_ADDRESS,
        abi: TICKET_NFT_ABI,
        functionName: 'getFilm',
        args: [filmId],
      })
      .then((r: any) => {
        if (cancelled) return;
        setFilm({
          title: String(r.title ?? r[0] ?? ''),
          priceWei: BigInt(r.priceWei ?? r[1] ?? 0),
          filmmaker: String(r.filmmaker ?? r[2] ?? ''),
          active: Boolean(r.active ?? r[3] ?? false),
        });
        setFilmState('ready');
      })
      .catch((e: any) => {
        if (cancelled) return;
        if (String(e?.message || e).includes('FilmNotFound')) {
          setFilm(null);
          setFilmState('missing');
        } else {
          setFilm(null);
          setFilmState('error');
          setFilmError('Could not load this film from the ticket contract. Check your connection and try again.');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmId, isDemoMode]);

  const displayPriceWei = film ? film.priceWei : parseEther(demoFilm?.price || '0.01');
  const displayPrice = film ? formatEther(film.priceWei) : demoFilm?.price || '0.01';
  const platformFee = (displayPriceWei * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
  const feePct = (PLATFORM_FEE_BPS / 100).toFixed(0);

  // F-2: the filmmaker recorded on-chain must be explicit — nonzero and not
  // the buyer. A zero or buyer-equal filmmaker would silently misroute the
  // 75% creator share, so the purchase is disabled instead of defaulting.
  const filmmakerBlockedReason = (): string | null => {
    if (isDemoMode || !film) return null;
    if (film.filmmaker === '' || film.filmmaker.toLowerCase() === ZERO_ADDRESS) {
      return 'This film has no filmmaker recorded on-chain — the 75% creator share has nowhere to go, so this sale is blocked.';
    }
    if (connectedAddress && film.filmmaker.toLowerCase() === connectedAddress.toLowerCase()) {
      return 'This film lists your wallet as the filmmaker — the 75% creator share would route back to you, so this sale is blocked.';
    }
    return null;
  };

  const handleGetAccess = () => {
    if (!authenticated) { login(); return; }
    if (!hasLegalConsent()) { setShowConsentModal(true); return; }
    setStep('confirm');
  };

  const buyDisabledReason = (): string | null => {
    if (isDemoMode) return null;
    if (filmState === 'loading') return 'Loading the on-chain film…';
    if (filmState === 'missing') return 'This film is not registered for on-chain ticket sales yet.';
    if (filmState === 'error') return filmError || 'Could not load the film.';
    if (film && !film.active) return 'Ticket sales are paused for this film.';
    const filmmakerReason = filmmakerBlockedReason();
    if (filmmakerReason) return filmmakerReason;
    return null;
  };

  const handleMint = async () => {
    if (!connectedAddress || !videoHash) return;
    if (isDemoMode) {
      // Demo mode — simulate success
      setTxHash('0xdemo-tx-' + Date.now().toString(16));
      setStep('success');
      return;
    }
    if (!filmId || filmState !== 'ready' || !film || !film.active) return;
    if (filmmakerBlockedReason()) return;

    setIsMinting(true);
    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: connectedAddress,
        chain: targetChain,
        transport: custom(provider),
      });
      // Exact payment: the contract reverts unless msg.value equals the price.
      const hash = await walletClient.writeContract({
        address: TICKET_NFT_ADDRESS,
        abi: TICKET_NFT_ABI,
        functionName: 'mintTicket',
        account: connectedAddress,
        args: [filmId],
        value: film.priceWei,
      });
      setTxHash(hash);
      setStep('success');
    } catch (err: any) {
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('user rejected')) msg = 'You cancelled the transaction.';
      else if (msg.includes('insufficient funds')) msg = 'Not enough ETH for this purchase.';
      else if (msg.includes('IncorrectPayment')) msg = 'Price changed — reload the film and try again.';
      else if (msg.includes('FilmInactive')) msg = 'Ticket sales are paused for this film.';
      alert(msg);
    } finally {
      setIsMinting(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Success screen
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-6">🎬</div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">It’s yours to watch.</h1>
          <p className="text-white/60 mb-8 leading-relaxed">
            Your license for <strong>{demoFilm?.title || videoHash}</strong> is recorded.
            Watch on web and mobile under the film’s license terms — streaming access
            depends on the licensed service, and where the filmmaker allows downloads your copy
            plays offline without us.
          </p>
          {txHash && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 font-mono text-xs text-white/40 break-all">
              {txHash}
            </div>
          )}
          <div className="flex flex-col gap-3">
            <Link
              href={`/watch/${encodeURIComponent(videoHash)}`}
              className="px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition text-center"
            >
              Watch Now
            </Link>
            <Link href="/collection" className="px-8 py-3 border border-white/20 rounded-full text-white/60 hover:text-white transition text-sm text-center">
              My Collection
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const disabledReason = buyDisabledReason();

  // Confirm screen
  if (step === 'confirm') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full">
          <button onClick={() => setStep('choose')} className="text-white/40 hover:text-white text-sm mb-8 flex items-center gap-2">
            ← Back
          </button>
          <h2 className="text-3xl font-semibold tracking-tight mb-6">Confirm your purchase</h2>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 space-y-4">
            <div className="flex justify-between">
              <span className="text-white/50">Film</span>
              <span className="font-medium">{film?.title || demoFilm?.title || videoHash}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Ticket</span>
              <span>Single-film access NFT</span>
            </div>
            <div className="border-t border-white/10 pt-4 flex justify-between">
              <span className="text-white/50">Creator receives</span>
              <span className="text-emerald-400">{(100 - parseInt(feePct))}% to the creator</span>
            </div>
            <div className="flex justify-between text-xl font-semibold">
              <span>Total</span>
              <span>{displayPrice} ETH</span>
            </div>
          </div>

          {disabledReason && (
            <p className="text-amber-200/80 text-sm mb-6 leading-relaxed">{disabledReason}</p>
          )}

          <p className="text-white/40 text-xs mb-6 leading-relaxed">
            This is a one-time purchase of a viewing license plus an optional collector token —
            not an investment, not a security, not a stored balance. Your viewing rights come from
            the license, under the terms in “What your purchase includes” below.
          </p>

          <button
            onClick={handleMint}
            disabled={isMinting || !!disabledReason}
            className="w-full px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMinting ? 'Processing...' : `Buy Access — ${displayPrice} ETH`}
          </button>
        </div>
      </div>
    );
  }

  // Main choose screen
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          {demoFilm ? (
            <>
              <div className="text-white/40 text-sm mb-2">{demoFilm.genre} · {demoFilm.duration}</div>
              <h1 className="text-5xl font-semibold tracking-tight mb-3">{demoFilm.title}</h1>
              <p className="text-white/60 leading-relaxed">{demoFilm.description}</p>
            </>
          ) : (
            <>
              <h1 className="text-5xl font-semibold tracking-tight mb-3">Get Access</h1>
              <p className="text-white/60">Buy once under a clear license. No subscription required.</p>
            </>
          )}
        </div>

        {/* Film hash input (if not pre-filled) */}
        {!filmHashParam && (
          <div className="mb-8">
            <label className="text-xs text-white/40 tracking-widest block mb-2">FILM ID</label>
            <input
              type="text"
              value={videoHash}
              onChange={e => setVideoHash(e.target.value)}
              placeholder="Enter film hash or ID"
              className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/40"
            />
          </div>
        )}

        {!isDemoMode && filmState === 'missing' && videoHash && (
          <div className="mb-8 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 text-sm text-amber-200/80 leading-relaxed">
            This film is not registered for on-chain ticket sales yet. Purchases are disabled until
            the platform registers it.
          </div>
        )}

        {/* Price summary */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8">
          <div className="flex justify-between text-sm text-white/50 mb-2">
            <span>Price</span>
            <span>{filmState === 'loading' ? 'Loading…' : `${displayPrice} ETH`}</span>
          </div>
          <div className="flex justify-between text-sm text-emerald-400 mb-3">
            <span>Goes directly to creator</span>
            <span>{(100 - parseInt(feePct))}%</span>
          </div>
          <div className="border-t border-white/10 pt-3 flex justify-between font-semibold">
            <span>You pay</span>
            <span>{displayPrice} ETH — one-time</span>
          </div>
        </div>

        {/* What your purchase includes — the license model */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="text-xs text-white/40 tracking-widest mb-4">WHAT YOUR PURCHASE INCLUDES</div>
          <div className="space-y-4">
            {LICENSE_TABLE.map((row) => (
              <div key={row.offer} className="text-sm">
                <div className="font-semibold text-white/90">{row.offer}</div>
                <div className="text-white/55 mt-0.5">{row.receives}</div>
                <div className="text-white/35 text-xs mt-0.5">{row.mustBeTrue}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 text-xs text-amber-200/80 leading-relaxed space-y-2">
          <p>{APPLE_NFT_NOTE}</p>
          <p>{BUNDLES_BEFORE_WALLET_NOTE}</p>
        </div>

        {/* CTA */}
        <button
          onClick={handleGetAccess}
          className="w-full px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition text-lg"
        >
          {!authenticated ? 'Sign In to Continue' : 'Get Access'}
        </button>

        <p className="text-center text-white/30 text-xs mt-4">
          Sign in with email, Google, or Apple — no crypto experience needed
        </p>

        {!authenticated && (
          <p className="text-center text-white/20 text-xs mt-2">
            Your access is set up automatically. No seed phrase or technical setup required.
          </p>
        )}
      </div>

      {showConsentModal && (
        <LegalConsentModal
          open={showConsentModal}
          onAccepted={() => { acceptLegalConsent(); setShowConsentModal(false); setStep('confirm'); }}
        />
      )}
    </div>
  );
}

export default function MintPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <MintPageInner />
    </Suspense>
  );
}
