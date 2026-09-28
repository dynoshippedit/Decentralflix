import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const FILM = 1n;
const SB_FILM = 2n; // soulbound film
const PRICE = ethers.parseEther("0.05");
const URI = "ipfs://films";

async function deployFixture() {
  const [owner, filmmaker, buyer, buyer2, stranger] = await ethers.getSigners();
  const ticketNFT = await ethers.deployContract("TicketNFT", [], owner);
  await ticketNFT.connect(owner).registerFilm(FILM, "Test Film", PRICE, filmmaker.address, false, URI);
  await ticketNFT.connect(owner).registerFilm(SB_FILM, "Soulbound Film", PRICE, filmmaker.address, true, "");
  return { ticketNFT, owner, filmmaker, buyer, buyer2, stranger };
}

describe("TicketNFT", () => {
  describe("Deployment", () => {
    it("sets name and symbol", async () => {
      const { ticketNFT } = await loadFixture(deployFixture as any);
      expect(await ticketNFT.name()).to.equal("Decentralflix Ticket");
      expect(await ticketNFT.symbol()).to.equal("DFLIX-TIX");
    });

    it("starts token IDs at 1", async () => {
      const { ticketNFT } = await loadFixture(deployFixture as any);
      expect(await ticketNFT.nextTokenId()).to.equal(1n);
    });
  });

  describe("registerFilm", () => {
    it("registers a film and emits FilmRegistered", async () => {
      const { ticketNFT, owner, filmmaker } = await loadFixture(deployFixture as any);
      await expect(
        ticketNFT.connect(owner).registerFilm(7n, "New Film", PRICE, filmmaker.address, false, URI)
      )
        .to.emit(ticketNFT, "FilmRegistered")
        .withArgs(7n, "New Film", PRICE, filmmaker.address, false);

      const film = await ticketNFT.getFilm(7n);
      expect(film.title).to.equal("New Film");
      expect(film.priceWei).to.equal(PRICE);
      expect(film.filmmaker).to.equal(filmmaker.address);
      expect(film.active).to.equal(true);
      expect(film.soulbound).to.equal(false);
      expect(film.metadataURI).to.equal(URI);
      expect(film.exists).to.equal(true);
    });

    it("reverts for non-owner", async () => {
      const { ticketNFT, stranger, filmmaker } = await loadFixture(deployFixture as any);
      await expect(
        ticketNFT.connect(stranger).registerFilm(9n, "X", PRICE, filmmaker.address, false, "")
      )
        .to.be.revertedWithCustomError(ticketNFT, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("reverts on duplicate filmId", async () => {
      const { ticketNFT, owner, filmmaker } = await loadFixture(deployFixture as any);
      await expect(
        ticketNFT.connect(owner).registerFilm(FILM, "Dup", PRICE, filmmaker.address, false, "")
      )
        .to.be.revertedWithCustomError(ticketNFT, "FilmAlreadyRegistered")
        .withArgs(FILM);
    });

    it("reverts on filmId 0", async () => {
      const { ticketNFT, owner, filmmaker } = await loadFixture(deployFixture as any);
      await expect(
        ticketNFT.connect(owner).registerFilm(0n, "Zero", PRICE, filmmaker.address, false, "")
      ).to.be.revertedWithCustomError(ticketNFT, "InvalidFilmId");
    });

    it("reverts on empty title", async () => {
      const { ticketNFT, owner, filmmaker } = await loadFixture(deployFixture as any);
      await expect(
        ticketNFT.connect(owner).registerFilm(11n, "", PRICE, filmmaker.address, false, "")
      ).to.be.revertedWithCustomError(ticketNFT, "EmptyTitle");
    });

    it("reverts on zero filmmaker address", async () => {
      const { ticketNFT, owner } = await loadFixture(deployFixture as any);
      await expect(
        ticketNFT.connect(owner).registerFilm(11n, "T", PRICE, ethers.ZeroAddress, false, "")
      ).to.be.revertedWithCustomError(ticketNFT, "ZeroAddress");
    });

    it("getFilm reverts for unregistered film", async () => {
      const { ticketNFT } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.getFilm(999n))
        .to.be.revertedWithCustomError(ticketNFT, "FilmNotFound")
        .withArgs(999n);
    });
  });

  describe("setFilmActive / setFilmPrice", () => {
    it("toggles active and emits", async () => {
      const { ticketNFT, owner } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.connect(owner).setFilmActive(FILM, false))
        .to.emit(ticketNFT, "FilmStatusChanged")
        .withArgs(FILM, false);
      expect((await ticketNFT.getFilm(FILM)).active).to.equal(false);
    });

    it("updates price and emits", async () => {
      const { ticketNFT, owner } = await loadFixture(deployFixture as any);
      const newPrice = ethers.parseEther("0.1");
      await expect(ticketNFT.connect(owner).setFilmPrice(FILM, newPrice))
        .to.emit(ticketNFT, "FilmPriceUpdated")
        .withArgs(FILM, PRICE, newPrice);
      expect((await ticketNFT.getFilm(FILM)).priceWei).to.equal(newPrice);
    });

    it("reverts for non-owner on both", async () => {
      const { ticketNFT, stranger } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.connect(stranger).setFilmActive(FILM, false))
        .to.be.revertedWithCustomError(ticketNFT, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
      await expect(ticketNFT.connect(stranger).setFilmPrice(FILM, 1n))
        .to.be.revertedWithCustomError(ticketNFT, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
    });

    it("reverts for unregistered film on both", async () => {
      const { ticketNFT, owner } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.connect(owner).setFilmActive(999n, false))
        .to.be.revertedWithCustomError(ticketNFT, "FilmNotFound")
        .withArgs(999n);
      await expect(ticketNFT.connect(owner).setFilmPrice(999n, 1n))
        .to.be.revertedWithCustomError(ticketNFT, "FilmNotFound")
        .withArgs(999n);
    });
  });

  describe("mintTicket", () => {
    it("mints, forwards full payment to filmmaker, emits TicketMinted", async () => {
      const { ticketNFT, buyer, filmmaker } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE }))
        .to.emit(ticketNFT, "TicketMinted")
        .withArgs(1n, FILM, buyer.address, PRICE);

      expect(await ticketNFT.ownerOf(1n)).to.equal(buyer.address);
      expect(await ticketNFT.ticketFilm(1n)).to.equal(FILM);
      expect(await ticketNFT.hasValidTicket(buyer.address, FILM)).to.equal(true);
      expect(await ticketNFT.validTicketCount(buyer.address, FILM)).to.equal(1n);
      await expect(
        ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE })
      ).to.changeEtherBalance(filmmaker, PRICE);
      expect(await ticketNFT.nextTokenId()).to.equal(3n);
    });

    it("allows multiple tickets per holder", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE });
      await ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE });
      expect(await ticketNFT.validTicketCount(buyer.address, FILM)).to.equal(2n);
      expect(await ticketNFT.balanceOf(buyer.address)).to.equal(2n);
    });

    it("reverts on underpayment and overpayment", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE - 1n }))
        .to.be.revertedWithCustomError(ticketNFT, "IncorrectPayment")
        .withArgs(PRICE, PRICE - 1n);
      await expect(ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE + 1n }))
        .to.be.revertedWithCustomError(ticketNFT, "IncorrectPayment")
        .withArgs(PRICE, PRICE + 1n);
    });

    it("reverts for unregistered film", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.connect(buyer).mintTicket(999n, { value: PRICE }))
        .to.be.revertedWithCustomError(ticketNFT, "FilmNotFound")
        .withArgs(999n);
    });

    it("reverts for inactive film", async () => {
      const { ticketNFT, owner, buyer } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(owner).setFilmActive(FILM, false);
      await expect(ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE }))
        .to.be.revertedWithCustomError(ticketNFT, "FilmInactive")
        .withArgs(FILM);
    });

    it("mints free film tickets with zero value", async () => {
      const { ticketNFT, owner, buyer, filmmaker } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(owner).registerFilm(3n, "Free", 0n, filmmaker.address, false, "");
      await expect(ticketNFT.connect(buyer).mintTicket(3n, { value: 0n }))
        .to.emit(ticketNFT, "TicketMinted")
        .withArgs(1n, 3n, buyer.address, 0n);
      expect(await ticketNFT.hasValidTicket(buyer.address, 3n)).to.equal(true);
    });
  });

  describe("soulbound transfers", () => {
    it("blocks transfers for soulbound films", async () => {
      const { ticketNFT, buyer, buyer2 } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(buyer).mintTicket(SB_FILM, { value: PRICE });
      await expect(ticketNFT.connect(buyer).transferFrom(buyer.address, buyer2.address, 1n))
        .to.be.revertedWithCustomError(ticketNFT, "SoulboundTransferBlocked")
        .withArgs(1n);
      expect(await ticketNFT.ownerOf(1n)).to.equal(buyer.address);
    });

    it("moves the valid-ticket count with transfers for non-soulbound films", async () => {
      const { ticketNFT, buyer, buyer2 } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE });
      await ticketNFT.connect(buyer).transferFrom(buyer.address, buyer2.address, 1n);
      expect(await ticketNFT.ownerOf(1n)).to.equal(buyer2.address);
      expect(await ticketNFT.validTicketCount(buyer.address, FILM)).to.equal(0n);
      expect(await ticketNFT.validTicketCount(buyer2.address, FILM)).to.equal(1n);
      expect(await ticketNFT.hasValidTicket(buyer.address, FILM)).to.equal(false);
      expect(await ticketNFT.hasValidTicket(buyer2.address, FILM)).to.equal(true);
    });
  });

  describe("redeemTicket", () => {
    it("burns the ticket and emits TicketRedeemed", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE });
      await expect(ticketNFT.connect(buyer).redeemTicket(1n))
        .to.emit(ticketNFT, "TicketRedeemed")
        .withArgs(1n, FILM, buyer.address);

      expect(await ticketNFT.hasValidTicket(buyer.address, FILM)).to.equal(false);
      expect(await ticketNFT.validTicketCount(buyer.address, FILM)).to.equal(0n);
      await expect(ticketNFT.ownerOf(1n))
        .to.be.revertedWithCustomError(ticketNFT, "ERC721NonexistentToken")
        .withArgs(1n);
    });

    it("redeeming one of two tickets leaves the other valid", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE });
      await ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE });
      await ticketNFT.connect(buyer).redeemTicket(1n);
      expect(await ticketNFT.hasValidTicket(buyer.address, FILM)).to.equal(true);
      expect(await ticketNFT.validTicketCount(buyer.address, FILM)).to.equal(1n);
      expect(await ticketNFT.ownerOf(2n)).to.equal(buyer.address);
    });

    it("reverts for non-owner", async () => {
      const { ticketNFT, buyer, stranger } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE });
      await expect(ticketNFT.connect(stranger).redeemTicket(1n))
        .to.be.revertedWithCustomError(ticketNFT, "NotTicketOwner")
        .withArgs(1n, stranger.address);
    });

    it("reverts for nonexistent token", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.connect(buyer).redeemTicket(999n))
        .to.be.revertedWithCustomError(ticketNFT, "ERC721NonexistentToken")
        .withArgs(999n);
    });

    it("works for soulbound tickets", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(buyer).mintTicket(SB_FILM, { value: PRICE });
      await ticketNFT.connect(buyer).redeemTicket(1n);
      expect(await ticketNFT.hasValidTicket(buyer.address, SB_FILM)).to.equal(false);
    });
  });

  describe("views / tokenURI", () => {
    it("hasValidTicket is false before minting", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      expect(await ticketNFT.hasValidTicket(buyer.address, FILM)).to.equal(false);
    });

    it("tokenURI builds from the film base URI", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(buyer).mintTicket(FILM, { value: PRICE });
      expect(await ticketNFT.tokenURI(1n)).to.equal(`${URI}/1`);
    });

    it("tokenURI is empty when the film registered no base URI", async () => {
      const { ticketNFT, buyer } = await loadFixture(deployFixture as any);
      await ticketNFT.connect(buyer).mintTicket(SB_FILM, { value: PRICE });
      expect(await ticketNFT.tokenURI(1n)).to.equal("");
    });

    it("tokenURI reverts for nonexistent token", async () => {
      const { ticketNFT } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.tokenURI(999n))
        .to.be.revertedWithCustomError(ticketNFT, "ERC721NonexistentToken")
        .withArgs(999n);
    });

    it("ticketFilm reverts for nonexistent token", async () => {
      const { ticketNFT } = await loadFixture(deployFixture as any);
      await expect(ticketNFT.ticketFilm(999n))
        .to.be.revertedWithCustomError(ticketNFT, "ERC721NonexistentToken")
        .withArgs(999n);
    });
  });
});
