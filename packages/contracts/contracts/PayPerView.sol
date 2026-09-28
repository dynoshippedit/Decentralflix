// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PayPerView
 * @author Decentralflix — Phase 2
 * @notice One-time film purchases. Filmmakers register their own films and set
 * prices; buyers pay the EXACT price (under- or overpayment reverts — there are
 * no refunds and no partial credit) and receive permanent access. Revenue
 * accrues per film in the contract; the filmmaker withdraws it, at which point
 * a platform fee (basis points, owner-set, hard-capped at 25%) is split off to
 * the platform. Platform fees are withdrawn separately by the owner.
 * @dev Utility/access tokens only. No investment contract, no promised returns.
 * Any mainnet deployment must be reviewed by licensed counsel first.
 */
contract PayPerView is Ownable, ReentrancyGuard {
    /// @notice A purchasable film.
    struct Film {
        address filmmaker; // set at registration to msg.sender; receives revenue
        uint256 priceWei; // exact purchase price in wei (0 = free film)
        bool exists; // registration guard
    }

    /// @notice Hard cap on the platform fee: 2500 bps = 25%.
    uint256 public constant MAX_PLATFORM_FEE_BPS = 2500;

    // ── Errors ────────────────────────────────────────────────────────────
    error InvalidFilmId();
    error FilmAlreadyRegistered(uint256 filmId);
    error FilmNotFound(uint256 filmId);
    error NotFilmmaker(uint256 filmId, address caller);
    error IncorrectPayment(uint256 expected, uint256 received);
    error NoRevenue(uint256 filmId);
    error NoPlatformFees();
    error FeeTooHigh(uint256 requestedBps, uint256 maxBps);
    error TransferFailed();

    // ── Events ────────────────────────────────────────────────────────────
    event FilmRegistered(uint256 indexed filmId, address indexed filmmaker, uint256 priceWei);
    event FilmPriceUpdated(uint256 indexed filmId, uint256 oldPrice, uint256 newPrice);
    event AccessPurchased(uint256 indexed filmId, address indexed buyer, uint256 pricePaid);
    event RevenueWithdrawn(
        uint256 indexed filmId,
        address indexed filmmaker,
        uint256 filmmakerAmount,
        uint256 platformFee
    );
    event PlatformFeesWithdrawn(address indexed owner, uint256 amount);
    event PlatformFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    /// @notice Platform fee in basis points (10000 = 100%). Capped at 2500.
    uint256 public platformFeeBps;

    mapping(uint256 => Film) private _films; // filmId => Film
    mapping(uint256 => mapping(address => bool)) private _access; // filmId => buyer => permanent access
    mapping(uint256 => uint256) private _filmRevenue; // filmId => accrued wei awaiting withdrawal
    uint256 private _accruedPlatformFees; // wei of platform fees awaiting owner withdrawal

    constructor() Ownable(msg.sender) {}

    // ── Film registry (filmmakers) ────────────────────────────────────────

    /**
     * @notice Register a film for pay-per-view sale. The caller is recorded as
     * the filmmaker and is the only address that can update the price or
     * withdraw this film's revenue.
     * @param filmId Platform-unique film identifier (must be non-zero and unused).
     * @param priceWei Exact purchase price in wei (0 allowed for free films).
     */
    function registerFilm(uint256 filmId, uint256 priceWei) external {
        if (filmId == 0) revert InvalidFilmId();
        if (_films[filmId].exists) revert FilmAlreadyRegistered(filmId);

        _films[filmId] = Film({filmmaker: msg.sender, priceWei: priceWei, exists: true});

        emit FilmRegistered(filmId, msg.sender, priceWei);
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
     * Revenue accrues in the contract until the filmmaker withdraws it.
     */
    function buyAccess(uint256 filmId) external payable nonReentrant {
        Film memory film = _getFilmOrRevert(filmId);
        if (msg.value != film.priceWei) revert IncorrectPayment(film.priceWei, msg.value);

        _access[filmId][msg.sender] = true;
        _filmRevenue[filmId] += msg.value;

        emit AccessPurchased(filmId, msg.sender, msg.value);
    }

    // ── Withdrawals ───────────────────────────────────────────────────────

    /**
     * @notice Withdraw this film's accrued revenue to the filmmaker. The platform
     * fee (`platformFeeBps`) is split off and credited to the platform balance.
     * Only the film's filmmaker may call.
     */
    function withdrawRevenue(uint256 filmId) external nonReentrant {
        Film memory film = _getFilmOrRevert(filmId);
        if (film.filmmaker != msg.sender) revert NotFilmmaker(filmId, msg.sender);

        uint256 amount = _filmRevenue[filmId];
        if (amount == 0) revert NoRevenue(filmId);
        _filmRevenue[filmId] = 0;

        uint256 fee = (amount * platformFeeBps) / 10000;
        _accruedPlatformFees += fee;
        uint256 filmmakerAmount = amount - fee;

        (bool ok, ) = film.filmmaker.call{value: filmmakerAmount}("");
        if (!ok) revert TransferFailed();

        emit RevenueWithdrawn(filmId, film.filmmaker, filmmakerAmount, fee);
    }

    /// @notice Withdraw all accrued platform fees to the owner.
    function withdrawPlatformFees() external onlyOwner nonReentrant {
        uint256 amount = _accruedPlatformFees;
        if (amount == 0) revert NoPlatformFees();
        _accruedPlatformFees = 0;

        (bool ok, ) = owner().call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit PlatformFeesWithdrawn(owner(), amount);
    }

    /**
     * @notice Set the platform fee in basis points. Hard-capped at 2500 (25%).
     * Applies to revenue withdrawn after the change; already-withdrawn revenue
     * is unaffected.
     */
    function setPlatformFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_PLATFORM_FEE_BPS) {
            revert FeeTooHigh(newFeeBps, MAX_PLATFORM_FEE_BPS);
        }
        uint256 oldFeeBps = platformFeeBps;
        platformFeeBps = newFeeBps;
        emit PlatformFeeUpdated(oldFeeBps, newFeeBps);
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

    /// @notice Revenue accrued for `filmId` but not yet withdrawn by the filmmaker.
    function filmRevenue(uint256 filmId) external view returns (uint256) {
        return _filmRevenue[filmId];
    }

    /// @notice Platform fees accrued but not yet withdrawn by the owner.
    function accruedPlatformFees() external view returns (uint256) {
        return _accruedPlatformFees;
    }

    function _getFilmOrRevert(uint256 filmId) internal view returns (Film storage) {
        Film storage film = _films[filmId];
        if (!film.exists) revert FilmNotFound(filmId);
        return film;
    }
}
