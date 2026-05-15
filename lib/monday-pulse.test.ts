import { describe, it, expect } from "vitest";
import { isETTargetTime } from "./monday-pulse";
import { sanityGate } from "./monday-pulse";
import { composePulseBlocks } from "./monday-pulse";
import type { DashboardState } from "./types";

function makeState(overrides: Partial<DashboardState["scoreboard"]["blended"]> = {}): DashboardState {
  return {
    focusWeekLabel: "Apr 13–19",
    focusWeekStart: new Date("2026-04-13"),
    focusWeekEnd: new Date("2026-04-19"),
    latestDiscoveryDate: new Date("2026-04-19"),
    renderedAt: new Date("2026-04-20"),
    scoreboard: {
      blended: {
        target: 438_000,
        created: 224_000,
        gap: -214_000,
        pctHit: 51,
        status: "red",
        oppCount: 5,
        ...overrides,
      },
      groups: {
        bdrOutbound: { group: "SDR", displayLabel: "BDR Outbound", owner: "Sadie", color: "#000", target: 240_000, created: 0, gap: -240_000, pctHit: 0, oppCount: 0, status: "red" },
        fieldMarketing: { group: "Marketing", displayLabel: "Field Marketing", owner: "Ali", color: "#000", target: 50_000, created: 116_000, gap: 66_000, pctHit: 232, oppCount: 2, status: "green" },
        perfMarketing: { group: "Demand Gen", displayLabel: "Perf Marketing", owner: "Alex", color: "#000", target: 110_000, created: 20_000, gap: -90_000, pctHit: 18, oppCount: 1, status: "red" },
      },
      aeUpside: { label: "AE Self-Set", owner: "Jeremy + Sean", created: 49_000, oppCount: 2 },
    },
    // Minimal stubs for fields we don't use in sanityGate:
    pacing: { weeks: [], quarterSummary: { quarterLabel: "Q2'26", quarterGoal: 0, actualToDate: 0, weeksElapsed: 0, weeksRemaining: 0, projectedEnd: 0, paceStatus: "onPace" } },
    coverageDiagnostic: { impliedByMonth: {}, quotaByMonth: {}, impliedQ2Avg: 0, historicalBaseline: 5.8 },
    meta: { lastLoadedGoalMonth: null, showRolloverBanner: false, nextUnloadedMonthKey: null },
    mtd: {
      current: { month: "April", totalCreated: 937_000, monthlyTarget: 1_900_000, pctHit: 49, weeks: [{ created: 300_000 } as any, { created: 400_000 } as any, { created: 237_000 } as any] } as any,
      previous: { month: "March", totalCreated: 2_900_000, monthlyTarget: 4_000_000, pctHit: 73, weeks: [] } as any,
    },
    deals: [],
    execSummary: { weekNarrative: "", mtdNarrative: "", gapNarrative: "" },
  };
}

describe("isETTargetTime", () => {
  it("returns true at exactly 9:30 ET in EDT (summer)", () => {
    // 2026-04-20 13:30 UTC == 09:30 EDT
    const now = new Date("2026-04-20T13:30:00Z");
    expect(isETTargetTime(now, 9, 30, 15)).toBe(true);
  });

  it("returns true at exactly 9:30 ET in EST (winter)", () => {
    // 2026-01-19 14:30 UTC == 09:30 EST
    const now = new Date("2026-01-19T14:30:00Z");
    expect(isETTargetTime(now, 9, 30, 15)).toBe(true);
  });

  it("returns false one hour early in EDT (cron fire at 12:30 UTC)", () => {
    const now = new Date("2026-04-20T12:30:00Z");
    expect(isETTargetTime(now, 9, 30, 15)).toBe(false);
  });

  it("returns false one hour early in EST (cron fire at 13:30 UTC)", () => {
    const now = new Date("2026-01-19T13:30:00Z");
    expect(isETTargetTime(now, 9, 30, 15)).toBe(false);
  });

  it("returns true within the tolerance window (9:44 ET)", () => {
    const now = new Date("2026-04-20T13:44:00Z");
    expect(isETTargetTime(now, 9, 30, 15)).toBe(true);
  });

  it("returns false outside the tolerance window (9:46 ET)", () => {
    const now = new Date("2026-04-20T13:46:00Z");
    expect(isETTargetTime(now, 9, 30, 15)).toBe(false);
  });
});

describe("sanityGate", () => {
  it("passes a normal state", () => {
    expect(sanityGate(makeState())).toEqual({ ok: true });
  });

  it("fails when oppCount is zero", () => {
    const result = sanityGate(makeState({ oppCount: 0 }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/zero opps/i);
  });

  it("fails when an owner group exceeds 10x its target", () => {
    const state = makeState();
    state.scoreboard.groups.bdrOutbound.created = state.scoreboard.groups.bdrOutbound.target * 11;
    const result = sanityGate(state);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/10x|runaway|outlier/i);
  });
});

describe("composePulseBlocks", () => {
  it("produces a header with the focus week label", () => {
    const { blocks } = composePulseBlocks(makeState());
    const header = blocks.find((b) => b.type === "header") as any;
    expect(header.text.text).toContain("Apr 13–19");
  });

  it("includes blended created, target, pct, and gap in the headline section", () => {
    const { blocks } = composePulseBlocks(makeState());
    const serialized = JSON.stringify(blocks);
    expect(serialized).toContain("$224K");
    expect(serialized).toContain("$438K");
    expect(serialized).toContain("51%");
    expect(serialized).toContain("$214K");
  });

  it("includes AE Self-Set upside when greater than zero", () => {
    const { blocks } = composePulseBlocks(makeState());
    expect(JSON.stringify(blocks)).toMatch(/AE Self-Set.*\$49K/);
  });

  it("omits the AE Self-Set upside line when created is zero", () => {
    const state = makeState();
    state.scoreboard.aeUpside.created = 0;
    const { blocks } = composePulseBlocks(state);
    expect(JSON.stringify(blocks)).not.toMatch(/AE Self-Set.*\$0/);
  });

  it("includes all three owner groups as fields", () => {
    const { blocks } = composePulseBlocks(makeState());
    const serialized = JSON.stringify(blocks);
    expect(serialized).toContain("BDR Outbound");
    expect(serialized).toContain("Field Marketing");
    expect(serialized).toContain("Perf Marketing");
  });

  it("includes MTD line without MoM comparison", () => {
    const { blocks } = composePulseBlocks(makeState());
    const serialized = JSON.stringify(blocks);
    expect(serialized).toMatch(/April MTD/);
    expect(serialized).not.toMatch(/March closed/); // MoM explicitly excluded
  });

  it("includes a 'View Dashboard' button linking to the app", () => {
    const { blocks } = composePulseBlocks(makeState());
    const actions = blocks.find((b) => b.type === "actions") as any;
    expect(actions.elements[0].url).toBe("https://pipeline-pulse-app.vercel.app/");
    expect(actions.elements[0].text.text).toContain("View Dashboard");
  });

  it("includes an 'Initiatives Tracker' button linking to the sheet", () => {
    const { blocks } = composePulseBlocks(makeState());
    const actions = blocks.find((b) => b.type === "actions") as any;
    expect(actions.elements[1].url).toContain("docs.google.com/spreadsheets");
    expect(actions.elements[1].text.text).toContain("Initiatives Tracker");
  });

  it("returns a plain-text fallback that Slack uses for notifications", () => {
    const { text } = composePulseBlocks(makeState());
    expect(text).toContain("Pipeline Pulse");
    expect(text).toContain("Apr 13–19");
  });
});

import { alreadyPostedThisWeek } from "./monday-pulse";
import type { SlackMessage } from "./slack-client";

describe("alreadyPostedThisWeek", () => {
  it("returns true when a bot message contains the focus week header", async () => {
    const fakeFetch = async (): Promise<SlackMessage[]> => [
      { type: "message", bot_id: "B1", text: "Pipeline Pulse — Week of Apr 13–19", ts: "1" },
    ];
    expect(await alreadyPostedThisWeek("C1", "Apr 13–19", fakeFetch)).toBe(true);
  });

  it("returns false when no message matches", async () => {
    const fakeFetch = async (): Promise<SlackMessage[]> => [
      { type: "message", bot_id: "B1", text: "Pipeline Pulse — Week of Apr 6–12", ts: "1" },
    ];
    expect(await alreadyPostedThisWeek("C1", "Apr 13–19", fakeFetch)).toBe(false);
  });

  it("returns false when the channel is empty", async () => {
    const fakeFetch = async (): Promise<SlackMessage[]> => [];
    expect(await alreadyPostedThisWeek("C1", "Apr 13–19", fakeFetch)).toBe(false);
  });

  it("ignores non-bot messages that happen to contain the header", async () => {
    const fakeFetch = async (): Promise<SlackMessage[]> => [
      { type: "message", text: "Pipeline Pulse — Week of Apr 13–19", ts: "1" }, // no bot_id
    ];
    expect(await alreadyPostedThisWeek("C1", "Apr 13–19", fakeFetch)).toBe(false);
  });

  it("ignores bot messages that mention 'Week of X' without the emoji prefix", async () => {
    // Another integration shouldn't be able to spoof the idempotency marker.
    const fakeFetch = async (): Promise<SlackMessage[]> => [
      { type: "message", bot_id: "B2", text: "Zapier: Week of Apr 13–19 summary ready", ts: "1" },
    ];
    expect(await alreadyPostedThisWeek("C1", "Apr 13–19", fakeFetch)).toBe(false);
  });
});
