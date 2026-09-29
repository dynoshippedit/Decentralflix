/**
 * useOwnedFilms.enumeration.test.ts (DF-4)
 *
 * Adapted from TEST-1's candidate red test
 * (/home/dino/Desktop/.queue/work/TEST-1/candidate-tests/vitest/useOwnedFilms.enumeration.test.ts).
 *
 * Adaptation: @testing-library/react is NOT installed (chief decision pending),
 * so instead of renderHook the test exercises the exported pure enumeration
 * core `enumerateOwnedFilms` (apps/frontend/lib/contracts/useMovieTicket.ts)
 * with an injected fake read-view — plain vitest, no React, no DOM, no new
 * dependencies. Same scenarios as the candidate:
 *
 * G7: useOwnedFilms enumerated `for (i = 0; i < totalSupply; i++)`. On
 * MovieTicket, token IDs are dense from 0 but ERC721A totalSupply =
 * minted - burned. Mint 5 (IDs 0-4), burn token 0 -> totalSupply 4, the old
 * loop covered 0..3 and NEVER read token ID 4 — a film the user owns
 * disappeared from the UI. The fix bounds the loop by the on-chain
 * totalMinted() mint counter instead.
 */
import { describe, it, expect } from 'vitest';
import { enumerateOwnedFilms, type FilmReadView } from './useMovieTicket';

const USER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = '0xcccccccccccccccccccccccccccccccccccccccc';
const HASH4 = 'QmOwnedAfterBurn';

/** Fake on-chain view layer with per-scenario chain state. */
function makeChain(opts: {
  minted: bigint;
  ownerOf: (id: bigint) => string;
  videoHash?: string;
}): { readView: FilmReadView; calls: string[] } {
  const calls: string[] = [];
  // Typed loosely on purpose: the trap below proves 'totalSupply' is never
  // queried as the enumeration bound.
  const readView = (async (functionName: string, args?: readonly bigint[]) => {
    calls.push(functionName);
    switch (functionName) {
      case 'totalMinted':
        return opts.minted;
      case 'totalSupply':
        throw new Error('totalSupply must not be used as the enumeration bound');
      case 'ownerOf':
        return opts.ownerOf((args as readonly bigint[])[0]);
      case 'videoMetadata':
        return [
          opts.videoHash ?? HASH4,
          '0x0000000000000000000000000000000000000000',
          BigInt(0),
          true,
          false,
        ];
      default:
        throw new Error(`unstubbed view: ${functionName}`);
    }
  }) as FilmReadView;
  return { readView, calls };
}

describe('enumerateOwnedFilms (DF-4 fix for G7)', () => {
  it('still finds a token whose ID is >= totalSupply after a burn', async () => {
    // 5 minted (IDs 0-4), token 0 burned -> totalSupply would be 4.
    // The old loop (0..totalSupply-1) never read token 4; the fixed loop
    // (0..totalMinted-1) must.
    const { readView, calls } = makeChain({
      minted: BigInt(5),
      ownerOf: (id: bigint) => {
        if (id === BigInt(4)) return USER;
        if (id === BigInt(0)) throw new Error('ERC721A: burned token');
        return OTHER;
      },
    });

    const films = await enumerateOwnedFilms(readView, USER as `0x${string}`);

    expect(films).toContainEqual({ tokenId: 4, videoHash: HASH4 });
    expect(films.filter((f) => f.tokenId === 4)).toHaveLength(1);
    // The bound comes from the mint counter, never from totalSupply.
    expect(calls).toContain('totalMinted');
    expect(calls).not.toContain('totalSupply');
  });

  it('enumerates every token when nothing was burned (regression anchor)', async () => {
    const { readView } = makeChain({
      minted: BigInt(3),
      ownerOf: () => USER,
    });

    const films = await enumerateOwnedFilms(readView, USER as `0x${string}`);

    expect(films).toHaveLength(3);
    expect(films.map((f) => f.tokenId).sort()).toEqual([0, 1, 2]);
  });

  it('returns only the caller-owned tokens and skips burned ones silently', async () => {
    // IDs 0-2 minted; token 1 burned; user owns 0 and 2.
    const { readView } = makeChain({
      minted: BigInt(3),
      ownerOf: (id: bigint) => {
        if (id === BigInt(1)) throw new Error('ERC721A: burned token');
        return id === BigInt(0) || id === BigInt(2) ? USER : OTHER;
      },
      videoHash: 'QmMixed',
    });

    const films = await enumerateOwnedFilms(readView, USER as `0x${string}`);

    expect(films.map((f) => f.tokenId).sort()).toEqual([0, 2]);
    expect(films.every((f) => f.videoHash === 'QmMixed')).toBe(true);
  });
});
