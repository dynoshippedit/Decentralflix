# Arbitrum Sepolia Deployment Guide

This guide walks you through deploying `MovieTicket.sol` to Arbitrum Sepolia testnet.

## Prerequisites

1. **Get Test ETH on Arbitrum Sepolia**
   - Use a faucet:
     - https://faucet.quicknode.com/arbitrum/sepolia
     - https://www.alchemy.com/faucets/arbitrum-sepolia
   - You need ~0.01–0.05 ETH for deployment + gas.

2. **Get an Arbiscan API Key** (for verification)
   - Go to https://arbiscan.io/
   - Create a free account → API Keys → Create new key
   - Copy it (you'll need it for verification)

3. **Environment Variables**
   Create or update `packages/contracts/.env` (or use shell export):

   ```env
   PRIVATE_KEY=0xYourPrivateKeyHere          # Deployer wallet (funded with Sepolia ETH)
   ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
   ARBISCAN_API_KEY=YourArbiscanKeyHere
   ```

   **Never commit this file.**

## Deployment Steps

1. **Make sure you're in the contracts folder**
   ```bash
   cd packages/contracts
   ```

2. **Run the deployment**
   ```bash
   npx hardhat run scripts/deploy.ts --network arbitrumSepolia
   ```

   The improved script will:
   - Deploy the contract
   - Save deployment details to `deployments/arbitrumSepolia.json`
   - Attempt to verify on Arbiscan (if key is set)

3. **Copy the address**
   After deployment, copy the printed address and set it in your frontend:

   ```bash
   # In apps/frontend/.env.local
   NEXT_PUBLIC_MOVIE_TICKET_ADDRESS=0xYourNewSepoliaAddress
   ```

4. **Restart your frontend dev server** so the new env var is picked up.

## After Deployment

- The contract should be verified on Arbiscan (check the tx in the deploy output).
- You can now test minting on Sepolia using the `/mint` page (make sure your wallet is on Arbitrum Sepolia).
- Use the same connected wallet that has Sepolia ETH for gas.

## Troubleshooting

- **"insufficient funds"**: Get more test ETH from faucet.
- **Verification fails**: Run manually:
  ```bash
  npx hardhat verify --network arbitrumSepolia <CONTRACT_ADDRESS>
  ```
- **Private key not found**: Make sure `PRIVATE_KEY` is set in your shell or `.env` (and hardhat.config picks it up).
- **Wrong network**: Confirm your wallet is on Arbitrum Sepolia (chain ID 421614).

## Next Steps After Successful Sepolia Deploy

Once you have a working Sepolia address:
- Update `apps/frontend/.env.local`
- Test a real mint on testnet
- We can then confidently close Phase 0 and move to Phase 1 (real token-gated playback, library, etc.)

Run the deploy command above when ready. Let me know the output or any errors and I'll help debug immediately.
