/**
 * Tests for lib/web3/contracts.ts.
 * The Phase 2 addresses are zero until step 9 (Sepolia deploy), so every
 * factory must throw a clear UNDEPLOYED error instead of a useless contract.
 */
import { describe, expect, it } from 'vitest';
import {
  UndeployedError,
  assertDeployed,
  getDFLIX,
  getPayPerView,
  getSubscriptionManager,
  getTicketNFT,
} from './contracts';

const RUNNER = {} as never; // never reached: assertDeployed throws first

describe('UNDEPLOYED guard', () => {
  it('getTicketNFT throws UndeployedError naming the env var', () => {
    expect(() => getTicketNFT(RUNNER)).toThrow(UndeployedError);
    expect(() => getTicketNFT(RUNNER)).toThrow(/UNDEPLOYED: TicketNFT/);
    expect(() => getTicketNFT(RUNNER)).toThrow(/NEXT_PUBLIC_TICKET_NFT_ADDRESS/);
  });

  it('getSubscriptionManager throws UndeployedError', () => {
    expect(() => getSubscriptionManager(RUNNER)).toThrow(UndeployedError);
    expect(() => getSubscriptionManager(RUNNER)).toThrow(/NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS/);
  });

  it('getPayPerView throws UndeployedError', () => {
    expect(() => getPayPerView(RUNNER)).toThrow(UndeployedError);
    expect(() => getPayPerView(RUNNER)).toThrow(/NEXT_PUBLIC_PAY_PER_VIEW_ADDRESS/);
  });

  it('getDFLIX throws UndeployedError', () => {
    expect(() => getDFLIX(RUNNER)).toThrow(UndeployedError);
    expect(() => getDFLIX(RUNNER)).toThrow(/NEXT_PUBLIC_DFLIX_ADDRESS/);
  });

  it('assertDeployed throws on zero/empty, passes on a real address', () => {
    expect(() =>
      assertDeployed('0x0000000000000000000000000000000000000000', 'TicketNFT', 'NEXT_PUBLIC_TICKET_NFT_ADDRESS'),
    ).toThrow(/UNDEPLOYED/);
    expect(() => assertDeployed('', 'TicketNFT', 'NEXT_PUBLIC_TICKET_NFT_ADDRESS')).toThrow(
      UndeployedError,
    );
    expect(() =>
      assertDeployed('0x1111111111111111111111111111111111111111', 'TicketNFT', 'NEXT_PUBLIC_TICKET_NFT_ADDRESS'),
    ).not.toThrow();
  });
});
