import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * PayPerView — df-cycle-12: immutable 75/25 through the shared RevenueSplitter.
 *
 * The owner-settable platformFeeBps is GONE. Every purchase splits immediately
 * at buyAccess time: 75% (+ rounding remainder) to the filmmaker, 25% to the
 * platform. Nothing accrues in the contract; there is no withdraw path.
 *
 * F-DFLIX-1 (df-batch2): the creator is paid first, then the platform fee,
 * and transferOwnership probes the new owner with a zero-value call — a
 * non-receiving owner (which would brick every paid flow) is unreachable.
 */

const FILM = 1n;
const FREE_FILM = 2n;
const ODD_FILM = 3n;
const PRICE = ethers.parseEther("1");
const ODD_PRICE = 7n; // odd wei: fee = floor(7 * 2500 / 10000) = 1, filmmaker = 6

const FEE_BPS = 2500n;
const feeOf = (v: bigint) => (v * FEE_BPS) / 10000n;
const shareOf = (v: bigint) => v - feeOf(v);

async function deployFixture() {
  const [owner, filmmaker, filmmaker2, buyer, stranger] = await ethers.getSigners();
  const ppv = await ethers.deployContract("PayPerView", [], owner);
  // F-3: registration is owner-only; the owner names the filmmaker explicitly.
  await ppv.connect(owner).registerFilm(FILM, PRICE, filmmaker.address);
  await ppv.connect(owner).registerFilm(FREE_FILM, 0n, filmmaker.address);
  await ppv.connect(owner).registerFilm(ODD_FILM, ODD_PRICE, filmmaker.address);
  return { ppv, owner, filmmaker, filmmaker2, buyer, stranger };
}

describe("PayPerView", () => {
  describe("registerFilm", () => {
    it("owner registers a film naming the filmmaker; emits FilmRegistered", async () => {
      const { ppv, owner, filmmaker2 } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(owner).registerFilm(7n, PRICE, filmmaker2.address))
        .to.emit(ppv, "FilmRegistered")
        .withArgs(7n, filmmaker2.address, PRICE);
      const film = await ppv.getFilm(7n);
      expect(film.filmmaker).to.equal(filmmaker2.address);
      expect(film.priceWei).to.equal(PRICE);
      expect(film.exists).to.equal(true);
    });

    it("reverts for non-owner: a front-runner cannot capture a filmId (F-3)", async () => {
      const { ppv, owner, filmmaker, stranger, buyer } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(stranger).registerFilm(7n, PRICE, stranger.address))
        .to.be.revertedWithCustomError(ppv, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
      // The filmId stays unclaimed: the owner registers it for the real
      // filmmaker, and a later purchase splits to the filmmaker — never to
      // the would-be front-runner.
      await ppv.connect(owner).registerFilm(7n, PRICE, filmmaker.address);
      expect((await ppv.getFilm(7n)).filmmaker).to.equal(filmmaker.address);
      await expect(ppv.connect(buyer).buyAccess(7n, { value: PRICE })).to.changeEtherBalances(
        [buyer, filmmaker, stranger],
        [-PRICE, shareOf(PRICE), 0n]
      );
    });

    it("reverts on a zero filmmaker address", async () => {
      const { ppv, owner } = await loadFixture(deployFixture as any);
      await expect(
        ppv.connect(owner).registerFilm(7n, PRICE, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(ppv, "ZeroAddress");
    });

    it("reverts on duplicate filmId and filmId 0", async () => {
      const { ppv, owner, filmmaker } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(owner).registerFilm(FILM, PRICE, filmmaker.address))
        .to.be.revertedWithCustomError(ppv, "FilmAlreadyRegistered")
        .withArgs(FILM);
      await expect(
        ppv.connect(owner).registerFilm(0n, PRICE, filmmaker.address)
      ).to.be.revertedWithCustomError(ppv, "InvalidFilmId");
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

  describe("immutable 75/25 split (df-cycle-12)", () => {
    it("PLATFORM_FEE_BPS is the 2500 constant from the shared splitter", async () => {
      const { ppv } = await loadFixture(deployFixture as any);
      expect(await ppv.PLATFORM_FEE_BPS()).to.equal(2500n);
    });

    it("the owner cannot change the split — no fee setter exists", async () => {
      const { ppv } = await loadFixture(deployFixture as any);
      for (const fn of ["setPlatformFeeBps", "setPlatformFee", "setFee", "updateFee"]) {
        expect(ppv.interface.hasFunction(fn), fn).to.equal(false);
      }
    });

    it("there is no withdraw path at all — nothing accrues in the contract", async () => {
      const { ppv } = await loadFixture(deployFixture as any);
      const rec = ppv as unknown as Record<string, unknown>;
      for (const fn of ["withdrawRevenue", "withdrawPlatformFees", "withdraw"]) {
        expect(rec[fn], fn).to.equal(undefined);
      }
    });

    it("the filmmaker cannot be changed after registration — no filmmaker setter exists", async () => {
      const { ppv } = await loadFixture(deployFixture as any);
      for (const fn of ["setFilmmaker", "updateFilmmaker", "setFilmFilmmaker"]) {
        expect(ppv.interface.hasFunction(fn), fn).to.equal(false);
      }
    });
  });

  describe("buyAccess splits 75/25 immediately", () => {
    it("sends exactly 75% to the filmmaker and 25% to the owner, contract keeps 0", async () => {
      const { ppv, owner, filmmaker, buyer } = await loadFixture(deployFixture as any);
      const addr = await ppv.getAddress();
      await expect(ppv.connect(buyer).buyAccess(FILM, { value: PRICE })).to.changeEtherBalances(
        [buyer, filmmaker, owner],
        [-PRICE, shareOf(PRICE), feeOf(PRICE)]
      );
      expect(await ethers.provider.getBalance(addr)).to.equal(0n);
      expect(await ppv.hasAccess(buyer.address, FILM)).to.equal(true);
    });

    it("emits AccessPurchased with the split amounts and RevenueSplit", async () => {
      const { ppv, filmmaker, buyer } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(buyer).buyAccess(FILM, { value: PRICE }))
        .to.emit(ppv, "AccessPurchased")
        .withArgs(FILM, buyer.address, PRICE, filmmaker.address, shareOf(PRICE), feeOf(PRICE))
        .and.to.emit(ppv, "RevenueSplit")
        .withArgs(filmmaker.address, shareOf(PRICE), feeOf(PRICE));
    });

    it("filmmaker gets the rounding remainder on odd wei amounts", async () => {
      const { ppv, owner, filmmaker, buyer } = await loadFixture(deployFixture as any);
      // 7 wei: fee = floor(7 * 2500 / 10000) = 1, filmmaker = 6. Never fee rounded up.
      await expect(
        ppv.connect(buyer).buyAccess(ODD_FILM, { value: ODD_PRICE })
      ).to.changeEtherBalances([buyer, filmmaker, owner], [-7n, 6n, 1n]);
      expect(6n + 1n).to.equal(7n);
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

    it("grants access to multiple buyers, each split immediately", async () => {
      const { ppv, owner, filmmaker, buyer, stranger } = await loadFixture(deployFixture as any);
      await ppv.connect(buyer).buyAccess(FILM, { value: PRICE });
      await ppv.connect(stranger).buyAccess(FILM, { value: PRICE });
      expect(await ppv.hasAccess(buyer.address, FILM)).to.equal(true);
      expect(await ppv.hasAccess(stranger.address, FILM)).to.equal(true);
      // filmmaker received 75% twice; owner received 25% twice; contract holds nothing
      expect(await ethers.provider.getBalance(await ppv.getAddress())).to.equal(0n);
    });

    it("free films grant access with zero value and no transfers", async () => {
      const { ppv, owner, filmmaker, buyer } = await loadFixture(deployFixture as any);
      await expect(
        ppv.connect(buyer).buyAccess(FREE_FILM, { value: 0n })
      ).to.changeEtherBalances([buyer, filmmaker, owner], [0n, 0n, 0n]);
      expect(await ppv.hasAccess(buyer.address, FREE_FILM)).to.equal(true);
    });

    it("direct ETH transfers revert — no receive/fallback to trap funds", async () => {
      const { ppv, buyer } = await loadFixture(deployFixture as any);
      const addr = await ppv.getAddress();
      await expect(buyer.sendTransaction({ to: addr, value: 100n })).to.be.reverted;
    });
  });

  describe("F-DFLIX-1: owner rotation cannot install a fee-bricking owner", () => {
    it("transferOwnership to a non-receiving contract reverts NewOwnerCannotReceive", async () => {
      const { ppv, owner } = await loadFixture(deployFixture as any);
      const bricking = await ethers.deployContract("RevertingReceiver", [], owner);
      const brickingAddr = await bricking.getAddress();
      await expect(ppv.connect(owner).transferOwnership(brickingAddr))
        .to.be.revertedWithCustomError(ppv, "NewOwnerCannotReceive")
        .withArgs(brickingAddr);
      // Ownership is unchanged: the old owner is still in charge.
      expect(await ppv.owner()).to.equal(owner.address);
    });

    it("a failed bricking rotation leaves payments working (no outage)", async () => {
      const { ppv, owner, filmmaker, buyer } = await loadFixture(deployFixture as any);
      const bricking = await ethers.deployContract("RevertingReceiver", [], owner);
      await expect(
        ppv.connect(owner).transferOwnership(await bricking.getAddress())
      ).to.be.revertedWithCustomError(ppv, "NewOwnerCannotReceive");
      // The payment flow is intact: creator paid first, then the platform fee.
      await expect(ppv.connect(buyer).buyAccess(FILM, { value: PRICE })).to.changeEtherBalances(
        [buyer, filmmaker, owner],
        [-PRICE, shareOf(PRICE), feeOf(PRICE)]
      );
      expect(await ppv.hasAccess(buyer.address, FILM)).to.equal(true);
    });

    it("transferOwnership to a receiving contract succeeds and fees flow to it", async () => {
      const { ppv, owner, filmmaker, buyer } = await loadFixture(deployFixture as any);
      const receiver = await ethers.deployContract("AcceptingReceiver", [], owner);
      const receiverAddr = await receiver.getAddress();
      await ppv.connect(owner).transferOwnership(receiverAddr);
      expect(await ppv.owner()).to.equal(receiverAddr);
      await expect(ppv.connect(buyer).buyAccess(FILM, { value: PRICE })).to.changeEtherBalances(
        [buyer, filmmaker, receiver],
        [-PRICE, shareOf(PRICE), feeOf(PRICE)]
      );
      expect(await ethers.provider.getBalance(receiverAddr)).to.equal(feeOf(PRICE));
    });

    it("transferOwnership to an EOA still works (probe does not over-block)", async () => {
      const { ppv, owner, stranger } = await loadFixture(deployFixture as any);
      await ppv.connect(owner).transferOwnership(stranger.address);
      expect(await ppv.owner()).to.equal(stranger.address);
    });

    it("transferOwnership to the zero address still reverts (Ownable rule intact)", async () => {
      const { ppv, owner } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(owner).transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(ppv, "OwnableInvalidOwner")
        .withArgs(ethers.ZeroAddress);
    });

    it("non-owners cannot rotate ownership", async () => {
      const { ppv, stranger, buyer } = await loadFixture(deployFixture as any);
      await expect(ppv.connect(stranger).transferOwnership(buyer.address))
        .to.be.revertedWithCustomError(ppv, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });
  });
});
