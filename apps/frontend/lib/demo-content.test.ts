import { describe, it, expect, afterEach } from 'vitest';
import { parseEther } from 'viem';
import {
  DEMO_FILMS,
  DEMO_GENRES,
  isDemoMode,
  getDemoFilm,
  getFilmsForDisplay,
  type DemoFilm,
} from './demo-content';

describe('demo-content data integrity', () => {
  it('has at least the launch demo films', () => {
    expect(DEMO_FILMS.length).toBeGreaterThanOrEqual(5);
  });

  it("includes the developer's real films (Raging/Savage Midlife)", () => {
    const hashes = DEMO_FILMS.map((f) => f.filmHash);
    expect(hashes).toContain('raging-midlife');
    expect(hashes).toContain('savage-midlife');
  });

  it('has unique film hashes', () => {
    const hashes = DEMO_FILMS.map((f) => f.filmHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('priceWei matches the ETH price string for every film', () => {
    for (const f of DEMO_FILMS) {
      expect(f.priceWei, `priceWei mismatch for ${f.filmHash}`).toBe(
        parseEther(f.price).toString()
      );
    }
  });

  it('uses only valid tiers', () => {
    const valid = new Set<DemoFilm['tier']>(['BASIC', 'DELUXE', 'PRODUCER']);
    for (const f of DEMO_FILMS) {
      expect(valid.has(f.tier), `bad tier on ${f.filmHash}`).toBe(true);
    }
  });

  it('gives every deplatformed film a reason (and only those)', () => {
    for (const f of DEMO_FILMS) {
      if (f.isDeplatformed) {
        expect(f.deplatformedReason, `${f.filmHash} deplatformed without reason`).toBeTruthy();
      }
    }
  });

  it('keeps ratings within 0-5 and non-negative counts', () => {
    for (const f of DEMO_FILMS) {
      expect(f.averageRating).toBeGreaterThanOrEqual(0);
      expect(f.averageRating).toBeLessThanOrEqual(5);
      expect(f.ownerCount).toBeGreaterThanOrEqual(0);
      expect(f.reviewCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("every film's genre is covered by DEMO_GENRES", () => {
    for (const f of DEMO_FILMS) {
      expect(DEMO_GENRES, `genre ${f.genre} (${f.filmHash}) not in DEMO_GENRES`).toContain(
        f.genre
      );
    }
  });
});

describe('getDemoFilm', () => {
  it('returns the matching film', () => {
    expect(getDemoFilm('raging-midlife')?.title).toBe('Raging Midlife');
  });
  it('returns undefined for an unknown hash', () => {
    expect(getDemoFilm('does-not-exist')).toBeUndefined();
  });
});

describe('getFilmsForDisplay', () => {
  it('returns all films for no filter or "All"', () => {
    expect(getFilmsForDisplay()).toHaveLength(DEMO_FILMS.length);
    expect(getFilmsForDisplay('All')).toHaveLength(DEMO_FILMS.length);
  });

  it('filters by genre, case-insensitively', () => {
    const docs = getFilmsForDisplay('documentary');
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((f) => f.genre === 'Documentary')).toBe(true);
  });

  it('returns an empty list for a genre with no films', () => {
    expect(getFilmsForDisplay('Western')).toHaveLength(0);
  });
});

describe('isDemoMode', () => {
  const original = process.env.NEXT_PUBLIC_INDEXER_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_INDEXER_URL;
    else process.env.NEXT_PUBLIC_INDEXER_URL = original;
  });

  it('is true when no indexer URL is set', () => {
    delete process.env.NEXT_PUBLIC_INDEXER_URL;
    expect(isDemoMode()).toBe(true);
  });

  it('is false when an indexer URL is configured', () => {
    process.env.NEXT_PUBLIC_INDEXER_URL = 'https://indexer.example.com';
    expect(isDemoMode()).toBe(false);
  });
});
