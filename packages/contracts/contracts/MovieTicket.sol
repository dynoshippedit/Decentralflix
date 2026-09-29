// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "erc721a/contracts/ERC721A.sol";
import "./RevenueSplitter.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MovieTicket
 * @dev Decentralflix Movie Ticket NFT — Utility/Access Token Only
 *
 * IMPORTANT LEGAL POSTURE (per user-provided research + ToS integration — Step 3):
 * - This contract issues UTILITY-ONLY access tokens (Basic/Deluxe/Producer tiers).
 * - Grants on-chain verified access to films + review rights (see hasAccessToVideo).
 * - NO securities, NO investment contracts, NO expectation of profit or returns.
 * - Fully non-custodial: all value flows wallet-to-wallet via direct contract calls.
 * - Platform (operator) never takes custody of funds or NFTs.
 *
 * @notice NON-CUSTODIAL SPLITTER: every mint payment is split immediately
 * through the shared RevenueSplitter — 75% (+ rounding remainder) to the
 * creator, 25% to the platform (owner). The split is an immutable constant;
 * there is no owner-settable fee and no owner withdraw sweep. Nothing
 * accrues in the contract.
 *
 * Section 230 (Communications Decency Act) + DMCA Safe Harbor:
 * The broader Decentralflix platform relies on Section 230 immunity for third-party UGC.
 * This contract only handles access gating and payments; it does not host or moderate content.
 * DMCA: Takedowns affect access links/metadata only (immutability of chain respected).
 *
 * Producer tier + FilmmakerCampaign crowdfunding carries elevated legal risk (Howey analysis).
 * See docs/legal/RESEARCH_AND_INTEGRATION.md and ToS §4 for mandatory disclaimers.
 *
 * All users must accept the clickwrap ToS/Privacy before any mint or crowdfund action.
 *
 * All legal documents and contract comments must be reviewed by licensed counsel before mainnet.
 * This contract is provided as part of the production build for demonstration purposes.
 * NOTE: this contract is unaudited.
 *
 * Supports two types of tokens:
 *   1. Permanent Access Passes (soulbound-style or transferable)
 *   2. Burnable Single-Watch Tickets
 *
 * Higher tiers can mint additional burnable tickets that reappear in the buyer's wallet.
 */
contract MovieTicket is ERC721A, RevenueSplitter, ReentrancyGuard {
    // Business counter for videoMetadata keys (kept in sync with ERC721A token IDs via spot minting).
    // We no longer shadow ERC721A's totalSupply() or _nextTokenId().
    uint256 private _videoCounter;
    bool private _paused;

    // URI storage (ERC721A does not include ERC721URIStorage by default)
    mapping(uint256 => string) private _tokenURIs;

    enum TicketType {
        PERMANENT_PASS,
        BURNABLE_TICKET
    }

    enum Tier {
        BASIC,
        DELUXE,
        PRODUCER
    }

    struct VideoMetadata {
        string videoHash;      // Arweave or IPFS hash
        address creator;
        uint256 price;
        bool isActive;
        bool isDelisted;       // Emergency legal removal flag (set via delistFilm)
    }

    mapping(uint256 => VideoMetadata) public videoMetadata;
    mapping(uint256 => TicketType) public ticketTypes;
    mapping(uint256 => Tier) public tokenTiers;   // New: supports Basic / Deluxe / Producer
    mapping(uint256 => bool) public hasBeenWatched;

    // Producer tier perks stub (can be expanded with voting, AI collab rights, etc.)
    mapping(uint256 => bool) public hasProducerRights;

    // === Reverse access index (O(1) ownership-by-film, NO linear scan per ADR-001) ===
    // keccak(videoHash) => owner => number of (non-burned) tickets that owner currently holds for that film.
    // Maintained explicitly on mint (in the mint functions) and on transfer/burn (via _afterTokenTransfers).
    // Powers hasAccessToVideo() in O(1) — replaces the old totalSupply scan / always-false stub.
    mapping(bytes32 => mapping(address => uint256)) private _filmAccessCount;

    // Per-address tier holdings: count of [BASIC, DELUXE, PRODUCER] tickets currently held.
    // Maintained alongside _filmAccessCount; powers highestTierMultiplier() (used by SeederCredits
    // to apply tier earning bonuses) in O(1), no scan.
    mapping(address => uint256[3]) private _tierBalance;

    // === Emergency Legal Removal (T16 — CSAM / illegal content only) ===
    mapping(bytes32 => bool) public isDelisted;
    mapping(bytes32 => string) public delistReason;
    mapping(bytes32 => uint256) public delistedAt;

    // ── Errors ────────────────────────────────────────────────────────────
    error IncorrectPayment(uint256 expected, uint256 received);

    event VideoMinted(
        uint256 indexed tokenId,
        address indexed creator,
        address indexed to,
        string videoHash,
        TicketType ticketType,
        Tier tier,
        uint256 price,
        uint256 platformFee,
        uint256 creatorShare
    );
    event CreatorPaid(uint256 indexed tokenId, address indexed creator, uint256 amount);
    event TicketBurned(uint256 indexed tokenId, address indexed viewer);
    event Paused(address account);
    event Unpaused(address account);
    event TierUpgraded(uint256 indexed tokenId, Tier newTier); // Future: allow upgrading tiers

    // Emergency legal removal events (only for illegal content — political deplatforming is not removable)
    event ContentDelisted(string indexed videoHash, string reason, uint256 timestamp, address by);
    event ContentRestored(string indexed videoHash, uint256 timestamp, address by);

    constructor() ERC721A("Decentralflix Movie Ticket", "DFMT") Ownable(msg.sender) {}

    /**
     * @dev ERC721A hook — start token IDs at 0 to match prior ERC721 behavior.
     */
    function _startTokenId() internal pure override returns (uint256) {
        return 0;
    }

    /**
     * @dev Internal helper to set token URI (replaces ERC721URIStorage behavior).
     */
    function _setTokenURI(uint256 tokenId, string memory uri) internal {
        _tokenURIs[tokenId] = uri;
    }

    /**
     * @dev Canonical film key. Matches the hashing used by the delisting maps so
     * access and delisting share the exact same key space.
     */
    function _filmKey(string memory videoHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(videoHash));
    }

    /**
     * @dev ERC721A transfer hook — keeps _filmAccessCount correct on secondary transfers
     * and burns. Mints (from == address(0)) are accounted for explicitly in the mint
     * functions, so they are skipped here to avoid double counting.
     */
    function _afterTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal override {
        if (from == address(0)) return; // mint: handled in mint functions
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = startTokenId + i;
            bytes32 key = _filmKey(videoMetadata[tokenId].videoHash);
            uint256 tierIdx = uint256(uint8(tokenTiers[tokenId]));
            if (_filmAccessCount[key][from] > 0) {
                _filmAccessCount[key][from] -= 1;
            }
            if (_tierBalance[from][tierIdx] > 0) {
                _tierBalance[from][tierIdx] -= 1;
            }
            if (to != address(0)) {
                _filmAccessCount[key][to] += 1; // transfer recipient gains access
                _tierBalance[to][tierIdx] += 1;
            }
            // to == address(0) is a burn: access + tier holding simply removed from `from`.
        }
    }

    modifier whenNotPaused() {
        require(!_paused, "MovieTicket: paused");
        _;
    }

    function pause() public onlyOwner {
        _paused = true;
        emit Paused(msg.sender);
    }

    function unpause() public onlyOwner {
        _paused = false;
        emit Unpaused(msg.sender);
    }

    // === Emergency Legal Removal (T16) — ONLY for illegal content (CSAM, etc.) ===
    // Censorship resistance applies to political pressure on *legal* content.
    function delistFilm(string calldata videoHash, string calldata reason) external onlyOwner {
        bytes32 hashKey = keccak256(abi.encodePacked(videoHash));
        isDelisted[hashKey] = true;
        delistReason[hashKey] = reason;
        delistedAt[hashKey] = block.timestamp;
        emit ContentDelisted(videoHash, reason, block.timestamp, msg.sender);
    }

    function restoreFilm(string calldata videoHash) external onlyOwner {
        bytes32 hashKey = keccak256(abi.encodePacked(videoHash));
        isDelisted[hashKey] = false;
        emit ContentRestored(videoHash, block.timestamp, msg.sender);
    }

    function isFilmDelisted(string memory videoHash) public view returns (bool) {
        return isDelisted[keccak256(abi.encodePacked(videoHash))];
    }

    /**
     * @dev Split the mint payment 75/25 through the shared RevenueSplitter.
     * Payment must equal the price exactly — with no owner withdraw sweep,
     * any excess would be locked in the contract forever. Reverts on a zero
     * creator; the creator's share is NEVER redirected.
     */
    function _splitMintPayment(address creator, uint256 price)
        internal
        returns (uint256 creatorShare, uint256 platformFee)
    {
        if (msg.value != price) revert IncorrectPayment(price, msg.value);
        if (msg.value == 0) return (0, 0); // free mint: no transfers, nothing accrues
        return _splitRevenue(creator);
    }

    function mintPermanentPass(
        address to,
        address creator,
        string memory videoHash,
        uint256 price,
        Tier tier // New parameter for multi-tier support
    ) public payable onlyOwner whenNotPaused nonReentrant returns (uint256) {
        require(uint8(tier) <= uint8(Tier.PRODUCER), "Invalid tier");

        (uint256 creatorShare, uint256 platformFee) = _splitMintPayment(creator, price);

        uint256 tokenId = _videoCounter++;

        // Pay creator immediately at the immutable 75/25 split (protects them
        // from future gas price increases). The platform fee goes straight to
        // the owner — nothing accrues in the contract, so there is nothing for
        // an owner sweep to take.
        if (creatorShare > 0) {
            emit CreatorPaid(tokenId, creator, creatorShare);
        }

        // Sequential ERC721A mint of exactly one token. Because every mint here is a single
        // token and _startTokenId() == 0, the minted id equals our _videoCounter value above,
        // so metadata/event keys stay in sync. (_safeMintSpot is NOT usable without overriding
        // _sequentialUpTo(); using it here reverted every mint with SpotMintTokenIdTooSmall.)
        _safeMint(to, 1);
        _setTokenURI(tokenId, videoHash);

        videoMetadata[tokenId] = VideoMetadata({
            videoHash: videoHash,
            creator: creator,
            price: price,
            isActive: true,
            isDelisted: false
        });

        ticketTypes[tokenId] = TicketType.PERMANENT_PASS;
        tokenTiers[tokenId] = tier;
        _filmAccessCount[_filmKey(videoHash)][to] += 1; // index ownership for O(1) access checks
        _tierBalance[to][uint256(uint8(tier))] += 1; // index tier holdings for O(1) tier multiplier

        if (tier == Tier.PRODUCER) {
            hasProducerRights[tokenId] = true;
        }

        emit VideoMinted(
            tokenId,
            creator,
            to,
            videoHash,
            TicketType.PERMANENT_PASS,
            tier,
            price,
            platformFee,
            creatorShare
        );
        return tokenId;
    }

    function mintBurnableTicket(
        address to,
        address creator,
        string memory videoHash,
        uint256 price,
        Tier tier // New parameter for multi-tier support
    ) public payable onlyOwner whenNotPaused nonReentrant returns (uint256) {
        require(uint8(tier) <= uint8(Tier.PRODUCER), "Invalid tier");

        (uint256 creatorShare, uint256 platformFee) = _splitMintPayment(creator, price);

        uint256 tokenId = _videoCounter++;

        // Pay creator immediately at the immutable 75/25 split. The platform
        // fee goes straight to the owner — nothing accrues in the contract.
        if (creatorShare > 0) {
            emit CreatorPaid(tokenId, creator, creatorShare);
        }

        // Sequential ERC721A mint of exactly one token. Because every mint here is a single
        // token and _startTokenId() == 0, the minted id equals our _videoCounter value above,
        // so metadata/event keys stay in sync. (_safeMintSpot is NOT usable without overriding
        // _sequentialUpTo(); using it here reverted every mint with SpotMintTokenIdTooSmall.)
        _safeMint(to, 1);
        _setTokenURI(tokenId, videoHash);

        videoMetadata[tokenId] = VideoMetadata({
            videoHash: videoHash,
            creator: creator,
            price: price,
            isActive: true,
            isDelisted: false
        });

        ticketTypes[tokenId] = TicketType.BURNABLE_TICKET;
        tokenTiers[tokenId] = tier;
        _filmAccessCount[_filmKey(videoHash)][to] += 1; // index ownership for O(1) access checks
        _tierBalance[to][uint256(uint8(tier))] += 1; // index tier holdings for O(1) tier multiplier

        if (tier == Tier.PRODUCER) {
            hasProducerRights[tokenId] = true;
        }

        emit VideoMinted(
            tokenId,
            creator,
            to,
            videoHash,
            TicketType.BURNABLE_TICKET,
            tier,
            price,
            platformFee,
            creatorShare
        );
        return tokenId;
    }

    // Burn a single-watch ticket after viewing (or on first play)
    function burnTicket(uint256 tokenId) public {
        require(ownerOf(tokenId) == msg.sender, "Not ticket owner");
        require(ticketTypes[tokenId] == TicketType.BURNABLE_TICKET, "Not a burnable ticket");
        require(!hasBeenWatched[tokenId], "Ticket already used");

        hasBeenWatched[tokenId] = true;
        _burn(tokenId);

        emit TicketBurned(tokenId, msg.sender);
    }

    // Back-compat alias for the access check. Previously an always-true MVP placeholder
    // (a latent always-grant footgun); now delegates to the real O(1) hasAccessToVideo so it
    // can never wrongly grant access if any caller wires it up.
    function hasAccess(address viewer, string memory videoHash) public view returns (bool) {
        return hasAccessToVideo(viewer, videoHash);
    }

    // === Fee Calculation Helpers (for frontend / off-chain use) ===
    // Wired to the shared immutable split — the owner cannot change these.

    function getPlatformFee(uint256 price) public pure returns (uint256) {
        return (price * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
    }

    function getCreatorShare(uint256 price) public pure returns (uint256) {
        return price - getPlatformFee(price);
    }

    /**
     * @dev O(1) on-chain access check. Returns true iff `user` currently holds at least one
     * (non-burned) ticket whose videoHash matches, and the film is not delisted.
     *
     * Backed by the _filmAccessCount reverse index maintained on mint/transfer/burn — there is
     * NO totalSupply iteration, so this scales for mass-mint launches (ADR-001 compliant).
     * Off-chain indexers may still be used for richer queries, but ownership/access gating
     * (e.g. Reviews) can now rely on this view directly.
     */
    function hasAccessToVideo(address user, string memory videoHash) public view returns (bool) {
        if (isFilmDelisted(videoHash)) return false; // T16: illegal content is immediately inaccessible
        return _filmAccessCount[_filmKey(videoHash)][user] > 0;
    }

    /**
     * @dev Number of (non-burned) tickets `user` holds for `videoHash`. Exposed for off-chain
     * tooling / debugging. Does not consider delisting (use hasAccessToVideo for gating).
     */
    function accessBalanceOf(address user, string memory videoHash) public view returns (uint256) {
        return _filmAccessCount[_filmKey(videoHash)][user];
    }

    /**
     * @dev Count of [BASIC, DELUXE, PRODUCER] tickets currently held by `user`. O(1), no scan.
     */
    function tierBalanceOf(address user)
        public
        view
        returns (uint256 basic, uint256 deluxe, uint256 producer)
    {
        return (_tierBalance[user][0], _tierBalance[user][1], _tierBalance[user][2]);
    }

    /**
     * @dev Earning multiplier (basis of 100 = 1.0x) based on the user's highest owned tier:
     * PRODUCER = 150 (1.5x), DELUXE = 125 (1.25x), otherwise 100 (1.0x). Used by SeederCredits.
     */
    function highestTierMultiplier(address user) public view returns (uint256) {
        if (_tierBalance[user][uint256(uint8(Tier.PRODUCER))] > 0) return 150;
        if (_tierBalance[user][uint256(uint8(Tier.DELUXE))] > 0) return 125;
        return 100;
    }

    // The following functions are overrides required by Solidity.
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721A)
        returns (string memory)
    {
        string memory uri = _tokenURIs[tokenId];
        if (bytes(uri).length == 0) {
            return super.tokenURI(tokenId); // fallback to ERC721A default (empty or base)
        }
        return uri;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721A)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
