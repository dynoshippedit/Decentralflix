/**
 * W3B-001 / SEC-012 — SeederCredits.submitSeedingReport signature replay.
 *
 * PRE-FIX (documented on df-cycle-03 before the fix): the attestor-signed message was
 * keccak256(seeder, arweaveTxId, claimedAmount, chainId) — NO nonce, NO timestamp, NO
 * expiry. The only replay throttle was the 1-day per-seeder cooldown. Replaying the
 * identical (txid, amount, signature) tuple after the cooldown minted 2000 credits
 * from ONE signature (this test asserted `credits == amount * 2n` and passed).
 *
 * POST-FIX (df-cycle-03): the signed message is
 * keccak256(seeder, arweaveTxId, claimedAmount, reportTimestamp, nonce, chainId);
 * the report must be within MAX_REPORT_AGE (7 days) and not from the future, and each
 * signed message hash is consume-once on-chain. The assertions below verify the fix:
 * the second submission of the IDENTICAL signed report reverts with
 * "Report already claimed", while a FRESH signed report (new nonce) still succeeds.
 *
 * Run: cd packages/contracts && npx hardhat test ../../devteam/repro/w3b-signature-replay.test.ts
 */

import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";

const TXID = "ar://seeding-report-001";
const DAY = 24 * 60 * 60;

let nonceSeq = 9000n;

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

async function signClaim(attestor, seederAddr, txid, amount, chainId, reportTimestamp, nonce) {
  const ts = reportTimestamp ?? BigInt(await time.latest());
  const n = nonce ?? (nonceSeq = nonceSeq + 1n);
  const messageHash = ethers.solidityPackedKeccak256(
    ["address", "string", "uint256", "uint256", "uint256", "uint256"],
    [seederAddr, txid, amount, ts, n, chainId]
  );
  const sig = await attestor.signMessage(ethers.getBytes(messageHash));
  return { sig, reportTimestamp: ts, nonce: n };
}

describe("W3B-001 fixed: attestor signature replay blocked across cooldowns", () => {
  it("replaying ONE attestor signature after the cooldown now reverts; a fresh report still works", async () => {
    const { seederCredits, owner, seeder, chainId } = await loadFixture(deployFixture);
    const amount = 1000n;

    // ONE legitimate attestor signature for this seeder/claim.
    const signed = await signClaim(owner, seeder.address, TXID, amount, chainId);

    // First claim: succeeds, credits == amount.
    await seederCredits
      .connect(seeder)
      .submitSeedingReport(TXID, amount, signed.reportTimestamp, signed.nonce, signed.sig);
    expect(await seederCredits.credits(seeder.address)).to.equal(amount);

    // Advance past the 1-day cooldown and replay the IDENTICAL signed report.
    await time.increase(DAY + 1);

    // FIXED: the replay reverts — one signature can no longer mint twice.
    // (try/catch style: this file lives outside test/ and resolves a different
    // chai copy than the hardhat-chai-matchers plugin patches, so matcher
    // assertions like revertedWith are unavailable here.)
    let replayReverted = false;
    try {
      await seederCredits
        .connect(seeder)
        .submitSeedingReport(TXID, amount, signed.reportTimestamp, signed.nonce, signed.sig);
    } catch (e: any) {
      replayReverted = /Report already claimed/.test(String(e && e.message));
    }
    expect(replayReverted, "replay of the identical signed report should revert").to.equal(true);
    expect(await seederCredits.credits(seeder.address)).to.equal(amount);

    // A FRESH attestor-signed report (new nonce + timestamp) is not a replay: succeeds.
    const fresh = await signClaim(owner, seeder.address, TXID, amount, chainId);
    await seederCredits
      .connect(seeder)
      .submitSeedingReport(TXID, amount, fresh.reportTimestamp, fresh.nonce, fresh.sig);
    expect(await seederCredits.credits(seeder.address)).to.equal(amount * 2n);

    console.log("      replay of one signature blocked (credits stayed 1000); fresh report credited (2000)");
  });
});
