import type { DashboardState } from "./types";
import { fmtK } from "./format";
import type { SlackMessage } from "./slack-client";

export interface GateResult {
  ok: boolean;
  reason?: string;
}

/**
 * Pre-send sanity check on the dashboard state. Returns { ok: false, reason }
 * when the numbers look like stale or corrupted data.
 */
export function sanityGate(state: DashboardState): GateResult {
  const { blended, groups } = state.scoreboard;

  if (blended.oppCount === 0) {
    return { ok: false, reason: "Sanity gate: zero opps created last week (suggests stale data)." };
  }

  const groupList = [groups.bdrOutbound, groups.fieldMarketing, groups.perfMarketing];
  for (const g of groupList) {
    if (g.target > 0 && g.created > g.target * 10) {
      return {
        ok: false,
        reason: `Sanity gate: ${g.displayLabel} created ${g.created} exceeds 10x its target ${g.target} (outlier).`,
      };
    }
  }

  return { ok: true };
}

/**
 * Returns true if `now` is within `toleranceMin` minutes after the target
 * hour:minute in America/New_York, handling DST transparently.
 */
export function isETTargetTime(
  now: Date,
  targetHour: number,
  targetMin: number,
  toleranceMin: number
): boolean {
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = etFormatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);

  // Intl returns "24" for midnight in some environments — normalize.
  const etHour = hour === 24 ? 0 : hour;

  const totalNow = etHour * 60 + minute;
  const totalTarget = targetHour * 60 + targetMin;
  const delta = totalNow - totalTarget;

  return delta >= 0 && delta <= toleranceMin;
}

const WEEKS_PER_MONTH = 4.33;
const DASHBOARD_URL = "https://pipeline-pulse-app.vercel.app/";
const INITIATIVES_TRACKER_URL = "https://docs.google.com/spreadsheets/d/14KUMyV6UXWrRlTe-Of-TbKzQtFTnzpIztGI_kO8T5rE/edit?gid=0#gid=0";

function groupField(label: string, created: number, target: number, pctHit: number): string {
  return `*${label}*\n${fmtK(created)} / ${fmtK(target)}  ·  ${Math.round(pctHit)}%`;
}

function mtdLine(state: DashboardState): string {
  const cur = state.mtd.current;
  const weeksCompleted = cur.weeks.filter((w: { created: number }) => w.created > 0).length;
  const remaining = WEEKS_PER_MONTH - weeksCompleted;
  const neededPerWeek = remaining > 0 ? (cur.monthlyTarget - cur.totalCreated) / remaining : 0;
  const quarterLabel = state.pacing.quarterSummary.quarterLabel;
  return `*${cur.month} MTD:* ${fmtK(cur.totalCreated)} through ${weeksCompleted === 1 ? "one week" : weeksCompleted === 2 ? "two weeks" : `${weeksCompleted} weeks`} — ${Math.round(cur.pctHit)}% of the ${fmtK(cur.monthlyTarget)} ${quarterLabel} plan monthly target. To hit plan, we need ~${fmtK(neededPerWeek)}/wk for the remaining ${remaining.toFixed(1)} weeks.`;
}

export function composePulseBlocks(state: DashboardState): {
  blocks: any[];
  text: string;
} {
  const { blended, groups, aeUpside } = state.scoreboard;

  const headline =
    `*Pipeline created:* ${fmtK(blended.created)} / ${fmtK(blended.target)} target  ·  ${Math.round(blended.pctHit)}%  ·  ${blended.gap >= 0 ? "+" : "−"}${fmtK(Math.abs(blended.gap))}`;

  const upsideLine =
    aeUpside.created > 0
      ? `\n*AE Self-Set upside:* ${fmtK(aeUpside.created)} (tracked separately)`
      : "";

  const fields: any[] = [
    {
      type: "mrkdwn",
      text: groupField(
        groups.bdrOutbound.displayLabel,
        groups.bdrOutbound.created,
        groups.bdrOutbound.target,
        groups.bdrOutbound.pctHit,
      ),
    },
    {
      type: "mrkdwn",
      text: groupField(
        groups.fieldMarketing.displayLabel,
        groups.fieldMarketing.created,
        groups.fieldMarketing.target,
        groups.fieldMarketing.pctHit,
      ),
    },
    {
      type: "mrkdwn",
      text: groupField(
        groups.perfMarketing.displayLabel,
        groups.perfMarketing.created,
        groups.perfMarketing.target,
        groups.perfMarketing.pctHit,
      ),
    },
  ];

  if (aeUpside.created > 0) {
    fields.push({
      type: "mrkdwn",
      text: `*AE Self-Set*\n${fmtK(aeUpside.created)} (upside)`,
    });
  }

  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📊 Pipeline Pulse — Week of ${state.focusWeekLabel}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: headline + upsideLine },
    },
    {
      type: "section",
      fields,
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: mtdLine(state) },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Dashboard  →" },
          url: DASHBOARD_URL,
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Weekly Pipeline Review — Initiatives Tracker" },
          url: INITIATIVES_TRACKER_URL,
        },
      ],
    },
  ];

  const text = `Pipeline Pulse — Week of ${state.focusWeekLabel}: ${fmtK(blended.created)} / ${fmtK(blended.target)} (${Math.round(blended.pctHit)}%)`;

  return { blocks, text };
}

type FetchMessages = (channelId: string, oldestTs: string) => Promise<SlackMessage[]>;

/**
 * Checks whether this Monday's post has already been sent to `channelId`.
 * Uses the focus week label as the idempotency tag (matches the header block).
 *
 * `fetchMessages` is injectable so tests don't hit the Slack API. In
 * production, pass `fetchChannelHistory` from slack-client.
 */
export async function alreadyPostedThisWeek(
  channelId: string,
  focusWeekLabel: string,
  fetchMessages: FetchMessages,
): Promise<boolean> {
  // 6 days is enough to cover any prior Monday post for this week.
  const sixDaysAgo = (Date.now() / 1000 - 6 * 24 * 60 * 60).toFixed(0);
  const messages = await fetchMessages(channelId, sixDaysAgo);

  // Match against the plain-text fallback that Slack returns via
  // conversations.history — the `text` field, which is what our composer
  // writes (without the emoji that only lives in the header block).
  // The week label is specific enough that no other integration can
  // realistically collide with it.
  const marker = `Pipeline Pulse — Week of ${focusWeekLabel}`;
  return messages.some(
    (m) => m.bot_id !== undefined && typeof m.text === "string" && m.text.includes(marker),
  );
}
