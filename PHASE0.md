# PHASE0.md — Current Phase (Phase 0 – Foundation)

**Goal:** Complete the foundation of the project so we can move into Phase 1.

## Objectives
- Finish setting up a clean, working monorepo
- Have a functional `MovieTicket` smart contract (Permanent + Burnable tickets)
- Have a working Arweave upload pipeline
- Have basic Privy + SIWE wallet connection
- Have the basic structure ready for minting and viewing

## Rules for This Phase
- You have permission to edit and improve the smart contract (`MovieTicket.sol`).
- After making changes to the contract, you **must verify** that it compiles cleanly.
- You should also run a basic deployment test on Arbitrum Sepolia if possible.
- Do **not** wait for permission on every small improvement. Move forward.
- Update `TODO.md` as you complete tasks.
- Use `marker.md` at the root as your personal scratchpad/notepad for tracking issues and decisions during detailed work.
- Once the core foundation feels solid (contract compiles, upload works, wallet connects), propose moving to Phase 1.

## What "Done" Looks Like for Phase 0
- Monorepo is clean and organized
- `MovieTicket.sol` compiles without errors
- Basic deployment script works on testnet
- Arweave upload pipeline is functional from the frontend
- Wallet connection is working

Once these are reasonably complete, update `TODO.md` and ask if we should move into Phase 1.