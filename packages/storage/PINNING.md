# Pinning Strategy — @decentralflix/storage

What gets pinned, where, and why. "Pinning" here means telling an IPFS node
(or a remote pinning service) to keep a CID and not garbage-collect it.
Encrypted film fragments are content-addressed on IPFS/Filecoin; the
manifest (hashes + CIDs) lives permanently on Arweave.

## What is pinned vs. what is permanent

| Data                              | Where                          | Lifetime                              |
|-----------------------------------|--------------------------------|---------------------------------------|
| Encrypted fragments (1 MiB each)   | IPFS (Kubo), mirrored Filecoin | Pinned — must be actively kept        |
| Manifest JSON (hashes, CIDs)      | Arweave                        | Permanent — pay once, stored forever  |
| Fragment-hash proofs (if anchored)| Arweave                        | Permanent                             |

The manifest is small (kilobytes) and posted to Arweave by `storeFilm()`
when a gateway + signer are provided. Everything needed to verify a film —
sha256 per fragment, CIDs, fragment count — is in the manifest, so even if
every IPFS pin is lost, the integrity record survives.

## Layer 1 — Local Kubo pinning (default)

`storeFilm()` pins every fragment CID on the local Kubo node right after
`ipfs.add()` (disable with `pin: false`). This is the minimum: without a
pin, a Kubo node may garbage-collect unpinned blocks, and the film becomes
unretrievable from that node.

Operational notes:

- Run Kubo with GC enabled (`ipfs config --json Datastore.GCPeriod ...`)
  only if you understand that unpinned blocks are disposable; pinned blocks
  are safe.
- `ipfs pin ls --type=recursive` should show one pin per fragment CID.
- The storeFilm default endpoint is `http://127.0.0.1:5001`; point it at
  your Kubo node in production via `ipfsEndpoint`.

## Layer 2 — Remote pinning services

Local pins die with the server. For redundancy, replicate fragment CIDs to
at least one remote pinning service (Pinata, web3.storage, Filebase, or a
self-hosted second Kubo). These services expose the same IPFS HTTP API or a
pinning-service API; feed them the `fragmentCids` array returned by
`storeFilm()`.

Recommendation: 2+ geographically separate pinners for anything you intend
to stream. IPFS retrieval is fastest when a nearby node has the blocks.

## Layer 3 — Filecoin mirror

Per repo architecture, IPFS/Filecoin is the content mirror. Push fragment
CIDs into a Filecoin storage deal (via a deal-making service or Lotus)
for cryptoeconomic durability beyond pinning. This package does not make
Filecoin deals — it hands you the CIDs; the infrastructure layer deals
them.

## Arweave: not pinned, permanent

Arweave transactions are not "pinned" — once mined, data is replicated by
the weave permanently. That is why the manifest and tamper-evidence proofs
go there and never depend on anyone's pinning budget. Note the tradeoff:
Arweave is pay-per-byte, so video bytes never go there (enforced in code —
`ArweaveClient` refuses payloads over 1 MiB). The optional
`mirrorFragmentsToArweave` flag exists only as an IPFS-outage survival
path for small libraries; it costs AR per byte and is OFF by default.

## Retrieval order

`retrieveFilm()` fetches each fragment from IPFS first (any gateway or
local node with the blocks), verifies sha256 against the Arweave-anchored
manifest, and only then decrypts. If a fragment is missing on IPFS but was
mirrored to Arweave, it falls back to the Arweave tx id recorded in the
manifest. No pin, no blocks — plan pinning before you need retrieval.
