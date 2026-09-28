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

  // Default to 30% platform fee (3000 basis points). Change as needed.
  const INITIAL_PLATFORM_FEE_BPS = 3000;

  const MovieTicketFactory = await ethers.getContractFactory("MovieTicket");
  const movieTicket = await MovieTicketFactory.deploy(INITIAL_PLATFORM_FEE_BPS);
  await movieTicket.waitForDeployment();

  const movieTicketAddress = await movieTicket.getAddress();

  console.log("✅ MovieTicket deployed to:", movieTicketAddress);

  // Deploy FilmmakerCampaign first (so Reviews can take both addresses for unified verified-owner gating)
  const FilmmakerCampaignFactory = await ethers.getContractFactory("FilmmakerCampaign");
  const filmmakerCampaign = await FilmmakerCampaignFactory.deploy(movieTicketAddress);
  await filmmakerCampaign.waitForDeployment();

  const filmmakerCampaignAddress = await filmmakerCampaign.getAddress();
  console.log("✅ FilmmakerCampaign deployed to:", filmmakerCampaignAddress);

  // Deploy Reviews contract with both contracts so onlyVerifiedOwner accepts
  // MovieTicket holders OR crowdfund InvestmentNFT backers (hasCrowdfundAccess after setCampaignVideo)
  const ReviewsFactory = await ethers.getContractFactory("Reviews");
  const reviews = await ReviewsFactory.deploy(movieTicketAddress, filmmakerCampaignAddress);
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
  console.log("FilmmakerCampaign:", filmmakerCampaignAddress);

  // Get deploy tx for logging
  const deployTx = movieTicket.deploymentTransaction();

  // Export deployment info for frontend / records
  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    movieTicket: movieTicketAddress,
    reviews: reviewsAddress,
    seederCredits: seederCreditsAddress,
    filmmakerCampaign: filmmakerCampaignAddress,
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
  console.log(`NEXT_PUBLIC_FILMMAKER_CAMPAIGN_ADDRESS=${filmmakerCampaignAddress}`);

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