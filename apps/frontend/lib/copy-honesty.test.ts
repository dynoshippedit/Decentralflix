import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Update-20 copy sweep guard: no frontend surface may promise perpetual
 * operation ("permanent access", "own forever", ...). Streaming access is a
 * licensed entitlement; the only sanctioned "permanent" term is the
 * license-table's "permanent download (where the filmmaker allows it)", plus
 * Arweave/Filecoin *storage* permanence facts. See lib/licensing.ts.
 */

const FRONTEND = path.resolve(__dirname, "..");

// Literal strings that are allowed to remain (storage facts, the sanctioned
// license-table term, internal identifiers, negative/deferred mentions).
const ALLOWLIST = [
  "permanent download", // license-table term: "where the filmmaker allows it"
  "Arweave first (permanent)",
  "PERMANENT STORAGE",
  "live forever on Arweave",
  "pinned to Arweave forever",
  "Permanent, distributed",
  "Permanent metadata proofs",
  "isPermanentPass", // internal React prop name, not user-facing
  "mintPermanentPass", // Solidity function name, not user-facing
];

// Banned user-facing perpetuity promises (case-insensitive).
const BANNED: RegExp[] = [
  /permanent access/i,
  /own (it )?forever/i,
  /watch forever/i,
  /once,?\s*forever/i,
  /permanent film ownership/i,
  /permanently (visible|yours)/i,
  /live here forever/i,
  /permanent here/i,
  /permanent viewing license/i,
  /get permanent access/i,
  /['"]permanent pass['"]/i, // user-facing label; isPermanentPass identifier is allowed
  /ownership is permanent/i,
  /your voice .* because you own permanent/i,
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function stripped(content: string): string {
  let out = content;
  for (const allowed of ALLOWLIST) {
    out = out.split(allowed).join("");
  }
  return out;
}

describe("copy honesty: no perpetual-operation promises", () => {
  const files = sourceFiles(FRONTEND).filter(
    (f) =>
      !f.endsWith("lib/licensing.ts") && // the standard itself
      !f.includes("/pricing/") // covered by the deferred-feature honesty test
  );

  it("scans a non-trivial set of frontend sources", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("no banned perpetuity promise appears in any scanned source", () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = stripped(fs.readFileSync(file, "utf8"));
      for (const pattern of BANNED) {
        const m = content.match(pattern);
        if (m) {
          violations.push(
            `${path.relative(FRONTEND, file)} :: ${pattern} :: ${JSON.stringify(m[0].slice(0, 80))}`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("the license table still sanctions the only 'permanent' offer term", () => {
    const licensing = fs.readFileSync(path.join(FRONTEND, "lib/licensing.ts"), "utf8");
    expect(licensing).toMatch(/Permanent download \(where the filmmaker allows it\)/);
    expect(licensing).toMatch(/no promise of perpetual operation/);
  });
});
