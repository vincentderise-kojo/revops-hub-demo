import { NextRequest, NextResponse } from "next/server";

interface PricingPayload {
  channel: string;
  pricing: {
    annualRevenue: number;
    termMonths: number;
    freeMonths: number;
    discountPct: number;
    rows: { product: string; annual: number; discounted: number; monthly: number }[];
    listAcv: number;
    discountedAcv: number;
    tcv: number;
    monthlyTotal: number;
  };
}

function fmtDollar(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

function fmtRevenue(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

function buildSlackMessage(p: PricingPayload["pricing"]): string {
  const productLines = p.rows
    .map(
      (r) =>
        `• *${r.product}*: ${fmtDollar(r.monthly)}/mo (${fmtDollar(r.discounted)}/yr)`
    )
    .join("\n");

  const discountLine =
    p.discountPct > 0 ? `\n*Discount:* ${p.discountPct}%` : "";
  const freeLine =
    p.freeMonths > 0
      ? `\n*Free Months:* ${p.freeMonths}`
      : "";

  return (
    `*Kojo Pricing Estimate*\n` +
    `*Annual Revenue:* ${fmtRevenue(p.annualRevenue)} · *Term:* ${p.termMonths / 12}yr` +
    discountLine +
    freeLine +
    `\n\n` +
    productLines +
    `\n\n` +
    `*Monthly Total:* ${fmtDollar(p.monthlyTotal)} · *ACV:* ${fmtDollar(p.discountedAcv)} · *TCV:* ${fmtDollar(p.tcv)}`
  );
}

export async function POST(req: NextRequest) {
  try {
    const body: PricingPayload = await req.json();

    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken) {
      return NextResponse.json(
        { error: "Slack not configured" },
        { status: 500 }
      );
    }

    const message = buildSlackMessage(body.pricing);

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: body.channel,
        text: message,
        mrkdwn: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      return NextResponse.json(
        { error: data.error ?? "Slack API error" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to send Slack message" },
      { status: 500 }
    );
  }
}
