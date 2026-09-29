# Deployment Checklist — Viewer-Payment Contracts

**Supersedes all earlier fee figures.** As of df-cycle-12/13 (2026-09-29), every
viewer-payment contract uses the shared `RevenueSplitter` with an immutable
75/25 split. Any doc, script, or checklist still mentioning a 30% fee,
`platformFeeBps`, fee constructor args, `setPlatformFee`, or owner withdraw is
STALE — do not follow it. A deployment run against stale instructions would
contradict the verified contract behavior.

## The split (one rule, everywhere)

- `RevenueSplitter.PLATFORM_FEE_BPS` = **2500** (25%) — immutable constant, no setter.
- Creator/filmmaker receives `msg.value - fee` (the rounding remainder).
- Missing/zero creator address reverts (`MissingCreator`). No owner fallback.
- The owner cannot redirect funds and cannot change the percentage.
- The split happens **at payment time** (purchase/mint), not on withdrawal.
- Applies to: SubscriptionManager, PayPerView, MovieTicket, TicketNFT.

## Pre-Deployment

- [ ] Contract compiles cleanly (`npx hardhat compile`)
- [ ] Full suite green: `npx hardhat test`, frontend `npm test`, `npx tsc --noEmit`
- [ ] ABI-drift guard green (frontend ABIs match compiled artifacts)
- [ ] There is no fee to configure: no `platformFeeBps`, no constructor fee arg,
      no `setPlatformFee`. If a deploy script references any of these, STOP —
      the script is stale.
- [ ] There is no owner withdraw path. If a step says the owner can withdraw, STOP —
      the instruction is stale.
- [ ] `PRIVATE_KEY` is set and the wallet has enough native token for gas
- [ ] For Sepolia: test ETH from a faucet
- [ ] `ARBISCAN_API_KEY` is set if you want auto-verification
- [ ] **Contracts are UNAUDITED. No mainnet deployment. No deployment moving real
      funds without Dino's explicit authorization.**

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
- [ ] Test a purchase/mint from the frontend on the correct network
- [ ] Confirm the creator receives 75% immediately (check their balance)
- [ ] Confirm the platform receives exactly 25%
- [ ] Update `NEXT_PUBLIC_*_ADDRESS` in all relevant env files
- [ ] (Optional) Run `npx hardhat run scripts/export-abi.ts` to sync the full ABI —
      the drift guard fails closed if you skip this after any contract change

## Emergency / Rollback

- [ ] Confirm pause/unpause behavior against the contract source — do not assume it exists
- [ ] No critical functions are missing `onlyOwner` or `whenNotPaused`

---

Run through this checklist every time you deploy. It will save headaches.
