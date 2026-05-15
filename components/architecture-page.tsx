"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// ── Section IDs ──
const SECTIONS = [
  { id: "operator", label: "Operator" },
  { id: "core-engine", label: "Core Engine" },
  { id: "mcp-servers", label: "MCP Servers" },
  { id: "plugins", label: "Plugins" },
  { id: "skills", label: "Skills Library" },
  { id: "apps", label: "Deployed Apps" },
  { id: "data-pipeline", label: "Data Pipeline" },
  { id: "visibility", label: "Visibility System" },
] as const;

// ── MCP Server Data ──
interface McpServer {
  name: string;
  type: "MCP" | "CLI";
  shortDesc: string;
  fullDesc: string;
  usedBy: string[];
  note?: string;
}

const MCP_SERVERS: McpServer[] = [
  {
    name: "Notion",
    type: "MCP",
    shortDesc: "Knowledge base + project tracking",
    fullDesc:
      "RevOps Projects & Priorities database. Source of truth for project status. Stores project pages, OKR tracking, and team priorities.",
    usedBy: ["/start-day", "/notion-feed-me", "Notion sync protocol"],
  },
  {
    name: "Slack",
    type: "MCP",
    shortDesc: "Team communication",
    fullDesc:
      "Reads #revops-support, #sfdc-opp-review, #weekly-pipeline-review, and leadership group DM. Sends messages and reads channel history for context synthesis.",
    usedBy: ["/start-day", "/weekly-update"],
  },
  {
    name: "Gmail",
    type: "MCP",
    shortDesc: "Email inbox",
    fullDesc: "Reads and drafts messages. Surfaces unread emails in morning briefings and supports email-based workflows.",
    usedBy: ["/start-day"],
  },
  {
    name: "Google Calendar",
    type: "MCP",
    shortDesc: "Scheduling",
    fullDesc: "Reads today's meetings for daily briefing context. Helps prioritize prep work based on upcoming calendar.",
    usedBy: ["/start-day"],
  },
  {
    name: "Salesforce CLI",
    type: "CLI",
    shortDesc: "CRM queries via sf command",
    fullDesc:
      "Direct SOQL queries via `sf data query` in Bash tool. Authenticated locally. Used for real-time deal lookups, ad-hoc analysis, and the planned /deal-inspect skill.",
    usedBy: ["/deal-inspect (planned)", "ad-hoc analysis"],
    note: "Not an MCP server — direct CLI execution via Bash tool.",
  },
];

// ── Skill Data ──
interface Skill {
  name: string;
  status: "live" | "planned";
  category: string;
  description: string;
  tags: { label: string; color: string }[];
  filePath?: string;
}

const TAG_COLORS: Record<string, string> = {
  Notion: "#3b82f6",
  Slack: "#22c55e",
  Gmail: "#f59e0b",
  Calendar: "#4ecdc4",
  Git: "#8899aa",
  Vercel: "#e2e8f0",
  SFDC: "#3b82f6",
  Endgame: "#f59e0b",
};

const SKILLS: Skill[] = [
  {
    name: "/start-day",
    status: "live",
    category: "Daily Ops",
    description:
      "Morning briefing from Notion + Slack + Gmail + Calendar. Synthesizes overnight activity into a prioritized daily plan.",
    tags: [
      { label: "Notion", color: TAG_COLORS.Notion },
      { label: "Slack", color: TAG_COLORS.Slack },
      { label: "Gmail", color: TAG_COLORS.Gmail },
      { label: "Calendar", color: TAG_COLORS.Calendar },
    ],
    filePath: ".claude/skills/start-day.md",
  },
  {
    name: "/notion-feed-me",
    status: "live",
    category: "Daily Ops",
    description: "Pulls highest-priority item from RevOps Projects & Priorities board.",
    tags: [{ label: "Notion", color: TAG_COLORS.Notion }],
    filePath: ".claude/skills/notion-feed-me.md",
  },
  {
    name: "/weekly-update",
    status: "live",
    category: "Workflow",
    description:
      "Generates weekly status update from Notion project board + recent commits + Slack activity.",
    tags: [
      { label: "Notion", color: TAG_COLORS.Notion },
      { label: "Slack", color: TAG_COLORS.Slack },
      { label: "Git", color: TAG_COLORS.Git },
    ],
    filePath: ".claude/skills/weekly-update.md",
  },
  {
    name: "/deploy",
    status: "live",
    category: "Infrastructure",
    description: "Deploys pipeline-pulse-app to Vercel.",
    tags: [{ label: "Vercel", color: TAG_COLORS.Vercel }],
    filePath: ".claude/skills/deploy.md",
  },
  {
    name: "/new-view",
    status: "live",
    category: "Infrastructure",
    description: "Scaffolds a new dashboard view following existing patterns.",
    tags: [],
    filePath: ".claude/skills/new-view.md",
  },
  {
    name: "/update-quotas",
    status: "live",
    category: "Infrastructure",
    description:
      "Updates monthly quotas across config.md, source-targets.md, and lib/config.ts.",
    tags: [],
    filePath: ".claude/skills/update-quotas.md",
  },
  {
    name: "/comp-letters",
    status: "live",
    category: "Workflow",
    description:
      "Generates quarterly quota notification letters and creates Gmail drafts for AEs, SDRs, SEs, CSMs, managers, and Onboarding. Sales quotas pull from Google Sheet automatically; CSM and Onboarding data is pasted manually.",
    tags: [
      { label: "Gmail", color: TAG_COLORS.Gmail },
      { label: "SFDC", color: TAG_COLORS.SFDC },
    ],
    filePath: ".claude/skills/comp-letters.md",
  },
  {
    name: "/deal-inspect",
    status: "planned",
    category: "Sales Intelligence",
    description:
      "Pull a deal's SFDC data, scan its Slack deal channel, and check Endgame for call context — produce a full deal health summary from the CLI. V1 exists as the deal drill-in panel on Coverage (SFDC + Claude forecast only). V2 will add Slack and Endgame enrichment.",
    tags: [
      { label: "SFDC", color: TAG_COLORS.SFDC },
      { label: "Slack", color: TAG_COLORS.Slack },
      { label: "Endgame", color: TAG_COLORS.Endgame },
    ],
  },
];

// ── App Data ──
interface AppEntry {
  name: string;
  category: string;
  route: string | null;
  status: "live" | "coming-soon";
  description: string;
  automation?: string; // Small badge shown in the row header (e.g., "⏰ Mon 9:30 ET")
}

const APPS: AppEntry[] = [
  {
    name: "Pipeline Pulse",
    category: "PIPELINE",
    route: "/",
    status: "live",
    automation: "⏰ Mon 9:30 ET → #weekly-pipeline-review",
    description:
      "Weekly pipeline creation dashboard tracking Q2'26 board-plan targets by owner group (BDR/Field/Perf + AE upside). Scoreboard, MTD tracker, Q2 pacing charts, deal list with period/group filters, and All/MM/ENT segment toggle. Auto-posts a Block Kit exec summary to #weekly-pipeline-review every Monday at 9:30am ET via Vercel Cron (route: /api/cron/monday-pulse), DST-aware, with fail-closed sanity gate and Slack-history idempotency.",
  },
  {
    name: "AE Performance",
    category: "PIPELINE",
    route: "/ (AE Performance tab)",
    status: "live",
    description:
      "Per-AE follow-up speed/persistence (Inbound + Event), qualified pipeline staleness with 7/14/30 day pill filter, and self-set MTD volume vs 3/month target. Drill-down opps table at the bottom with cell-click filtering.",
  },
  {
    name: "Pipeline Coverage",
    category: "PIPELINE",
    route: "/coverage",
    status: "live",
    description:
      "Forward-looking coverage analysis. Do we have enough open pipeline to hit plan? Includes aging, stage composition, close date health, and deal drill-in panel.",
  },
  {
    name: "Pipeline Scenarios",
    category: "ANALYTICS",
    route: "/scenarios",
    status: "live",
    description:
      "Backtest coverage multiples against 2025 actuals and model what-if scenarios with interactive controls.",
  },
  {
    name: "Revenue & Funnel",
    category: "ANALYTICS",
    route: "/revenue",
    status: "live",
    description:
      "CW revenue attribution by origination channel (Outbound / Field Marketing / Perf Marketing / CS Source-Expansion) with nested Source → Set Type drill-down, page-level All/MM/ENT segment toggle, Segment Mix bar per channel, and SFDC opp links. Snapshot tab covers the selected period; Trend tab shows quarterly CW Recurring ARR by parent group from FY2025 onward.",
  },
  {
    name: "Created Cohort Win Rate",
    category: "ANALYTICS",
    route: "/ccwr",
    status: "live",
    description:
      "Created Cohort Win Rate (CCWR) — monthly cohort analysis showing what percentage of pipeline created in a given month eventually closed won. SOT for pipeline coverage targets.",
  },
  {
    name: "MM SDR Outbound",
    category: "PIPELINE",
    route: "/mm-sdr",
    status: "live",
    description:
      "Mid-market SDR outbound performance dashboard with 5 sections: North Star Metrics (volume/quality/outcome), SDR Activity Metrics, Account Targeting Coverage, SAO Acceptance/Rejection, and Accepted SAO Characteristics. Includes .docx weekly review export.",
  },
  {
    name: "RevOps Support",
    category: "OPERATIONS",
    route: "/support",
    status: "live",
    description:
      "Ticket queue and analytics for #revops-support. Track open requests, resolution times, and volume trends.",
  },
  {
    name: "Pricing Calculator",
    category: "SALES TOOLS",
    route: "/pricing",
    status: "live",
    description:
      "Calculate deal pricing by product, revenue tier, and deal structure. Includes discount vs. free months comparison and export/share to Slack.",
  },
  {
    name: "Updates",
    category: "META",
    route: "/updates",
    status: "live",
    description:
      "What's been shipped across the RevOps Hub. Filterable by app with weekly grouping.",
  },
  {
    name: "Hub",
    category: "META",
    route: "/hub",
    status: "live",
    description: "Landing page with app cards linking to every view in the RevOps Hub.",
  },
  {
    name: "Account Intelligence",
    category: "INTELLIGENCE",
    route: "/account-intelligence",
    status: "live" as const,
    description:
      "Four-tab dashboard: ENR Top 600 matching against SFDC accounts, Top Customers ranked by parent-level revenue, Upsell Signals (3-vector renewal pricing analysis with discount, size, and billing cadence signals), and Methodology. Includes parent hierarchy resolution, expandable child accounts with SFDC links, and CSV export.",
  },
  {
    name: "Email SLA Compliance",
    category: "CUSTOMER SUCCESS",
    route: null,
    status: "coming-soon",
    description:
      "Monitor response time SLAs across customer-facing teams. Track first-reply time, resolution time, and escalation rates by rep and segment.",
  },
];

// ── Expandable Row Component ──
function ExpandableRow({
  borderColor,
  planned,
  header,
  children,
  expanded,
  onToggle,
}: {
  borderColor: string;
  planned?: boolean;
  header: React.ReactNode;
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`arch-row ${planned ? "arch-row-planned" : ""}`}>
      <div
        className="arch-row-header"
        onClick={onToggle}
        style={{ borderLeft: planned ? undefined : `3px solid ${borderColor}` }}
      >
        {header}
        <span style={{ fontSize: 10, color: expanded ? "var(--kojo-yellow)" : "var(--muted)" }}>
          {expanded ? "▼" : "▶"}
        </span>
      </div>
      {expanded && <div className="arch-row-body">{children}</div>}
    </div>
  );
}

// ── Tag Chip Component ──
function Tag({ label, color, muted }: { label: string; color: string; muted?: boolean }) {
  const opacity = muted ? "44" : "";
  return (
    <span
      className="arch-tag"
      style={{ background: `${color}22`, color: `${color}${opacity}` }}
    >
      {label}
    </span>
  );
}

// ── Status Badge Component ──
function StatusBadge({ status }: { status: "live" | "planned" | "coming-soon" }) {
  if (status === "live") {
    return (
      <span className="badge badge-green" style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span className="pulse-dot" />
        LIVE
      </span>
    );
  }
  if (status === "planned") {
    return <span className="badge badge-yellow">PLANNED</span>;
  }
  return <span className="badge badge-yellow">COMING SOON</span>;
}

// ── Main Page Component ──
export default function ArchitecturePage() {
  const [activeSection, setActiveSection] = useState("operator");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // ── Scroll-spy via Intersection Observer ──
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visibleSections = new Map<string, number>();

    for (const section of SECTIONS) {
      const el = sectionRefs.current[section.id];
      if (!el) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              visibleSections.set(section.id, entry.intersectionRatio);
            } else {
              visibleSections.delete(section.id);
            }
          }
          // Pick the first visible section in document order
          for (const s of SECTIONS) {
            if (visibleSections.has(s.id)) {
              setActiveSection(s.id);
              break;
            }
          }
        },
        { threshold: 0, rootMargin: "-10% 0px -80% 0px" }
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const toggleItem = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const scrollTo = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Group skills by category ──
  const skillCategories = SKILLS.reduce<Record<string, Skill[]>>((acc, skill) => {
    if (!acc[skill.category]) acc[skill.category] = [];
    acc[skill.category].push(skill);
    return acc;
  }, {});

  return (
    <>
      {/* KOJO HEADER BAR */}
      <div className="kojo-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/hub" style={{ fontSize: 15, fontWeight: 800, color: "#FFE500", letterSpacing: 1.5, textDecoration: "none" }}>KOJO</a>
          <span style={{ width: 1, height: 16, background: "#555", display: "inline-block" }} />
          <a href="/hub" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", textDecoration: "none" }}>RevOps Hub</a>
        </div>
        <span style={{ fontSize: 10, color: "#777", letterSpacing: 0.5, textTransform: "uppercase" }}>System Manual</span>
      </div>

      <div className="arch-layout">
        {/* SIDEBAR */}
        <nav className="arch-sidebar">
          <div style={{ fontSize: 9, color: "var(--kojo-yellow)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600, marginBottom: 16, padding: "0 10px" }}>
            Navigation
          </div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`arch-sidebar-link ${activeSection === s.id ? "active" : ""}`}
              onClick={() => scrollTo(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* MAIN CONTENT */}
        <main className="arch-main">

          {/* §1 OPERATOR */}
          <section
            id="operator"
            className="arch-section"
            ref={(el) => { sectionRefs.current["operator"] = el; }}
          >
            <div className="arch-section-label" style={{ color: "var(--kojo-yellow)" }}>§1</div>
            <div className="arch-section-title">Operator</div>
            <div className="arch-section-desc">The human in the loop. Sets priorities, reviews outputs, approves deploys.</div>
            <div className="card" style={{ borderLeft: "3px solid var(--kojo-yellow)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Vincent DeRise</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Director of Revenue Operations, Kojo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  <span style={{ color: "var(--text)", fontWeight: 500 }}>Reports to:</span> Micah Rodman (CEO)
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  <span style={{ color: "var(--text)", fontWeight: 500 }}>Direct report:</span> Jaime Stillwell (Sales Ops Specialist)
                </div>
              </div>
            </div>
          </section>

          {/* §2 CORE ENGINE */}
          <section
            id="core-engine"
            className="arch-section"
            ref={(el) => { sectionRefs.current["core-engine"] = el; }}
          >
            <div className="arch-section-label" style={{ color: "var(--teal)" }}>§2</div>
            <div className="arch-section-title">Core Engine</div>
            <div className="arch-section-desc">
              All computation is conversation-scoped. CLAUDE.md governs every session — routing skills, enforcing protocols, and maintaining entity memory across conversations.
            </div>
            <div className="arch-stat-grid">
              <div className="arch-stat-box">
                <div className="arch-stat-label" style={{ color: "var(--teal)" }}>Model</div>
                <div className="arch-stat-value">Claude Opus 4.6</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>1M context window</div>
              </div>
              <div className="arch-stat-box">
                <div className="arch-stat-label" style={{ color: "var(--teal)" }}>Config</div>
                <div className="arch-stat-value">CLAUDE.md</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Quality gates, skill routing, Notion sync protocol, entity memory</div>
              </div>
              <div className="arch-stat-box">
                <div className="arch-stat-label" style={{ color: "var(--teal)" }}>Memory</div>
                <div className="arch-stat-value">6 memory files</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>User profile, project state, feedback, references</div>
              </div>
            </div>
          </section>

          {/* §3 MCP SERVERS */}
          <section
            id="mcp-servers"
            className="arch-section"
            ref={(el) => { sectionRefs.current["mcp-servers"] = el; }}
          >
            <div className="arch-section-label" style={{ color: "var(--blue)" }}>§3</div>
            <div className="arch-section-title">MCP Servers</div>
            <div className="arch-section-desc">External systems connected via Model Context Protocol + CLI tools.</div>
            {MCP_SERVERS.map((server) => (
              <ExpandableRow
                key={server.name}
                borderColor="var(--blue)"
                expanded={expandedItems.has(`mcp-${server.name}`)}
                onToggle={() => toggleItem(`mcp-${server.name}`)}
                header={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{server.name}</span>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>— {server.shortDesc}</span>
                    {server.type === "CLI" && (
                      <span className="badge badge-yellow" style={{ fontSize: 8, padding: "1px 5px" }}>CLI</span>
                    )}
                  </div>
                }
              >
                <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.7, marginTop: 10 }}>
                  {server.fullDesc}
                </div>
                {server.note && (
                  <div style={{ fontSize: 10, color: "var(--yellow)", marginTop: 8, fontStyle: "italic" }}>
                    {server.note}
                  </div>
                )}
                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, color: "var(--muted)", marginRight: 4 }}>Used by:</span>
                  {server.usedBy.map((s) => (
                    <span key={s} style={{ fontSize: 9, padding: "2px 6px", background: "var(--bg)", borderRadius: 4, color: "var(--text)" }}>
                      {s}
                    </span>
                  ))}
                </div>
              </ExpandableRow>
            ))}
          </section>

          {/* §4 PLUGINS */}
          <section
            id="plugins"
            className="arch-section"
            ref={(el) => { sectionRefs.current["plugins"] = el; }}
          >
            <div className="arch-section-label" style={{ color: "var(--kojo-yellow)" }}>§4</div>
            <div className="arch-section-title">Plugins</div>
            <div className="arch-section-desc">Extended capabilities installed into the Claude Code CLI.</div>
            <ExpandableRow
              borderColor="var(--kojo-yellow)"
              expanded={expandedItems.has("plugin-superpowers")}
              onToggle={() => toggleItem("plugin-superpowers")}
              header={
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Superpowers</span>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>— Structured development workflow</span>
                </div>
              }
            >
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.7, marginTop: 10 }}>
                Prevents &quot;code first, think later.&quot; Every feature goes through a structured workflow with review gates at each stage.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--kojo-yellow)", padding: "4px 10px", background: "#FFE50011", borderRadius: 6 }}>
                  Brainstorm
                </span>
                <span style={{ color: "var(--muted)", fontSize: 14 }}>→</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--kojo-yellow)", padding: "4px 10px", background: "#FFE50011", borderRadius: 6 }}>
                  Plan
                </span>
                <span style={{ color: "var(--muted)", fontSize: 14 }}>→</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--kojo-yellow)", padding: "4px 10px", background: "#FFE50011", borderRadius: 6 }}>
                  Execute
                </span>
              </div>
              <div style={{ marginTop: 12, fontSize: 10, color: "var(--muted)" }}>
                <span style={{ fontWeight: 500, color: "var(--text)" }}>Key skills provided: </span>
                brainstorming, writing-plans, executing-plans, test-driven-development, systematic-debugging, verification-before-completion
              </div>
            </ExpandableRow>
          </section>

          {/* §5 SKILLS LIBRARY */}
          <section
            id="skills"
            className="arch-section"
            ref={(el) => { sectionRefs.current["skills"] = el; }}
          >
            <div className="arch-section-label" style={{ color: "var(--teal)" }}>§5</div>
            <div className="arch-section-title">Skills Library</div>
            <div className="arch-section-desc">
              CLI skills invoked via slash commands. Each skill is a markdown file in{" "}
              <code style={{ fontSize: 10, background: "var(--card)", padding: "1px 5px", borderRadius: 3 }}>.claude/skills/</code>
            </div>
            {Object.entries(skillCategories).map(([category, skills]) => (
              <div key={category}>
                <div style={{ fontSize: 9, color: "var(--teal)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600, marginBottom: 8, marginTop: 20 }}>
                  {category}
                </div>
                {skills.map((skill) => (
                  <ExpandableRow
                    key={skill.name}
                    borderColor={skill.status === "live" ? "var(--green)" : "var(--muted)"}
                    planned={skill.status === "planned"}
                    expanded={expandedItems.has(`skill-${skill.name}`)}
                    onToggle={() => toggleItem(`skill-${skill.name}`)}
                    header={
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: "monospace",
                            color: skill.status === "planned" ? "var(--muted)" : "var(--text)",
                          }}
                        >
                          {skill.name}
                        </span>
                        <StatusBadge status={skill.status} />
                      </div>
                    }
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: skill.status === "planned" ? "#667" : "var(--muted)",
                        lineHeight: 1.7,
                        marginTop: 10,
                      }}
                    >
                      {skill.description}
                    </div>
                    {skill.tags.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {skill.tags.map((tag) => (
                          <Tag key={tag.label} label={tag.label} color={tag.color} muted={skill.status === "planned"} />
                        ))}
                      </div>
                    )}
                    {skill.filePath && (
                      <div style={{ marginTop: 10, fontSize: 10, color: "#556", fontFamily: "monospace" }}>
                        {skill.filePath}
                      </div>
                    )}
                  </ExpandableRow>
                ))}
              </div>
            ))}
            {/* Legend */}
            <div className="arch-legend">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 3, height: 14, background: "var(--green)", borderRadius: 2 }} />
                <span style={{ fontSize: 10, color: "var(--muted)" }}>Live (solid border)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 3, height: 14, borderLeft: "3px dashed var(--muted)" }} />
                <span style={{ fontSize: 10, color: "var(--muted)" }}>Planned (dashed border, muted text)</span>
              </div>
            </div>
          </section>

          {/* §6 DEPLOYED APPS */}
          <section
            id="apps"
            className="arch-section"
            ref={(el) => { sectionRefs.current["apps"] = el; }}
          >
            <div className="arch-section-label" style={{ color: "var(--kojo-yellow)" }}>§6</div>
            <div className="arch-section-title">Deployed Apps</div>
            <div className="arch-section-desc">Live applications deployed on Vercel under the RevOps Hub.</div>
            {APPS.map((app) => (
              <ExpandableRow
                key={app.name}
                borderColor={app.status === "live" ? "var(--green)" : "var(--muted)"}
                planned={app.status === "coming-soon"}
                expanded={expandedItems.has(`app-${app.name}`)}
                onToggle={() => toggleItem(`app-${app.name}`)}
                header={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: app.status === "coming-soon" ? "var(--muted)" : "var(--text)",
                      }}
                    >
                      {app.name}
                    </span>
                    <span className="label" style={{ color: "var(--teal)", marginBottom: 0 }}>{app.category}</span>
                    {app.route && (
                      <code style={{ fontSize: 10, color: "var(--muted)", background: "var(--bg)", padding: "1px 5px", borderRadius: 3 }}>
                        {app.route}
                      </code>
                    )}
                    <StatusBadge status={app.status === "coming-soon" ? "coming-soon" : "live"} />
                    {app.automation && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--kojo-yellow)",
                          background: "rgba(234, 179, 8, 0.12)",
                          padding: "2px 8px",
                          borderRadius: 10,
                          fontWeight: 500,
                        }}
                      >
                        {app.automation}
                      </span>
                    )}
                  </div>
                }
              >
                <div
                  style={{
                    fontSize: 11,
                    color: app.status === "coming-soon" ? "#667" : "var(--muted)",
                    lineHeight: 1.7,
                    marginTop: 10,
                  }}
                >
                  {app.description}
                </div>
                {app.route && app.status === "live" && (
                  <div style={{ marginTop: 10 }}>
                    <Link
                      href={app.route}
                      style={{ fontSize: 11, fontWeight: 600, color: "var(--kojo-yellow)", textDecoration: "none" }}
                    >
                      Open dashboard →
                    </Link>
                  </div>
                )}
              </ExpandableRow>
            ))}
          </section>

          {/* §7 DATA PIPELINE */}
          <section
            id="data-pipeline"
            className="arch-section"
            ref={(el) => { sectionRefs.current["data-pipeline"] = el; }}
          >
            <div className="arch-section-label" style={{ color: "var(--blue)" }}>§7</div>
            <div className="arch-section-title">Data Pipeline</div>
            <div className="arch-section-desc">Two paths from Salesforce to insight — one for dashboards, one for real-time queries.</div>

            {/* Dashboard Path */}
            <div style={{ fontSize: 9, color: "var(--teal)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600, marginBottom: 10 }}>
              Dashboard Path (Coefficient sync, real-time fetch)
            </div>
            <div className="arch-flow">
              <div className="arch-flow-node">
                <div style={{ fontSize: 12, fontWeight: 600 }}>Salesforce</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Source of truth</div>
              </div>
              <div className="arch-flow-arrow" style={{ color: "var(--teal)" }}>→</div>
              <div className="arch-flow-node">
                <div style={{ fontSize: 12, fontWeight: 600 }}>Coefficient</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Sync engine</div>
              </div>
              <div className="arch-flow-arrow" style={{ color: "var(--teal)" }}>→</div>
              <div className="arch-flow-node">
                <div style={{ fontSize: 12, fontWeight: 600 }}>Google Sheets</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Public CSV export</div>
              </div>
              <div className="arch-flow-arrow" style={{ color: "var(--teal)" }}>→</div>
              <div className="arch-flow-node highlight">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--kojo-yellow)" }}>Vercel App</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Server-side fetch</div>
              </div>
            </div>
            <div className="arch-flow-explainer">
              Coefficient syncs SFDC reports to Google Sheets. The pipeline tab refreshes hourly; other tabs run on daily or manual schedules set per-tab in Coefficient. The Next.js app fetches each sheet as CSV via public export URL on every page load (force-dynamic, no caching) — so data freshness tracks whichever tab backs the view. Fallback: local CSV in{" "}
              <code style={{ fontSize: 9 }}>data/</code> directory.
            </div>

            {/* Real-time Path */}
            <div style={{ fontSize: 9, color: "var(--yellow)", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600, marginBottom: 10, marginTop: 24 }}>
              Real-Time Path (on-demand)
            </div>
            <div className="arch-flow">
              <div className="arch-flow-node">
                <div style={{ fontSize: 12, fontWeight: 600 }}>Salesforce</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Live SOQL queries</div>
              </div>
              <div className="arch-flow-arrow" style={{ color: "var(--yellow)" }}>→</div>
              <div className="arch-flow-node">
                <div style={{ fontSize: 12, fontWeight: 600 }}>sf CLI</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Authenticated locally</div>
              </div>
              <div className="arch-flow-arrow" style={{ color: "var(--yellow)" }}>→</div>
              <div className="arch-flow-node highlight">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--kojo-yellow)" }}>Claude Code</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Bash tool execution</div>
              </div>
            </div>
            <div className="arch-flow-explainer">
              Claude Code runs <code style={{ fontSize: 9 }}>sf data query</code> via the Bash tool for real-time SFDC lookups. Used by skills like /deal-inspect (planned) and ad-hoc analysis. Not an MCP server — direct CLI execution.
            </div>
          </section>

          {/* §8 VISIBILITY SYSTEM */}
          <section
            id="visibility"
            className="arch-section"
            ref={(el) => { sectionRefs.current["visibility"] = el; }}
          >
            <div className="arch-section-label" style={{ color: "var(--green)" }}>§8</div>
            <div className="arch-section-title">Visibility System</div>
            <div className="arch-section-desc">Three layers track every change from code to stakeholder view.</div>
            <div className="arch-vis-cards">
              <div className="arch-vis-card">
                <div style={{ marginBottom: 8 }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2">
                    <circle cx="12" cy="12" r="4" />
                    <line x1="1.05" y1="12" x2="7" y2="12" />
                    <line x1="17.01" y1="12" x2="22.96" y2="12" />
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Git</div>
                <div style={{ fontSize: 10, color: "var(--teal)", fontWeight: 600, marginBottom: 6 }}>Code Truth</div>
                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>Every commit to main</div>
              </div>
              <div className="arch-vis-arrow" style={{ color: "var(--teal)" }}>→</div>
              <div className="arch-vis-card">
                <div style={{ marginBottom: 8 }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--kojo-yellow)" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>/updates</div>
                <div style={{ fontSize: 10, color: "var(--kojo-yellow)", fontWeight: 600, marginBottom: 6 }}>Stakeholder Changelog</div>
                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
                  CLAUDE.md auto-appends to <code style={{ fontSize: 9 }}>changelog.json</code> on commit to main
                </div>
              </div>
              <div className="arch-vis-arrow" style={{ color: "var(--teal)" }}>→</div>
              <div className="arch-vis-card">
                <div style={{ marginBottom: 8 }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Notion</div>
                <div style={{ fontSize: 10, color: "var(--blue)", fontWeight: 600, marginBottom: 6 }}>Project Status Truth</div>
                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
                  Notion sync protocol updates project pages after builds
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </>
  );
}
