# Seeder Reputation — Limitations

`SeederReputation.sol` (`packages/contracts/contracts/`) keeps an on-chain
ledger of seeder activity and computes a score per seeder. This document
states plainly what the system does and does **not** guarantee. Read it
before wiring scores into anything with economic consequences (payouts,
rewards, access gating, ranking).

## What the system does

- The contract owner appoints a **trusted attestor** (an EOA or multisig).
  Only the attestor can submit seeding reports.
- Each report (`reportSeeding`) carries `uptimeSecs`, `bytesServed`,
  `validProofs` for a `periodId`, and **accumulates** into lifetime totals
  per seeder. Reports are never overwritten; every report emits an event.
- `scoreOf(seeder)` computes a score on-chain from a public, deterministic
  formula:

  ```
  score = (uptimeSecs / 3600) + (bytesServed / 1e9) * 10 + validProofs * 100
  ```

  1 point per reported hour of uptime, 10 points per reported gigabyte
  served, 100 points per reported valid proof. Integer division; remainders
  dropped. No reports → score 0.
- The attestor can be rotated by the owner (`setAttestor`); rotation is
  emitted as an event.

## What the system does NOT guarantee

### 1. Scores are not independently verified facts

The contract trusts the attestor completely. It checks *who* submitted a
report, never *whether the report is true*. A compromised, bribed, or
buggy attestor can fabricate arbitrary scores for arbitrary identities,
double-report the same period (the contract does not deduplicate
`periodId`), or censor real seeders by simply not reporting them.

**Mitigations (not implemented):** challenge-response proof protocols
(attestor issues random fragment challenges; seeders answer on-chain),
attestor multisig / decentralized attestation committees, slashing or
reputation for the attestor itself.

### 2. Sybil attacks: one entity, many identities

Nothing binds a seeder address to a unique real-world operator or machine.
A single entity can run N seeder identities, report activity on all of
them, and collect N shares of any score-weighted reward. Scores measure
*reported activity per identity*, not *distinct honest participants*.

**Mitigations (not implemented):** stake-weighted identity (score counts
only with locked collateral that is slashable), proof-of-unique-hardware,
web-of-trust / allowlist onboarding for the pilot phase.

### 3. Self-dealing (wash seeding)

A seeder serving its *own* requests — downloading its own fragments to
inflate `bytesServed` — is indistinguishable on-chain from a seeder serving
real demand. If rewards scale with score, the rational strategy is to
fake traffic, and the contract cannot tell the difference.

**Mitigations (not implemented):** demand-side proofs (only count bytes
served to *paying* viewers, cross-referenced with `PayPerView` /
`TicketNFT` access records), per-viewer rate limits, anomaly detection on
request graphs off-chain.

### 4. Measurement gaming

`uptimeSecs` is "reported uptime", not "proven availability". A seeder can
be registered as online while serving nothing, or report inflated
`validProofs` that the attestor never checked. The score formula's weights
(1 / 10 / 100) are arbitrary policy choices, not derived from any cost
model — they can and should be revisited with real data.

### 5. Centralization of the attestor

Today the attestor is a single owner-controlled key — the same bootstrap
trust pattern as `SeederCredits.platformAttestor`. That is a single point
of failure and a single point of coercion. Rotation helps key hygiene; it
does not decentralize trust.

## Recommended posture

- **Pilot phase:** treat scores as informational leaderboards only. Fine
  for dashboards, "top seeders" UI, and community recognition.
- **Before any economic weight:** add at least (a) challenge-response
  verification of a sample of reported proofs, and (b) stake or
  allowlisted identity to raise the Sybil cost above the reward.
- **Never** present a score to users as "verified", "trustless", or
  "proof of seeding". The honest label is *"attestor-reported activity"*.

## Related

- Contract NatSpec in `SeederReputation.sol` carries an abbreviated form
  of these warnings (it is the version users see on block explorers).
- `docs/legal/` — any mainnet deployment tying scores to token rewards
  must be reviewed by licensed counsel first (same bar as the rest of the
  Phase 2 suite).
