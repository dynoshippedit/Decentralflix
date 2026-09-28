'use client';

import { useState, useEffect } from 'react';

/**
 * useFilmMetadata / Arweave metadata fetcher for Decentralflix (Phase 0)
 *
 * Fetches JSON metadata from Arweave gateway when the provided hash points to
 * a metadata JSON (e.g. crowdfund campaign metadataHash, or future film metadata tx).
 *
 * For video content hashes (mp4 etc) or demo placeholders, gracefully falls back
 * to the existing demo title mapping so titles "just work" everywhere.
 *
 * Reuses the Arweave gateway pattern from VideoPlayer.tsx and lib/arweave/upload.ts
 * (https://arweave.net/{txid} for content).
 *
 * Usage:
 *   const { title, description, metadata, loading, error } = useFilmMetadata(videoHash);
 *   <h1>{title}</h1>
 */

export interface FilmMetadata {
  title?: string;
  description?: string;
  filmmaker?: string;
  [key: string]: unknown;
}

// Current demo mapping logic (centralized here to replace all the duplicated ternaries)
const DEMO_TITLE_MAP: Array<{ match: RegExp | string; title: string; desc?: string }> = [
  { match: /film1|abc123/i, title: 'The Last Signal', desc: 'A haunting signal from the edge of known space.' },
  { match: /film2|def456/i, title: 'Echo Chamber', desc: 'What happens when the only voice left is your own.' },
  { match: /film3|ghi789/i, title: 'Neon Reverie', desc: 'Dreams rendered in impossible color.' },
  { match: /film4|jkl012/i, title: 'Static Dreams', desc: 'Between channels, something is watching.' },
  { match: /silent-echo|demo-campaign-silent/i, title: 'Silent Echo', desc: 'A haunting sci-fi short about memory, loss, and the last radio signal.' },
  { match: /neon-harbor|demo-campaign-neon/i, title: 'Neon Harbor', desc: 'Cyber-noir thriller set in a flooded megacity.' },
];

export function getDemoFilmTitle(arweaveHash: string): string {
  if (!arweaveHash) return 'Unknown Film';
  const h = arweaveHash.toLowerCase();
  for (const entry of DEMO_TITLE_MAP) {
    if (typeof entry.match === 'string' ? h.includes(entry.match) : entry.match.test(h)) {
      return entry.title;
    }
  }
  return 'Unknown Film';
}

export function getDemoFilmDescription(arweaveHash: string): string {
  if (!arweaveHash) return '';
  const h = arweaveHash.toLowerCase();
  for (const entry of DEMO_TITLE_MAP) {
    if (typeof entry.match === 'string' ? h.includes(entry.match) : entry.match.test(h)) {
      return entry.desc || '';
    }
  }
  return '';
}

/** Single source of truth for poster/image field normalization from Arweave JSON metadata (used by fetch + contract hooks). */
export function getPosterUrl(meta: any): string | undefined {
  if (!meta) return undefined;
  return (meta.poster as string) || (meta.image as string) || (meta.posterUrl as string) || (meta.cover as string) || (meta.artwork as string) || undefined;
}

// Centralized demo accessible films list (hashes + sources) to eliminate duplication across dashboard, collection, useMyAccessibleFilms etc.
// Consumers enrich titles via getDemoFilmTitle or (preferred) useFilmMetadata for real Arweave JSON.
export const DEMO_ACCESSIBLE_FILMS: Array<{ hash: string; sources: string[] }> = [
  { hash: 'ar://film1-abc123', sources: ['MovieTicket'] },
  { hash: 'ar://film2-def456', sources: ['CrowdfundInvestment'] },
  { hash: 'ar://film3-ghi789', sources: ['MovieTicket', 'CrowdfundInvestment'] },
];

export function getDemoOwnedFilms() {
  return DEMO_ACCESSIBLE_FILMS.map(f => ({
    title: getDemoFilmTitle(f.hash),
    hash: f.hash,
    sources: f.sources,
  }));
}

/**
 * Low-level async fetch of Arweave JSON data (or null on failure).
 * Safe for server or client. Used by the hook and directly by crowdfund campaign enrichment.
 */
export async function fetchArweaveMetadata(arweaveHash?: string): Promise<FilmMetadata | null> {
  if (!arweaveHash) return null;

  const txId = arweaveHash.replace(/^ar:\/\//i, '').trim();
  if (!txId) return null;

  // Skip network for obvious demo / placeholder hashes (prevents 404 noise)
  const isPlaceholder = /film[0-9]|demo-campaign|abc123|def456|ghi789|jkl012/i.test(txId) || txId.length < 20;
  if (isPlaceholder) {
    return {
      title: getDemoFilmTitle(arweaveHash),
      description: getDemoFilmDescription(arweaveHash),
    };
  }

  const url = `https://arweave.net/${txId}`;

  try {
    const res = await fetch(url, {
      // Arweave responses can be slow; keep reasonable timeout via Abort if needed in future
      cache: 'no-store',
    });

    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json') || contentType.includes('json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        // Not JSON — treat as no usable metadata (e.g. it was a video file)
        return null;
      }
    }

    // Normalize a bit (title/desc + common poster fields for rich cards) — single helper
    const poster = getPosterUrl(data);
    return {
      title: (data?.title as string) || undefined,
      description: (data?.description as string) || undefined,
      poster,
      ...data,
    };
  } catch (err) {
    // Network / gateway / parse error — caller decides fallback
    console.warn('[fetchArweaveMetadata] failed for', txId, err);
    return null;
  }
}

export function useFilmMetadata(arweaveHash?: string) {
  const [metadata, setMetadata] = useState<FilmMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!arweaveHash) {
      setMetadata(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Immediate optimistic fallback title for demo/placeholder hashes (no flash)
    const txId = arweaveHash.replace(/^ar:\/\//i, '');
    const isPlaceholder = /film[0-9]|demo-campaign|abc123|def456|ghi789|jkl012/i.test(txId) || txId.length < 20;

    if (isPlaceholder) {
      setMetadata({
        title: getDemoFilmTitle(arweaveHash),
        description: getDemoFilmDescription(arweaveHash),
      });
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchArweaveMetadata(arweaveHash)
      .then((data) => {
        if (!cancelled) {
          if (data) {
            setMetadata(data);
          } else {
            // No metadata found — still surface the demo fallback title
            setMetadata({
              title: getDemoFilmTitle(arweaveHash),
              description: getDemoFilmDescription(arweaveHash),
            });
          }
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to fetch Arweave metadata');
          setMetadata({
            title: getDemoFilmTitle(arweaveHash),
            description: getDemoFilmDescription(arweaveHash),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [arweaveHash]);

  // Always guarantee a usable title (metadata or demo fallback)
  const title = metadata?.title || getDemoFilmTitle(arweaveHash || '');
  const description = metadata?.description || getDemoFilmDescription(arweaveHash || '');

  return {
    metadata,
    title,
    description,
    loading,
    error,
    // raw access if consumer wants other fields (poster, etc.)
    raw: metadata,
  };
}

export default useFilmMetadata;
