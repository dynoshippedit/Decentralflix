/**
 * Goldsky/The Graph indexer client for DecentralFlix.
 * Replaces all O(N) on-chain scans with O(1) indexed queries.
 *
 * Production: set NEXT_PUBLIC_INDEXER_URL to your Goldsky subgraph endpoint.
 * Development/demo: simulation mode with realistic fake data.
 */

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || '';

// In-memory cache with TTL to avoid repeat requests within the same session
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds
const MAX_ENTRIES = 500;

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as T;
  return null;
}

function cacheSet(key: string, data: unknown) {
  if (cache.size >= MAX_ENTRIES) {
    // Evict oldest entry
    let oldestKey = '';
    let oldestTs = Infinity;
    for (const [k, v] of cache.entries()) {
      if ((v.ts) < oldestTs) { oldestTs = v.ts; oldestKey = k; }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, ts: Date.now() });
}

async function graphqlQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  if (!INDEXER_URL) return null;
  try {
    const res = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data as T) ?? null;
  } catch {
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type FilmAccess = {
  hasAccess: boolean;
  tier: 'BASIC' | 'DELUXE' | 'PRODUCER' | null;
  tokenId: string | null;
};

export type OwnedFilm = {
  filmHash: string;
  tier: string;
  tokenId: string;
};

export type FilmOwner = {
  address: string;
  tier: string;
  tokenId: string;
};

export type FilmReview = {
  reviewer: string;
  rating: number;
  text: string;
  timestamp: number;
};

export type CreatorEarnings = {
  totalEarned: bigint;
  payments: Array<{ amount: bigint; filmHash: string; timestamp: number }>;
};

export type CatalogFilm = {
  filmHash: string;
  title: string;
  creator: string;
  price: bigint;
  tier: string;
  genre?: string;
  isDeplatformed?: boolean;
  thumbnailUrl?: string;
};

// ─── Simulation data ──────────────────────────────────────────────────────────

const SIM_FILMS: CatalogFilm[] = [
  {
    filmHash: 'raging-midlife',
    title: 'Raging Midlife',
    creator: '0xDino000000000000000000000000000000000001',
    price: BigInt('10000000000000000'), // 0.01 ETH
    tier: 'BASIC',
    genre: 'Documentary',
    isDeplatformed: false,
    thumbnailUrl: '',
  },
  {
    filmHash: 'savage-midlife',
    title: 'Savage Midlife',
    creator: '0xDino000000000000000000000000000000000001',
    price: BigInt('10000000000000000'),
    tier: 'BASIC',
    genre: 'Documentary',
    isDeplatformed: false,
    thumbnailUrl: '',
  },
  {
    filmHash: 'signal-lost',
    title: 'Signal Lost',
    creator: '0xTyler00000000000000000000000000000000001',
    price: BigInt('20000000000000000'), // 0.02 ETH
    tier: 'DELUXE',
    genre: 'Drama',
    isDeplatformed: true,
    thumbnailUrl: '',
  },
  {
    filmHash: 'the-unmuted',
    title: 'The Unmuted',
    creator: '0xTyler00000000000000000000000000000000001',
    price: BigInt('15000000000000000'),
    tier: 'BASIC',
    genre: 'Documentary',
    isDeplatformed: true,
    thumbnailUrl: '',
  },
  {
    filmHash: 'ghost-frame',
    title: 'Ghost Frame',
    creator: '0xCreator0000000000000000000000000000000001',
    price: BigInt('30000000000000000'), // 0.03 ETH
    tier: 'PRODUCER',
    genre: 'Thriller',
    isDeplatformed: false,
    thumbnailUrl: '',
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if a wallet address owns any ticket for a given film.
 * Primary: Goldsky GraphQL. Fallback: simulation with no access.
 */
export async function hasAccessToFilm(
  address: string,
  filmHash: string
): Promise<FilmAccess> {
  const key = `access:${address.toLowerCase()}:${filmHash}`;
  const cached = cacheGet<FilmAccess>(key);
  if (cached) return cached;

  const data = await graphqlQuery<{ tickets: Array<{ tokenId: string; tier: string }> }>(
    `query HasAccess($owner: String!, $filmHash: String!) {
      tickets(where: { owner: $owner, filmHash: $filmHash }, first: 1) {
        tokenId
        tier
      }
    }`,
    { owner: address.toLowerCase(), filmHash }
  );

  let result: FilmAccess;
  if (data && data.tickets.length > 0) {
    const t = data.tickets[0];
    result = {
      hasAccess: true,
      tier: t.tier as 'BASIC' | 'DELUXE' | 'PRODUCER',
      tokenId: t.tokenId,
    };
  } else if (!INDEXER_URL) {
    // Simulation: demo films are accessible in demo mode
    const isDemo = ['raging-midlife', 'savage-midlife'].includes(filmHash);
    result = { hasAccess: isDemo, tier: isDemo ? 'BASIC' : null, tokenId: isDemo ? '1' : null };
  } else {
    result = { hasAccess: false, tier: null, tokenId: null };
  }

  cacheSet(key, result);
  return result;
}

/**
 * Get all films a wallet address has access to.
 * Primary: Goldsky. Fallback: simulation returns developer's films.
 */
export async function getMyFilms(address: string): Promise<OwnedFilm[]> {
  const key = `myfilms:${address.toLowerCase()}`;
  const cached = cacheGet<OwnedFilm[]>(key);
  if (cached) return cached;

  const data = await graphqlQuery<{ tickets: Array<{ filmHash: string; tier: string; tokenId: string }> }>(
    `query MyFilms($owner: String!) {
      tickets(where: { owner: $owner }, first: 100) {
        filmHash
        tier
        tokenId
      }
    }`,
    { owner: address.toLowerCase() }
  );

  let result: OwnedFilm[];
  if (data) {
    result = data.tickets;
  } else if (!INDEXER_URL) {
    result = [
      { filmHash: 'raging-midlife', tier: 'BASIC', tokenId: '1' },
      { filmHash: 'savage-midlife', tier: 'BASIC', tokenId: '2' },
    ];
  } else {
    result = [];
  }

  cacheSet(key, result);
  return result;
}

/**
 * Get all owners of a film (for creator dashboard).
 */
export async function getFilmOwners(filmHash: string): Promise<FilmOwner[]> {
  const key = `owners:${filmHash}`;
  const cached = cacheGet<FilmOwner[]>(key);
  if (cached) return cached;

  const data = await graphqlQuery<{ tickets: Array<{ owner: string; tier: string; tokenId: string }> }>(
    `query FilmOwners($filmHash: String!) {
      tickets(where: { filmHash: $filmHash }, first: 1000) {
        owner
        tier
        tokenId
      }
    }`,
    { filmHash }
  );

  let result: FilmOwner[];
  if (data) {
    result = data.tickets.map(t => ({ address: t.owner, tier: t.tier, tokenId: t.tokenId }));
  } else if (!INDEXER_URL) {
    result = [
      { address: '0xDEAD000000000000000000000000000000000001', tier: 'BASIC', tokenId: '1' },
      { address: '0xDEAD000000000000000000000000000000000002', tier: 'DELUXE', tokenId: '2' },
      { address: '0xDEAD000000000000000000000000000000000003', tier: 'PRODUCER', tokenId: '3' },
    ];
  } else {
    result = [];
  }

  cacheSet(key, result);
  return result;
}

/**
 * Get reviews for a film from ReviewSubmitted events.
 */
export async function getFilmReviews(filmHash: string): Promise<FilmReview[]> {
  const key = `reviews:${filmHash}`;
  const cached = cacheGet<FilmReview[]>(key);
  if (cached) return cached;

  const data = await graphqlQuery<{
    reviews: Array<{ reviewer: string; rating: number; text: string; timestamp: string }>;
  }>(
    `query FilmReviews($filmHash: String!) {
      reviews(where: { filmHash: $filmHash }, orderBy: timestamp, orderDirection: desc, first: 50) {
        reviewer
        rating
        text
        timestamp
      }
    }`,
    { filmHash }
  );

  let result: FilmReview[];
  if (data) {
    result = data.reviews.map(r => ({ ...r, timestamp: parseInt(r.timestamp) }));
  } else if (!INDEXER_URL) {
    result = [
      { reviewer: '0xDEAD0000000000000000000000000000000000A1', rating: 5, text: 'Absolutely stunning work.', timestamp: Date.now() / 1000 - 3600 },
      { reviewer: '0xDEAD0000000000000000000000000000000000B2', rating: 4, text: 'Powerful storytelling.', timestamp: Date.now() / 1000 - 7200 },
    ];
  } else {
    result = [];
  }

  cacheSet(key, result);
  return result;
}

/**
 * Get total earnings for a creator from CreatorPaid events.
 */
export async function getCreatorEarnings(creatorAddress: string): Promise<CreatorEarnings> {
  const key = `earnings:${creatorAddress.toLowerCase()}`;
  const cached = cacheGet<CreatorEarnings>(key);
  if (cached) return cached;

  const data = await graphqlQuery<{
    creatorPayments: Array<{ amount: string; filmHash: string; timestamp: string }>;
  }>(
    `query CreatorEarnings($creator: String!) {
      creatorPayments(where: { creator: $creator }, first: 500) {
        amount
        filmHash
        timestamp
      }
    }`,
    { creator: creatorAddress.toLowerCase() }
  );

  let result: CreatorEarnings;
  if (data) {
    const payments = data.creatorPayments.map(p => ({
      amount: BigInt(p.amount),
      filmHash: p.filmHash,
      timestamp: parseInt(p.timestamp),
    }));
    result = {
      totalEarned: payments.reduce((acc, p) => acc + p.amount, BigInt(0)),
      payments,
    };
  } else if (!INDEXER_URL) {
    result = {
      totalEarned: BigInt('3500000000000000000'), // 3.5 ETH demo
      payments: [
        { amount: BigInt('2000000000000000000'), filmHash: 'raging-midlife', timestamp: Date.now() / 1000 - 86400 },
        { amount: BigInt('1500000000000000000'), filmHash: 'savage-midlife', timestamp: Date.now() / 1000 - 43200 },
      ],
    };
  } else {
    result = { totalEarned: BigInt(0), payments: [] };
  }

  cacheSet(key, result);
  return result;
}

/**
 * Get the film catalog — all published films.
 * Primary: Goldsky. Fallback: simulation films.
 */
export async function getFilmCatalog(
  options: { genre?: string; limit?: number; offset?: number } = {}
): Promise<CatalogFilm[]> {
  const { genre, limit = 50, offset = 0 } = options;
  const key = `catalog:${genre || 'all'}:${limit}:${offset}`;
  const cached = cacheGet<CatalogFilm[]>(key);
  if (cached) return cached;

  const whereClause = genre ? `, where: { genre: "${genre}" }` : '';
  const data = await graphqlQuery<{
    films: Array<{
      filmHash: string;
      title: string;
      creator: string;
      price: string;
      tier: string;
      genre?: string;
      isDeplatformed?: boolean;
      thumbnailUrl?: string;
    }>;
  }>(
    `query Catalog($limit: Int!, $offset: Int!) {
      films(first: $limit, skip: $offset${whereClause}, orderBy: mintedAt, orderDirection: desc) {
        filmHash
        title
        creator
        price
        tier
        genre
        isDeplatformed
        thumbnailUrl
      }
    }`,
    { limit, offset }
  );

  let result: CatalogFilm[];
  if (data) {
    result = data.films.map(f => ({ ...f, price: BigInt(f.price) }));
  } else {
    // Simulation: return demo films, optionally filtered by genre
    result = genre
      ? SIM_FILMS.filter(f => f.genre?.toLowerCase() === genre.toLowerCase())
      : SIM_FILMS;
    if (offset > 0) result = result.slice(offset);
    if (limit > 0) result = result.slice(0, limit);
  }

  cacheSet(key, result);
  return result;
}

/** Invalidate cache for an address (call after minting) */
export function invalidateCache(address?: string, filmHash?: string) {
  if (!address && !filmHash) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (address && key.includes(address.toLowerCase())) cache.delete(key);
    else if (filmHash && key.includes(filmHash)) cache.delete(key);
  }
}
