// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MovieTicket.sol";

/**
 * @title FilmmakerCampaign
 * @dev Decentralflix Crowdfunding + Milestone Escrow + InvestmentNFTs — UTILITY ONLY (HIGHEST LEGAL RISK AREA)
 *
 * CRITICAL LEGAL WARNING (Step 3 — user-provided research):
 * Producer-tier crowdfunding + milestone escrow + AI review windows create the highest exposure under Howey test.
 * - All InvestmentNFTs and backings are STRICTLY UTILITY/ACCESS tokens only.
 * - NO promises of returns, repayment, profits, or completion.
 * - Platform provides ZERO custody; funds live only in this contract's escrow.
 * - Milestone proofs submitted by Producer-tier backers have a mandatory 48-72h review window (non-custodial design).
 *
 * This contract must be read together with:
 * - docs/legal/ToS.md §4 (NFTs, Crowdfunding, Escrow)
 * - docs/legal/RESEARCH_AND_INTEGRATION.md (Howey + money transmission analysis)
 * - Clickwrap consent modal enforced in frontend before any launch/contribute/AI-proof action.
 *
 * Section 230 / DMCA: Platform-level protection for UGC. Contract itself only handles value escrow and access claims.
 * All legal documents and contract comments require review by licensed counsel before mainnet deployment.
 *
 * Allows filmmakers to launch NFT-backed crowdfunding campaigns.
 * Backers receive InvestmentNFTs (permanent access claim + investment proof).
 * Funds held in escrow, released only on owner-approved milestones.
 * Special 48-72h admin review window for milestone proof submissions from Producer-tier backers.
 *
 * Reuses Tier enum, patterns, and philosophy from MovieTicket + SeederCredits.
 * Arweave-first for all rich metadata/proofs (immutable, censorship-resistant).
 * Owner (platform dev) has moderation power for AI reviews + emergency controls.
 */
contract FilmmakerCampaign is ERC721A, Ownable, ReentrancyGuard {
    MovieTicket public immutable movieTicket;

    enum CampaignStatus { ACTIVE, FUNDED, FAILED, DELIVERED }

    struct TierConfig {
        uint256 price;
        uint256 maxSupply;
        uint256 sold;
    }

    struct Milestone {
        string desc;
        uint256 amount;
        bool approved;
        uint256 approvedAt;
        bool isAI;
        string proofHash;          // Arweave
        uint256 aiReviewDeadline;  // 0 if not AI
    }

    struct Campaign {
        address filmmaker;
        string metadataHash;       // Arweave JSON (pitch, title, poster, milestones, etc.)
        uint256 target;
        uint256 raised;
        uint256 deadline;
        CampaignStatus status;
        TierConfig[3] tiers;       // 0=BASIC, 1=DELUXE, 2=PRODUCER
        Milestone[] milestones;
    }

    uint256 public nextCampaignId;
    uint256 public aiReviewWindow = 72 hours;

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => uint256) public campaignEscrow;
    mapping(uint256 => mapping(address => uint256)) public backerTotals; // campaignId => backer => total invested

    // InvestmentNFTs (campaign-scoped for simplicity)
    mapping(uint256 => uint256) public tokenCampaign; // tokenId => campaignId
    mapping(uint256 => MovieTicket.Tier) public tokenTiers;

    // Simple mapping for campaign -> videoHash association. Enables clean hasCrowdfundAccess without relying on off-chain Arweave metadata parsing.
    // Set by filmmaker or owner (e.g. on delivery or launch). Phase 0 practicality for video gating of backers.
    mapping(uint256 => string) public campaignVideoHash;

    // === Reverse access index (O(1) crowdfund access, NO linear scan per ADR-001) ===
    // campaignId => backer => number of (non-burned) InvestmentNFTs held for that campaign.
    // Maintained on contribute (explicitly) + transfer/burn (via _afterTokenTransfers).
    mapping(uint256 => mapping(address => uint256)) public campaignBackerTokens;
    // Same index restricted to PRODUCER-tier InvestmentNFTs — powers _ownsProducerInvestment
    // (AI-proof submission gate) in O(1), no scan.
    mapping(uint256 => mapping(address => uint256)) public campaignProducerTokens;
    // keccak(videoHash) => linked campaignId + 1 (0 = unlinked). Reverse of campaignVideoHash,
    // set in setCampaignVideo, so hasCrowdfundAccess resolves a film to its campaign in O(1).
    mapping(bytes32 => uint256) private _videoCampaignPlusOne;

    event CampaignLaunched(uint256 indexed id, address filmmaker, string metadataHash, uint256 target);
    event Contribution(uint256 indexed campaignId, address indexed backer, MovieTicket.Tier tier, uint256 amount, uint256 tokenId);
    event MilestoneSubmitted(uint256 indexed campaignId, uint256 mId, string proofHash, bool isAI);
    event AIReviewed(uint256 indexed campaignId, uint256 mId, bool approved);
    event MilestoneReleased(uint256 indexed campaignId, uint256 mId, uint256 amount, address filmmaker);
    event RefundClaimed(uint256 indexed campaignId, address indexed backer, uint256 amount);
    event AIReviewWindowUpdated(uint256 newWindow);
    event CampaignVideoLinked(uint256 indexed campaignId, string videoHash);
    event CampaignFailed(uint256 indexed campaignId);

    constructor(address _movieTicket) Ownable(msg.sender) ERC721A("Decentralflix Crowdfund Pass", "DFCP") {
        require(_movieTicket != address(0), "Invalid MovieTicket");
        movieTicket = MovieTicket(_movieTicket);
    }

    function setAIReviewWindow(uint256 _hours) external onlyOwner {
        require(_hours >= 48 && _hours <= 72, "Window must be 48-72 hours");
        aiReviewWindow = _hours * 1 hours;
        emit AIReviewWindowUpdated(aiReviewWindow);
    }

    // Launch campaign (any filmmaker — anti-gatekeeping)
    function launchCampaign(
        string calldata metadataHash,
        uint256 target,
        uint256[] calldata milestoneAmounts,
        uint256[3] calldata tierPrices,
        uint256[3] calldata tierMaxSupplies,
        uint256 deadline
    ) external returns (uint256 campaignId) {
        require(bytes(metadataHash).length > 0, "Metadata required");
        require(target > 0 && milestoneAmounts.length > 0, "Invalid campaign");
        require(deadline > block.timestamp, "Deadline in past");

        campaignId = nextCampaignId++;

        Campaign storage c = campaigns[campaignId];
        c.filmmaker = msg.sender;
        c.metadataHash = metadataHash;
        c.target = target;
        c.deadline = deadline;
        c.status = CampaignStatus.ACTIVE;

        for (uint8 i = 0; i < 3; i++) {
            c.tiers[i] = TierConfig({
                price: tierPrices[i],
                maxSupply: tierMaxSupplies[i],
                sold: 0
            });
        }

        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            c.milestones.push(Milestone({
                desc: "", // Descriptions in Arweave metadata
                amount: milestoneAmounts[i],
                approved: false,
                approvedAt: 0,
                isAI: false,
                proofHash: "",
                aiReviewDeadline: 0
            }));
        }

        emit CampaignLaunched(campaignId, msg.sender, metadataHash, target);
    }

    // Backer contributes and receives InvestmentNFT (acts as access + proof)
    function contribute(uint256 campaignId, MovieTicket.Tier tier) external payable nonReentrant returns (uint256 tokenId) {
        Campaign storage c = campaigns[campaignId];
        require(c.status == CampaignStatus.ACTIVE, "Not active");
        require(block.timestamp < c.deadline, "Deadline passed");
        require(uint8(tier) < 3, "Invalid tier");

        TierConfig storage tc = c.tiers[uint8(tier)];
        require(tc.sold < tc.maxSupply, "Tier sold out");
        require(msg.value >= tc.price, "Insufficient payment");

        tokenId = _nextTokenId();
        _safeMint(msg.sender, 1);
        tokenCampaign[tokenId] = campaignId;
        tokenTiers[tokenId] = tier;
        campaignBackerTokens[campaignId][msg.sender] += 1; // index backer access (mint case)
        if (tier == MovieTicket.Tier.PRODUCER) {
            campaignProducerTokens[campaignId][msg.sender] += 1; // producer-tier gate index
        }

        tc.sold++;
        c.raised += msg.value;
        campaignEscrow[campaignId] += msg.value;
        backerTotals[campaignId][msg.sender] += msg.value;

        if (c.raised >= c.target) {
            c.status = CampaignStatus.FUNDED;
        }

        emit Contribution(campaignId, msg.sender, tier, msg.value, tokenId);
        return tokenId;
    }

    // Producer-tier backers only (check via owned InvestmentNFT + tier)
    function submitAIProof(uint256 campaignId, uint256 mId, string calldata proofHash) external {
        require(_ownsProducerInvestment(msg.sender, campaignId), "Must own Producer InvestmentNFT");
        Milestone storage m = campaigns[campaignId].milestones[mId];
        require(!m.approved && bytes(m.proofHash).length == 0, "Already submitted");

        m.isAI = true;
        m.proofHash = proofHash;
        m.aiReviewDeadline = block.timestamp + aiReviewWindow;

        emit MilestoneSubmitted(campaignId, mId, proofHash, true);
    }

    // Owner-only AI review (enforces 48-72h window)
    function reviewAISubmission(uint256 campaignId, uint256 mId, bool approved) external onlyOwner {
        Milestone storage m = campaigns[campaignId].milestones[mId];
        require(m.isAI, "Not an AI submission");
        require(block.timestamp <= m.aiReviewDeadline, "Review window closed");

        if (!approved) {
            m.proofHash = ""; // allow re-submit
            m.isAI = false;
            m.aiReviewDeadline = 0;
        }

        emit AIReviewed(campaignId, mId, approved);
    }

    // Owner approves and releases tranche from escrow
    function approveMilestoneAndRelease(uint256 campaignId, uint256 mId) external onlyOwner nonReentrant {
        Campaign storage c = campaigns[campaignId];
        Milestone storage m = c.milestones[mId];

        if (m.isAI) {
            require(block.timestamp > m.aiReviewDeadline || m.approved, "AI review pending");
        }
        require(!m.approved, "Already released");
        require(campaignEscrow[campaignId] >= m.amount, "Insufficient escrow");

        m.approved = true;
        m.approvedAt = block.timestamp;
        campaignEscrow[campaignId] -= m.amount;

        (bool sent, ) = c.filmmaker.call{value: m.amount}("");
        require(sent, "Transfer failed");

        // Check if all milestones approved
        bool allApproved = true;
        for (uint256 i = 0; i < c.milestones.length; i++) {
            if (!c.milestones[i].approved) allApproved = false;
        }
        if (allApproved) c.status = CampaignStatus.DELIVERED;

        emit MilestoneReleased(campaignId, mId, m.amount, c.filmmaker);
    }

    function claimRefund(uint256 campaignId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        require(c.status == CampaignStatus.FAILED || (block.timestamp > c.deadline && c.raised < c.target), "Not refundable");

        uint256 amt = backerTotals[campaignId][msg.sender];
        require(amt > 0 && campaignEscrow[campaignId] >= amt, "No refund due");

        backerTotals[campaignId][msg.sender] = 0;
        campaignEscrow[campaignId] -= amt;

        (bool sent, ) = msg.sender.call{value: amt}("");
        require(sent);

        emit RefundClaimed(campaignId, msg.sender, amt);
    }

    function _ownsProducerInvestment(address user, uint256 campaignId) internal view returns (bool) {
        return campaignProducerTokens[campaignId][user] > 0;
    }

    // Phase 0: associate a campaign with the videoHash it grants crowdfund backer access to.
    // Called by the filmmaker or platform owner (e.g. once film is delivered via final milestone).
    // Enables the clean hasCrowdfundAccess check below.
    function setCampaignVideo(uint256 campaignId, string memory videoHash) external {
        Campaign storage c = campaigns[campaignId];
        require(c.filmmaker != address(0), "Campaign does not exist");
        require(msg.sender == c.filmmaker || msg.sender == owner(), "Not authorized");
        require(bytes(videoHash).length > 0, "Video hash required");

        // Clear the reverse link from any previous hash this campaign pointed at (avoids stale access).
        string memory oldHash = campaignVideoHash[campaignId];
        if (bytes(oldHash).length > 0) {
            bytes32 oldKey = _key(oldHash);
            if (_videoCampaignPlusOne[oldKey] == campaignId + 1) {
                _videoCampaignPlusOne[oldKey] = 0;
            }
        }

        campaignVideoHash[campaignId] = videoHash;
        _videoCampaignPlusOne[_key(videoHash)] = campaignId + 1;
        emit CampaignVideoLinked(campaignId, videoHash);
    }

    function _key(string memory videoHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(videoHash));
    }

    /**
     * @dev ERC721A transfer hook — keeps campaignBackerTokens correct on secondary transfers
     * and burns of InvestmentNFTs. Mints (from == address(0)) are handled in contribute().
     */
    function _afterTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal override {
        if (from == address(0)) return;
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tid = startTokenId + i;
            uint256 cid = tokenCampaign[tid];
            bool isProducer = tokenTiers[tid] == MovieTicket.Tier.PRODUCER;
            if (campaignBackerTokens[cid][from] > 0) {
                campaignBackerTokens[cid][from] -= 1;
            }
            if (isProducer && campaignProducerTokens[cid][from] > 0) {
                campaignProducerTokens[cid][from] -= 1;
            }
            if (to != address(0)) {
                campaignBackerTokens[cid][to] += 1;
                if (isProducer) {
                    campaignProducerTokens[cid][to] += 1;
                }
            }
        }
    }

    /**
     * @dev Clean public view for crowdfund backer video gating.
     * Returns true if `user` owns any InvestmentNFT (DFCP) for a campaign whose
     * campaignVideoHash matches the given `videoHash`.
     * (Phase 0 uses explicit on-chain mapping set via setCampaignVideo, since
     * full campaign metadata lives on Arweave and cannot be parsed in Solidity.)
     */
    function hasCrowdfundAccess(address user, string memory videoHash) public view returns (bool) {
        if (user == address(0) || bytes(videoHash).length == 0) return false;
        uint256 cp1 = _videoCampaignPlusOne[_key(videoHash)];
        if (cp1 == 0) return false; // no campaign links this film
        return campaignBackerTokens[cp1 - 1][user] > 0;
    }

    // Admin emergency: force a campaign into FAILED so every backer can pull their refund via
    // claimRefund(). Pull pattern (no unbounded backer loop) keeps this gas-safe at any scale.
    function emergencyRefundAll(uint256 campaignId) external onlyOwner {
        Campaign storage c = campaigns[campaignId];
        require(c.filmmaker != address(0), "Campaign does not exist");
        c.status = CampaignStatus.FAILED;
        emit CampaignFailed(campaignId);
    }

    // ERC721 overrides
    function tokenURI(uint256 tokenId) public view override(ERC721A) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721A) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}