import { describe, expect, it } from "vitest";
import {
  CREATOR_SHARE,
  ECONOMICS_WARNING,
  FILMMAKER_TIERS,
  VIEWER_OPTIONS,
  PRICING_STATUS,
  PRICING_DISCLAIMER,
  DEFERRED_FEATURE_PHRASES,
  MIGRATION_PILOT_CAP,
  CONTRIBUTION_TABLE,
  DEFERRED_ITEMS,
} from "./pricing";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("Collector Pass is deferred, not an active offer — economics still disclosed", () => {
    expect(VIEWER_OPTIONS.find((o) => o.id === "collector-pass")).toBeUndefined();
    const deferred = DEFERRED_ITEMS.find((d) => d.name.toLowerCase().includes("collector pass"));
    expect(deferred).toBeDefined();
    expect(deferred!.reason.length).toBeGreaterThan(20);
    expect(deferred!.reason.toLowerCase()).toMatch(/repeat|allocation|legal/);
    // The $10 / two-$8-credit / $12 payout problem stays public:
    expect(ECONOMICS_WARNING).toMatch(/\$10\/mo/);
    expect(ECONOMICS_WARNING).toMatch(/\$12/);
    expect(ECONOMICS_WARNING).toMatch(/75%/);
    expect(ECONOMICS_WARNING.toLowerCase()).toMatch(/before.*processing/);
    const page = readFileSync(join(__dirname, "..", "app", "pricing", "page.tsx"), "utf8");
    expect(page).toMatch(/ECONOMICS_WARNING/);
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

  it("does not offer deferred features as live (honest negative mentions allowed)", () => {
    const blob = JSON.stringify({ FILMMAKER_TIERS, VIEWER_OPTIONS });
    const sentences = blob.split(/[.!;]/);
    for (const phrase of DEFERRED_FEATURE_PHRASES) {
      const hits = sentences.filter((x) => x.toLowerCase().includes(phrase.toLowerCase()));
      for (const hit of hits) {
        // Any mention must be a denial or deferral, never a live offer.
        expect(hit.toLowerCase()).toMatch(/\b(no|not|n't|deferred|before|yet|roadmap|wait)\b/);
      }
    }
  });

  it("contribution table uses the 75% basis and shows 90% as loss-making", () => {
    const loss = CONTRIBUTION_TABLE.find((r) => r.scenario.includes("90%"));
    expect(loss).toBeDefined();
    expect(loss!.platformContribution).toBeCloseTo(-0.316, 3);
    expect(loss!.scenario.toLowerCase()).toMatch(/loss-making|never/);
    for (const r of CONTRIBUTION_TABLE.filter((x) => x.scenario.includes("75%"))) {
      const price = parseFloat(r.scenario.replace("$", "").split(" ")[0]);
      expect(r.creatorPayout).toBeCloseTo(price * 0.75, 3);
      expect(r.platformContribution).toBeGreaterThan(0);
    }
  });

  it("90% is shown only as a loss-making counterexample, never as an offer", () => {
    const offers = JSON.stringify({ FILMMAKER_TIERS, VIEWER_OPTIONS });
    expect(offers).not.toMatch(/90%/);
  });

  it("migration pilot cap is explicit: 10 titles, fixed budget, fee != cost", () => {
    expect(MIGRATION_PILOT_CAP).toMatch(/10 titles/);
    expect(MIGRATION_PILOT_CAP.toLowerCase()).toMatch(/fixed.*budget|budget/);
    expect(MIGRATION_PILOT_CAP).toMatch(/Zero platform fee does not mean zero cost/);
    expect(MIGRATION_PILOT_CAP.toLowerCase()).not.toMatch(/unlimited/);
  });

  it("defer list is complete, each with its reason", () => {
    const names = DEFERRED_ITEMS.map((d) => d.name.toLowerCase()).join(" | ");
    for (const required of [
      "stored credits",
      "collector pass",
      "wallet",
      "seeder rewards",
      "nft",
      "ai cinema",
      "community-funded",
      "international",
      "stablecoin",
      "cross-filmmaker",
    ]) {
      expect(names).toContain(required);
    }
    for (const d of DEFERRED_ITEMS) {
      expect(d.reason.length).toBeGreaterThan(20);
    }
  });

  it("never promises perpetual operation or uncapped free hosting", () => {
    const blob = JSON.stringify({ FILMMAKER_TIERS, VIEWER_OPTIONS, PRICING_DISCLAIMER }).toLowerCase();
    expect(blob).not.toMatch(/forever/);
    expect(blob).not.toMatch(/permanent/);
    // "Unlimited" survives only as a paid-tier plan quota (Studio titles),
    // never as free hosting or a perpetual-operation promise.
    expect(blob).not.toMatch(/unlimited free/);
    expect(blob).not.toMatch(/free unlimited/);
    expect(blob).not.toMatch(/unlimited hosting/);
  });

  it("bundles are positioned before any stored wallet", () => {
    const bundles = VIEWER_OPTIONS.find((o) => o.id === "bundles");
    expect(bundles).toBeDefined();
    expect(bundles!.features.join(" ").toLowerCase()).toMatch(/no stored balance/);
  });

  it("legal page: DMCA agent is one element, not full compliance", () => {
    const legal = readFileSync(join(__dirname, "..", "app", "legal", "page.tsx"), "utf8");
    expect(legal).toMatch(/one element of safe harbor/);
    expect(legal).toMatch(/registration alone does not confer immunity/);
    expect(legal).not.toMatch(/Maximum liability protection posture/);
  });
});
