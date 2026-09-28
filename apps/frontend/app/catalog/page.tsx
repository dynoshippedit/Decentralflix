'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { DEMO_FILMS, DEMO_GENRES } from '@/lib/demo-content';
import SkeletonCard from '@/components/SkeletonCard';
import EmptyState from '@/components/EmptyState';

const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Top Rated', value: 'rating' },
  { label: 'Most Owned', value: 'owned' },
  { label: 'Price: Low', value: 'price-asc' },
];

export default function CatalogPage() {
  const [genre, setGenre] = useState('All');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = [...DEMO_FILMS];
    if (genre !== 'All') list = list.filter(f => f.genre === genre);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.title.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.creatorName.toLowerCase().includes(q)
      );
    }
    if (sort === 'rating') list.sort((a, b) => b.averageRating - a.averageRating);
    else if (sort === 'owned') list.sort((a, b) => b.ownerCount - a.ownerCount);
    else if (sort === 'price-asc') list.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    return list;
  }, [genre, sort, search]);

  return (
    <div className="min-h-screen bg-black text-white">

      {/* Header */}
      <div className="border-b border-white/10 px-6 py-10 max-w-7xl mx-auto">
        <h1 className="text-5xl font-semibold tracking-[-3px] mb-2">Browse Films</h1>
        <p className="text-white/50">Permanent access. Own it forever. No algorithms.</p>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-30 bg-black/90 backdrop-blur border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Genre pills */}
          <div className="flex flex-wrap gap-2 flex-1">
            {DEMO_GENRES.map(g => (
              <button
                key={g}
                onClick={() => setGenre(g)}
                className={`px-4 py-1.5 text-xs rounded-full border transition-all ${
                  genre === g
                    ? 'bg-white text-black border-white font-semibold'
                    : 'border-white/20 text-white/60 hover:text-white hover:border-white/40'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search films..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-white/5 border border-white/20 rounded-full px-4 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/40 w-48"
          />

          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-black border border-white/20 rounded-full px-4 py-1.5 text-sm text-white focus:outline-none"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Film grid */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {filtered.length === 0 ? (
          <EmptyState
            title="No films found"
            description="Try a different genre or search term."
            ctaLabel="Clear filters"
            onCta={() => { setGenre('All'); setSearch(''); }}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map(film => (
              <Link
                key={film.filmHash}
                href={`/film/${film.filmHash}`}
                className="group rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 overflow-hidden transition-all hover:border-white/20"
              >
                <div className="aspect-video bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center relative">
                  <span className="text-4xl opacity-20">🎬</span>
                  {film.isDeplatformed && (
                    <div className="absolute top-2 left-2 text-[10px] tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      DEPLATFORMED
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 bg-black/60 text-white/80 text-xs px-2 py-0.5 rounded-full capitalize">
                    {film.tier.toLowerCase()}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-sm leading-tight mb-1 group-hover:text-white line-clamp-2">
                    {film.title}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-white/40 mb-2">
                    <span>{film.genre}</span>
                    <span>{film.duration}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-yellow-400 text-xs">
                      ★ <span className="text-white/60">{film.averageRating.toFixed(1)}</span>
                      <span className="text-white/30">({film.reviewCount})</span>
                    </div>
                    <span className="text-white/70 text-xs font-medium">{film.price} ETH</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
