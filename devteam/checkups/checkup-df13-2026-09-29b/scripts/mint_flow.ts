import { ethers } from "hardhat";

// S1 workflow observation: exact 75/25 split at mint, odd wei remainder.
async function main() {
  const [owner, filmmaker, buyer] = await ethers.getSigners();
  const TicketNFT = await ethers.getContractFactory("TicketNFT");
  const nft = await TicketNFT.deploy();
  await nft.waitForDeployment();
  await (await nft.registerFilm(1, "S1 Probe Film", 7, filmmaker.address, false, "")).wait();

  const platBefore = await ethers.provider.getBalance(owner.address);
  const filmBefore = await ethers.provider.getBalance(filmmaker.address);
  const tx = await nft.connect(buyer).mintTicket(1, { value: 7 });
  const rc = await tx.wait();
  const platAfter = await ethers.provider.getBalance(owner.address);
  const filmAfter = await ethers.provider.getBalance(filmmaker.address);
  const contractBal = await ethers.provider.getBalance(await nft.getAddress());

  console.log("minted token, gas used:", rc.gasUsed.toString());
  console.log("platform delta wei:", (platAfter - platBefore).toString(), "(expect 1)");
  console.log("filmmaker delta wei:", (filmAfter - filmBefore).toString(), "(expect 6)");
  console.log("contract balance wei:", contractBal.toString(), "(expect 0)");
  console.log("hasValidTicket:", await nft.hasValidTicket(buyer.address, 1));
  if (platAfter - platBefore !== 1n) throw new Error("platform share wrong");
  if (filmAfter - filmBefore !== 6n) throw new Error("filmmaker share wrong");
  if (contractBal !== 0n) throw new Error("contract retained balance");
  console.log("S1 WORKFLOW OK: 7 wei -> platform 1, filmmaker 6, nothing retained");
}
main().catch((e) => { console.error(e); process.exit(1); });
