# S1 — baseline

Pre-change baseline inherited from checkup-df13-2026-09-29b on the same tree
(1c7c82a + the DEPLOYMENT_CHECKLIST.md rewrite): hardhat 236/236 passing,
frontend vitest 211/211 passing, tsc clean, ABI-drift guard refusal proven by
fault injection, live 7-wei mint probe (platform 1, filmmaker 6, contract 0).

The gate requires at least one baseline check receipt, so check-hardhat was
also run through the recorder as the baseline check. Honest note: that run
happened post-fix (the fixes preceded the snapshot — see the S0 deviation
note), so it is a same-tree confirmation run, not a true pre-change capture.
The true pre-change verification is the df13b record cited above. The final
checks re-run all three suites post-change through the recorder; receipts in
checks/baseline/ and checks/final/.

No environment faults: node/npx/npm available, hardhat local network runs,
no missing credentials needed (all checks are local; no live-network deploy
or verification is attempted).
