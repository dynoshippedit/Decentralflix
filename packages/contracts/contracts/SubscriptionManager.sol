// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SubscriptionManager
 * @author Decentralflix — Phase 2
 * @notice Time-based recurring access passes. The owner creates plans
 * (name, price, duration); users subscribe with exact payment, renew an active
 * subscription to extend it, or cancel to end it immediately (no refunds).
 * All payments accumulate in the contract; only the owner can withdraw.
 * @dev Utility/access tokens only. No investment contract, no promised returns.
 * Any mainnet deployment must be reviewed by licensed counsel first.
 */
contract SubscriptionManager is Ownable, ReentrancyGuard {
    /// @notice A purchasable access plan.
    struct Plan {
        string name; // plan display name
        uint256 priceWei; // exact subscription/renewal price in wei
        uint256 durationSecs; // how long one purchase lasts
        bool active; // false => new subscriptions/renewals blocked
        bool exists; // creation guard
    }

    /// @notice One user's current subscription state.
    struct Subscription {
        uint256 planId; // plan the subscription is on
        uint256 expiresAt; // unix timestamp; active while > block.timestamp
    }

    // ── Errors ────────────────────────────────────────────────────────────
    error PlanAlreadyExists(uint256 planId);
    error PlanNotFound(uint256 planId);
    error PlanInactive(uint256 planId);
    error EmptyName();
    error ZeroPrice();
    error ZeroDuration();
    error IncorrectPayment(uint256 expected, uint256 received);
    error AlreadySubscribed(address holder);
    error SubscriptionNotActive(address holder);
    error PlanMismatch(uint256 currentPlanId, uint256 requestedPlanId);
    error NoSubscription(address holder);
    error NoFundsToWithdraw();
    error WithdrawFailed();

    // ── Events ────────────────────────────────────────────────────────────
    event PlanCreated(uint256 indexed planId, string name, uint256 priceWei, uint256 durationSecs);
    event PlanDeactivated(uint256 indexed planId);
    event Subscribed(address indexed holder, uint256 indexed planId, uint256 expiresAt);
    event Renewed(address indexed holder, uint256 indexed planId, uint256 newExpiresAt);
    event Cancelled(address indexed holder, uint256 indexed planId);
    event Withdrawn(address indexed owner, uint256 amount);

    mapping(uint256 => Plan) private _plans; // planId => Plan
    mapping(address => Subscription) private _subscriptions; // holder => Subscription

    constructor() Ownable(msg.sender) {}

    // ── Plan management (owner only) ──────────────────────────────────────

    /**
     * @notice Create a subscription plan.
     * @param planId Platform-unique plan identifier (must be unused).
     * @param name Plan display name (non-empty).
     * @param priceWei Exact price per subscription period in wei (must be > 0).
     * @param durationSecs Length of one subscription period in seconds (must be > 0).
     */
    function createPlan(
        uint256 planId,
        string calldata name,
        uint256 priceWei,
        uint256 durationSecs
    ) external onlyOwner {
        if (_plans[planId].exists) revert PlanAlreadyExists(planId);
        if (bytes(name).length == 0) revert EmptyName();
        if (priceWei == 0) revert ZeroPrice();
        if (durationSecs == 0) revert ZeroDuration();

        _plans[planId] = Plan({
            name: name,
            priceWei: priceWei,
            durationSecs: durationSecs,
            active: true,
            exists: true
        });

        emit PlanCreated(planId, name, priceWei, durationSecs);
    }

    /**
     * @notice Deactivate a plan. Existing active subscriptions keep working until
     * they expire, but new subscriptions and renewals are blocked.
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
     */
    function subscribe(uint256 planId) external payable nonReentrant {
        Plan memory plan = _getPlanOrRevert(planId);
        if (!plan.active) revert PlanInactive(planId);
        if (hasActiveSubscription(msg.sender)) revert AlreadySubscribed(msg.sender);
        if (msg.value != plan.priceWei) revert IncorrectPayment(plan.priceWei, msg.value);

        uint256 expiresAt = block.timestamp + plan.durationSecs;
        _subscriptions[msg.sender] = Subscription({planId: planId, expiresAt: expiresAt});

        emit Subscribed(msg.sender, planId, expiresAt);
    }

    /**
     * @notice Extend an active subscription by one plan period. Must be called
     * while the subscription is still active and for the same plan the
     * subscription is on.
     */
    function renew(uint256 planId) external payable nonReentrant {
        Subscription storage sub = _subscriptions[msg.sender];
        if (sub.expiresAt <= block.timestamp) revert SubscriptionNotActive(msg.sender);
        if (sub.planId != planId) revert PlanMismatch(sub.planId, planId);

        Plan memory plan = _getPlanOrRevert(planId);
        if (!plan.active) revert PlanInactive(planId);
        if (msg.value != plan.priceWei) revert IncorrectPayment(plan.priceWei, msg.value);

        sub.expiresAt += plan.durationSecs;

        emit Renewed(msg.sender, planId, sub.expiresAt);
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

    /// @notice Withdraw all accumulated subscription revenue to the owner.
    function withdraw() external onlyOwner nonReentrant {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NoFundsToWithdraw();
        (bool ok, ) = owner().call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(owner(), amount);
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

    function _getPlanOrRevert(uint256 planId) internal view returns (Plan storage) {
        Plan storage plan = _plans[planId];
        if (!plan.exists) revert PlanNotFound(planId);
        return plan;
    }
}
