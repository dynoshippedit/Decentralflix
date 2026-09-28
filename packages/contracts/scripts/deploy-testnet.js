/**
 * Decentralflix Phase 2 — testnet deployment script (Sepolia primary).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-testnet.js                      # DRY RUN: ephemeral local Hardhat network, no keys, no broadcast
 *   npx hardhat run scripts/deploy-testnet.js --network sepolia    # REAL broadcast — needs DEPLOYER_PRIVATE_KEY + faucet funds
 *
 * Safety:
 * - With no --network flag this deploys to Hardhat's in-process network. Nothing leaves the machine.
 * - Against `sepolia` the script REFUSES to run unless DEPLOYER_PRIVATE_KEY is set in the environment.
 *   No key is ever created, written, or logged by this script.
 * - Mumbai is deprecated by Polygon; the current alternative testnet is Polygon Amoy (see hardhat.config.ts).
 * - Mainnet deployment is NOT supported by this script and requires a licensed-counsel legal review first.
 */

const fs = require("fs");
const path = require("path");

// Phase 2 contract suite in deployment order. All constructors are currently
// parameterless (owner = deployer). If a constructor gains params, add `args`.
const CONTRACTS = [
  { name: "DFLIX", args: [] },
  { name: "TicketNFT", args: [] },
  { name: "SubscriptionManager", args: [] },
  { name: "PayPerView", args: [] },
  { name: "ProofRegistry", args: [] },
  { name: "SeederReputation", args: [] },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const isLive = network.chainId !== 31337n;

  console.log("=== Decentralflix Phase 2 testnet deployment ===");
  console.log(`Network : ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Mode    : ${isLive ? "LIVE BROADCAST" : "DRY RUN (local, nothing broadcast)"}`);

  if (isLive && !process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error(
      "Refusing live broadcast: DEPLOYER_PRIVATE_KEY is not set. " +
        "Fund a fresh testnet-only key via a Sepolia faucet first — never reuse a mainnet key."
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance : ${ethers.formatEther(balance)} ETH`);
  if (isLive && balance === 0n) {
    throw new Error("Deployer has no funds. Get Sepolia ETH from a faucet before broadcasting.");
  }

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 0n;
  console.log(`Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei (estimate basis)`);

  const deployed = {};
  let totalGas = 0n;

  console.log("\n--- deployments ---");
  for (const { name, args } of CONTRACTS) {
    const factory = await ethers.getContractFactory(name);
    const contract = await factory.deploy(...args);
    const receipt = await contract.deploymentTransaction().wait();
    const address = await contract.getAddress();
    const gasUsed = receipt.gasUsed;
    totalGas += gasUsed;
    const costEth = gasUsed * gasPrice;
    deployed[name] = {
      address,
      txHash: receipt.hash,
      gasUsed: gasUsed.toString(),
      estCostEth: ethers.formatEther(costEth),
    };
    console.log(
      `${name.padEnd(20)} ${address}  gas=${gasUsed.toString().padStart(9)}  ~${ethers.formatEther(costEth)} ETH`
    );
  }

  const totalCostEth = totalGas * gasPrice;
  console.log("\n--- totals ---");
  console.log(`Total gas          : ${totalGas}`);
  console.log(`Estimated total    : ${ethers.formatEther(totalCostEth)} ETH @ ${ethers.formatUnits(gasPrice, "gwei")} gwei`);

  // Write a deployments record (local file only — never committed with real addresses... actually
  // testnet addresses are public; still, keep the file gitignored to avoid stale-address confusion).
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, isLive ? `sepolia-${Date.now()}.json` : "dry-run-local.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { network: network.name, chainId: network.chainId.toString(), deployer: deployer.address, contracts: deployed },
      null,
      2
    )
  );
  console.log(`\nDeployment record: ${outPath}`);

  if (!isLive) {
    console.log("\nDRY RUN COMPLETE. To broadcast to Sepolia:");
    console.log("  1. Create a fresh testnet-only key (never a mainnet key).");
    console.log("  2. Fund it with Sepolia ETH from a faucet (e.g. sepoliafaucet.com).");
    console.log("  3. DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy-testnet.js --network sepolia");
    console.log("  4. Copy the printed addresses into apps/frontend NEXT_PUBLIC_* env vars.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
