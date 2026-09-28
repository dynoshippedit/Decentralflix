import { describe, it, expect } from 'vitest';
import { stringToHex, hexToString, type Abi } from 'viem';
import {
  ARBITRUM_SEPOLIA_CHAIN_ID,
  MOVIE_TICKET_ADDRESS,
  REVIEWS_ADDRESS,
  SEEDER_CREDITS_ADDRESS,
  FILMMAKER_CAMPAIGN_ADDRESS,
  MOVIE_TICKET_ABI,
  FILMMAKER_CAMPAIGN_ABI,
  REVIEWS_ABI,
  SEEDER_CREDITS_ABI,
  SEEDER_REWARD_MINT_DISCOUNT,
  SEEDER_REWARD_FREE_TICKET,
  SEEDER_REWARD_PRODUCER_BOOST,
  SEEDER_REWARD_AI_CREDITS,
} from './config';

const ZERO = '0x0000000000000000000000000000000000000000';

function fnNames(abi: readonly unknown[]): string[] {
  return (abi as Abi)
    .filter((e): e is Extract<Abi[number], { type: 'function' }> => (e as any).type === 'function')
    .map((e) => e.name);
}

describe('config constants', () => {
  it('targets Arbitrum Sepolia', () => {
    expect(ARBITRUM_SEPOLIA_CHAIN_ID).toBe(421614);
  });

  it('defaults all addresses to the zero address when env is unset', () => {
    for (const a of [
      MOVIE_TICKET_ADDRESS,
      REVIEWS_ADDRESS,
      SEEDER_CREDITS_ADDRESS,
      FILMMAKER_CAMPAIGN_ADDRESS,
    ]) {
      expect(a).toBe(ZERO);
    }
  });
});

describe('seeder reward type constants (bytes32-packed ASCII)', () => {
  const cases: [string, string][] = [
    [SEEDER_REWARD_MINT_DISCOUNT, 'MINT_DISCOUNT_10'],
    [SEEDER_REWARD_FREE_TICKET, 'FREE_BURNABLE_TICKET'],
    [SEEDER_REWARD_PRODUCER_BOOST, 'PRODUCER_BOOST'],
    [SEEDER_REWARD_AI_CREDITS, 'AI_COLLAB_CREDITS'],
  ];

  it('each constant is a 32-byte hex string', () => {
    for (const [hex] of cases) {
      expect(hex).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it('each constant decodes to its documented label', () => {
    for (const [hex, label] of cases) {
      expect(hexToString(hex as `0x${string}`, { size: 32 })).toBe(label);
      // and re-encoding the label reproduces the constant
      expect(stringToHex(label, { size: 32 })).toBe(hex);
    }
  });
});

describe('generated ABIs expose the real contract surface', () => {
  it('MovieTicket includes mint, access, and the new index views', () => {
    const names = fnNames(MOVIE_TICKET_ABI);
    for (const n of [
      'mintPermanentPass',
      'mintBurnableTicket',
      'hasAccessToVideo',
      'accessBalanceOf',
      'isFilmDelisted',
      'getPlatformFee',
    ]) {
      expect(names, `MovieTicket ABI missing ${n}`).toContain(n);
    }
  });

  it('FilmmakerCampaign includes crowdfund access + producer index', () => {
    const names = fnNames(FILMMAKER_CAMPAIGN_ABI);
    for (const n of [
      'launchCampaign',
      'contribute',
      'hasCrowdfundAccess',
      'campaignProducerTokens',
      'setCampaignVideo',
      'submitAIProof',
    ]) {
      expect(names, `FilmmakerCampaign ABI missing ${n}`).toContain(n);
    }
  });

  it('Reviews includes the review read/write surface', () => {
    const names = fnNames(REVIEWS_ABI);
    for (const n of ['submitReview', 'getReview', 'getReviews', 'getReviewCount', 'hasReviewed']) {
      expect(names, `Reviews ABI missing ${n}`).toContain(n);
    }
  });

  it('SeederCredits has the real claim path plus the preserved v2 stub', () => {
    const names = fnNames(SEEDER_CREDITS_ABI);
    expect(names).toContain('submitSeedingReport'); // real
    expect(names).toContain('redeemCredits'); // real
    expect(names).toContain('submitMultiSourceReport'); // frontend-only forward stub, must remain
  });
});
