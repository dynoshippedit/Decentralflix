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

    // ── Events ────────────────────────────────────────────────────────────
    event RevenueSplit(address indexed creator, uint256 creatorShare, uint256 platformFee);

    /**
     * @notice Split msg.value 75/25 between `creator` and the platform (owner).
     * The platform fee is computed with floor division; the creator receives
     * `msg.value - fee`, so the rounding remainder always favors the creator.
     * Reverts on a zero creator — the creator's share is NEVER redirected to
     * the owner, and the owner cannot change the split.
     * @param creator Address receiving the 75% (+ rounding remainder) share.
     * @return creatorShare wei sent to the creator.
     * @return platformFee wei sent to the platform (owner).
     */
    function _splitRevenue(address creator)
        internal
        returns (uint256 creatorShare, uint256 platformFee)
    {
        if (creator == address(0)) revert MissingCreator();

        platformFee = (msg.value * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        creatorShare = msg.value - platformFee;

        (bool okFee, ) = owner().call{value: platformFee}("");
        if (!okFee) revert TransferFailed();
        (bool okCreator, ) = creator.call{value: creatorShare}("");
        if (!okCreator) revert TransferFailed();

        emit RevenueSplit(creator, creatorShare, platformFee);
    }
}
