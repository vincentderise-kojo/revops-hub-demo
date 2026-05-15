"use client";

import { useState, useEffect } from "react";
import { fmtK } from "@/lib/format";
import type {
  DealInsightRequest,
  SlackMessage,
  DealForecast,
  EndgameInspection,
  InspectionCache,
  InspectionGrade,
} from "@/lib/types";

// ── Props ──

interface DealInsightPanelProps {
  deal: DealInsightRequest;
  onClose: () => void;
  inspections?: InspectionCache;
}

// ── Helpers ──

function stageColor(stage: string): string {
  if (stage === "Discovery") return "var(--blue)";
  if (stage === "Evaluation") return "var(--yellow)";
  if (stage.includes("Contract") || stage.includes("Negotiation"))
    return "var(--green)";
  return "var(--muted)";
}

function segmentBg(segment: "MM" | "ENT"): string {
  return segment === "ENT" ? "#4ecdc422" : "#3b82f622";
}

function segmentColor(segment: "MM" | "ENT"): string {
  return segment === "ENT" ? "var(--teal)" : "var(--blue)";
}

function fmtRevenue(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return fmtK(n);
}

function confidenceColor(c: number): string {
  if (c >= 70) return "var(--green)";
  if (c >= 40) return "var(--yellow)";
  return "var(--red)";
}

function inactiveColor(days: number | null): string {
  if (days === null) return "var(--muted)";
  if (days <= 7) return "var(--green)";
  if (days <= 21) return "var(--yellow)";
  return "var(--red)";
}

function gradeColor(grade: InspectionGrade): string {
  if (grade === "green") return "var(--green)";
  if (grade === "yellow") return "var(--yellow)";
  return "var(--red)";
}

function forecastReadColor(read: EndgameInspection["forecastRead"]): string {
  if (read === "Commit") return "var(--green)";
  if (read === "Best Case") return "var(--yellow)";
  if (read === "Remove") return "var(--red)";
  return "var(--muted)";
}

function fmtCacheAge(generatedAt: string): string {
  const generated = new Date(generatedAt);
  const ageMs = Date.now() - generated.getTime();
  const ageHours = ageMs / 3_600_000;
  if (ageHours < 1) return "just refreshed";
  if (ageHours < 24) return `${Math.round(ageHours)}h ago`;
  return `${Math.round(ageHours / 24)}d ago`;
}

// ── Subcomponents ──

function SlackSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            background: "#131f2b",
            borderRadius: 8,
            padding: 14,
            borderLeft: "3px solid var(--border)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        >
          <div
            style={{
              height: 12,
              width: "40%",
              background: "#1a2a3a",
              borderRadius: 4,
              marginBottom: 8,
            }}
          />
          <div
            style={{
              height: 10,
              width: "60%",
              background: "#1a2a3a",
              borderRadius: 4,
              marginBottom: 6,
            }}
          />
          <div
            style={{
              height: 10,
              width: "80%",
              background: "#1a2a3a",
              borderRadius: 4,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function ForecastSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#1a2a3a",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            height: 14,
            width: "50%",
            background: "#1a2a3a",
            borderRadius: 4,
            marginBottom: 8,
          }}
        />
        <div
          style={{
            height: 10,
            width: "70%",
            background: "#1a2a3a",
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  );
}

function ForecastDisplay({
  forecast,
  hasSlack,
}: {
  forecast: DealForecast;
  hasSlack: boolean;
}) {
  const color = confidenceColor(forecast.confidence);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
        {/* Confidence circle */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: `3px solid ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color }}>
            {forecast.confidence}%
          </span>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color }}>
            {forecast.label}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            Based on {hasSlack ? "SFDC data + Slack signals" : "SFDC data only"}
          </div>
        </div>
      </div>
      <div
        style={{
          background: "#131f2b",
          borderRadius: 8,
          padding: 14,
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text)",
        }}
      >
        {forecast.narrative}
      </div>
    </div>
  );
}

// ── Endgame Inspection Section ──

function InspectionDimBar({ label, dim }: { label: string; dim: { grade: InspectionGrade; level: 1 | 2 | 3 | 4 } }) {
  const color = gradeColor(dim.grade);
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            style={{
              width: 16,
              height: 6,
              borderRadius: 2,
              background: n <= dim.level ? color : "var(--border)",
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: "capitalize" }}>
        {dim.grade}
      </div>
    </div>
  );
}

function InspectionSection({
  inspection,
  generatedAt,
}: {
  inspection: EndgameInspection;
  generatedAt: string;
}) {
  const fcColor = forecastReadColor(inspection.forecastRead);
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Endgame Inspection</span>
        <span style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 0.2, textTransform: "none" }}>
          cached · {fmtCacheAge(generatedAt)}
        </span>
      </div>

      {/* 4 dim bars */}
      <div
        style={{
          background: "#131f2b",
          borderRadius: 8,
          padding: 14,
          marginBottom: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 12,
        }}
      >
        <InspectionDimBar label="Champion" dim={inspection.grades.champion} />
        <InspectionDimBar label="EB" dim={inspection.grades.economicBuyer} />
        <InspectionDimBar label="Comp. Event" dim={inspection.grades.compellingEvent} />
        <InspectionDimBar label="Dec. Process" dim={inspection.grades.decisionProcess} />
      </div>

      {/* Engagement stats */}
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        Last {inspection.engagement.windowDays}d:{" "}
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{inspection.engagement.meetings}</span> mtgs ·{" "}
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{inspection.engagement.incomingEmails}</span> inbound emails ·{" "}
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{inspection.engagement.slackMentions}</span> Slack
      </div>

      {/* Latest signal pull quote */}
      <div
        style={{
          background: "#131f2b",
          borderRadius: 8,
          padding: 14,
          borderLeft: "3px solid var(--teal)",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Latest Signal · {inspection.latestSignal.date}
        </div>
        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.45, fontStyle: "italic", marginBottom: 6 }}>
          &ldquo;{inspection.latestSignal.quote}&rdquo;
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>— {inspection.latestSignal.speaker}</div>
      </div>

      {/* The Two Things */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
          The Two Things
        </div>
        <ol style={{ paddingLeft: 18, margin: 0, fontSize: 12, color: "var(--text)", lineHeight: 1.55 }}>
          {inspection.twoThings.map((t, i) => (
            <li key={i} style={{ marginBottom: 6 }}>{t}</li>
          ))}
        </ol>
      </div>

      {/* Coach the Rep */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
          Coach the Rep
        </div>
        <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, color: "var(--text)", lineHeight: 1.55 }}>
          {inspection.coachTheRep.map((c, i) => (
            <li key={i} style={{ marginBottom: 6 }}>{c}</li>
          ))}
        </ul>
      </div>

      {/* Forecast Read */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#131f2b",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
          Forecast Read
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            padding: "4px 12px",
            borderRadius: 12,
            background: `${fcColor}22`,
            color: fcColor,
          }}
        >
          {inspection.forecastRead}
        </span>
      </div>

      {/* Placeholder action row (v1 — non-functional) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled style={inspectionActionBtn}>Open full inspection ↗</button>
        <button disabled style={inspectionActionBtn}>Send to rep in Slack 💬</button>
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>
        Actions wire up in Phase 2
      </div>
    </div>
  );
}

const inspectionActionBtn: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 600,
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--muted)",
  cursor: "not-allowed",
  fontFamily: "inherit",
  opacity: 0.7,
};

// ── Main Component ──

export default function DealInsightPanel({ deal, onClose, inspections }: DealInsightPanelProps) {
  const inspectionCache = inspections;
  const matchedInspection = deal.oppId && inspectionCache ? inspectionCache.inspections[deal.oppId] : undefined;
  const [slackMessages, setSlackMessages] = useState<SlackMessage[] | null>(null);
  const [forecast, setForecast] = useState<DealForecast | null>(null);
  const [slackError, setSlackError] = useState(false);
  const [forecastError, setForecastError] = useState(false);

  // Demo stub — the production app fetches live Slack + Anthropic-generated forecast here.
  useEffect(() => {
    setSlackMessages([
      {
        author: "Demo User",
        date: "2026-05-15",
        channel: "deal-channel",
        text: "Portfolio demo: in the production app, Slack messages relevant to this account are surfaced here in real time.",
      },
    ]);
    setForecast({
      confidence: 72,
      label: "On Track",
      narrative:
        "Portfolio demo: in the production app, an LLM analyses SFDC data and Slack signals to generate a deal forecast narrative here. The panel layout and interaction model are fully functional — only the live data feed is disabled in this version.",
    });
  }, [deal]);

  // ── Snapshot grid items ──
  const snapItems = [
    { label: "Owner", value: deal.owner },
    { label: "Close Date", value: deal.closeDate || "—" },
    {
      label: "Inactive",
      value: deal.inactiveDays !== null ? `${deal.inactiveDays}d` : "—",
      color: inactiveColor(deal.inactiveDays),
    },
    { label: "Discovery", value: deal.discoveryDate },
    { label: "Account", value: deal.accountName },
    { label: "Annual Rev", value: deal.annualRevenue > 0 ? fmtRevenue(deal.annualRevenue) : "—" },
  ];

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 998,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 450,
          height: "100vh",
          background: "#0f1923",
          borderLeft: "1px solid var(--border)",
          zIndex: 999,
          overflowY: "auto",
          padding: 20,
          animation: "slideIn 0.25s ease-out",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: 6,
                lineHeight: 1.3,
              }}
            >
              {deal.oppName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                {fmtK(deal.amount)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: `${stageColor(deal.stage)}22`,
                  color: stageColor(deal.stage),
                  fontWeight: 600,
                }}
              >
                {deal.stage}
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: segmentBg(deal.segment),
                  color: segmentColor(deal.segment),
                  fontWeight: 600,
                }}
              >
                {deal.segment}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: 20,
              cursor: "pointer",
              padding: "0 0 0 12px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Deal Snapshot ── */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            Deal Snapshot
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            {snapItems.map((item) => (
              <div key={item.label}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: item.color ?? "var(--text)",
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Endgame Inspection (Pulse new-this-week) ── */}
        {matchedInspection && inspectionCache && (
          <InspectionSection
            inspection={matchedInspection}
            generatedAt={inspectionCache.generatedAt}
          />
        )}

        {/* ── Slack Intel ── */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            Slack Intel
          </div>
          {slackMessages === null && !slackError && <SlackSkeleton />}
          {slackError && (
            <div style={{ fontSize: 13, color: "var(--red)" }}>
              Failed to load Slack messages.
            </div>
          )}
          {slackMessages !== null && !slackError && slackMessages.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              No recent Slack mentions found.
            </div>
          )}
          {slackMessages !== null && !slackError && slackMessages.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {slackMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    background: "#131f2b",
                    borderRadius: 8,
                    padding: 14,
                    borderLeft: "3px solid var(--blue)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text)",
                      marginBottom: 4,
                    }}
                  >
                    {msg.author}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginBottom: 6,
                    }}
                  >
                    {msg.date} &middot; #{msg.channel}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── AI Forecast ── */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            AI Forecast
          </div>
          {forecast === null && !forecastError && <ForecastSkeleton />}
          {forecastError && (
            <div style={{ fontSize: 13, color: "var(--red)" }}>
              Failed to load forecast.
            </div>
          )}
          {forecast !== null && !forecastError && (
            <ForecastDisplay
              forecast={forecast}
              hasSlack={slackMessages !== null && slackMessages.length > 0}
            />
          )}
        </div>
      </div>
    </>
  );
}
