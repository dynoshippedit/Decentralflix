# DecentralFlix — Architecture Review v2 (Influencer Launch Edition)
**Reviewed:** 2026-05-29  
**Context:** Day-1 launch with major creator launches and deplatformed creators. Not gradual growth — viral spike from minute one.

---

## Why the Previous Cost Estimate Was Wrong (And Why That's Good News)

My earlier $15-30M/month estimate used **traditional CDN pricing** (AWS CloudFront at ~$0.01-0.02/GB egress). That was the wrong model entirely.

**The right model is Cloudflare R2:**
- Egress from R2 to Cloudflare CDN: **$0.00/GB** — literally zero
- R2 storage: **$0.015/GB/month**
- Cloudflare CDN: serves cached content at edge with zero per-GB charge
- Cloudflare handles **1 billion videos per day** (100 petabytes/month) across 310 global PoPs

**What this means for cost:**

| Scale | Old Estimate (wrong CDN model) | Real Cost (Cloudflare R2) |
|-------|-------------------------------|--------------------------|
| 1M MAU | $30K-120K/month | $2,000-8,000/month |
| 10M MAU | $300K-1.2M/month | $8,000-30,000/month |
| 50M MAU | $3M-8M/month | $20,000-80,000/month |
| 120M MAU | $15-30M/month | **$50,000-200,000/month** |

**How:** When a major creator's video is stored in Cloudflare R2 and served via Cloudflare CDN:
- First viewer at each Cloudflare PoP: one R2 read (cache miss, costs fractions of a cent)
- Every subsequent viewer at that PoP: served from edge cache, **cost = $0**
- 1.2M concurrent viewers (a documented mainstream-creator peak) = $0.20 in R2 operations for the entire event

This is not theoretical. Cloudflare documents serving 1 billion videos/day. A a major creator spike is routine infrastructure for them.

---

## The Viral Launch Scenario — What Actually Happens

**Documented scale:**
- Reference scale event: over 1 million concurrent viewers on a single livestream (documented mainstream-creator peak)
- Day-1 spike on a new exclusive: realistically hundreds of thousands to low millions of concurrent viewers within 30 minutes of announcement

**How Cloudflare handles it:**
- Cloudflare Stream: no hard concurrent viewer limit, built on Workers + Durable Objects, sub-50ms from 95% of global users
- Case study: Hyperconnect (Hakuna Live) runs 23M users on Cloudflare with unlimited broadcast audiences
- Cloudflare has handled events with millions of concurrent streams — this is their core product

**Pre-warming strategy (critical):**
Before the launch announcement, the video must already be in Cloudflare R2 and the CDN cache warmed. Process:
1. Upload video → Livepeer transcoding → HLS segments stored in R2
2. 30 minutes before announcement: pre-warm script hits every Cloudflare PoP with the master playlist
3. When the tweet goes out: every viewer hits cached content at their nearest edge

**Lesson from past viral drops:** Major creator merchandise/checkout launches have crashed not because of CDN limits but because their database and checkout layers couldn't absorb the spike. The bottleneck at scale is almost always the backend, not video delivery.

---

## What Breaks at a major creator Scale (Your Real Risks)

In order of actual risk:

### Risk 1: NFT Minting Spike (HIGH — must solve before launch)

If a mainstream creator says "buy your access NFT to watch," 100,000+ people try to mint simultaneously.

**Arbitrum capacity:** 57 TPS real-world, 640 TPS for complex contracts, 6,000+ TPS theoretical. 100K mints in 1 hour = 27 TPS sustained — **Arbitrum can handle this**.

**But:** Gas spikes from $0.05 to $0.50-$2.00 per mint during congestion. And if your contract has sequential state (incrementing token IDs), rapid mints compete. 

**Solution:** Use ERC721A (cuts minting cost 80%, handles rapid sequential mints efficiently). Add a simple queue on the frontend — show "You are #4,231 in queue" rather than letting users spam the contract.

### Risk 2: Backend Database Collapse (CRITICAL — must be day-1 ready)

This is what kills viral launches. When millions of people hit your site at once:
- Session lookups fail if DB is single-node
- NFT ownership checks time out if not cached
- "Is this user authenticated?" becomes the bottleneck

**Solution:** Privy is already in the stack (75-100M accounts, 99.99% SLA, sub-100ms signing). Add:
- **Upstash Redis** (serverless, scales to millions of requests instantly) — cache NFT ownership
- **Neon or Supabase Postgres** (auto-scales, connection pooling built in) — user preferences
- **Goldsky or The Graph** for on-chain queries — never hit Arbitrum directly from frontend

### Risk 3: Onboarding (CRITICAL — the mainstream creator audience is NOT crypto-native)

a mainstream creator's audience are mostly 18-34-year-olds who have never touched a crypto wallet. If they see "Install MetaMask to continue," you lose 95% of them.

**Solution (Privy already handles this):**
- Login with Google/Apple/email → Privy creates embedded wallet automatically
- User never sees a seed phrase, never installs an extension
- Pay with credit card via a fiat on-ramp (Privy integrates with Coinbase Pay, MoonPay, Stripe Crypto)
- The NFT mints to their embedded wallet without them knowing what an NFT is

This is the single most important UX decision. The word "NFT" should barely appear in the UI. The user buys "permanent access to this video" — the NFT is the mechanism, not the product.

### Risk 4: Content Protection for Exclusive Videos (HIGH)

If a major creator releases an exclusive video and the raw HLS URL becomes public, it gets ripped and re-uploaded to YouTube within minutes.

**Solution — Cloudflare Access + Signed URLs:**
- Video segments stored in R2 as private (not public bucket)
- Cloudflare Worker verifies NFT ownership → issues signed URL (valid 24 hours for that IP)
- Signed URL serves the video from CDN — no one can share the URL because it's bound to their session
- No separate DRM server needed — Cloudflare Workers IS your access control layer
- Costs: $0.50/million Worker requests (cheap at any scale)

This is simpler than full Widevine DRM and effective against casual piracy. For super-premium content (studio films), you can add Widevine later.

### Risk 5: Lost Distribution Creators (Deplatformed Creator situation)

Creators who lost distribution are often dealing with:
- Content that was deplatformed for political/speech reasons (not illegal content)
- Audiences that are actively looking for where to follow them
- High motivation to migrate their audience

**This is your biggest early growth driver.** Tyler's audience will sign up specifically because you are the platform that hosts what was deplatformed. The censorship-resistance is the value proposition.

**Architecture implication:** The decentralized storage (Filecoin/IPFS) for these creators is not just technical — it's the product. Their audience needs to know "this video cannot be removed." Make that visible in the UI. Show the IPFS CID, show the Arweave metadata hash, show "stored on decentralized network."

---

## Corrected Architecture for Day-1 Launch

```
┌─────────────────────────────────────────────────────────────────┐
│  User (mainstream creator fans, first time on platform)                   │
│  Login: Google/Apple/email → Privy embedded wallet (auto)       │
│  Never sees seed phrase, MetaMask, or "Web3" complexity         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare (Everything Layer)                                  │
│  - CDN: serves HLS video from R2 (zero egress cost)            │
│  - Workers: auth check → signed URL → serves private R2 video  │
│  - DDoS protection: automatic                                   │
│  - 310 global PoPs, 50ms from 95% of world                     │
│  Handles: 2M concurrent viewers, a major creator spike, pre-warming  │
└─────────────────────────────────────────────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Cloudflare R2    │  │ Backend API      │  │ Arbitrum L2      │
│ (Video Storage)  │  │ (Node.js)        │  │ (Ownership)      │
│                  │  │                  │  │                  │
│ Private HLS      │  │ Upstash Redis:   │  │ MovieTicket.sol  │
│ segments +       │  │  NFT ownership   │  │ (ERC721A)        │
│ manifests        │  │  cache (30s TTL) │  │ Reviews.sol      │
│                  │  │                  │  │ SeederCredits    │
│ $0.015/GB/month  │  │ Neon Postgres:   │  │ Crowdfunding     │
│ $0 egress to CDN │  │  user prefs,     │  │                  │
│                  │  │  watch progress  │  │ $0.05-2/mint     │
│                  │  │                  │  │ (ERC721A)        │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Goldsky (Real-time blockchain indexer)                         │
│  - Syncs Arbitrum events in real-time                          │
│  - Materializes: who owns what, reviews, credits               │
│  - Backend queries Goldsky, never hits chain directly          │
│  - Redis cache sits in front of Goldsky for hot queries        │
└─────────────────────────────────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Livepeer         │  │ Filecoin/IPFS    │  │ Arweave          │
│ (Transcoding)    │  │ (Backup/Archival)│  │ (Metadata/Proofs)│
│                  │  │                  │  │                  │
│ Raw video →      │  │ Mirror of R2     │  │ Film manifests   │
│ HLS ladder       │  │ content for      │  │ Metadata JSON    │
│ (360p to 4K)     │  │ censorship       │  │ Review bundles   │
│                  │  │ resistance       │  │ Seeder reports   │
│ One-time per     │  │                  │  │                  │
│ film upload      │  │ If Cloudflare    │  │ Proof the video  │
│                  │  │ caves to         │  │ existed and was  │
│ 5-10x cheaper    │  │ pressure,        │  │ published        │
│ than AWS         │  │ content survives │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Theta P2P (Optional boost layer — NOT primary delivery)        │
│  Users who opt-in seed content to peers                        │
│  a major creator audience: tech-savvy, higher participation likely   │
│  Realistic: 5-10% participation, 15-25% bandwidth offload      │
│  SeederCredits rewards: earn fee discounts, free tickets       │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Censorship-Resistance Layer (What Makes This Platform Real)

This is the key point for creators who lost distribution:

**Primary delivery** (Cloudflare) CAN be pressured to remove content. This is the practical reality.

**But the content is permanently backed up on Filecoin/IPFS + Arweave.** If Cloudflare removes the video from R2:
1. The Filecoin/IPFS CID still exists globally — anyone can fetch it
2. The Arweave metadata hash proves the content existed and who published it
3. The Arbitrum NFT ownership is on-chain — holders keep their access
4. Anyone can set up a new Cloudflare R2 bucket and restore the content from Filecoin

**What to show in the UI:** Every film page shows:
- IPFS CID: `bafybeih...`
- Arweave metadata: `ar://...`
- Contract address: `0x...`
- "This content is permanently archived on decentralized storage. No platform can delete it."

This is the product. This is why a deplatformed creator chose this platform. This is why a major creator's exclusive matters — it cannot be deplatformed after the fact.

---

## Real Cost Model (Corrected)

### Infrastructure (Cloudflare R2 model)

| Component | Monthly Cost |
|-----------|-------------|
| Cloudflare R2 storage (500TB library) | $7,500 |
| Cloudflare R2 reads (cache warming) | $500-3,000 |
| Cloudflare Workers (auth, signed URLs) | $2,000-10,000 |
| CDN delivery (zero egress from R2) | **$0** |
| Node.js backend (fly.io, auto-scale) | $2,000-10,000 |
| Upstash Redis (serverless, NFT cache) | $500-2,000 |
| Neon Postgres (user data) | $500-5,000 |
| Goldsky indexer (Arbitrum events) | $500-2,000 |
| Livepeer (transcoding new uploads) | $500-3,000 |
| Filecoin backup storage | $1,000-5,000 |
| Arweave metadata | $100-500 |
| Arbitrum gas (transactions) | $500-3,000 |
| **Total at 10M MAU** | **~$15,000-43,000/month** |
| **Total at 50M MAU** | **~$30,000-100,000/month** |
| **Total at 120M MAU** | **~$60,000-200,000/month** |

### Revenue potential

| Scenario | Revenue |
|----------|---------|
| Major-creator drop: 500K viewers × $2 basic access NFT | $1,000,000 (one event) |
| 10M MAU × 2% buy a film × $5 avg | $1,000,000/month |
| Creator cut (70%) paid automatically | Built into contract |
| Platform cut (30%) at $1M/month revenue | $300,000/month |

Infrastructure is $15-43K/month against $300K+/month platform revenue at 10M MAU. This is a real business.

---

## Updated Decision Record

### What to USE (corrected from Grok's ADR-001):

| Component | Decision | Why |
|-----------|----------|-----|
| **Primary video delivery** | Cloudflare R2 + CDN | Zero egress, proven at 1B videos/day |
| **Access control** | Cloudflare Workers + signed URLs | Simple, fast, no separate DRM server |
| **Video storage (hot)** | Cloudflare R2 (private bucket) | Zero egress + instant global distribution |
| **Video storage (cold/backup)** | Filecoin/IPFS | Censorship resistance, decentralized permanence |
| **Transcoding** | Livepeer | 5-10x cheaper than AWS, decentralized |
| **Metadata/proofs** | Arweave | Permanent, immutable, proven |
| **Blockchain** | Arbitrum | 57-640 TPS, $0.05/mint, EVM compatible |
| **NFT contract** | ERC721A | 80% cheaper minting, handles rapid-fire mints |
| **Auth + wallets** | Privy | 100M+ accounts, email/social login, embedded wallets |
| **On-chain indexing** | Goldsky (real-time) | Faster than The Graph, simpler to operate |
| **Cache** | Upstash Redis (serverless) | Scales instantly to any spike |
| **Database** | Neon Postgres | Serverless, auto-scales, no connection limits |
| **Backend** | Node.js on fly.io | Auto-scales globally, cheap |
| **P2P boost** | Theta Network | Supplement, not primary. Works well for tech-savvy audience |
| **Fiat on-ramp** | Privy + MoonPay/Coinbase | One-click credit card to NFT for non-crypto users |

### What Grok's ADR had right (keep):
- Filecoin/IPFS for censorship-resistant backup ✅
- Livepeer for transcoding ✅
- Arweave for metadata ✅
- Arbitrum for contracts ✅
- Event-driven indexer approach ✅
- Non-custodial design ✅
- P2P credits concept ✅

### What Grok's ADR got wrong (fixed here):
- Primary delivery: Theta/Saturn → **Cloudflare R2 + CDN** ✅
- Cost model: $5-10M/month → **$60-200K/month** ✅
- Math: 43.2B viewer-hours → **3.6B viewer-hours** ✅
- No backend: ADDED **Node.js + Redis + Postgres** ✅
- No DRM: ADDED **Cloudflare Workers signed URLs** ✅
- No onboarding plan: ADDED **Privy email/social + fiat on-ramp** ✅
- ERC721 → **ERC721A** (80% cheaper minting at spike) ✅
- The Graph → **Goldsky** (real-time, simpler) ✅

---

## Pre-Launch Checklist (Before a major creator Tweets)

- [ ] Cloudflare R2 bucket created, private, CDN configured
- [ ] Cloudflare Worker deployed: verify NFT ownership → issue signed URL → serve video
- [ ] Livepeer transcoding pipeline tested end-to-end with a real video
- [ ] ERC721A contract deployed to Arbitrum (replace ERC721 in MovieTicket.sol)
- [ ] Privy configured with email + Google + Apple login + fiat on-ramp
- [ ] Goldsky subgraph synced to Arbitrum events
- [ ] Redis NFT ownership cache tested under load
- [ ] Video pre-warmed at Cloudflare edges (hit master playlist from each PoP)
- [ ] Frontend onboarding tested: zero crypto knowledge required
- [ ] "Stored on decentralized network" proof visible on film page
- [ ] ERC721A mint queue UI (show position, expected wait time)
- [ ] Fiat on-ramp tested (credit card → ETH → mint in under 2 minutes)

---

*This document supersedes STORAGE_STREAMING_ARCHITECTURE_DECISION.md (ADR-001) in its entirety.*
*Grok's ADR-001 technology choices (Filecoin, Livepeer, Arweave, Arbitrum, Theta) remain valid as identified components. The delivery layer, cost model, onboarding, and access control have been corrected and expanded.*
