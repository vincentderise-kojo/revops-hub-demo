/**
 * Refresh the Pulse Endgame inspection cache.
 *
 * Vercel cron hits this Monday 6am ET. Pulls last-week open opps from the
 * Pulse Sheet, queries Endgame MCP for engagement on each, runs the Claude
 * synthesizer with the leader_deal_inspection skill, writes the JSON to
 * Vercel Blob at inspections/latest.json (stable URL).
 *
 * Manual trigger for debugging: GET /api/cron/refresh-inspections?force=1
 * with the same Bearer CRON_SECRET header.
 */

import { NextResponse } from "next/server";
import Papa from "papaparse";
import { put } from "@vercel/blob";
import {
  endgameLookupOpps,
  endgameInteractionHistory,
  closeEndgameClient,
  type OppForInspection,
} from "@/lib/endgame-client";
import { synthesizeInspection } from "@/lib/inspection-synthesizer";
import type { EndgameInspection, InspectionCache } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SHEET_ID = "139f4amjRpd-CuQwXfjCJ1oYJ4vbda68GdsSF7C3q6KU";
const PIPELINE_GID = "1815244803";
const PULSE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${PIPELINE_GID}`;
const BLOB_PATHNAME = "inspections/latest.json";
const MAX_OPPS = 10;
const ENDGAME_USER_ID = "005Rk000006xVCPIA2";  // Vincent DeRise — used for query_data attribution
const ENGAGEMENT_WINDOW_DAYS = 60;
const SYNTHESIS_CONCURRENCY = 3;  // Anthropic prompt cache benefits from sequential-ish ordering; 3 keeps cron <5min
const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Unable to Qualify", "Disqualified"]);

interface PulseSheetRow {
  "Opportunity Name"?: string;
  "Opportunity Owner"?: string;
  "Account Name"?: string;
  Amount?: string;
  "Annual Revenue"?: string;
  Stage?: string;
  "Opportunity ID (18 Char)"?: string;
  "Discovery Date"?: string;
  Segment?: string;
}

function getLastWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + diffToMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(lastMonday), end: fmt(lastSunday) };
}

function normalizeSheetDate(s: string | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return trimmed;
}

async function fetchLastWeekOpps(): Promise<OppForInspection[]> {
  const res = await fetch(PULSE_SHEET_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const csv = await res.text();
  const parsed = Papa.parse<PulseSheetRow>(csv, { header: true, skipEmptyLines: true });

  const { start, end } = getLastWeekRange();

  const rows = parsed.data
    .map((r) => {
      const discovery = normalizeSheetDate(r["Discovery Date"]);
      const oppId = r["Opportunity ID (18 Char)"]?.trim();
      const amount = Number(r.Amount ?? 0);
      const stage = (r.Stage ?? "").trim();
      if (!oppId || !discovery || !Number.isFinite(amount)) return null;
      if (discovery < start || discovery > end) return null;
      if (CLOSED_STAGES.has(stage)) return null;
      if (amount <= 0) return null;
      return {
        oppId,
        oppName: (r["Opportunity Name"] ?? "").trim(),
        accountName: (r["Account Name"] ?? "").trim(),
        amount,
        stage,
        discoveryDate: discovery,
        owner: (r["Opportunity Owner"] ?? "").trim(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, MAX_OPPS);

  if (rows.length === 0) return [];

  const ctx = {
    goal: "Refresh the Pulse weekly inspection cache",
    task: "Resolve account IDs and authoritative fields for the top last-week open opps",
    journey: "Vercel cron triggered refresh; fetched Pulse Sheet, filtered to last-week open opps, now resolving via Endgame",
  };

  const resolved = await endgameLookupOpps(
    ENDGAME_USER_ID,
    rows.map((r) => r.oppId),
    ctx
  );

  // Endgame's data may differ slightly from the Sheet (owner display name,
  // exact stage). The Sheet is canonical for the UI; merge Endgame's
  // account_id into the Sheet rows.
  const sheetByOpp = new Map(rows.map((r) => [r.oppId, r]));
  return resolved
    .map((e): OppForInspection | null => {
      const sheet = sheetByOpp.get(e.opportunityId);
      if (!sheet) return null;
      return {
        opportunityId: sheet.oppId,
        opportunityName: sheet.oppName || e.opportunityName,
        accountId: e.accountId,
        accountName: sheet.accountName || e.accountName,
        amount: sheet.amount,
        stage: sheet.stage,
        discoveryDate: sheet.discoveryDate,
        owner: sheet.owner || e.owner,
      };
    })
    .filter((x): x is OppForInspection => x !== null);
}

async function inspectOne(opp: OppForInspection): Promise<{ oppId: string; inspection: EndgameInspection } | { oppId: string; error: string }> {
  try {
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - ENGAGEMENT_WINDOW_DAYS);
    const ctx = {
      goal: "Refresh the Pulse weekly inspection cache",
      task: `Inspect ${opp.opportunityName} ($${opp.amount.toLocaleString()}, ${opp.stage})`,
      journey: "Vercel cron; engagement pull for one opp in the last-week cohort",
    };
    const engagement = await endgameInteractionHistory(opp.accountId, afterDate.toISOString().slice(0, 10), ctx);
    const synth = await synthesizeInspection(opp, engagement, ENGAGEMENT_WINDOW_DAYS);
    const inspection: EndgameInspection = {
      oppId: opp.opportunityId,
      oppName: opp.opportunityName,
      accountName: opp.accountName,
      amount: opp.amount,
      stage: opp.stage,
      discoveryDate: opp.discoveryDate,
      owner: opp.owner,
      ...synth,
    };
    return { oppId: opp.opportunityId, inspection };
  } catch (err) {
    return { oppId: opp.opportunityId, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runConcurrent<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  console.log(`[refresh-inspections] start ${startedAt}`);

  try {
    const opps = await fetchLastWeekOpps();
    console.log(`[refresh-inspections] resolved ${opps.length} last-week opps`);

    if (opps.length === 0) {
      return NextResponse.json({ ok: true, message: "No last-week opps to inspect", count: 0 });
    }

    const results = await runConcurrent(opps, SYNTHESIS_CONCURRENCY, inspectOne);

    const inspections: Record<string, EndgameInspection> = {};
    const errors: Array<{ oppId: string; error: string }> = [];
    for (const r of results) {
      if ("inspection" in r) inspections[r.oppId] = r.inspection;
      else errors.push(r);
    }

    const cache: InspectionCache = {
      generatedAt: new Date().toISOString(),
      source: "Endgame MCP (cron) — Pulse Sheet IDs",
      note: `Auto-refreshed by Vercel cron. Last-week (open, discovered Mon-Sun) top ${MAX_OPPS} by amount. ${Object.keys(inspections).length} succeeded${errors.length > 0 ? `, ${errors.length} errored` : ""}.`,
      priorityRule: "lastWeekTopByAmount",
      inspections,
    };

    const blob = await put(BLOB_PATHNAME, JSON.stringify(cache, null, 2), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
    });

    console.log(`[refresh-inspections] wrote ${Object.keys(inspections).length} inspections to ${blob.url}`);

    return NextResponse.json({
      ok: true,
      url: blob.url,
      count: Object.keys(inspections).length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[refresh-inspections] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  } finally {
    await closeEndgameClient().catch(() => undefined);
  }
}
