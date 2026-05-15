import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type {
  DealInsightRequest,
  DealInsightResponse,
  SlackMessage,
  DealForecast,
} from "@/lib/types";

const anthropic = new Anthropic();

// ── Slack Search (placeholder — MCP integration requires auth, coming in V2) ──
async function searchSlack(
  _accountName: string,
  _oppName: string
): Promise<SlackMessage[]> {
  // TODO: Wire up Slack API or authenticated MCP integration
  // The MCP approach requires a Slack OAuth token on the server side.
  // For now, return empty and let the forecast run on SFDC data only.
  return [];
}

// ── AI Forecast ──
async function generateForecast(
  deal: DealInsightRequest,
  slackMessages: SlackMessage[]
): Promise<DealForecast> {
  const slackContext =
    slackMessages.length > 0
      ? `\n\nInternal Slack messages about this deal:\n${slackMessages.map((m) => `- ${m.author} (${m.date} in ${m.channel}): "${m.text}"`).join("\n")}`
      : "\n\nNo internal Slack messages found for this deal.";

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system:
      "You are a revenue operations analyst at Kojo, a construction tech company. You assess deal health and provide forecasts for GTM leadership (CEO, VP Sales, Head of Finance). Be direct, data-driven, and actionable. Do not hedge excessively.",
    messages: [
      {
        role: "user",
        content: `Assess this deal and provide a forecast:

**Opportunity:** ${deal.oppName}
**Account:** ${deal.accountName}
**Amount:** $${deal.amount.toLocaleString()}
**Stage:** ${deal.stage}
**Close Date:** ${deal.closeDate}
**Days Since Last Activity:** ${deal.inactiveDays !== null ? deal.inactiveDays : "Unknown"}
**Discovery Date:** ${deal.discoveryDate}
**Segment:** ${deal.segment}
**Annual Revenue:** $${deal.annualRevenue.toLocaleString()}
**Owner:** ${deal.owner}${slackContext}

Respond with ONLY valid JSON in this exact format:
{
  "confidence": <0-100 integer>,
  "label": "<Strong|On Track|At Risk|Unlikely>",
  "narrative": "<3-5 sentence executive summary covering deal health, momentum, key risks, and recommended next steps>"
}`,
      },
    ],
  });

  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in forecast response");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON in forecast response");
  }

  return JSON.parse(jsonMatch[0]) as DealForecast;
}

// ── Route Handler ──
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const deal: DealInsightRequest = await req.json();

    const slackMessages = await searchSlack(deal.accountName, deal.oppName);

    let forecast: DealForecast;
    try {
      forecast = await generateForecast(deal, slackMessages);
    } catch (err) {
      console.error("[deal-insight] Forecast generation failed:", err);
      return NextResponse.json(
        {
          slackMessages,
          forecast: {
            confidence: 0,
            label: "At Risk" as const,
            narrative:
              "Forecast unavailable — AI analysis could not be completed.",
          },
        } satisfies DealInsightResponse,
        { status: 200 }
      );
    }

    const response: DealInsightResponse = {
      slackMessages,
      forecast,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[deal-insight] Route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
