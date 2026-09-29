import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * F-1/F-2 wiring regression: /mint must be the user-payable TicketNFT
 * purchase flow, not the owner-only MovieTicket mint.
 *
 * F-1: the old page called MovieTicket.mintPermanentPass from the buyer's
 * wallet; that function is onlyOwner, so every real purchase reverted.
 * F-2: the old page silently defaulted the `creator` split parameter to the
 * buyer's own address, which would have routed the 75% creator share to the
 * buyer on the owner-mint path.
 *
 * These tests read the page source as text (same technique as
 * copy-honesty.test.ts) and FAIL against the pre-repair page.
 */
const PAGE = path.resolve(__dirname, '../../app/mint/page.tsx');
const src = fs.readFileSync(PAGE, 'utf8');

describe('/mint purchase-flow wiring (F-1, F-2)', () => {
  it('does not call the owner-only MovieTicket mintPermanentPass', () => {
    expect(src).not.toMatch(/mintPermanentPass/);
  });

  it('does not reference the MovieTicket contract for the purchase', () => {
    expect(src).not.toMatch(/MOVIE_TICKET_ABI/);
  });

  it('calls TicketNFT mintTicket against the TicketNFT contract', () => {
    expect(src).toMatch(/TICKET_NFT_ADDRESS/);
    expect(src).toMatch(/functionName:\s*['"]mintTicket['"]/);
  });

  it('derives the TicketNFT filmId from the film hash', () => {
    expect(src).toMatch(/ticketFilmIdForVideoHash/);
  });

  it('has no silent creator default to the buyer (F-2)', () => {
    expect(src).not.toMatch(/creator\s*\|\|\s*connectedAddress/);
    expect(src).not.toMatch(/setCreator\(connectedAddress\)/);
  });

  it('blocks the sale when the on-chain filmmaker is zero or the buyer (F-2)', () => {
    // The filmmaker must be explicit: nonzero and not the buyer. A
    // zero/buyer-equal filmmaker disables the purchase instead of
    // silently misrouting the 75% creator share.
    expect(src).toMatch(/filmmakerBlockedReason/);
    expect(src).toMatch(/sale is blocked/);
    expect(src).not.toMatch(/const creatorShare/);
  });
});
