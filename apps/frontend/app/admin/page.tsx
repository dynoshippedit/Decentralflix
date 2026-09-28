'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useMemo, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useMovieTicket } from '@/lib/contracts/useMovieTicket';
import { AdminFilm, AdminCreator, AuditLogEntry, NCMECReportData, TrustTier, ContentStatus } from '@/lib/admin-types';

// DEMO DATA — simulation mode (clearly labeled)
// In production this would come from Goldsky + backend DB (T05 + backend work)
const DEMO_FILMS: AdminFilm[] = [
  {
    id: 'signal-lost',
    title: 'Signal Lost',
    description: 'A whistleblower goes underground after leaking classified surveillance data.',
    creator: '0xDeplatformedCreator1',
    creatorTier: 'NEW',
    submittedAt: '2026-05-28T14:22:00Z',
    status: 'PENDING_REVIEW',
    genre: 'Thriller',
    durationMinutes: 112,
    videoHash: 'signal-lost',
    isDeplatformed: true,
  },
  {
    id: 'the-unmuted',
    title: 'The Unmuted',
    description: 'Five creators tell the story of their deplatforming.',
    creator: '0xDeplatformedCreator2',
    creatorTier: 'VERIFIED',
    submittedAt: '2026-05-27T09:15:00Z',
    status: 'PENDING_REVIEW',
    genre: 'Documentary',
    durationMinutes: 68,
    videoHash: 'the-unmuted',
    isDeplatformed: true,
  },
  {
    id: 'raging-midlife',
    title: 'Raging Midlife',
    description: 'A darkly comic look at the chaos of middle age.',
    creator: '0xDinoDev',
    creatorTier: 'TRUSTED',
    submittedAt: '2026-05-20T11:00:00Z',
    status: 'APPROVED',
    genre: 'Drama/Comedy',
    durationMinutes: 94,
    videoHash: 'raging-midlife',
  },
];

const DEMO_CREATORS: AdminCreator[] = [
  { wallet: '0xDeplatformedCreator1', tier: 'NEW', contentCount: 1, joinedAt: '2026-05-28' },
  { wallet: '0xDeplatformedCreator2', tier: 'VERIFIED', contentCount: 1, joinedAt: '2026-05-25' },
  { wallet: '0xDinoDev', tier: 'TRUSTED', contentCount: 2, joinedAt: '2026-05-01' },
];

const ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET || '0x0000000000000000000000000000000000000000';

export default function AdminDashboard() {
  const { authenticated: isConnected, user } = usePrivy();
  const address = user?.wallet?.address as `0x${string}` | undefined;
  const { } = useMovieTicket(); // we have delistFilm on the contract

  // Local registry: films, creators, and audit log persist in this browser's
  // localStorage so delists survive reloads. This is a LOCAL registry only —
  // contracts are undeployed, so no on-chain delistFilm call occurs here.
  const [films, setFilms] = useState<AdminFilm[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('dfx-admin-films') : null;
      if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; }
    } catch { /* fall through to demo data */ }
    return DEMO_FILMS;
  });
  const [creators, setCreators] = useState<AdminCreator[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('dfx-admin-creators') : null;
      if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; }
    } catch { /* fall through to demo data */ }
    return DEMO_CREATORS;
  });
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('dfx-admin-audit') : null;
      if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; }
    } catch { /* fall through to empty */ }
    return [];
  });

  useEffect(() => {
    try { window.localStorage.setItem('dfx-admin-films', JSON.stringify(films)); } catch { /* storage unavailable */ }
  }, [films]);
  useEffect(() => {
    try { window.localStorage.setItem('dfx-admin-creators', JSON.stringify(creators)); } catch { /* storage unavailable */ }
  }, [creators]);
  useEffect(() => {
    try { window.localStorage.setItem('dfx-admin-audit', JSON.stringify(auditLog.slice(0, 50))); } catch { /* storage unavailable */ }
  }, [auditLog]);
  const [filter, setFilter] = useState<'ALL' | ContentStatus>('ALL');
  const [sort, setSort] = useState<'newest' | 'tier'>('newest');
  const [search, setSearch] = useState('');
  const [selectedFilmForRemoval, setSelectedFilmForRemoval] = useState<AdminFilm | null>(null);
  const [removalReason, setRemovalReason] = useState<'CSAM' | 'Copyright Infringement' | 'Illegal Content' | 'Terrorism / Extremism' | 'Other Illegal Content'>('CSAM');
  const [showNCMEC, setShowNCMEC] = useState(false);
  const [ncmecData, setNcmecData] = useState<NCMECReportData | null>(null);

  const isAdmin = isConnected && address?.toLowerCase() === ADMIN_WALLET.toLowerCase();

  // Filtered + sorted queue
  const filteredFilms = useMemo(() => {
    let result = [...films];

    if (filter !== 'ALL') {
      result = result.filter(f => f.status === filter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(f =>
        f.title.toLowerCase().includes(q) ||
        f.creator.toLowerCase().includes(q) ||
        f.videoHash.toLowerCase().includes(q)
      );
    }

    if (sort === 'newest') {
      result.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    } else {
      const tierOrder: Record<TrustTier, number> = { TRUSTED: 4, VERIFIED: 3, NEW: 2, BANNED: 1 };
      result.sort((a, b) => tierOrder[b.creatorTier] - tierOrder[a.creatorTier]);
    }
    return result;
  }, [films, filter, search, sort]);

  const logAction = (action: AuditLogEntry['action'], targetId: string, details: string) => {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      adminWallet: address || 'unknown',
      action,
      targetId,
      details,
    };
    setAuditLog(prev => [entry, ...prev].slice(0, 50));
  };

  const handleDelist = async (film: AdminFilm) => {
    if (!isAdmin) {
      alert('Admin access only. Set NEXT_PUBLIC_ADMIN_WALLET in .env.local');
      return;
    }

    // Local-registry removal. The MovieTicket.delistFilm contract function exists
    // but contracts are UNDEPLOYED, so no on-chain call happens here. The film is
    // marked DELISTED in this browser's local admin registry (persisted) and the
    // action is recorded in the audit log.
    console.log('Delisting from local admin registry:', film.videoHash, 'reason:', removalReason);

    // Update local registry (persisted to localStorage)
    setFilms(prev =>
      prev.map(f =>
        f.id === film.id
          ? { ...f, status: 'DELISTED' as ContentStatus }
          : f
      )
    );

    logAction('DELIST', film.videoHash, `Reason: ${removalReason}`);

    if (removalReason === 'CSAM') {
      const report: NCMECReportData = {
        platform: 'DecentralFlix',
        contentHash: film.videoHash,
        uploadTimestamp: film.submittedAt,
        creatorWallet: film.creator,
        fileType: 'HLS video',
        additionalNotes: 'Automatically generated from admin emergency removal action.',
      };
      setNcmecData(report);
      setShowNCMEC(true);
    }

    setSelectedFilmForRemoval(null);
    alert(`Film ${film.title} marked DELISTED in the local admin registry (this browser only). No on-chain call — contracts are undeployed.`);
  };

  const handleApprove = (film: AdminFilm) => {
    setFilms(prev => prev.map(f => f.id === film.id ? { ...f, status: 'APPROVED' } : f));
    logAction('APPROVE', film.videoHash, 'Content approved and published');
  };

  const handleDeny = (film: AdminFilm) => {
    const reason = prompt('Enter denial reason (shown to creator):') || 'Does not meet platform standards';
    setFilms(prev => prev.map(f => f.id === film.id ? { ...f, status: 'DENIED' } : f));
    logAction('DENY', film.videoHash, reason);
  };

  const changeCreatorTier = (wallet: string, newTier: TrustTier) => {
    setCreators(prev =>
      prev.map(c => c.wallet === wallet ? { ...c, tier: newTier } : c)
    );
    logAction(newTier === 'BANNED' ? 'BAN' : 'PROMOTE_TIER', wallet, `Tier changed to ${newTier}`);
  };

  const copyNCMECReport = () => {
    if (!ncmecData) return;
    const text = `NCMEC CyberTipline Report — ${ncmecData.platform}
Content Hash: ${ncmecData.contentHash}
Upload Time: ${ncmecData.uploadTimestamp}
Creator Wallet: ${ncmecData.creatorWallet}
File Type: ${ncmecData.fileType}
Notes: ${ncmecData.additionalNotes}

This report was generated automatically by the DecentralFlix admin system.
Mandatory reporting under 18 U.S.C. § 2258A.`;
    navigator.clipboard.writeText(text);
    alert('NCMEC report copied to clipboard. Submit at https://www.missingkids.org/gethelpnow/cybertipline');
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
        <div className="max-w-2xl mx-auto mt-20">
          <h1 className="text-4xl font-bold mb-4">Admin Access Required</h1>
          <p className="text-red-400 mb-8">
            This area is restricted. Connect the wallet set in NEXT_PUBLIC_ADMIN_WALLET.
          </p>
          <p className="text-sm text-gray-500">
            Current connected: {address || 'none'}<br />
            Expected admin wallet: {ADMIN_WALLET}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-widest">DECENTRALFLIX</div>
            <div className="text-red-500 text-sm font-mono">ADMIN DASHBOARD — LOCAL REGISTRY (contracts undeployed)</div>
          </div>
          <div className="text-sm text-gray-400">
            Connected as admin: {address?.slice(0, 6)}...{address?.slice(-4)}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT: REVIEW QUEUE */}
        <div className="lg:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Content Review Queue</h2>
            <div className="flex gap-2 text-sm">
              {(['ALL', 'PENDING_REVIEW', 'APPROVED', 'DENIED', 'DELISTED'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded ${filter === f ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}
                >
                  {f === 'ALL' ? 'All' : f.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex gap-4">
            <input
              type="text"
              placeholder="Search title, creator, hash..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-black border border-white/20 px-4 py-2 rounded"
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="bg-black border border-white/20 px-3 rounded">
              <option value="newest">Newest first</option>
              <option value="tier">By creator tier</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredFilms.length === 0 && <div className="text-gray-500 py-8">No items match filters.</div>}
            {filteredFilms.map(film => (
              <div key={film.id} className="border border-white/10 bg-black/40 p-5 rounded-xl flex justify-between items-start">
                <div>
                  <div className="font-semibold text-lg">{film.title}</div>
                  <div className="text-sm text-gray-400">{film.description}</div>
                  <div className="mt-2 text-xs font-mono text-gray-500">{film.videoHash} • {film.creator}</div>
                  <div className="mt-1 flex gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${film.creatorTier === 'TRUSTED' ? 'bg-yellow-500/20 text-yellow-400' : film.creatorTier === 'VERIFIED' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {film.creatorTier}
                    </span>
                    {film.isDeplatformed && <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">DEPLATFORMED</span>}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-gray-400">{new Date(film.submittedAt).toLocaleDateString()}</div>
                  <div className="mt-2 flex gap-2">
                    {film.status === 'PENDING_REVIEW' && (
                      <>
                        <button onClick={() => handleApprove(film)} className="text-green-400 hover:text-green-300">Approve</button>
                        <button onClick={() => handleDeny(film)} className="text-red-400 hover:text-red-300">Deny</button>
                      </>
                    )}
                    <button onClick={() => setSelectedFilmForRemoval(film)} className="text-red-500 hover:text-red-400 font-medium">Remove</button>
                  </div>
                  <div className="text-[10px] mt-1 text-gray-500">{film.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: EMERGENCY REMOVAL + NCMEC + CREATOR MGMT */}
        <div className="lg:col-span-5 space-y-8">
          {/* Emergency Removal */}
          <div className="border border-red-500/40 bg-black/60 p-6 rounded-2xl">
            <div className="text-red-500 font-semibold mb-3 text-lg">EMERGENCY REMOVAL</div>
            <p className="text-sm text-gray-400 mb-4">Mark DELISTED in the local admin registry (this browser only). Contracts are undeployed, so no on-chain call occurs. Legal use only.</p>

            <input
              placeholder="Search film hash or title..."
              className="w-full bg-black border border-red-500/30 px-4 py-2 mb-3 rounded"
              onChange={(e) => {
                const match = films.find(f => f.videoHash.includes(e.target.value) || f.title.toLowerCase().includes(e.target.value.toLowerCase()));
                if (match) setSelectedFilmForRemoval(match);
              }}
            />

            {selectedFilmForRemoval && (
              <div className="border border-red-500/30 p-4 rounded">
                <div className="font-medium">{selectedFilmForRemoval.title}</div>
                <select
                  value={removalReason}
                  onChange={(e) => setRemovalReason(e.target.value as any)}
                  className="mt-3 w-full bg-black border border-red-500/30 p-2 text-sm"
                >
                  <option>CSAM</option>
                  <option>Copyright Infringement</option>
                  <option>Illegal Content</option>
                  <option>Terrorism / Extremism</option>
                  <option>Other Illegal Content</option>
                </select>
                <button
                  onClick={() => handleDelist(selectedFilmForRemoval)}
                  className="mt-3 w-full bg-red-600 hover:bg-red-700 py-2 rounded font-semibold"
                >
                  MARK DELISTED IN LOCAL REGISTRY
                </button>
              </div>
            )}
          </div>

          {/* NCMEC (only visible when CSAM removal happened) */}
          {showNCMEC && ncmecData && (
            <div className="border border-red-600 bg-red-950/40 p-5 rounded-2xl">
              <div className="text-red-400 font-bold mb-2">NCMEC CYBERTIPLINE REPORT — MANDATORY</div>
              <pre className="text-xs bg-black p-3 rounded overflow-auto mb-3">{JSON.stringify(ncmecData, null, 2)}</pre>
              <button onClick={copyNCMECReport} className="w-full bg-red-600 py-2 text-sm">COPY REPORT FOR NCMEC</button>
              <div className="text-[10px] text-red-400 mt-2">18 U.S.C. § 2258A — Failure to report CSAM is a federal crime.</div>
            </div>
          )}

          {/* Creator Management */}
          <div className="border border-white/10 bg-black/40 p-6 rounded-2xl">
            <div className="font-semibold mb-4">Creator Trust Management</div>
            {creators.map(c => (
              <div key={c.wallet} className="flex justify-between items-center py-2 border-b border-white/10 text-sm">
                <div className="font-mono">{c.wallet.slice(0, 10)}…</div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs px-2 py-px bg-white/10 rounded">{c.tier}</span>
                  <select
                    value={c.tier}
                    onChange={(e) => changeCreatorTier(c.wallet, e.target.value as TrustTier)}
                    className="bg-black text-xs border border-white/20"
                  >
                    <option>TRUSTED</option>
                    <option>VERIFIED</option>
                    <option>NEW</option>
                    <option>BANNED</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* Audit Log */}
          <div className="border border-white/10 bg-black/40 p-6 rounded-2xl text-sm">
            <div className="font-semibold mb-3 flex justify-between">
              <span>Audit Log (immutable)</span>
              <button onClick={() => {
              const esc = (v: unknown) => {
                const str = String(v ?? '');
                return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
              };
              const header = ['id','title','description','creator','creatorTier','submittedAt','status','genre','durationMinutes','videoHash'].join(',');
              const rows = films.map(f => [f.id, f.title, f.description, f.creator, f.creatorTier, f.submittedAt, f.status, f.genre, f.durationMinutes, f.videoHash].map(esc).join(','));
              const csv = [header, ...rows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'decentralflix-films.csv';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              logAction('EXPORT_CSV', 'film-list', `${films.length} films exported`);
            }} className="text-xs underline">Export CSV</button>
            </div>
            {auditLog.length === 0 && <div className="text-gray-500 text-xs">No actions yet in this session.</div>}
            {auditLog.map(entry => (
              <div key={entry.id} className="text-xs py-1 border-b border-white/5 font-mono">
                {new Date(entry.timestamp).toLocaleTimeString()} — {entry.action} — {entry.targetId.slice(0, 12)} — {entry.details}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center text-[10px] text-gray-600 py-8 border-t border-white/10">
        Admin dashboard — Local registry in this browser (localStorage). Film data is demo seed data; delists persist locally. Contracts are unaudited and undeployed, so delistFilm is never called on-chain from here. No public nav link (direct /admin access only).
      </div>
    </div>
  );
}
