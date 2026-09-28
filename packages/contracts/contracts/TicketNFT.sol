// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title TicketNFT
 * @author Decentralflix — Phase 2
 * @notice ERC721 movie tickets. Each film is registered once by the platform owner;
 * buyers mint single tickets by paying the film's exact price, which is forwarded
 * directly to the filmmaker. Tickets are transferable by default, but a film can be
 * flagged `soulbound` at registration to make its tickets non-transferable
 * (mint and burn still work). A ticket is single-use: `redeemTicket` burns it on
 * entry, after which `hasValidTicket` returns false.
 * @dev Utility/access tokens only. No investment contract, no promised returns.
 * Any mainnet deployment must be reviewed by licensed counsel first.
 */
contract TicketNFT is ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256;

    /// @notice Metadata for one registered film.
    struct Film {
        string title; // human-readable title
        uint256 priceWei; // exact mint price in wei (0 = free film)
        address filmmaker; // receives mint payments
        bool active; // false => minting disabled (redemption still works)
        bool soulbound; // true => tickets cannot be transferred
        string metadataURI; // base URI used to build tokenURI
        bool exists; // registration guard
    }

    // ── Errors ────────────────────────────────────────────────────────────
    error InvalidFilmId();
    error FilmAlreadyRegistered(uint256 filmId);
    error FilmNotFound(uint256 filmId);
    error FilmInactive(uint256 filmId);
    error EmptyTitle();
    error ZeroAddress();
    error IncorrectPayment(uint256 expected, uint256 received);
    error SoulboundTransferBlocked(uint256 tokenId);
    error NotTicketOwner(uint256 tokenId, address caller);
    error PaymentFailed();

    // ── Events ────────────────────────────────────────────────────────────
    event FilmRegistered(
        uint256 indexed filmId,
        string title,
        uint256 priceWei,
        address indexed filmmaker,
        bool soulbound
    );
    event FilmStatusChanged(uint256 indexed filmId, bool active);
    event FilmPriceUpdated(uint256 indexed filmId, uint256 oldPrice, uint256 newPrice);
    event TicketMinted(
        uint256 indexed tokenId,
        uint256 indexed filmId,
        address indexed buyer,
        uint256 pricePaid
    );
    event TicketRedeemed(uint256 indexed tokenId, uint256 indexed filmId, address indexed holder);

    uint256 private _nextTokenId = 1;

    mapping(uint256 => Film) private _films; // filmId => Film
    mapping(uint256 => uint256) private _ticketFilm; // tokenId => filmId
    mapping(uint256 => mapping(address => uint256)) private _validTickets; // filmId => holder => unredeemed count

    constructor() ERC721("Decentralflix Ticket", "DFLIX-TIX") Ownable(msg.sender) {}

    // ── Film registry (owner only) ────────────────────────────────────────

    /**
     * @notice Register a film so tickets can be minted for it.
     * @param filmId Platform-unique film identifier (must be non-zero and unused).
     * @param title Film title (non-empty).
     * @param priceWei Exact ticket price in wei (0 allowed for free films).
     * @param filmmaker Address that receives mint payments (non-zero).
     * @param soulbound If true, tickets for this film cannot be transferred.
     * @param metadataURI Base URI for token metadata (may be empty).
     */
    function registerFilm(
        uint256 filmId,
        string calldata title,
        uint256 priceWei,
        address filmmaker,
        bool soulbound,
        string calldata metadataURI
    ) external onlyOwner {
        if (filmId == 0) revert InvalidFilmId();
        if (_films[filmId].exists) revert FilmAlreadyRegistered(filmId);
        if (bytes(title).length == 0) revert EmptyTitle();
        if (filmmaker == address(0)) revert ZeroAddress();

        _films[filmId] = Film({
            title: title,
            priceWei: priceWei,
            filmmaker: filmmaker,
            active: true,
            soulbound: soulbound,
            metadataURI: metadataURI,
            exists: true
        });

        emit FilmRegistered(filmId, title, priceWei, filmmaker, soulbound);
    }

    /**
     * @notice Enable or disable minting for a film. Redemption of already-minted
     * tickets is unaffected.
     */
    function setFilmActive(uint256 filmId, bool active) external onlyOwner {
        Film storage film = _getFilmOrRevert(filmId);
        film.active = active;
        emit FilmStatusChanged(filmId, active);
    }

    /// @notice Update a film's ticket price. Does not affect already-minted tickets.
    function setFilmPrice(uint256 filmId, uint256 newPrice) external onlyOwner {
        Film storage film = _getFilmOrRevert(filmId);
        uint256 oldPrice = film.priceWei;
        film.priceWei = newPrice;
        emit FilmPriceUpdated(filmId, oldPrice, newPrice);
    }

    // ── Minting / redemption ──────────────────────────────────────────────

    /**
     * @notice Mint one ticket for `filmId`. Requires exact payment of the film's
     * current price; the full amount is forwarded to the filmmaker. No platform
     * fee is taken here.
     * @return tokenId The newly minted ticket's token ID.
     */
    function mintTicket(uint256 filmId) external payable nonReentrant returns (uint256 tokenId) {
        Film memory film = _getFilmOrRevert(filmId);
        if (!film.active) revert FilmInactive(filmId);
        if (msg.value != film.priceWei) revert IncorrectPayment(film.priceWei, msg.value);

        tokenId = _nextTokenId;
        _nextTokenId += 1;

        _ticketFilm[tokenId] = filmId;
        _validTickets[filmId][msg.sender] += 1;
        _safeMint(msg.sender, tokenId);

        emit TicketMinted(tokenId, filmId, msg.sender, msg.value);

        if (msg.value > 0) {
            (bool ok, ) = film.filmmaker.call{value: msg.value}("");
            if (!ok) revert PaymentFailed();
        }
    }

    /**
     * @notice Burn a ticket on entry. Only the ticket's current owner can redeem.
     * A redeemed ticket no longer counts toward `hasValidTicket`.
     */
    function redeemTicket(uint256 tokenId) external nonReentrant {
        address owner = _requireOwned(tokenId);
        if (owner != msg.sender) revert NotTicketOwner(tokenId, msg.sender);

        uint256 filmId = _ticketFilm[tokenId];
        _burn(tokenId);
        _validTickets[filmId][owner] -= 1;

        emit TicketRedeemed(tokenId, filmId, owner);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    /// @notice True if `holder` owns at least one unredeemed ticket for `filmId`.
    function hasValidTicket(address holder, uint256 filmId) external view returns (bool) {
        return _validTickets[filmId][holder] > 0;
    }

    /// @notice Number of unredeemed tickets `holder` owns for `filmId`.
    function validTicketCount(address holder, uint256 filmId) external view returns (uint256) {
        return _validTickets[filmId][holder];
    }

    /// @notice The film a ticket was minted for.
    function ticketFilm(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _ticketFilm[tokenId];
    }

    /// @notice Full metadata for a registered film. Reverts if unregistered.
    function getFilm(uint256 filmId) external view returns (Film memory) {
        return _getFilmOrRevert(filmId);
    }

    /// @notice Next token ID that will be minted (informational).
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    /**
     * @dev Builds `<metadataURI>/<tokenId>` when the film registered a base URI,
     * otherwise returns an empty string.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory base = _films[_ticketFilm[tokenId]].metadataURI;
        if (bytes(base).length == 0) return "";
        return string.concat(base, "/", tokenId.toString());
    }

    // ── Soulbound enforcement ─────────────────────────────────────────────

    /**
     * @dev Blocks transfers (not mints or burns) for films flagged soulbound.
     * @param to Recipient; `address(0)` on burn, `from` is `address(0)` on mint.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            uint256 filmId = _ticketFilm[tokenId];
            if (_films[filmId].soulbound) {
                revert SoulboundTransferBlocked(tokenId);
            }
            // Keep the per-holder valid-ticket counts in sync with transfers.
            address newOwner = super._update(to, tokenId, auth);
            _validTickets[filmId][from] -= 1;
            _validTickets[filmId][to] += 1;
            return newOwner;
        }
        return super._update(to, tokenId, auth);
    }

    function _getFilmOrRevert(uint256 filmId) internal view returns (Film storage) {
        Film storage film = _films[filmId];
        if (!film.exists) revert FilmNotFound(filmId);
        return film;
    }
}
