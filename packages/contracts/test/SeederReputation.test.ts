import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const HOUR = 3600;
const GB = 1_000_000_000n;

async function deployFixture() {
  const [owner, attestor2, seeder, stranger] = await ethers.getSigners();
  const reputation = await ethers.deployContract("SeederReputation", [], owner);
  return { reputation, owner, attestor2, seeder, stranger };
}

describe("SeederReputation", () => {
  describe("attestor setup", () => {
    it("starts with the owner as attestor", async () => {
      const { reputation, owner } = await loadFixture(deployFixture as any);
      expect(await reputation.attestor()).to.equal(owner.address);
      expect(await reputation.owner()).to.equal(owner.address);
    });

    it("rotates the attestor via setAttestor and emits AttestorUpdated", async () => {
      const { reputation, owner, attestor2 } = await loadFixture(deployFixture as any);
      await expect(reputation.connect(owner).setAttestor(attestor2.address))
        .to.emit(reputation, "AttestorUpdated")
        .withArgs(owner.address, attestor2.address);
      expect(await reputation.attestor()).to.equal(attestor2.address);
    });

    it("reverts setAttestor for non-owner and for the zero address", async () => {
      const { reputation, owner, stranger } = await loadFixture(deployFixture as any);
      await expect(reputation.connect(stranger).setAttestor(stranger.address))
        .to.be.revertedWithCustomError(reputation, "OwnableUnauthorizedAccount")
        .withArgs(stranger.address);
      await expect(reputation.connect(owner).setAttestor(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(reputation, "InvalidAttestor");
    });
  });

  describe("reportSeeding", () => {
    it("accumulates stats and emits SeedingReported", async () => {
      const { reputation, owner, seeder } = await loadFixture(deployFixture as any);
      await expect(
        reputation.connect(owner).reportSeeding(seeder.address, 2 * HOUR, 3n * GB, 5n, 7n)
      )
        .to.emit(reputation, "SeedingReported")
        .withArgs(seeder.address, 7n, BigInt(2 * HOUR), 3n * GB, 5n);

      const stats = await reputation.getStats(seeder.address);
      expect(stats.uptimeSecs).to.equal(BigInt(2 * HOUR));
      expect(stats.bytesServed).to.equal(3n * GB);
      expect(stats.validProofs).to.equal(5n);
      expect(stats.reportCount).to.equal(1n);
    });

    it("accumulates across periods (never overwrites)", async () => {
      const { reputation, owner, seeder } = await loadFixture(deployFixture as any);
      await reputation.connect(owner).reportSeeding(seeder.address, HOUR, GB, 1n, 1n);
      await reputation.connect(owner).reportSeeding(seeder.address, 2 * HOUR, 2n * GB, 4n, 2n);

      const stats = await reputation.getStats(seeder.address);
      expect(stats.uptimeSecs).to.equal(BigInt(3 * HOUR));
      expect(stats.bytesServed).to.equal(3n * GB);
      expect(stats.validProofs).to.equal(5n);
      expect(stats.reportCount).to.equal(2n);
    });

    it("tracks seeders independently", async () => {
      const { reputation, owner, seeder, stranger } = await loadFixture(deployFixture as any);
      await reputation.connect(owner).reportSeeding(seeder.address, HOUR, GB, 1n, 1n);
      const other = await reputation.getStats(stranger.address);
      expect(other.reportCount).to.equal(0n);
      expect(await reputation.scoreOf(stranger.address)).to.equal(0n);
    });

    it("reverts for non-attestor callers", async () => {
      const { reputation, stranger, seeder } = await loadFixture(deployFixture as any);
      await expect(reputation.connect(stranger).reportSeeding(seeder.address, HOUR, GB, 1n, 1n))
        .to.be.revertedWithCustomError(reputation, "NotAttestor")
        .withArgs(stranger.address);
    });

    it("reverts for the zero-address seeder", async () => {
      const { reputation, owner } = await loadFixture(deployFixture as any);
      await expect(
        reputation.connect(owner).reportSeeding(ethers.ZeroAddress, HOUR, GB, 1n, 1n)
      ).to.be.revertedWithCustomError(reputation, "InvalidSeeder");
    });

    it("old attestor loses rights after rotation; new attestor gains them", async () => {
      const { reputation, owner, attestor2, seeder } = await loadFixture(deployFixture as any);
      await reputation.connect(owner).setAttestor(attestor2.address);

      await expect(reputation.connect(owner).reportSeeding(seeder.address, HOUR, GB, 1n, 1n))
        .to.be.revertedWithCustomError(reputation, "NotAttestor")
        .withArgs(owner.address);

      await expect(reputation.connect(attestor2).reportSeeding(seeder.address, HOUR, GB, 1n, 1n)).to.emit(
        reputation,
        "SeedingReported"
      );
      expect((await reputation.getStats(seeder.address)).reportCount).to.equal(1n);
    });
  });

  describe("scoreOf", () => {
    // formula: (uptimeSecs / 3600) + (bytesServed / 1e9) * 10 + validProofs * 100
    it("is 0 for a seeder with no reports", async () => {
      const { reputation, stranger } = await loadFixture(deployFixture as any);
      expect(await reputation.scoreOf(stranger.address)).to.equal(0n);
    });

    it("scores each component per the documented formula", async () => {
      const { reputation, owner, seeder } = await loadFixture(deployFixture as any);
      // 2h uptime → 2 ; 3 GB → 30 ; 5 proofs → 500 ; total 532
      await reputation.connect(owner).reportSeeding(seeder.address, 2 * HOUR, 3n * GB, 5n, 1n);
      expect(await reputation.scoreOf(seeder.address)).to.equal(532n);
    });

    it("scores components independently", async () => {
      const { reputation, owner, seeder, stranger, attestor2 } = await loadFixture(deployFixture as any);
      await reputation.connect(owner).reportSeeding(seeder.address, HOUR, 0n, 0n, 1n);
      expect(await reputation.scoreOf(seeder.address)).to.equal(1n); // 1h → 1

      await reputation.connect(owner).reportSeeding(stranger.address, 0, GB, 0n, 1n);
      expect(await reputation.scoreOf(stranger.address)).to.equal(10n); // 1 GB → 10

      await reputation.connect(owner).reportSeeding(attestor2.address, 0, 0n, 1n, 1n);
      expect(await reputation.scoreOf(attestor2.address)).to.equal(100n); // 1 proof → 100
    });

    it("uses integer division (remainders dropped)", async () => {
      const { reputation, owner, seeder } = await loadFixture(deployFixture as any);
      // 3599s < 1h → 0 ; 1_999_999_999 bytes < 2 GB → 10
      await reputation.connect(owner).reportSeeding(seeder.address, 3599, 1_999_999_999n, 0n, 1n);
      expect(await reputation.scoreOf(seeder.address)).to.equal(10n);
    });

    it("grows as reports accumulate", async () => {
      const { reputation, owner, seeder } = await loadFixture(deployFixture as any);
      await reputation.connect(owner).reportSeeding(seeder.address, HOUR, 0n, 0n, 1n);
      expect(await reputation.scoreOf(seeder.address)).to.equal(1n);
      await reputation.connect(owner).reportSeeding(seeder.address, HOUR, 0n, 0n, 2n);
      expect(await reputation.scoreOf(seeder.address)).to.equal(2n);
    });
  });
});
