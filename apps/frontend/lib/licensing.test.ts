import { describe, expect, it } from "vitest";
import { LICENSE_TABLE, APPLE_NFT_NOTE, BUNDLES_BEFORE_WALLET_NOTE } from "./licensing";

describe("license model honesty", () => {
  it("covers the five Update-20 offer types", () => {
    const offers = LICENSE_TABLE.map((r) => r.offer.toLowerCase());
    for (const required of ["rental", "streaming", "download", "replacement", "collector"]) {
      expect(offers.some((o) => o.includes(required))).toBe(true);
    }
  });

  it("every row states what the buyer receives and what must be true", () => {
    for (const row of LICENSE_TABLE) {
      expect(row.receives.length).toBeGreaterThan(10);
      expect(row.mustBeTrue.length).toBeGreaterThan(10);
    }
  });

  it("streaming access disclaims perpetual operation", () => {
    const streaming = LICENSE_TABLE.find((r) => r.offer.toLowerCase().includes("streaming"));
    expect(streaming).toBeDefined();
    expect(streaming!.mustBeTrue.toLowerCase()).toMatch(/no promise of perpetual operation/);
  });

  it("collector token carries the Apple 3.1.1 constraint", () => {
    const token = LICENSE_TABLE.find((r) => r.offer.toLowerCase().includes("collector"));
    expect(token).toBeDefined();
    expect(token!.mustBeTrue).toMatch(/3\.1\.1/);
    expect(APPLE_NFT_NOTE).toMatch(/3\.1\.1/);
    expect(APPLE_NFT_NOTE.toLowerCase()).toMatch(/does not unlock app functionality/);
  });

  it("bundles-before-wallet: the mint is not a stored balance", () => {
    expect(BUNDLES_BEFORE_WALLET_NOTE.toLowerCase()).toMatch(/not a wallet or stored balance/);
    expect(BUNDLES_BEFORE_WALLET_NOTE.toLowerCase()).toMatch(/bundle/);
  });
});
