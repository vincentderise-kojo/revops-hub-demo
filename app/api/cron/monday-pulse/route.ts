import { NextResponse } from "next/server";
import { loadDashboardData } from "@/lib/load-dashboard-state";
import {
  composePulseBlocks,
  isETTargetTime,
  sanityGate,
  alreadyPostedThisWeek,
} from "@/lib/monday-pulse";
import {
  postBlockKitMessage,
  dmUser,
  fetchChannelHistory,
} from "@/lib/slack-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHANNEL_ID = process.env.MONDAY_PULSE_CHANNEL_ID ?? "C0AMR6AS529"; // #weekly-pipeline-review

// Slack errors worth retrying — transient server-side or rate-limit signals.
// Everything else (invalid_blocks, channel_not_found, not_in_channel, etc.)
// is a hard failure that a retry won't fix.
const TRANSIENT_SLACK_ERRORS = new Set([
  "ratelimited",
  "service_unavailable",
  "internal_error",
  "request_timeout",
  "fatal_error",
]);

async function alertVincent(reason: string): Promise<void> {
  const userId = process.env.SLACK_ALERT_USER_ID;
  if (!userId) {
    console.error("[Monday Pulse] SLACK_ALERT_USER_ID not set — cannot DM.");
    return;
  }
  await dmUser(userId, `⚠️ Monday Pulse skipped — ${reason}`);
}

export async function GET(req: Request) {
  // 1. Verify bearer secret (Vercel Cron sends this header)
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2. DST-aware ET gate — both cron firings (13:30 and 14:30 UTC) hit here;
  //    only the one that lands at 9:30 ET should proceed. An authenticated
  //    operator can bypass with ?force=1 to trigger a manual send (useful for
  //    smoke testing and for recovering from a missed Monday).
  const url = new URL(req.url);
  const forceBypass = url.searchParams.get("force") === "1";
  if (!forceBypass && !isETTargetTime(new Date(), 9, 30, 15)) {
    return NextResponse.json({ ok: true, skipped: "off-window" });
  }

  try {
    // 3. Load state (using segmented.all — the full board-plan view)
    const { segmented } = await loadDashboardData();
    const state = segmented.all;

    // 4. Idempotency — have we already posted this week?
    //    Fail closed: if the history fetch errors (auth/scope issue), skip
    //    and alert rather than risk a double-post.
    let alreadyPosted: boolean;
    try {
      alreadyPosted = await alreadyPostedThisWeek(CHANNEL_ID, state.focusWeekLabel, fetchChannelHistory);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await alertVincent(`Idempotency check failed; skipping to avoid double-post: ${msg}`);
      return NextResponse.json({ ok: false, skipped: "idempotency-error", error: msg }, { status: 500 });
    }
    if (alreadyPosted) {
      return NextResponse.json({ ok: true, skipped: "already-posted" });
    }

    // 5. Sanity gate
    const gate = sanityGate(state);
    if (!gate.ok) {
      await alertVincent(gate.reason ?? "sanity gate failed");
      return NextResponse.json(
        { ok: false, skipped: "sanity", reason: gate.reason },
        { status: 500 },
      );
    }

    // 6. Compose + post. Retry once, but only on transient Slack errors.
    const { blocks, text } = composePulseBlocks(state);
    const result = await postBlockKitMessage(CHANNEL_ID, blocks, text);

    if (!result.ok) {
      if (result.error && TRANSIENT_SLACK_ERRORS.has(result.error)) {
        const retry = await postBlockKitMessage(CHANNEL_ID, blocks, text);
        if (!retry.ok) {
          await alertVincent(`Slack post failed after retry: ${retry.error}`);
          return NextResponse.json({ ok: false, error: retry.error }, { status: 500 });
        }
        return NextResponse.json({ ok: true, ts: retry.ts, retried: true, focusWeek: state.focusWeekLabel });
      }
      await alertVincent(`Slack post failed (non-transient): ${result.error}`);
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ts: result.ts, focusWeek: state.focusWeekLabel });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await alertVincent(`Handler threw: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
