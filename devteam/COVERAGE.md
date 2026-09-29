# COVERAGE
Owner: MAP (Cartographer) · Last updated: 2026-09-29 · Branch devteam/review-2026-09-29 @ b8b519e
Legend: [ ] not started · [~] partial (give ranges) · [x] done · n/a not required for this tier/file · NOT REVIEWED (reason)
Lenses: COR correctness · SEC security · PRF performance · TST tests · ARC architecture · UIX frontend · DAT data · DOM domain · DOC docs
Tier requirements — High: every applicable lens, every line · Medium: COR+SEC+ARC (+UIX/DAT/DOM where applicable), every line · Low: COR, every line.
Tiers: H=70 · M=102 · L=90 · 262 rows (12 devteam/ files excluded — out of scope per B1; 6,371 dependency/build files excluded below)

Required cells remaining: 1001   (check: grep -cE '\[ \]|\[~\]' devteam/COVERAGE.md)

| File | Lines | Tier | COR | SEC | PRF | ARC | TST | UIX | DAT | DOM | DOC | Read ranges / notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `.gitignore` | 43 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | gitignore |
| `.html` | 51 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `AGENTS.md` | 63 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `ARCHITECTURE.md` | 20 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `ARCHITECTURE_REVIEW_v2.md` | 310 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `CLAUDE.md` | 4 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `DECISIONS.md` | 7 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `DEPLOYMENT_CHECKLIST.md` | 55 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `GROK.md` | 40 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `Html` | 138 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `LICENSE` | 23 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `LOCAL_TESTING.md` | 60 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `MORNING_REPORT.md` | 61 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `PHASE0.md` | 28 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `README.md` | 36 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `RISKS.md` | 9 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `ROADMAP.md` | 139 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `RULES.md` | 53 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `RUN.md` | 47 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `SEPOLIA_DEPLOY.md` | 79 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `START.md` | 11 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `STORAGE_STREAMING_ARCHITECTURE_DECISION.md` | 341 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `TODO.md` | 123 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `apps/frontend/.gitignore` | 41 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | gitignore |
| `apps/frontend/AGENTS.md` | 5 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `apps/frontend/CLAUDE.md` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `apps/frontend/README.md` | 36 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `apps/frontend/app/DemoFilmGrid.tsx` | 38 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | demo grid |
| `apps/frontend/app/admin/page.tsx` | 433 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | admin page; authz-critical |
| `apps/frontend/app/admin/review/[id]/page.tsx` | 105 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | admin page; authz-critical |
| `apps/frontend/app/catalog/page.tsx` | 140 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/collection/page.tsx` | 279 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/crowdfund/page.tsx` | 37 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/dashboard/page.tsx` | 646 | H | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | >500 lines; renders external data |
| `apps/frontend/app/demo/page.tsx` | 197 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/favicon.ico` | 0 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | binary asset |
| `apps/frontend/app/film/[hash]/page.tsx` | 216 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/globals.css` | 26 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | shell |
| `apps/frontend/app/layout.tsx` | 48 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | n/a | n/a | n/a | shell |
| `apps/frontend/app/legal/page.tsx` | 60 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/mint/page.tsx` | 339 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/page.tsx` | 336 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/pricing/page.tsx` | 238 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/privacy/page.tsx` | 39 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/reviews/page.tsx` | 64 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/spike1/page.tsx` | 391 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | prototype spike page |
| `apps/frontend/app/spike2/page.tsx` | 576 | H | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | >500 lines; renders external data |
| `apps/frontend/app/tos/page.tsx` | 82 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/upload/page.tsx` | 395 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/app/watch/[hash]/page.tsx` | 158 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | page; renders external data |
| `apps/frontend/components/EmptyState.tsx` | 36 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | UI component |
| `apps/frontend/components/ErrorState.tsx` | 27 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | UI component |
| `apps/frontend/components/FilmCard.tsx` | 78 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | UI component |
| `apps/frontend/components/LegalConsentModal.tsx` | 93 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | legal gating UI |
| `apps/frontend/components/LegalFooter.tsx` | 23 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | UI component |
| `apps/frontend/components/LegalGate.tsx` | 41 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | legal gating UI |
| `apps/frontend/components/NavBar.tsx` | 70 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | UI component |
| `apps/frontend/components/Reviews.tsx` | 376 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | UI component |
| `apps/frontend/components/SkeletonCard.tsx` | 12 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | UI component |
| `apps/frontend/components/UploadTest.tsx` | 90 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | upload test component |
| `apps/frontend/components/VideoPlayer.tsx` | 288 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | player; STR domain (Livepeer/Filecoin/Theta sources) |
| `apps/frontend/components/WalletConnectButton.tsx` | 52 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | n/a | n/a | wallet connect UI; W3B |
| `apps/frontend/eslint.config.mjs` | 18 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `apps/frontend/hooks/useArweaveUpload.ts` | 74 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | upload/ingest hooks; external input; STR domain |
| `apps/frontend/hooks/useFilecoinLivepeerIngest.ts` | 540 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | upload/ingest hooks; external input; STR domain |
| `apps/frontend/hooks/useFilmMetadata.ts` | 222 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | data/integration hook; STR/DAT |
| `apps/frontend/hooks/useThetaP2PSeeder.ts` | 436 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | data/integration hook; STR/DAT |
| `apps/frontend/hooks/useVideoAccess.ts` | 107 | H | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | gated-access hook; SEC-critical |
| `apps/frontend/hooks/useVideoSources.ts` | 240 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | data/integration hook; STR/DAT |
| `apps/frontend/hooks/useVideoUpload.ts` | 144 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | upload/ingest hooks; external input; STR domain |
| `apps/frontend/lib/admin-types.ts` | 49 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | admin review type defs |
| `apps/frontend/lib/arweave/upload.ts` | 131 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | Arweave upload integration; STR/DAT |
| `apps/frontend/lib/cloudflare-access.ts` | 97 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | n/a | n/a | Privy JWT -> worker access; SEC/DAT |
| `apps/frontend/lib/contracts/abis.generated.ts` | 7031 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | generated from contracts (npm run export:abi); drift check is DOC/BLD |
| `apps/frontend/lib/contracts/config.test.ts` | 109 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | contract-lib tests |
| `apps/frontend/lib/contracts/config.ts` | 67 | H | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | contract addresses (default 0x0 = UNDEPLOYED); W3B |
| `apps/frontend/lib/contracts/index.ts` | 10 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | contract hooks (dashboard/campaign/ticket/reviews/seeder) |
| `apps/frontend/lib/contracts/useCreatorDashboard.ts` | 234 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | contract hooks (dashboard/campaign/ticket/reviews/seeder) |
| `apps/frontend/lib/contracts/useFilmmakerCampaign.ts` | 258 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | contract hooks (dashboard/campaign/ticket/reviews/seeder) |
| `apps/frontend/lib/contracts/useHasFilmAccess.ts` | 703 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | contract hooks (dashboard/campaign/ticket/reviews/seeder) |
| `apps/frontend/lib/contracts/useMovieTicket.ts` | 151 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | contract hooks (dashboard/campaign/ticket/reviews/seeder) |
| `apps/frontend/lib/contracts/useReviews.ts` | 61 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | contract hooks (dashboard/campaign/ticket/reviews/seeder) |
| `apps/frontend/lib/contracts/useSeederCredits.ts` | 469 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | contract hooks (dashboard/campaign/ticket/reviews/seeder) |
| `apps/frontend/lib/copy-honesty.test.ts` | 100 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | frontend tests (vitest) |
| `apps/frontend/lib/demo-content.test.ts` | 111 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | frontend tests (vitest) |
| `apps/frontend/lib/demo-content.ts` | 161 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | n/a | n/a | business logic; demo/mock content |
| `apps/frontend/lib/indexer.test.ts` | 111 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | frontend tests (vitest) |
| `apps/frontend/lib/indexer.ts` | 417 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | n/a | n/a | business logic |
| `apps/frontend/lib/licensing.test.ts` | 37 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | frontend tests (vitest) |
| `apps/frontend/lib/licensing.ts` | 58 | M | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | n/a | n/a | business logic |
| `apps/frontend/lib/pricing.test.ts` | 145 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | pricing-honesty tests (7) |
| `apps/frontend/lib/pricing.ts` | 235 | H | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] | [ ] | n/a | money math: CREATOR_SHARE=0.75 single source; MUS domain |
| `apps/frontend/lib/web3/README.md` | 93 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `apps/frontend/lib/web3/connect.test.ts` | 220 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer |
| `apps/frontend/lib/web3/connect.ts` | 169 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer |
| `apps/frontend/lib/web3/contracts.test.ts` | 51 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/contracts.ts` | 76 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/detect.test.ts` | 223 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer |
| `apps/frontend/lib/web3/detect.ts` | 141 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer |
| `apps/frontend/lib/web3/index.ts` | 11 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer |
| `apps/frontend/lib/web3/types.ts` | 86 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer |
| `apps/frontend/lib/web3/useWeb3Wallet.test.ts` | 44 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer |
| `apps/frontend/lib/web3/useWeb3Wallet.ts` | 158 | H | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | ethers v6 wallet layer |
| `apps/frontend/lib/web3/wrappers/dflix.test.ts` | 149 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/wrappers/dflix.ts` | 320 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/wrappers/index.ts` | 6 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/wrappers/payPerView.test.ts` | 102 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/wrappers/payPerView.ts` | 150 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/wrappers/subscriptionManager.test.ts` | 109 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/wrappers/subscriptionManager.ts` | 141 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/wrappers/ticketNft.test.ts` | 153 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/wrappers/ticketNft.ts` | 270 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/lib/web3/wrappers/validate.ts` | 101 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | ethers v6 wallet layer; W3B domain |
| `apps/frontend/next.config.ts` | 7 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `apps/frontend/package-lock.json` | 1313 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | generated lockfile; dependency audit is BLD's |
| `apps/frontend/package.json` | 36 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `apps/frontend/postcss.config.mjs` | 7 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `apps/frontend/providers/PrivyProvider.tsx` | 62 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | n/a | n/a | n/a | Privy auth provider (demo) |
| `apps/frontend/public/file.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `apps/frontend/public/globe.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `apps/frontend/public/next.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `apps/frontend/public/vercel.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `apps/frontend/public/window.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `apps/frontend/spikes/spike-1/README.md` | 127 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | spike notes |
| `apps/frontend/spikes/spike-2/README.md` | 222 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | spike notes |
| `apps/frontend/tsconfig.json` | 34 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `apps/frontend/vitest.config.ts` | 13 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `apps/lifeboat/.gitignore` | 5 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `apps/lifeboat/README.md` | 302 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `apps/lifeboat/lib/auth.js` | 63 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | email+password accounts, session store (sessions.json) |
| `apps/lifeboat/lib/cdn.js` | 128 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | stream/download delivery (Bunny stub + local fallback); STR domain |
| `apps/lifeboat/lib/ed25519.js` | 241 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | Ed25519 verify helper (public/frontend copy) |
| `apps/lifeboat/lib/pass.js` | 169 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | Collector Pass credits ledger; PASS_PRICE_USD_CENTS=999; non-cashable |
| `apps/lifeboat/lib/receipts.js` | 103 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | Ed25519 receipt signing; key gen 0600 (data/ gitignored) |
| `apps/lifeboat/lib/store.js` | 94 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | JSON-file persistence, atomic write tmp+rename; 12 collections |
| `apps/lifeboat/lib/stripe.js` | 133 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | Stripe stub; STRIPE_SECRET_KEY/WEBHOOK_SECRET env |
| `apps/lifeboat/public/README.md` | 35 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/app.js` | 173 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/browse.html` | 107 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/claim.html` | 112 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/dashboard.html` | 189 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/ed25519.js` | 241 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/film.html` | 149 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/filmmaker.html` | 59 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/import.html` | 197 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/index.html` | 66 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/library.html` | 116 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/onboard.html` | 150 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/pass.html` | 139 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/styles.css` | 261 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/public/verify.html` | 160 | M | [ ] | [ ] | n/a | [ ] | n/a | [ ] | [ ] | [ ] | n/a | static storefront UI; renders lifeboat API data |
| `apps/lifeboat/server.js` | 1319 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | entry; 32 API routes + static storefront; HTTP/file/money/auth |
| `apps/lifeboat/test.sh` | 758 | H | [ ] | [ ] | n/a | [ ] | [ ] | n/a | n/a | n/a | n/a | e2e harness: 128 assertions over auth/purchase/stream/claims (reported) |
| `apps/lifeboat/tools/verify-receipt.js` | 111 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | offline receipt verify CLI |
| `autonomous-build/.last-review` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | build-process notes |
| `autonomous-build/CLAUDE_REVIEW.md.archived` | 92 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | build-process notes |
| `autonomous-build/GROK_BOOTSTRAP.md` | 215 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | build-process notes |
| `autonomous-build/LIVE_STATUS.md` | 227 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | build-process notes |
| `autonomous-build/autonomous-build.sh` | 347 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | build automation script |
| `autonomous-build/grok-build.sh` | 289 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | build automation script |
| `autonomous-build/show-grok-changes.sh` | 75 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | build automation script |
| `autonomous-build/task-queue.json` | 178 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | build-process notes |
| `autonomous-build/watch-progress.sh` | 124 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | build automation script |
| `autonomy.md` | 37 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `cli/status.tsx` | 558 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | n/a | >500 lines; blessed TUI; spawns shell commands (execSync) |
| `cloudflare-worker/access-control.js` | 142 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | NFT-gated signed-URL worker; Privy JWT; SIMULATION MODE default; STR/W3B |
| `decentralflix-agents/decentralflix-agents-fix-plan.md` | 77 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | agent docs; not app code |
| `decentralflix-agents/personas/copy-ux-lead.toml` | 25 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | persona; not app code |
| `decentralflix-agents/personas/frontend-senior.toml` | 25 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | persona; not app code |
| `decentralflix-agents/personas/lead-architect.toml` | 26 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | persona; not app code |
| `decentralflix-agents/personas/process-autonomy-enforcer.toml` | 26 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | persona; not app code |
| `decentralflix-agents/personas/recovery-cleanup-lead.toml` | 26 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | persona; not app code |
| `decentralflix-agents/personas/senior-director.toml` | 54 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | persona; not app code |
| `decentralflix-agents/personas/smart-contract-senior.toml` | 25 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | persona; not app code |
| `decentralflix-agents/personas/verification-qa-gate.toml` | 26 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | persona; not app code |
| `decentralflix-agents/references/core-rules.md` | 36 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | agent docs; not app code |
| `decentralflix-agents/skills/decentralflix-copy-ux-lead/SKILL.md` | 39 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | skill; not app code |
| `decentralflix-agents/skills/decentralflix-frontend-senior/SKILL.md` | 39 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | skill; not app code |
| `decentralflix-agents/skills/decentralflix-lead-architect/SKILL.md` | 37 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | skill; not app code |
| `decentralflix-agents/skills/decentralflix-process-autonomy-enforcer/SKILL.md` | 39 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | skill; not app code |
| `decentralflix-agents/skills/decentralflix-recovery-cleanup-lead/SKILL.md` | 39 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | skill; not app code |
| `decentralflix-agents/skills/decentralflix-senior-director/SKILL.md` | 67 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | skill; not app code |
| `decentralflix-agents/skills/decentralflix-smart-contract-senior/SKILL.md` | 39 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | skill; not app code |
| `decentralflix-agents/skills/decentralflix-verification-qa-gate/SKILL.md` | 39 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | skill; not app code |
| `docs/PHASE2_AUDIT.md` | 174 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/REPUTATION_LIMITATIONS.md` | 98 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/WHITEPAPER.md` | 213 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/legal/Privacy.md` | 4 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/legal/RESEARCH_AND_INTEGRATION.md` | 45 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/legal/ToS.md` | 38 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/legal/lifeboat/README.md` | 25 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/legal/lifeboat/buy-label-rule.md` | 59 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/legal/lifeboat/csam-reporting.md` | 50 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/legal/lifeboat/dmca-agent-checklist.md` | 46 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/legal/lifeboat/takedown-sop.md` | 114 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `docs/legal/lifeboat/trademark-clearance-prep.md` | 54 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `eslint.config.mjs` | 18 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `live-build-status.log` | 545 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | build log, not source |
| `marker.md` | 381 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `package-lock.json` | 6641 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | generated lockfile; dependency audit is BLD's |
| `package.json` | 14 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `packages/contracts/contracts/DFLIX.sol` | 307 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/FilmmakerCampaign.sol` | 377 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/MovieTicket.sol` | 435 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/PayPerView.sol` | 188 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/ProofRegistry.sol` | 229 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/Reviews.sol` | 139 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/SeederCredits.sol` | 162 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/SeederReputation.sol` | 141 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/SubscriptionManager.sol` | 186 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/TicketNFT.sol` | 241 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain |
| `packages/contracts/contracts/mocks/MockTicketGate.sol` | 37 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | W3B domain; test mock |
| `packages/contracts/deployments/dry-run-local.json` | 43 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | fixture: dry-run deployment record |
| `packages/contracts/hardhat.config.ts` | 39 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | solc 0.8.28; reads PRIVATE_KEY/DEPLOYER_PRIVATE_KEY env |
| `packages/contracts/package.json` | 38 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | manifest |
| `packages/contracts/scripts/deploy-testnet.js` | 112 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | deploy/export-abi scripts; NO broadcast in this run |
| `packages/contracts/scripts/deploy.ts` | 110 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | deploy/export-abi scripts; NO broadcast in this run |
| `packages/contracts/scripts/export-abi.ts` | 62 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | deploy/export-abi scripts; NO broadcast in this run |
| `packages/contracts/test/DFLIX.test.ts` | 410 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/test/FilmmakerCampaign.test.ts` | 467 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/test/MovieTicket.test.ts` | 443 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/test/PayPerView.test.ts` | 222 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/test/ProofRegistry.test.ts` | 254 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/test/Reviews.test.ts` | 223 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/test/SeederCredits.test.ts` | 278 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/test/SeederReputation.test.ts` | 147 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/test/SubscriptionManager.test.ts` | 269 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/test/TicketNFT.test.ts` | 299 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | Hardhat tests for money contracts (217 passing reported) |
| `packages/contracts/tsconfig.json` | 15 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config |
| `packages/storage/LIMITATIONS.md` | 87 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `packages/storage/PINNING.md` | 72 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | docs |
| `packages/storage/package.json` | 18 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | manifest |
| `packages/storage/src/arweave.js` | 205 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | Arweave client |
| `packages/storage/src/encrypt.js` | 123 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | AES-256-GCM fragment crypto (crown jewel 1) |
| `packages/storage/src/errors.js` | 46 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | error classes |
| `packages/storage/src/fragment.js` | 70 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | 1 MiB fragmentation |
| `packages/storage/src/hash.js` | 103 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | manifest hashing |
| `packages/storage/src/index.js` | 46 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | public API |
| `packages/storage/src/ipfs.js` | 136 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | IPFS client |
| `packages/storage/src/merkle.js` | 164 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | SHA-256 Merkle proofs |
| `packages/storage/src/store.js` | 262 | H | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | storeFilm/retrieveFilm orchestration |
| `packages/storage/test/arweave.test.js` | 122 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | storage tests (93 passing reported) |
| `packages/storage/test/encrypt.test.js` | 99 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | storage tests (93 passing reported) |
| `packages/storage/test/fragment.test.js` | 88 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | storage tests (93 passing reported) |
| `packages/storage/test/hash.test.js` | 97 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | storage tests (93 passing reported) |
| `packages/storage/test/helpers/mock-servers.js` | 223 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | storage tests (93 passing reported); mock-servers |
| `packages/storage/test/index.test.js` | 40 | M | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | storage tests (93 passing reported) |
| `packages/storage/test/ipfs.test.js` | 109 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | storage tests (93 passing reported) |
| `packages/storage/test/merkle.test.js` | 131 | M | [ ] | n/a | n/a | n/a | [ ] | n/a | n/a | n/a | n/a | storage tests (93 passing reported) |
| `packages/storage/test/store.test.js` | 214 | H | [ ] | [ ] | n/a | n/a | [ ] | n/a | [ ] | [ ] | n/a | storage tests (93 passing reported) |
| `pnpm-lock.yaml` | 15390 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | generated lockfile; dependency audit is BLD's |
| `pnpm-workspace.yaml` | 12 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `postcss.config.mjs` | 7 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config |
| `public/file.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `public/globe.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `public/next.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `public/vercel.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `public/window.svg` | 1 | L | [ ] | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | static asset |
| `scripts/run.sh` | 43 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | run/stop orchestration (:3000 + :8080) |
| `scripts/stop.sh` | 23 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | run/stop orchestration (:3000 + :8080) |
| `tsconfig.json` | 41 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |
| `turbo.json` | 15 | M | [ ] | [ ] | n/a | [ ] | n/a | n/a | n/a | n/a | n/a | config/manifest |

## Excluded
| Path | Reason |
|---|---|
| node_modules/** | dependencies (6,172 files under packages/contracts/node_modules TRACKED — MAP-001) |
| .next/** | build output |
| packages/contracts/artifacts/** | build output (90 files tracked — MAP-002) |
| packages/contracts/cache/** | build output (1 file tracked — MAP-002) |
| packages/contracts/typechain-types/** | generated (108 files tracked — MAP-002) |
| devteam/** | out of scope per Playbook B1 (review workspace) |
| apps/lifeboat/data/** | gitignored runtime state (not tracked): JSON collections, masters/*.mp4, receipt-key.pem |
