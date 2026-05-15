// Slack Block Kit formatter for SpotCheckResult.
//
// Renders the structured spot-check into a Slack message with a header, a
// severity summary, fails + warns called out with details, passes folded into
// a single summary line, and links to the SFDC opp + the signed PDF.
//
// Emoji usage is intentional: this lands in #sfdc-opp-review (Vincent's
// preference is emoji-heavy in internal channels).

import type { SpotCheckResult } from "./types";

const SEV_ICON = { pass: ":white_check_mark:", warn: ":warning:", fail: ":x:" } as const;

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function buildSlackBlocks(result: SpotCheckResult): { blocks: unknown[]; text: string } {
  const counts = result.checks.reduce(
    (acc, c) => {
      acc[c.severity] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 } as Record<"pass" | "warn" | "fail", number>
  );

  const summaryEmoji = counts.fail > 0 ? ":rotating_light:" : counts.warn > 0 ? ":warning:" : ":white_check_mark:";

  const fails = result.checks.filter((c) => c.severity === "fail");
  const warns = result.checks.filter((c) => c.severity === "warn");
  const passes = result.checks.filter((c) => c.severity === "pass");

  const headerText = `${summaryEmoji} CW Spot-Check — ${result.oppName}`;

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Amount*\n${fmtMoney(result.amount)}` },
        { type: "mrkdwn", text: `*Close Date*\n${fmtDate(result.closeDate)}` },
        { type: "mrkdwn", text: `*Owner*\n${result.owner}` },
        { type: "mrkdwn", text: `*Manager*\n${result.manager ?? "—"}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Result:* ${counts.fail} fail · ${counts.warn} warn · ${counts.pass} pass`,
      },
    },
  ];

  // Links
  const linkParts: string[] = [`<${result.oppUrl}|Opportunity in SFDC>`];
  if (result.pdfDownloadUrl) {
    linkParts.push(`<${result.pdfDownloadUrl}|Signed contract PDF>`);
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: linkParts.join("   ·   ") }],
  });

  // FAILS
  if (fails.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Fails (${fails.length})*` },
    });
    for (const f of fails) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${SEV_ICON.fail} *${f.label}*\n${f.detail}`,
        },
      });
    }
  }

  // WARNS
  if (warns.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Warns (${warns.length})*` },
    });
    for (const w of warns) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${SEV_ICON.warn} *${w.label}*\n${w.detail}`,
        },
      });
    }
  }

  // PASSES — folded into one line
  if (passes.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:white_check_mark: *${passes.length} passed:* ${passes.map((p) => p.label.split(":")[0]).join(" · ")}`,
        },
      ],
    });
  }

  // Footer
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `_Generated ${fmtDate(result.generatedAt)} by CW Spot-Check_`,
      },
    ],
  });

  // Plaintext fallback (for notifications)
  const text = `CW Spot-Check — ${result.oppName} — ${counts.fail} fail, ${counts.warn} warn, ${counts.pass} pass`;

  return { blocks, text };
}
