/**
 * TicketNFT filmId derivation for the /mint purchase flow (F-1 repair).
 *
 * TicketNFT identifies films by uint256 filmId, while the app's purchase
 * funnel addresses films by videoHash string (`/mint?film=<hash>`). To avoid
 * a second registry, the filmId is derived deterministically:
 *
 *   filmId = uint256(keccak256(utf8(videoHash)))
 *
 * REGISTRATION CONVENTION (platform owner): when calling
 * TicketNFT.registerFilm, the owner MUST compute filmId with this exact
 * function for the film's videoHash. /mint derives the same id client-side
 * and reads the on-chain price via getFilm(filmId) before building the
 * buyer's purchase transaction, so registration and purchase can never
 * disagree on which filmId a hash maps to.
 *
 * The filmmaker recorded at registration receives the 75% (+ rounding
 * remainder) creator share of every mintTicket payment; the split itself is
 * enforced by the immutable RevenueSplitter, not by this mapping.
 */
import { keccak256, toBytes } from 'viem';

export function ticketFilmIdForVideoHash(videoHash: string): bigint {
  if (typeof videoHash !== 'string' || videoHash.length === 0) {
    throw new Error('ticketFilmIdForVideoHash: videoHash must be a non-empty string');
  }
  return BigInt(keccak256(toBytes(videoHash)));
}
