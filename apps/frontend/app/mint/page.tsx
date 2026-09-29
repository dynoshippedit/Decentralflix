'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState, useEffect, Suspense } from 'react';
import { createWalletClient, custom, parseEther, defineChain } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { useSearchParams } from 'next/navigation';
import { MOVIE_TICKET_ADDRESS, MOVIE_TICKET_ABI, useMovieTicket } from '@/lib/contracts';
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

const TIER_INFO = {
  BASIC: {
    label: 'Standard Access',
    description: 'Streaming access under the film\u2019s license terms. One-time purchase.',
    badge: null,
  },
  DELUXE: {
    label: 'Premium Access',
    description: 'Streaming access + behind-the-scenes content.',
    badge: 'POPULAR',
  },
  PRODUCER: {
    label: 'Producer Credit',
    description: 'Streaming access + on-screen credit + community access.',
    badge: 'LIMITED',
  },
};

function MintPageInner() {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const searchParams = useSearchParams();

  const filmHashParam = searchParams.get('film') || '';
  const demoFilm = getDemoFilm(filmHashParam);

  const [videoHash, setVideoHash] = useState(filmHashParam);
  const [creator, setCreator] = useState('');
  const [price, setPrice] = useState(demoFilm?.price || '0.01');
  const [tier, setTier] = useState<'BASIC' | 'DELUXE' | 'PRODUCER'>('BASIC');
  const [isMinting, setIsMinting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [step, setStep] = useState<'choose' | 'confirm' | 'success'>('choose');

  const connectedAddress = user?.wallet?.address as `0x${string}` | undefined;
  const { platformFeeBps, getPlatformFee, getCreatorShare } = useMovieTicket();

  const isLocalAddress = MOVIE_TICKET_ADDRESS.toLowerCase() === '0x5fbdb2315678afecb367f032d93f642f64180aa3';
  const targetChain = isLocalAddress ? hardhatLocal : arbitrumSepolia;

  useEffect(() => {
    if (connectedAddress && !creator) setCreator(connectedAddress);
  }, [connectedAddress, creator]);

  const priceWei = parseEther(price || '0.01');
  const platformFee = getPlatformFee(priceWei);
  const creatorShare = getCreatorShare(priceWei);
  const feePct = (Number(platformFeeBps) / 100).toFixed(0);

  const handleGetAccess = () => {
    if (!authenticated) { login(); return; }
    if (!hasLegalConsent()) { setShowConsentModal(true); return; }
    setStep('confirm');
  };

  const handleMint = async () => {
    if (!connectedAddress || !videoHash) return;
    if (MOVIE_TICKET_ADDRESS === '0x0000000000000000000000000000000000000000') {
      // Demo mode — simulate success
      setTxHash('0xdemo-tx-' + Date.now().toString(16));
      setStep('success');
      return;
    }

    setIsMinting(true);
    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: connectedAddress,
        chain: targetChain,
        transport: custom(provider),
      });
      const tierValue = tier === 'BASIC' ? 0 : tier === 'DELUXE' ? 1 : 2;
      const hash = await walletClient.writeContract({
        address: MOVIE_TICKET_ADDRESS,
        abi: MOVIE_TICKET_ABI,
        functionName: 'mintPermanentPass',
        account: connectedAddress,
        args: [connectedAddress, (creator || connectedAddress) as `0x${string}`, videoHash, priceWei, tierValue],
        value: priceWei,
      });
      setTxHash(hash);
      setStep('success');
    } catch (err: any) {
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('user rejected')) msg = 'You cancelled the transaction.';
      else if (msg.includes('insufficient funds')) msg = 'Not enough ETH for this purchase.';
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
              <span className="font-medium">{demoFilm?.title || videoHash}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">Access level</span>
              <span>{TIER_INFO[tier].label}</span>
            </div>
            <div className="border-t border-white/10 pt-4 flex justify-between">
              <span className="text-white/50">Creator receives</span>
              <span className="text-emerald-400">{(100 - parseInt(feePct))}% to the creator</span>
            </div>
            <div className="flex justify-between text-xl font-semibold">
              <span>Total</span>
              <span>{price} ETH</span>
            </div>
          </div>

          <p className="text-white/40 text-xs mb-6 leading-relaxed">
            This is a one-time purchase of a viewing license plus an optional collector token —
            not an investment, not a security, not a stored balance. Your viewing rights come from
            the license, under the terms in “What your purchase includes” below.
          </p>

          <button
            onClick={handleMint}
            disabled={isMinting}
            className="w-full px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMinting ? 'Processing...' : `Buy Access — ${price} ETH`}
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

        {/* Tier selection */}
        <div className="mb-8">
          <div className="text-xs text-white/40 tracking-widest mb-4">CHOOSE YOUR ACCESS</div>
          <div className="grid grid-cols-1 gap-3">
            {(Object.entries(TIER_INFO) as [keyof typeof TIER_INFO, typeof TIER_INFO['BASIC']][]).map(([key, info]) => (
              <button
                key={key}
                onClick={() => { setTier(key); setPrice(demoFilm?.price || '0.01'); }}
                className={`relative text-left p-5 rounded-2xl border transition-all ${
                  tier === key
                    ? 'bg-white/10 border-white/40'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
              >
                {info.badge && (
                  <span className="absolute top-3 right-3 text-[10px] tracking-widest bg-white/10 text-white/60 border border-white/20 px-2 py-0.5 rounded-full">
                    {info.badge}
                  </span>
                )}
                <div className="font-semibold mb-1">{info.label}</div>
                <div className="text-sm text-white/50">{info.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Price summary */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8">
          <div className="flex justify-between text-sm text-white/50 mb-2">
            <span>Price</span>
            <span>{price} ETH</span>
          </div>
          <div className="flex justify-between text-sm text-emerald-400 mb-3">
            <span>Goes directly to creator</span>
            <span>{(100 - parseInt(feePct))}%</span>
          </div>
          <div className="border-t border-white/10 pt-3 flex justify-between font-semibold">
            <span>You pay</span>
            <span>{price} ETH — one-time</span>
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
