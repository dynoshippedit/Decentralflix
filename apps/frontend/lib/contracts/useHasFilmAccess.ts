import { useState, useEffect } from 'react';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { MOVIE_TICKET_ADDRESS, MOVIE_TICKET_ABI, TICKET_NFT_ADDRESS, TICKET_NFT_ABI, FILMMAKER_CAMPAIGN_ADDRESS, FILMMAKER_CAMPAIGN_ABI } from './config';
import { ticketFilmIdForVideoHash } from './ticketFilmId';
import { DEMO_ACCESSIBLE_FILMS } from '@/hooks/useFilmMetadata';
import { getMyFilms, getFilmOwners } from '@/lib/indexer'; // Preferred modern Goldsky path (GROK.md)

/**
 * INDEXER ABSTRACTION LAYER (ADR-001 Spike 3 — event-driven / indexer-first transition)
 *
 * Replaces/augments naive linear scans (totalSupply + per-token ownerOf/videoMetadata reads)
 * in hot paths: getMyAccessibleFilms, getFilmAccessSources, useHasFilmAccess, useMyAccessibleFilms.
 *
 * API:
 *  - getMyAccessibleFilmsViaIndexer(address): Promise of {hash, sources}[]  (replaces/augments getMyAccessibleFilms)
 *  - hasAccessToVideoViaIndexer(address, videoHash): Promise<{hasAccess:boolean, sources:string[]}|null>
 *
 * Implementation strategy (graceful, production-ready for later real indexer):
 *  1. If NEXT_PUBLIC_INDEXER_URL set → The Graph-style query (simple REST/GraphQL fetch stub; returns materialized view)
 *  2. Else → viem getLogs event filtering on VideoMinted (indexed `to` + videoHash arg) + ERC721 Transfer (for current ownership after transfers) + in-memory TTL cache
 *  3. On any failure / no data / !address / zero-addr contract → return [] / null so callers fall back cleanly
 *
 * Critical fixes applied (reviewer report for indexer spike):
 *  - Ownership correctness: event paths now track ERC721 Transfer(from/to/tokenId) in addition to VideoMinted.to.
 *    Uses per-cache-entry tokenId ownership maps (small) so fast path reflects *current* owner for transferable tokens.
 *  - Prefer contract view: legacy + single hasAccessToVideo paths now call the on-chain hasAccessToVideo(user, videoHash) view
 *    instead of duplicative client-side totalSupply+ownerOf+videoMetadata loops (list-all enumeration kept only where needed for "my films").
 *  - Cache bounded: INDEXER_CACHE + INDEXER_OWNERSHIP_MAPS limited to 500 entries with LRU-style (oldest-by-ts) eviction on insert.
 *
 * Cache policy (documented per reviewer): TTL=CACHE_TTL_MS (30s); max 500 entries per map.
 * Eviction of oldest entry (by ts) when size exceeds limit on any insert. Shared for list + per-video paths.
 * Prevents unbounded growth for long-lived clients/sessions while keeping UX snappy.
 *
 * Benefits (begins fixing the admitted linear-scan flaw):
 *  - getLogs is 1 RPC filtered by indexed topic (user address) vs O(totalSupply) reads.
 *  - Remote indexer (when deployed) makes it true O(1)/cached with no on-chain reads in UX paths.
 *  - Cache prevents repeat work in dashboard/collection/film surfaces.
 *  - 100% backward compatible: demo beauty, zero-address, no-contract, crowdfund paths untouched.
 *
 * Wire-up: When real subgraph (Goldsky/The Graph on Arbitrum) or custom indexer is live,
 * set NEXT_PUBLIC_INDEXER_URL and implement the fetch path for full production O(1).
 * This file + hooks now prefer the fast path; legacy scans remain only as fallback.
 *
 * Follows existing viem + hook + graceful demo patterns exactly (no new files; tiny util logic colocated).
 * All changes surgical per ADR-001 (event-driven + indexer-first for ownership/gating).
 */
const INDEXER_URL = (typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_INDEXER_URL : '') || '';
const INDEXER_CACHE = new Map<string, { data: unknown; ts: number }>();
const INDEXER_OWNERSHIP_MAPS = new Map<string, { tokenIdsByHash: Map<string, bigint[]>; ts: number }>();
const CACHE_TTL_MS = 30_000; // 30s — keeps dashboard/collection snappy while allowing refresh
const MAX_CACHE_ENTRIES = 500; // Bounded size (with oldest-ts eviction) per reviewer requirement for both INDEXER_CACHE and INDEXER_OWNERSHIP_MAPS

function getCacheKey(prefix: string, address?: string, videoHash?: string): string {
  return `${prefix}:${address?.toLowerCase() || 'anon'}:${videoHash || ''}`;
}

/** LRU-style eviction: remove the single oldest entry (by ts) when over MAX. O(n) fine at 500. */
function evictOldestIfNeeded(map: Map<string, { ts: number; [key: string]: unknown }>) {
  if (map.size <= MAX_CACHE_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestTs = Infinity;
  for (const [k, v] of map.entries()) {
    const entryTs = (v as any).ts as number;
    if (entryTs < oldestTs) {
      oldestTs = entryTs;
      oldestKey = k;
    }
  }
  if (oldestKey) map.delete(oldestKey);
}

/** Standard ERC721 Transfer event (indexed from/to/tokenId). Used alongside VideoMinted for current-ownership tracking on transferable tokens. */
const ERC721_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
) as any;

async function getCachedOrCompute<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = INDEXER_CACHE.get(key);
  if (hit && (Date.now() - hit.ts < CACHE_TTL_MS)) {
    return hit.data as T;
  }
  const fresh = await compute();
  INDEXER_CACHE.set(key, { data: fresh, ts: Date.now() });
  evictOldestIfNeeded(INDEXER_CACHE as any);
  return fresh;
}

// VideoMinted event fragment (matches contract; videoHash not indexed but present in args for client filter)
const VIDEO_MINTED_EVENT = parseAbiItem(
  'event VideoMinted(uint256 indexed tokenId, address indexed creator, address indexed to, string videoHash, uint8 ticketType, uint8 tier, uint256 price, uint256 platformFee, uint256 creatorShare)'
) as any;

/**
 * Core event-driven path (viem getLogs). No totalSupply enumeration.
 *
 * NOW CORRECT FOR TRANSFERABLE TOKENS (critical reviewer fix):
 * - Listens to VideoMinted (for direct mint hashes) + ERC721 Transfer (indexed from/to/tokenId).
 * - Replays only transfers touching the user to compute *current* owner set (mint + any transfers in/out).
 * - Maintains small per-cache-entry map (INDEXER_OWNERSHIP_MAPS) of tokenIds the user currently owns per videoHash.
 * - Hashes for secondary transfers enriched via minimal videoMetadata reads (N << totalSupply).
 * - Consults/populates the ownership map so hasAccessToVideoViaEventLogs shares work (no duplicate RPCs within TTL).
 *
 * Falls back cleanly on zero-addr / errors (demo behavior preserved).
 */
async function getMyAccessibleFilmsViaEventLogs(
  userAddress: `0x${string}`
): Promise<Array<{ hash: string; sources: string[] }>> {
  if (!userAddress || MOVIE_TICKET_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return [];
  }

  const cacheKey = getCacheKey('accessible', userAddress);

  // Per-cache-entry ownership map hit (may have been populated by a prior hasAccessToVideoViaEventLogs call for same user)
  const ownHit = INDEXER_OWNERSHIP_MAPS.get(cacheKey);
  if (ownHit && (Date.now() - ownHit.ts < CACHE_TTL_MS)) {
    const films: Array<{ hash: string; sources: string[] }> = [];
    for (const [h, tids] of ownHit.tokenIdsByHash.entries()) {
      if (tids.length > 0) films.push({ hash: h, sources: ['MovieTicket'] });
    }
    return films;
  }

  const { films, tokenIdsByHash } = await fetchAndComputeCurrentOwnership(userAddress);

  // Store per-cache-entry map of owned tokenIds (keyed by videoHash). Enables fast hasAccess + future enrichment.
  INDEXER_OWNERSHIP_MAPS.set(cacheKey, { tokenIdsByHash, ts: Date.now() });
  evictOldestIfNeeded(INDEXER_OWNERSHIP_MAPS as any);

  return films;
}

/**
 * Fast hasAccess check via same event logs (or future indexer).
 *
 * NOW CORRECT FOR TRANSFERABLE TOKENS (critical reviewer fix):
 * - Consults the per-cache-entry ownership map (INDEXER_OWNERSHIP_MAPS) first (populated by getMy... or prior calls).
 * - If miss: delegates to fetchAndComputeCurrentOwnership (VideoMinted + Transfer replay) which populates the map.
 * - Thus single-video checks now correctly reflect current owner after any ERC721 Transfers (not just original VideoMinted.to).
 * - Also populates map for the user so subsequent list or other-video checks are instant (within TTL).
 *
 * Initially falls back to on-chain view or demo when indexer path unavailable. Zero-addr preserved.
 */
async function hasAccessToVideoViaEventLogs(
  userAddress: `0x${string}`,
  videoHash: string
): Promise<{ hasAccess: boolean; sources: string[] }> {
  if (!userAddress || !videoHash || MOVIE_TICKET_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return { hasAccess: false, sources: [] };
  }

  const cacheKey = getCacheKey('accessible', userAddress);

  // Per-cache-entry ownership map hit (preferred; may come from list path or prior hasAccess)
  const ownHit = INDEXER_OWNERSHIP_MAPS.get(cacheKey);
  if (ownHit && (Date.now() - ownHit.ts < CACHE_TTL_MS)) {
    const tids = ownHit.tokenIdsByHash.get(videoHash);
    if (tids && tids.length > 0) {
      return { hasAccess: true, sources: ['MovieTicket'] };
    }
    return { hasAccess: false, sources: [] };
  }

  // Miss: compute full current ownership for user (builds the map for *all* his current holdings)
  const { tokenIdsByHash } = await fetchAndComputeCurrentOwnership(userAddress);
  INDEXER_OWNERSHIP_MAPS.set(cacheKey, { tokenIdsByHash, ts: Date.now() });
  evictOldestIfNeeded(INDEXER_OWNERSHIP_MAPS as any);

  const tids = tokenIdsByHash.get(videoHash);
  if (tids && tids.length > 0) {
    return { hasAccess: true, sources: ['MovieTicket'] };
  }
  return { hasAccess: false, sources: [] };
}

/**
 * Internal: fetches filtered VideoMinted (to=user) + Transfer(to=user) + Transfer(from=user) logs.
 * Replays only the user's relevant transfers (in chrono order) to compute *current* owned tokenIds.
 * Groups into per-videoHash tokenId map (the "per-cache-entry map" for transferable correctness).
 * For secondary-market tokens (minted to others, transferred in): enriches hash via 1..N videoMetadata reads (N = #owned via transfer; tiny).
 * Returns films list + the ownership map. Used by both list and per-video event paths (populates shared map).
 * Zero-address / no-contract short-circuit preserved.
 */
async function fetchAndComputeCurrentOwnership(
  userAddress: `0x${string}`
): Promise<{
  films: Array<{ hash: string; sources: string[] }>;
  tokenIdsByHash: Map<string, bigint[]>;
}> {
  if (!userAddress || MOVIE_TICKET_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return { films: [], tokenIdsByHash: new Map() };
  }

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  try {
    const [mintToUserLogs, transferToUserLogs, transferFromUserLogs] = await Promise.all([
      publicClient.getLogs({
        address: MOVIE_TICKET_ADDRESS,
        event: VIDEO_MINTED_EVENT,
        args: { to: userAddress },
        fromBlock: BigInt(0),
      }),
      publicClient.getLogs({
        address: MOVIE_TICKET_ADDRESS,
        event: ERC721_TRANSFER_EVENT,
        args: { to: userAddress },
        fromBlock: BigInt(0),
      }),
      publicClient.getLogs({
        address: MOVIE_TICKET_ADDRESS,
        event: ERC721_TRANSFER_EVENT,
        args: { from: userAddress },
        fromBlock: BigInt(0),
      }),
    ]);

    // Direct-mint hashes (for tokens originally minted *to* this user) — avoids contract read
    const directMintHashByToken = new Map<bigint, string>();
    for (const log of mintToUserLogs as any[]) {
      const tid = (log.args as any)?.tokenId as bigint | undefined;
      const vHash = (log.args as any)?.videoHash as string | undefined;
      if (tid !== undefined && vHash && vHash.length > 0) {
        directMintHashByToken.set(tid, vHash);
      }
    }

    // Collect + sort user's relevant Transfer logs (only these affect *this user's* holdings)
    type RelTx = { blockNumber: bigint; logIndex: number; from?: `0x${string}`; to?: `0x${string}`; tokenId?: bigint };
    const relevant: RelTx[] = [];
    const pushTx = (logs: any[]) => {
      for (const log of logs as any[]) {
        relevant.push({
          blockNumber: (log as any).blockNumber ?? BigInt(0),
          logIndex: Number((log as any).logIndex ?? 0),
          from: (log.args as any)?.from as `0x${string}` | undefined,
          to: (log.args as any)?.to as `0x${string}` | undefined,
          tokenId: (log.args as any)?.tokenId as bigint | undefined,
        });
      }
    };
    pushTx(transferToUserLogs);
    pushTx(transferFromUserLogs);

    relevant.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber - b.blockNumber);
      return a.logIndex - b.logIndex;
    });

    // Replay only user's transfers → final current owned set (correct for mint + any # of transfers)
    const currentlyOwned = new Set<bigint>();
    for (const t of relevant) {
      if (t.tokenId === undefined) continue;
      const toLc = t.to?.toLowerCase();
      const fromLc = t.from?.toLowerCase();
      const uLc = userAddress.toLowerCase();
      if (toLc === uLc) {
        currentlyOwned.add(t.tokenId);
      } else if (fromLc === uLc) {
        currentlyOwned.delete(t.tokenId);
      }
    }

    // Group by videoHash; enrich missing hashes (transferred-in tokens) via minimal contract reads
    const tokenIdsByHash = new Map<string, bigint[]>();
    const needRead: bigint[] = [];
    for (const tid of currentlyOwned) {
      const h = directMintHashByToken.get(tid);
      if (h) {
        if (!tokenIdsByHash.has(h)) tokenIdsByHash.set(h, []);
        tokenIdsByHash.get(h)!.push(tid);
      } else {
        needRead.push(tid);
      }
    }

    if (needRead.length > 0) {
      for (const tid of needRead) {
        try {
          const meta = await publicClient.readContract({
            address: MOVIE_TICKET_ADDRESS,
            abi: MOVIE_TICKET_ABI,
            functionName: 'videoMetadata',
            args: [tid],
          });
          const vHash = ((meta as unknown) as any[])[0] as string;
          if (vHash && vHash.length > 0) {
            if (!tokenIdsByHash.has(vHash)) tokenIdsByHash.set(vHash, []);
            tokenIdsByHash.get(vHash)!.push(tid);
          }
        } catch (e) {
          console.warn('[indexer] videoMetadata enrichment for transferred token failed', tid, e);
        }
      }
    }

    // Build films list (sorted sources for consistency)
    const films: Array<{ hash: string; sources: string[] }> = Array.from(tokenIdsByHash.keys())
      .filter((h) => (tokenIdsByHash.get(h)?.length ?? 0) > 0)
      .map((hash) => ({ hash, sources: ['MovieTicket'] }));

    return { films, tokenIdsByHash };
  } catch (e) {
    console.warn('[indexer] Event log query for current ownership (VideoMinted+Transfers) failed (will fallback)', e);
    return { films: [], tokenIdsByHash: new Map() };
  }
}

/**
 * Remote indexer (The Graph-style) stub.
 * When NEXT_PUBLIC_INDEXER_URL is set (e.g. to a Goldsky subgraph or custom endpoint),
 * performs a query for materialized "my accessible films" or access proof.
 * Returns [] / null on miss to trigger local event or legacy fallback.
 */
async function queryRemoteIndexerForAccessible(address: `0x${string}`): Promise<Array<{ hash: string; sources: string[] }>> {
  if (!INDEXER_URL) return [];
  try {
    // Flexible: support simple REST or GraphQL. Example REST for spike.
    const url = `${INDEXER_URL.replace(/\/$/, '')}/my-accessible-films?address=${address}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    if (json && Array.isArray(json.films)) {
      return json.films as Array<{ hash: string; sources: string[] }>;
    }
    // GraphQL fallback shape example (adapt when real subgraph deployed)
    if (json?.data?.myAccessibleFilms) {
      return json.data.myAccessibleFilms as any;
    }
    return [];
  } catch (e) {
    console.warn('[indexer] Remote indexer unreachable, falling back to local event logs');
    return [];
  }
}

async function queryRemoteIndexerForAccess(
  address: `0x${string}`,
  videoHash: string
): Promise<{ hasAccess: boolean; sources: string[] } | null> {
  if (!INDEXER_URL) return null;
  try {
    const url = `${INDEXER_URL.replace(/\/$/, '')}/has-access?address=${address}&videoHash=${encodeURIComponent(videoHash)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json.hasAccess === 'boolean') {
      return { hasAccess: !!json.hasAccess, sources: Array.isArray(json.sources) ? json.sources : [] };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Public indexer abstraction entrypoint for "films I can access".
 * Prefers (in order): remote indexer → local viem event filtering (cached, now Transfer-aware for ownership) → [] (caller falls back)
 */
export async function getMyAccessibleFilmsViaIndexer(
  address?: `0x${string}`
): Promise<Array<{ hash: string; sources: string[] }>> {
  if (!address) return [];
  const key = getCacheKey('accessible', address);
  return getCachedOrCompute(key, async () => {
    // 1. Remote The Graph-style (when configured — becomes true production fast path)
    const remote = await queryRemoteIndexerForAccessible(address);
    if (remote.length > 0) return remote;

    // 2. Local event-driven (viem getLogs) — already eliminates linear scan
    const viaEvents = await getMyAccessibleFilmsViaEventLogs(address);
    if (viaEvents.length > 0) return viaEvents;

    return [];
  });
}

/**
 * Public indexer abstraction entrypoint for fast access check.
 * Returns null when no fast path available (caller must use legacy/on-chain/demo).
 * Per-video now benefits from corrected event ownership (Transfers) + contract view in legacy.
 */
export async function hasAccessToVideoViaIndexer(
  address?: `0x${string}`,
  videoHash?: string
): Promise<{ hasAccess: boolean; sources: string[] } | null> {
  if (!address || !videoHash) return null;
  const key = getCacheKey('hasAccess', address, videoHash);
  return getCachedOrCompute(key, async () => {
    // 1. Remote
    const remote = await queryRemoteIndexerForAccess(address, videoHash);
    if (remote) return remote;

    // 2. Event logs (fast, filtered; Transfer-aware for current ownership + shared per-cache map)
    const viaEvents = await hasAccessToVideoViaEventLogs(address, videoHash);
    if (viaEvents.hasAccess) return viaEvents;

    return null; // no definitive fast answer
  });
}

/**
 * Reusable non-hook async checker. Used by the hook + Reviews component
 * for per-reviewer badge computation without duplicating logic.
 */
export async function getFilmAccessSources(
  userAddress?: `0x${string}`,
  videoHash?: string
): Promise<string[]> {
  if (!userAddress || !videoHash) return [];

  // === INDEXER-FIRST FAST PATH (ADR-001) ===
  // Prefer event-driven / remote indexer for the MovieTicket access check.
  // This eliminates the previous per-token linear scan for the hot gating path.
  // Crowdfund path kept as-is for this minimal spike (full replacement in follow-up).
  try {
    const viaIndexer = await hasAccessToVideoViaIndexer(userAddress, videoHash);
    if (viaIndexer && viaIndexer.hasAccess) {
      // Merge any crowdfund sources (non-blocking, keeps compat)
      const sources = [...viaIndexer.sources];
      // Still perform crowdfund check (lightweight view when available) for complete sources list
      const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http() });
      if (FILMMAKER_CAMPAIGN_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        try {
          const hasViaView = await publicClient.readContract({
            address: FILMMAKER_CAMPAIGN_ADDRESS,
            abi: FILMMAKER_CAMPAIGN_ABI,
            functionName: 'hasCrowdfundAccess',
            args: [userAddress, videoHash],
          });
          if (hasViaView && !sources.includes('CrowdfundInvestment')) sources.push('CrowdfundInvestment');
        } catch {}
      }
      return sources.length ? sources : viaIndexer.sources;
    }
  } catch {}

  // === LEGACY FALLBACK (full backward compat + demo beauty) ===
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  const foundSources: string[] = [];

  try {
    // Check MovieTicket (existing useOwnedFilms pattern) — only reached on indexer miss.
    // HIGH priority reviewer fix: prefer the existing on-chain hasAccessToVideo(user, videoHash) VIEW
    // (single call, authoritative, reflects current ownerOf inside contract, eliminates duplication + linear client scan).
    // (Full enumeration is retained *only* for the "list all my films" fallback path in getMyAccessibleFilms where enrichment is required.)
    if (MOVIE_TICKET_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      try {
        const hasViaView = await publicClient.readContract({
          address: MOVIE_TICKET_ADDRESS,
          abi: MOVIE_TICKET_ABI,
          functionName: 'hasAccessToVideo',
          args: [userAddress, videoHash],
        });
        if (hasViaView) {
          foundSources.push('MovieTicket');
        }
      } catch {}
    }

    // TicketNFT purchase path (F-1 rewire: /mint now sells TicketNFT tickets).
    // The filmId is derived deterministically from the videoHash — registration
    // must use ticketFilmIdForVideoHash for the same hash. Zero-address guard
    // preserves demo behavior when TicketNFT is not deployed.
    if (TICKET_NFT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      try {
        const hasTicket = await publicClient.readContract({
          address: TICKET_NFT_ADDRESS,
          abi: TICKET_NFT_ABI,
          functionName: 'hasValidTicket',
          args: [userAddress, ticketFilmIdForVideoHash(videoHash)],
        });
        if (hasTicket) {
          foundSources.push('TicketNFT');
        }
      } catch {}
    }

    // Check FilmmakerCampaign InvestmentNFTs (crowdfund backers) — unchanged
    if (FILMMAKER_CAMPAIGN_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      let crowdfundChecked = false;
      try {
        // Prefer the new clean on-chain view (when contract deployed with hasCrowdfundAccess)
        const hasViaView = await publicClient.readContract({
          address: FILMMAKER_CAMPAIGN_ADDRESS,
          abi: FILMMAKER_CAMPAIGN_ABI,
          functionName: 'hasCrowdfundAccess',
          args: [userAddress, videoHash],
        });
        if (hasViaView) {
          foundSources.push('CrowdfundInvestment');
        }
        crowdfundChecked = true;
      } catch {
        // Fallback to prior client-side scan for pre-deploy or older contract versions.
        // Note: Legacy crowdfund scan grants access on any ownership match without videoHash verification
        // (unlike the new hasCrowdfundAccess view). For precise gating, deploy updated contract and rely on the on-chain view.
      }

      if (!crowdfundChecked) {
        // Phase 0 legacy scan (same pattern as before) — see note above about lack of videoHash matching
        const owners = await getFilmOwners(videoHash);
        if (owners.some((o: any) => (o.address as string).toLowerCase() === userAddress.toLowerCase())) {
          foundSources.push('CrowdfundInvestment');
        }
      }
    }
  } catch (err) {
    console.warn('Access sources check failed (contracts may not be deployed)');
  }

  return foundSources;
}

/**
 * Combined ownership/access hook.
 * Checks both MovieTicket holdings AND crowdfund InvestmentNFTs for a given videoHash.
 * This is the real gating source for the player and Reviews in Phase 0/1.
 *
 * Now indexer-first (via getFilmAccessSources): prefers event logs / remote indexer for MovieTicket
 * (eliminates linear scan in this hot path). Full backward compat + demo preserved.
 */
export function useHasFilmAccess(userAddress?: `0x${string}`, videoHash?: string) {
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<string[]>([]); // e.g. ["MovieTicket", "Crowdfund"]

  const checkAccess = async () => {
    if (!userAddress || !videoHash) {
      setHasAccess(false);
      setSources([]);
      return;
    }

    setIsLoading(true);
    try {
      const foundSources = await getFilmAccessSources(userAddress, videoHash);
      setHasAccess(foundSources.length > 0);
      setSources(foundSources);
    } catch (err) {
      console.warn('Access check failed (contracts may not be deployed)');
      setHasAccess(false);
      setSources([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAccess();
  }, [userAddress, videoHash]);

  return {
    hasAccess,
    isLoading,
    sources,
    refresh: checkAccess,
  };
}

/**
 * Returns films the user has gated access to (MovieTicket holders or crowdfund InvestmentNFT backers).
 * Leverages the improved hasCrowdfundAccess view (tied to setCampaignVideo links) + **indexer-first** MovieTicket access.
 *
 * This is the key hot-path replacement (per ADR-001 Spike): getMyAccessibleFilms now prefers
 * getMyAccessibleFilmsViaIndexer (remote The Graph-style or viem VideoMinted+ERC721-Transfer event filtering + ownership map cache)
 * over the old totalSupply linear scan. Event path now correctly tracks current owners for transferable tokens.
 * Powers dashboard/collection owned films + useHasFilmAccess.
 *
 * Returns raw {hash, sources} — consumer enriches titles via getDemoFilmTitle or useFilmMetadata.
 * Zero breaking changes; identical demo/zero-address behavior when indexer or contracts unavailable.
 */
export async function getMyAccessibleFilms(
  userAddress?: `0x${string}`
): Promise<Array<{ hash: string; sources: string[] }>> {
  if (!userAddress) return [];

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  const filmMap = new Map<string, string[]>(); // hash -> sources array (deduped)

  // === INDEXER-FIRST: MovieTicket path (replaces the previous linear totalSupply scan) ===
  // Uses the new abstraction: remote indexer (when configured) or viem event filtering on VideoMinted.
  // This is the primary hot-path replacement for this spike (dashboard/collection owned films + gating).
  if (MOVIE_TICKET_ADDRESS !== '0x0000000000000000000000000000000000000000') {
    try {
      const viaIndexer = await getMyAccessibleFilmsViaIndexer(userAddress);
      if (viaIndexer.length > 0) {
        for (const f of viaIndexer) {
          if (!filmMap.has(f.hash)) filmMap.set(f.hash, []);
          const srcs = filmMap.get(f.hash)!;
          for (const s of f.sources) {
            if (!srcs.includes(s)) srcs.push(s);
          }
        }
        // Short-circuit the old scan — indexer/event path succeeded
      } else {
        // Fallback only when indexer/event path yielded nothing (keeps demo + zero-addr beauty).
        // NOTE (reviewer alignment): full enumeration kept *only* here for "list all my films" enrichment case.
        // Per-video paths (getFilmAccessSources + hasAccess checks) now use the hasAccessToVideo VIEW instead.
        const myFilms = await getMyFilms(userAddress).catch(() => []);
        for (const f of myFilms) {
          const vHash = f.filmHash;
          if (vHash) {
            if (!filmMap.has(vHash)) filmMap.set(vHash, []);
            const srcs = filmMap.get(vHash)!;
            if (!srcs.includes('MovieTicket')) srcs.push('MovieTicket');
          }
        }
      }
    } catch (e) {
      console.warn('MovieTicket (indexer + legacy) for my accessible films had issue (contract may not be deployed)');
    }
  }

  // 2. Crowdfund backer access via recent systems: enumerate campaignVideoHash (populated by setCampaignVideo)
  //    then precise check with the improved hasCrowdfundAccess view. No reliance on broken sparse tokenId scans.
  //    (Left unchanged in this minimal spike; indexer abstraction can be wired here in next pass.)
  if (FILMMAKER_CAMPAIGN_ADDRESS !== '0x0000000000000000000000000000000000000000') {
    try {
      const nextCampaignId = await publicClient.readContract({
        address: FILMMAKER_CAMPAIGN_ADDRESS,
        abi: FILMMAKER_CAMPAIGN_ABI,
        functionName: 'nextCampaignId',
      });
      const linkedVideos = new Set<string>();
      for (let cid = 0; cid < Number(nextCampaignId); cid++) {
        try {
          const vHash = (await publicClient.readContract({
            address: FILMMAKER_CAMPAIGN_ADDRESS,
            abi: FILMMAKER_CAMPAIGN_ABI,
            functionName: 'campaignVideoHash',
            args: [BigInt(cid)],
          })) as unknown as string;
          if (vHash && vHash.length > 0) {
            linkedVideos.add(vHash);
          }
        } catch {}
      }
      for (const vHash of linkedVideos) {
        try {
          const hasViaView = await publicClient.readContract({
            address: FILMMAKER_CAMPAIGN_ADDRESS,
            abi: FILMMAKER_CAMPAIGN_ABI,
            functionName: 'hasCrowdfundAccess',
            args: [userAddress, vHash],
          });
          if (hasViaView) {
            if (!filmMap.has(vHash)) filmMap.set(vHash, []);
            const srcs = filmMap.get(vHash)!;
            if (!srcs.includes('CrowdfundInvestment')) srcs.push('CrowdfundInvestment');
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Crowdfund linked-video scan skipped (no campaigns or no videos linked via setCampaignVideo yet)');
    }
  }

  return Array.from(filmMap.entries()).map(([hash, sources]) => ({
    hash,
    sources: sources.slice().sort(),
  }));
}

// Rich Phase 0 demo (now sourced from shared hook to eliminate demo list duplication)
const DEMO_MY_ACCESSIBLE_FILMS: Array<{ hash: string; sources: string[] }> = DEMO_ACCESSIBLE_FILMS;

/**
 * Hook for User Library / gated film access list.
 * Uses getMyAccessibleFilms (now indexer-first for MovieTicket via event logs / remote indexer abstraction;
 * combines with crowdfund via latest hasCrowdfundAccess + campaignVideoHash).
 * This single change makes dashboard, collection, and all "my films" surfaces begin the event-driven transition.
 */
export function useMyAccessibleFilms(userAddress?: `0x${string}`) {
  const [films, setFilms] = useState<Array<{ hash: string; sources: string[] }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAccessible = async () => {
    if (!userAddress) {
      setFilms(DEMO_MY_ACCESSIBLE_FILMS);
      return;
    }
    setIsLoading(true);
    try {
      // Prefer modern indexer (Goldsky/event-driven) when available
      const modern = await getMyFilms(userAddress).catch(() => null);
      if (modern && modern.length > 0) {
        setFilms(modern.map(f => ({ hash: f.filmHash, sources: [f.tier] })));
      } else {
        const onChain = await getMyAccessibleFilms(userAddress);
        setFilms(onChain.length > 0 ? onChain : DEMO_MY_ACCESSIBLE_FILMS);
      }
    } catch (err) {
      console.warn('useMyAccessibleFilms failed, falling back to demo');
      setFilms(DEMO_MY_ACCESSIBLE_FILMS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccessible();
  }, [userAddress]);

  return {
    films,
    isLoading,
    refresh: fetchAccessible,
  };
}
