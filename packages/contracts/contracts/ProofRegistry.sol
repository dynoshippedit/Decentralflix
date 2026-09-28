// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProofRegistry
 * @author Decentralflix — Phase 2 (step 5)
 * @notice On-chain registry of film fragment manifests, anchored as Merkle roots.
 *
 * A filmmaker (or the contract owner) registers a film's fragment manifest by
 * publishing the Merkle root over the per-fragment sha256 leaf hashes produced
 * by the Decentralflix storage JS package (`splitBuffer` → `sha256Hex` per fragment →
 * `buildMerkleRoot`). Anyone can then call {verifyFragment} to check that a
 * given fragment belongs to the registered manifest — the tamper-evidence
 * primitive that lets a client reject a corrupted or substituted fragment
 * before decryption.
 *
 * TREE CONVENTION (must match `packages/storage/src/merkle.js` exactly):
 * - Leaves are the 32 raw bytes of each fragment's sha256 hex digest.
 * - Internal node = sha256(left || right), order-preserving (NOT sorted).
 * - Odd layers duplicate the last node before pairing.
 * - A single-fragment film has root == its leaf hash and an empty proof.
 *
 * @dev NOTE ON OpenZeppelin MerkleProof: OZ's `MerkleProof.verify` hardcodes
 * keccak256 for internal node hashing, which is INCOMPATIBLE with this
 * registry's sha256-based tree (the storage layer standardizes on sha256
 * end-to-end, fragment hashes included). This contract therefore implements
 * its own sha256 verifier ({_processProof}) that mirrors `merkle.js` byte for
 * byte. The round trip is proven by the end-to-end test in
 * `test/ProofRegistry.test.ts` (storage → root → register → verify).
 *
 * REGISTRATION TRUST MODEL: the first caller to register a `filmId` becomes
 * its `registrant`; afterwards only the registrant or the contract owner may
 * update the manifest. There is no on-chain filmmaker identity check here —
 * front-running a `filmId` registration is possible, so integrators should
 * register manifests promptly and treat `getManifest`'s `registrant` field as
 * the authority signal.
 */
contract ProofRegistry is Ownable {
    /// @notice A registered film manifest.
    struct Manifest {
        bytes32 merkleRoot; // root over the fragment sha256 leaves
        uint256 fragmentCount; // number of leaves the root commits to
        string manifestArweaveTx; // Arweave tx id of the full JSON manifest (may be empty)
        address registrant; // address that first registered this filmId
        uint64 registeredAt; // block.timestamp of first registration
        uint64 updatedAt; // block.timestamp of last update
        bool exists; // registration guard
    }

    // ── Errors ────────────────────────────────────────────────────────────
    error InvalidFilmId();
    error InvalidRoot();
    error InvalidFragmentCount();
    error ManifestNotFound(uint256 filmId);
    error NotRegistrantOrOwner(uint256 filmId, address caller);
    error FragmentIndexOutOfBounds(uint256 filmId, uint256 index, uint256 fragmentCount);
    error ProofLengthMismatch(uint256 expected, uint256 actual);

    // ── Events ────────────────────────────────────────────────────────────
    event ManifestRegistered(
        uint256 indexed filmId,
        address indexed registrant,
        bytes32 merkleRoot,
        uint256 fragmentCount,
        string manifestArweaveTx
    );
    event ManifestUpdated(
        uint256 indexed filmId,
        address indexed updater,
        bytes32 oldRoot,
        bytes32 newRoot,
        uint256 fragmentCount,
        string manifestArweaveTx
    );

    mapping(uint256 => Manifest) private _manifests; // filmId => Manifest

    constructor() Ownable(msg.sender) {}

    // ── Registration ──────────────────────────────────────────────────────

    /**
     * @notice Register (first call) or update (registrant/owner only) a film's
     * fragment manifest.
     * @param filmId Platform-unique film identifier (must be non-zero).
     * @param merkleRoot Root of the sha256 Merkle tree over the fragment
     * hashes, as produced by `buildMerkleRoot` in the storage package.
     * @param fragmentCount Number of fragments (leaves) the root commits to.
     * @param manifestArweaveTx Arweave tx id of the full JSON manifest
     * (informational; may be empty if not yet posted).
     */
    function registerManifest(
        uint256 filmId,
        bytes32 merkleRoot,
        uint256 fragmentCount,
        string calldata manifestArweaveTx
    ) external {
        if (filmId == 0) revert InvalidFilmId();
        if (merkleRoot == bytes32(0)) revert InvalidRoot();
        if (fragmentCount == 0) revert InvalidFragmentCount();

        Manifest storage m = _manifests[filmId];
        if (!m.exists) {
            m.merkleRoot = merkleRoot;
            m.fragmentCount = fragmentCount;
            m.manifestArweaveTx = manifestArweaveTx;
            m.registrant = msg.sender;
            m.registeredAt = uint64(block.timestamp);
            m.updatedAt = uint64(block.timestamp);
            m.exists = true;
            emit ManifestRegistered(filmId, msg.sender, merkleRoot, fragmentCount, manifestArweaveTx);
        } else {
            if (msg.sender != m.registrant && msg.sender != owner()) {
                revert NotRegistrantOrOwner(filmId, msg.sender);
            }
            bytes32 oldRoot = m.merkleRoot;
            m.merkleRoot = merkleRoot;
            m.fragmentCount = fragmentCount;
            m.manifestArweaveTx = manifestArweaveTx;
            m.updatedAt = uint64(block.timestamp);
            emit ManifestUpdated(
                filmId,
                msg.sender,
                oldRoot,
                merkleRoot,
                fragmentCount,
                manifestArweaveTx
            );
        }
    }

    /**
     * @notice Return the registered manifest for a film.
     * @param filmId Platform-unique film identifier.
     */
    function getManifest(uint256 filmId)
        external
        view
        returns (
            bytes32 merkleRoot,
            uint256 fragmentCount,
            string memory manifestArweaveTx,
            address registrant,
            uint64 registeredAt,
            uint64 updatedAt
        )
    {
        Manifest storage m = _manifests[filmId];
        if (!m.exists) revert ManifestNotFound(filmId);
        return (
            m.merkleRoot,
            m.fragmentCount,
            m.manifestArweaveTx,
            m.registrant,
            m.registeredAt,
            m.updatedAt
        );
    }

    // ── Verification ──────────────────────────────────────────────────────

    /**
     * @notice Check that a fragment belongs to a registered manifest.
     * @param filmId Platform-unique film identifier.
     * @param fragmentIndex Index of the fragment (0-based leaf position).
     * @param leafHash sha256 digest of the fragment's stored (encrypted,
     * wire-format) bytes, as 32 raw bytes.
     * @param proof Sibling hashes from leaf to root, as produced by
     * `getProof` in the storage package (`packages/storage/src/merkle.js`). Length must equal the tree
     * depth (0 for a single-fragment film).
     * @return True iff the proof recomputes to the registered root.
     */
    function verifyFragment(
        uint256 filmId,
        uint256 fragmentIndex,
        bytes32 leafHash,
        bytes32[] calldata proof
    ) external view returns (bool) {
        Manifest storage m = _manifests[filmId];
        if (!m.exists) revert ManifestNotFound(filmId);
        if (fragmentIndex >= m.fragmentCount) {
            revert FragmentIndexOutOfBounds(filmId, fragmentIndex, m.fragmentCount);
        }
        uint256 expected = _treeDepth(m.fragmentCount);
        if (proof.length != expected) revert ProofLengthMismatch(expected, proof.length);
        return _processProof(fragmentIndex, leafHash, proof) == m.merkleRoot;
    }

    /**
     * @dev Tree depth = number of proof elements for `leafCount` leaves:
     * 0 for a single leaf, otherwise ceil(log2(leafCount)).
     */
    function _treeDepth(uint256 leafCount) internal pure returns (uint256) {
        uint256 depth = 0;
        uint256 size = leafCount;
        while (size > 1) {
            size = (size + 1) / 2;
            depth++;
        }
        return depth;
    }

    /**
     * @dev Recompute the root from a leaf and its sibling path using the
     * storage layer's convention: sha256(left || right), order-preserving.
     * Odd layers are duplicated by the prover (the duplicate is supplied as
     * the sibling), so no special-casing is needed here.
     */
    function _processProof(
        uint256 index,
        bytes32 leafHash,
        bytes32[] calldata proof
    ) internal pure returns (bytes32) {
        bytes32 computed = leafHash;
        uint256 idx = index;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            if (idx % 2 == 0) {
                computed = sha256(abi.encodePacked(computed, sibling));
            } else {
                computed = sha256(abi.encodePacked(sibling, computed));
            }
            idx /= 2;
        }
        return computed;
    }
}
