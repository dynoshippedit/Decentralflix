# Limitations — @decentralflix/storage

Honest notes on what this module does and does not provide. Read before
relying on it for anything adversarial.

## 1. Encryption is at-rest confidentiality, not DRM

Fragments are encrypted with AES-256-GCM, which guarantees: whoever has the
bytes but not the key learns nothing about the content, and any modification
is detected at decrypt time. It does NOT guarantee:

- **No copy prevention.** Whoever legitimately holds the 32-byte key can
  decrypt and redistribute the plaintext. There is no license server, no
  secure enclave, no watermarking in this package. Key distribution ==
  trust; treat the key like a password.
- **No forward secrecy.** If a key leaks, all fragments ever encrypted
  under it are readable. Rotate keys per film (the default) and, for
  sensitive content, per release window.
- **No protection against the key holder.** This is by design — the
  platform's access model (NFT-gated signed URLs) lives above this layer.

## 2. Tamper detection, not tamper prevention

`retrieveFilm()` verifies sha256 of each retrieved fragment against the
manifest and throws `TamperError` on mismatch *before* decryption, so
corrupted or substituted fragments never produce bad plaintext. But:

- The check only works if you have the **correct manifest**. A manifest
  obtained from an untrusted source could list attacker-chosen hashes.
  Get the manifest from Arweave (permanent, content-addressed by tx id) or
  another trusted channel, and verify the tx id out-of-band.
- Hash verification detects modification of stored bytes; it says nothing
  about whether the *original* film was what the uploader claimed.

## 3. No Sybil-proofness claims

Nothing here proves how many distinct parties store the data, how much
is actually replicated, or that a pinner isn't one disk pretending to be
ten nodes. Pinning-service redundancy is an operational practice, not a
cryptographic guarantee. Filecoin deals add cryptoeconomic weight at the
infrastructure layer; this package does not verify them.

## 4. Gateway centralization caveats

- The default Arweave gateway (`https://arweave.net`) and any single
  gateway is a centralized read/write choke point. Data on the weave is
  permanent, but your *access* to it depends on gateways being up and
  honest. Point `arweaveGateway` at your own gateway or multiple gateways
  for serious deployments.
- Same for IPFS: `retrieveFilm()` reads from one configured endpoint.
  Any public gateway works as a fallback source only if the CIDs are
  actually pinned somewhere reachable.

## 5. Availability is not durability

IPFS CIDs are content addresses, not storage promises. If every pin of a
fragment is dropped and no Filecoin deal covers it, the bytes are gone —
the manifest will tell you exactly what you lost, but it won't bring it
back. Pin deliberately (see PINNING.md).

## 6. The 1 MiB Arweave cap is a policy, not a protocol limit

Arweave itself can store larger transactions (via chunking). This package
refuses payloads over 1 MiB on purpose: Arweave is for manifests/proofs,
never video bytes, per repo architecture. The optional
`mirrorFragmentsToArweave` survival path inherits the cap, so mirrored
fragments must use a small enough `fragmentSize` (plaintext + 28 bytes
wire overhead ≤ 1 MiB); `storeFilm()` rejects oversized configurations
rather than silently truncating.

## 7. Wallet signing is out of scope

`ArweaveClient` never holds private keys. The caller supplies `signTx`
(see `src/arweave.js`). Key management, hardware-wallet UX, and fee
payment are the wallet layer's job (Phase 2 step 4), not this package's.
The test suite's `testSignTx` is a deterministic fake — never use it
outside tests.

## 8. Performance characteristics

- `storeFilm()` is sequential per fragment (add → pin → next). This is
  deliberate for correctness of the manifest, but throughput is bounded by
  round-trip latency; parallelize at the caller if needed.
- The whole film is held in memory as a Buffer. Streaming/chunked
  ingestion is not implemented — do not use this for multi-GB uploads in
  one call without checking host memory.
- `retrieveFilm()` similarly buffers the full plaintext before returning.
