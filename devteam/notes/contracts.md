<!-- W3B · 2026-09-29 · Phase 2/3 · Full line-read of all 11 contracts (2,439 lines total) -->
<!-- Contracts are UNAUDITED (owner-stated). No Slither/Aderyn in this environment; analysis is manual. -->
<!-- Findings referenced as W3B-xxx live in devteam/findings/w3b.md -->

# Contract notes (W3B)

Solidity 0.8.28 toolchain per MAP (pragma `^0.8.20` in sources). All contracts use OpenZeppelin `Ownable` / `ReentrancyGuard` / `AccessControl`. No proxies — nothing is upgradeable (no `initialize`, no storage-layout risk, no admin-key timelock question). No `tx.origin`, `delegatecall`, `selfdestruct`, block-value randomness, or `ecrecover` (except SeederCredits) anywhere.

## PayPerView.sol (188 lines) — one-time film purchases, escrow + pull withdrawal
- **What it does:** Filmmakers permissionlessly `registerFilm` (caller = filmmaker). Buyers `buyAccess` with EXACT payment; revenue accrues per film in `_filmRevenue`; filmmaker pulls via `withdrawRevenue`, at which point `platformFeeBps` (owner-set, hard-capped 2500) is split to `_accruedPlatformFees`; owner pulls fees via `withdrawPlatformFees`.
- **Trust assumptions:** filmmaker identity is self-asserted at registration (first-come per filmId); owner sets the fee (≤25%).
- **Money math:** `fee = amount * bps / 10000` (rounds down), `filmmakerAmount = amount - fee` — sums exactly, dust favors the filmmaker. No dust anywhere. ✓
- **Reentrancy:** `nonReentrant` on all three state-changing fns; balances zeroed before `.call` (CEI clean). SAFE.
- **Fee-cap enforcement:** `setPlatformFeeBps` reverts above 2500 (`:142-144`); applied at WITHDRAWAL time using the current fee — an owner fee hike between purchase and withdrawal retroactively raises the fee on already-accrued revenue (documented in NatSpec `:139-141`).
- **Stuck funds:** if the filmmaker never withdraws, funds sit forever — no sweep, no expiry, no owner recovery. Platform fees likewise never accrue until withdrawal.
- **Issues:** none open beyond the fee-timing note (by design). No unregister/delist function (moderation gap noted in W3B-013 context).

> **SUPERSEDED 2026-09-29 (owner decision, df-cycle-13):** TicketNFT now inherits the shared `RevenueSplitter` — mint splits **75/25** at purchase (75% + rounding remainder to the filmmaker, 25% platform, `MissingCreator` revert, owner cannot redirect or alter). The 100%-to-filmmaker text below is kept for history; do not treat it as current.

## TicketNFT.sol (241 lines) — ERC721 single-use tickets, direct-forward payment
- **What it does:** Owner registers films (title, price, filmmaker payee, soulbound flag). Buyers `mintTicket` with EXACT payment, 100% forwarded immediately to the filmmaker (no platform fee, no escrow). `redeemTicket` burns on entry. Soulbound films block transfers via `_update` override.
- **Trust assumptions:** owner is the sole registrar/minter-of-record (permissioned model, unlike PayPerView).
- **Money math:** exact forward, no fee, no rounding. ✓
- **Reentrancy:** `nonReentrant` on mint/redeem; CEI clean (state + `_safeMint` before payment). SAFE.
- **Issues:** W3B-006 (no filmmaker-address update — broken payee bricks minting permanently).

## MovieTicket.sol (434 lines) — ERC721A tiered passes + burnable tickets, immediate creator payout
- **What it does:** Owner-only `mintPermanentPass` / `mintBurnableTicket` (BASIC/DELUXE/PRODUCER tiers); pays the creator immediately via `.call`, keeps `platformFee` as residual contract balance; owner sweeps everything via `withdraw()`. O(1) reverse indexes (`_filmAccessCount`, `_tierBalance`) power `hasAccessToVideo` / `highestTierMultiplier` (SeederCredits consumes the latter). Owner-only `delistFilm`/`restoreFilm` for illegal content; `pause`/`unpause`.
- **Trust assumptions:** owner mints on behalf of buyers (operator-mediated sale); delisting is a unilateral owner power (documented as CSAM/illegal-only).
- **Money math:** `platformFee = price * bps / 10000` (down), `creatorShare = price - platformFee` — exact. BUT fees are not ledgered; they commingle with overpayments in raw balance (W3B-002).
- **Reentrancy:** `nonReentrant` on mints + withdraw; external `creator.call` happens BEFORE mint/index writes — CEI order imperfect, but the guard blocks reentry (incl. cross-function and via `_safeMint` receiver callbacks). SAFE via guard.
- **Fee-cap enforcement:** constructor + `setPlatformFee` both `require(<= 2500)`. Deploy script uses 2500 (`scripts/deploy.ts:21`).
- **Issues:** W3B-002 (overpayment capture + fee commingling), W3B-009 (fragile `_videoCounter` invariant + dead `isDelisted` struct field), W3B-014 (false "fully non-custodial" NatSpec), W3B-015 (indexed string events).

## SubscriptionManager.sol (186 lines) — time-boxed plans, 100% to owner
- **What it does:** Owner creates plans (name, price, duration). Users `subscribe` (exact payment, no active sub), `renew` (active, same plan, extends from expiry), `cancel` (immediate, NO REFUND — confirmed in code `:150-157`). All revenue accumulates; only the owner withdraws.
- **Trust assumptions:** owner defines plans; no per-plan filmmaker exists.
- **Money math:** no splits at all — 100% owner. No rounding issues (no splits to round).
- **Reentrancy:** `nonReentrant` on subscribe/renew/withdraw; no external calls in subscribe/renew. SAFE.
- **Issues:** W3B-004 (no creator split — the documented Collector Pass economics can't be expressed); plan deactivation is irreversible (no reactivate).

## FilmmakerCampaign.sol (376 lines) — crowdfund + milestone escrow — BUSINESS-DEFERRED, DO NOT DEPLOY
- **What it does:** Permissionless campaign launch; tiered `contribute` mints InvestmentNFTs (ERC721A); funds escrow per campaign; owner releases milestone tranches (`approveMilestoneAndRelease`); 48–72h AI-proof review window; pull refunds on FAILED / past-deadline-under-target; `emergencyRefundAll` owner escape hatch.
- **Trust assumptions:** owner is milestone approver and emergency actor; attestor model for AI proofs.
- **Money math:** overpayment counts toward target (W3B-003); milestone amounts not validated against target (W3B-017).
- **Reentrancy:** `nonReentrant` on contribute/claimRefund/approveMilestoneAndRelease; escrow decremented before `.call`. SAFE via guard.
- **Issues:** W3B-003, W3B-007 (AI-approve no-op), W3B-016(1) (duplicated pragma/imports), W3B-017. All fixes gated on "before any deploy" — the contract must not be deployed or offered per its own header banner and AGENTS.md.

## DFLIX.sol (307 lines) — ERC20 (1B cap) + staking + seed-to-earn
- **What it does:** Capped minting (MINTER_ROLE, `MAX_SUPPLY` = 1e9 × 1e18 enforced in `mint`). Staking with 7-day lock from first stake; rewards accrue per-second at admin-set rate, paid ONLY from the funded `rewardPool`. Seed-to-earn: admin/attestor allocates against `reportHash` (replay-guarded), capped so allocations ≤ pool.
- **Trust assumptions:** admin fully trusted (rate, attestor, pool funding, minter grants); attestor's off-chain reports honest.
- **Money math:** accrual `(staked * rate * elapsed) / 1e18` — consistent between `_checkpoint` and `pendingRewards`; integer division floors, dust stays in pool. `claimRewards` reverts if `total > rewardPool`; staked principal is never claimable as rewards (pool ledger separate from staked balances). ✓
- **Reentrancy:** `nonReentrant` on stake/unstake/claim; no external calls. SAFE.
- **Issues:** W3B-012 (rate change retroactive over uncheckpointed elapsed time — admin-trusted, document).

## SeederCredits.sol (161 lines) — off-chain-report credit ledger with ECDSA attestor sigs
- **What it does:** Seeder submits `(arweaveTxId, claimedAmount, platformSignature)`; contract verifies the attestor's ECDSA signature over `(msg.sender, arweaveTxId, claimedAmount, chainId)` with the `\x19Ethereum Signed Message` prefix, applies the MovieTicket tier multiplier, credits the seeder. 1-day claim cooldown; owner pause; `emergencySlash`.
- **Signature review:** chainId included (cross-chain replay safe); msg.sender bound (no theft); `ecrecover` zero-address return is safe (compared to non-zero `platformAttestor`); no s-value malleability check (not exploitable for impersonation — S4). **Missing: nonce/timestamp → replayable** (W3B-001/SEC-012); `MAX_REPORT_AGE` declared but never enforced.
- **Reentrancy:** `nonReentrant`; no external calls (tier multiplier is a view). SAFE.
- **Issues:** W3B-001 (DUPLICATE→SEC-012), W3B-010 (slash without event / silent no-op).

## SeederReputation.sol (141 lines) — attestor-fed reputation ledger, no value
- **What it does:** Attestor-only `reportSeeding` accumulates `(uptimeSecs, bytesServed, validProofs)`; `scoreOf` computes the documented formula with integer division. No ETH, no tokens, no user-writable state.
- **Trust model:** exemplary NatSpec — attestor-trusted, not Sybil-proof, self-dealing undetectable, "INFORMATIONAL ONLY". No deduplication per periodId (documented).
- **Arithmetic:** 0.8 checked arithmetic — accumulation reverts on uint64/uint128 overflow rather than wrapping. Formula matches docstring.
- **Issues:** none. (This is the best-documented trust model in the suite; other contracts should copy the LIMITATIONS-banner pattern.)

## ProofRegistry.sol (229 lines) — sha256 Merkle-root registry for fragment manifests
- **What it does:** Anyone first-registers a filmId's `(merkleRoot, fragmentCount, arweaveTx)`; afterwards only registrant/owner may update. `verifyFragment` recomputes sha256(left||right) order-preserving proofs (matches `packages/storage/src/merkle.js` convention; OZ's keccak-based verifier deliberately not used — documented).
- **Verifier review:** `_treeDepth` = ceil(log2(n)); single-leaf → depth 0, empty proof, root == leaf. Odd-layer duplication handled by the prover supplying the duplicate as sibling. Index/proof-length bounds enforced; returns bool (no silent pass).
- **Issues:** W3B-005 (front-runnable first registration — documented caveat, no on-chain mitigation).

## Reviews.sol (139 lines) — NFT-gated reviews, no value
- **What it does:** `submitReview` gated by `onlyVerifiedOwner`: not delisted AND (`movieTicket.hasAccessToVideo` OR `filmmakerCampaign.hasCrowdfundAccess`). One review per user per videoHash (editable). Delisting hides (not deletes) reviews.
- **Cross-contract reads:** external view calls in the modifier — read-only, no reentrancy surface.
- **Issues:** W3B-011 (no zero-check on `_movieTicket`), W3B-015 (indexed string events).

## mocks/MockTicketGate.sol (37 lines) — TEST ONLY
- Unguarded setters by design; never deployed (`scripts/deploy.ts` doesn't reference it — spot-verified claim in its header).
- Stale comment: says MovieTicket's access check "is a Phase-0 stub that always returns false" — now a real O(1) index (W3B-016 item 2).
