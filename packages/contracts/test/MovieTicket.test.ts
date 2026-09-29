import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * MovieTicket.sol — df-cycle-12: immutable 75/25 through the shared RevenueSplitter.
 *
 * The owner-settable platformFeeBps and the owner withdraw() sweep are GONE.
 * Every mint splits immediately at purchase: 75% (+ rounding remainder) to the
 * creator, 25% straight to the owner. Nothing accrues in the contract.
 *
 * Unchanged behavior still covered: tiers, Producer rights, burnable tickets,
 * pausing, T16 delisting, O(1) access/tier indexes.
 *
 * Runs on the in-process hardhat EVM — no RPC, keys, or external services.
 */

// Tier enum mirror (Solidity: BASIC=0, DELUXE=1, PRODUCER=2)
const Tier = { BASIC: 0, DELUXE: 1, PRODUCER: 2 } as const;
// TicketType enum mirror (PERMANENT_PASS=0, BURNABLE_TICKET=1)
const TicketType = { PERMANENT_PASS: 0, BURNABLE_TICKET: 1 } as const;

const FEE_BPS = 2500n; // immutable 25% platform fee → 75% creator, from RevenueSplitter
const PRICE = ethers.parseEther("1"); // 1 ETH
const ODD_PRICE = 7n; // odd wei: fee = floor(7 * 2500 / 10000) = 1, creator = 6
const VIDEO_HASH = "ar://film-raging-midlife-master";

const feeOf = (v: bigint) => (v * FEE_BPS) / 10000n;
const shareOf = (v: bigint) => v - feeOf(v);

async function deployFixture() {
  const [owner, creator, buyer, stranger] = await ethers.getSigners();
  const movieTicket = await ethers.deployContract("MovieTicket", [], owner);
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
    it("exposes the immutable 2500 bps split from the shared splitter", async () => {
      const { movieTicket } = await loadFixture(deployFixture);
      expect(await movieTicket.PLATFORM_FEE_BPS()).to.equal(FEE_BPS);
    });

    it("sets the deployer as owner", async () => {
      const { movieTicket, owner } = await loadFixture(deployFixture);
      expect(await movieTicket.owner()).to.equal(owner.address);
    });

    it("has correct ERC721 name and symbol", async () => {
      const { movieTicket } = await loadFixture(deployFixture);
      expect(await movieTicket.name()).to.equal("Decentralflix Movie Ticket");
      expect(await movieTicket.symbol()).to.equal("DFMT");
    });
  });

  describe("immutable 75/25 split (df-cycle-12)", () => {
    it("the owner cannot change the split — no fee setter exists", async () => {
      const { movieTicket } = await loadFixture(deployFixture);
      for (const fn of ["setPlatformFee", "setPlatformFeeBps", "setFee", "updateFee"]) {
        expect(movieTicket.interface.hasFunction(fn), fn).to.equal(false);
      }
    });

    it("there is no owner withdraw sweep — nothing accrues in the contract", async () => {
      const { movieTicket } = await loadFixture(deployFixture);
      expect((movieTicket as unknown as Record<string, unknown>).withdraw).to.equal(undefined);
    });

    it("the creator cannot be redirected after mint — no creator setter exists", async () => {
      const { movieTicket } = await loadFixture(deployFixture);
      for (const fn of ["setCreator", "updateCreator"]) {
        expect(movieTicket.interface.hasFunction(fn), fn).to.equal(false);
      }
    });
  });

  describe("Fee math helpers", () => {
    it("computes the 75/25 split exactly from the immutable constant", async () => {
      const { movieTicket } = await loadFixture(deployFixture);
      const fee = await movieTicket.getPlatformFee(PRICE);
      const creatorShare = await movieTicket.getCreatorShare(PRICE);
      expect(fee).to.equal((PRICE * FEE_BPS) / 10000n);
      expect(creatorShare).to.equal(PRICE - fee);
      expect(fee + creatorShare).to.equal(PRICE);
      // 25% / 75% of 1 ETH
      expect(fee).to.equal(ethers.parseEther("0.25"));
      expect(creatorShare).to.equal(ethers.parseEther("0.75"));
    });
  });

  describe("mintPermanentPass splits 75/25 at purchase", () => {
    it("pays the creator 75% and the owner 25% immediately; contract retains 0", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      const fee = feeOf(PRICE);
      const creatorShare = shareOf(PRICE);

      // NB: the mint is onlyOwner, so the owner PAYS the price and receives
      // the fee back: net owner change = -price + fee = -creatorShare.
      await expect(
        mintPass(movieTicket, owner, buyer.address, creator.address)
      ).to.changeEtherBalances(
        [creator, owner, movieTicket],
        [creatorShare, -creatorShare, 0n]
      );
      expect(await ethers.provider.getBalance(await movieTicket.getAddress())).to.equal(0n);
    });

    it("emits VideoMinted, CreatorPaid and RevenueSplit with the right args", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      const fee = feeOf(PRICE);
      const creatorShare = shareOf(PRICE);

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
        .withArgs(0, creator.address, creatorShare)
        .and.to.emit(movieTicket, "RevenueSplit")
        .withArgs(creator.address, creatorShare, fee);
    });

    it("gives the creator the rounding remainder on odd wei amounts", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      // 7 wei: fee = floor(7 * 2500 / 10000) = 1, creator = 6. Never fee rounded up.
      await expect(
        mintPass(movieTicket, owner, buyer.address, creator.address, {
          price: ODD_PRICE,
          value: ODD_PRICE,
        })
      ).to.changeEtherBalances([creator, owner, movieTicket], [6n, -6n, 0n]);
      expect(6n + 1n).to.equal(7n);
    });

    it("reverts on a zero creator — the share is never redirected", async () => {
      const { movieTicket, owner, buyer } = await loadFixture(deployFixture);
      await expect(
        mintPass(movieTicket, owner, buyer.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(movieTicket, "MissingCreator");
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

    it("reverts when payment is below price (IncorrectPayment)", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await expect(
        mintPass(movieTicket, owner, buyer.address, creator.address, {
          value: PRICE - 1n,
        })
      )
        .to.be.revertedWithCustomError(movieTicket, "IncorrectPayment")
        .withArgs(PRICE, PRICE - 1n);
    });

    it("reverts on overpayment — with no sweep, excess would be locked forever", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await expect(
        mintPass(movieTicket, owner, buyer.address, creator.address, {
          value: PRICE + 1n,
        })
      )
        .to.be.revertedWithCustomError(movieTicket, "IncorrectPayment")
        .withArgs(PRICE, PRICE + 1n);
    });

    it("reverts when called by a non-owner", async () => {
      const { movieTicket, creator, buyer, stranger } = await loadFixture(deployFixture);
      await expect(
        mintPass(movieTicket, stranger, buyer.address, creator.address)
      ).to.be.revertedWithCustomError(movieTicket, "OwnableUnauthorizedAccount");
    });

    it("handles a zero-price mint with no transfers", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await expect(
        mintPass(movieTicket, owner, buyer.address, creator.address, {
          price: 0n,
          value: 0n,
        })
      ).to.changeEtherBalances([creator, owner, movieTicket], [0n, 0n, 0n]);
      expect(await movieTicket.ownerOf(0)).to.equal(buyer.address);
    });
  });

  describe("mintBurnableTicket + burnTicket", () => {
    it("splits 75/25 at purchase for burnable tickets too", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await expect(
        movieTicket
          .connect(owner)
          .mintBurnableTicket(buyer.address, creator.address, VIDEO_HASH, PRICE, Tier.BASIC, {
            value: PRICE,
          })
      ).to.changeEtherBalances(
        [creator, owner, movieTicket],
        [shareOf(PRICE), -shareOf(PRICE), 0n]
      );
    });

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

    it("totalMinted() counts every mint and is unaffected by burns (enumeration bound)", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      // Mint 3 burnable tickets -> token IDs 0, 1, 2 (dense from 0).
      for (let i = 0; i < 3; i++) {
        await movieTicket
          .connect(owner)
          .mintBurnableTicket(buyer.address, creator.address, VIDEO_HASH, PRICE, Tier.BASIC, {
            value: PRICE,
          });
      }
      expect(await movieTicket.totalMinted()).to.equal(3n);
      expect(await movieTicket.totalSupply()).to.equal(3n);

      // Burn token 1: supply shrinks, the mint counter must not.
      await movieTicket.connect(buyer).burnTicket(1);
      expect(await movieTicket.totalSupply()).to.equal(2n);
      expect(await movieTicket.totalMinted()).to.equal(3n);

      // Minting again extends the counter (next ID = 3), independent of supply.
      await movieTicket
        .connect(owner)
        .mintBurnableTicket(buyer.address, creator.address, VIDEO_HASH, PRICE, Tier.BASIC, {
          value: PRICE,
        });
      expect(await movieTicket.totalMinted()).to.equal(4n);
      expect(await movieTicket.ownerOf(3)).to.equal(buyer.address);
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

  describe("Emergency legal delisting (T16)", () => {
    it("flags a film as delisted with reason + timestamp, owner-only", async () => {
      const { movieTicket, owner, stranger } = await loadFixture(deployFixture);
      expect(await movieTicket.isFilmDelisted(VIDEO_HASH)).to.equal(false);

      await expect(
        movieTicket.connect(stranger).delistFilm(VIDEO_HASH, "CSAM")
      ).to.be.revertedWithCustomError(movieTicket, "OwnableUnauthorizedAccount");

      await expect(movieTicket.connect(owner).delistFilm(VIDEO_HASH, "CSAM")).to.emit(
        movieTicket,
        "ContentDelisted"
      );

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
      await movieTicket.connect(buyer).transferFrom(buyer.address, stranger.address, 0);

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

  describe("no owner sweep (df-cycle-12)", () => {
    it("the contract never holds funds after a mint — nothing to sweep", async () => {
      const { movieTicket, owner, creator, buyer } = await loadFixture(deployFixture);
      await mintPass(movieTicket, owner, buyer.address, creator.address);
      expect(await ethers.provider.getBalance(await movieTicket.getAddress())).to.equal(0n);
    });

    it("direct ETH transfers revert — no receive/fallback to trap funds", async () => {
      const { movieTicket, buyer } = await loadFixture(deployFixture);
      const addr = await movieTicket.getAddress();
      await expect(buyer.sendTransaction({ to: addr, value: 100n })).to.be.reverted;
    });
  });
});
