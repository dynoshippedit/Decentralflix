# Decentralflix Implementation Roadmap & Gaps Tracker

**Purpose**: This is the single source of truth for what needs to be built, in what order, and why. It captures the full vision, current gaps, and step-by-step execution plan so the project remains deployable and scalable without a large team making corrections later.

**Core Vision Reminder**:
- Censorship-resistant, NFT-gated cinematic platform.
- Creators truly own their work and keep the majority of revenue.
- Old-school movie theater culture + early Netflix social features (ratings & comments from **verified ticket holders**).
- Strong platform moderation for illegal content.
- Designed to scale beyond Netflix (requires smart data archival strategy).

**Important Distinction on Social Features** (per user clarification):
- **Public Critiques / Ratings & Comments**: Viewers who own a ticket can leave public reviews/ratings that *anyone* can see. This is the "see the critique the viewers have" part.
- **Creator-to-Creator Communication**: Separate from public reviews. This is a permissioned thread system where the film creator can selectively allow other creators they personally choose to communicate with them about the film. This is **not** open to all owners — it is curated by the rights holder.

---

## Current Phase: Phase 0 – Foundation (Still Active) — Maximum Autonomy Mode

**Goal**: Build a solid, scalable, vision-aligned foundation so we can move into Phase 1 with confidence.

**Autonomy Rules**: Working per `autonomy.md` + updated `RULES.md`. Aggressive forward momentum. Only stop for true technical blockers or smart contract security/access control decisions.

**Current Priority Order (Maximum Autonomy Mode)**:

**#1 Priority — Reviews as Core Feature** (Highest focus until it reaches a genuine 9–10 level experience in Phase 0)

The public critiques layer must feel like a real, valuable, first-class social feature — not a technical demo.

Focus areas (in strict order):
1. Make reviews properly discoverable — show average ratings and recent reviews on FilmCards, Collection page, landing, and other natural surfaces.
2. Create clear ownership-connected flows (e.g. “See reviews for films I own”, “Write a review for films in My Collection”).
3. Improve the overall Reviews experience (better visibility, clearer UX, stronger “I own this” emotional connection).
4. Keep the two-layer model in mind (public critiques vs curated creator communication) — focus on making the public layer actually usable first.

All other workstreams are now secondary.

**Current Status (post this session)**: 
- Strict ownership gating now enforced in both contract and UI: only ticket owners can review (random users cannot).
- Single review per user per film with full edit support (you can change your mind later).
- Film detail page and Collection now make the "I own this → review this" connection clear and obvious.
- FilmCard with ratings on landing (discoverability)
- Collection now functions as a strong ownership + reviews hub
- New `/film/[hash]` page created as the natural per-film experience where reviews live as a first-class feature
- Reviews component upgraded with recent reviews preview and stronger ownership messaging

The public critiques layer is now visibly core in the product experience. Still working toward richer data surfaces and emotional "I own this" depth.

### High-Priority Items Still in Phase 0 (Must complete before proposing Phase 1)

#### 1. Platform Fee + Creator Share Transparency in Mint UI
- Show users exactly how much the creator receives vs platform fee at the moment of purchase.
- Must reflect the current `platformFeeBps` from the contract.
- Status: In progress (need to wire view calls + nice display)

#### 2. Creator Loop Improvements (Upload → Mint → Earnings Visibility)
- Seamless flow from Arweave upload to mint form (prefill hash).
- Basic visibility for creators on what they have earned from their films.
- Status: Partially done (upload → mint link exists). Needs earnings view.

#### 3. Basic "My Collection" Page (`/collection`)
- Show the connected user the tickets they own.
- Display basic metadata + link to reviews for that film.
- Must be performant and not bloat the main app (use good data fetching strategy).

#### 4. Decentralized Reviews UI (NFT-Gated Public Critiques) — **Core Feature, Major Progress**
- Reviews.sol + on-chain gating ✅
- FilmCard component showing average rating + review count on landing ✅
- Collection page now connects ownership to reviews ("See reviews for films I own", "Write a review") ✅
- Dedicated /reviews experience + average ratings visible ✅
- Two-layer model clearly documented and surfaced in UI ✅
- Remaining for strong Phase 0: Richer public discovery feed, dedicated film pages, and starting the private/curated creator communication layer.

#### 5. Structural & Scalability Improvements
- Add `ReentrancyGuard` on payment logic. ✅ (done in MovieTicket.sol)
- Create clean service/hook layer for contract interactions. ✅ (useMovieTicket, useReviews, barrel exports)
- Archival strategy: Heavy user data (reviews, long comments, creator threads) on Arweave; on-chain only for ownership, gating, payments, small pointers. Frontend stays lightweight for Netflix-scale growth. ✅ Documented.
- Better folder organization and shared utilities. ✅ (lib/contracts structure)

**Full Review Summary (from latest pass):** All 5 priority items reviewed in order. Status and gaps documented in marker.md. Frontend types fixed during review. No major bugs. System clarified for two-layer social and scalability.

---

## Architectural Principles (Must Respect)

- **Storage vs Delivery Separation** (per STORAGE_STREAMING_ARCHITECTURE_DECISION.md ADR-001, 2026-05-29): Arweave **demoted** to metadata/proofs/permanent archival ONLY. Primary storage = Filecoin/IPFS (Onchain Cloud, CIDs, Saturn/Beam); transcoding = Livepeer; P2P delivery/seeding = Theta. P2P credits first-class. Event-driven + indexer-first for ownership/gating/reviews (no linear scans). Full details, diagrams, comparisons, migration, and spikes in the ADR at repo root. Supersedes prior guidance for clean rewrite.
- **Ownership is on-chain**, heavy social data should live on Arweave or a decentralized indexer (not bloating the main Next.js app).
- **Creator Economics First**: Creators get paid quickly and transparently. Platform fee must be adjustable but capped.
- **Verified Ownership Gating**: Only real ticket holders can write reviews/comments in the public critique layer.
- **Curated Creator Communication**: Separate from public reviews. Film owners control who can message them privately about their work.
- **Scalability from Day One (125M+ Users Target)**: Do not design a system that will require a full rewrite or massive staff for corrections at Netflix/YouTube/TikTok scale. 

**Research-Backed Patterns from High-Traffic Sites** (applied to our decentralized model) — **Superseded by ADR-001 (STORAGE_STREAMING_ARCHITECTURE_DECISION.md, 2026-05-29)**:
- See the canonical hybrid architecture in ADR-001 §3-4: Filecoin/IPFS (primary storage + Saturn/Beam), Livepeer (transcoding/orchestration), Theta (P2P delivery/seeding), Arweave strictly for metadata/proofs only. The patterns below pre-date the clean rewrite and are retained only for historical reference. All future work must follow the hybrid + indexer-first model in the ADR.

**Traffic Categorization & Archival Strategy for Continuity/Growth** — **Superseded by ADR-001 (STORAGE_STREAMING_ARCHITECTURE_DECISION.md, 2026-05-29)**:
- See the canonical hybrid in ADR-001 §4: Filecoin/IPFS primary for video (with Saturn/Beam + Livepeer + Theta P2P). Arweave only for manifests, review bundles, seeder reports, ownership snapshots, rich metadata. Indexer (The Graph/custom) is the hot-path source of truth for ownership/gating/reviews (no linear scans). The paragraphs below are retained for historical reference only. All implementation must follow the ADR hybrid model and event-driven/indexer-first principles.

**Archival & Data Strategy** (Structural Cleanup item) — **Superseded by ADR-001**:
- See ADR-001 §4 for the canonical split: Filecoin/IPFS for primary video storage + delivery layers (Livepeer + Theta), Arweave strictly for metadata/proofs/manifests/reports. Indexer is production source of truth for queries. On-chain remains minimal (ownership, payments, events). The text below is historical only.

---

## Open Gaps & Future Stages (Captured for Later Phases)

### Phase 1 – Core Product Experience
- Real token-gated video playback (Livepeer + Arweave)
- Full "My Library" with progress, torn tickets, etc.
- Creator dashboard (earnings, film management, review moderation)
- Actual Reviews UI + public critique feed per film

### Phase 2 – Social & Retention
- Full decentralized reviews + ratings system (with the two-layer model)
- Curated creator communication threads (permissioned by film owner)
- Average rating display on film cards
- "Verified Owner" badges

### Phase 3+ – Scale & Advanced Features
- Proper archival + indexing layer (The Graph or custom + Arweave manifests)
- Advanced creator tools (tiered pricing, bundles, etc.)
- Platform moderation tools
- Crowdfunding / Backlot features

---

## How to Use This Document

- Update status on items as they are completed.
- Add new gaps as they are discovered.
- Before moving to a new phase, ensure all Phase 0 items are either done or explicitly deferred with reasoning.

**Reference Files**:
- `marker.md` — My personal working scratchpad and in-progress notes (updated frequently during active work).
- `TODO.md` — High-level living task list.
- `DEPLOYMENT_CHECKLIST.md`, `SEPOLIA_DEPLOY.md`, `LOCAL_TESTING.md` — Specific operational guides.

---

**Last Major Update**: Current session — Captured full vision alignment, two-layer social model (public critiques vs curated creator communication), and Phase 0 completion criteria.
