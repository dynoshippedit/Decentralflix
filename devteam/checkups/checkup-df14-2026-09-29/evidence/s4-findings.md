# S4 — findings

DF-1 CONFIRMED_DEFECT — apps/frontend/app/dashboard/page.tsx:494.
Claim: the footnote said the 25% fee was "adjustable by the owner, hard-capped
at 25%" and "stays in the contract for the owner to withdraw" — every clause
false under the immutable splitter (no setter, no withdraw path, split at
payment time). Challenge: could "adjustable" refer to some other fee? No —
grep shows no fee setter or owner-withdraw function in any viewer-payment
contract; the only fee constant is immutable PLATFORM_FEE_BPS = 2500.

DF-2 CONFIRMED_DEFECT — apps/frontend/app/demo/page.tsx:170.
Claim: the economics card showed a "30% Platform fee" beside the 75% creator
card — self-contradictory (105%) and wrong (25%). Challenge: could 30% refer
to a different product line? No — the card sits in PLATFORM ECONOMICS next to
the creator card and describes the same platform fee.

DF-3 CONFIRMED_DEFECT — packages/contracts/scripts/deploy.ts:89.
Claim: constructorArguments referenced INITIAL_PLATFORM_FEE_BPS, deleted in
df-cycle-12; tsc fails TS2304 and a live verified deploy would crash with
ReferenceError after contracts deploy. Challenge: is the symbol defined
elsewhere (import, .env)? No — repo-wide grep finds only this one reference;
the constructor it verifies takes no arguments.

No other leads: repo-wide sweeps for "30%", "adjustable by the owner",
"owner to withdraw", "platformFeeBps", "setPlatformFee" return nothing.
