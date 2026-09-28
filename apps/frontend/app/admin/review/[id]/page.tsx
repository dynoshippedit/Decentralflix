'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

// Minimal self-contained demo data for the review detail page (T17 simulation)
const DEMO_FILMS = [
  { id: 'signal-lost', title: 'Signal Lost', description: 'A whistleblower goes underground after leaking classified surveillance data.', creator: '0xDeplatformedCreator1', creatorTier: 'NEW' as const, videoHash: 'signal-lost' },
  { id: 'the-unmuted', title: 'The Unmuted', description: 'Five creators tell the story of their deplatforming.', creator: '0xDeplatformedCreator2', creatorTier: 'VERIFIED' as const, videoHash: 'the-unmuted' },
  { id: 'raging-midlife', title: 'Raging Midlife', description: 'A darkly comic look at the chaos of middle age.', creator: '0xDinoDev', creatorTier: 'TRUSTED' as const, videoHash: 'raging-midlife' },
];

export default function AdminReviewPage() {
  const params = useParams<{ id: string }>();
  const filmId = params.id;

  // In a real implementation we would fetch from indexer + contract.
  // Here we use the same demo list from the parent page for consistency.
  const [film] = useState(() => (DEMO_FILMS || []).find(f => f.id === filmId) || null);

  const [denyReason, setDenyReason] = useState('');

  if (!film) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
        <div className="max-w-xl mx-auto mt-20">
          <h1 className="text-2xl mb-4">Film not found in review queue</h1>
          <Link href="/admin" className="underline">← Back to admin dashboard</Link>
        </div>
      </div>
    );
  }

  const handleDelist = () => {
    alert('delistFilm() called on-chain (see main admin page for full flow). In production this would trigger the Worker + Filecoin unpin.');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin" className="text-sm text-gray-400 hover:text-white">← Back to queue</Link>

        <h1 className="text-4xl font-semibold mt-6">{film.title}</h1>
        <div className="text-gray-400 mt-1">{film.creator}</div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <div className="aspect-video bg-black border border-white/10 flex items-center justify-center text-gray-500 mb-6">
              Video preview (loads via admin signed URL from R2 in production)
              <br />
              <span className="text-xs">Simulation: use the main admin Emergency Removal panel to test delistFilm</span>
            </div>

            <div className="prose prose-invert text-gray-300">
              <p>{film.description}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="text-sm text-gray-400 mb-1">Creator Trust Tier</div>
              <div className="text-xl font-medium">{film.creatorTier}</div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/10">
              <button
                onClick={() => alert('Content marked APPROVED and published (demo)')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 py-3 rounded font-semibold"
              >
                APPROVE — Publish Now
              </button>

              <div>
                <textarea
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="Reason for denial (shown to creator)"
                  className="w-full h-20 bg-black border border-white/20 p-3 text-sm"
                />
                <button
                  onClick={() => alert(`Denied: ${denyReason || 'No reason provided'}`)}
                  className="mt-2 w-full bg-red-600/80 hover:bg-red-600 py-3 rounded font-semibold"
                >
                  DENY
                </button>
              </div>

              <button
                onClick={handleDelist}
                className="w-full border border-red-500 text-red-500 hover:bg-red-950 py-3 rounded font-semibold"
              >
                EMERGENCY REMOVE (calls delistFilm)
              </button>
            </div>

            <div className="text-[10px] text-gray-500 pt-4 border-t border-white/10">
              All actions are logged in the immutable audit trail on the main admin page.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
