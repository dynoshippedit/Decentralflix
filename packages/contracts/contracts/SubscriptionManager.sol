// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SubscriptionManager
 * @author Decentralflix — Phase 2
 * @notice Time-based recurring access passes. The owner creates plans
 * (name, price, duration, creator); users subscribe with exact payment, renew
 * an active subscription to extend it, or cancel to end it immediately (no
 * refunds).
 * @notice NON-CUSTODIAL SPLITTER: every payment is split immediately — 75% to
 * the plan's creator, 25% to the platform (owner). The split is an immutable
 * constant (PLATFORM_FEE_BPS); the owner cannot change it, and the plan
 * creator cannot be changed after creation, so funds can never be redirected.
 * No subscription balance accrues in the contract.
 * @dev Utility/access tokens only. No investment contract, no promised returns.
 * Any mainnet deployment must be reviewed by licensed counsel first.
 * NOTE: this contract is unaudited.
 */
contract SubscriptionManager is Ownable, ReentrancyGuard {
    /// @notice A purchasable access plan.
    struct Plan {
        string name; // plan display name
        uint256 priceWei; // exact subscription/renewal price in wei
        uint256 durationSecs; // how long one purchase lasts
        address creator; // set once at creation; receives the 75% creator share. Immutable.
        bool active; // false => new subscriptions/renewals blocked
        bool exists; // creation guard
    }

    /// @notice One user's current subscription state.
    struct Subscription {
        uint256 planId; // plan the subscription is on
        uint256 expiresAt; // unix timestamp; active while > block.timestamp
    }

    /// @notice Platform fee in basis points — IMMUTABLE. 2500 bps = 25%.
    /// The creator always receives 75% plus the rounding remainder.
    /// Defined once, here; there is no setter by design.
    uint256 public constant PLATFORM_FEE_BPS = 2500;

    /// @notice Basis-points denominator (10000 = 100%).
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ── Errors ────────────────────────────────────────────────────────────
    error PlanAlreadyExists(uint256 planId);
    error PlanNotFound(uint256 planId);
    error PlanInactive(uint256 planId);
    error EmptyName();
    error ZeroPrice();
    error ZeroDuration();
    error MissingCreator(uint256 planId);
    error IncorrectPayment(uint256 expected, uint256 received);
    error AlreadySubscribed(address holder);
    error SubscriptionNotActive(address holder);
    error PlanMismatch(uint256 currentPlanId, uint256 requestedPlanId);
    error NoSubscription(address holder);
    error TransferFailed();

    // ── Events ────────────────────────────────────────────────────────────
    event PlanCreated(
        uint256 indexed planId,
        string name,
        uint256 priceWei,
        uint256 durationSecs,
        address indexed creator
    );
    event PlanDeactivated(uint256 indexed planId);
    event Subscribed(
        address indexed holder,
        uint256 indexed planId,
        uint256 expiresAt,
        address indexed creator,
        uint256 creatorShare,
        uint256 platformFee
    );
    event Renewed(
        address indexed holder,
        uint256 indexed planId,
        uint256 newExpiresAt,
        address indexed creator,
        uint256 creatorShare,
        uint256 platformFee
    );
    event Cancelled(address indexed holder, uint256 indexed planId);

    mapping(uint256 => Plan) private _plans; // planId => Plan
    mapping(address => Subscription) private _subscriptions; // holder => Subscription

    constructor() Ownable(msg.sender) {}

    // ── Plan management (owner only) ──────────────────────────────────────

    /**
     * @notice Create a subscription plan. The creator address is set ONCE here
     * and can never be changed — the owner cannot redirect the creator's share
     * later. Reverts if the creator is the zero address.
     * @param planId Platform-unique plan identifier (must be unused).
     * @param name Plan display name (non-empty).
     * @param priceWei Exact price per subscription period in wei (must be > 0).
     * @param durationSecs Length of one subscription period in seconds (must be > 0).
     * @param creator Address receiving the 75% creator share of every payment.
     */
    function createPlan(
        uint256 planId,
        string calldata name,
        uint256 priceWei,
        uint256 durationSecs,
        address creator
    ) external onlyOwner {
        if (_plans[planId].exists) revert PlanAlreadyExists(planId);
        if (bytes(name).length == 0) revert EmptyName();
        if (priceWei == 0) revert ZeroPrice();
        if (durationSecs == 0) revert ZeroDuration();
        if (creator == address(0)) revert MissingCreator(planId);

        _plans[planId] = Plan({
            name: name,
            priceWei: priceWei,
            durationSecs: durationSecs,
            creator: creator,
            active: true,
            exists: true
        });

        emit PlanCreated(planId, name, priceWei, durationSecs, creator);
    }

    /**
     * @notice Deactivate a plan. Existing active subscriptions keep working until
     * they expire, but new subscriptions and renewals are blocked.
     * @dev Deactivation moves no funds and cannot redirect them.
     */
    function deactivatePlan(uint256 planId) external onlyOwner {
        Plan storage plan = _getPlanOrRevert(planId);
        plan.active = false;
        emit PlanDeactivated(planId);
    }

    // ── Subscriptions ─────────────────────────────────────────────────────

    /**
     * @notice Start a subscription. Requires no currently active subscription
     * (cancel or let it expire first) and exact payment of the plan price.
     * The payment is split immediately: 25% to the platform, 75% (+ rounding
     * remainder) to the plan's creator.
     */
    function subscribe(uint256 planId) external payable nonReentrant {
        Plan memory plan = _getPlanOrRevert(planId);
        if (!plan.active) revert PlanInactive(planId);
        if (hasActiveSubscription(msg.sender)) revert AlreadySubscribed(msg.sender);
        if (msg.value != plan.priceWei) revert IncorrectPayment(plan.priceWei, msg.value);

        uint256 expiresAt = block.timestamp + plan.durationSecs;
        _subscriptions[msg.sender] = Subscription({planId: planId, expiresAt: expiresAt});

        (uint256 creatorShare, uint256 platformFee) = _splitPayment(planId, plan);

        emit Subscribed(msg.sender, planId, expiresAt, plan.creator, creatorShare, platformFee);
    }

    /**
     * @notice Extend an active subscription by one plan period. Must be called
     * while the subscription is still active and for the same plan the
     * subscription is on. The payment is split immediately, as in subscribe().
     */
    function renew(uint256 planId) external payable nonReentrant {
        Subscription storage sub = _subscriptions[msg.sender];
        if (sub.expiresAt <= block.timestamp) revert SubscriptionNotActive(msg.sender);
        if (sub.planId != planId) revert PlanMismatch(sub.planId, planId);

        Plan memory plan = _getPlanOrRevert(planId);
        if (!plan.active) revert PlanInactive(planId);
        if (msg.value != plan.priceWei) revert IncorrectPayment(plan.priceWei, msg.value);

        sub.expiresAt += plan.durationSecs;

        (uint256 creatorShare, uint256 platformFee) = _splitPayment(planId, plan);

        emit Renewed(msg.sender, planId, sub.expiresAt, plan.creator, creatorShare, platformFee);
    }

    /**
     * @notice End the caller's subscription immediately. No refund is issued;
     * already-paid time is forfeited.
     */
    function cancel() external {
        if (!hasActiveSubscription(msg.sender)) revert NoSubscription(msg.sender);
        uint256 planId = _subscriptions[msg.sender].planId;
        _subscriptions[msg.sender].expiresAt = block.timestamp;
        emit Cancelled(msg.sender, planId);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    /// @notice True if `holder` has a subscription with `expiresAt > block.timestamp`.
    function hasActiveSubscription(address holder) public view returns (bool) {
        return _subscriptions[holder].expiresAt > block.timestamp;
    }

    /// @notice Returns the plan ID and expiry timestamp of `holder`'s subscription.
    function subscriptionOf(address holder)
        external
        view
        returns (uint256 planId, uint256 expiresAt)
    {
        Subscription memory sub = _subscriptions[holder];
        return (sub.planId, sub.expiresAt);
    }

    /// @notice Full metadata for a plan. Reverts if the plan does not exist.
    function getPlan(uint256 planId) external view returns (Plan memory) {
        return _getPlanOrRevert(planId);
    }

    /**
     * @notice Split msg.value 75/25 between the plan's creator and the platform.
     * The platform fee is computed with floor division; the creator receives
     * `msg.value - fee`, so the rounding remainder always favors the creator.
     * Reverts if the plan has no creator — the creator's share is NEVER
     * redirected to the owner.
     * @return creatorShare wei sent to the plan's creator.
     * @return platformFee wei sent to the platform (owner).
     */
    function _splitPayment(uint256 planId, Plan memory plan)
        internal
        returns (uint256 creatorShare, uint256 platformFee)
    {
        address creator = plan.creator;
        if (creator == address(0)) revert MissingCreator(planId);

        platformFee = (msg.value * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        creatorShare = msg.value - platformFee;

        (bool okFee, ) = owner().call{value: platformFee}("");
        if (!okFee) revert TransferFailed();
        (bool okCreator, ) = creator.call{value: creatorShare}("");
        if (!okCreator) revert TransferFailed();
    }

    function _getPlanOrRevert(uint256 planId) internal view returns (Plan storage) {
        Plan storage plan = _plans[planId];
        if (!plan.exists) revert PlanNotFound(planId);
        return plan;
    }
}
