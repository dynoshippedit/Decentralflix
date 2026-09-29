// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RevenueSplitter
 * @author Decentralflix — Phase 2
 * @notice Single source of truth for the Decentralflix creator/platform split.
 * EVERY contract that takes money from a viewer splits through here, so the
 * whitepaper's "75% to the creator, 25% to the platform" claim cannot drift
 * apart between contracts again (owner decision 2026-09-29: one rule,
 * everywhere, so the copy is true).
 *
 * Rules, encoded once:
 *  - The split is an immutable constant (PLATFORM_FEE_BPS = 2500). There is
 *    no setter by design; the owner cannot change it.
 *  - The platform fee is computed with floor division on msg.value; the
 *    creator receives `msg.value - fee`, so the rounding remainder ALWAYS
 *    favors the creator.
 *  - A zero creator address reverts (MissingCreator). There is NO owner
 *    fallback — the creator's share is never redirected.
 *  - The creator address is set by each inheriting contract at registration /
 *    creation time and can never be changed afterward.
 *  - F-DFLIX-1: the creator is paid BEFORE the platform fee, and ownership
 *    can only rotate to an address that can receive ETH (transferOwnership
 *    probes the new owner with a zero-value call). A non-receiving owner
 *    would brick every paid flow, since the fee leg is pushed atomically
 *    with the creator's share — the rotation guard keeps that state
 *    unreachable instead of letting a fee-leg failure outage user payments.
 *  - DF-RENOUNCE-1: renounceOwnership does NOT burn the 25% platform fee to
 *    address(0) on future sales. Once renounced, the fee leg is redirected
 *    to the creator — the creator receives 100% of every future sale.
 *    (Dino's economic call 2026-09-29: when the platform walks away, the
 *    creator gets everything; burning destroys value and a revert-guard
 *    could brick a legitimate exit.)
 * @dev Utility/access tokens only. No investment contract, no promised returns.
 * Any mainnet deployment must be reviewed by licensed counsel first.
 * NOTE: this contract is unaudited.
 */
abstract contract RevenueSplitter is Ownable {
    /// @notice Platform fee in basis points — IMMUTABLE. 2500 bps = 25%.
    /// The creator always receives 75% plus the rounding remainder.
    /// Defined once, here; there is no setter by design.
    uint256 public constant PLATFORM_FEE_BPS = 2500;

    /// @notice Basis-points denominator (10000 = 100%).
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ── Errors ────────────────────────────────────────────────────────────
    error MissingCreator();
    error TransferFailed();
    /// @notice The new owner cannot receive ETH — installing it would brick
    /// every paid flow (the platform-fee leg would always revert).
    error NewOwnerCannotReceive(address newOwner);

    // ── Events ────────────────────────────────────────────────────────────
    event RevenueSplit(address indexed creator, uint256 creatorShare, uint256 platformFee);

    /// @notice True once the platform has renounced ownership. While set,
    /// every future sale redirects the 25% platform fee to the creator
    /// (DF-RENOUNCE-1) — the creator receives 100%, nothing is burned.
    /// One-way: ownership can never be reclaimed after renouncing.
    bool public platformRenounced;

    /**
     * @notice Renounce platform ownership. DF-RENOUNCE-1: renouncing sets
     * `platformRenounced`, after which `_splitRevenue` sends 100% of every
     * sale to the creator instead of burning the 25% fee to address(0).
     * Emits OwnershipTransferred (via super) with the zero address.
     */
    function renounceOwnership() public override onlyOwner {
        platformRenounced = true;
        super.renounceOwnership();
    }

    /**
     * @notice Ownership can only rotate to an address that can receive ETH.
     * F-DFLIX-1: every paid flow pushes the platform fee to the owner
     * atomically with the creator's share, so a non-receiving owner would
     * brick ALL of them (buyAccess, subscribe, renew, mints). The zero-value
     * probe keeps that state unreachable: a contract without a payable
     * receive/fallback reverts the rotation instead of the payments.
     * EOAs always pass the probe. renounceOwnership sets `platformRenounced`
     * (DF-RENOUNCE-1): post-renounce sales pay the creator 100%.
     * @param newOwner Address to transfer ownership to.
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        (bool ok, ) = newOwner.call{value: 0}("");
        if (!ok) revert NewOwnerCannotReceive(newOwner);
        super.transferOwnership(newOwner);
    }

    /**
     * @notice Split msg.value 75/25 between `creator` and the platform (owner).
     * The platform fee is computed with floor division; the creator receives
     * `msg.value - fee`, so the rounding remainder always favors the creator.
     * Reverts on a zero creator — the creator's share is NEVER redirected to
     * the owner, and the owner cannot change the split.
     * F-DFLIX-1: the creator is paid FIRST, then the platform fee — the
     * user-facing payment settles before the platform takes its cut.
     * DF-RENOUNCE-1: after renounceOwnership, the fee leg is skipped and the
     * creator receives 100% of msg.value.
     * @param creator Address receiving the 75% (+ rounding remainder) share,
     * or 100% once the platform has renounced.
     * @return creatorShare wei sent to the creator.
     * @return platformFee wei sent to the platform (owner).
     */
    function _splitRevenue(address creator)
        internal
        returns (uint256 creatorShare, uint256 platformFee)
    {
        if (creator == address(0)) revert MissingCreator();

        if (platformRenounced) {
            // DF-RENOUNCE-1: the platform walked away — there is no fee leg.
            // The creator receives 100% of msg.value; nothing is burned to
            // address(0) and no payment can be bricked by a zero owner.
            creatorShare = msg.value;
            platformFee = 0;
            (bool okCreator, ) = creator.call{value: creatorShare}("");
            if (!okCreator) revert TransferFailed();
            emit RevenueSplit(creator, creatorShare, 0);
            return (creatorShare, 0);
        }

        platformFee = (msg.value * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        creatorShare = msg.value - platformFee;

        // F-DFLIX-1: creator first, then the platform fee. Under atomic
        // execution the order does not change the revert semantics, but the
        // user-facing payment settles before the platform takes its cut.
        (bool okCreator, ) = creator.call{value: creatorShare}("");
        if (!okCreator) revert TransferFailed();
        (bool okFee, ) = owner().call{value: platformFee}("");
        if (!okFee) revert TransferFailed();

        emit RevenueSplit(creator, creatorShare, platformFee);
    }
}
