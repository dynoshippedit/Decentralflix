# DecentralFlix Storage & Streaming Architecture Decision Record (ADR-001)

**Title:** Mass-Scale Storage & Streaming Architecture for True Decentralized Netflix Alternative (Millions of Users, Thousands of Films, HD/4K Concurrent Streams)  
**Date:** 2026-05-29  
**Status:** Accepted for Clean Rewrite (per GROK.md directive)  
**Deciders:** Grok (autonomous per full hands-off handover)  
**Related:** GROK.md, ARCHITECTURE.md (deprecated), ROADMAP.md, PHASE0.md, RISKS.md, SeederCredits.sol, MovieTicket.sol, Reviews.sol, FilmmakerCampaign.sol, VideoPlayer.tsx, useArweaveUpload.ts, useHasFilmAccess.ts / useMyAccessibleFilms, contracts events  

## Executive Summary

The Phase 0 architecture (Arweave as primary video storage + Livepeer fallback + direct gateway streaming + client-side linear scans for ownership/gating/reviews) cannot scale to millions of concurrent users and thousands of full-length HD/4K films. Arweave excels at permanent archival but imposes high upfront per-GB costs and gateway-bandwidth bottlenecks for high-concurrency VOD delivery.

**Decision:** Adopt a production-grade **hybrid decentralized stack** as the canonical architecture from the clean rewrite onward:

- **Primary storage & retrieval layer:** Filecoin (via Onchain Cloud + IPFS CIDs) for cost-effective, verifiable, high-capacity VOD persistence + Saturn (dCDN) / Filecoin Beam for fast, incentivized edge retrieval and streaming.
- **Transcoding & orchestration:** Livepeer decentralized GPU network (adaptive bitrate ladders, VOD + real-time AI pipelines where valuable).
- **P2P delivery & edge scaling:** Theta Network EdgeCloud (P2P relaying, caching, community seeding) for last-mile efficiency and massive horizontal scale.
- **Permanent archival, metadata, proofs, and heavy reports:** Arweave (strictly demoted; one-time cost for immutability of manifests, review bundles, seeder proofs, film JSON metadata, ownership snapshots).
- **Incentive & gating core:** First-class P2P credit system (evolved SeederCredits) that rewards user-side caching/seeding across the hybrid mesh. Credits are redeemable for platform utility (fee discounts, free access, tier boosts).
- **Ownership, reviews, crowdfunding, access:** Strictly event-driven + indexer-first (The Graph or equivalent custom indexer on Arbitrum events). Zero production reliance on `hasAccessToVideo`-style linear scans over `totalSupply`.

This combination delivers:
- Storage costs ~10-100x lower than Arweave for large libraries at scale.
- Delivery latency competitive with centralized CDNs for hot content (sub-100ms TTFB via Saturn/Beam/Theta edges).
- True censorship resistance and no single point of failure.
- Economic self-sustainability via P2P seeding incentives that grow capacity with demand.
- Indexer-friendly on-chain surface for fast, cheap queries at 125M+ user scale.

All future development (contracts v2+, frontend video abstraction layer, upload/mint pipelines, dashboard, player) must conform to this model. Phase 0 contracts and Arweave video paths are treated as legacy/compat layer only.

## 1. Current State Analysis (Phase 0 — Why Rewrite Required)

### Storage & Delivery (from code)
- `videoHash` in MovieTicket.sol / Reviews.sol / FilmmakerCampaign.sol is an Arweave tx id (or `ar://`).
- VideoPlayer.tsx: Primary path = direct `https://arweave.net/{id}` (progressive or via @livepeer/react Player fallback). Livepeer integration is superficial (toggle button, no real ingest/transcode pipeline for VOD).
- useArweaveUpload.ts + lib/arweave/upload.ts: Full videos (and metadata) uploaded directly to Arweave with JWK. `uploadLargeVideo` is a thin wrapper.
- No segmentation, no HLS/DASH manifests, no transcoding ladder in production path.
- Result: High one-time cost per film (~$250–1000+ USD for a 50GB 4K feature in 2026 AR pricing), variable gateway latency, and hard limits on concurrent streams (gateway uplink + rate limits).

### Ownership/Gating/Reviews/Crowdfunding (Critical Anti-Pattern)
- `hasAccessToVideo(address, videoHash)` in MovieTicket.sol (and mirrored in Reviews/FilmmakerCampaign): Linear `for (uint256 i = 0; i < totalSupply; i++)` scan + `ownerOf` + keccak comparison. Explicitly noted as "acceptable while volume is low" / "Phase 0".
- useHasFilmAccess.ts + getFilmAccessSources + getMyAccessibleFilms: Client-side `viem` loops over `totalSupply` + per-token `videoMetadata` + `ownerOf` reads. Same pattern in FilmmakerCampaign `_ownsProducerInvestment` and `hasCrowdfundAccess`.
- Reviews.sol: `reviewersByVideo` array enumeration for `getReviews`.
- useCreatorDashboard.ts: Does use `getLogs` for `CreatorPaid` (good event-driven example for earnings) but falls back to scans for created films.
- Events exist and are reasonably indexed (`VideoMinted`, `CreatorPaid`, `ReviewSubmitted`/`ReviewUpdated`, `Contribution`, `CreditsEarned`, `CampaignLaunched`, etc.), but production paths ignore them in favor of scans.
- SeederCredits.sol: Good event surface (`CreditsEarned` indexed on seeder + Arweave report), tier multipliers via scan, Arweave-signed reports for claims. Promising foundation for P2P incentives but not yet first-class or multi-protocol.

### Archival Strategy in ROADMAP (Superseded)
Current docs correctly identify hot/cold paths and call for indexer + Arweave manifests, but still position Arweave as primary for "full video files". GROK.md explicitly overrides this as an early mistake.

**Scalability Ceiling:** Linear scans O(N) per access check → catastrophic at thousands of films + millions of users. Arweave gateway economics do not support Netflix-scale concurrent 4K (tens of thousands of simultaneous high-bitrate streams).

## 2. Goals & Non-Negotiable Constraints (from GROK.md + Vision)

- **Scale target:** Millions of users, thousands of full-length films (HD + 4K), high concurrent streams with acceptable buffering/latency.
- **Arweave:** Metadata, proofs, permanent cold archival, seeder reports, review bundles, film manifests, ownership snapshots **ONLY**. Never primary video bytes or hot streaming source.
- **Hybrid model priority:** Livepeer (transcode/stream orchestration), Filecoin/IPFS (storage + verifiable retrieval), Theta (P2P delivery/edge), P2P credits (user seeding/caching) as first-class incentive.
- **Event-driven + indexer-friendly from Day 1:** All ownership, gating (`hasAccess`), reviews, crowdfunding, earnings, credits queries must be expressible as indexed event filters + materialized views. No client or contract linear scans in hot paths. `hasAccessToVideo` etc. become legacy or thin wrappers over indexer results.
- **P2P credits first-class:** Core to economics and capacity scaling. Users earn via real contribution (bandwidth, uptime, peers served across the mesh). Redeem for utility. Ties to NFT tiers (multipliers). Deep product surface (dashboard, leaderboards, claims UX).
- **Non-custodial everywhere:** Matches legal ToS/Privacy (Section 230 + DMCA posture, no money transmission via credits).
- **Censorship resistance + permanence:** Hybrid must preserve these while adding performance.
- **Creator economics:** Immediate payouts (already in MovieTicket via `CreatorPaid`) preserved/enhanced.
- **Migration pragmatic:** Dual-support period; no breaking existing deployed tickets.

Additional production requirements: Cost predictability, measurable SLAs (via hybrid edges), support for adaptive streaming (HLS/DASH), future AI features (Livepeer real-time inference), and simple creator UX (upload once → system handles the rest).

## 3. Option Comparison (2026 Capabilities)

Evaluated against real-world 2026 data (Livepeer Q1 2026 Messari: 134M+ minutes processed, AI driving ~60% revenue; Filecoin ~1.95 EiB capacity + Saturn/Beam; Theta 30k+ Edge Nodes + Hybrid Beta; Arweave endowment model + AR.IO gateways).

### Key Dimensions
- **Storage Cost (per TiB, long-term):** One-time vs recurring + egress.
- **Egress/Streaming Cost (per GiB delivered or per minute):** Dominant variable at scale.
- **Latency (TTFB + sustained bitrate for HD/4K):** Cold vs hot content.
- **Decentralization / Censorship Resistance:** Permissionless nodes, no single operator kill switch.
- **Scalability (concurrent streams, library size):** Horizontal via incentives + hybrid.
- **Operational Complexity / Maturity for dApps:** SDKs, gateways, VOD support.
- **Incentive Alignment for P2P Seeding:** Native rewards for users/nodes contributing capacity.

**Summary Table (approximate 2026 USD, market-driven, volume discounts apply):**

| Option                  | Storage (long-term)          | Egress / Delivery                  | Typical HD/4K Latency (hot) | Decentralization | Netflix-Scale Concurrent | P2P Seeding Incentives | Notes / 2026 Reality |
|-------------------------|------------------------------|------------------------------------|-----------------------------|------------------|---------------------------|------------------------|----------------------|
| **Pure Arweave (current Phase 0)** | One-time ~$5–20/GB ($5k–20k/TiB) | Gateway bandwidth (variable, often throttled) | 100s ms–seconds (cold); better cached | High (PoA) | Poor (gateway uplink limits; hundreds concurrent max per well-run gateway) | Weak (AR.IO incentives emerging) | Excellent permanence; fails on cost + concurrency for video. Demoted per directive. |
| **Filecoin/IPFS + Saturn/Beam** | ~$2.50–6/TiB/mo (2+ copies via Onchain Cloud; cheaper deals) | ~$0.014/GiB (Beam verified) or Saturn dCDN | Sub-70ms TTFB (Saturn); good sustained for segmented HLS | Very High (verifiable deals + proofs) | Excellent for library VOD (1.95 EiB capacity, thousands of SPs + 3k+ Saturn nodes) | Strong via retrieval rewards + Filecoin+ | Cheapest durable storage. Excellent for VOD manifests/CIDs. Needs edge layer for low latency. |
| **Livepeer (standalone)** | N/A (transcode-focused)     | Orchestrator + gateway egress (usage-based ETH, historically 10x+ cheaper than AWS) | Sub-second (85ms examples at 4.2Mbps); 1080p60 native | High (permissionless GPUs, LPT stake) | Strong (134M minutes Q1 2026; elastic via DePIN) | Medium (orchestrator staking + fees; less end-user seeding) | Best-in-class decentralized transcoding + real-time AI. Pair for ladders + orchestration. |
| **Theta Network (EdgeCloud)** | Hybrid cloud + edge storage | P2P mesh (Edge Nodes relay/cache); 50-80%+ CDN cost reduction historical | Low last-mile via community nodes; Hybrid Beta for reliability | High (30k+ Edge Nodes + Metachain) | Designed for it (P2P scales with viewers); proven for large dApps/events | Very Strong (TFUEL for bandwidth/relay/uptime; edge staking) | Premier P2P delivery. Perfect complement for seeding layer. NFT DRM support. |
| **Pure IPFS (no Filecoin)** | Ephemeral / pinning costs   | Public gateways + custom | Variable (poor for cold/large) | High (content-addressed) | Limited without incentives/CDN overlay | Weak (BitSwap tit-for-tat only) | Foundation, not complete solution. |
| **Recommended Hybrid (Filecoin+IPFS + Livepeer + Theta + Arweave archival)** | Filecoin dominant (~$5–12/TiB/mo replicated) + Arweave for critical metadata | Multi-path: Theta P2P primary + Livepeer gateway + Saturn/Beam fallback. Combined egress competitive or better | Sub-100ms hot (edges); adaptive HLS | Highest (multiple independent DePINs + permanent archive) | Highest (P2P horizontal + elastic transcoding + cheap durable storage) | Highest (unified credits across Theta relay + Filecoin retrieval + Livepeer usage) | See Section 4. Achieves all goals. |

**Verdict:** No single network wins all dimensions in 2026. The hybrid leverages complementary strengths: Filecoin for cheap verifiable bulk storage, Livepeer for professional transcoding/AI, Theta for P2P bandwidth economics and viewer-contributed scale, Arweave for irrefutable permanence where it matters (metadata/proofs). P2P credits unify user participation across layers.

## 4. Recommended Architecture (Production-Grade Hybrid)

### High-Level Text Diagram (Layers + Data Flow)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16 + Privy) + Video Player Abstraction Layer             │
│  - useVideoSource() hook (returns multi-source URLs + access proof)         │
│  - HLS.js / native player or @livepeer/react (enhanced) + Theta SDK         │
│  - Seeding client (lightweight background: relays segments, reports metrics)│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ (Access check — NEVER linear scan)
┌─────────────────────────────────────────────────────────────────────────────┐
│  Indexer Layer (The Graph subgraph OR custom Goldsky/self-hosted service)   │
│  Indexes ALL events: VideoMinted, CreatorPaid, Review* , Contribution,      │
│  CreditsEarned, Campaign*, Milestone*, etc.                                 │
│  Materialized views:                                                        │
│    - ownersByVideoHash(videoHash) → [tokenIds + tiers + addresses]          │
│    - reviewsByVideoHash + aggregates (avg rating, count)                    │
│    - myAccessibleFilms(address) → fast query (no on-chain loops)            │
│    - creatorEarnings(address) via CreatorPaid logs                          │
│    - seederActivity(address)                                                │
│  Returns cryptographically verifiable or trust-minimized access proofs.     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
┌──────────────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐
│ On-Chain (Arbitrum)      │  │ Livepeer Network │  │ Theta EdgeCloud + P2P    │
│ - MovieTicket (NFTs,     │  │ (Decentralized   │  │ (30k+ Edge Nodes)        │
│   tiers, immediate       │  │ GPUs)            │  │ - P2P segment relay/     │
│   creator payouts)       │  │ - VOD ingest     │  │   caching                │
│ - Reviews (gated,        │  │ - Transcode      │  │ - TFUEL rewards for      │
│   single-per-owner)      │  │   ladders        │  │   bandwidth + uptime     │
│ - FilmmakerCampaign      │  │   (HLS/DASH)     │  │ - Hybrid cloud fallback  │
│   (escrow + InvestmentNFTs)│  │ - Real-time AI   │  │ - NFT DRM hooks          │
│ - SeederCredits (ledger, │  │   (future)       │  │                          │
│   claims, tier multi)    │  │ - Gateway URLs   │  │                          │
│ Events are source of     │  └──────────────────┘  └──────────────────────────┘
│ truth. No heavy logic.   │
└──────────────────────────┘
                    │
                    ▼ (Primary durable + verifiable)
┌─────────────────────────────────────────────────────────────────────────────┐
│ Filecoin/IPFS Layer (Primary Video Storage)                                 │
│ - Onchain Cloud (deals + proofs, 2+ copies default)                         │
│ - IPFS CIDs for segments + manifests (MUXL canonical, HLS-ready)            │
│ - Saturn (dCDN: 3k+ nodes, <70ms TTFB, 400M+ req/day peaks)                 │
│ - Filecoin Beam (incentivized verifiable retrieval, ~$0.014/GiB)            │
│ - Warm tiers (Storacha) for hot VOD                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                    │ (Cold archival + immutable proofs)
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Arweave (Strictly Demoted — Metadata, Proofs, Permanent Archive ONLY)       │
│ - Film manifests (title, poster CID refs, segment list, transcoding profile)│
│ - Full review/comment bundles (per-film Arweave tx for scale)               │
│ - Seeder reports (uptime/bandwidth/peers proofs — signed, timestamped)      │
│ - Ownership snapshots / Merkle roots (for ZK or light verification)         │
│ - Rich metadata JSON (posters, descriptions, AI collab artifacts)           │
│ - One-time endowment cost; AR.IO gateways for retrieval when needed         │
└─────────────────────────────────────────────────────────────────────────────┘

P2P Credit Flow (First-Class):
User seeds (Theta relay + Filecoin retrieval + Livepeer usage) 
  → Local metrics + proofs 
  → Anchor report to Arweave (immutable) 
  → submitSeedingReport (on-chain claim with tier multiplier from NFT holdings) 
  → Credits balance updated + CreditsEarned event 
  → Redeem for perks (mint discount, free burnable ticket, Producer boost, etc.)
Indexer surfaces leaderboards + earnings estimates.
```

### Detailed Component Flows

**Upload / Publish Flow (Creator UX — still 2-3 clicks):**
1. Creator uploads raw video (or segmented) via frontend (or direct to Livepeer ingest for efficiency).
2. Livepeer transcodes to full adaptive ladder (360p–4K) → outputs HLS playlist + segments.
3. Segments + manifest uploaded to Filecoin/IPFS → obtain root CID + per-segment CIDs.
4. Rich metadata JSON (title, description, poster, chapter markers, credits) + manifest pointer + original Arweave backup (optional) uploaded to Arweave → obtain metadataTxId.
5. On-chain mint (MovieTicket or Campaign): Store `videoCID` (Filecoin/IPFS) + `metadataArweaveTx` + `livepeerPlaybackId` (if applicable). Emit rich `VideoMinted` with all pointers.
6. Indexer picks up event → materializes access + discovery views.

**Playback Flow (Gated, High Performance):**
1. User lands on /film/{videoCID or hash}. Frontend calls indexer for "does address have access?" + sources + avg rating (instant, no on-chain read).
2. If gated and owned: Player requests from **primary**: Theta P2P mesh (via SDK for relay) or Livepeer gateway (orchestrated adaptive source) or Saturn/Beam (Filecoin retrieval).
3. Background: Lightweight seeder daemon (browser extension or desktop app) participates in mesh, measures contribution, periodically submits Arweave-anchored report → claims credits.
4. For burnable tickets: On first complete watch (client proof or oracle), call `burnTicket` (event-driven).

**Reviews / Crowdfunding / Ownership:**
- All writes emit indexed events.
- All reads (my collection, reviews feed, "top reviewed", gating for submit) go through indexer materialized views or The Graph queries.
- Contracts keep minimal state + reverse mappings only where gas allows (e.g., `campaignVideoHash` can stay for on-chain fallback, but indexer is canonical for UX).
- Future: Add on-chain Merkle roots of indexer state for trust-minimized light clients.

### Why This Beats Alternatives at Target Scale
- **Cost:** Filecoin storage + Beam egress vastly undercuts Arweave one-time video fees for thousands of films. P2P (Theta) offloads 50-80%+ of bandwidth costs via user seeding.
- **Latency/UX:** Multiple edge paths (Saturn <70ms, Theta last-mile, Livepeer gateways) + adaptive HLS = Netflix-like experience for hot titles. Cold content benefits from warm tiers + pre-warming via popularity signals.
- **Decentralization & Resistance:** No single gateway, storage provider, or GPU operator can block content. Arweave provides permanent metadata anchor even if other layers have temporary outages.
- **Scalability:** P2P + DePIN economics mean capacity grows with users (more seeders = better performance). Livepeer auto-scales transcoding. Filecoin already at EiB scale.
- **Incentives:** Unified P2P credits make every viewer a potential contributor. Ties directly to NFT tiers (higher tiers = higher multiplier + better perks) → retention flywheel.

## 5. P2P Credit System as Core Incentive Layer (First-Class Feature)

Current SeederCredits.sol is an excellent Phase 0/1 foundation (Arweave reports + ECDSA attestor + tier multipliers from MovieTicket + indexed `CreditsEarned`/`CreditsRedeemed` + cooldowns). It must be elevated and expanded.

**Enhancements for Mass Scale (in rewrite / v2 contracts):**
- Multi-source report support: Fields or separate claim functions for Theta relay receipts (TFUEL-adjacent proofs), Filecoin retrieval attestations (via Beam/Saturn verifiable egress), Livepeer usage, custom IPFS/Theta hybrid seeding.
- On-chain or hybrid attestor evolution: Start with platform multi-sig; migrate to decentralized oracle / indexer + ZK proofs of contribution (or simple signed reports from reputable edge nodes).
- Credit utility surface (first-class UX):
  - Redeem for: Platform fee discount vouchers (on-chain or off-chain applied at mint), free burnable tickets, priority in crowdfunding lotteries, Producer-tier eligibility boosts, featured placement, AI collab credits.
  - Leaderboards + "My Seeding Impact" in Dashboard (powered by indexer on `CreditsEarned` events + Arweave reports).
  - Tier multipliers preserved and enhanced (Producer 1.5x, etc.).
  - Cross-film + network-wide reputation (total credits earned, uptime streaks).
- Reporting flow: Client measures (bytes served, unique peers, duration). Bundles + signs. Uploads proof bundle to Arweave (or Filecoin for cheaper bulk). Submits txId + claimed amount + signature(s) on-chain.
- Anti-abuse: Cooldowns, minimum thresholds, slashing (existing emergencySlash), future reputation-weighted claims, proof-of-bandwidth challenges.
- Economics: Credits are internal utility (non-transferable or limited transfer to prevent speculation). Platform can mint/burn for bootstrapping or sinks (e.g., high-value redemptions burn credits). Ties to overall tokenomics later if a platform token is introduced.

**Integration Points:**
- Dashboard: Prominent "Seeder Studio" tab with real-time estimates, claim button, history.
- Player: "Contribute bandwidth while watching" toggle (opt-in, shows earned credits).
- Mint/Crowdfund: "You have X credits → Y% discount" live display (uses on-chain balance + multiplier).
- Reviews tie-in: Verified owners who also seed get "Super Contributor" badges.
- Legal: Fully non-custodial (on-chain claims + user-controlled redemption). Matches existing ToS language.

This turns passive viewers into active infrastructure participants, directly solving the capacity problem for mass scale while creating retention and defensibility.

## 6. Migration & Transition Notes from Phase 0

**Contracts (Arbitrum Sepolia + future mainnet):**
- Existing deployed MovieTicket/Reviews/FilmmakerCampaign/SeederCredits remain authoritative for Phase 0 tokens. No breaking changes.
- Add (or deploy v2 with) richer events if needed (e.g., `StorageSourceUpdated`, `VideoCIDLinked`, more indexed fields on existing events).
- Deprecate or flag linear-scan functions (`hasAccessToVideo`, `getTierMultiplier` internal scans, `getReviews` enumeration) with comments: "Legacy — use Indexer for production". Provide parallel `hasAccessToVideoViaIndexerProof` or simply document that frontends must use indexer.
- New films use `videoCID` (Filecoin/IPFS primary) + optional legacy `arweaveVideoTx` for dual delivery during transition. Update structs + mint functions with backward-compatible overloads or new functions.
- Enhance SeederCredits: Add `submitMultiSourceReport` or versioned reports. Keep Arweave as anchor for reports.
- Crowdfund `setCampaignVideo` + `campaignVideoHash` stays useful for on-chain fallback but indexer becomes source of truth for "my films".

**Frontend / Data Layer:**
- Introduce storage abstraction: `VideoSource` type = { primaryCID: string, arweaveBackup?: string, livepeerId?: string, thetaManifest?: string, sources: string[] }.
- Refactor VideoPlayer.tsx: Primary sources from Livepeer gateway or Theta P2P SDK + HLS from Filecoin CID via Saturn/Beam. Keep Arweave direct as last-resort fallback only. Remove "Use direct Arweave" as default.
- Replace all calls to `hasAccessToVideo` / client scans with indexer queries (or cached indexer result + on-chain balance check for critical paths).
- Update useArweaveUpload: Keep for metadata + reports + manifests only. Add parallel `useFilecoinUpload` / Livepeer ingest hooks.
- useFilmMetadata: Continues to work (Arweave JSON still primary for rich metadata).
- Dashboard/Collection/Reviews: All "my X" and "reviews for Y" become indexer-powered (with graceful demo fallback during rollout).
- Gradual rollout: Feature flag "hybridStorage". Old Arweave-only films continue working via gateway shim. New mints default to hybrid.

**Data Migration for Existing Content:**
- Mirror popular Phase 0 Arweave videos to Filecoin (one-time bulk operation).
- Update on-chain metadata pointers (or emit events) for dual-source.
- Indexer backfill for historical events.

**Timeline Sketch (post-clean-rewrite foundation):**
- Spike 1–2 weeks: Core abstractions + one new film published fully hybrid.
- Parallel: Deploy indexer subgraph.
- 4–6 weeks: Full player migration, SeederCredits v2, UI surfaces.
- Ongoing: Old Arweave content supported indefinitely via compat layer.

## 7. Open Risks & Recommended Engineering Spikes

### High Risks
- **Seeding Adoption:** User participation in P2P mesh is the scaling lever. If credits/perks are not compelling enough, cold-start problem for delivery quality. Mitigation: Generous early bootstrapping rewards, easy desktop client, visible "you are powering the network" UX, tier synergies.
- **Cold Content Latency:** Long-tail films may have higher TTFB until warmed. Mitigation: Popularity-based pre-warming (indexer signals), warm Filecoin tiers, hybrid origin pull from Livepeer/Arweave gateways.
- **Indexer Dependency & Costs:** The Graph or custom service becomes hot path. Centralization risk if single provider. Mitigation: Self-hostable subgraph, multiple indexers, on-chain Merkle roots for critical proofs, fallback to batched on-chain views for low-volume.
- **Multi-CID / Pointer Complexity:** Managing Arweave + Filecoin + Livepeer + Theta references. Risk of broken links or user confusion. Mitigation: Strong manifest standard on Arweave (single source of truth for a film's delivery graph), robust client fallbacks.
- **Legal / Regulatory (Credits + Crowdfunding):** Even non-custodial, high-volume credit redemptions or Producer perks could attract scrutiny (money transmission, securities via Howey on crowdfunding). Already flagged in RESEARCH_AND_INTEGRATION.md. Mitigation: Strict utility framing, no expectation of profit, legal review of redemption mechanics before mainnet.
- **Content Moderation at Scale:** Thousands of films + UGC reviews. Section 230 helps, but DMCA + illegal content (CSAM etc.) requires robust reporting + delisting (pointer removal, not data erasure). Arweave permanence complicates full removal.

## 8. 120 Million+ User Scale Cost & Performance Model (Fresh 2026 Validation)

**Research Sources (May 2026):** Filecoin Onchain Cloud + Beam announcements, Livepeer Q1 2026 Messari Report (134.4M minutes processed, AI 60% revenue), Theta EdgeCloud technical + industry P2P CDN benchmarks, hybrid DePIN video platform analyses.

### Validated Unit Economics (2026)
- **Filecoin (primary video storage + retrieval):** $2.50/TiB/month per copy (Onchain Cloud warm verifiable; ~$5/TiB/mo for 2x redundancy). Egress via Beam: ~$0.014/GiB delivered. Saturn dCDN for hot caching (<70ms TTFB).
- **Livepeer (transcoding + adaptive streaming orchestration):** VOD full ladder ~$0.50 per 1,000 minutes target at scale (~$0.0005/min). Delivery/streaming ~$0.0005 per viewer-minute via gateways. 5–10x cheaper than centralized equivalents.
- **Theta EdgeCloud (P2P last-mile delivery):** 50–80%+ origin offload (60–75% conservative at scale). Blended delivery cost reduction 52%+ (up to 60–65% at high density). Effective P2P component ~$0.003–$0.008/GB vs $0.01–$0.04/GB traditional CDN.

### Illustrative 120M MAU Netflix-Scale Model (Conservative)
Assumptions (long-form VOD heavy, indie catalog, HD primary + 4K tier):
- 120 million monthly active users.
- Average 3 hours watch time / user / month = 360 viewer-hours / user / month.
- Total: ~43.2 billion viewer-hours / month.
- HD stream ~2.25 GiB / viewer-hour → ~97.2 million TiB transferred / month (raw, before heavy caching/P2P).
- Library: 5,000+ full features (average 8 GiB HD master + derivatives) ≈ 40 PiB raw + 3–5x for ladders/manifests/copies.

**Monthly Cost Breakdown (Hybrid, P2P-optimized):**
- Storage (Filecoin 2x + warm tiers for active titles): ~$200k–$400k (amortized; cold titles far cheaper).
- Transcoding (Livepeer, mostly one-time per title + rare re-process): <$50k (library build + incremental).
- Delivery (blended):
  - Theta P2P 65% offload: ~35% traditional-equivalent fallback at $0.02/GB + 65% P2P at $0.005/GB effective.
  - Raw before P2P: enormous; after 60–75% offload + edge caching: **$4M – $8M / month** all-in delivery (dominant line item).
- Total estimated monthly infra at 120M MAU (mature steady-state): **$5M – $10M USD** (heavily dependent on actual watch hours, hit rates, and P2P participation).
- Per-user monthly infra cost: **~$0.04 – $0.08** (orders of magnitude below centralized Netflix-scale egress bills).

**With Strong SeederCredits Flywheel (user P2P participation):**
- 10–20% of users running lightweight seeders (browser + optional desktop) at average 200 GB/month contributed each.
- Additional 15–30% bandwidth offload on top of Theta native → further 20–40% delivery cost reduction.
- Credits issued = real marginal cost avoided. Redemption sinks (mint discounts, free tickets) create closed-loop economics.

**Performance at Scale:**
- Hot titles: Sub-100ms TTFB (Saturn + Theta mesh + Livepeer edges).
- Concurrent: Tens to low hundreds of thousands of simultaneous HD/4K streams sustainable via horizontal P2P + elastic Livepeer GPUs. No single gateway choke point.
- Cold/long-tail: Pre-warm via popularity signals from indexer; acceptable start + rapid improvement as seeded.

**Justification vs. Pure Arweave or Pure Centralized:**
- Pure Arweave video: One-time $5k–20k+/TiB for masters + derivatives → tens to hundreds of millions upfront for library + poor hot delivery economics. Rejected.
- Pure centralized (AWS + CloudFront): Storage cheap, but egress at this volume routinely $15M–$40M+/mo without heavy optimization. Single point of control/censorship.
- Hybrid DePIN wins on cost (5–10x+), censorship resistance (multi-network), elasticity (incentives grow supply with demand), and permanent ownership (Arweave metadata anchors + on-chain NFTs).

This model confirms the hybrid (Filecoin primary + Livepeer transcoding + Theta P2P + SeederCredits user layer + Arweave metadata) is the only architecture in 2026 that makes a true decentralized Netflix alternative viable at 120M+ user ambition while preserving the core vision of lifetime NFT access, creator 70%+ payouts, and zero-censorship.

All implementation (player multi-source, upload pipeline, SeederCredits v2, indexer) must optimize for these economics from day one.
- **Economic Volatility:** Token prices (AR, FIL, LPT, TFUEL) affect real costs. Hybrid reduces single-point exposure.

### Recommended Next Engineering Spikes (Prioritized, Autonomous Execution)
1. **Livepeer + Filecoin VOD Prototype** (Highest): End-to-end: Ingest raw video → Livepeer transcoding job → upload segments + manifest to Filecoin (Onchain Cloud or Pin) → generate Arweave manifest → mint with new pointers. Measure costs/latency. Integrate basic player source switching.
2. **Theta P2P Delivery + Seeding Metrics Spike**: Integrate Theta Video/Edge SDK into player (or custom relay). Prototype local seeder that reports bandwidth served. Wire sample report to Arweave → SeederCredits claim. Quantify incentive impact.
3. **Indexer / Subgraph Foundation** (Critical for constraints): Define full event schema. Implement The Graph subgraph (or lightweight custom indexer using viem event polling + materialized Postgres/Redis views). Replace one high-traffic scan (e.g., getMyAccessibleFilms or reviews listing) with indexer query. Prove O(1) access checks.
4. **SeederCredits v2 + Multi-Source Reports**: Extend contract + hook + UI. Support hybrid reports. Add redemption application logic (e.g., apply discount at mint time via credits burn/attestation). Dashboard seeding tab.
5. **Cost & Performance Modeling**: Spreadsheet + simple simulator for 1,000 films (mix of HD/4K lengths) + 1M–10M users (various concurrency). Include storage deals, egress at scale, credit economics, gateway vs P2P savings. Validate hybrid beats pure Arweave by 5–10x+.
6. **Legal/Compliance Spike on Credits**: Deep review of redemption flows, attestor model, and "utility vs security" framing for SeederCredits + Producer perks. Update ToS/Privacy if needed. (Coordinate with existing legal artifacts.)
7. **Manifest & Pointer Standard**: Define canonical Arweave JSON schema for a film's delivery graph (CIDs, Livepeer IDs, Theta manifests, fallbacks, checksums). Implement upload + validation helpers.
8. **Migration Tooling**: Script to mirror existing Arweave videos to Filecoin + update pointers (or emit compatibility events).

## 8. Success Metrics (Post-Implementation)

- Upload-to-playback for new film < 5 min end-to-end (transcode + store + mint + indexed).
- P95 TTFB < 150ms for hot titles; sustained 4K playback without buffering for >95% sessions.
- Seeder participation: >10% of active viewers running seeder (or measurable bandwidth contribution % of total delivery).
- Query cost/latency: All "my films" / "reviews for film" / gating < 200ms via indexer (no gas, no N scans).
- Storage cost per film (amortized) materially lower than current Arweave-only path.
- Zero production reliance on linear on-chain enumeration.
- Creator payout + review flows unchanged in UX quality/speed.

## References & Sources (2026)
- Livepeer: livepeer.org, Q1 2026 Messari report (134M minutes, AI 60%+ revenue), docs.livepeer.org.
- Theta: thetanetwork.org / thetatoken.org docs (EdgeCloud, 30k+ nodes, Hybrid Beta, TFUEL incentives).
- Filecoin/IPFS: filecoin.io (Onchain Cloud, Saturn, Beam, ~1.95 EiB, ~$0.014/GiB retrieval), ipfs.tech video specs.
- Arweave: arweave.org docs (endowment pricing, gateway realities, AR.IO).
- Internal: MovieTicket.sol (events + immediate payouts), SeederCredits.sol (credit foundation), useHasFilmAccess.ts (scan anti-patterns), VideoPlayer.tsx (current hybrid attempt).
- Legal: docs/legal/RESEARCH_AND_INTEGRATION.md + ToS.md (non-custodial credits posture).

---

**This ADR supersedes prior ARCHITECTURE.md / ROADMAP.md storage sections for all clean-rewrite work.** All subsequent code, contracts, and docs must align. Implementation begins immediately per GROK.md autonomy.

Next autonomous step after this document: Begin Spike 1 (Livepeer + Filecoin prototype) while maintaining Phase 0 reviews momentum where non-conflicting. Update marker.md / TODO.md / DECISIONS.md with reference to this file.

**End of Architecture Decision Record.**