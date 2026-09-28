import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * SeederCredits.sol — P2P seeding credit ledger with attestor-signed claims.
 *
 * Unlike the other contracts, the gate here is a REAL ECDSA check: a claim is only
 * honored if accompanied by a platform-attestor signature over
 *   keccak256(seeder, arweaveTxId, claimedAmount, chainId)  (EIP-191 prefixed).
 * These tests produce genuine signatures and verify accounting, cooldown, attestor
 * rotation, signature binding, redemption, and admin slashing.
 *
 * Note: getTierMultiplier() is a Phase-0 stub that always returns 100 (1.0x), so
 * credited == claimed. That flat behavior is pinned below.
 */

const TXID = "ar://seeding-report-001";
const DAY = 24 * 60 * 60;

async function deployFixture() {
  const [owner, seeder, seeder2, stranger] = await ethers.getSigners();
  const movieTicket = await ethers.deployContract("MovieTicket", [2500n], owner);
  const seeder_credits = await ethers.deployContract(
    "SeederCredits",
    [await movieTicket.getAddress()],
    owner
  );
  const chainId = (await ethers.provider.getNetwork()).chainId;
  return { seederCredits: seeder_credits, movieTicket, owner, seeder, seeder2, stranger, chainId };
}

// Build the attestor signature the contract expects for a given seeder/claim.
async function signClaim(
  attestor: any,
  seederAddr: string,
  txid: string,
  amount: bigint,
  chainId: bigint
) {
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "string", "uint256", "uint256"],
    [seederAddr, txid, amount, chainId]
  );
  // signMessage over the 32 raw bytes applies the "\x19Ethereum Signed Message:\n32" prefix,
  // matching the contract's ethSignedMessageHash.
  return attestor.signMessage(ethers.getBytes(messageHash));
}

describe("SeederCredits", () => {
  describe("Deployment", () => {
    it("sets movieTicket and makes the owner the initial attestor", async () => {
      const { seederCredits, owner, movieTicket } = await loadFixture(deployFixture as any);
      expect(await seederCredits.platformAttestor()).to.equal(owner.address);
      expect(await seederCredits.MIN_CLAIM_COOLDOWN()).to.equal(BigInt(DAY));
    });

    it("rejects a zero MovieTicket address", async () => {
      await expect(
        ethers.deployContract("SeederCredits", [ethers.ZeroAddress])
      ).to.be.revertedWith("Invalid MovieTicket");
    });
  });

  describe("submitSeedingReport", () => {
    it("credits a seeder on a valid attestor-signed report (1.0x multiplier)", async () => {
      const { seederCredits, owner, seeder, chainId } = await loadFixture(deployFixture as any);
      const amount = 1000n;
      const sig = await signClaim(owner, seeder.address, TXID, amount, chainId);

      await expect(seederCredits.connect(seeder).submitSeedingReport(TXID, amount, sig))
        .to.emit(seederCredits, "CreditsEarned")
        .withArgs(seeder.address, amount, TXID, 100);

      expect(await seederCredits.credits(seeder.address)).to.equal(amount);
      expect(await seederCredits.lastClaimTimestamp(seeder.address)).to.be.greaterThan(0);
    });

    it("rejects an empty txid or zero amount", async () => {
      const { seederCredits, owner, seeder, chainId } = await loadFixture(deployFixture as any);
      const sigEmpty = await signClaim(owner, seeder.address, "", 1n, chainId);
      await expect(
        seederCredits.connect(seeder).submitSeedingReport("", 1n, sigEmpty)
      ).to.be.revertedWith("Invalid Arweave TX");

      const sigZero = await signClaim(owner, seeder.address, TXID, 0n, chainId);
      await expect(
        seederCredits.connect(seeder).submitSeedingReport(TXID, 0n, sigZero)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("rejects a signature from a non-attestor", async () => {
      const { seederCredits, stranger, seeder, chainId } = await loadFixture(deployFixture as any);
      const badSig = await signClaim(stranger, seeder.address, TXID, 1000n, chainId);
      await expect(
        seederCredits.connect(seeder).submitSeedingReport(TXID, 1000n, badSig)
      ).to.be.revertedWith("Invalid platform signature");
    });

    it("rejects a signature bound to a different seeder (no replay across accounts)", async () => {
      const { seederCredits, owner, seeder, seeder2, chainId } = await loadFixture(
        deployFixture as any
      );
      // attestor signs for seeder, but seeder2 tries to use it → msg.sender differs → hash differs
      const sigForSeeder1 = await signClaim(owner, seeder.address, TXID, 1000n, chainId);
      await expect(
        seederCredits.connect(seeder2).submitSeedingReport(TXID, 1000n, sigForSeeder1)
      ).to.be.revertedWith("Invalid platform signature");
    });

    it("rejects a signature bound to a different amount (no amount tampering)", async () => {
      const { seederCredits, owner, seeder, chainId } = await loadFixture(deployFixture as any);
      const sigFor1000 = await signClaim(owner, seeder.address, TXID, 1000n, chainId);
      await expect(
        seederCredits.connect(seeder).submitSeedingReport(TXID, 2000n, sigFor1000)
      ).to.be.revertedWith("Invalid platform signature");
    });

    it("enforces the 1-day claim cooldown", async () => {
      const { seederCredits, owner, seeder, chainId } = await loadFixture(deployFixture as any);
      const sig1 = await signClaim(owner, seeder.address, TXID, 1000n, chainId);
      await seederCredits.connect(seeder).submitSeedingReport(TXID, 1000n, sig1);

      const sig2 = await signClaim(owner, seeder.address, "ar://report-002", 500n, chainId);
      await expect(
        seederCredits.connect(seeder).submitSeedingReport("ar://report-002", 500n, sig2)
      ).to.be.revertedWith("Claim cooldown active");

      // after cooldown elapses, a fresh claim succeeds and accumulates
      await time.increase(DAY + 1);
      await seederCredits.connect(seeder).submitSeedingReport("ar://report-002", 500n, sig2);
      expect(await seederCredits.credits(seeder.address)).to.equal(1500n);
    });

    it("honors attestor rotation: old signer rejected, new signer accepted", async () => {
      const { seederCredits, owner, seeder, stranger, chainId } = await loadFixture(
        deployFixture as any
      );
      await expect(seederCredits.connect(owner).setPlatformAttestor(stranger.address))
        .to.emit(seederCredits, "PlatformAttestorUpdated")
        .withArgs(owner.address, stranger.address);

      const oldSig = await signClaim(owner, seeder.address, TXID, 1000n, chainId);
      await expect(
        seederCredits.connect(seeder).submitSeedingReport(TXID, 1000n, oldSig)
      ).to.be.revertedWith("Invalid platform signature");

      const newSig = await signClaim(stranger, seeder.address, TXID, 1000n, chainId);
      await expect(seederCredits.connect(seeder).submitSeedingReport(TXID, 1000n, newSig)).to.emit(
        seederCredits,
        "CreditsEarned"
      );
    });
  });

  describe("setPlatformAttestor", () => {
    it("is owner-only and rejects the zero address", async () => {
      const { seederCredits, owner, stranger } = await loadFixture(deployFixture as any);
      await expect(
        seederCredits.connect(stranger).setPlatformAttestor(stranger.address)
      ).to.be.revertedWithCustomError(seederCredits, "OwnableUnauthorizedAccount");
      await expect(
        seederCredits.connect(owner).setPlatformAttestor(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid attestor");
    });
  });

  describe("redeemCredits", () => {
    async function withCredits() {
      const fixt = await loadFixture(deployFixture as any);
      const { seederCredits, owner, seeder, chainId } = fixt;
      const sig = await signClaim(owner, seeder.address, TXID, 1000n, chainId);
      await seederCredits.connect(seeder).submitSeedingReport(TXID, 1000n, sig);
      return fixt;
    }

    it("spends credits and emits the reward type", async () => {
      const { seederCredits, seeder } = await withCredits();
      const rewardType = ethers.encodeBytes32String("MINT_DISCOUNT_10");
      await expect(seederCredits.connect(seeder).redeemCredits(400n, rewardType))
        .to.emit(seederCredits, "CreditsRedeemed")
        .withArgs(seeder.address, 400n, rewardType);
      expect(await seederCredits.credits(seeder.address)).to.equal(600n);
    });

    it("rejects redeeming more than the balance or zero", async () => {
      const { seederCredits, seeder } = await withCredits();
      const rt = ethers.encodeBytes32String("FREE_TICKET");
      await expect(seederCredits.connect(seeder).redeemCredits(0n, rt)).to.be.revertedWith(
        "Insufficient credits"
      );
      await expect(seederCredits.connect(seeder).redeemCredits(1001n, rt)).to.be.revertedWith(
        "Insufficient credits"
      );
    });
  });

  describe("admin", () => {
    it("emergencySlash reduces a seeder's balance, owner-only", async () => {
      const { seederCredits, owner, seeder, stranger, chainId } = await loadFixture(
        deployFixture as any
      );
      const sig = await signClaim(owner, seeder.address, TXID, 1000n, chainId);
      await seederCredits.connect(seeder).submitSeedingReport(TXID, 1000n, sig);

      await expect(
        seederCredits.connect(stranger).emergencySlash(seeder.address, 100n)
      ).to.be.revertedWithCustomError(seederCredits, "OwnableUnauthorizedAccount");

      await seederCredits.connect(owner).emergencySlash(seeder.address, 400n);
      expect(await seederCredits.credits(seeder.address)).to.equal(600n);

      // slashing more than the balance is a no-op (guarded by the if)
      await seederCredits.connect(owner).emergencySlash(seeder.address, 9999n);
      expect(await seederCredits.credits(seeder.address)).to.equal(600n);
    });

    it("getTierMultiplier reflects the seeder's highest MovieTicket tier", async () => {
      const { seederCredits, movieTicket, owner, seeder } = await loadFixture(deployFixture as any);
      // no tickets → 1.0x
      expect(await seederCredits.getTierMultiplier(seeder.address)).to.equal(100);
      // a Deluxe ticket → 1.25x
      await movieTicket
        .connect(owner)
        .mintPermanentPass(seeder.address, owner.address, "ar://film", ethers.parseEther("1"), 1, {
          value: ethers.parseEther("1"),
        });
      expect(await seederCredits.getTierMultiplier(seeder.address)).to.equal(125);
    });

    it("applies the tier multiplier to credited amounts (Producer = 1.5x)", async () => {
      const { seederCredits, movieTicket, owner, seeder, chainId } = await loadFixture(
        deployFixture as any
      );
      // give the seeder a Producer ticket → 1.5x
      await movieTicket
        .connect(owner)
        .mintPermanentPass(seeder.address, owner.address, "ar://film", ethers.parseEther("1"), 2, {
          value: ethers.parseEther("1"),
        });
      const sig = await signClaim(owner, seeder.address, TXID, 1000n, chainId);
      await expect(seederCredits.connect(seeder).submitSeedingReport(TXID, 1000n, sig))
        .to.emit(seederCredits, "CreditsEarned")
        .withArgs(seeder.address, 1500n, TXID, 150); // 1000 * 1.5
      expect(await seederCredits.credits(seeder.address)).to.equal(1500n);
    });
  });

  describe("claim pausing", () => {
    it("blocks claims while paused and resumes after unpause, owner-only", async () => {
      const { seederCredits, owner, seeder, stranger, chainId } = await loadFixture(
        deployFixture as any
      );
      await expect(seederCredits.connect(stranger).pauseClaims()).to.be.revertedWithCustomError(
        seederCredits,
        "OwnableUnauthorizedAccount"
      );

      await expect(seederCredits.connect(owner).pauseClaims())
        .to.emit(seederCredits, "ClaimsPauseToggled")
        .withArgs(true);
      expect(await seederCredits.claimsPaused()).to.equal(true);

      const sig = await signClaim(owner, seeder.address, TXID, 1000n, chainId);
      await expect(
        seederCredits.connect(seeder).submitSeedingReport(TXID, 1000n, sig)
      ).to.be.revertedWith("Claims paused");

      await expect(seederCredits.connect(owner).unpauseClaims())
        .to.emit(seederCredits, "ClaimsPauseToggled")
        .withArgs(false);
      await expect(seederCredits.connect(seeder).submitSeedingReport(TXID, 1000n, sig)).to.emit(
        seederCredits,
        "CreditsEarned"
      );
    });
  });
});
