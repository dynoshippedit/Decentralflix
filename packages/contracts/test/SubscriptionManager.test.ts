import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const PLAN = 1n;
const PLAN2 = 2n;
const PRICE = ethers.parseEther("0.1");
const DURATION = 30 * 24 * 60 * 60; // 30 days

async function deployFixture() {
  const [owner, user, user2, stranger] = await ethers.getSigners();
  const manager = await ethers.deployContract("SubscriptionManager", [], owner);
  await manager.connect(owner).createPlan(PLAN, "Monthly", PRICE, DURATION);
  return { manager, owner, user, user2, stranger };
}

describe("SubscriptionManager", () => {
  describe("createPlan", () => {
    it("creates a plan and emits PlanCreated", async () => {
      const { manager, owner } = await loadFixture(deployFixture as any);
      await expect(manager.connect(owner).createPlan(PLAN2, "Yearly", PRICE * 10n, DURATION * 12))
        .to.emit(manager, "PlanCreated")
        .withArgs(PLAN2, "Yearly", PRICE * 10n, DURATION * 12);

      const plan = await manager.getPlan(PLAN2);
      expect(plan.name).to.equal("Yearly");
      expect(plan.priceWei).to.equal(PRICE * 10n);
      expect(plan.durationSecs).to.equal(BigInt(DURATION * 12));
      expect(plan.active).to.equal(true);
      expect(plan.exists).to.equal(true);
    });

    it("reverts for non-owner", async () => {
      const { manager, stranger } = await loadFixture(deployFixture as any);
      await expect(manager.connect(stranger).createPlan(9n, "X", PRICE, DURATION))
        .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("reverts on duplicate planId", async () => {
      const { manager, owner } = await loadFixture(deployFixture as any);
      await expect(manager.connect(owner).createPlan(PLAN, "Dup", PRICE, DURATION))
        .to.be.revertedWithCustomError(manager, "PlanAlreadyExists")
        .withArgs(PLAN);
    });

    it("reverts on empty name / zero price / zero duration", async () => {
      const { manager, owner } = await loadFixture(deployFixture as any);
      await expect(manager.connect(owner).createPlan(9n, "", PRICE, DURATION)).to.be.revertedWithCustomError(
        manager,
        "EmptyName"
      );
      await expect(manager.connect(owner).createPlan(9n, "X", 0n, DURATION)).to.be.revertedWithCustomError(
        manager,
        "ZeroPrice"
      );
      await expect(manager.connect(owner).createPlan(9n, "X", PRICE, 0n)).to.be.revertedWithCustomError(
        manager,
        "ZeroDuration"
      );
    });

    it("getPlan reverts for unknown plan", async () => {
      const { manager } = await loadFixture(deployFixture as any);
      await expect(manager.getPlan(999n))
        .to.be.revertedWithCustomError(manager, "PlanNotFound")
        .withArgs(999n);
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

  describe("subscribe", () => {
    it("subscribes with exact payment and emits Subscribed", async () => {
      const { manager, user } = await loadFixture(deployFixture as any);
      const before = await time.latest(); // number, not bigint
      const expectedExpiry = BigInt(before + DURATION + 1); // tx mines at latest+1
      await expect(manager.connect(user).subscribe(PLAN, { value: PRICE }))
        .to.emit(manager, "Subscribed")
        .withArgs(user.address, PLAN, expectedExpiry);

      expect(await manager.hasActiveSubscription(user.address)).to.equal(true);
      const [planId, expiresAt] = await manager.subscriptionOf(user.address);
      expect(planId).to.equal(PLAN);
      expect(expiresAt).to.equal(expectedExpiry);
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

  describe("renew", () => {
    it("extends expiry by one period and emits Renewed", async () => {
      const { manager, user } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      const [, firstExpiry] = await manager.subscriptionOf(user.address);
      await expect(manager.connect(user).renew(PLAN, { value: PRICE }))
        .to.emit(manager, "Renewed")
        .withArgs(user.address, PLAN, firstExpiry + BigInt(DURATION));
      const [, newExpiry] = await manager.subscriptionOf(user.address);
      expect(newExpiry).to.equal(firstExpiry + BigInt(DURATION));
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
      const { manager, owner, user } = await loadFixture(deployFixture as any);
      await manager.connect(owner).createPlan(PLAN2, "Yearly", PRICE * 10n, DURATION * 12);
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

  describe("withdraw", () => {
    it("sends the full balance to the owner and emits Withdrawn", async () => {
      const { manager, owner, user, user2 } = await loadFixture(deployFixture as any);
      await manager.connect(user).subscribe(PLAN, { value: PRICE });
      await manager.connect(user2).subscribe(PLAN, { value: PRICE });
      const tx = manager.connect(owner).withdraw();
      await expect(tx).to.emit(manager, "Withdrawn").withArgs(owner.address, PRICE * 2n);
      await expect(tx).to.changeEtherBalance(owner, PRICE * 2n);
      expect(await ethers.provider.getBalance(await manager.getAddress())).to.equal(0n);
    });

    it("reverts for non-owner and on zero balance", async () => {
      const { manager, owner, stranger } = await loadFixture(deployFixture as any);
      await expect(manager.connect(stranger).withdraw())
        .to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
      await expect(manager.connect(owner).withdraw()).to.be.revertedWithCustomError(
        manager,
        "NoFundsToWithdraw"
      );
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
