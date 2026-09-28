import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const FILM = 1n;
const FREE_FILM = 2n;
const PRICE = ethers.parseEther("1");

async function deployFixture() {
  const [owner, filmmaker, filmmaker2, buyer, stranger] = await ethers.getSigners();
  const ppv = await ethers.deployContract("PayPerView", [], owner);
  await ppv.connect(filmmaker).registerFilm(FILM, PRICE);
  await ppv.connect(filmmaker).registerFilm(FREE_FILM, 0n);
  return { ppv, owner, filmmaker, filmmaker2, buyer, stranger };
}

describe("PayPerView", () => {
  describe("registerFilm", () => {
    it("registers with caller as filmmaker and emits FilmRegistered", async () => {
      const { ppv, filmmaker2 } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(filmmaker2).registerFilm(7n, PRICE))
        .to.emit(ppv, "FilmRegistered")
        .withArgs(7n, filmmaker2.address, PRICE);
      const film = await ppv.getFilm(7n);
      expect(film.filmmaker).to.equal(filmmaker2.address);
      expect(film.priceWei).to.equal(PRICE);
      expect(film.exists).to.equal(true);
    });

    it("reverts on duplicate filmId and filmId 0", async () => {
      const { ppv, filmmaker } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(filmmaker).registerFilm(FILM, PRICE))
        .to.be.revertedWithCustomError(ppv, "FilmAlreadyRegistered")
        .withArgs(FILM);
      await expect(ppv.connect(filmmaker).registerFilm(0n, PRICE)).to.be.revertedWithCustomError(
        ppv,
        "InvalidFilmId"
      );
    });

    it("getFilm reverts for unregistered film", async () => {
      const { ppv } = await loadFixture(deployFixture as any);
      await expect(ppv.getFilm(999n))
        .to.be.revertedWithCustomError(ppv, "FilmNotFound")
        .withArgs(999n);
    });
  });

  describe("setFilmPrice", () => {
    it("filmmaker updates price and emits", async () => {
      const { ppv, filmmaker } = await loadFixture(deployFixture as any);
      const newPrice = ethers.parseEther("2");
      await expect(ppv.connect(filmmaker).setFilmPrice(FILM, newPrice))
        .to.emit(ppv, "FilmPriceUpdated")
        .withArgs(FILM, PRICE, newPrice);
      expect((await ppv.getFilm(FILM)).priceWei).to.equal(newPrice);
    });

    it("reverts for non-filmmaker and unknown film", async () => {
      const { ppv, filmmaker, stranger } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(stranger).setFilmPrice(FILM, 1n))
        .to.be.revertedWithCustomError(ppv, "NotFilmmaker")
        .withArgs(FILM, stranger.address);
      await expect(ppv.connect(filmmaker).setFilmPrice(999n, 1n))
        .to.be.revertedWithCustomError(ppv, "FilmNotFound")
        .withArgs(999n);
    });
  });

  describe("buyAccess", () => {
    it("grants permanent access on exact payment and emits", async () => {
      const { ppv, buyer } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(buyer).buyAccess(FILM, { value: PRICE }))
        .to.emit(ppv, "AccessPurchased")
        .withArgs(FILM, buyer.address, PRICE);
      expect(await ppv.hasAccess(buyer.address, FILM)).to.equal(true);
      expect(await ppv.filmRevenue(FILM)).to.equal(PRICE);
    });

    it("reverts on underpayment and overpayment (no refunds path)", async () => {
      const { ppv, buyer } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(buyer).buyAccess(FILM, { value: PRICE - 1n }))
        .to.be.revertedWithCustomError(ppv, "IncorrectPayment")
        .withArgs(PRICE, PRICE - 1n);
      await expect(ppv.connect(buyer).buyAccess(FILM, { value: PRICE + 1n }))
        .to.be.revertedWithCustomError(ppv, "IncorrectPayment")
        .withArgs(PRICE, PRICE + 1n);
      expect(await ppv.hasAccess(buyer.address, FILM)).to.equal(false);
    });

    it("reverts for unregistered film", async () => {
      const { ppv, buyer } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(buyer).buyAccess(999n, { value: PRICE }))
        .to.be.revertedWithCustomError(ppv, "FilmNotFound")
        .withArgs(999n);
    });

    it("accumulates revenue across multiple buyers", async () => {
      const { ppv, buyer, stranger } = await loadFixture(deployFixture as any);
      await ppv.connect(buyer).buyAccess(FILM, { value: PRICE });
      await ppv.connect(stranger).buyAccess(FILM, { value: PRICE });
      expect(await ppv.filmRevenue(FILM)).to.equal(PRICE * 2n);
    });

    it("free films grant access with zero value", async () => {
      const { ppv, buyer } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(buyer).buyAccess(FREE_FILM, { value: 0n }))
        .to.emit(ppv, "AccessPurchased")
        .withArgs(FREE_FILM, buyer.address, 0n);
      expect(await ppv.hasAccess(buyer.address, FREE_FILM)).to.equal(true);
    });
  });

  describe("withdrawRevenue", () => {
    it("pays filmmaker price minus fee, accrues platform fee, emits", async () => {
      const { ppv, owner, filmmaker, buyer } = await loadFixture(deployFixture as any);
      await ppv.connect(owner).setPlatformFeeBps(1000n); // 10%
      await ppv.connect(buyer).buyAccess(FILM, { value: PRICE });

      const fee = (PRICE * 1000n) / 10000n;
      const net = PRICE - fee;
      await expect(ppv.connect(filmmaker).withdrawRevenue(FILM))
        .to.emit(ppv, "RevenueWithdrawn")
        .withArgs(FILM, filmmaker.address, net, fee);
      expect(await ppv.accruedPlatformFees()).to.equal(fee);
      // second withdrawal reverts: nothing left to withdraw
      await expect(ppv.connect(filmmaker).withdrawRevenue(FILM))
        .to.be.revertedWithCustomError(ppv, "NoRevenue")
        .withArgs(FILM);
    });

    it("transfers the correct net amount to the filmmaker", async () => {
      const { ppv, owner, filmmaker, buyer } = await loadFixture(deployFixture as any);
      await ppv.connect(owner).setPlatformFeeBps(2500n); // 25% cap
      await ppv.connect(buyer).buyAccess(FILM, { value: PRICE });
      const fee = (PRICE * 2500n) / 10000n;
      await expect(ppv.connect(filmmaker).withdrawRevenue(FILM)).to.changeEtherBalance(
        filmmaker,
        PRICE - fee
      );
      expect(await ppv.accruedPlatformFees()).to.equal(fee);
      expect(await ppv.filmRevenue(FILM)).to.equal(0n);
    });

    it("reverts for non-filmmaker", async () => {
      const { ppv, filmmaker, buyer, stranger } = await loadFixture(deployFixture as any);
      await ppv.connect(buyer).buyAccess(FILM, { value: PRICE });
      await expect(ppv.connect(stranger).withdrawRevenue(FILM))
        .to.be.revertedWithCustomError(ppv, "NotFilmmaker")
        .withArgs(FILM, stranger.address);
      // filmmaker themselves can still withdraw afterwards
      await ppv.connect(filmmaker).withdrawRevenue(FILM);
    });

    it("reverts with no revenue and on double withdraw", async () => {
      const { ppv, filmmaker } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(filmmaker).withdrawRevenue(FILM))
        .to.be.revertedWithCustomError(ppv, "NoRevenue")
        .withArgs(FILM);
      await expect(ppv.connect(filmmaker).withdrawRevenue(999n))
        .to.be.revertedWithCustomError(ppv, "FilmNotFound")
        .withArgs(999n);
    });

    it("reverts NoRevenue for free films (nothing accrued)", async () => {
      const { ppv, filmmaker, buyer } = await loadFixture(deployFixture as any);
      await ppv.connect(buyer).buyAccess(FREE_FILM, { value: 0n });
      await expect(ppv.connect(filmmaker).withdrawRevenue(FREE_FILM))
        .to.be.revertedWithCustomError(ppv, "NoRevenue")
        .withArgs(FREE_FILM);
    });
  });

  describe("setPlatformFeeBps", () => {
    it("sets fee and emits; 2500 bps cap is accepted", async () => {
      const { ppv, owner } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(owner).setPlatformFeeBps(2500n))
        .to.emit(ppv, "PlatformFeeUpdated")
        .withArgs(0n, 2500n);
      expect(await ppv.platformFeeBps()).to.equal(2500n);
    });

    it("reverts above the 25% cap", async () => {
      const { ppv, owner } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(owner).setPlatformFeeBps(2501n))
        .to.be.revertedWithCustomError(ppv, "FeeTooHigh")
        .withArgs(2501n, 2500n);
    });

    it("reverts for non-owner", async () => {
      const { ppv, stranger } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(stranger).setPlatformFeeBps(100n))
        .to.be.revertedWithCustomError(ppv, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });
  });

  describe("withdrawPlatformFees", () => {
    it("owner withdraws accrued fees and emits", async () => {
      const { ppv, owner, filmmaker, buyer } = await loadFixture(deployFixture as any);
      await ppv.connect(owner).setPlatformFeeBps(1000n);
      await ppv.connect(buyer).buyAccess(FILM, { value: PRICE });
      await ppv.connect(filmmaker).withdrawRevenue(FILM);
      const fee = (PRICE * 1000n) / 10000n;
      const tx = ppv.connect(owner).withdrawPlatformFees();
      await expect(tx).to.emit(ppv, "PlatformFeesWithdrawn").withArgs(owner.address, fee);
      await expect(tx).to.changeEtherBalance(owner, fee);
      expect(await ppv.accruedPlatformFees()).to.equal(0n);
    });

    it("reverts with no fees and for non-owner", async () => {
      const { ppv, owner, stranger } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(owner).withdrawPlatformFees()).to.be.revertedWithCustomError(
        ppv,
        "NoPlatformFees"
      );
      await expect(ppv.connect(stranger).withdrawPlatformFees())
        .to.be.revertedWithCustomError(ppv, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });
  });
});
