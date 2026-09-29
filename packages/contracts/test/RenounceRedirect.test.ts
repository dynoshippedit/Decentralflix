import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * DF-RENOUNCE-1 — renounceOwnership redirects the platform fee to the creator.
 *
 * Decision (Dino 2026-09-29, chief's pick under "work independently"): when the
 * platform renounces ownership, the 25% platform fee is NOT burned to
 * address(0) on future sales. The fee leg is redirected to the creator, so
 * the creator receives 100% of every post-renounce sale. Rationale: burning
 * destroys value; a revert-guard could brick a legitimate exit; redirecting
 * is consistent with the creator-first 75/25 economics and the
 * decentralization story.
 *
 * Implemented once in RevenueSplitter (platformRenounced flag + renounceOwnership
 * override + _splitRevenue early-return). All four inheritors — TicketNFT,
 * MovieTicket, PayPerView, SubscriptionManager — inherit the behavior.
 *
 * Exact-split assertions per sale: post-renounce sale of PRICE wei must move
 * exactly PRICE wei to the creator, 0 to the (former) platform owner, and
 * leave 0 wei in the contract.
 *
 * NOTE: contracts are unaudited. No deploy, no mainnet, no real funds.
 */

const PRICE = ethers.parseEther("0.05");
const FEE_BPS = 2500n;
const feeOf = (v: bigint) => (v * FEE_BPS) / 10000n;
const creatorShareOf = (v: bigint) => v - feeOf(v);

async function ticketFixture() {
  const [owner, filmmaker, buyer] = await ethers.getSigners();
  const ticketNFT = await ethers.deployContract("TicketNFT", [], owner);
  await ticketNFT
    .connect(owner)
    .registerFilm(1n, "Test Film", PRICE, filmmaker.address, false, "ipfs://films");
  return { ticketNFT, owner, filmmaker, buyer };
}

async function ppvFixture() {
  const [owner, filmmaker, buyer] = await ethers.getSigners();
  const ppv = await ethers.deployContract("PayPerView", [], owner);
  await ppv.connect(owner).registerFilm(1n, PRICE, filmmaker.address);
  return { ppv, owner, filmmaker, buyer };
}

async function subFixture() {
  const [owner, creator, user, user2] = await ethers.getSigners();
  const manager = await ethers.deployContract("SubscriptionManager", [], owner);
  await manager.connect(owner).createPlan(1n, "Monthly", PRICE, 30 * 24 * 60 * 60, creator.address);
  return { manager, owner, creator, user, user2 };
}

async function movieFixture() {
  const [owner, creator, buyer] = await ethers.getSigners();
  const movieTicket = await ethers.deployContract("MovieTicket", [], owner);
  return { movieTicket, owner, creator, buyer };
}

async function bal(addr: string): Promise<bigint> {
  return ethers.provider.getBalance(addr);
}

describe("DF-RENOUNCE-1: renounce redirects the platform fee to the creator", () => {
  describe("TicketNFT", () => {
    it("pre-renounce sale splits 75/25; post-renounce sale pays creator 100%", async () => {
      const { ticketNFT, owner, filmmaker, buyer } = await loadFixture(ticketFixture);
      const tAddr = await ticketNFT.getAddress();

      // Pre-renounce: exact 75/25.
      const c0 = await bal(filmmaker.address);
      const o0 = await bal(owner.address);
      await (await ticketNFT.connect(buyer).mintTicket(1n, { value: PRICE })).wait();
      expect(await bal(tAddr)).to.equal(0n);
      expect((await bal(filmmaker.address)) - c0).to.equal(creatorShareOf(PRICE));
      expect((await bal(owner.address)) - o0).to.equal(feeOf(PRICE));

      // Renounce.
      await (await ticketNFT.connect(owner).renounceOwnership()).wait();
      expect(await ticketNFT.platformRenounced()).to.equal(true);
      expect(await ticketNFT.owner()).to.equal(ethers.ZeroAddress);

      // Post-renounce: creator receives 100%, platform 0, contract 0.
      const c1 = await bal(filmmaker.address);
      const o1 = await bal(owner.address);
      await expect(ticketNFT.connect(buyer).mintTicket(1n, { value: PRICE }))
        .to.emit(ticketNFT, "RevenueSplit")
        .withArgs(filmmaker.address, PRICE, 0n);
      expect(await bal(tAddr)).to.equal(0n);
      expect((await bal(filmmaker.address)) - c1).to.equal(PRICE);
      expect((await bal(owner.address)) - o1).to.equal(0n);
    });

    it("only the owner can renounce", async () => {
      const { ticketNFT, buyer } = await loadFixture(ticketFixture);
      await expect(ticketNFT.connect(buyer).renounceOwnership())
        .to.be.revertedWithCustomError(ticketNFT, "OwnableUnauthorizedAccount")
        .withArgs(buyer.address);
      expect(await ticketNFT.platformRenounced()).to.equal(false);
    });
  });

  describe("PayPerView", () => {
    it("pre-renounce sale splits 75/25; post-renounce sale pays creator 100%", async () => {
      const { ppv, owner, filmmaker, buyer } = await loadFixture(ppvFixture);
      const pAddr = await ppv.getAddress();

      const c0 = await bal(filmmaker.address);
      const o0 = await bal(owner.address);
      await (await ppv.connect(buyer).buyAccess(1n, { value: PRICE })).wait();
      expect(await bal(pAddr)).to.equal(0n);
      expect((await bal(filmmaker.address)) - c0).to.equal(creatorShareOf(PRICE));
      expect((await bal(owner.address)) - o0).to.equal(feeOf(PRICE));

      await (await ppv.connect(owner).renounceOwnership()).wait();
      expect(await ppv.platformRenounced()).to.equal(true);
      expect(await ppv.owner()).to.equal(ethers.ZeroAddress);

      const c1 = await bal(filmmaker.address);
      const o1 = await bal(owner.address);
      await expect(ppv.connect(buyer).buyAccess(1n, { value: PRICE }))
        .to.emit(ppv, "RevenueSplit")
        .withArgs(filmmaker.address, PRICE, 0n);
      expect(await bal(pAddr)).to.equal(0n);
      expect((await bal(filmmaker.address)) - c1).to.equal(PRICE);
      expect((await bal(owner.address)) - o1).to.equal(0n);
    });
  });

  describe("SubscriptionManager", () => {
    it("pre-renounce subscribe splits 75/25; post-renounce pays creator 100%", async () => {
      const { manager, owner, creator, user, user2 } = await loadFixture(subFixture);
      const mAddr = await manager.getAddress();

      const c0 = await bal(creator.address);
      const o0 = await bal(owner.address);
      await (await manager.connect(user).subscribe(1n, { value: PRICE })).wait();
      expect(await bal(mAddr)).to.equal(0n);
      expect((await bal(creator.address)) - c0).to.equal(creatorShareOf(PRICE));
      expect((await bal(owner.address)) - o0).to.equal(feeOf(PRICE));

      await (await manager.connect(owner).renounceOwnership()).wait();
      expect(await manager.platformRenounced()).to.equal(true);
      expect(await manager.owner()).to.equal(ethers.ZeroAddress);

      const c1 = await bal(creator.address);
      const o1 = await bal(owner.address);
      // NOTE: user2 subscribes post-renounce — the same account cannot hold
      // two active subscriptions on one plan (AlreadySubscribed).
      await expect(manager.connect(user2).subscribe(1n, { value: PRICE }))
        .to.emit(manager, "RevenueSplit")
        .withArgs(creator.address, PRICE, 0n);
      expect(await bal(mAddr)).to.equal(0n);
      expect((await bal(creator.address)) - c1).to.equal(PRICE);
      expect((await bal(owner.address)) - o1).to.equal(0n);
    });
  });

  describe("MovieTicket", () => {
    it("pre-renounce mint splits 75/25; post-renounce mints revert (owner-only)", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(movieFixture);
      const mAddr = await movieTicket.getAddress();

      // Pre-renounce: owner mints, exact 75/25.
      const c0 = await bal(creator.address);
      const o0 = await bal(owner.address);
      await (
        await movieTicket
          .connect(owner)
          .mintPermanentPass(buyer.address, creator.address, "ar://film", PRICE, 0, { value: PRICE })
      ).wait();
      expect(await bal(mAddr)).to.equal(0n);
      expect((await bal(creator.address)) - c0).to.equal(creatorShareOf(PRICE));
      // NOTE: no exact owner-delta assertion here — the owner is the minter
      // and pays gas on top of the price, so their balance change is not exact.

      // Renounce: both mint entry points are onlyOwner, so no sale can occur
      // post-renounce — the redirect can never burn or brick funds here.
      await (await movieTicket.connect(owner).renounceOwnership()).wait();
      expect(await movieTicket.platformRenounced()).to.equal(true);
      await expect(
        movieTicket
          .connect(buyer)
          .mintPermanentPass(buyer.address, creator.address, "ar://film", PRICE, 0, { value: PRICE })
      ).to.be.revertedWithCustomError(movieTicket, "OwnableUnauthorizedAccount");
      expect(await bal(mAddr)).to.equal(0n);
    });
  });
});
