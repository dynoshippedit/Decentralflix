// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DFLIX
 * @author Decentralflix — Phase 2
 * @notice The Decentralflix ERC20 token ("Decentralflix", symbol DFLIX, 18 decimals).
 *
 * Capabilities:
 * - Capped minting: accounts with MINTER_ROLE (granted by the admin) can mint,
 *   but total supply can never exceed MAX_SUPPLY (1,000,000,000 DFLIX).
 * - Staking: holders stake DFLIX for a minimum lock period (7 days) and accrue
 *   rewards from a reward pool at an admin-set rate.
 * - Seed-to-earn: the owner/attestor allocates rewards to seeders against
 *   off-chain seeding reports (identified by reportHash, replay-protected);
 *   seeders claim through the same claimRewards() path.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  REWARDS ARE PROTOCOL MECHANICS — NOT PROMISED YIELD.
 *  Staking rewards and seed-to-earn allocations are variable, pool-limited,
 *  and paid ONLY from the funded reward pool. Nothing here is a promise of
 *  yield, interest, profit, or any return on any contribution. The reward
 *  rate can be changed or set to zero by the admin at any time, the pool can
 *  run dry, and unclaimed accruals are bounded by what the pool holds.
 *  ANY MAINNET DEPLOYMENT MUST BE REVIEWED BY LICENSED COUNSEL FIRST
 *  (securities/Howey analysis, money-transmitter, tax, and consumer-law
 *  implications). This contract is provided for development/testing.
 * ══════════════════════════════════════════════════════════════════════════
 */
contract DFLIX is ERC20, AccessControl, ReentrancyGuard {
    /// @notice Role allowed to mint new tokens (granted/revoked by the admin).
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Absolute mint cap: 1 billion DFLIX (18 decimals).
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;

    /// @notice Minimum time between a user's first stake and any unstake.
    uint256 public constant STAKE_LOCK_PERIOD = 7 days;

    /// @notice Staking reward rate: DFLIX per second per staked DFLIX, scaled by 1e18.
    /// E.g. 1e12 => 1e-6 DFLIX per staked DFLIX per second. Admin-settable, may be 0.
    uint256 public rewardPerTokenPerSecond;

    /// @notice DFLIX funded into the reward pool and not yet paid out.
    uint256 public rewardPool;

    /// @notice Address (besides the admin) allowed to allocate seed rewards.
    address public attestor;

    // Staking state
    mapping(address => uint256) public stakedBalance; // user => staked DFLIX
    mapping(address => uint256) public stakeLockStart; // user => first-stake timestamp
    mapping(address => uint256) private _rewardLastUpdate; // user => last accrual checkpoint
    mapping(address => uint256) private _accruedRewards; // user => checkpointed staking rewards

    // Seed-to-earn state
    mapping(address => uint256) public seedRewards; // seeder => allocated, unclaimed
    mapping(bytes32 => bool) public usedReportHashes; // reportHash => already allocated (replay guard)
    uint256 public allocatedSeedRewards; // total seed rewards allocated but not yet claimed

    // ── Errors ────────────────────────────────────────────────────────────
    error ExceedsMintCap(uint256 requested, uint256 maxSupply);
    error ZeroAmount();
    error ZeroAddress();
    error NotAuthorized(address caller);
    error InsufficientStake(uint256 requested, uint256 staked);
    error StakeLocked(uint256 unlockAt, uint256 nowTs);
    error NoRewardsToClaim(address user);
    error InsufficientRewardPool(uint256 needed, uint256 available);
    error DuplicateReport(bytes32 reportHash);

    // ── Events ────────────────────────────────────────────────────────────
    event RewardPoolFunded(address indexed funder, uint256 amount);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);
    event AttestorUpdated(address indexed oldAttestor, address indexed newAttestor);
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsClaimed(
        address indexed user,
        uint256 total,
        uint256 stakingPart,
        uint256 seedPart
    );
    event SeedRewardAllocated(
        address indexed seeder,
        uint256 amount,
        bytes32 indexed reportHash
    );

    constructor() ERC20("Decentralflix", "DFLIX") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        attestor = msg.sender;
    }

    modifier onlyAdminOrAttestor() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && msg.sender != attestor) {
            revert NotAuthorized(msg.sender);
        }
        _;
    }

    // ── Minting ───────────────────────────────────────────────────────────

    /**
     * @notice Mint new DFLIX. Only callable by MINTER_ROLE; reverts if the mint
     * would push total supply above MAX_SUPPLY.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (totalSupply() + amount > MAX_SUPPLY) {
            revert ExceedsMintCap(totalSupply() + amount, MAX_SUPPLY);
        }
        _mint(to, amount);
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    /// @notice Replace the attestor allowed to allocate seed rewards.
    function setAttestor(address newAttestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newAttestor == address(0)) revert ZeroAddress();
        address oldAttestor = attestor;
        attestor = newAttestor;
        emit AttestorUpdated(oldAttestor, newAttestor);
    }

    /**
     * @notice Set the staking reward rate (per-second, 1e18-scaled). May be set
     * to zero to stop new staking accrual (NOT a yield promise — see header).
     */
    function setRewardRate(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldRate = rewardPerTokenPerSecond;
        rewardPerTokenPerSecond = newRate;
        emit RewardRateUpdated(oldRate, newRate);
    }

    /**
     * @notice Fund the reward pool. Moves `amount` DFLIX from the admin's own
     * balance into the contract. No allowance is needed: the token contract
     * moves balances internally and the caller is explicitly depositing their
     * own tokens. Rewards can only ever be paid out of this pool.
     */
    function fundRewardPool(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount == 0) revert ZeroAmount();
        rewardPool += amount;
        _transfer(msg.sender, address(this), amount);
        emit RewardPoolFunded(msg.sender, amount);
    }

    // ── Seed-to-earn ──────────────────────────────────────────────────────

    /**
     * @notice Allocate seed-to-earn rewards to a seeder against an off-chain
     * seeding report. Replay-protected by `reportHash`, and the total allocated
     * seed rewards can never exceed the funded pool (best-effort guard —
     * staking accruals are not pre-reserved against the pool).
     * @dev The seeder claims via claimRewards(). This is a protocol mechanic,
     * NOT promised yield (see header notice).
     */
    function allocateSeedReward(
        address seeder,
        uint256 amount,
        bytes32 reportHash
    ) external onlyAdminOrAttestor {
        if (seeder == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (usedReportHashes[reportHash]) revert DuplicateReport(reportHash);
        if (allocatedSeedRewards + amount > rewardPool) {
            revert InsufficientRewardPool(allocatedSeedRewards + amount, rewardPool);
        }

        usedReportHashes[reportHash] = true;
        allocatedSeedRewards += amount;
        seedRewards[seeder] += amount;

        emit SeedRewardAllocated(seeder, amount, reportHash);
    }

    // ── Staking ──────────────────────────────────────────────────────────

    /**
     * @notice Stake DFLIX. Moves tokens from the caller's balance into the
     * contract (no allowance needed — the caller explicitly deposits their own
     * tokens). First stake starts the user's lock clock; further stakes do not
     * extend it.
     * @dev Accrues pending staking rewards up to this point before updating
     * the balance, so partial unstakes don't over-count.
     */
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _checkpoint(msg.sender);

        if (stakeLockStart[msg.sender] == 0) {
            stakeLockStart[msg.sender] = block.timestamp;
        }
        stakedBalance[msg.sender] += amount;

        _transfer(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Unstake DFLIX. Blocked until STAKE_LOCK_PERIOD has passed since
     * the user's first stake. Pending staking rewards stay claimable via
     * claimRewards().
     */
    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 staked = stakedBalance[msg.sender];
        if (amount > staked) revert InsufficientStake(amount, staked);

        uint256 unlockAt = stakeLockStart[msg.sender] + STAKE_LOCK_PERIOD;
        if (block.timestamp < unlockAt) revert StakeLocked(unlockAt, block.timestamp);

        _checkpoint(msg.sender);
        stakedBalance[msg.sender] = staked - amount;
        if (stakedBalance[msg.sender] == 0) {
            stakeLockStart[msg.sender] = 0;
        }

        _transfer(address(this), msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Claim all pending rewards (accrued staking rewards + allocated
     * seed rewards) in one transfer. Reverts when there is nothing to claim or
     * when the pool cannot cover the claim.
     * @dev Rewards are protocol mechanics, NOT promised yield — see header.
     */
    function claimRewards() external nonReentrant {
        _checkpoint(msg.sender);

        uint256 stakingPart = _accruedRewards[msg.sender];
        uint256 seedPart = seedRewards[msg.sender];
        uint256 total = stakingPart + seedPart;
        if (total == 0) revert NoRewardsToClaim(msg.sender);
        if (total > rewardPool) revert InsufficientRewardPool(total, rewardPool);

        _accruedRewards[msg.sender] = 0;
        seedRewards[msg.sender] = 0;
        allocatedSeedRewards -= seedPart;
        rewardPool -= total;

        _transfer(address(this), msg.sender, total);

        emit RewardsClaimed(msg.sender, total, stakingPart, seedPart);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    /**
     * @notice Pending rewards for `user`: checkpointed staking rewards plus
     * live accrual since the last checkpoint, plus unclaimed seed rewards.
     */
    function pendingRewards(address user)
        external
        view
        returns (
            uint256 stakingPart,
            uint256 seedPart,
            uint256 total
        )
    {
        stakingPart = _accruedRewards[user];
        uint256 staked = stakedBalance[user];
        if (staked > 0 && rewardPerTokenPerSecond > 0) {
            uint256 elapsed = block.timestamp - _rewardLastUpdate[user];
            stakingPart += (staked * rewardPerTokenPerSecond * elapsed) / 1e18;
        }
        seedPart = seedRewards[user];
        total = stakingPart + seedPart;
    }

    /// @notice Checkpointed (not live-accrued) staking rewards for `user`.
    function accruedRewards(address user) external view returns (uint256) {
        return _accruedRewards[user];
    }

    /// @notice Last accrual checkpoint timestamp for `user`.
    function rewardLastUpdate(address user) external view returns (uint256) {
        return _rewardLastUpdate[user];
    }

    // ── Internal ──────────────────────────────────────────────────────────

    /**
     * @dev Rolls live staking accrual into _accruedRewards[user] and stamps the
     * checkpoint time. Called before every stake/unstake/claim.
     */
    function _checkpoint(address user) internal {
        uint256 staked = stakedBalance[user];
        if (staked > 0 && rewardPerTokenPerSecond > 0) {
            uint256 elapsed = block.timestamp - _rewardLastUpdate[user];
            if (elapsed > 0) {
                _accruedRewards[user] += (staked * rewardPerTokenPerSecond * elapsed) / 1e18;
            }
        }
        _rewardLastUpdate[user] = block.timestamp;
    }
}
