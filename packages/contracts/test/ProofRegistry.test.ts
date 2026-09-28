import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const FILM = 1n;
const ARWEAVE_TX = "arweave-manifest-tx-abc123";

// Storage-layer helpers, imported dynamically: the e2e path below exercises
// the REAL @decentralflix/storage code (splitBuffer → sha256Hex →
// buildMerkleRoot/getProof) against the on-chain verifier.
async function loadStorageModules() {
  const merkle = await import("../../storage/src/merkle.js");
  const fragment = await import("../../storage/src/fragment.js");
  const hash = await import("../../storage/src/hash.js");
  return { merkle, fragment, hash } as any;
}

async function deployFixture() {
  const [owner, filmmaker, stranger] = await ethers.getSigners();
  const registry = await ethers.deployContract("ProofRegistry", [], owner);
  const storage = await loadStorageModules();
  return { registry, owner, filmmaker, stranger, storage };
}

/** Build a film: bytes → fragments → leaf hashes → root (+proofs), via the real storage package. */
function buildFilm(storage: any, byteLength: number, fragmentSize: number) {
  const data = Buffer.from(
    Array.from({ length: byteLength }, (_, i) => `frag-${i % 251};`).join("")
  ).subarray(0, byteLength);
  const fragments = storage.fragment.splitBuffer(data, fragmentSize);
  const leafHashes: string[] = fragments.map((f: any) => storage.hash.sha256Hex(f.data));
  const root: string = storage.merkle.buildMerkleRoot(leafHashes);
  return { data, fragments, leafHashes, root };
}

const toBytes32 = (hexNoPrefix: string) => "0x" + hexNoPrefix;
const toProof = (proof: string[]) => proof.map(toBytes32);

describe("ProofRegistry", () => {
  describe("registerManifest", () => {
    it("registers a manifest and emits ManifestRegistered", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      const { leafHashes, root } = buildFilm(storage, 500, 64);

      await expect(
        registry
          .connect(filmmaker)
          .registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX)
      )
        .to.emit(registry, "ManifestRegistered")
        .withArgs(FILM, filmmaker.address, toBytes32(root), BigInt(leafHashes.length), ARWEAVE_TX);

      const m = await registry.getManifest(FILM);
      expect(m.merkleRoot).to.equal(toBytes32(root));
      expect(m.fragmentCount).to.equal(BigInt(leafHashes.length));
      expect(m.manifestArweaveTx).to.equal(ARWEAVE_TX);
      expect(m.registrant).to.equal(filmmaker.address);
      expect(m.registeredAt).to.be.gt(0);
      expect(m.updatedAt).to.equal(m.registeredAt);
    });

    it("lets the registrant update the manifest and emits ManifestUpdated", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      const film1 = buildFilm(storage, 500, 64);
      const film2 = buildFilm(storage, 900, 64);
      await registry
        .connect(filmmaker)
        .registerManifest(FILM, toBytes32(film1.root), film1.leafHashes.length, ARWEAVE_TX);

      await expect(
        registry
          .connect(filmmaker)
          .registerManifest(FILM, toBytes32(film2.root), film2.leafHashes.length, "arweave-tx-v2")
      )
        .to.emit(registry, "ManifestUpdated")
        .withArgs(
          FILM,
          filmmaker.address,
          toBytes32(film1.root),
          toBytes32(film2.root),
          BigInt(film2.leafHashes.length),
          "arweave-tx-v2"
        );

      const m = await registry.getManifest(FILM);
      expect(m.merkleRoot).to.equal(toBytes32(film2.root));
      expect(m.fragmentCount).to.equal(BigInt(film2.leafHashes.length));
      expect(m.manifestArweaveTx).to.equal("arweave-tx-v2");
      expect(m.updatedAt).to.be.gte(m.registeredAt);
    });

    it("lets the contract owner update another registrant's manifest", async () => {
      const { registry, owner, filmmaker, storage } = await loadFixture(deployFixture as any);
      const { leafHashes, root } = buildFilm(storage, 500, 64);
      await registry
        .connect(filmmaker)
        .registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX);

      const other = buildFilm(storage, 300, 64);
      await expect(
        registry.connect(owner).registerManifest(FILM, toBytes32(other.root), other.leafHashes.length, "")
      ).to.emit(registry, "ManifestUpdated");
      // registrant stays the original filmmaker
      expect((await registry.getManifest(FILM)).registrant).to.equal(filmmaker.address);
    });

    it("reverts update from a non-registrant, non-owner", async () => {
      const { registry, filmmaker, stranger, storage } = await loadFixture(deployFixture as any);
      const { leafHashes, root } = buildFilm(storage, 500, 64);
      await registry
        .connect(filmmaker)
        .registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX);

      await expect(
        registry.connect(stranger).registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX)
      )
        .to.be.revertedWithCustomError(registry, "NotRegistrantOrOwner")
        .withArgs(FILM, stranger.address);
    });

    it("reverts on zero filmId, zero root, zero fragmentCount", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      const { leafHashes, root } = buildFilm(storage, 500, 64);

      await expect(
        registry.connect(filmmaker).registerManifest(0n, toBytes32(root), leafHashes.length, ARWEAVE_TX)
      ).to.be.revertedWithCustomError(registry, "InvalidFilmId");
      await expect(
        registry
          .connect(filmmaker)
          .registerManifest(FILM, ethers.ZeroHash, leafHashes.length, ARWEAVE_TX)
      ).to.be.revertedWithCustomError(registry, "InvalidRoot");
      await expect(
        registry.connect(filmmaker).registerManifest(FILM, toBytes32(root), 0, ARWEAVE_TX)
      ).to.be.revertedWithCustomError(registry, "InvalidFragmentCount");
    });

    it("reverts getManifest for an unknown film", async () => {
      const { registry } = await loadFixture(deployFixture as any);
      await expect(registry.getManifest(999n))
        .to.be.revertedWithCustomError(registry, "ManifestNotFound")
        .withArgs(999n);
    });
  });

  describe("verifyFragment — end to end with @decentralflix/storage", () => {
    it("verifies every fragment of a real split+hashed film on-chain", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      // 500 bytes / 64-byte fragments → 8 fragments (power of two)
      const { leafHashes, root } = buildFilm(storage, 500, 64);
      await registry
        .connect(filmmaker)
        .registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX);

      for (let i = 0; i < leafHashes.length; i++) {
        const proof = toProof(storage.merkle.getProof(leafHashes, i));
        expect(await registry.verifyFragment(FILM, i, toBytes32(leafHashes[i]), proof)).to.equal(
          true,
          `fragment ${i} should verify`
        );
      }
    });

    it("verifies an odd-count film (duplicated last leaf)", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      // 500 bytes / 100-byte fragments → 5 fragments (odd)
      const { leafHashes, root } = buildFilm(storage, 500, 100);
      expect(leafHashes.length).to.equal(5);
      await registry
        .connect(filmmaker)
        .registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX);

      for (let i = 0; i < leafHashes.length; i++) {
        const proof = toProof(storage.merkle.getProof(leafHashes, i));
        expect(await registry.verifyFragment(FILM, i, toBytes32(leafHashes[i]), proof)).to.equal(true);
      }
      // the duplicated tail leaf (index 4) verifies with its self-sibling proof
      const tailProof = toProof(storage.merkle.getProof(leafHashes, 4));
      expect(tailProof[0]).to.equal(toBytes32(leafHashes[4]));
      expect(await registry.verifyFragment(FILM, 4, toBytes32(leafHashes[4]), tailProof)).to.equal(true);
    });

    it("verifies a single-fragment film with an empty proof (root == leaf)", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      const { leafHashes, root } = buildFilm(storage, 40, 1024); // 1 fragment
      expect(leafHashes.length).to.equal(1);
      expect(root).to.equal(leafHashes[0]);
      await registry.connect(filmmaker).registerManifest(FILM, toBytes32(root), 1, ARWEAVE_TX);
      expect(await registry.verifyFragment(FILM, 0, toBytes32(leafHashes[0]), [])).to.equal(true);
    });

    it("returns false for a tampered fragment", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      const { fragments, leafHashes, root } = buildFilm(storage, 500, 64);
      await registry
        .connect(filmmaker)
        .registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX);

      // flip one byte of fragment 2 and re-hash → different leaf
      const tampered = Buffer.from(fragments[2].data);
      tampered[0] ^= 0xff;
      const tamperedLeaf = storage.hash.sha256Hex(tampered);
      expect(tamperedLeaf).to.not.equal(leafHashes[2]);
      const proof = toProof(storage.merkle.getProof(leafHashes, 2));
      expect(await registry.verifyFragment(FILM, 2, toBytes32(tamperedLeaf), proof)).to.equal(false);
    });

    it("returns false for a proof built for a different fragment", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      const { leafHashes, root } = buildFilm(storage, 500, 64);
      await registry
        .connect(filmmaker)
        .registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX);

      const proofFor0 = toProof(storage.merkle.getProof(leafHashes, 0));
      expect(await registry.verifyFragment(FILM, 3, toBytes32(leafHashes[3]), proofFor0)).to.equal(false);
    });

    it("returns false for a corrupted proof element", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      const { leafHashes, root } = buildFilm(storage, 500, 64);
      await registry
        .connect(filmmaker)
        .registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX);

      const proof = toProof(storage.merkle.getProof(leafHashes, 1));
      proof[0] = toBytes32(storage.hash.sha256Hex("evil"));
      expect(await registry.verifyFragment(FILM, 1, toBytes32(leafHashes[1]), proof)).to.equal(false);
    });

    it("reverts for unknown film, out-of-bounds index, and wrong proof length", async () => {
      const { registry, filmmaker, storage } = await loadFixture(deployFixture as any);
      const { leafHashes, root } = buildFilm(storage, 500, 64);
      await registry
        .connect(filmmaker)
        .registerManifest(FILM, toBytes32(root), leafHashes.length, ARWEAVE_TX);
      const goodProof = toProof(storage.merkle.getProof(leafHashes, 0));

      await expect(registry.verifyFragment(4242n, 0, toBytes32(leafHashes[0]), goodProof))
        .to.be.revertedWithCustomError(registry, "ManifestNotFound")
        .withArgs(4242n);

      await expect(
        registry.verifyFragment(FILM, leafHashes.length, toBytes32(leafHashes[0]), goodProof)
      )
        .to.be.revertedWithCustomError(registry, "FragmentIndexOutOfBounds")
        .withArgs(FILM, BigInt(leafHashes.length), BigInt(leafHashes.length));

      await expect(registry.verifyFragment(FILM, 0, toBytes32(leafHashes[0]), goodProof.slice(0, 1)))
        .to.be.revertedWithCustomError(registry, "ProofLengthMismatch")
        .withArgs(BigInt(goodProof.length), 1n);
    });
  });
});
