import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const DAY = 24 * 60 * 60;
const LOCK = 7 * DAY;
const MAX_SUPPLY = 1_000_000_000n * 10n ** 18n;
const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const REPORT_1 = ethers.keccak256(ethers.toUtf8Bytes("report-1"));
const REPORT_2 = ethers.keccak256(ethers.toUtf8Bytes("report-2"));
// 1e12 => 1e-6 DFLIX per staked DFLIX per second => 100 staked for 1 day accrues 8.64 DFLIX
const RATE = 10n ** 12n;
const STAKE_AMT = ethers.parseEther("100");

async function deployFixture() {
  const [admin, minter, staker, seeder, stranger] = await ethers.getSigners();
  const dflix = await ethers.deployContract("DFLIX", [], admin);
  await dflix.connect(admin).grantRole(MINTER_ROLE, minter.address);
  return { dflix, admin, minter, staker, seeder, stranger };
}

async function mintTo(dflix: any, minter: any, user: any, amount: bigint) {
  // Note: stake() and fundRewardPool() move the caller's own tokens via
  // internal _transfer, so no ERC20 approval step is needed anywhere.
  await dflix.connect(minter).mint(user.address, amount);
}

describe("DFLIX", () => {
  describe("Deployment", () => {
    it("sets name, symbol, 18 decimals, max supply", async () => {
      const { dflix } = await loadFixture(deployFixture as any);
      expect(await dflix.name()).to.equal("Decentralflix");
      expect(await dflix.symbol()).to.equal("DFLIX");
      expect(await dflix.decimals()).to.equal(18n);
      expect(await dflix.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
      expect(await dflix.STAKE_LOCK_PERIOD()).to.equal(BigInt(LOCK));
    });

    it("gives the deployer the admin role and makes them initial attestor", async () => {
      const { dflix, admin } = await loadFixture(deployFixture as any);
      expect(await dflix.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
      expect(await dflix.attestor()).to.equal(admin.address);
      expect(await dflix.totalSupply()).to.equal(0n);
    });
  });

  describe("mint", () => {
    it("minter mints and emits Transfer", async () => {
      const { dflix, minter, staker } = await loadFixture(deployFixture as any);
      const amount = ethers.parseEther("1000");
      await expect(dflix.connect(minter).mint(staker.address, amount))
        .to.emit(dflix, "Transfer")
        .withArgs(ethers.ZeroAddress, staker.address, amount);
      expect(await dflix.balanceOf(staker.address)).to.equal(amount);
      expect(await dflix.totalSupply()).to.equal(amount);
    });

    it("reverts for non-minters", async () => {
      const { dflix, stranger } = await loadFixture(deployFixture as any);
      await expect(dflix.connect(stranger).mint(stranger.address, 1n))
        .to.be.revertedWithCustomError(dflix, "AccessControlUnauthorizedAccount")
        .withArgs(stranger.address, MINTER_ROLE);
    });

    it("enforces the mint cap, allowing mints up to exactly the cap", async () => {
      const { dflix, minter, staker } = await loadFixture(deployFixture as any);
      await dflix.connect(minter).mint(staker.address, MAX_SUPPLY);
      await expect(dflix.connect(minter).mint(staker.address, 1n))
        .to.be.revertedWithCustomError(dflix, "ExceedsMintCap")
        .withArgs(MAX_SUPPLY + 1n, MAX_SUPPLY);
    });

    it("reverts on zero amount and zero address", async () => {
      const { dflix, minter, staker } = await loadFixture(deployFixture as any);
      await expect(
        dflix.connect(minter).mint(staker.address, 0n)
      ).to.be.revertedWithCustomError(dflix, "ZeroAmount");
      await expect(
        dflix.connect(minter).mint(ethers.ZeroAddress, 1n)
      ).to.be.revertedWithCustomError(dflix, "ZeroAddress");
    });

    it("admin can grant and revoke the minter role", async () => {
      const { dflix, admin, stranger, staker } = await loadFixture(deployFixture as any);
      await dflix.connect(admin).grantRole(MINTER_ROLE, stranger.address);
      await dflix.connect(stranger).mint(staker.address, 10n);
      expect(await dflix.balanceOf(staker.address)).to.equal(10n);
      await dflix.connect(admin).revokeRole(MINTER_ROLE, stranger.address);
      await expect(dflix.connect(stranger).mint(staker.address, 10n))
        .to.be.revertedWithCustomError(dflix, "AccessControlUnauthorizedAccount")
        .withArgs(stranger.address, MINTER_ROLE);
    });

    it("non-admin cannot grant the minter role", async () => {
      const { dflix, stranger, staker } = await loadFixture(deployFixture as any);
      await expect(dflix.connect(stranger).grantRole(MINTER_ROLE, staker.address))
        .to.be.revertedWithCustomError(dflix, "AccessControlUnauthorizedAccount")
        .withArgs(stranger.address, DEFAULT_ADMIN_ROLE);
    });
  });

  describe("setAttestor / setRewardRate", () => {
    it("admin updates attestor and emits", async () => {
      const { dflix, admin, seeder } = await loadFixture(deployFixture as any);
      await expect(dflix.connect(admin).setAttestor(seeder.address))
        .to.emit(dflix, "AttestorUpdated")
        .withArgs(admin.address, seeder.address);
      expect(await dflix.attestor()).to.equal(seeder.address);
    });

    it("reverts attestor update for non-admin and zero address", async () => {
      const { dflix, admin, stranger } = await loadFixture(deployFixture as any);
      await expect(dflix.connect(stranger).setAttestor(stranger.address))
        .to.be.revertedWithCustomError(dflix, "AccessControlUnauthorizedAccount")
        .withArgs(stranger.address, DEFAULT_ADMIN_ROLE);
      await expect(
        dflix.connect(admin).setAttestor(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(dflix, "ZeroAddress");
    });

    it("admin updates reward rate and emits", async () => {
      const { dflix, admin } = await loadFixture(deployFixture as any);
      await expect(dflix.connect(admin).setRewardRate(RATE))
        .to.emit(dflix, "RewardRateUpdated")
        .withArgs(0n, RATE);
      expect(await dflix.rewardPerTokenPerSecond()).to.equal(RATE);
    });

    it("reverts reward-rate update for non-admin", async () => {
      const { dflix, stranger } = await loadFixture(deployFixture as any);
      await expect(dflix.connect(stranger).setRewardRate(RATE))
        .to.be.revertedWithCustomError(dflix, "AccessControlUnauthorizedAccount")
        .withArgs(stranger.address, DEFAULT_ADMIN_ROLE);
    });
  });

  describe("fundRewardPool", () => {
    it("admin funds the pool and emits", async () => {
      const { dflix, admin, minter } = await loadFixture(deployFixture as any);
      const amount = ethers.parseEther("1000000");
      await mintTo(dflix, minter, admin, amount);
      await expect(dflix.connect(admin).fundRewardPool(amount))
        .to.emit(dflix, "RewardPoolFunded")
        .withArgs(admin.address, amount);
      expect(await dflix.rewardPool()).to.equal(amount);
      expect(await dflix.balanceOf(await dflix.getAddress())).to.equal(amount);
    });

    it("reverts on zero amount and for non-admin", async () => {
      const { dflix, admin, stranger } = await loadFixture(deployFixture as any);
      await expect(
        dflix.connect(admin).fundRewardPool(0n)
      ).to.be.revertedWithCustomError(dflix, "ZeroAmount");
      await expect(dflix.connect(stranger).fundRewardPool(1n))
        .to.be.revertedWithCustomError(dflix, "AccessControlUnauthorizedAccount")
        .withArgs(stranger.address, DEFAULT_ADMIN_ROLE);
    });
  });

  describe("stake / unstake", () => {
    it("stakes, emits, and starts the lock clock", async () => {
      const { dflix, minter, staker } = await loadFixture(deployFixture as any);
      await mintTo(dflix, minter, staker, STAKE_AMT);
      await expect(dflix.connect(staker).stake(STAKE_AMT))
        .to.emit(dflix, "Staked")
        .withArgs(staker.address, STAKE_AMT);
      expect(await dflix.stakedBalance(staker.address)).to.equal(STAKE_AMT);
      expect(await dflix.stakeLockStart(staker.address)).to.be.greaterThan(0n);
      expect(await dflix.balanceOf(staker.address)).to.equal(0n);
    });

    it("reverts on zero stake and on insufficient balance", async () => {
      const { dflix, minter, staker } = await loadFixture(deployFixture as any);
      await expect(dflix.connect(staker).stake(0n)).to.be.revertedWithCustomError(
        dflix,
        "ZeroAmount"
      );
      const small = ethers.parseEther("10");
      await mintTo(dflix, minter, staker, small);
      await expect(dflix.connect(staker).stake(STAKE_AMT))
        .to.be.revertedWithCustomError(dflix, "ERC20InsufficientBalance")
        .withArgs(staker.address, small, STAKE_AMT);
    });

    it("blocks unstake before the lock period, allows it at the boundary", async () => {
      const { dflix, minter, staker } = await loadFixture(deployFixture as any);
      await mintTo(dflix, minter, staker, STAKE_AMT);
      await dflix.connect(staker).stake(STAKE_AMT);
      const lockStart = await dflix.stakeLockStart(staker.address);
      const unlockAt = lockStart + BigInt(LOCK);

      await time.increaseTo(Number(unlockAt) - 10);
      await expect(dflix.connect(staker).unstake(STAKE_AMT)).to.be.revertedWithCustomError(
        dflix,
        "StakeLocked"
      );

      await time.increaseTo(Number(unlockAt));
      await expect(dflix.connect(staker).unstake(STAKE_AMT)).to.emit(dflix, "Unstaked");
    });

    it("allows unstake after the lock period and emits", async () => {
      const { dflix, minter, staker } = await loadFixture(deployFixture as any);
      await mintTo(dflix, minter, staker, STAKE_AMT);
      await dflix.connect(staker).stake(STAKE_AMT);
      await time.increase(LOCK + 1);
      await expect(dflix.connect(staker).unstake(STAKE_AMT))
        .to.emit(dflix, "Unstaked")
        .withArgs(staker.address, STAKE_AMT);
      expect(await dflix.stakedBalance(staker.address)).to.equal(0n);
      expect(await dflix.balanceOf(staker.address)).to.equal(STAKE_AMT);
      expect(await dflix.stakeLockStart(staker.address)).to.equal(0n); // lock resets on full exit
    });

    it("supports partial unstake", async () => {
      const { dflix, minter, staker } = await loadFixture(deployFixture as any);
      await mintTo(dflix, minter, staker, STAKE_AMT);
      await dflix.connect(staker).stake(STAKE_AMT);
      await time.increase(LOCK + 1);
      const half = STAKE_AMT / 2n;
      await dflix.connect(staker).unstake(half);
      expect(await dflix.stakedBalance(staker.address)).to.equal(STAKE_AMT - half);
      expect(await dflix.balanceOf(staker.address)).to.equal(half);
    });

    it("reverts unstake of zero or more than staked", async () => {
      const { dflix, minter, staker } = await loadFixture(deployFixture as any);
      await mintTo(dflix, minter, staker, STAKE_AMT);
      await dflix.connect(staker).stake(STAKE_AMT);
      await time.increase(LOCK + 1);
      await expect(dflix.connect(staker).unstake(0n)).to.be.revertedWithCustomError(
        dflix,
        "ZeroAmount"
      );
      await expect(dflix.connect(staker).unstake(STAKE_AMT + 1n))
        .to.be.revertedWithCustomError(dflix, "InsufficientStake")
        .withArgs(STAKE_AMT + 1n, STAKE_AMT);
    });
  });

  describe("staking rewards", () => {
    async function fundedFixture() {
      const f = await deployFixture();
      await mintTo(f.dflix, f.minter, f.admin, ethers.parseEther("1000000"));
      await f.dflix.connect(f.admin).fundRewardPool(ethers.parseEther("1000000"));
      await f.dflix.connect(f.admin).setRewardRate(RATE);
      await mintTo(f.dflix, f.minter, f.staker, STAKE_AMT);
      return f;
    }

    it("accrues time-weighted rewards and pays them via claimRewards", async () => {
      const { dflix, staker } = await loadFixture(fundedFixture as any);
      await dflix.connect(staker).stake(STAKE_AMT);
      await time.increase(DAY);

      const [stakingPart, seedPart, total] = await dflix.pendingRewards(staker.address);
      const expected = (STAKE_AMT * RATE * BigInt(DAY)) / 10n ** 18n;
      expect(stakingPart).to.be.closeTo(expected, ethers.parseEther("0.01"));
      expect(seedPart).to.equal(0n);
      expect(total).to.equal(stakingPart);

      // The claim tx mines one block after the view, accruing ~1 extra second,
      // so assert payout approximately and pool accounting exactly.
      const poolBefore = await dflix.rewardPool();
      await expect(dflix.connect(staker).claimRewards()).to.emit(dflix, "RewardsClaimed");
      const paid = await dflix.balanceOf(staker.address);
      expect(paid).to.be.closeTo(total, ethers.parseEther("0.01"));
      expect(await dflix.rewardPool()).to.equal(poolBefore - paid);
      const [, , totalAfter] = await dflix.pendingRewards(staker.address);
      expect(totalAfter).to.be.lessThan(ethers.parseEther("0.000001"));
    });

    it("reverts double claim and claim with no rewards", async () => {
      const { dflix, staker, stranger } = await loadFixture(fundedFixture as any);
      await dflix.connect(staker).stake(STAKE_AMT);
      await time.increase(DAY);
      await dflix.connect(staker).claimRewards(); // pays day-1 accrual
      await time.increase(LOCK);
      await dflix.connect(staker).unstake(STAKE_AMT); // checkpoints the interim dust
      await dflix.connect(staker).claimRewards(); // pays the dust; now truly nothing left
      await expect(dflix.connect(staker).claimRewards())
        .to.be.revertedWithCustomError(dflix, "NoRewardsToClaim")
        .withArgs(staker.address);
      await expect(dflix.connect(stranger).claimRewards())
        .to.be.revertedWithCustomError(dflix, "NoRewardsToClaim")
        .withArgs(stranger.address);
    });

    it("accrues nothing when the reward rate is zero", async () => {
      const { dflix, admin, staker } = await loadFixture(fundedFixture as any);
      await dflix.connect(admin).setRewardRate(0n);
      await dflix.connect(staker).stake(STAKE_AMT);
      await time.increase(DAY);
      const [, , total] = await dflix.pendingRewards(staker.address);
      expect(total).to.equal(0n);
      await expect(dflix.connect(staker).claimRewards()).to.be.revertedWithCustomError(
        dflix,
        "NoRewardsToClaim"
      );
    });

    it("checkpoints correctly across partial unstake (no over-count)", async () => {
      const { dflix, staker } = await loadFixture(fundedFixture as any);
      await dflix.connect(staker).stake(STAKE_AMT);
      await time.increase(DAY);
      await time.increase(LOCK); // clear the lock
      await dflix.connect(staker).unstake(STAKE_AMT / 2n);
      await time.increase(DAY);
      const [stakingPart] = await dflix.pendingRewards(staker.address);
      // day 1 at full stake + day 2 at half stake (+ lock-wait days at full stake)
      const full = STAKE_AMT;
      const half = STAKE_AMT / 2n;
      const expected =
        ((full * RATE * BigInt(DAY + LOCK)) / 10n ** 18n + (half * RATE * BigInt(DAY)) / 10n ** 18n);
      expect(stakingPart).to.be.closeTo(expected, ethers.parseEther("0.05"));
    });
  });

  describe("seed-to-earn", () => {
    async function fundedFixture() {
      const f = await deployFixture();
      await mintTo(f.dflix, f.minter, f.admin, ethers.parseEther("1000000"));
      await f.dflix.connect(f.admin).fundRewardPool(ethers.parseEther("1000000"));
      return f;
    }

    it("attestor allocates, seeder claims, emits SeedRewardAllocated", async () => {
      const { dflix, admin, seeder } = await loadFixture(fundedFixture as any);
      const amount = ethers.parseEther("50");
      await expect(dflix.connect(admin).allocateSeedReward(seeder.address, amount, REPORT_1))
        .to.emit(dflix, "SeedRewardAllocated")
        .withArgs(seeder.address, amount, REPORT_1);
      expect(await dflix.seedRewards(seeder.address)).to.equal(amount);
      expect(await dflix.usedReportHashes(REPORT_1)).to.equal(true);

      await expect(dflix.connect(seeder).claimRewards())
        .to.emit(dflix, "RewardsClaimed")
        .withArgs(seeder.address, amount, 0n, amount);
      expect(await dflix.balanceOf(seeder.address)).to.equal(amount);
      expect(await dflix.seedRewards(seeder.address)).to.equal(0n);
    });

    it("a delegated attestor (non-admin) can allocate", async () => {
      const { dflix, admin, seeder, stranger } = await loadFixture(fundedFixture as any);
      await dflix.connect(admin).setAttestor(stranger.address);
      await dflix
        .connect(stranger)
        .allocateSeedReward(seeder.address, ethers.parseEther("10"), REPORT_1);
      expect(await dflix.seedRewards(seeder.address)).to.equal(ethers.parseEther("10"));
    });

    it("reverts for unauthorized callers", async () => {
      const { dflix, seeder, stranger } = await loadFixture(fundedFixture as any);
      await expect(
        dflix.connect(stranger).allocateSeedReward(seeder.address, 1n, REPORT_1)
      )
        .to.be.revertedWithCustomError(dflix, "NotAuthorized")
        .withArgs(stranger.address);
    });

    it("reverts on duplicate report hash (replay protection)", async () => {
      const { dflix, admin, seeder } = await loadFixture(fundedFixture as any);
      await dflix.connect(admin).allocateSeedReward(seeder.address, 1n, REPORT_1);
      await expect(dflix.connect(admin).allocateSeedReward(seeder.address, 1n, REPORT_1))
        .to.be.revertedWithCustomError(dflix, "DuplicateReport")
        .withArgs(REPORT_1);
      // a different hash for the same seeder is fine
      await dflix.connect(admin).allocateSeedReward(seeder.address, 1n, REPORT_2);
      expect(await dflix.seedRewards(seeder.address)).to.equal(2n);
    });

    it("reverts on zero amount, zero seeder, and over-pool allocation", async () => {
      const { dflix, admin, seeder } = await loadFixture(fundedFixture as any);
      await expect(
        dflix.connect(admin).allocateSeedReward(seeder.address, 0n, REPORT_1)
      ).to.be.revertedWithCustomError(dflix, "ZeroAmount");
      await expect(
        dflix.connect(admin).allocateSeedReward(ethers.ZeroAddress, 1n, REPORT_1)
      ).to.be.revertedWithCustomError(dflix, "ZeroAddress");
      const pool = await dflix.rewardPool();
      await expect(
        dflix.connect(admin).allocateSeedReward(seeder.address, pool + 1n, REPORT_1)
      )
        .to.be.revertedWithCustomError(dflix, "InsufficientRewardPool")
        .withArgs(pool + 1n, pool);
    });

    it("claimRewards pays staking + seed parts together", async () => {
      const { dflix, admin, minter, staker } = await loadFixture(fundedFixture as any);
      await dflix.connect(admin).setRewardRate(RATE);
      await mintTo(dflix, minter, staker, STAKE_AMT);
      await dflix.connect(staker).stake(STAKE_AMT);
      const seedAmt = ethers.parseEther("25");
      await dflix.connect(admin).allocateSeedReward(staker.address, seedAmt, REPORT_1);
      await time.increase(DAY);

      const [stakingPart, seedPart, total] = await dflix.pendingRewards(staker.address);
      expect(seedPart).to.equal(seedAmt);
      expect(total).to.equal(stakingPart + seedAmt);

      // Claim block adds ~1s of staking accrual vs the view; assert loosely.
      await expect(dflix.connect(staker).claimRewards()).to.emit(dflix, "RewardsClaimed");
      const paid = await dflix.balanceOf(staker.address);
      expect(paid).to.be.closeTo(total, ethers.parseEther("0.01"));
      expect(await dflix.seedRewards(staker.address)).to.equal(0n);
      expect(await dflix.allocatedSeedRewards()).to.equal(0n);
    });
  });
});
