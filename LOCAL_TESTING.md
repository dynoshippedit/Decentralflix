# Local Testing Guide (Phase 0)

This is the fastest way to test the full mint flow right now.

## 1. Start Hardhat Node (Terminal 1)

```bash
cd packages/contracts
npx hardhat node
```

Keep this running.

## 2. Deploy the Contract (Terminal 2)

In a **new** terminal:

```bash
cd packages/contracts
npx hardhat run scripts/deploy.ts --network localhost
```

Copy the address it prints (it will be something like `0x5FbDB2315678afecb367f032d93F642f64180aa3`).

## 3. Set the Address in Frontend

Create `apps/frontend/.env.local` with:

```env
NEXT_PUBLIC_MOVIE_TICKET_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

(Use the address from step 2)

## 4. Start the Frontend (Terminal 3)

```bash
cd apps/frontend
pnpm dev
```

## 5. Test the Mint Page

1. Go to http://localhost:3000
2. Click "Mint Tickets" (or go directly to http://localhost:3000/mint)
3. Connect a wallet (Privy will give you test wallets)
4. Fill in an Arweave hash (any string for now, e.g. `ar://test-video-123`)
5. Set a creator address (can be the same as your connected wallet)
6. Set a price (e.g. `0.01`)
7. Click "Mint Ticket"

The transaction should succeed against your local Hardhat node.

## Troubleshooting

- If the page says the address is zero → make sure you created `.env.local` and restarted `pnpm dev`.
- The recipient will always be your currently connected wallet address.
- You can view the deployed contract in the Hardhat node console or use Hardhat's built-in explorer.

Once local testing works, we can move to a real Sepolia deployment.
