import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * Reviews.sol — NFT-gated, one-per-owner film reviews.
 *
 * Reviews gates writes on MovieTicket.hasAccessToVideo() OR FilmmakerCampaign.hasCrowdfundAccess().
 * MovieTicket.hasAccessToVideo() is now a REAL O(1) on-chain check (reverse access index), so the
 * "real contracts" block below proves end-to-end that an actual ticket holder can review while a
 * non-holder cannot. (FilmmakerCampaign.hasCrowdfundAccess remains a Phase-0 stub returning false.)
 *
 * The "logic via mock gate" block uses MockTicketGate (a test-only stand-in for the access view)
 * to exercise review LOGIC — rating bounds, one-per-user edit, enumeration, delisting — with
 * access toggled directly.
 */

const VIDEO = "ar://film-raging-midlife";

describe("Reviews", () => {
  // ---- End-to-end against the REAL contracts (real on-chain access) ----
  describe("Gate against the real MovieTicket access index", () => {
    const PRICE = ethers.parseEther("1");

    async function realFixture() {
      const [owner, holder, viewer, backer] = await ethers.getSigners();
      const movieTicket = await ethers.deployContract("MovieTicket", [], owner);
      const campaign = await ethers.deployContract(
        "FilmmakerCampaign",
        [await movieTicket.getAddress()],
        owner
      );
      const reviews = await ethers.deployContract(
        "Reviews",
        [await movieTicket.getAddress(), await campaign.getAddress()],
        owner
      );
      return { reviews, movieTicket, campaign, owner, holder, viewer, backer };
    }

    it("lets a real ticket holder submit a review and blocks a non-holder", async () => {
      const { reviews, movieTicket, owner, holder, viewer } = await loadFixture(realFixture);
      // owner mints a permanent pass for VIDEO to `holder`
      await movieTicket
        .connect(owner)
        .mintPermanentPass(holder.address, owner.address, VIDEO, PRICE, 0, { value: PRICE });

      // non-holder is rejected
      await expect(
        reviews.connect(viewer).submitReview(VIDEO, 5, "no ticket")
      ).to.be.revertedWith(
        "Must own a MovieTicket or crowdfund InvestmentNFT for this video to review"
      );

      // holder can review — proves the full on-chain access path works now
      await expect(reviews.connect(holder).submitReview(VIDEO, 5, "Owned it, loved it")).to.emit(
        reviews,
        "ReviewSubmitted"
      );
      expect(await reviews.hasReviewed(VIDEO, holder.address)).to.equal(true);
    });

    it("lets a crowdfund backer review via hasCrowdfundAccess once the campaign links the film", async () => {
      const { reviews, campaign, owner, backer } = await loadFixture(realFixture);
      const future = BigInt((await time.latest()) + 24 * 60 * 60);
      await campaign
        .connect(owner)
        .launchCampaign(
          "ar://pitch",
          ethers.parseEther("1"),
          [ethers.parseEther("1")],
          [ethers.parseEther("1"), ethers.parseEther("2"), ethers.parseEther("3")],
          [10n, 10n, 10n],
          future
        );
      await campaign.connect(backer).contribute(0, 0, { value: ethers.parseEther("1") });

      // not yet linked → no access → review rejected
      await expect(reviews.connect(backer).submitReview(VIDEO, 4, "backed it")).to.be.revertedWith(
        "Must own a MovieTicket or crowdfund InvestmentNFT for this video to review"
      );

      await campaign.connect(owner).setCampaignVideo(0, VIDEO);
      await expect(reviews.connect(backer).submitReview(VIDEO, 4, "backed it, watched it")).to.emit(
        reviews,
        "ReviewSubmitted"
      );
      expect(await reviews.hasReviewed(VIDEO, backer.address)).to.equal(true);
    });

    it("rejects reviews on a delisted film with the legal message", async () => {
      const { reviews, movieTicket, owner, holder } = await loadFixture(realFixture);
      await movieTicket
        .connect(owner)
        .mintPermanentPass(holder.address, owner.address, VIDEO, PRICE, 0, { value: PRICE });
      await movieTicket.connect(owner).delistFilm(VIDEO, "CSAM");
      await expect(reviews.connect(holder).submitReview(VIDEO, 5, "x")).to.be.revertedWith(
        "Film has been delisted for legal reasons"
      );
    });

    it("read views are empty by default", async () => {
      const { reviews, viewer } = await loadFixture(realFixture);
      expect(await reviews.getReviewCount(VIDEO)).to.equal(0);
      expect(await reviews.hasReviewed(VIDEO, viewer.address)).to.equal(false);
      expect((await reviews.getReviews(VIDEO)).length).to.equal(0);
    });
  });

  // ---- Real review logic, exercised via a mock access gate ----
  describe("Review logic (access granted via mock gate)", () => {
    async function mockFixture() {
      const [owner, alice, bob] = await ethers.getSigners();
      const gate = await ethers.deployContract("MockTicketGate", [], owner);
      // filmmakerCampaign = address(0) → that branch short-circuits, access comes from the gate
      const reviews = await ethers.deployContract(
        "Reviews",
        [await gate.getAddress(), ethers.ZeroAddress],
        owner
      );
      await gate.setGlobalAccess(true); // everyone "owns" access for these logic tests
      return { reviews, gate, owner, alice, bob };
    }

    it("lets a verified owner submit a review and records it", async () => {
      const { reviews, alice } = await loadFixture(mockFixture);
      await expect(reviews.connect(alice).submitReview(VIDEO, 5, "A masterpiece"))
        .to.emit(reviews, "ReviewSubmitted")
        .withArgs(
          // string indexed → supply the pre-image; the matcher hashes it for the topic compare
          VIDEO,
          alice.address,
          5,
          "A masterpiece",
          (t: bigint) => t > 0n
        );

      expect(await reviews.hasReviewed(VIDEO, alice.address)).to.equal(true);
      expect(await reviews.getReviewCount(VIDEO)).to.equal(1);
      const r = await reviews.getReview(VIDEO, alice.address);
      expect(r.reviewer).to.equal(alice.address);
      expect(r.rating).to.equal(5);
      expect(r.comment).to.equal("A masterpiece");
    });

    it("enforces rating 1-5 and comment length 1-500", async () => {
      const { reviews, alice } = await loadFixture(mockFixture);
      await expect(reviews.connect(alice).submitReview(VIDEO, 0, "x")).to.be.revertedWith(
        "Rating must be 1-5"
      );
      await expect(reviews.connect(alice).submitReview(VIDEO, 6, "x")).to.be.revertedWith(
        "Rating must be 1-5"
      );
      await expect(reviews.connect(alice).submitReview(VIDEO, 3, "")).to.be.revertedWith(
        "Comment too long"
      );
      await expect(
        reviews.connect(alice).submitReview(VIDEO, 3, "a".repeat(501))
      ).to.be.revertedWith("Comment too long");
      // 500 is allowed
      await expect(reviews.connect(alice).submitReview(VIDEO, 3, "a".repeat(500))).to.not.be
        .reverted;
    });

    it("allows editing (one review per user) without growing the count, emitting ReviewUpdated", async () => {
      const { reviews, alice } = await loadFixture(mockFixture);
      await reviews.connect(alice).submitReview(VIDEO, 4, "First take");
      expect(await reviews.getReviewCount(VIDEO)).to.equal(1);

      await expect(reviews.connect(alice).submitReview(VIDEO, 2, "Changed my mind")).to.emit(
        reviews,
        "ReviewUpdated"
      );
      // still a single review, now updated
      expect(await reviews.getReviewCount(VIDEO)).to.equal(1);
      const r = await reviews.getReview(VIDEO, alice.address);
      expect(r.rating).to.equal(2);
      expect(r.comment).to.equal("Changed my mind");
    });

    it("enumerates multiple distinct reviewers", async () => {
      const { reviews, alice, bob } = await loadFixture(mockFixture);
      await reviews.connect(alice).submitReview(VIDEO, 5, "Loved it");
      await reviews.connect(bob).submitReview(VIDEO, 3, "It was fine");

      expect(await reviews.getReviewCount(VIDEO)).to.equal(2);
      const all = await reviews.getReviews(VIDEO);
      const reviewers = all.map((r: any) => r.reviewer);
      expect(reviewers).to.have.members([alice.address, bob.address]);
    });

    it("hides reviews once a film is delisted, and restores them when re-listed", async () => {
      const { reviews, gate, alice } = await loadFixture(mockFixture);
      await reviews.connect(alice).submitReview(VIDEO, 5, "Great");
      expect(await reviews.getReviewCount(VIDEO)).to.equal(1);

      await gate.setDelisted(VIDEO, true);
      expect(await reviews.getReviewCount(VIDEO)).to.equal(0);
      expect(await reviews.hasReviewed(VIDEO, alice.address)).to.equal(false);
      expect((await reviews.getReviews(VIDEO)).length).to.equal(0);
      expect((await reviews.getReview(VIDEO, alice.address)).reviewer).to.equal(ethers.ZeroAddress);
      // submitting to a delisted film is blocked
      await expect(reviews.connect(alice).submitReview(VIDEO, 1, "y")).to.be.revertedWith(
        "Film has been delisted for legal reasons"
      );

      // re-listing brings the stored review back
      await gate.setDelisted(VIDEO, false);
      expect(await reviews.getReviewCount(VIDEO)).to.equal(1);
    });

    it("blocks a viewer who does not have access", async () => {
      const { reviews, gate, bob } = await loadFixture(mockFixture);
      await gate.setGlobalAccess(false); // revoke blanket access
      await expect(reviews.connect(bob).submitReview(VIDEO, 5, "nope")).to.be.revertedWith(
        "Must own a MovieTicket or crowdfund InvestmentNFT for this video to review"
      );
      // grant targeted access and it works
      await gate.setAccess(bob.address, VIDEO, true);
      await expect(reviews.connect(bob).submitReview(VIDEO, 5, "now allowed")).to.not.be.reverted;
    });
  });
});
