import { describe, it, expect } from "vitest";
import { computeSpeedMetrics, computeStaleQualificationOpps, computeAdvancedOutPercent, computeQualifiedStaleness, computeSelfSetMonthlyCount, buildAeRosterFromQuotas, opportunityToAeOpp } from "./process-ae-performance";
import type { QuotaRecord } from "./types-sdr";
import type { AeOpp } from "./types-ae-performance";
import type { Opportunity } from "./types";

const SLA_HOURS = 48;
const NOW = new Date("2026-04-27T12:00:00Z");

function buildOpp(overrides: Partial<AeOpp>): AeOpp {
  return {
    oppId: "001",
    name: "Acme",
    owner: "Sarah",
    manager: "Sean Coyle",
    source: "Inbound",
    oppSetType: "AE Set - Inbound",
    stage: "Qualification",
    createdDate: new Date("2026-04-25T12:00:00Z"),
    closeDate: null,
    lastActivityDate: null,
    amount: 0,
    annualRevenue: 0,
    segment: "ENT",
    stageDurationDays: 0,
    ...overrides,
  };
}

describe("computeSpeedMetrics", () => {
  it("counts opps touched within SLA as success", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", createdDate: new Date("2026-04-25T12:00:00Z"), lastActivityDate: new Date("2026-04-25T20:00:00Z") }), // 8h
      buildOpp({ oppId: "2", createdDate: new Date("2026-04-25T12:00:00Z"), lastActivityDate: new Date("2026-04-26T12:00:00Z") }), // 24h
      buildOpp({ oppId: "3", createdDate: new Date("2026-04-25T12:00:00Z"), lastActivityDate: new Date("2026-04-28T12:00:00Z") }), // 72h — outside
    ];
    const result = computeSpeedMetrics(opps, SLA_HOURS, NOW);
    expect(result.pctWithinSla).toBeCloseTo(2 / 3);
    expect(result.successOppIds).toEqual(["1", "2"]);
    expect(result.failureOppIds).toEqual(["3"]);
  });

  it("treats null-activity opps still inside the SLA window as excluded (insufficient data)", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", createdDate: new Date("2026-04-27T06:00:00Z"), lastActivityDate: null }), // created 6h ago, no activity yet — excluded
      buildOpp({ oppId: "2", createdDate: new Date("2026-04-25T12:00:00Z"), lastActivityDate: new Date("2026-04-25T20:00:00Z") }), // success
    ];
    const result = computeSpeedMetrics(opps, SLA_HOURS, NOW);
    expect(result.denominator).toBe(1);
    expect(result.pctWithinSla).toBe(1);
    expect(result.excludedOppIds).toEqual(["1"]);
  });

  it("treats null-activity opps past the SLA window as failures", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", createdDate: new Date("2026-04-20T12:00:00Z"), lastActivityDate: null }), // 7 days ago, no touch
    ];
    const result = computeSpeedMetrics(opps, SLA_HOURS, NOW);
    expect(result.denominator).toBe(1);
    expect(result.pctWithinSla).toBe(0);
    expect(result.failureOppIds).toEqual(["1"]);
  });

  it("returns null pctWithinSla and N/A median when denominator is 0", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", createdDate: new Date("2026-04-27T06:00:00Z"), lastActivityDate: null }),
    ];
    const result = computeSpeedMetrics(opps, SLA_HOURS, NOW);
    expect(result.denominator).toBe(0);
    expect(result.pctWithinSla).toBeNull();
    expect(result.medianHoursToFirstTouch).toBeNull();
  });

  it("computes median hours-to-first-touch over only opps that have a Last Activity Date", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", createdDate: new Date("2026-04-25T12:00:00Z"), lastActivityDate: new Date("2026-04-25T16:00:00Z") }), // 4h
      buildOpp({ oppId: "2", createdDate: new Date("2026-04-25T12:00:00Z"), lastActivityDate: new Date("2026-04-26T00:00:00Z") }), // 12h
      buildOpp({ oppId: "3", createdDate: new Date("2026-04-25T12:00:00Z"), lastActivityDate: new Date("2026-04-26T12:00:00Z") }), // 24h
      buildOpp({ oppId: "4", createdDate: new Date("2026-04-27T06:00:00Z"), lastActivityDate: null }), // excluded
    ];
    const result = computeSpeedMetrics(opps, SLA_HOURS, NOW);
    expect(result.medianHoursToFirstTouch).toBe(12);
  });
});

describe("computeStaleQualificationOpps", () => {
  it("flags Qualification-stage opps with no activity in 7+ days", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", stage: "Qualification", lastActivityDate: new Date("2026-04-15T12:00:00Z") }), // 12 days stale
      buildOpp({ oppId: "2", stage: "Qualification", lastActivityDate: new Date("2026-04-25T12:00:00Z") }), // 2 days, fresh
      buildOpp({ oppId: "3", stage: "Discovery", lastActivityDate: new Date("2026-04-15T12:00:00Z") }), // not Qualification, excluded
      buildOpp({ oppId: "4", stage: "Qualification", lastActivityDate: null, createdDate: new Date("2026-04-15T12:00:00Z") }), // never touched, 12d old
    ];
    const result = computeStaleQualificationOpps(opps, 7, NOW);
    expect(result.staleOppIds).toEqual(["1", "4"]);
    expect(result.count).toBe(2);
  });

  it("treats opps with createdDate < threshold ago and no activity as not-yet-stale", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", stage: "Qualification", lastActivityDate: null, createdDate: new Date("2026-04-25T12:00:00Z") }), // 2d old, no activity
    ];
    const result = computeStaleQualificationOpps(opps, 7, NOW);
    expect(result.staleOppIds).toEqual([]);
    expect(result.count).toBe(0);
  });
});

describe("computeAdvancedOutPercent", () => {
  it("returns % of opps created N+ days ago that have advanced past Qualification", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", stage: "Discovery", createdDate: new Date("2026-04-15T12:00:00Z") }), // advanced
      buildOpp({ oppId: "2", stage: "Demo", createdDate: new Date("2026-04-15T12:00:00Z") }), // advanced
      buildOpp({ oppId: "3", stage: "Qualification", createdDate: new Date("2026-04-15T12:00:00Z") }), // not advanced
      buildOpp({ oppId: "4", stage: "Qualification", createdDate: new Date("2026-04-25T12:00:00Z") }), // too recent, excluded
    ];
    const result = computeAdvancedOutPercent(opps, 7, NOW);
    expect(result.denominator).toBe(3);
    expect(result.advancedOppIds).toEqual(["1", "2"]);
    expect(result.notAdvancedOppIds).toEqual(["3"]);
    expect(result.pctAdvanced).toBeCloseTo(2 / 3);
  });

  it("returns null pctAdvanced when denominator is 0", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", stage: "Qualification", createdDate: new Date("2026-04-25T12:00:00Z") }), // too recent
    ];
    const result = computeAdvancedOutPercent(opps, 7, NOW);
    expect(result.denominator).toBe(0);
    expect(result.pctAdvanced).toBeNull();
  });
});

describe("computeQualifiedStaleness", () => {
  const CLOSED_STAGES = ["Closed Won", "Closed Lost"];

  it("counts and percents stale open pipeline opps at the given threshold", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", stage: "Discovery", lastActivityDate: new Date("2026-04-10T12:00:00Z") }), // 17d stale
      buildOpp({ oppId: "2", stage: "Demo", lastActivityDate: new Date("2026-04-25T12:00:00Z") }),       // 2d, fresh
      buildOpp({ oppId: "3", stage: "Discovery", lastActivityDate: null, createdDate: new Date("2026-04-01T12:00:00Z") }), // 26d, never touched
      buildOpp({ oppId: "4", stage: "Closed Won", lastActivityDate: new Date("2026-04-10T12:00:00Z") }), // closed, excluded
    ];
    const result = computeQualifiedStaleness(opps, 14, NOW, CLOSED_STAGES);
    expect(result.count).toBe(2);
    expect(result.staleOppIds).toEqual(["1", "3"]);
    expect(result.totalOpen).toBe(3);
    expect(result.pctStale).toBeCloseTo(2 / 3);
  });

  it("returns null pctStale when there are zero open opps", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", stage: "Closed Won", lastActivityDate: new Date("2026-04-10T12:00:00Z") }),
    ];
    const result = computeQualifiedStaleness(opps, 14, NOW, CLOSED_STAGES);
    expect(result.totalOpen).toBe(0);
    expect(result.count).toBe(0);
    expect(result.pctStale).toBeNull();
  });
});

describe("computeSelfSetMonthlyCount", () => {
  it("counts opps with source AE Self-Set created in the current calendar month", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", source: "AE Self-Set", createdDate: new Date("2026-04-05T12:00:00Z") }), // April
      buildOpp({ oppId: "2", source: "AE Self-Set", createdDate: new Date("2026-04-25T12:00:00Z") }), // April
      buildOpp({ oppId: "3", source: "AE Self-Set", createdDate: new Date("2026-03-25T12:00:00Z") }), // March, excluded
      buildOpp({ oppId: "4", source: "Inbound",     createdDate: new Date("2026-04-25T12:00:00Z") }), // wrong source, excluded
    ];
    const result = computeSelfSetMonthlyCount(opps, NOW);
    expect(result.count).toBe(2);
    expect(result.oppIds).toEqual(["1", "2"]);
  });

  it("returns 0 when no qualifying opps", () => {
    const opps: AeOpp[] = [
      buildOpp({ oppId: "1", source: "Inbound", createdDate: new Date("2026-04-25T12:00:00Z") }),
    ];
    const result = computeSelfSetMonthlyCount(opps, NOW);
    expect(result.count).toBe(0);
    expect(result.oppIds).toEqual([]);
  });
});

describe("buildAeRosterFromQuotas", () => {
  function quota(overrides: Partial<QuotaRecord>): QuotaRecord {
    return {
      id: "Q001",
      quotaAmount: 25000,
      quotaQuantity: 0,
      forecastingType: "AE",
      isActive: true,
      isRamping: false,
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-30"),
      ownerName: "Sarah",
      ownerManager: "Sean Coyle",
      ...overrides,
    };
  }

  it("returns active AEs for the month, mapped to segment via manager, sorted, with managers + SDRs + inactives + orphans excluded", () => {
    const records: QuotaRecord[] = [
      quota({ id: "1", ownerName: "Sarah",   ownerManager: "Sean Coyle" }),     // ENT
      quota({ id: "2", ownerName: "Garrett", ownerManager: "Sean Coyle" }),     // ENT
      quota({ id: "3", ownerName: "Mike",    ownerManager: "Jeremy Taylor" }),  // MM
      quota({ id: "4", ownerName: "Pat",     ownerManager: "Jared Moor" }),     // MM
      quota({ id: "5", ownerName: "Orphan",  ownerManager: "Unknown Mgr" }),    // excluded — no segment mapping
      quota({ id: "6", ownerName: "Inactive", isActive: false }),               // excluded — not active
      quota({ id: "7", ownerName: "OldRamp", startDate: new Date("2026-01-01"), endDate: new Date("2026-01-31") }), // excluded — month doesn't overlap
      quota({ id: "8", ownerName: "Sean Coyle", ownerManager: "Sean Coyle", forecastingType: "AE Manager" }), // excluded — manager (appears as ownerManager elsewhere)
      quota({ id: "9", ownerName: "Sadie",   ownerManager: "Will Olson", forecastingType: "SDR" }),           // excluded — SDR
    ];
    const roster = buildAeRosterFromQuotas(records, "2026-04");
    expect(roster).toEqual([
      { ae: "Garrett", segment: "ENT" },
      { ae: "Mike",    segment: "MM"  },
      { ae: "Pat",     segment: "MM"  },
      { ae: "Sarah",   segment: "ENT" },
    ]);
  });

  it("returns empty roster when there are no active AE records for the month", () => {
    const records: QuotaRecord[] = [
      quota({ ownerName: "Sarah", isActive: false }),
    ];
    expect(buildAeRosterFromQuotas(records, "2026-04")).toEqual([]);
  });

  it("dedupes when an AE has multiple active quota rows in the same month", () => {
    const records: QuotaRecord[] = [
      quota({ id: "a", ownerName: "Sarah", ownerManager: "Sean Coyle" }),
      quota({ id: "b", ownerName: "Sarah", ownerManager: "Sean Coyle", quotaAmount: 30000 }),
    ];
    expect(buildAeRosterFromQuotas(records, "2026-04")).toEqual([
      { ae: "Sarah", segment: "ENT" },
    ]);
  });
});

describe("opportunityToAeOpp", () => {
  it("maps Opportunity → AeOpp using the real Created Date", () => {
    const opp: Opportunity = {
      oppId: "001ABC",
      name: "Acme",
      owner: "Sarah",
      sdrOwner: "",
      accountName: "Acme Corp",
      amount: 50000,
      createdDate: new Date("2026-04-10T12:00:00Z"),
      discoveryDate: new Date("2026-04-15T12:00:00Z"),
      closeDate: null,
      lastActivityDate: new Date("2026-04-20T12:00:00Z"),
      accountLastActivityDate: null,
      annualRevenue: 1000000,
      manager: "Sean Coyle",
      oppSetType: "AE - Self Set",
      stage: "Discovery",
      segment: "ENT",
      source: "AE Self-Set",
      industry: "",
      stageDurationDays: 5,
      lastStageChangeDate: null,
    };
    const aeOpp = opportunityToAeOpp(opp);
    expect(aeOpp.oppId).toBe("001ABC");
    expect(aeOpp.owner).toBe("Sarah");
    expect(aeOpp.source).toBe("AE Self-Set");
    expect(aeOpp.createdDate.toISOString()).toBe("2026-04-10T12:00:00.000Z"); // real Created Date, not the discoveryDate proxy
    expect(aeOpp.lastActivityDate?.toISOString()).toBe("2026-04-20T12:00:00.000Z");
    expect(aeOpp.segment).toBe("ENT");
  });
});
