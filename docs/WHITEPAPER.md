# Decentralflix Protocol Whitepaper
**Version 0.2 — Phase 2 draft. 2026-09-28.**
**Status: technical design document. Not an investment prospectus. No tokens have been issued on any public network.**

---

## 1. Introduction

Decentralflix is a decentralized video distribution protocol for independent film. The problem it addresses is structural: independent filmmakers depend on centralized platforms that take large revenue cuts, control discovery, and can remove content unilaterally. The protocol's answer is a set of open smart contracts, a content-addressed encrypted storage layer, and a web client that together let a filmmaker publish a film, sell access directly to viewers, and receive payment without an intermediary taking custody of funds.

This paper describes the Phase 2 protocol design: the on-chain contracts, the storage and retrieval mechanics, the DFLIX utility token, the cryptographic verification system, and the economic model. Implementation status varies by component and present-tense descriptions below describe the specified design, not a live deployment: the encrypted-fragment storage *library* (`@decentralflix/storage`) is implemented and unit-tested, but it is not yet wired into the product's upload or playback paths; the contracts are unaudited and not deployed to any network; no reference retrieval client exists yet. It also states plainly what the protocol does *not* do — the limitations are part of the design, not footnotes.

A note on scope: the protocol handles **access control and payment**. It does not host a social network, does not perform content moderation on-chain, and does not promise returns of any kind to anyone. DFLIX is a utility token for protocol mechanics (staking, bandwidth rewards, fee discounts). Nothing in this paper should be read as a promise of profit.

---

## 2. Actors

- **Filmmakers** register films, set prices, receive revenue directly to their wallets.
- **Viewers** purchase tickets (NFTs), subscriptions, or pay-per-view access; they hold cryptographic receipts.
- **Seeders** store and serve encrypted video fragments, earning DFLIX rewards for measurable bandwidth contribution.
- **Attestors** (bootstrap phase) are trusted reporters of off-chain seeding activity. The protocol starts with a single owner-appointed attestor and documents the path toward decentralized verification.
- **The platform operator** (intended role) deploys the contracts and runs reference clients. As of this writing the contracts are unaudited and undeployed, and no operator-run reference client exists. It never takes custody of user funds or content keys.

---

## 3. Protocol mechanics

### 3.1 Film registration and tickets (TicketNFT)

A film is registered on-chain with a `filmId`, title, price, filmmaker payout address, and an active flag. Viewers call `mintTicket(filmId)` and pay exactly the listed price in the chain's native currency; the full price is forwarded to the filmmaker. The ticket is an ERC-721 NFT:

- **Transferable tickets** can be resold or gifted; validity follows the current holder.
- **Soulbound tickets** (per-film flag) cannot be transferred — they are bound to the purchaser.
- **Redemption**: `redeemTicket(tokenId)` burns a single-use ticket when the viewer starts watching, preventing reuse.

`hasValidTicket(holder, filmId)` lets any client — or the access-control layer — verify access without trusting a server.

### 3.2 Subscriptions (SubscriptionManager)

Filmmakers or the operator define **plans** (`planId → name, price, duration, creator`). Each plan names its creator once at creation — the address is immutable afterward. `subscribe(planId)` grants the caller access until `block.timestamp + duration`; every payment is split immediately and non-custodially: **75% to the plan's creator, 25% to the platform** (the immutable `PLATFORM_FEE_BPS = 2500` constant; the owner cannot change the split, and the creator's share is never redirected to the owner). `renew(planId)` extends from the current expiry and splits the same way; `cancel()` ends access immediately with no refund (stated upfront, enforced in code). This is the on-chain primitive behind the Collector Pass product: a subscription is a time-boxed access right, and the pass's credit mechanics live in the off-chain service layer where they can carry the required economics disclosures.

### 3.3 Pay-per-view (PayPerView)

For one-time purchases without an NFT: `buyAccess(filmId)` records licensed streaming access for the caller (rental or licensed access per the filmmaker's terms; not a perpetuity claim). The filmmaker sets the price; the contract splits payment immediately and non-custodially through the shared RevenueSplitter: 75% (+ rounding remainder) to the filmmaker, 25% to the platform, from the immutable `PLATFORM_FEE_BPS = 2500` constant — the owner cannot change the split and there is no owner-settable fee. Overpayment is impossible by design — the call reverts unless `msg.value` exactly equals the price. Nothing accrues in the contract; there is no withdraw path. Every wei is accounted for in exactly one of those two buckets.

### 3.4 Storage layer (@decentralflix/storage)

In the Phase 2 design, video is never stored as a single blob. The storage package (`@decentralflix/storage` — implemented and unit-tested, but not yet wired into the product's upload path):

1. **Fragments** the file (default 1 MiB fragments).
2. **Encrypts** each fragment with AES-256-GCM under a fresh random key, with a unique 12-byte IV per fragment.
3. **Hashes** each encrypted fragment with SHA-256.
4. **Builds a manifest**: `{filmId, fragmentCount, fragmentHashes[], createdAt}`.
5. **Uploads** encrypted fragments to IPFS (Kubo API) with local pinning, and posts the manifest to Arweave (permanent, content-addressed).
6. **Retrieves** with fallback: IPFS first per fragment, Arweave as fallback, verifying each fragment's SHA-256 against the manifest *before* decryption. A mismatch throws `TamperError` — the client refuses to play corrupted content.

The decryption key is distributed out-of-band to entitled viewers (via the access-control layer after on-chain entitlement is verified). Encryption here is **at-rest fragment encryption**, not DRM: anyone holding the key can decrypt. The threat model is casual scraping and transport tampering, not a determined key-holder.

### 3.5 Retrieval and playback

The specified retrieval flow: a reference client resolves a film's manifest from Arweave, fetches fragments (IPFS → Arweave fallback), verifies hashes, decrypts, and streams via HTTP 206 partial content. No reference client implements this flow yet; the current product serves video from a local origin instead. The wallet layer (`apps/frontend/lib/web3/`) connects MetaMask or Coinbase Wallet via EIP-6963 discovery, checks `hasValidTicket` / subscription / PPV access on-chain, and only then requests the decryption key. When no wallet is present, the client degrades to the existing demo/test-mode flows — the protocol layer never blocks the product.

### 3.6 Seeding and rewards

Seeders run IPFS nodes pinning encrypted fragments and serve them to viewers. Because bandwidth contribution happens off-chain, an **attestor** reports measured activity (uptime, bytes served, valid proofs) and the contracts convert reports into DFLIX rewards:

- `DFLIX.allocateSeedReward(seeder, amount, reportHash)` — attestor-only, replay-protected by `reportHash`.
- `SeederReputation.reportSeeding(...)` — accumulates per-seeder stats and computes an on-chain score: `score = uptimeHours + (GB served × 10) + (validProofs × 100)`.

Reputation scores are **informational**. They are not Sybil-proof (see §8), and they do not gate payouts in the pilot phase.

---

## 4. Tokenomics (DFLIX)

DFLIX is an ERC-20 utility token with a hard cap of 1,000,000,000 tokens.

- **Minting**: restricted to addresses holding `MINTER_ROLE`; total supply can never exceed the cap.
- **Staking**: holders `stake()` DFLIX with a 7-day lock; rewards accrue time-weighted from a reward pool funded by the owner via `fundRewardPool()`. `unstake()` after the lock; `claimRewards()` collects both staking and seed rewards.
- **Seed-to-earn**: the attestor allocates rewards proportional to reported bandwidth. Rewards come from the funded pool — they are **not minted on demand**, which bounds the protocol's liability to what was explicitly funded.
- **Fee discounts**: the product layer may offer discounted platform fees for payment in DFLIX (policy, not consensus).

**What DFLIX is not**: it is not a share in any company, not a claim on revenue, and staking rewards are a protocol mechanic for incentivizing measurable participation — **not a promised yield**. Reward rates are set by the owner, can go to zero, and the pool can run dry. Anyone describing DFLIX rewards as guaranteed returns is misrepresenting the protocol.

---

## 5. Cryptographic verification

Three independent verification layers:

1. **Fragment integrity**: SHA-256 per encrypted fragment, committed in the manifest; Merkle root of the fragment hashes stored on-chain in `ProofRegistry`. `verifyFragment(filmId, index, leafHash, proof)` lets anyone confirm a fragment belongs to the registered film. The tree uses SHA-256 throughout (OpenZeppelin's verifier is keccak256-only, so the contract implements a matching SHA-256 verifier — proven byte-identical by round-trip tests).
2. **Purchase receipts**: the off-chain service issues Ed25519-signed receipts (one per film per order), verifiable offline with the `verify-receipt` CLI. This covers the pre-chain / test-mode path.
3. **Access proofs**: ticket ownership, subscription expiry, and PPV access are all readable on-chain by anyone — the access-control worker checks chain state, not a database.

Tamper detection is **detection, not prevention**: a corrupted fragment is refused, not repaired. Availability still depends on pinning (see §8).

---

## 6. Economic model

### 6.1 Creator revenue

The tested basis is a **75% creator share**: on a $4.00 purchase, the filmmaker receives $3.00 and the protocol retains $1.00 (before payment processing and delivery costs). At $4.00 the modeled per-order contribution after the platform's variable costs is approximately **$0.28** — thin, and the reason the protocol does not advertise higher shares: at a 90% share the same order loses roughly $0.32. Pricing pages state the 75% basis explicitly, and automated tests enforce that no surface of the product claims otherwise.

### 6.2 The Collector Pass (draft)

The proposed $10/month pass grants two $8 credits. At a 75% creator share, two redeemed credits cost **$12.00 in creator payouts** against $10.00 of revenue — before card processing and bandwidth. The product surfaces carry this arithmetic verbatim with the warning: *do not rely on breakage* (unredeemed credits) to make the model work. The pass is not offered until the price, allocation basis, included catalog, or usage design changes. This is the protocol's honesty policy applied to its own economics: a draft model is labeled draft, and unprofitable math is shown, not hidden.

### 6.3 Cost structure

- **Delivery**: reference architecture uses CDN (primary) with IPFS/Arweave as the censorship-resistant mirror. P2P bandwidth savings are **not claimed** until swarm density is measured (§8).
- **Storage**: IPFS pinning (operational cost) + Arweave (one-time permanent endowment for manifests/proofs only — never video bytes, which would be prohibitively expensive).
- **Chain**: L2 deployment target (Arbitrum Sepolia for testnet). Gas estimates are published with the deployment script.

### 6.4 Migration economics

Vimeo-migration incentives are **capped**: a defined pilot (e.g., 10 titles + a fixed migration budget), never unlimited free hosting. Migration imports create **contacts only** — buyers claim access and the filmmaker approves; entitlements are never granted automatically.

---

## 7. Governance and trust assumptions

Phase 2 is **progressively decentralized**, and the centralization points are named:

| Function | Phase 2 | Path forward |
|---|---|---|
| Contract upgrades | Owner (Ownable) | Timelock + multisig |
| Seeding reports | Single attestor EOA | Multi-attestor quorum / challenge-response proofs |
| Reward pool funding | Owner | Protocol fee capture (governance decision) |
| Content keys | Access-control service | Threshold / per-purchase key wrapping |
| Price/fee params | Owner | Per-film filmmaker sovereignty (already: filmmakers set PPV prices) |

The owner can pause claims and set fees, but **cannot move user funds or tickets**: payments flow wallet-to-wallet, and tickets are self-custodied ERC-721s.

---

## 8. Honest limitations

1. **No promised yield.** DFLIX staking and seed-to-earn are incentive mechanics over a finite, pre-funded pool. Rates can be set to zero. This paper, the code, and the product must never describe rewards as guaranteed, and the contracts' NatSpec says so explicitly.
2. **Securities and platform law.** Whether any token or NFT in this system is a security is a **transaction-specific legal assessment** for licensed counsel — the design aims at utility (access, bandwidth incentives) but the label is not self-certifying. Mainnet launch also requires review of money-transmission rules, DMCA agent registration (one element of safe-harbor compliance, not the whole program), and **Apple's App Store policy on NFT unlocking** (external purchase / unlock rules) before any iOS distribution.
3. **Swarm density.** All bandwidth-saving claims about P2P are suspended until measured: live peers per film, geographic distribution, session duration. The reference architecture treats P2P as an **opt-in boost layer**, with CDN as primary delivery.
4. **Sybil attacks.** Reputation scores reflect attestor-reported activity; one entity can run many seeder identities. Scores are informational in the pilot and must never gate payouts without challenge-response verification and stake or allowlisted identity.
5. **Encryption ≠ DRM.** Fragment encryption defeats casual scraping, not a key-holder. Do not market it as unbreakable content protection.
6. **Availability ≠ durability.** IPFS availability depends on active pinning; Arweave permanence covers manifests and proofs, not video bytes. Licensed access means the *right* defined by the license terms (rental, licensed streaming, or permanent download where explicitly permitted); the *bits* depend on the pinning strategy documented in `PINNING.md`. No "forever" or "can't be taken away" claim is made.
7. **Attestor trust.** In the bootstrap phase the attestor can fabricate or censor reports. The mitigation is transparency (all reports are on-chain events) and the planned move to quorum/challenge models — not pretended trustlessness.

---

## 9. Roadmap

- **Phase 1 (done):** CDN-abstraction streaming service, storefront, filmmaker onboarding, test-mode checkout, signed receipts, Collector Pass mechanics (draft), Vimeo contacts-only migration.
- **Phase 2 (this paper):** full contract suite (TicketNFT, SubscriptionManager, PayPerView, DFLIX), encrypted fragment storage (IPFS/Arweave), ethers v6 wallet layer, Merkle proof registry, seeder reputation, Sepolia deployment script.
- **Phase 3 (planned):** testnet pilot with real wallets (faucet-funded), measured swarm-density study, multi-attestor quorum, challenge-response seeding proofs, Goldsky event indexing replacing linear scans.
- **Phase 4 (gated):** mainnet launch **only after** transaction-specific legal assessment, security audit of the contracts, and demonstrated unit economics. No date is promised.

---

*This is a technical design document describing software as built. It is not an offer to sell any token, ticket, or security, and it makes no promise of future functionality, returns, or launch dates.*

---

## 10. Wallet and access-control flow (reference implementation)

The Phase 2 wallet layer (`apps/frontend/lib/web3/`) is deliberately thin: it connects, it reads chain state, it writes transactions. It does not custody anything.

1. **Discovery.** On page load the client listens for EIP-6963 provider announcements and falls back to legacy `window.ethereum`. MetaMask and Coinbase Wallet are detected by their flags; any EIP-6963 wallet works. With no wallet present, every function degrades gracefully and the product's demo flows continue to work — the protocol layer is additive, never a gate on browsing.
2. **Connection.** `connectWallet()` returns an ethers v6 `BrowserProvider`, a signer, and the address. Account and chain changes are subscribed with cleanup on unmount.
3. **Network.** `switchChain()` targets Sepolia (11155111) for the testnet phase and Arbitrum Sepolia (421614) for the L2 track, adding the chain to the wallet if missing.
4. **Entitlement check.** Before requesting a decryption key, the client calls `hasValidTicket`, `hasActiveSubscription`, or `hasAccess` — pure view calls, no gas. The access-control worker performs the same check server-side against chain state before releasing the key.
5. **Purchase.** `mintTicket`, `subscribe`, or `buyAccess` — each wrapper validates inputs, estimates nothing silently, and surfaces revert reasons. Overpayment reverts by contract design; there is no "extra tip" path that could strand funds.

Contract addresses resolve from environment configuration with explicit `UndeployedError`s until the testnet deployment (step 9) fills them in. The frontend never hardcodes an address that hasn't been deployed.

## 11. DFLIX distribution and reward math (worked example)

The 1,000,000,000 DFLIX cap is a ceiling, not a schedule. No distribution is final until governance sets it, but the mechanics constrain the shape:

- **Reward pool funding is explicit.** `fundRewardPool(amount)` moves the owner's DFLIX into the staking/seed pool. Rewards can only ever be paid from what was funded — the contract cannot mint rewards into existence. This is the single most important anti-inflation property: liabilities are bounded by prior funding transactions, all visible on-chain.
- **Staking accrual.** Rewards accrue per second per staked token at `rewardRate` (settable by owner, viewable by anyone). A staker's pending rewards are checkpointed on every stake/unstake/claim, so the math is O(1) per interaction regardless of pool size.
- **Seed allocation.** `allocateSeedReward(seeder, amount, reportHash)` credits a seeder from the pool; `reportHash` prevents double-counting the same report. A pool over-commit guard reverts allocations that would exceed funded-but-unclaimed balances (best-effort: staking accruals between blocks are not pre-reserved, documented in NatSpec).

**Worked example (illustrative, not promised):** the owner funds the pool with 1,000,000 DFLIX and sets `rewardRate` such that 100 DFLIX accrues per day across all stakers. A seeder reported serving 500 GB in a period receives an allocation of 2,000 DFLIX from the pool. A staker with 10,000 DFLIX staked for 30 days accrues a pro-rata share of the 3,000 DFLIX emitted to stakers in that window. If the pool empties, accruals continue to be *tracked* but claims revert until the pool is re-funded — the protocol prefers a visible failed claim over silent dilution.

## 12. Why this architecture (and not the alternatives)

**Why ERC-721 tickets instead of a database of entitlements?** The ticket is self-custodied and verifiable by any third party. A filmmaker can leave the platform and viewers keep their tickets; a new client can honor them by reading the chain. A database entitlement dies with the company.

**Why a separate PayPerView contract instead of only NFTs?** Not every purchase needs a transferable asset. A pure access record is cheaper (no mint, no metadata) and matches buyer intent for single films. The protocol offers both primitives and lets the product choose per use case.

**Why Merkle roots on-chain instead of full hash lists?** Storing 1,000 fragment hashes on-chain costs ~1,000 storage slots; a Merkle root costs one. Verification is O(log n) proof data supplied by the retriever. The tradeoff: the full leaf set lives in the Arweave manifest (permanent, cheap), while the chain holds the 32-byte commitment. Tamper evidence is preserved — any leaf not in the tree fails verification.

**Why an attestor instead of fully trustless seeding proofs?** Trustless bandwidth proofs (proof-of-retrievability challenges, probabilistic micropayments) are real cryptography but heavy protocol machinery. The pilot needs *measured* seeding data first: who seeds, how much, how reliably. The attestor is the honest bootstrap — every report is an on-chain event, so fabrication is at least visible. Challenge-response verification is the Phase 3 upgrade, and the reputation contract is designed to consume its outputs without redeployment of the scoring logic.

**Why not put video bytes on Arweave?** Cost. Arweave's permanent endowment prices per byte forever; video at scale would cost orders of magnitude more than the film's revenue. Arweave holds manifests and proofs (kilobytes); IPFS/Filecoin hold encrypted bytes with active pinning.

## 13. Competitive and legal positioning

The protocol competes with centralized distributors (Vimeo OTT, Gumroad, Eventive) on **take rate and custody**: 75% to the filmmaker with wallet-to-wallet settlement versus platform-held balances and 30–50% effective takes. It does not compete on content moderation, discovery algorithms, or licensed catalogs — those are product-layer concerns.

Legally, the protocol is designed for **utility characterization**: tickets are access rights, DFLIX powers protocol mechanics, and no contract promises profit. But characterization is jurisdiction- and fact-specific, which is why §8 requires transaction-specific counsel before mainnet. The Producer-tier crowdfunding mechanics in the `FilmmakerCampaign` contract are DEFERRED (the contract carries a prominent DEFERRED warning and is not deployed). Crowdfunding without a registered funding portal creates unregistered-securities risk. The deferred contract is quarantined from the Phase 2 access contracts — a deliberate separation so the core ticket/subscription/PPV flow does not inherit crowdfunding risk.

## 14. Security considerations

- **Reentrancy**: all payable functions are `ReentrancyGuard`-protected; the DFLIX staking bug found in testing (allowance self-check on `transferFrom`) was fixed to internal `_transfer` — a reminder that token-interacting contracts need adversarial review of every approval assumption.
- **Access control**: `Ownable` for params, `MINTER_ROLE`/`attestor` for minting/reports. Owner powers are enumerated in §7's table; none can move user funds.
- **Input validation**: exact-payment enforcement, zero-address/zero-amount reverts, custom errors throughout (cheaper than strings, testable).
- **Upgradeability**: Phase 2 contracts are **not upgradeable** (no proxies). Bugs are fixed by deploying new contracts and migrating — a conscious choice: proxies add admin trust surface, and the pilot's contract set is small enough to redeploy.
- **What has NOT happened**: no third-party security audit. The test suite (217 contract tests) covers logic, not economic attacks. Mainnet deployment without an audit would be reckless, and this paper states that plainly.

---

*Word count: ~3,400. End of whitepaper.*
