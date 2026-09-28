# ARCHITECTURE.md — High-Level Architecture

**Superseded by STORAGE_STREAMING_ARCHITECTURE_DECISION.md (ADR-001, 2026-05-29)**

See the full canonical hybrid architecture there:
- Primary storage: Filecoin/IPFS (Onchain Cloud + Saturn/Beam)
- Transcoding/orchestration: Livepeer
- P2P delivery & seeding: Theta EdgeCloud
- P2P credits: First-class (evolved SeederCredits)
- Ownership/gating/reviews: Strictly event-driven + indexer-first (no linear scans in production paths)
- Permanent archival/metadata/proofs: Arweave (strictly demoted)

All future work must align with ADR-001. This file is retained for historical reference only.

(Original stub below for archive:)
- Storage: Arweave (permanent) [superseded]
- Delivery: Livepeer (transcoding + playback)
- Auth: Privy + SIWE
- Frontend: Next.js 15 (now 16+)
- Contracts: Hardhat + Solidity (MovieTicket.sol — Permanent + Burnable tickets; plus Reviews, FilmmakerCampaign, SeederCredits)