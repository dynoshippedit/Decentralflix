# Pattern-pack sweeps — SEC dispositions (2026-09-29)

Exclusions used in every `rg`: `node_modules/**`, `.next/**`,
`packages/contracts/artifacts/**`, `packages/contracts/cache/**`,
`packages/contracts/typechain-types/**`, `devteam/**`.

## Dispositioned as FALSE POSITIVES (do not re-inspect)

- **innerHTML sinks in `apps/lifeboat/public/`** — all untrusted interpolations go
  through `D.esc` (`public/app.js:21-25`): `dashboard.html:102-110` (claim email/ref/id
  escaped), `verify.html:73-76` (`row()` escapes key+value; film title from server
  escaped at `:139`), `pass.html:85-88` (film_id/title escaped), `onboard.html:87-91`
  (step labels escaped), `app.js:114-123` (nav from constants; `showStatus` escapes).
  Remaining hits are static strings. No XSS vector found.
- **`ecrecover` in `SeederCredits.sol:141`** — safe in context: `recoverSigner` enforces
  65-byte signatures and v∈{27,28}, and the result is compared with `==` against the
  non-zero `platformAttestor` (`:92`), so a zero-address return can never pass; signature
  malleability doesn't change the recovered address. The REAL issue in that function is
  replay (no nonce) → logged as SEC-012, not here.
- **`.call{value:` in contracts** — 8 sites (`PayPerView.sol:129,141`,
  `TicketNFT.sol:151`, `MovieTicket.sol:193,234,294`, `SubscriptionManager.sol:154`,
  `FilmmakerCampaign.sol:256,279`): all check the return value and revert on failure,
  all are behind `nonReentrant` + checks-effects-interactions (state zeroed before the
  call). No reentrancy vector found in the spot-check (W3B owns the deep review).
- **`block.timestamp` in contracts** — 16 sites, all timekeeping (expiry, cooldowns,
  deadlines, delisting markers). No randomness use. Not a finding.
- **`exec`/`spawn`/`child_process`** — only in `cli/status.tsx` (local blessed TUI:
  `execSync('git rev-parse …')`, `spawn('bash',['-c',cmd])` for dev-chosen commands,
  `spawn($EDITOR)`); not network-reachable, not part of the service. No finding.
  (Server-side `RegExp.exec` hits in `server.js`/`cdn.js` are string parsing, not code exec.)
- **`localStorage` token storage** — no auth tokens in localStorage anywhere. Hits are
  consent flag (`LegalConsentModal.tsx`) and admin mock data (`admin/page.tsx`). The
  lifeboat storefront (`public/app.js`) sends no `Authorization` header at all.
- **`approve(`** — zero hits in contracts. Not applicable.
- **`tx.origin` / `delegatecall` / `selfdestruct` / `unchecked`** — zero hits in contracts.
- **`Math.random` in security contexts** — zero hits in `apps/lifeboat`,
  `packages/storage/src`, contract scripts; all IDs/tokens/keys use `crypto.randomBytes`.
- **Secret fallback defaults** (`|| '...'`) — no hits near secret/key/token/password names
  in the lifeboat.
- **`localhost` hardcodes** — `server.js:1301` is a URL-parse base fallback (harmless);
  `apps/frontend/app/{dashboard,mint}/page.tsx` hardcode `http://127.0.0.1:8545` as the
  wagmi RPC for local Hardhat — dev default, fails closed in a browser (connects to the
  *viewer's* loopback). S4 at most; not a finding.
- **Duplicate route registrations** — extracted all 34 `(seg[0] === …)` branches in
  `handleApi` (`server.js:1101-1289`): no duplicates, no shadowed routes (each branch
  constrains method + segment length; ordering verified).

## True positives → findings

- Unauthenticated grant/profile/claim routes → SEC-001, SEC-004, SEC-008
- `store.remove` missing → SEC-002
- CSV formula sink → SEC-005
- Upload without validation/quota → SEC-006
- SeederCredits replay → SEC-012

## Not swept here (other lanes own)

- Dependency vulnerabilities (`npm/pnpm audit`) → BLD-001 etc. (BLD)
- Secret scan over history → BLD (clean)
- Slither/Aderyn on contracts → not installed; W3B
- Full contract logic review → W3B
