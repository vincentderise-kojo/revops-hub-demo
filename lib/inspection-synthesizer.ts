/**
 * Inspection synthesizer — applies the leader_deal_inspection skill (canonical at
 * pipeline-pulse-app/skills/leader_deal_inspection.md) to engagement data via
 * Claude and parses the response into the EndgameInspection cache shape.
 *
 * The skill markdown is cached via Anthropic prompt caching so 10 opps in one
 * cron run pay the skill tokens once (write) and reuse the cached prefix on
 * the remaining 9 (cheap reads).
 */

import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AccountEngagement, OppForInspection } from "./endgame-client";
import type { EndgameInspection, InspectionEngagement } from "./types";

const SKILL_PATH = path.join(process.cwd(), "skills", "leader_deal_inspection.md");
const MODEL = "claude-opus-4-7";

let cachedSkill: string | null = null;

async function loadSkill(): Promise<string> {
  if (cachedSkill) return cachedSkill;
  cachedSkill = await fs.readFile(SKILL_PATH, "utf-8");
  return cachedSkill;
}

const INSPECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    grades: {
      type: "object",
      additionalProperties: false,
      properties: {
        champion: {
          type: "object",
          additionalProperties: false,
          properties: {
            grade: { type: "string", enum: ["red", "yellow", "green"] },
            level: { type: "integer" },
          },
          required: ["grade", "level"],
        },
        economicBuyer: {
          type: "object",
          additionalProperties: false,
          properties: {
            grade: { type: "string", enum: ["red", "yellow", "green"] },
            level: { type: "integer" },
          },
          required: ["grade", "level"],
        },
        compellingEvent: {
          type: "object",
          additionalProperties: false,
          properties: {
            grade: { type: "string", enum: ["red", "yellow", "green"] },
            level: { type: "integer" },
          },
          required: ["grade", "level"],
        },
        decisionProcess: {
          type: "object",
          additionalProperties: false,
          properties: {
            grade: { type: "string", enum: ["red", "yellow", "green"] },
            level: { type: "integer" },
          },
          required: ["grade", "level"],
        },
      },
      required: ["champion", "economicBuyer", "compellingEvent", "decisionProcess"],
    },
    latestSignal: {
      type: "object",
      additionalProperties: false,
      properties: {
        date: { type: "string" },
        speaker: { type: "string" },
        quote: { type: "string" },
      },
      required: ["date", "speaker", "quote"],
    },
    twoThings: {
      type: "array",
      items: { type: "string" },
    },
    coachTheRep: {
      type: "array",
      items: { type: "string" },
    },
    forecastRead: {
      type: "string",
      enum: ["Pipeline", "Best Case", "Commit", "Remove"],
    },
  },
  required: ["grades", "latestSignal", "twoThings", "coachTheRep", "forecastRead"],
} as const;

function summarizeEngagement(engagement: AccountEngagement | null, windowDays: number): {
  text: string;
  stats: InspectionEngagement;
} {
  if (!engagement) {
    return {
      text: "No interaction history available for this account in the queried window.",
      stats: { meetings: 0, incomingEmails: 0, slackMentions: 0, windowDays },
    };
  }

  const meetings = engagement.documents.filter((d) => d.type === "call_transcript").length;
  const incomingEmails = (engagement.emailStats.match(/(\d+)\s+incoming/i)?.[1] ?? "0");

  const sortedDocs = [...engagement.documents].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  const docLines = sortedDocs.map((d) => {
    const factLines = d.facts.map((f) => {
      const speaker = f.speaker ? `[${f.speaker}] ` : "";
      const quote = f.quote ? `  → "${f.quote.slice(0, 200)}"` : "";
      return `  ${speaker}${f.fact}${quote ? "\n" + quote : ""}`;
    }).join("\n");
    return `=== ${d.date.slice(0, 10)} · ${d.type} · ${d.title} ===\n${factLines}`;
  }).join("\n\n");

  return {
    text: `${engagement.emailStats}\n${engagement.meetingStats}\n\nMost recent ${sortedDocs.length} of ${engagement.documents.length} documents:\n\n${docLines}`,
    stats: {
      meetings,
      incomingEmails: parseInt(incomingEmails, 10) || 0,
      slackMentions: 0,
      windowDays,
    },
  };
}

export type SynthesizedInspection = Pick<
  EndgameInspection,
  "grades" | "engagement" | "latestSignal" | "twoThings" | "coachTheRep" | "forecastRead"
>;

export async function synthesizeInspection(
  opp: OppForInspection,
  engagement: AccountEngagement | null,
  windowDays: number = 60
): Promise<SynthesizedInspection> {
  const skill = await loadSkill();
  const anthropic = new Anthropic();
  const { text: engagementText, stats } = summarizeEngagement(engagement, windowDays);

  const userContent = `Inspect this deal using the leader_deal_inspection skill loaded in the system prompt.

OPPORTUNITY
- Name: ${opp.opportunityName}
- Account: ${opp.accountName}
- Amount: $${opp.amount.toLocaleString()}
- Stage: ${opp.stage}
- Discovery Date: ${opp.discoveryDate.slice(0, 10)}
- Owner: ${opp.owner}

ENGAGEMENT (last ${windowDays}d)
${engagementText}

Output via the structured JSON schema. Constraints:
- Grade Champion / Economic Buyer / Compelling Event / Decision Process. Use "level" 1 (no evidence) through 4 (strong, prospect-validated). Map: 1 = red, 2 = yellow-low, 3 = yellow-high, 4 = green.
- "latestSignal" is the single most decision-relevant prospect (or rep-confirmed) quote from the engagement, with date (YYYY-MM-DD) and speaker.
- "twoThings" = 1-3 short paragraphs naming the load-bearing observations. Be specific. No filler.
- "coachTheRep" = 1-3 concrete next questions or actions tied to a name + a deadline.
- "forecastRead" is one of Pipeline / Best Case / Commit / Remove. For new opps (< 30 days in stage), default to Pipeline unless evidence is unusually strong.

Be terse. Grade on evidence, not claims.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: "You apply the leader_deal_inspection skill loaded below to inspect a single deal for the RevOps team. Respond only via the structured JSON output. Grade on evidence, not claims. Distinguish what the rep says from what the data shows.",
      },
      {
        type: "text",
        text: skill,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: INSPECTION_SCHEMA,
      },
    },
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    throw new Error("Claude returned no text content for inspection synthesis");
  }
  const parsed = JSON.parse(textBlock.text) as SynthesizedInspection;

  return { ...parsed, engagement: stats };
}
