/**
 * ABI-drift guard (df-cycle-13).
 *
 * Fails if the frontend's contract ABIs don't exactly match the compiled
 * Hardhat artifacts. This is the check that would have caught the df-cycle-12
 * drift (MovieTicket/PayPerView wrappers calling fee setters that no longer
 * exist on-chain) before it shipped.
 *
 * Run: `npm test` in apps/frontend. Fails closed:
 *  - missing artifact file        -> fail ("run `npx hardhat compile` first")
 *  - missing generated const      -> fail
 *  - any entry added/removed/changed -> fail
 *
 * The only documented deviation allowed: SEEDER_CREDITS_ABI in config.ts
 * carries one extra frontend-only entry (`submitMultiSourceReport`) for the
 * v2 seeding UI. The guard asserts that is the ONLY deviation.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOVIE_TICKET_ABI_FULL,
  FILMMAKER_CAMPAIGN_ABI_FULL,
  REVIEWS_ABI_FULL,
  SEEDER_CREDITS_ABI_FULL,
  TICKET_NFT_ABI_FULL,
  SUBSCRIPTION_MANAGER_ABI_FULL,
  PAY_PER_VIEW_ABI_FULL,
  DFLIX_ABI_FULL,
  PROOF_REGISTRY_ABI_FULL,
  SEEDER_REPUTATION_ABI_FULL,
} from './abis.generated';
import { SEEDER_CREDITS_ABI } from './config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/frontend/lib/contracts -> ../../../.. = repo root
const ARTIFACTS_DIR = path.resolve(__dirname, '../../../../packages/contracts/artifacts/contracts');

const CONTRACTS: Array<[string, readonly unknown[]]> = [
  ['MovieTicket', MOVIE_TICKET_ABI_FULL],
  ['FilmmakerCampaign', FILMMAKER_CAMPAIGN_ABI_FULL],
  ['Reviews', REVIEWS_ABI_FULL],
  ['SeederCredits', SEEDER_CREDITS_ABI_FULL],
  ['TicketNFT', TICKET_NFT_ABI_FULL],
  ['SubscriptionManager', SUBSCRIPTION_MANAGER_ABI_FULL],
  ['PayPerView', PAY_PER_VIEW_ABI_FULL],
  ['DFLIX', DFLIX_ABI_FULL],
  ['ProofRegistry', PROOF_REGISTRY_ABI_FULL],
  ['SeederReputation', SEEDER_REPUTATION_ABI_FULL],
];

function readArtifactAbi(contract: string): unknown[] {
  const p = path.join(ARTIFACTS_DIR, `${contract}.sol`, `${contract}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `ABI-drift guard: artifact not found for ${contract} (${p}). ` +
        'Run `npx hardhat compile` in packages/contracts first, then re-run this test.',
    );
  }
  const artifact = JSON.parse(fs.readFileSync(p, 'utf8')) as { abi: unknown[] };
  if (!Array.isArray(artifact.abi)) {
    throw new Error(`ABI-drift guard: artifact for ${contract} has no abi array (${p}).`);
  }
  return artifact.abi;
}

describe('ABI-drift guard', () => {
  it('compiled artifacts exist for every exported contract', () => {
    for (const [contract] of CONTRACTS) {
      const p = path.join(ARTIFACTS_DIR, `${contract}.sol`, `${contract}.json`);
      expect(fs.existsSync(p), `${contract}: missing artifact ${p}`).toBe(true);
    }
  });

  for (const [contract, generated] of CONTRACTS) {
    it(`${contract}: frontend ABI exactly matches the compiled artifact`, () => {
      const artifactAbi = readArtifactAbi(contract);
      expect(generated, `${contract}: generated ABI is empty/missing`).toBeTruthy();
      // Order- and length-sensitive deep equality: any added, removed, or
      // changed entry (function, event, error, constructor) fails the gate.
      expect(generated).toEqual(artifactAbi);
    });
  }

  it('SEEDER_CREDITS_ABI carries ONLY the documented frontend-only entry', () => {
    const full = SEEDER_CREDITS_ABI_FULL as readonly unknown[];
    const extended = SEEDER_CREDITS_ABI as readonly unknown[];
    const fullNames = new Set(full.map((e) => (e as { name?: string }).name));
    const extra = extended.filter((e) => !fullNames.has((e as { name?: string }).name));
    expect(extra.map((e) => (e as { name?: string }).name)).toEqual(['submitMultiSourceReport']);
    // And nothing from the compiled ABI was dropped or reordered.
    expect(extended.slice(0, full.length)).toEqual(full);
  });

  it('no removed fee-setter/withdraw functions linger in any generated ABI', () => {
    const dead = ['setPlatformFeeBps', 'setPlatformFee', 'withdrawPlatformFees', 'withdrawRevenue', 'withdraw'];
    for (const [contract, generated] of CONTRACTS) {
      const names = (generated as Array<{ name?: string }>).map((e) => e.name).filter(Boolean);
      for (const fn of dead) {
        expect(names, `${contract}: stale function ${fn} still in frontend ABI`).not.toContain(fn);
      }
    }
  });
});
