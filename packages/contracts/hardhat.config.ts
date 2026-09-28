import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
    },
  },
  networks: {
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Ethereum Sepolia — Phase 2 primary testnet. Broadcasts only when
    // DEPLOYER_PRIVATE_KEY is set; see scripts/deploy-testnet.js.
    sepolia: {
      url: process.env.SEPOLIA_RPC || "https://rpc.sepolia.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    // Polygon Amoy — alternative testnet (Mumbai is deprecated).
    polygonAmoy: {
      url: process.env.AMOY_RPC || "https://rpc-amoy.polygon.technology",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || "",
    },
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;