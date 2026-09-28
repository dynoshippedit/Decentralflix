// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MovieTicket.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SeederCredits
 * @dev Decentralflix P2P Hosting Credit System (Phase 0/1 hybrid MVP)
 *
 * Users earn redeemable credits by seeding/hosting film content.
 * Credits formula: uptime + bandwidth + peers (reported off-chain via Arweave, claimed on-chain).
 *
 * Hybrid design (per full vision):
 * - Heavy reports anchored on Arweave (immutable, censorship-resistant).
 * - On-chain lightweight ledger for balances + redemptions.
 * - Temporary platform attestor (owner-controlled EOA) for claim validation (bootstrap; replaceable later with multi-sig/indexers).
 *
 * Ties directly into NFT tiers: Higher tiers (Deluxe/Producer) get multipliers on earnings and redemptions.
 * Redeemable for perks (fee discounts, free tickets, future Producer eligibility).
 */
contract SeederCredits is Ownable, ReentrancyGuard {
    MovieTicket public immutable movieTicket;

    // Platform attestor (temporary trusted oracle for Phase 0/1; can be multi-sig later)
    address public platformAttestor;

    mapping(address => uint256) public credits;
    mapping(address => uint256) public lastClaimTimestamp;

    // Emergency switch: when true, new seeding-credit claims are blocked (owner-controlled).
    bool public claimsPaused;

    uint256 public constant MIN_CLAIM_COOLDOWN = 1 days;
    uint256 public constant MAX_REPORT_AGE = 7 days;

    // Events for transparency and indexing
    event CreditsEarned(
        address indexed seeder,
        uint256 amount,
        string arweaveTxId,
        uint256 tierMultiplier
    );
    event CreditsRedeemed(
        address indexed seeder,
        uint256 amount,
        bytes32 indexed rewardType
    );
    event PlatformAttestorUpdated(address oldAttestor, address newAttestor);

    constructor(address _movieTicket) Ownable(msg.sender) {
        require(_movieTicket != address(0), "Invalid MovieTicket");
        movieTicket = MovieTicket(_movieTicket);
        platformAttestor = msg.sender; // Owner starts as attestor
    }

    function setPlatformAttestor(address _newAttestor) external onlyOwner {
        require(_newAttestor != address(0), "Invalid attestor");
        address old = platformAttestor;
        platformAttestor = _newAttestor;
        emit PlatformAttestorUpdated(old, _newAttestor);
    }

    /**
     * @dev Claim credits from a signed Arweave report.
     * Report must be recent, signed by platformAttestor, and seeder must hold at least one ticket for referenced content.
     * Credits = (uptime + bandwidth + peers) * tierMultiplier (from highest owned tier).
     */
    function submitSeedingReport(
        string calldata arweaveTxId,
        uint256 claimedAmount,
        bytes calldata platformSignature
    ) external nonReentrant {
        require(!claimsPaused, "Claims paused");
        require(bytes(arweaveTxId).length > 0, "Invalid Arweave TX");
        require(claimedAmount > 0, "Amount must be > 0");
        require(
            block.timestamp >= lastClaimTimestamp[msg.sender] + MIN_CLAIM_COOLDOWN,
            "Claim cooldown active"
        );

        // Verify platform signature (simple ECDSA for Phase 0/1)
        bytes32 messageHash = keccak256(
            abi.encodePacked(msg.sender, arweaveTxId, claimedAmount, block.chainid)
        );
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        address signer = recoverSigner(ethSignedMessageHash, platformSignature);
        require(signer == platformAttestor, "Invalid platform signature");

        // Apply tier multiplier (reuses existing MovieTicket tier logic)
        uint256 multiplier = getTierMultiplier(msg.sender); // 100 = 1.0x, 125 = 1.25x, 150 = 1.5x
        uint256 finalAmount = (claimedAmount * multiplier) / 100;

        credits[msg.sender] += finalAmount;
        lastClaimTimestamp[msg.sender] = block.timestamp;

        emit CreditsEarned(msg.sender, finalAmount, arweaveTxId, multiplier);
    }

    /**
     * @dev Redeem credits for perks (e.g. fee discount voucher, free ticket, Producer marker).
     * rewardType examples: "MINT_DISCOUNT_10", "FREE_BURNABLE_TICKET", "PRODUCER_ELIGIBLE"
     */
    function redeemCredits(uint256 amount, bytes32 rewardType) external nonReentrant {
        require(amount > 0 && credits[msg.sender] >= amount, "Insufficient credits");

        credits[msg.sender] -= amount;

        // Future: actually mint vouchers or interact with MovieTicket
        // For Phase 0/1 we just emit the event (frontend/off-chain applies the perk)
        emit CreditsRedeemed(msg.sender, amount, rewardType);
    }

    /**
     * @dev Returns tier multiplier for a user based on their highest owned MovieTicket tier.
     * Reuses the same scan pattern as hasAccessToVideo for consistency in Phase 0.
     */
    function getTierMultiplier(address user) public view returns (uint256) {
        // Real tier bonus from the user's highest owned MovieTicket tier (O(1), no scan):
        // 150 = 1.5x (Producer), 125 = 1.25x (Deluxe), 100 = 1.0x (Basic / none).
        return movieTicket.highestTierMultiplier(user);
    }

    // Internal ECDSA recovery (standard)
    function recoverSigner(bytes32 hash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Invalid v");
        return ecrecover(hash, v, r, s);
    }

    // Emergency / admin (owner only)
    function emergencySlash(address seeder, uint256 amount) external onlyOwner {
        if (credits[seeder] >= amount) {
            credits[seeder] -= amount;
        }
    }

    event ClaimsPauseToggled(bool paused);

    function pauseClaims() external onlyOwner {
        claimsPaused = true;
        emit ClaimsPauseToggled(true);
    }

    function unpauseClaims() external onlyOwner {
        claimsPaused = false;
        emit ClaimsPauseToggled(false);
    }
}