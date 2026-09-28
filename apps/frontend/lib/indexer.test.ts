import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasAccessToFilm,
  getMyFilms,
  getFilmOwners,
  getFilmReviews,
  getCreatorEarnings,
  getFilmCatalog,
  invalidateCache,
} from './indexer';

// With no NEXT_PUBLIC_INDEXER_URL set, the indexer runs in deterministic demo mode with no
// network access (graphqlQuery short-circuits to null). Clear the in-memory cache before each test.
beforeEach(() => invalidateCache());

const SOMEONE = '0xABCdef0000000000000000000000000000000001';

describe('hasAccessToFilm (demo mode)', () => {
  it('grants access to the developer demo films', async () => {
    const a = await hasAccessToFilm(SOMEONE, 'raging-midlife');
    expect(a.hasAccess).toBe(true);
    expect(a.tier).toBe('BASIC');
    expect(a.tokenId).toBeTruthy();
  });

  it('denies access to other films in demo mode', async () => {
    const a = await hasAccessToFilm(SOMEONE, 'ghost-frame');
    expect(a.hasAccess).toBe(false);
    expect(a.tier).toBeNull();
  });
});

describe('getMyFilms (demo mode)', () => {
  it("returns the developer's two films", async () => {
    const films = await getMyFilms(SOMEONE);
    expect(films.map((f) => f.filmHash)).toEqual(['raging-midlife', 'savage-midlife']);
    expect(films.every((f) => f.tier === 'BASIC')).toBe(true);
  });
});

describe('getFilmOwners (demo mode)', () => {
  it('returns three demo owners spanning the tiers', async () => {
    const owners = await getFilmOwners('raging-midlife');
    expect(owners).toHaveLength(3);
    expect(owners.map((o) => o.tier)).toEqual(['BASIC', 'DELUXE', 'PRODUCER']);
    for (const o of owners) expect(o.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe('getFilmReviews (demo mode)', () => {
  it('returns demo reviews with valid 1-5 ratings', async () => {
    const reviews = await getFilmReviews('raging-midlife');
    expect(reviews.length).toBeGreaterThan(0);
    for (const r of reviews) {
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(5);
      expect(typeof r.text).toBe('string');
    }
  });
});

describe('getCreatorEarnings (demo mode)', () => {
  it('returns demo earnings whose total equals the sum of payments', async () => {
    const e = await getCreatorEarnings('0xDino000000000000000000000000000000000001');
    expect(e.totalEarned).toBe(3_500_000_000_000_000_000n); // 3.5 ETH
    const sum = e.payments.reduce((acc, p) => acc + p.amount, 0n);
    expect(sum).toBe(e.totalEarned);
  });
});

describe('getFilmCatalog (demo mode)', () => {
  it('returns all demo films by default', async () => {
    const films = await getFilmCatalog();
    expect(films.length).toBe(5);
    expect(films.every((f) => typeof f.price === 'bigint')).toBe(true);
  });

  it('filters by genre case-insensitively', async () => {
    const docs = await getFilmCatalog({ genre: 'documentary' });
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((f) => f.genre === 'Documentary')).toBe(true);
  });

  it('respects the limit', async () => {
    const two = await getFilmCatalog({ limit: 2 });
    expect(two).toHaveLength(2);
  });
});

describe('cache + invalidateCache', () => {
  it('serves a cached reference and invalidation forces a fresh result', async () => {
    const a = await getFilmCatalog();
    const b = await getFilmCatalog();
    expect(b).toBe(a); // same reference → served from cache

    invalidateCache();
    const c = await getFilmCatalog();
    expect(c).not.toBe(a); // cache cleared → recomputed
    expect(c).toEqual(a); // but value is identical
  });

  it('address-scoped invalidation only clears that address', async () => {
    const mine1 = await getMyFilms(SOMEONE);
    const mine2 = await getMyFilms(SOMEONE);
    expect(mine2).toBe(mine1); // cached

    invalidateCache(SOMEONE);
    const mine3 = await getMyFilms(SOMEONE);
    expect(mine3).not.toBe(mine1); // that address was invalidated
  });
});
