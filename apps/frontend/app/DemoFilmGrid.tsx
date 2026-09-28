'use client';

import Link from 'next/link';
import type { CatalogFilm } from '@/lib/indexer';

export default function DemoFilmGrid({ films }: { films: CatalogFilm[] }) {
  if (films.length === 0) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {films.map(film => (
        <Link
          key={film.filmHash}
          href={`/film/${film.filmHash}`}
          className="group rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 overflow-hidden transition-all"
        >
          <div className="aspect-video bg-white/5 flex items-center justify-center relative">
            <span className="text-4xl opacity-20">🎬</span>
            {film.isDeplatformed && (
              <span className="absolute top-2 left-2 text-[10px] tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                DEPLATFORMED
              </span>
            )}
          </div>
          <div className="p-4">
            <h3 className="font-semibold text-sm leading-tight mb-1 group-hover:text-white line-clamp-2">
              {film.title}
            </h3>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <span>{film.genre}</span>
              <span>·</span>
              <span className="capitalize">{film.tier?.toLowerCase()}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
