# Owner decisions — Decentralflix — 2026-09-29 (Dino)

## Mint fix changed: dev-build-only, not per-user cap (DECIDED)
- Do NOT cap test-credit minting. Instead: test-credit minting
  (`POST /api/passes/test`, `POST /api/purchases/test`,
  `POST /api/purchases/bundle/test`) exists ONLY in dev builds, OFF by
  default.
- Rationale (Dino): a per-user cap still lets anyone farm credits with extra
  accounts.
- In production, credits come ONLY from confirmed payments (Stripe webhook
  with valid signature).
- This lands BEFORE anything goes live.
- Queued as the next Decentralflix task after df-cycle-10 (MUS-001) completes,
  to avoid same-branch TASKS.md collisions.

## Credit-sweep ownership question (Dino, answered 2026-09-29)
- Q: did the nine-route sweep check ownership (user A spending/changing user
  B's credits), or only login?
- A: ownership WAS checked — attacker/victim/filmmaker roles live-probed:
  attacker minting with victim's email in the body got a pass bound to the
  attacker (body email ignored); attacker redeeming the victim's pass got
  403; non-filmmaker approving a claim got 403; double-redeem gave
  already_owned with no double-spend. The only credit-spend path
  (redeemCredit) has a single call site, and cross-user spend is blocked.
- No separate ownership pass needed. Remaining hole is self-mint (R1),
  addressed by the dev-build-only decision above.
