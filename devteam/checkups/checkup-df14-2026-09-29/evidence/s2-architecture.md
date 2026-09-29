# S2 — design reconstructed around the change

- copy-dashboard: the dashboard's RECENT PAYOUTS footnote is the only
  user-facing statement of fee mechanics on that page. It feeds no logic;
  it is read by film owners. Its claim must match RevenueSplitter.sol
  (immutable PLATFORM_FEE_BPS = 2500, split executed inside the payment
  function, no owner withdrawal path exists in any of the four
  viewer-payment contracts).
- copy-demo: the public demo page's PLATFORM ECONOMICS section. The 30% card
  sat beside a 75% creator card (75 + 30 = 105, self-contradictory) and
  contradicted the deployed 75/25 rule. Read by prospective users.
- deploy-script: packages/contracts/scripts/deploy.ts deploys MovieTicket
  (whose constructor takes no fee argument since df-cycle-12) and, on live
  networks with ARBISCAN_API_KEY, runs verify:verify with constructorArguments.
  The dangling INITIAL_PLATFORM_FEE_BPS made tsc fail (TS2304) and would have
  raised ReferenceError at verify time on a live deploy — after contracts
  were already deployed. Fix: constructorArguments: [].

No data stores, events, or external effects are touched by any of the three
changes. Failure paths unchanged: contracts still revert on missing creator;
frontend still fails closed on missing wallet.
