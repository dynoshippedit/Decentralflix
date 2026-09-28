'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import LegalConsentModal, { hasLegalConsent, acceptLegalConsent } from '@/components/LegalConsentModal';
import { DEMO_GENRES } from '@/lib/demo-content';

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { n: 1, label: 'Film Details' },
  { n: 2, label: 'Video Upload' },
  { n: 3, label: 'Review & Pricing' },
  { n: 4, label: 'Publish' },
];

export default function UploadPage() {
  const { ready, authenticated, login } = usePrivy();
  const { upload, progress, isUploading, error: uploadError } = useVideoUpload();
  const [step, setStep] = useState<Step>(1);
  const [showConsent, setShowConsent] = useState(false);

  // Step 1 — film details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('Documentary');
  const [isDeplatformed, setIsDeplatformed] = useState(false);
  const [deplatformedReason, setDeplatformedReason] = useState('');

  // Step 2 — video
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    r2Key: string;
    livepeerPlaybackId: string;
    arweaveMetadataTxId: string;
    filecoinCid: string;
    isSimulation: boolean;
  } | null>(null);

  // Step 3 — pricing
  const [basicPrice, setBasicPrice] = useState('0.01');
  const [deluxePrice, setDeluxePrice] = useState('0.025');
  const [producerPrice, setProducerPrice] = useState('0.1');

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-6">🎬</div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">Upload Your Film</h1>
          <p className="text-white/60 mb-8 leading-relaxed">
            Sign in with email, Google, or Apple to start uploading. You'll receive 75% of every sale directly to you.
          </p>
          <button
            onClick={login}
            className="px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition"
          >
            Sign In to Upload
          </button>
        </div>
      </div>
    );
  }

  const handleStartUpload = async () => {
    if (!hasLegalConsent()) { setShowConsent(true); return; }
    if (!videoFile) return;
    try {
      const result = await upload(videoFile, { title, description, genre, tierPrices: { BASIC: parseFloat(basicPrice), DELUXE: parseFloat(deluxePrice), PRODUCER: parseFloat(producerPrice) } });
      setUploadResult(result);
      setStep(3);
    } catch {
      // error is surfaced via uploadError
    }
  };

  const handlePublish = async () => {
    if (!hasLegalConsent()) { setShowConsent(true); return; }
    setStep(4);
  };

  const canProceedStep1 = title.trim().length > 0 && description.trim().length > 0;
  const canProceedStep2 = !!videoFile;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-5xl font-semibold tracking-tight mb-2">Upload Your Film</h1>
          <p className="text-white/50">75% of every sale goes directly to you.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-12">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 ${step === s.n ? 'text-white' : step > s.n ? 'text-emerald-400' : 'text-white/30'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
                  step > s.n ? 'bg-emerald-500 border-emerald-500 text-black' :
                  step === s.n ? 'border-white bg-white text-black' :
                  'border-white/20'
                }`}>
                  {step > s.n ? '✓' : s.n}
                </div>
                <span className="text-xs hidden sm:block">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-px flex-1 mx-2 ${step > s.n ? 'bg-emerald-500/40' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Film Details ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="text-xs text-white/40 tracking-widest block mb-2">FILM TITLE *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Enter film title"
                className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/40"
              />
            </div>

            <div>
              <label className="text-xs text-white/40 tracking-widest block mb-2">DESCRIPTION *</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="Tell viewers what this film is about..."
                className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/40 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-white/40 tracking-widest block mb-2">GENRE</label>
              <select
                value={genre}
                onChange={e => setGenre(e.target.value)}
                className="w-full bg-black border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none"
              >
                {DEMO_GENRES.filter(g => g !== 'All').map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDeplatformed}
                  onChange={e => setIsDeplatformed(e.target.checked)}
                  className="mt-1 rounded"
                />
                <div>
                  <div className="font-medium text-sm mb-1">This content was removed from other platforms</div>
                  <div className="text-white/40 text-xs">YouTube, Vimeo, Facebook, TikTok, etc. This will be highlighted in your film's listing — many viewers specifically seek out deplatformed content.</div>
                </div>
              </label>
              {isDeplatformed && (
                <div className="mt-4">
                  <input
                    type="text"
                    value={deplatformedReason}
                    onChange={e => setDeplatformedReason(e.target.value)}
                    placeholder="Which platform? What happened? (optional)"
                    className="w-full bg-black border border-white/20 rounded-xl px-4 py-2 text-sm text-white placeholder-white/20 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="w-full py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue to Upload →
            </button>
          </div>
        )}

        {/* ── Step 2: Video Upload ─────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <label className="text-xs text-white/40 tracking-widest block mb-4">SELECT VIDEO FILE</label>
              <label className="block border-2 border-dashed border-white/20 rounded-2xl p-10 text-center cursor-pointer hover:border-white/40 transition">
                <input
                  type="file"
                  accept="video/*"
                  onChange={e => setVideoFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {videoFile ? (
                  <div>
                    <div className="text-3xl mb-3">🎞️</div>
                    <div className="font-medium">{videoFile.name}</div>
                    <div className="text-white/40 text-sm mt-1">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-4 opacity-30">📹</div>
                    <div className="text-white/60 mb-1">Click to select your video</div>
                    <div className="text-white/30 text-sm">MP4, MOV, AVI — up to 10GB</div>
                  </div>
                )}
              </label>
            </div>

            {videoFile && !isUploading && !uploadResult && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-sm text-white/60 space-y-2">
                <div>✓ Transcoded to HLS by Livepeer (adaptive quality)</div>
                <div>✓ Stored privately in Cloudflare R2 (zero egress fees)</div>
                <div>✓ Backed up permanently on Filecoin/IPFS</div>
                <div>✓ Metadata pinned to Arweave forever</div>
              </div>
            )}

            {isUploading && progress && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Step {progress.step} of 4 — {progress.stepName}</div>
                  <div className="text-white/40 text-sm">{progress.percent}%</div>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="text-white/40 text-xs mt-2">{progress.message}</div>
              </div>
            )}

            {uploadError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm">
                {uploadError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-6 py-3 border border-white/20 rounded-full text-white/60 hover:text-white transition text-sm">
                ← Back
              </button>
              <button
                onClick={handleStartUpload}
                disabled={!canProceedStep2 || isUploading}
                className="flex-1 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Uploading...' : 'Upload Film →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Pricing ──────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            {uploadResult?.isSimulation && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-white/50 text-sm">
                Demo mode — upload simulated successfully.
              </div>
            )}

            <div className="text-white/60 text-sm leading-relaxed">
              Set your access prices. You receive 75% of every sale, paid to your wallet.
            </div>

            {[
              { key: 'BASIC', label: 'Standard Access', val: basicPrice, set: setBasicPrice, desc: 'Streaming access' },
              { key: 'DELUXE', label: 'Premium Access', val: deluxePrice, set: setDeluxePrice, desc: 'Watch + behind-the-scenes' },
              { key: 'PRODUCER', label: 'Producer Credit', val: producerPrice, set: setProducerPrice, desc: 'Watch + credit + community' },
            ].map(({ key, label, val, set, desc }) => (
              <div key={key} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-white/40 text-xs">{desc}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={val}
                      onChange={e => set(e.target.value)}
                      step="0.001"
                      min="0.001"
                      className="w-24 bg-black border border-white/20 rounded-xl px-3 py-2 text-right text-white text-sm focus:outline-none focus:border-white/40"
                    />
                    <span className="text-white/40 text-sm">ETH</span>
                  </div>
                </div>
                <div className="text-xs text-emerald-400">
                  You receive: {(parseFloat(val || '0') * 0.7).toFixed(4)} ETH per sale
                </div>
              </div>
            ))}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-6 py-3 border border-white/20 rounded-full text-white/60 hover:text-white transition text-sm">
                ← Back
              </button>
              <button
                onClick={handlePublish}
                className="flex-1 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition"
              >
                Review & Publish →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Publish ──────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="text-xs text-white/30 tracking-widest mb-4">REVIEW YOUR FILM</div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Title</span>
                <span>{title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Genre</span>
                <span>{genre}</span>
              </div>
              {isDeplatformed && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Status</span>
                  <span className="text-amber-400">Deplatformed content</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-4">
                <div className="text-xs text-white/30 tracking-widest mb-3">ACCESS PRICES</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-white/50">Standard</span><span>{basicPrice} ETH</span></div>
                  <div className="flex justify-between"><span className="text-white/50">Premium</span><span>{deluxePrice} ETH</span></div>
                  <div className="flex justify-between"><span className="text-white/50">Producer</span><span>{producerPrice} ETH</span></div>
                </div>
              </div>
              {uploadResult && (
                <div className="border-t border-white/10 pt-4 font-mono text-xs text-white/30 space-y-1">
                  <div>Livepeer: {uploadResult.livepeerPlaybackId}</div>
                  <div>Arweave: {uploadResult.arweaveMetadataTxId}</div>
                  <div>Filecoin: {uploadResult.filecoinCid.slice(0, 20)}...</div>
                </div>
              )}
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-sm text-emerald-300">
              Your film will be published to the DecentralFlix catalog. Licensed streaming access becomes available for purchase immediately.
              You will receive 75% of every sale, paid directly to you.
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="px-6 py-3 border border-white/20 rounded-full text-white/60 hover:text-white transition text-sm">
                ← Back
              </button>
              <button
                onClick={() => {
                  // In production: call contract mintFilm with uploadResult pointers
                  alert('Film published! (demo mode — connect contract to finalize on-chain)');
                }}
                className="flex-1 py-4 bg-white text-black font-semibold rounded-full hover:bg-white/90 transition"
              >
                Publish Film
              </button>
            </div>
          </div>
        )}
      </div>

      {showConsent && (
        <LegalConsentModal
          open={showConsent}
          onAccepted={() => { acceptLegalConsent(); setShowConsent(false); }}
        />
      )}
    </div>
  );
}
