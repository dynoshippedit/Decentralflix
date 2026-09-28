import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * MovieTicket.sol — core money contract tests.
 *
 * Covers the financial invariants that matter for a launch handling real funds:
 *  - 70% creator / 30% platform split is exact and paid to the creator immediately on mint
 *  - platform fee is retained in the contract and only withdrawable by the owner
 *  - access tiers (Basic/Deluxe/Producer) and Producer rights are recorded correctly
 *  - burnable tickets can be burned once by their owner, permanent passes cannot
 *  - pause / fee-cap / ownership guards hold
 *  - emergency legal delisting (T16) flips access off and is owner-gated
 *
 * Runs on the in-process hardhat EVM — no RPC, keys, or external services.
 */

// Tier enum mirror (Solidity: BASIC=0, DELUXE=1, PRODUCER=2)
const Tier = { BASIC: 0, DELUXE: 1, PRODUCER: 2 } as const;
// TicketType enum mirror (PERMANENT_PASS=0, BURNABLE_TICKET=1)
const TicketType = { PERMANENT_PASS: 0, BURNABLE_TICKET: 1 } as const;

const FEE_BPS = 3000n; // 30% platform fee → 70% creator, the headline split
const PRICE = ethers.parseEther("1"); // 1 ETH
const VIDEO_HASH = "ar://film-raging-midlife-master";

async function deployFixture() {
  const [owner, creator, buyer, stranger] = await ethers.getSigners();
  const movieTicket = await ethers.deployContract("MovieTicket", [FEE_BPS], owner);
  await movieTicket.waitForDeployment();
  return { movieTicket, owner, creator, buyer, stranger };
}

// Mint a permanent pass with the canonical args; returns the mint tx.
function mintPass(
  movieTicket: any,
  owner: any,
  to: string,
  creator: string,
  opts: { price?: bigint; value?: bigint; tier?: number; hash?: string } = {}
) {
  const price = opts.price ?? PRICE;
  const value = opts.value ?? price;
  const tier = opts.tier ?? Tier.BASIC;
  const hash = opts.hash ?? VIDEO_HASH;
  return movieTicket.connect(owner).mintPermanentPass(to, creator, hash, price, tier, { value });
}

describe("MovieTicket", () => {
  describe("Deployment", () => {
    it("stores the initial platform fee", async () => {
      const { movieTicket } = await loadFixture(deployFixture);
      expect(await movieTicket.platformFeeBps()).to.equal(FEE_BPS);
      expect(await movieTicket.getCurrentPlatformFeeBps()).to.equal(FEE_BPS);
    });

    it("sets the deployer as owner", async () => {
      const { movieTicket, owner } = await loadFixture(deployFixture);
      expect(await movieTicket.owner()).to.equal(owner.address);
    });

    it("rejects a fee above the 50% cap at construction", async () => {
      await expect(ethers.deployContract("MovieTicket", [5001n])).to.be.revertedWith(
        "Fee too high (max 50%)"
      );
    });

    it("has correct ERC721 name and symbol", async () => {
      const { movieTicket } = await loadFixture(deployFixture);
      expect(await movieTicket.name()).to.equal("Decentralflix Movie Ticket");
      expect(await movieTicket.symbol()).to.equal("DFMT");
    });
  });

  describe("Fee math helpers", () => {
    it("computes the 70/30 split exactly", async () => {
      const { movieTicket } = await loadFixture(deployFixture);
      const fee = await movieTicket.getPlatformFee(PRICE);
      const creatorShare = await movieTicket.getCreatorShare(PRICE);
      expect(fee).to.equal((PRICE * FEE_BPS) / 10000n);
      expect(creatorShare).to.equal(PRICE - fee);
      expect(fee + creatorShare).to.equal(PRICE);
      // 30% / 70% of 1 ETH
      expect(fee).to.equal(ethers.parseEther("0.3"));
      expect(creatorShare).to.equal(ethers.parseEther("0.7"));
    });
  });

  describe("mintPermanentPass", () => {
    it("pays the creator their share immediately and retains the platform fee", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      const fee = (PRICE * FEE_BPS) / 10000n;
      const creatorShare = PRICE - fee;

      // creator gains exactly their share; contract retains exactly the platform fee
      await expect(
        mintPass(movieTicket, owner, buyer.address, creator.address)
      ).to.changeEtherBalances(
        [creator, movieTicket],
        [creatorShare, fee]
      );
    });

    it("mints token id 0 to the recipient and records metadata", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address);

      expect(await movieTicket.ownerOf(0)).to.equal(buyer.address);
      expect(await movieTicket.balanceOf(buyer.address)).to.equal(1);
      expect(await movieTicket.totalSupply()).to.equal(1);
      expect(await movieTicket.tokenURI(0)).to.equal(VIDEO_HASH);

      const meta = await movieTicket.videoMetadata(0);
      expect(meta.videoHash).to.equal(VIDEO_HASH);
      expect(meta.creator).to.equal(creator.address);
      expect(meta.price).to.equal(PRICE);
      expect(meta.isActive).to.equal(true);
      expect(meta.isDelisted).to.equal(false);
      expect(await movieTicket.ticketTypes(0)).to.equal(TicketType.PERMANENT_PASS);
      expect(await movieTicket.tokenTiers(0)).to.equal(Tier.BASIC);
    });

    it("emits VideoMinted and CreatorPaid with the right args", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      const fee = (PRICE * FEE_BPS) / 10000n;
      const creatorShare = PRICE - fee;

      await expect(mintPass(movieTicket, owner, buyer.address, creator.address))
        .to.emit(movieTicket, "VideoMinted")
        .withArgs(
          0,
          creator.address,
          buyer.address,
          VIDEO_HASH,
          TicketType.PERMANENT_PASS,
          Tier.BASIC,
          PRICE,
          fee,
          creatorShare
        )
        .and.to.emit(movieTicket, "CreatorPaid")
        .withArgs(0, creator.address, creatorShare);
    });

    it("grants Producer rights only for the Producer tier", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address, { tier: Tier.BASIC });
      await mintPass(movieTicket, owner, buyer.address, creator.address, { tier: Tier.PRODUCER });

      expect(await movieTicket.hasProducerRights(0)).to.equal(false);
      expect(await movieTicket.hasProducerRights(1)).to.equal(true);
      expect(await movieTicket.tokenTiers(1)).to.equal(Tier.PRODUCER);
    });

    it("increments token ids across multiple mints", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address);
      await mintPass(movieTicket, owner, buyer.address, creator.address);
      await mintPass(movieTicket, owner, buyer.address, creator.address);
      expect(await movieTicket.totalSupply()).to.equal(3);
      expect(await movieTicket.ownerOf(2)).to.equal(buyer.address);
    });

    it("reverts when payment is below price", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await expect(
        mintPass(movieTicket, owner, buyer.address, creator.address, {
          value: PRICE - 1n,
        })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("reverts when called by a non-owner", async () => {
      const { movieTicket, creator, buyer, stranger } = await loadFixture(deployFixture);
      await expect(
        mintPass(movieTicket, stranger, buyer.address, creator.address)
      ).to.be.revertedWithCustomError(movieTicket, "OwnableUnauthorizedAccount");
    });

    it("handles a zero-price mint with no creator payout", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await expect(
        mintPass(movieTicket, owner, buyer.address, creator.address, {
          price: 0n,
          value: 0n,
        })
      ).to.changeEtherBalances([creator, movieTicket], [0n, 0n]);
      expect(await movieTicket.ownerOf(0)).to.equal(buyer.address);
    });
  });

  describe("mintBurnableTicket + burnTicket", () => {
    it("mints a burnable ticket and lets its owner burn it once", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await movieTicket
        .connect(owner)
        .mintBurnableTicket(buyer.address, creator.address, VIDEO_HASH, PRICE, Tier.BASIC, {
          value: PRICE,
        });

      expect(await movieTicket.ticketTypes(0)).to.equal(TicketType.BURNABLE_TICKET);
      expect(await movieTicket.ownerOf(0)).to.equal(buyer.address);

      await expect(movieTicket.connect(buyer).burnTicket(0))
        .to.emit(movieTicket, "TicketBurned")
        .withArgs(0, buyer.address);

      expect(await movieTicket.hasBeenWatched(0)).to.equal(true);
      expect(await movieTicket.balanceOf(buyer.address)).to.equal(0);
    });

    it("prevents a non-owner from burning the ticket", async () => {
      const { movieTicket, owner, creator, buyer, stranger } = await loadFixture(deployFixture);
      await movieTicket
        .connect(owner)
        .mintBurnableTicket(buyer.address, creator.address, VIDEO_HASH, PRICE, Tier.BASIC, {
          value: PRICE,
        });
      await expect(movieTicket.connect(stranger).burnTicket(0)).to.be.revertedWith(
        "Not ticket owner"
      );
    });

    it("prevents burning a permanent pass", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address);
      await expect(movieTicket.connect(buyer).burnTicket(0)).to.be.revertedWith(
        "Not a burnable ticket"
      );
    });
  });

  describe("Pausing", () => {
    it("blocks minting while paused and resumes after unpause", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await movieTicket.connect(owner).pause();
      await expect(
        mintPass(movieTicket, owner, buyer.address, creator.address)
      ).to.be.revertedWith("MovieTicket: paused");

      await movieTicket.connect(owner).unpause();
      await expect(mintPass(movieTicket, owner, buyer.address, creator.address)).to.not.be.reverted;
    });

    it("only the owner can pause", async () => {
      const { movieTicket, stranger } = await loadFixture(deployFixture);
      await expect(movieTicket.connect(stranger).pause()).to.be.revertedWithCustomError(
        movieTicket,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("setPlatformFee", () => {
    it("updates the fee within the cap and emits the change", async () => {
      const { movieTicket, owner } = await loadFixture(deployFixture);
      await expect(movieTicket.connect(owner).setPlatformFee(1000n))
        .to.emit(movieTicket, "PlatformFeeUpdated")
        .withArgs(FEE_BPS, 1000n);
      expect(await movieTicket.platformFeeBps()).to.equal(1000n);
    });

    it("rejects a fee above the cap", async () => {
      const { movieTicket, owner } = await loadFixture(deployFixture);
      await expect(movieTicket.connect(owner).setPlatformFee(5001n)).to.be.revertedWith(
        "Fee too high (max 50%)"
      );
    });

    it("is owner-only", async () => {
      const { movieTicket, stranger } = await loadFixture(deployFixture);
      await expect(
        movieTicket.connect(stranger).setPlatformFee(1000n)
      ).to.be.revertedWithCustomError(movieTicket, "OwnableUnauthorizedAccount");
    });
  });

  describe("Emergency legal delisting (T16)", () => {
    it("flags a film as delisted with reason + timestamp, owner-only", async () => {
      const { movieTicket, owner, stranger } = await loadFixture(deployFixture);
      expect(await movieTicket.isFilmDelisted(VIDEO_HASH)).to.equal(false);

      await expect(
        movieTicket.connect(stranger).delistFilm(VIDEO_HASH, "CSAM")
      ).to.be.revertedWithCustomError(movieTicket, "OwnableUnauthorizedAccount");

      await expect(movieTicket.connect(owner).delistFilm(VIDEO_HASH, "CSAM"))
        .to.emit(movieTicket, "ContentDelisted");

      expect(await movieTicket.isFilmDelisted(VIDEO_HASH)).to.equal(true);
      const key = ethers.keccak256(ethers.solidityPacked(["string"], [VIDEO_HASH]));
      expect(await movieTicket.delistReason(key)).to.equal("CSAM");
      expect(await movieTicket.delistedAt(key)).to.be.greaterThan(0);
    });

    it("blocks access to a delisted film and restores it", async () => {
      const { movieTicket, owner, buyer } = await loadFixture(deployFixture);
      // Access view returns false for delisted hashes.
      await movieTicket.connect(owner).delistFilm(VIDEO_HASH, "DMCA");
      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(false);

      await expect(movieTicket.connect(owner).restoreFilm(VIDEO_HASH)).to.emit(
        movieTicket,
        "ContentRestored"
      );
      expect(await movieTicket.isFilmDelisted(VIDEO_HASH)).to.equal(false);
    });
  });

  describe("On-chain access index (hasAccessToVideo)", () => {
    it("returns false for a non-holder and true after a mint, scoped to the film", async () => {
      const { movieTicket, owner, creator, buyer, stranger } = await loadFixture(deployFixture);
      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(false);

      await mintPass(movieTicket, owner, buyer.address, creator.address);
      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(true);
      expect(await movieTicket.accessBalanceOf(buyer.address, VIDEO_HASH)).to.equal(1);

      // scoped: no access to a different film, and a stranger has none
      expect(await movieTicket.hasAccessToVideo(buyer.address, "ar://other-film")).to.equal(false);
      expect(await movieTicket.hasAccessToVideo(stranger.address, VIDEO_HASH)).to.equal(false);
    });

    it("counts multiple tickets for the same film", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address);
      await mintPass(movieTicket, owner, buyer.address, creator.address);
      expect(await movieTicket.accessBalanceOf(buyer.address, VIDEO_HASH)).to.equal(2);
      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(true);
    });

    it("moves access on transfer", async () => {
      const { movieTicket, owner, creator, buyer, stranger } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address); // tokenId 0 → buyer
      await movieTicket
        .connect(buyer)
        .transferFrom(buyer.address, stranger.address, 0);

      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(false);
      expect(await movieTicket.hasAccessToVideo(stranger.address, VIDEO_HASH)).to.equal(true);
      expect(await movieTicket.accessBalanceOf(buyer.address, VIDEO_HASH)).to.equal(0);
      expect(await movieTicket.accessBalanceOf(stranger.address, VIDEO_HASH)).to.equal(1);
    });

    it("removes access when a burnable ticket is burned", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await movieTicket
        .connect(owner)
        .mintBurnableTicket(buyer.address, creator.address, VIDEO_HASH, PRICE, Tier.BASIC, {
          value: PRICE,
        });
      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(true);

      await movieTicket.connect(buyer).burnTicket(0);
      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(false);
      expect(await movieTicket.accessBalanceOf(buyer.address, VIDEO_HASH)).to.equal(0);
    });

    it("denies access to a delisted film even for a holder, and restores on re-list", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address);
      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(true);

      await movieTicket.connect(owner).delistFilm(VIDEO_HASH, "DMCA");
      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(false);
      // the underlying balance is unchanged — only gating flips
      expect(await movieTicket.accessBalanceOf(buyer.address, VIDEO_HASH)).to.equal(1);

      await movieTicket.connect(owner).restoreFilm(VIDEO_HASH);
      expect(await movieTicket.hasAccessToVideo(buyer.address, VIDEO_HASH)).to.equal(true);
    });

    it("the legacy hasAccess() alias now mirrors hasAccessToVideo (no longer always-true)", async () => {
      const { movieTicket, owner, creator, buyer, stranger } = await loadFixture(deployFixture);
      // non-holder: false (the old placeholder would have returned true here)
      expect(await movieTicket.hasAccess(stranger.address, VIDEO_HASH)).to.equal(false);
      await mintPass(movieTicket, owner, buyer.address, creator.address);
      expect(await movieTicket.hasAccess(buyer.address, VIDEO_HASH)).to.equal(true);
      // delisting flips it off too
      await movieTicket.connect(owner).delistFilm(VIDEO_HASH, "DMCA");
      expect(await movieTicket.hasAccess(buyer.address, VIDEO_HASH)).to.equal(false);
    });
  });

  describe("Tier index (tierBalanceOf / highestTierMultiplier)", () => {
    it("defaults to 1.0x with no tickets", async () => {
      const { movieTicket, stranger } = await loadFixture(deployFixture);
      const [basic, deluxe, producer] = await movieTicket.tierBalanceOf(stranger.address);
      expect([basic, deluxe, producer]).to.deep.equal([0n, 0n, 0n]);
      expect(await movieTicket.highestTierMultiplier(stranger.address)).to.equal(100);
    });

    it("reflects the highest owned tier (Producer > Deluxe > Basic)", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address, { tier: Tier.BASIC });
      expect(await movieTicket.highestTierMultiplier(buyer.address)).to.equal(100);

      await mintPass(movieTicket, owner, buyer.address, creator.address, { tier: Tier.DELUXE });
      expect(await movieTicket.highestTierMultiplier(buyer.address)).to.equal(125);

      await mintPass(movieTicket, owner, buyer.address, creator.address, { tier: Tier.PRODUCER });
      expect(await movieTicket.highestTierMultiplier(buyer.address)).to.equal(150);

      const [basic, deluxe, producer] = await movieTicket.tierBalanceOf(buyer.address);
      expect([basic, deluxe, producer]).to.deep.equal([1n, 1n, 1n]);
    });

    it("drops the multiplier when the top-tier ticket is transferred away", async () => {
      const { movieTicket, owner, creator, buyer, stranger } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address, { tier: Tier.DELUXE });
      await mintPass(movieTicket, owner, buyer.address, creator.address, { tier: Tier.PRODUCER }); // tokenId 1
      expect(await movieTicket.highestTierMultiplier(buyer.address)).to.equal(150);

      await movieTicket.connect(buyer).transferFrom(buyer.address, stranger.address, 1);
      expect(await movieTicket.highestTierMultiplier(buyer.address)).to.equal(125); // back to Deluxe
      expect(await movieTicket.highestTierMultiplier(stranger.address)).to.equal(150); // gained Producer
    });
  });

  describe("withdraw", () => {
    it("lets the owner withdraw accumulated platform fees", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      const fee = (PRICE * FEE_BPS) / 10000n;
      await mintPass(movieTicket, owner, buyer.address, creator.address);

      // contract holds exactly the platform fee; withdraw moves it to the owner
      expect(await ethers.provider.getBalance(await movieTicket.getAddress())).to.equal(fee);
      await expect(movieTicket.connect(owner).withdraw()).to.changeEtherBalance(
        movieTicket,
        -fee
      );
    });

    it("is owner-only", async () => {
      const { movieTicket, stranger } = await loadFixture(deployFixture);
      await expect(movieTicket.connect(stranger).withdraw()).to.be.revertedWithCustomError(
        movieTicket,
        "OwnableUnauthorizedAccount"
      );
    });
  });
});
