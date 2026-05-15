import Link from "next/link";
import type { Metadata } from "next";
import { CsvDataSource, DEMO_CSV_PATHS } from "@/lib/data-loader";

export const metadata: Metadata = {
  title: "Crestline RevOps Hub",
  description: "Dashboards and tools built for Crestline's GTM leadership",
};

export const dynamic = "force-dynamic";

interface AppCardData {
  title: string;
  category: string;
  description: string;
  status: "Live" | "Coming Soon";
  href: string | null;
  accentColor: string;
  lastUpdated?: string;
}

async function getLatestDiscoveryDate(): Promise<string | null> {
  try {
    // Demo build: read from data/demo/pipeline.csv
    const rawOpps = await new CsvDataSource(DEMO_CSV_PATHS.pipeline).loadOpportunities();

    let latest: Date | null = null;
    for (const row of rawOpps) {
      const d = new Date(row["Discovery Date"]);
      if (!isNaN(d.getTime()) && (!latest || d > latest)) {
        latest = d;
      }
    }
    if (latest) {
      return latest.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  } catch {
    // silently fail
  }
  return null;
}

export default async function HubPage() {
  const lastUpdated = await getLatestDiscoveryDate();

  const apps: AppCardData[] = [
    {
      title: "Pipeline Pulse",
      category: "PIPELINE",
      description:
        "Weekly source-adjusted coverage dashboard. Tracks pipeline creation vs. target by source and owner group, with MTD pacing and gap analysis.",
      status: "Live",
      href: "/",
      accentColor: "var(--kojo-yellow)",
      lastUpdated: lastUpdated ?? undefined,
    },
    {
      title: "AE Performance",
      category: "PIPELINE",
      description:
        "Per-AE follow-up speed, pipeline staleness, and self-set volume — exception management for inbound/event accountability.",
      status: "Live",
      href: "/",
      accentColor: "var(--teal)",
    },
    {
      title: "Pipeline Coverage",
      category: "PIPELINE",
      description:
        "Forward-looking coverage analysis. Do we have enough open pipeline to hit plan this month and next quarter? Includes aging, stage composition, and close date health.",
      status: "Live",
      href: "/coverage",
      accentColor: "var(--teal)",
      lastUpdated: lastUpdated ?? undefined,
    },
    {
      title: "Pipeline Scenarios",
      category: "ANALYTICS",
      description:
        "Backtest coverage multiples against 2025 actuals and model what-if scenarios with interactive controls. Test stale thresholds, win rates, and coverage targets.",
      status: "Live",
      href: "/scenarios",
      accentColor: "var(--kojo-yellow)",
      lastUpdated: lastUpdated ?? undefined,
    },
    {
      title: "Revenue & Funnel",
      category: "ANALYTICS",
      description:
        "Where does closed-won revenue come from and how is each origination channel trending? Nested breakdown by Outbound, Field Marketing, Perf Marketing, and CS Source-Expansion plus a quarterly trend tab.",
      status: "Live",
      href: "/revenue",
      accentColor: "var(--green)",
    },
    {
      title: "Created Cohort Win Rate",
      category: "ANALYTICS",
      description:
        "Of the pipeline we created in month X, what percentage eventually closed won? Monthly cohort table with trend chart, trailing averages, and dimension breakdowns.",
      status: "Live",
      href: "/ccwr",
      accentColor: "var(--blue)",
    },
    {
      title: "MM SDR Outbound",
      category: "PIPELINE",
      description:
        "Mid-market SDR outbound performance dashboard. North Star Metrics, activity tracking, account targeting, SAO acceptance/rejection, and weekly .docx export for the Tuesday review meeting.",
      status: "Live",
      href: "/mm-sdr",
      accentColor: "var(--green)",
    },
    {
      title: "RevOps Support",
      category: "OPERATIONS",
      description:
        "Ticket queue and analytics for #revops-support. Track open requests, resolution times, and volume trends.",
      status: "Live",
      href: "/support",
      accentColor: "var(--kojo-yellow)",
    },
    {
      title: "Pricing Calculator",
      category: "SALES TOOLS",
      description:
        "Calculate deal pricing by product, revenue tier, and deal structure. Includes discount vs. free months comparison and export/share to Slack.",
      status: "Live",
      href: "/pricing",
      accentColor: "var(--blue)",
    },
    {
      title: "Updates",
      category: "META",
      description:
        "See what's been shipped across the RevOps Hub. Filterable by app with weekly grouping.",
      status: "Live",
      href: "/updates",
      accentColor: "var(--muted)",
    },
    {
      title: "System Architecture",
      category: "META",
      description:
        "How the RevOps AI operating system is wired — MCP servers, skills, deployed apps, data pipeline, and visibility system.",
      status: "Live",
      href: "/architecture",
      accentColor: "var(--teal)",
    },
    {
      title: "Account Intelligence",
      category: "INTELLIGENCE",
      description:
        "ENR Top 600 matching against SFDC accounts and top customer ranking by parent-level revenue. Surfaces data quality issues and prospecting whitespace.",
      status: "Live" as const,
      href: "/account-intelligence",
      accentColor: "var(--teal)",
    },
    {
      title: "Email SLA Compliance",
      category: "CUSTOMER SUCCESS",
      description:
        "Monitor response time SLAs across customer-facing teams. Track first-reply time, resolution time, and escalation rates by rep and segment.",
      status: "Coming Soon",
      href: null,
      accentColor: "var(--blue)",
    },
  ];

  return (
    <>
      {/* Kojo header bar */}
      <div className="kojo-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "#FFE500",
              letterSpacing: 1.5,
            }}
          >
            KOJO
          </span>
          <span
            style={{
              width: 1,
              height: 16,
              background: "#555",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            RevOps Hub
          </span>
        </div>
        <span style={{ fontSize: 10, color: "#777", letterSpacing: 0.5, textTransform: "uppercase" }}>
          Internal Tools
        </span>
      </div>

      {/* Subtitle */}
      <div
        style={{
          padding: "20px 20px 0",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "var(--muted)",
            maxWidth: 960,
            margin: "0 auto",
          }}
        >
          Dashboards and tools built for Kojo&apos;s GTM leadership.
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 24px 24px", maxWidth: 960, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 14,
          }}
        >
          {apps.map((app) => (
            <Card key={app.title} app={app} />
          ))}
        </div>
      </div>
    </>
  );
}

function Card({ app }: { app: AppCardData }) {
  const isLive = app.status === "Live";

  const content = (
    <div
      className="card"
      style={{
        marginBottom: 0,
        borderLeft: `3px solid ${app.accentColor}`,
        cursor: isLive ? "pointer" : "default",
        transition: "border-color 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div
          className="label"
          style={{ color: app.accentColor, marginBottom: 0 }}
        >
          {app.category}
        </div>
        <span
          className={`badge ${isLive ? "badge-green" : "badge-yellow"}`}
          style={{ display: "flex", alignItems: "center", gap: 5 }}
        >
          {isLive && <span className="pulse-dot" />}
          {app.status}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
        {app.title}
      </div>
      <div
        style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}
      >
        {app.description}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        {isLive ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: app.accentColor,
            }}
          >
            Open dashboard &rarr;
          </span>
        ) : (
          <span />
        )}
        {app.lastUpdated && (
          <span style={{ fontSize: 9, color: "#556", letterSpacing: 0.3 }}>
            Latest disco: {app.lastUpdated}
          </span>
        )}
      </div>
    </div>
  );

  if (isLive && app.href) {
    return (
      <Link href={app.href} style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </Link>
    );
  }

  return content;
}
