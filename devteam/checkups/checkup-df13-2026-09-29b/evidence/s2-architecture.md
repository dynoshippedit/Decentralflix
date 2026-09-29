# S2 — as-is architecture (checkup-df13-2026-09-29b)

## Layers in the change

**On-chain (packages/contracts/contracts/)**
- `RevenueSplitter.sol` (abstract, Ownable): single source of the rule.
  `PLATFORM_FEE_BPS = 2500` immutable constant, no setter. `_splitRevenue(creator)`:
  revert on zero creator; `fee = msg.value * 2500 / 10000` (floor); creator gets
  `msg.value - fee`; transfers via `.call`; emits `RevenueSplit`. Owner = fee
  recipient, cannot change the split or redirect.
- `TicketNFT.sol` (ERC721, RevenueSplitter, ReentrancyGuard): owner-only film
  registry (registerFilm / setFilmActive / setFilmPrice; filmmaker set once at
  registration, no setter). `mintTicket` payable nonReentrant: exact-payment
  check, token mint, per-holder counts, then `_splitRevenue(film.filmmaker)`
  when `msg.value > 0`. `redeemTicket` burns (single-use). Soulbound films block
  transfers in `_update`; valid-ticket counts stay synced on transfers.

**Pipeline (packages/contracts/scripts/export-abi.ts)**
- Hardcoded 10-contract list -> `apps/frontend/lib/contracts/abis.generated.ts`
  (AUTO-GENERATED, do-not-edit). Runs via `npm run export:abi` (also on compile).
- `abi-drift.test.ts`: per-contract deep equality of `*_ABI_FULL` consts vs
  compiled artifacts; fail-closed on missing artifact/const/changed entry; runs
  under `npm test`. One documented deviation: SEEDER_CREDITS_ABI carries a single
  frontend-only entry, asserted as the only allowed deviation.

**Frontend (apps/frontend/)**
- `lib/contracts/config.ts`: canonical `PLATFORM_FEE_BPS=2500` /
  `CREATOR_SHARE_BPS=7500` mirrors; ABI aliases all point at `*_ABI_FULL`.
- `lib/web3/wrappers/payPerView.ts`: typed wrappers with input validation
  (`validate.ts`: reqAddress/reqUint/reqWei); `platformFeeBps()` reads the
  immutable on-chain constant; no fee setter / withdraw / accrued balance.
- `lib/contracts/useMovieTicket.ts`: React hook reading on-chain fee +
  totalSupply, falling back to the canonical mirror when undeployed; local fee
  math mirrors on-chain (floor fee, remainder to creator).
- `app/mint/page.tsx`: MovieTicket mint UI; fee percent now always derived from
  hook state (stale "30" fallback removed in this change).

**Docs**: superseded banners in the three notes files (history preserved);
WHITEPAPER 3.1 describes TicketNFT 75/25; QUESTIONS.md Q-df12-001 resolved.

## Primary success path (traced, then executed in S1)
buyer -> `mintTicket(filmId)` {value: price} -> `_getFilmOrRevert` -> active check
-> `msg.value == price` check -> tokenId assignment -> counts/mint/events ->
`_splitRevenue(filmmaker)`: MissingCreator check -> fee=floor(value*2500/10000)
-> `owner().call{fee}` -> `filmmaker.call{value-fee}` -> RevenueSplit event.
Atomic: any revert unwinds the mint as well. S1 probe: 7 wei -> 1/6/0.

## Most consequential failure path
Filmmaker (or owner) is a contract whose fallback reverts -> `_splitRevenue`
reverts -> whole mint reverts. Fail-closed: no partial state, buyer keeps funds
minus gas. Same for inactive film (FilmInactive), wrong value (IncorrectPayment),
zero filmmaker at registration (ZeroAddress). No retry/duplication surface:
the split is a single atomic transaction; no off-chain job replays it.

## Intended vs implemented
Intended (owner decision): one immutable 75/25 rule, no exceptions, frontend
locked to compiled contracts. Implemented matches. Structural wrinkle noted for
S4: the export-abi CONTRACTS list and the drift-guard CONTRACTS list are both
hardcoded in separate files and could drift from each other.

## Function/contract index (invariants)
| Symbol | Inputs | Invariant | Failure |
|---|---|---|---|
| RevenueSplitter._splitRevenue | creator, msg.value | fee=floor(v*2500/10000); creator=v-fee; zero creator reverts | MissingCreator / TransferFailed |
| TicketNFT.mintTicket | filmId, msg.value | exact payment; filmmaker immutable; nonReentrant | IncorrectPayment, FilmInactive, FilmNotFound |
| TicketNFT.registerFilm | filmId,title,price,filmmaker,soulbound,uri | owner-only; filmmaker non-zero, immutable after | ZeroAddress, FilmAlreadyRegistered, InvalidFilmId |
| TicketNFT.redeemTicket | tokenId | only current owner; single-use burn | NotTicketOwner |
| export-abi main | artifacts dir | all 10 artifacts present | exit 1 "run npx hardhat compile" |
| abi-drift guard | generated consts + artifacts | deep equality per contract | test failure naming the contract |
| payPerView wrappers | validated scalars | inputs validated before chain use | validate.ts throws |
| useMovieTicket | — | fee math mirrors chain; mirror fallback | warn + mirror values |
