// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RevenueSplitter.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PayPerView
 * @author Decentralflix — Phase 2
 * @notice One-time film purchases. The platform owner registers films, naming
 * the filmmaker explicitly (the filmId namespace is payment-bearing, so open
 * registration would let a front-runner claim any filmId and irreversibly
 * capture its revenue share); filmmakers set their own prices via
 * setFilmPrice. Buyers pay the EXACT price (under- or overpayment reverts —
 * there are no refunds and no partial credit) and receive permanent access.
 * @notice NON-CUSTODIAL SPLITTER: every purchase is split immediately through
 * the shared RevenueSplitter — 75% to the filmmaker, 25% to the platform
 * (owner). The split is an immutable constant; the owner cannot change it and
 * there is no owner-settable fee. No revenue accrues in the contract.
 * @dev Utility/access tokens only. No investment contract, no promised returns.
 * Any mainnet deployment must be reviewed by licensed counsel first.
 * NOTE: this contract is unaudited.
 */
contract PayPerView is RevenueSplitter, ReentrancyGuard {
    /// @notice A purchasable film.
    struct Film {
        address filmmaker; // named explicitly by the owner at registration; receives the 75% share
        uint256 priceWei; // exact purchase price in wei (0 = free film)
        bool exists; // registration guard
    }

    // ── Errors ────────────────────────────────────────────────────────────
    error InvalidFilmId();
    error ZeroAddress();
    error FilmAlreadyRegistered(uint256 filmId);
    error FilmNotFound(uint256 filmId);
    error NotFilmmaker(uint256 filmId, address caller);
    error IncorrectPayment(uint256 expected, uint256 received);

    // ── Events ────────────────────────────────────────────────────────────
    event FilmRegistered(uint256 indexed filmId, address indexed filmmaker, uint256 priceWei);
    event FilmPriceUpdated(uint256 indexed filmId, uint256 oldPrice, uint256 newPrice);
    event AccessPurchased(
        uint256 indexed filmId,
        address indexed buyer,
        uint256 pricePaid,
        address indexed filmmaker,
        uint256 filmmakerShare,
        uint256 platformFee
    );

    mapping(uint256 => Film) private _films; // filmId => Film
    mapping(uint256 => mapping(address => bool)) private _access; // filmId => buyer => permanent access

    constructor() Ownable(msg.sender) {}

    // ── Film registry (owner only) ────────────────────────────────────────

    /**
     * @notice Register a film for pay-per-view sale. Only the platform owner
     * may register: an open filmId namespace would let a front-runner claim
     * any filmId and irreversibly capture its 75% filmmaker revenue share
     * (F-3). The owner names the filmmaker explicitly; the filmmaker is the
     * only address that can update the price afterward, and the filmmaker
     * address can never be changed.
     * @param filmId Platform-unique film identifier (must be non-zero and unused).
     * @param priceWei Exact purchase price in wei (0 allowed for free films).
     * @param filmmaker Address receiving the 75% (+ rounding remainder) share (non-zero).
     */
    function registerFilm(uint256 filmId, uint256 priceWei, address filmmaker) external onlyOwner {
        if (filmId == 0) revert InvalidFilmId();
        if (_films[filmId].exists) revert FilmAlreadyRegistered(filmId);
        if (filmmaker == address(0)) revert ZeroAddress();

        _films[filmId] = Film({filmmaker: filmmaker, priceWei: priceWei, exists: true});

        emit FilmRegistered(filmId, filmmaker, priceWei);
    }

    /// @notice Update the purchase price. Only the film's filmmaker may call.
    function setFilmPrice(uint256 filmId, uint256 newPrice) external {
        Film storage film = _getFilmOrRevert(filmId);
        if (film.filmmaker != msg.sender) revert NotFilmmaker(filmId, msg.sender);

        uint256 oldPrice = film.priceWei;
        film.priceWei = newPrice;

        emit FilmPriceUpdated(filmId, oldPrice, newPrice);
    }

    // ── Purchase ──────────────────────────────────────────────────────────

    /**
     * @notice Buy permanent access to a film. Payment must equal the film's
     * current price EXACTLY — overpayment is not refunded, it reverts.
     * The payment is split immediately: 75% (+ rounding remainder) to the
     * filmmaker, 25% to the platform. Nothing accrues in the contract.
     */
    function buyAccess(uint256 filmId) external payable nonReentrant {
        Film memory film = _getFilmOrRevert(filmId);
        if (msg.value != film.priceWei) revert IncorrectPayment(film.priceWei, msg.value);

        _access[filmId][msg.sender] = true;

        (uint256 filmmakerShare, uint256 platformFee) = _splitRevenue(film.filmmaker);

        emit AccessPurchased(
            filmId,
            msg.sender,
            msg.value,
            film.filmmaker,
            filmmakerShare,
            platformFee
        );
    }

    // ── Views ─────────────────────────────────────────────────────────────

    /// @notice True if `user` has purchased permanent access to `filmId`.
    function hasAccess(address user, uint256 filmId) external view returns (bool) {
        return _access[filmId][user];
    }

    /// @notice Full metadata for a registered film. Reverts if unregistered.
    function getFilm(uint256 filmId) external view returns (Film memory) {
        return _getFilmOrRevert(filmId);
    }

    function _getFilmOrRevert(uint256 filmId) internal view returns (Film storage) {
        Film storage film = _films[filmId];
        if (!film.exists) revert FilmNotFound(filmId);
        return film;
    }
}
