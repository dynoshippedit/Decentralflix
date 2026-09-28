// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SeederReputation
 * @author Decentralflix — Phase 2 (step 6)
 * @notice On-chain seeder reputation ledger fed by a trusted attestor.
 *
 * A platform attestor (owner-set; same trust pattern as `SeederCredits`)
 * submits periodic seeding reports per seeder. Reports accumulate into
 * lifetime totals, and {scoreOf} computes a reputation score on-chain from a
 * documented formula.
 *
 * SCORING FORMULA:
 *   score = (uptimeSecs / 3600) + (bytesServed / 1e9) * 10 + validProofs * 100
 * i.e. 1 point per hour of reported seeding uptime, 10 points per reported
 * gigabyte served, 100 points per reported valid proof. All division is
 * integer division (remainders are dropped). A seeder with no reports scores 0.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LIMITATIONS — READ BEFORE USING SCORES FOR ANYTHING THAT MATTERS:
 * - Scores reflect ATTESTOR-REPORTED DATA, not independently verified facts.
 *   The attestor is a trusted party; a compromised or dishonest attestor can
 *   fabricate arbitrary scores.
 * - Scores are NOT Sybil-proof. A single entity can run many seeder
 *   identities and accumulate score across all of them.
 * - Self-dealing is undetectable here: a seeder serving its own requests
 *   looks identical to a seeder serving real demand.
 * - Treat scores as INFORMATIONAL ONLY. Do not gate payouts, access, or
 *   rewards on them without an additional verification layer (e.g.
 *   challenge-response proofs, stake-weighted identity, or decentralized
 *   attestation). See `docs/REPUTATION_LIMITATIONS.md` for the full analysis.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * @dev `periodId` is recorded in the event log for off-chain accounting only;
 * the contract does not deduplicate reports per period — the attestor is
 * trusted not to double-report. If that assumption ever changes, add
 * per-(seeder, periodId) replay protection.
 */
contract SeederReputation is Ownable {
    /// @notice Lifetime accumulated seeding stats for one seeder identity.
    struct Stats {
        uint64 uptimeSecs; // total reported seeding uptime in seconds
        uint128 bytesServed; // total reported bytes served
        uint64 validProofs; // total reported valid proofs (e.g. fragment proofs)
        uint64 reportCount; // number of reports ever submitted
    }

    // ── Errors ────────────────────────────────────────────────────────────
    error NotAttestor(address caller);
    error InvalidAttestor();
    error InvalidSeeder();

    // ── Events ────────────────────────────────────────────────────────────
    event AttestorUpdated(address indexed oldAttestor, address indexed newAttestor);
    event SeedingReported(
        address indexed seeder,
        uint64 indexed periodId,
        uint64 uptimeSecs,
        uint128 bytesServed,
        uint64 validProofs
    );

    /// @notice The trusted attestor allowed to submit seeding reports.
    address public attestor;

    mapping(address => Stats) private _stats; // seeder => Stats

    constructor() Ownable(msg.sender) {
        attestor = msg.sender; // owner starts as attestor (bootstrap, like SeederCredits)
    }

    /**
     * @notice Rotate the attestor. Only the contract owner may do this.
     * @param newAttestor Address of the new attestor (must be non-zero).
     */
    function setAttestor(address newAttestor) external onlyOwner {
        if (newAttestor == address(0)) revert InvalidAttestor();
        address old = attestor;
        attestor = newAttestor;
        emit AttestorUpdated(old, newAttestor);
    }

    /**
     * @notice Submit a seeding report for one period. Attestor-only.
     * Totals accumulate; reports are never overwritten.
     * @param seeder The seeder identity being reported on.
     * @param uptimeSecs Reported seeding uptime for the period, in seconds.
     * @param bytesServed Reported bytes served for the period.
     * @param validProofs Reported valid proofs for the period.
     * @param periodId Attestor-defined period identifier (accounting only;
     * not deduplicated on-chain).
     */
    function reportSeeding(
        address seeder,
        uint64 uptimeSecs,
        uint128 bytesServed,
        uint64 validProofs,
        uint64 periodId
    ) external {
        if (msg.sender != attestor) revert NotAttestor(msg.sender);
        if (seeder == address(0)) revert InvalidSeeder();

        Stats storage s = _stats[seeder];
        s.uptimeSecs += uptimeSecs;
        s.bytesServed += bytesServed;
        s.validProofs += validProofs;
        s.reportCount += 1;

        emit SeedingReported(seeder, periodId, uptimeSecs, bytesServed, validProofs);
    }

    /**
     * @notice Compute the reputation score for a seeder from accumulated stats.
     * Formula: (uptimeSecs / 3600) + (bytesServed / 1e9) * 10 + validProofs * 100.
     * @dev Informational only — see the limitations notice above.
     * @param seeder The seeder identity.
     * @return The score as a uint256 (0 for a seeder with no reports).
     */
    function scoreOf(address seeder) public view returns (uint256) {
        Stats storage s = _stats[seeder];
        return (uint256(s.uptimeSecs) / 3600)
            + (uint256(s.bytesServed) / 1_000_000_000) * 10
            + uint256(s.validProofs) * 100;
    }

    /**
     * @notice Return the accumulated stats for a seeder.
     * @param seeder The seeder identity.
     */
    function getStats(address seeder)
        external
        view
        returns (uint64 uptimeSecs, uint128 bytesServed, uint64 validProofs, uint64 reportCount)
    {
        Stats storage s = _stats[seeder];
        return (s.uptimeSecs, s.bytesServed, s.validProofs, s.reportCount);
    }
}
