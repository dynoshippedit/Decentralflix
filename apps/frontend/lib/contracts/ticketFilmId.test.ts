import { describe, expect, it } from 'vitest';
import { keccak256, toBytes } from 'viem';
import { ticketFilmIdForVideoHash } from './ticketFilmId';

describe('ticketFilmIdForVideoHash (F-1 purchase-path filmId derivation)', () => {
  it('equals uint256(keccak256(utf8(videoHash)))', () => {
    expect(ticketFilmIdForVideoHash('raging-midlife')).toBe(
      BigInt(keccak256(toBytes('raging-midlife')))
    );
  });

  it('matches a fixed known vector', () => {
    // keccak256("raging-midlife") computed independently with viem on node.
    // Guards against accidental derivation changes that would orphan
    // already-registered films (registration and purchase must agree).
    expect(ticketFilmIdForVideoHash('raging-midlife')).toBe(
      BigInt('48765296450693348719872805908216347797189482855692212378455536196049822846386')
    );
  });

  it('is deterministic across calls', () => {
    expect(ticketFilmIdForVideoHash('savage-midlife')).toBe(
      ticketFilmIdForVideoHash('savage-midlife')
    );
  });

  it('differs per film', () => {
    expect(ticketFilmIdForVideoHash('raging-midlife')).not.toBe(
      ticketFilmIdForVideoHash('savage-midlife')
    );
  });

  it('rejects empty input instead of deriving a wildcard id', () => {
    expect(() => ticketFilmIdForVideoHash('')).toThrow();
  });
});
