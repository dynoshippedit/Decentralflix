import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * FilmmakerCampaign.sol — milestone-escrow crowdfunding tests.
 *
 * This is the second money contract: it custodies backer funds in escrow and releases
 * tranches to filmmakers on owner-approved milestones, with refunds if a campaign fails.
 * Covers the real value flows plus refund safety. Runs on the in-process hardhat EVM.
 *
 * NOTE: two functions are intentional Phase-0 stubs that hardcode `return false`
 * (_ownsProducerInvestment + hasCrowdfundAccess). The last `describe` block pins that
 * current behavior so the limitation is explicit and a future implementer gets a failing
 * test reminding them to update these assertions.
 */

const Tier = { BASIC: 0, DELUXE: 1, PRODUCER: 2 } as const;
const Status = { ACTIVE: 0, FUNDED: 1, FAILED: 2, DELIVERED: 3 } as const;

const META = "ar://campaign-the-last-signal";
const DAY = 24 * 60 * 60;

async function deployFixture() {
  const [owner, filmmaker, backer1, backer2, stranger] = await ethers.getSigners();
  const movieTicket = await ethers.deployContract("MovieTicket", [3000n], owner);
  await movieTicket.waitForDeployment();
  const campaign = await ethers.deployContract(
    "FilmmakerCampaign",
    [await movieTicket.getAddress()],
    owner
  );
  await campaign.waitForDeployment();
  return { movieTicket, campaign, owner, filmmaker, backer1, backer2, stranger };
}

// Launch a standard campaign: target 2 ETH, two 1-ETH milestones, tier prices [1,2,3] ETH.
async function launchStandard(campaign: any, filmmaker: any, deadlineOffset = DAY) {
  const target = ethers.parseEther("2");
  const milestones = [ethers.parseEther("1"), ethers.parseEther("1")];
  const tierPrices = [ethers.parseEther("1"), ethers.parseEther("2"), ethers.parseEther("3")];
  const tierSupplies = [10n, 10n, 10n];
  const deadline = BigInt((await time.latest()) + deadlineOffset);
  const tx = await campaign
    .connect(filmmaker)
    .launchCampaign(META, target, milestones, tierPrices, tierSupplies, deadline);
  await tx.wait();
  return { target, milestones, tierPrices, tierSupplies, deadline };
}

describe("FilmmakerCampaign", () => {
  describe("Deployment", () => {
    it("stores the MovieTicket address and defaults", async () => {
      const { campaign, movieTicket } = await loadFixture(deployFixture);
      expect(await campaign.movieTicket()).to.equal(await movieTicket.getAddress());
      expect(await campaign.nextCampaignId()).to.equal(0);
      expect(await campaign.aiReviewWindow()).to.equal(72n * 3600n);
      expect(await campaign.name()).to.equal("Decentralflix Crowdfund Pass");
      expect(await campaign.symbol()).to.equal("DFCP");
    });

    it("rejects a zero MovieTicket address", async () => {
      await expect(
        ethers.deployContract("FilmmakerCampaign", [ethers.ZeroAddress])
      ).to.be.revertedWith("Invalid MovieTicket");
    });
  });

  describe("setAIReviewWindow", () => {
    it("accepts 48-72h and rejects outside that range, owner-only", async () => {
      const { campaign, owner, stranger } = await loadFixture(deployFixture);
      await expect(campaign.connect(owner).setAIReviewWindow(48)).to.emit(
        campaign,
        "AIReviewWindowUpdated"
      );
      expect(await campaign.aiReviewWindow()).to.equal(48n * 3600n);

      await expect(campaign.connect(owner).setAIReviewWindow(47)).to.be.revertedWith(
        "Window must be 48-72 hours"
      );
      await expect(campaign.connect(owner).setAIReviewWindow(73)).to.be.revertedWith(
        "Window must be 48-72 hours"
      );
      await expect(
        campaign.connect(stranger).setAIReviewWindow(60)
      ).to.be.revertedWithCustomError(campaign, "OwnableUnauthorizedAccount");
    });
  });

  describe("launchCampaign", () => {
    it("creates a campaign with the right fields and emits, open to any filmmaker", async () => {
      const { campaign, filmmaker } = await loadFixture(deployFixture);
      const { target, deadline } = await launchStandard(campaign, filmmaker);

      const c = await campaign.campaigns(0);
      expect(c.filmmaker).to.equal(filmmaker.address);
      expect(c.metadataHash).to.equal(META);
      expect(c.target).to.equal(target);
      expect(c.raised).to.equal(0);
      expect(c.deadline).to.equal(deadline);
      expect(c.status).to.equal(Status.ACTIVE);
      expect(await campaign.nextCampaignId()).to.equal(1);
    });

    it("validates inputs", async () => {
      const { campaign, filmmaker } = await loadFixture(deployFixture);
      const future = BigInt((await time.latest()) + DAY);
      const prices = [1n, 2n, 3n] as [bigint, bigint, bigint];
      const supplies = [10n, 10n, 10n] as [bigint, bigint, bigint];

      await expect(
        campaign.connect(filmmaker).launchCampaign("", 1n, [1n], prices, supplies, future)
      ).to.be.revertedWith("Metadata required");
      await expect(
        campaign.connect(filmmaker).launchCampaign(META, 0n, [1n], prices, supplies, future)
      ).to.be.revertedWith("Invalid campaign");
      await expect(
        campaign.connect(filmmaker).launchCampaign(META, 1n, [], prices, supplies, future)
      ).to.be.revertedWith("Invalid campaign");
      await expect(
        campaign
          .connect(filmmaker)
          .launchCampaign(META, 1n, [1n], prices, supplies, BigInt(await time.latest()))
      ).to.be.revertedWith("Deadline in past");
    });
  });

  describe("contribute", () => {
    it("mints an InvestmentNFT and records escrow/raised/backer totals", async () => {
      const { campaign, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      const price = ethers.parseEther("1"); // BASIC

      await expect(
        campaign.connect(backer1).contribute(0, Tier.BASIC, { value: price })
      ).to.emit(campaign, "Contribution");

      expect(await campaign.ownerOf(0)).to.equal(backer1.address);
      expect(await campaign.balanceOf(backer1.address)).to.equal(1);
      expect(await campaign.tokenCampaign(0)).to.equal(0);
      expect(await campaign.tokenTiers(0)).to.equal(Tier.BASIC);
      expect(await campaign.campaignEscrow(0)).to.equal(price);
      expect(await campaign.backerTotals(0, backer1.address)).to.equal(price);

      const c = await campaign.campaigns(0);
      expect(c.raised).to.equal(price);
      expect(c.status).to.equal(Status.ACTIVE);
    });

    it("holds contributed funds in the contract escrow", async () => {
      const { campaign, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      const price = ethers.parseEther("1");
      await expect(
        campaign.connect(backer1).contribute(0, Tier.BASIC, { value: price })
      ).to.changeEtherBalance(campaign, price);
    });

    it("flips status to FUNDED once the target is reached", async () => {
      const { campaign, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker); // target 2 ETH
      // PRODUCER tier costs 3 ETH > 2 ETH target → funds in one go
      await campaign.connect(backer1).contribute(0, Tier.PRODUCER, {
        value: ethers.parseEther("3"),
      });
      expect((await campaign.campaigns(0)).status).to.equal(Status.FUNDED);
      // further contributions rejected once not ACTIVE
      await expect(
        campaign.connect(backer1).contribute(0, Tier.BASIC, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Not active");
    });

    it("enforces tier validity, supply, and payment", async () => {
      const { campaign, filmmaker, backer1, backer2 } = await loadFixture(deployFixture);
      // tiny supply on BASIC to test sold-out
      const future = BigInt((await time.latest()) + DAY);
      await campaign
        .connect(filmmaker)
        .launchCampaign(
          META,
          ethers.parseEther("100"),
          [ethers.parseEther("1")],
          [ethers.parseEther("1"), ethers.parseEther("2"), ethers.parseEther("3")],
          [1n, 5n, 5n],
          future
        );

      await expect(
        campaign.connect(backer1).contribute(0, Tier.BASIC, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Insufficient payment");

      // buy the only BASIC seat
      await campaign.connect(backer1).contribute(0, Tier.BASIC, { value: ethers.parseEther("1") });
      await expect(
        campaign.connect(backer2).contribute(0, Tier.BASIC, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Tier sold out");
    });

    it("rejects contributions after the deadline", async () => {
      const { campaign, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker, DAY);
      await time.increase(DAY + 1);
      await expect(
        campaign.connect(backer1).contribute(0, Tier.BASIC, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Deadline passed");
    });
  });

  describe("approveMilestoneAndRelease", () => {
    it("releases a tranche to the filmmaker and marks DELIVERED when all are approved", async () => {
      const { campaign, owner, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker); // 2 milestones of 1 ETH
      await campaign.connect(backer1).contribute(0, Tier.PRODUCER, {
        value: ethers.parseEther("3"),
      });

      const one = ethers.parseEther("1");
      // release milestone 0
      await expect(
        campaign.connect(owner).approveMilestoneAndRelease(0, 0)
      ).to.changeEtherBalance(filmmaker, one);
      expect(await campaign.campaignEscrow(0)).to.equal(ethers.parseEther("2"));
      expect((await campaign.campaigns(0)).status).to.equal(Status.FUNDED);

      // release milestone 1 → all approved → DELIVERED
      const releaseTx = campaign.connect(owner).approveMilestoneAndRelease(0, 1);
      await expect(releaseTx).to.changeEtherBalance(filmmaker, one);
      await expect(releaseTx).to.emit(campaign, "MilestoneReleased");
      expect(await campaign.campaignEscrow(0)).to.equal(ethers.parseEther("1"));
      expect((await campaign.campaigns(0)).status).to.equal(Status.DELIVERED);
    });

    it("prevents double release and non-owner release", async () => {
      const { campaign, owner, filmmaker, backer1, stranger } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      await campaign.connect(backer1).contribute(0, Tier.PRODUCER, {
        value: ethers.parseEther("3"),
      });
      await campaign.connect(owner).approveMilestoneAndRelease(0, 0);
      await expect(
        campaign.connect(owner).approveMilestoneAndRelease(0, 0)
      ).to.be.revertedWith("Already released");
      await expect(
        campaign.connect(stranger).approveMilestoneAndRelease(0, 1)
      ).to.be.revertedWithCustomError(campaign, "OwnableUnauthorizedAccount");
    });

    it("reverts when escrow cannot cover the milestone", async () => {
      const { campaign, owner, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker); // milestones are 1 ETH each
      // contribute only 1 ETH (escrow < milestone1 after releasing milestone0)
      await campaign.connect(backer1).contribute(0, Tier.BASIC, { value: ethers.parseEther("1") });
      await campaign.connect(owner).approveMilestoneAndRelease(0, 0); // drains the 1 ETH
      await expect(
        campaign.connect(owner).approveMilestoneAndRelease(0, 1)
      ).to.be.revertedWith("Insufficient escrow");
    });
  });

  describe("claimRefund", () => {
    it("refunds backers after a failed (under-target, past-deadline) campaign", async () => {
      const { campaign, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker); // target 2 ETH
      const amt = ethers.parseEther("1");
      await campaign.connect(backer1).contribute(0, Tier.BASIC, { value: amt }); // under target
      await time.increase(DAY + 1); // past deadline, still under target

      const refundTx = campaign.connect(backer1).claimRefund(0);
      await expect(refundTx).to.changeEtherBalance(backer1, amt);
      await expect(refundTx).to.emit(campaign, "RefundClaimed");
      expect(await campaign.backerTotals(0, backer1.address)).to.equal(0);
      expect(await campaign.campaignEscrow(0)).to.equal(0);

      // cannot double-refund
      await expect(campaign.connect(backer1).claimRefund(0)).to.be.revertedWith("No refund due");
    });

    it("refuses refunds while the campaign is still refundable-ineligible", async () => {
      const { campaign, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      await campaign.connect(backer1).contribute(0, Tier.BASIC, { value: ethers.parseEther("1") });
      // before deadline → not refundable
      await expect(campaign.connect(backer1).claimRefund(0)).to.be.revertedWith("Not refundable");
    });
  });

  describe("emergencyRefundAll", () => {
    it("marks a campaign FAILED so backers can pull refunds immediately, owner-only", async () => {
      const { campaign, owner, filmmaker, backer1, stranger } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      const amt = ethers.parseEther("1");
      await campaign.connect(backer1).contribute(0, Tier.BASIC, { value: amt });

      await expect(
        campaign.connect(stranger).emergencyRefundAll(0)
      ).to.be.revertedWithCustomError(campaign, "OwnableUnauthorizedAccount");
      await expect(campaign.connect(owner).emergencyRefundAll(99)).to.be.revertedWith(
        "Campaign does not exist"
      );

      await expect(campaign.connect(owner).emergencyRefundAll(0))
        .to.emit(campaign, "CampaignFailed")
        .withArgs(0);
      expect((await campaign.campaigns(0)).status).to.equal(Status.FAILED);

      // backer can refund right away (before deadline) because the campaign is FAILED
      await expect(campaign.connect(backer1).claimRefund(0)).to.changeEtherBalance(backer1, amt);
    });
  });

  describe("setCampaignVideo", () => {
    it("links a video hash when called by filmmaker or owner, with guards", async () => {
      const { campaign, owner, filmmaker, stranger } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);

      await expect(campaign.connect(stranger).setCampaignVideo(0, "ar://film")).to.be.revertedWith(
        "Not authorized"
      );
      await expect(campaign.connect(filmmaker).setCampaignVideo(0, "")).to.be.revertedWith(
        "Video hash required"
      );
      await expect(campaign.connect(owner).setCampaignVideo(99, "ar://film")).to.be.revertedWith(
        "Campaign does not exist"
      );

      await expect(campaign.connect(filmmaker).setCampaignVideo(0, "ar://film-master"))
        .to.emit(campaign, "CampaignVideoLinked")
        .withArgs(0, "ar://film-master");
      expect(await campaign.campaignVideoHash(0)).to.equal("ar://film-master");
    });
  });

  describe("hasCrowdfundAccess (real on-chain access)", () => {
    const FILM = "ar://film-master";

    it("grants access to a backer once the campaign is linked to a video, and only that film", async () => {
      const { campaign, filmmaker, backer1, backer2 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      await campaign.connect(backer1).contribute(0, Tier.PRODUCER, {
        value: ethers.parseEther("3"),
      });

      // before linking → no film resolves to this campaign
      expect(await campaign.hasCrowdfundAccess(backer1.address, FILM)).to.equal(false);

      await campaign.connect(filmmaker).setCampaignVideo(0, FILM);
      expect(await campaign.hasCrowdfundAccess(backer1.address, FILM)).to.equal(true);
      // a non-backer gets nothing; an unrelated film gets nothing
      expect(await campaign.hasCrowdfundAccess(backer2.address, FILM)).to.equal(false);
      expect(await campaign.hasCrowdfundAccess(backer1.address, "ar://other")).to.equal(false);
      expect(await campaign.campaignBackerTokens(0, backer1.address)).to.equal(1);
    });

    it("moves crowdfund access when the InvestmentNFT is transferred", async () => {
      const { campaign, filmmaker, backer1, backer2 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      await campaign.connect(backer1).contribute(0, Tier.BASIC, { value: ethers.parseEther("1") });
      await campaign.connect(filmmaker).setCampaignVideo(0, FILM);
      expect(await campaign.hasCrowdfundAccess(backer1.address, FILM)).to.equal(true);

      // token 0 is backer1's InvestmentNFT
      await campaign.connect(backer1).transferFrom(backer1.address, backer2.address, 0);
      expect(await campaign.hasCrowdfundAccess(backer1.address, FILM)).to.equal(false);
      expect(await campaign.hasCrowdfundAccess(backer2.address, FILM)).to.equal(true);
    });

    it("re-linking a campaign to a new film clears access to the old film", async () => {
      const { campaign, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      await campaign.connect(backer1).contribute(0, Tier.BASIC, { value: ethers.parseEther("1") });
      await campaign.connect(filmmaker).setCampaignVideo(0, FILM);
      expect(await campaign.hasCrowdfundAccess(backer1.address, FILM)).to.equal(true);

      await campaign.connect(filmmaker).setCampaignVideo(0, "ar://film-v2");
      expect(await campaign.hasCrowdfundAccess(backer1.address, "ar://film-v2")).to.equal(true);
      expect(await campaign.hasCrowdfundAccess(backer1.address, FILM)).to.equal(false);
    });
  });

  describe("AI milestone proofs (Producer-tier gated)", () => {
    it("lets a Producer-tier backer submit a proof; blocks non-producers and unrelated users", async () => {
      const { campaign, filmmaker, backer1, backer2, stranger } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      // small backer first so the campaign stays ACTIVE for both contributions
      await campaign.connect(backer2).contribute(0, Tier.BASIC, { value: ethers.parseEther("1") });
      await campaign.connect(backer1).contribute(0, Tier.PRODUCER, {
        value: ethers.parseEther("3"),
      });

      // a non-backer cannot submit
      await expect(
        campaign.connect(stranger).submitAIProof(0, 0, "ar://proof")
      ).to.be.revertedWith("Must own Producer InvestmentNFT");
      // a BASIC-tier backer cannot submit (producer-tier gate)
      await expect(
        campaign.connect(backer2).submitAIProof(0, 0, "ar://proof")
      ).to.be.revertedWith("Must own Producer InvestmentNFT");

      // the Producer-tier backer can — proves the gate works on-chain now
      await expect(campaign.connect(backer1).submitAIProof(0, 0, "ar://proof-001"))
        .to.emit(campaign, "MilestoneSubmitted")
        .withArgs(0, 0, "ar://proof-001", true);

      const c = await campaign.campaigns(0);
      expect(c.status).to.equal(Status.FUNDED); // 3 ETH > 2 ETH target
    });

    it("rejects a second submission for the same milestone", async () => {
      const { campaign, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      await campaign.connect(backer1).contribute(0, Tier.PRODUCER, {
        value: ethers.parseEther("3"),
      });
      await campaign.connect(backer1).submitAIProof(0, 0, "ar://proof-001");
      await expect(
        campaign.connect(backer1).submitAIProof(0, 0, "ar://proof-002")
      ).to.be.revertedWith("Already submitted");
    });

    it("owner can approve the AI submission within the review window", async () => {
      const { campaign, owner, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      await campaign.connect(backer1).contribute(0, Tier.PRODUCER, {
        value: ethers.parseEther("3"),
      });
      await campaign.connect(backer1).submitAIProof(0, 0, "ar://proof-001");

      await expect(campaign.connect(owner).reviewAISubmission(0, 0, true))
        .to.emit(campaign, "AIReviewed")
        .withArgs(0, 0, true);
    });

    it("a rejected AI submission clears the proof so it can be resubmitted", async () => {
      const { campaign, owner, filmmaker, backer1 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      await campaign.connect(backer1).contribute(0, Tier.PRODUCER, {
        value: ethers.parseEther("3"),
      });
      await campaign.connect(backer1).submitAIProof(0, 0, "ar://bad-proof");
      await campaign.connect(owner).reviewAISubmission(0, 0, false);
      // proof cleared → resubmission allowed
      await expect(campaign.connect(backer1).submitAIProof(0, 0, "ar://good-proof")).to.emit(
        campaign,
        "MilestoneSubmitted"
      );
    });

    it("moves the producer-submit right when the Producer InvestmentNFT is transferred", async () => {
      const { campaign, filmmaker, backer1, backer2 } = await loadFixture(deployFixture);
      await launchStandard(campaign, filmmaker);
      await campaign.connect(backer1).contribute(0, Tier.PRODUCER, {
        value: ethers.parseEther("3"),
      });
      // token 0 is backer1's Producer InvestmentNFT
      await campaign.connect(backer1).transferFrom(backer1.address, backer2.address, 0);

      // backer1 lost the producer right; backer2 gained it
      await expect(
        campaign.connect(backer1).submitAIProof(0, 0, "ar://proof")
      ).to.be.revertedWith("Must own Producer InvestmentNFT");
      await expect(campaign.connect(backer2).submitAIProof(0, 0, "ar://proof")).to.emit(
        campaign,
        "MilestoneSubmitted"
      );
    });
  });
});
