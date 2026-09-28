# Deployment Checklist — MovieTicket Contract

**Note for the agent:** While working through deployments or complex tasks, I also maintain `marker.md` as my personal scratchpad for open issues and decisions. I update it frequently.

Use this checklist before every deployment (local, Sepolia, or mainnet).

## Pre-Deployment

- [ ] Contract compiles cleanly (`npx hardhat compile`)
- [ ] All tests pass (when we have them)
- [ ] `platformFeeBps` is set to the desired value in the deploy script (default 3000 = 30%)
- [ ] Constructor argument is correctly passed in `deploy.ts`
- [ ] `PRIVATE_KEY` is set and the wallet has enough native token for gas
- [ ] For Sepolia: You have test ETH from a faucet
- [ ] `ARBISCAN_API_KEY` is set if you want auto-verification

## Deployment

- [ ] Run the correct command:
  ```bash
  npx hardhat run scripts/deploy.ts --network arbitrumSepolia
  ```
- [ ] Verify the printed address matches what you expect
- [ ] Check that `deployments/arbitrumSepolia.json` was created
- [ ] Copy the address into `apps/frontend/.env.local`

## Post-Deployment

- [ ] Contract appears on Arbiscan (https://sepolia.arbiscan.io/)
- [ ] Contract is verified (source code visible)
- [ ] Test a mint from the `/mint` page on the correct network
- [ ] Confirm creator receives their share immediately (check their balance)
- [ ] Confirm platform fee stays in the contract (owner can `withdraw`)
- [ ] Update `NEXT_PUBLIC_MOVIE_TICKET_ADDRESS` in all relevant env files
- [ ] (Optional) Run `npx hardhat run scripts/export-abi.ts` to sync full ABI

## Gas & Profit Protection Notes

The contract now splits fees **at mint time**:
- Creator gets their share (e.g. 70%) sent directly to their wallet
- Platform keeps its cut (e.g. 30%)

This protects creators from gas price volatility because they receive funds immediately.

You can later adjust the fee with `setPlatformFee(uint256)` if market conditions change.

## Emergency / Rollback

- [ ] Contract has `pause()` / `unpause()` controlled by owner
- [ ] Owner can still `withdraw()` accumulated platform fees
- [ ] No critical functions are missing `onlyOwner` or `whenNotPaused`

---

Run through this checklist every time you deploy. It will save headaches.
