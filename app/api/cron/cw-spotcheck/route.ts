/**
 * CW Spot-Check daily cron.
 *
 * Pulls recently closed-won New Business opportunities from Salesforce
 * (via JWT bearer flow against the "Kojo CW Spot-Check" External Client App),
 * runs each through the Claude synthesizer against the signed contract PDF,
 * and posts a Block Kit message per flagged opp to Slack.
 *
 * Trigger modes:
 *   - GET ?oppId=<id>  → run single opp (manual backfill / debugging / ZEN demo)
 *   - GET (no args)    → scan last 24h of CW New Business opps and post each
 *
 * Auth: Bearer CRON_SECRET (same pattern as the other Vercel cron routes).
 *
 * Slack destination:
 *   - If CW_SPOTCHECK_CHANNEL_ID env is set → post to that channel.
 *   - Else → DM the user in SLACK_ALERT_USER_ID. (First-run default for QA.)
 */

import { NextResponse } from "next/server";
import {
  getOpportunity,
  getQuote,
  getOpportunityLineItems,
  getQuoteLineItems,
  getOpportunityHistory,
  getContractPdfForQuote,
  getInstanceUrl,
  findRecentClosedWonNewBusinessOpps,
  buildOppUrl,
  buildContentVersionUrl,
} from "@/lib/cw-spotcheck/sfdc";
import { synthesizeSpotCheck } from "@/lib/cw-spotcheck/synthesizer";
import { buildSlackBlocks } from "@/lib/cw-spotcheck/slack-format";
import { postBlockKitMessage, dmUserBlocks } from "@/lib/slack-client";
import type { SpotCheckBundle, SpotCheckResult } from "@/lib/cw-spotcheck/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SCAN_WINDOW_HOURS = 24;

async function spotCheckOne(oppId: string, instanceUrl: string): Promise<SpotCheckResult> {
  const opp = await getOpportunity(oppId);
  const quote = opp.SyncedQuoteId ? await getQuote(opp.SyncedQuoteId) : null;
  const oppLineItems = await getOpportunityLineItems(oppId);
  const quoteLineItems = opp.SyncedQuoteId ? await getQuoteLineItems(opp.SyncedQuoteId) : [];
  const oppHistory = await getOpportunityHistory(oppId);
  const contractPdf = opp.SyncedQuoteId ? await getContractPdfForQuote(opp.SyncedQuoteId) : null;

  const bundle: SpotCheckBundle = { opp, quote, oppLineItems, quoteLineItems, oppHistory, contractPdf };
  const checks = await synthesizeSpotCheck(bundle);

  return {
    oppId: opp.Id,
    oppName: opp.Name,
    accountName: null, // not pulled; reserved for future Account join
    owner: opp.Opp_Owner_Name__c ?? "(unknown)",
    manager: opp.Rep_Manager__c,
    amount: opp.Amount,
    closeDate: opp.CloseDate,
    oppUrl: buildOppUrl(instanceUrl, opp.Id),
    pdfFilename: contractPdf?.title ?? null,
    pdfDownloadUrl: contractPdf ? buildContentVersionUrl(instanceUrl, contractPdf.contentVersionId) : null,
    checks,
    generatedAt: new Date().toISOString(),
  };
}

async function postResultToSlack(result: SpotCheckResult): Promise<{ ok: boolean; error?: string }> {
  const { blocks, text } = buildSlackBlocks(result);
  const channelId = process.env.CW_SPOTCHECK_CHANNEL_ID;
  if (channelId) {
    const r = await postBlockKitMessage(channelId, blocks as never[], text);
    return { ok: r.ok, error: r.error };
  }
  const userId = process.env.SLACK_ALERT_USER_ID;
  if (!userId) return { ok: false, error: "neither CW_SPOTCHECK_CHANNEL_ID nor SLACK_ALERT_USER_ID is set" };
  const r = await dmUserBlocks(userId, blocks, text);
  return { ok: r.ok, error: r.error };
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const oppIdArg = url.searchParams.get("oppId");
  const dryRun = url.searchParams.get("dry") === "1";

  const startedAt = new Date().toISOString();
  console.log(`[cw-spotcheck] start ${startedAt} oppId=${oppIdArg ?? "(scan)"} dry=${dryRun}`);

  try {
    const instanceUrl = await getInstanceUrl();
    const oppIds = oppIdArg ? [oppIdArg] : await findRecentClosedWonNewBusinessOpps(SCAN_WINDOW_HOURS);

    if (oppIds.length === 0) {
      console.log("[cw-spotcheck] no CW New Business opps in last 24h — silent");
      return NextResponse.json({ ok: true, count: 0, message: "no CW opps in window" });
    }

    const results: Array<{ oppId: string; ok: boolean; fails: number; warns: number; error?: string }> = [];
    for (const id of oppIds) {
      try {
        const result = await spotCheckOne(id, instanceUrl);
        const fails = result.checks.filter((c) => c.severity === "fail").length;
        const warns = result.checks.filter((c) => c.severity === "warn").length;

        if (!dryRun) {
          const post = await postResultToSlack(result);
          results.push({ oppId: id, ok: post.ok, fails, warns, error: post.error });
        } else {
          results.push({ oppId: id, ok: true, fails, warns });
        }
        console.log(`[cw-spotcheck] ${id}: ${fails} fail, ${warns} warn`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cw-spotcheck] ${id} failed:`, msg);
        results.push({ oppId: id, ok: false, fails: 0, warns: 0, error: msg });
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      dryRun,
      results,
    });
  } catch (err) {
    console.error("[cw-spotcheck] fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
