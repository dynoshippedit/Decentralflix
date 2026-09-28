import { describe, expect, it } from "vitest";
import {
  CREATOR_SHARE,
  ECONOMICS_WARNING,
  FILMMAKER_TIERS,
  VIEWER_OPTIONS,
  PRICING_STATUS,
  PRICING_DISCLAIMER,
  DEFERRED_FEATURE_PHRASES,
} from "./pricing";

describe("pricing honesty", () => {
  it("pricing is explicitly draft", () => {
    expect(PRICING_STATUS).toBe("draft");
    expect(PRICING_DISCLAIMER.toLowerCase()).toMatch(/draft|proposed/);
  });

  it("uses the verified 75% creator-share basis everywhere", () => {
    expect(CREATOR_SHARE).toBe(0.75);
    for (const t of FILMMAKER_TIERS) {
      expect(t.features.join(" ")).toMatch(/75% creator share/);
    }
  });

  it("never advertises a 90% creator share", () => {
    const blob = JSON.stringify({ FILMMAKER_TIERS, VIEWER_OPTIONS });
    expect(blob).not.toMatch(/90%/);
  });

  it("Collector Pass carries the economics warning", () => {
    const pass = VIEWER_OPTIONS.find((o) => o.id === "collector-pass");
    expect(pass).toBeDefined();
    expect(pass!.warning).toBe(ECONOMICS_WARNING);
    expect(ECONOMICS_WARNING).toMatch(/\$10\/mo/);
    expect(ECONOMICS_WARNING).toMatch(/\$12/);
    expect(ECONOMICS_WARNING).toMatch(/75%/);
    expect(ECONOMICS_WARNING.toLowerCase()).toMatch(/before.*processing/);
  });

  it("migration pilot is capped, never unlimited", () => {
    const pilot = FILMMAKER_TIERS.find((t) => t.id === "migration-pilot");
    expect(pilot).toBeDefined();
    expect(pilot!.titleLimit).toMatch(/10 titles/);
    expect(pilot!.titleLimit.toLowerCase()).not.toMatch(/unlimited/);
    expect(pilot!.price).toBe("Free");
  });

  it("paid tiers are labeled draft", () => {
    for (const t of [...FILMMAKER_TIERS, ...VIEWER_OPTIONS]) {
      if (!t.price.startsWith("$") || t.price === "Free") continue;
      expect(t.priceNote.toLowerCase()).toMatch(/draft/);
    }
  });

  it("does not promise deferred features", () => {
    const blob = JSON.stringify({ FILMMAKER_TIERS, VIEWER_OPTIONS }).toLowerCase();
    for (const phrase of DEFERRED_FEATURE_PHRASES) {
      expect(blob).not.toContain(phrase.toLowerCase());
    }
  });
});
