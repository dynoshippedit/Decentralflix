import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const PLAN = 1n;
const PLAN2 = 2n;
const PRICE = ethers.parseEther("0.1");
const DURATION = 30 * 24 * 60 * 60; // 30 days

// MUS-001: the split is an immutable constant — 2500 bps = 25% platform,
// 75% (+ rounding remainder) to the plan creator.
const FEE_BPS = 2500n;
const DENOM = 10000n;
const feeOf = (amount: bigint) => (amount * FEE_BPS) / DENOM;
const creatorShareOf = (amount: bigint) => amount - feeOf(amount);

async function deployFixture() {
  const [owner, creator, user, user2, stranger] = await ethers.getSigners();
  const manager = await ethers.deployContract("SubscriptionManager", [], owner);
  await manager
    .connect(owner)
    .createPlan(PLAN, "Monthly", PRICE, DURATION, creator.address);
  return { manager, owner, creator, user, user2, stranger };
}

describe("SubscriptionManager", () => {
  describe("createPlan", () => {
    it("creates a plan with an immutable creator and emits PlanCreated", async () => {
      const { manager, owner, creator } = await loadFixture(deployFixture as any);
      await expect(
        manager.connect(owner).createPlan(PLAN2, "Yearly", PRICE * 10n, DURATION * 12, creator.address)
      )
        .to.emit(manager, "PlanCreated")
        .withArgs(PLAN2, "Yearly", PRICE * 10n, DURATION * 12, creator.address);

      const plan = await manager.getPlan(PLAN2);
      expect(plan.name).to.equal("Yearly");
      expect(plan.priceWei).to.equal(PRICE * 10n);
      expect(plan.durationSecs).to.equal(BigInt(DURATION * 12));
      expect(plan.creator).to.equal(creator.address);
      expect(plan.active).to.equal(true);
      expect(plan.exists).to.equal(true);
    });

    it("reverts on zero creator address (MissingCreator) — never falls back to owner", async () => {
      const { manager, owner } = await loadFixture(deployFixture as any);
      await expect(
        manager
          .connect(owner)
          .createPlan(PLAN2, "NoCreator", PRICE, DURATION, ethers.ZeroAddress)
      )
        .to.be.revertedWithCustomError(manager, "MissingCreator")
        .withArgs(PLAN2);
    });

    it("reverts for non-owner", async () => {
      const { manager, creator, stranger } = await loadFixture(deployFixture as any);
      await expect(
        manager.connect(stranger).createPlan(9n, "X", PRICE, DURATION, creator.address)
      )
        .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("reverts on duplicate planId", async () => {
      const { manager, owner, creator } = await loadFixture(deployFixture as any);
      await expect(
        manager.connect(owner).createPlan(PLAN, "Dup", PRICE, DURATION, creator.address)
      )
        .to.be.revertedWithCustomError(manager, "PlanAlreadyExists")
        .withArgs(PLAN);
    });

    it("reverts on empty name / zero price / zero duration", async () => {
      const { manager, owner, creator } = await loadFixture(deployFixture as any);
      await expect(
        manager.connect(owner).createPlan(9n, "", PRICE, DURATION, creator.address)
      ).to.be.revertedWithCustomError(manager, "EmptyName");
      await expect(
        manager.connect(owner).createPlan(9n, "X", 0n, DURATION, creator.address)
      ).to.be.revertedWithCustomError(manager, "ZeroPrice");
      await expect(
        manager.connect(owner).createPlan(9n, "X", PRICE, 0n, creator.address)
      ).to.be.revertedWithCustomError(manager, "ZeroDuration");
    });

    it("getPlan reverts for unknown plan", async () => {
      const { manager } = await loadFixture(deployFixture as any);
      await expect(manager.getPlan(999n))
        .to.be.revertedWithCustomError(manager, "PlanNotFound")
        .withArgs(999n);
    });
  });

  describe("immutable 75/25 split (MUS-001)", () => {
    it("PLATFORM_FEE_BPS is the 2500 constant", async () => {
      const { manager } = await loadFixture(deployFixture as any);
      expect(await manager.PLATFORM_FEE_BPS()).to.equal(2500n);
    });

    it("the owner cannot change the split — no fee setter exists", async () => {
      const { manager } = await loadFixture(deployFixture as any);
      for (const fn of ["setPlatformFeeBps", "setPlatformFee", "setFee", "updateFee"]) {
        expect(manager.interface.hasFunction(fn), fn).to.equal(false);
      }
    });

    it("the plan creator cannot be changed after creation — no creator setter exists", async () => {
      const { manager, creator } = await loadFixture(deployFixture as any);
      for (const fn of ["setCreator", "updateCreator", "setPlanCreator", "updatePlan"]) {
        expect(manager.interface.hasFunction(fn), fn).to.equal(false);
      }
      // The stored creator is the one set at creation.
      expect((await manager.getPlan(PLAN)).creator).to.equal(creator.address);
    });

    it("there is no withdraw function at all — nothing accrues in the contract", async () => {
      const { manager } = await loadFixture(deployFixture as any);
      expect((manager as unknown as Record<string, unknown>).withdraw).to.equal(undefined);
    });

    it("direct ETH transfers revert — no receive/fallback to trap funds", async () => {
      const { manager, owner } = await loadFixture(deployFixture as any);
      const addr = await manager.getAddress();
      await expect(owner.sendTransaction({ to: addr, value: 100n })).to.be.reverted;
    });
  });

  describe("subscribe splits 75/25 immediately", () => {
    it("sends exactly 75% to the creator and 25% to the owner, contract keeps 0", async () => {
      const { manager, owner, creator, user } = await loadFixture(deployFixture as any);
      const addr = await manager.getAddress();
      await expect(manager.connect(user).subscribe(PLAN, { value: PRICE })).to.changeEtherBalances(
        [user, creator, owner],
        [-PRICE, creatorShareOf(PRICE), feeOf(PRICE)]
      );
      expect(await ethers.provider.getBalance(addr)).to.equal(0n);
      expect(await manager.hasActiveSubscription(user.address)).to.equal(true);
    });

    it("emits Subscribed with the split amounts", async () => {
      const { manager, creator, user } = await loadFixture(deployFixture as any);
      const before = await time.latest();
      const expectedExpiry = BigInt(before + DURATION + 1);
      await expect(manager.connect(user).subscribe(PLAN, { value: PRICE }))
        .to.emit(manager, "Subscribed")
        .withArgs(
          user.address,
          PLAN,
          expectedExpiry,
          creator.address,
          creatorShareOf(PRICE),
          feeOf(PRICE)
        );
    });

    it("creator gets the rounding remainder on odd wei amounts", async () => {
      const { manager, owner, creator, user } = await loadFixture(deployFixture as any);
      // 7 wei: fee = floor(7 * 2500 / 10000) = 1, creator = 6. Never fee rounded up.
      await manager.connect(owner).createPlan(PLAN2, "Dust", 7n, DURATION, creator.address);
      await expect(manager.connect(user).subscribe(PLAN2, { value: 7n })).to.changeEtherBalances(
        [user, creator, owner],
        [-7n, 6n, 1n]
      );
      expect(6n + 1n).to.equal(7n);
    });

    it("creator takes the whole wei when the fee rounds to zero", async () => {
      const { manager, owner, creator, user } = await loadFixture(deployFixture as any);
      // 1 wei: fee = floor(2500/10000) = 0, creator = 1.
      await manager.connect(owner).createPlan(PLAN2, "Wei", 1n, DURATION, creator.address);
      await expect(manager.connect(user).subscribe(PLAN2, { value: 1n })).to.changeEtherBalances(
        [user, creator, owner],
        [-1n, 1n, 0n]
      );
    });

    it("reverts on underpayment and overpayment", async () => {
      const { manager, user } = await loadFixture(deployFixture as any);
      await expect(manager.connect(user).subscribe(PLAN, { value: PRICE - 1n }))
        .to.be.revertedWithCustomError(manager, "IncorrectPayment")
        .withArgs(PRICE, PRICE - 1n);
      await expect(manager.connect(user).subscribe(PLAN, { value: PRICE + 1n }))
        .to.be.revertedWithCustomError(manager, "IncorrectPayment")
        .withArgs(PRICE, PRICE + 1n);
    });

    it("reverts for unknown or inactive plan", async () => {
      const { manager, owner, user } = await loadFixture(deployFixture as any);
      await expect(manager.connect(user).subscribe(999n, { value: PRICE }))
        .to.be.revertedWithCustomError(manager, "PlanNotFound")
        .withArgs(999n);
      await manager.connect(owner).deactivatePlan(PLAN);
      await expect(manager.connect(user).subscribe(PLAN, { value: PRICE }))
        .to.be.revertedWithCustomError(manager, "PlanInactive")
        .withArgs(PLAN);
    });

    it("reverts when already subscribed", async () => {
      const { manager, user } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await expect(manager.connect(user).subscribe(PLAN, { value: PRICE }))
        .to.be.revertedWithCustomError(manager, "AlreadySubscribed")
        .withArgs(user.address);
    });

    it("allows subscribing again after expiry", async () => {
      const { manager, user } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await time.increase(DURATION + 1);
      expect(await manager.hasActiveSubscription(user.address)).to.equal(false);
      await expect(manager.connect(user).subscribe(PLAN, { value: PRICE })).to.emit(
        manager,
        "Subscribed"
      );
      expect(await manager.hasActiveSubscription(user.address)).to.equal(true);
    });
  });

  describe("renew splits 75/25 immediately", () => {
    it("extends expiry and splits the renewal payment", async () => {
      const { manager, creator, owner, user } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      const [, firstExpiry] = await manager.subscriptionOf(user.address);
      await expect(manager.connect(user).renew(PLAN, { value: PRICE }))
        .to.emit(manager, "Renewed")
        .withArgs(
          user.address,
          PLAN,
          firstExpiry + BigInt(DURATION),
          creator.address,
          creatorShareOf(PRICE),
          feeOf(PRICE)
        );
      const [, newExpiry] = await manager.subscriptionOf(user.address);
      expect(newExpiry).to.equal(firstExpiry + BigInt(DURATION));
    });

    it("sends the renewal 75/25 to creator/owner", async () => {
      const { manager, owner, creator, user } = await loadFixture(deployFixture as any);
      const addr = await manager.getAddress();
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await expect(manager.connect(user).renew(PLAN, { value: PRICE })).to.changeEtherBalances(
        [user, creator, owner],
        [-PRICE, creatorShareOf(PRICE), feeOf(PRICE)]
      );
      expect(await ethers.provider.getBalance(addr)).to.equal(0n);
    });

    it("reverts after expiry", async () => {
      const { manager, user } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await time.increase(DURATION + 1);
      await expect(manager.connect(user).renew(PLAN, { value: PRICE }))
        .to.be.revertedWithCustomError(manager, "SubscriptionNotActive")
        .withArgs(user.address);
    });

    it("reverts with no subscription at all", async () => {
      const { manager, stranger } = await loadFixture(deployFixture as any);
      await expect(manager.connect(stranger).renew(PLAN, { value: PRICE }))
        .to.be.revertedWithCustomError(manager, "SubscriptionNotActive")
        .withArgs(stranger.address);
    });

    it("reverts on plan mismatch", async () => {
      const { manager, owner, creator, user } = await loadFixture(deployFixture as any);
      await manager
        .connect(owner)
        .createPlan(PLAN2, "Yearly", PRICE * 10n, DURATION * 12, creator.address);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await expect(manager.connect(user).renew(PLAN2, { value: PRICE * 10n }))
        .to.be.revertedWithCustomError(manager, "PlanMismatch")
        .withArgs(PLAN, PLAN2);
    });

    it("reverts on wrong payment and on inactive plan", async () => {
      const { manager, owner, user } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await expect(manager.connect(user).renew(PLAN, { value: PRICE - 1n }))
        .to.be.revertedWithCustomError(manager, "IncorrectPayment")
        .withArgs(PRICE, PRICE - 1n);
      await manager.connect(owner).deactivatePlan(PLAN);
      await expect(manager.connect(user).renew(PLAN, { value: PRICE }))
        .to.be.revertedWithCustomError(manager, "PlanInactive")
        .withArgs(PLAN);
    });
  });

  describe("deactivatePlan", () => {
    it("deactivates and emits", async () => {
      const { manager, owner } = await loadFixture(deployFixture as any);
      await expect(manager.connect(owner).deactivatePlan(PLAN))
        .to.emit(manager, "PlanDeactivated")
        .withArgs(PLAN);
      expect((await manager.getPlan(PLAN)).active).to.equal(false);
    });

    it("reverts for non-owner and unknown plan", async () => {
      const { manager, owner, stranger } = await loadFixture(deployFixture as any);
      await expect(manager.connect(stranger).deactivatePlan(PLAN))
        .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
      await expect(manager.connect(owner).deactivatePlan(999n))
        .to.be.revertedWithCustomError(manager, "PlanNotFound")
        .withArgs(999n);
    });
  });

  describe("cancel", () => {
    it("ends the subscription immediately and emits Cancelled", async () => {
      const { manager, user } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await expect(manager.connect(user).cancel())
        .to.emit(manager, "Cancelled")
        .withArgs(user.address, PLAN);
      expect(await manager.hasActiveSubscription(user.address)).to.equal(false);
    });

    it("allows subscribing again after cancel", async () => {
      const { manager, user } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await manager.connect(user).cancel();
      await expect(manager.connect(user).subscribe(PLAN, { value: PRICE })).to.emit(
        manager,
        "Subscribed"
      );
    });

    it("reverts with no active subscription", async () => {
      const { manager, user, stranger } = await loadFixture(deployFixture as any);
      await expect(manager.connect(stranger).cancel())
        .to.be.revertedWithCustomError(manager, "NoSubscription")
        .withArgs(stranger.address);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await time.increase(DURATION + 1);
      await expect(manager.connect(user).cancel())
        .to.be.revertedWithCustomError(manager, "NoSubscription")
        .withArgs(user.address);
    });
  });

  describe("hasActiveSubscription", () => {
    it("is false for never-subscribed addresses", async () => {
      const { manager, stranger } = await loadFixture(deployFixture as any);
      expect(await manager.hasActiveSubscription(stranger.address)).to.equal(false);
    });

    it("tracks expiry across time", async () => {
      const { manager, user } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await time.increase(DURATION - 10);
      expect(await manager.hasActiveSubscription(user.address)).to.equal(true);
      await time.increase(11);
      expect(await manager.hasActiveSubscription(user.address)).to.equal(false);
    });
  });
});
