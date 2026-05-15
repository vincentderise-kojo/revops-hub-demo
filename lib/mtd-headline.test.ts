import { describe, it, expect } from "vitest";
import { computeMtdHeadline } from "./mtd-headline";
import type { MtdMonth } from "./types";

function buildMonth(): MtdMonth {
  // Component targets sum to $1,898,250 — but parent monthlyTarget is the
  // authoritative board-committed value $1,898,274. Tests verify the helper
  // prefers monthlyTarget for the "board plan" label.
  // Top-level totalCreated is intentionally 0 — the helper reads from byGroup,
  // never from the parent's totalCreated; tests should not assert against it.
  return {
    month: "April",
    year: 2026,
    monthlyTarget: 1_898_274,
    weeks: [],
    totalCreated: 0,
    pctHit: 0,
    gapToTarget: 0,
    byGroup: {
      bdr:   { totalCreated: 600_000, monthlyTarget: 1_039_274, weeks: [] },
      field: { totalCreated: 200_000, monthlyTarget: 378_976,   weeks: [] },
      perf:  { totalCreated: 250_000, monthlyTarget: 480_000,   weeks: [] },
      ae:    { totalCreated: 80_000,  monthlyTarget: 189_827,   weeks: [] },
    },
    aeUpsideTarget: 189_827,
  };
}

describe("computeMtdHeadline", () => {
  it("All 4 active → board plan label, AE excluded from primaryCreated, AE in upside callout", () => {
    const m = buildMonth();
    const h = computeMtdHeadline(new Set(["bdr", "field", "perf", "ae"]), m);
    expect(h.primaryCreated).toBe(600_000 + 200_000 + 250_000); // $1.05M, AE excluded
    expect(h.primaryTarget).toBe(1_898_274);                    // monthlyTarget (authoritative)
    expect(h.primaryLabel).toBe("board plan");
    expect(h.upsideAmount).toBe(80_000);                         // AE created (upside)
    expect(h.upsideLabel).toBe("AE upside");
    expect(h.filteredGapToTarget).toBe(1_898_274 - 1_050_000);   // $848,274 — AE never reduces this
  });

  it("BDR + Field + Perf (no AE) → board plan label, no upside", () => {
    const m = buildMonth();
    const h = computeMtdHeadline(new Set(["bdr", "field", "perf"]), m);
    expect(h.primaryCreated).toBe(1_050_000);
    expect(h.primaryTarget).toBe(1_898_274);                    // monthlyTarget
    expect(h.primaryLabel).toBe("board plan");
    expect(h.upsideAmount).toBeNull();
    expect(h.upsideLabel).toBeNull();
    expect(h.filteredGapToTarget).toBe(1_898_274 - 1_050_000);
  });

  it("BDR only → target label, primaryTarget = byGroup BDR target", () => {
    const m = buildMonth();
    const h = computeMtdHeadline(new Set(["bdr"]), m);
    expect(h.primaryCreated).toBe(600_000);
    expect(h.primaryTarget).toBe(1_039_274);
    expect(h.primaryLabel).toBe("target");
    expect(h.upsideAmount).toBeNull();
    expect(h.filteredGapToTarget).toBe(1_039_274 - 600_000);
  });

  it("AE only → AE is the primary metric (not upside)", () => {
    const m = buildMonth();
    const h = computeMtdHeadline(new Set(["ae"]), m);
    expect(h.primaryCreated).toBe(80_000);
    expect(h.primaryTarget).toBe(189_827);
    expect(h.primaryLabel).toBe("AE upside");
    expect(h.upsideAmount).toBeNull();
    expect(h.filteredGapToTarget).toBe(189_827 - 80_000);
  });

  it("BDR + AE → target label primary (BDR only), AE in upside callout, AE excluded from primaryCreated", () => {
    const m = buildMonth();
    const h = computeMtdHeadline(new Set(["bdr", "ae"]), m);
    expect(h.primaryCreated).toBe(600_000);     // AE NOT included
    expect(h.primaryTarget).toBe(1_039_274);    // BDR target only
    expect(h.primaryLabel).toBe("target");
    expect(h.upsideAmount).toBe(80_000);
    expect(h.upsideLabel).toBe("AE upside");
    expect(h.filteredGapToTarget).toBe(1_039_274 - 600_000);  // AE never reduces this
  });
});
