import { ethers, run } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("====================================");
  console.log("Deploying MovieTicket Contract");
  console.log("====================================");
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("====================================\n");

  // Default to 25% platform fee (2500 basis points) = 75% creator share.
  // Matches the verified site economics; PayPerView caps at 2500 as well.
  const INITIAL_PLATFORM_FEE_BPS = 2500;

  const MovieTicketFactory = await ethers.getContractFactory("MovieTicket");
  const movieTicket = await MovieTicketFactory.deploy(INITIAL_PLATFORM_FEE_BPS);
  await movieTicket.waitForDeployment();

  const movieTicketAddress = await movieTicket.getAddress();

  console.log("✅ MovieTicket deployed to:", movieTicketAddress);

  // FilmmakerCampaign is DEFERRED (crowdfunding = securities risk without a
  // registered funding portal). It is NOT deployed. Reviews receives the zero
  // address for the campaign parameter — onlyVerifiedOwner then gates on
  // MovieTicket holders only.
  const ReviewsFactory = await ethers.getContractFactory("Reviews");
  const reviews = await ReviewsFactory.deploy(movieTicketAddress, ethers.ZeroAddress);
  await reviews.waitForDeployment();

  const reviewsAddress = await reviews.getAddress();
  console.log("✅ Reviews deployed to:", reviewsAddress);

  // Deploy SeederCredits (P2P hosting credit system - hybrid Arweave + on-chain)
  const SeederCreditsFactory = await ethers.getContractFactory("SeederCredits");
  const seederCredits = await SeederCreditsFactory.deploy(movieTicketAddress);
  await seederCredits.waitForDeployment();

  const seederCreditsAddress = await seederCredits.getAddress();
  console.log("✅ SeederCredits deployed to:", seederCreditsAddress);

  console.log("\n✅ Deployment successful!");
  console.log("MovieTicket:", movieTicketAddress);
  console.log("Reviews:", reviewsAddress);
  console.log("SeederCredits:", seederCreditsAddress);

  // Get deploy tx for logging
  const deployTx = movieTicket.deploymentTransaction();

  // Export deployment info for frontend / records
  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    movieTicket: movieTicketAddress,
    reviews: reviewsAddress,
    seederCredits: seederCreditsAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    txHash: deployTx ? deployTx.hash : undefined,
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filePath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\n📄 Deployment info saved to: ${filePath}`);
  console.log("\nAdd these to your frontend .env.local:");
  console.log(`NEXT_PUBLIC_MOVIE_TICKET_ADDRESS=${movieTicketAddress}`);
  console.log(`NEXT_PUBLIC_REVIEWS_ADDRESS=${reviewsAddress}`);
  console.log(`NEXT_PUBLIC_SEEDER_CREDITS_ADDRESS=${seederCreditsAddress}`);

  // Auto-verify on live networks if API key is present
  const isLiveNetwork = network.chainId !== 31337n;
  if (isLiveNetwork && process.env.ARBISCAN_API_KEY) {
    console.log("\n🔍 Verifying contract on Arbiscan...");
    try {
      await run("verify:verify", {
        address: movieTicketAddress,
        constructorArguments: [INITIAL_PLATFORM_FEE_BPS],
      });
      console.log("✅ Contract verified successfully!");
    } catch (verifyError: any) {
      if (verifyError.message && verifyError.message.includes("already verified")) {
        console.log("ℹ️ Contract already verified.");
      } else {
        console.log("⚠️ Verification failed (you can run it manually later):", verifyError.message || verifyError);
      }
    }
  } else if (isLiveNetwork) {
    console.log("\nℹ️ Set ARBISCAN_API_KEY in your environment to auto-verify on Sepolia.");
  }
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});