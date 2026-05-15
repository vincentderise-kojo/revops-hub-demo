"use client";

import { useState, useCallback } from "react";
import { MmSdrState } from "@/lib/types-mm-sdr";
import { exportMmSdrDocx } from "@/lib/mm-sdr-export";
import MmSdrNorthStars from "./mm-sdr-north-stars";
import MmSdrActivity from "./mm-sdr-activity";
import MmSdrTargeting from "./mm-sdr-targeting";
import MmSdrSaoPipeline from "./mm-sdr-sao-pipeline";
import MmSdrSaoQuality from "./mm-sdr-sao-quality";
import Link from "next/link";

export default function MmSdrDashboard({ data, weekOffset }: { data: MmSdrState; weekOffset: number }) {
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const [methodologyExpanded, setMethodologyExpanded] = useState(false);

  // -1 = current in-progress week, 0 = last complete, 1-11 = further back
  const weekOptions = [-1, ...Array.from({ length: 12 }, (_, i) => i)];

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "24px 16px",
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: "#e0e0e0",
        background: "#0a0a0a",
        minHeight: "100vh",
      }}
    >
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Link href="/hub" style={{ fontSize: 10, color: "#aaa", textDecoration: "none" }}>Hub</Link>
            <span style={{ color: "#555" }}>/</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>MM SDR Outbound</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#bbb" }}>Week of {data.focusWeekLabel}</span>
            <select
              value={weekOffset}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                window.location.href = val === 0 ? "/mm-sdr" : `/mm-sdr?week=${val}`;
              }}
              style={{
                background: "#1a1a1a",
                color: "#ccc",
                border: "1px solid #333",
                borderRadius: 4,
                padding: "2px 6px",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {weekOptions.map((i) => (
                <option key={i} value={i}>
                  {i === -1 ? "Current Week" : i === 0 ? "Last Complete" : `${i}w ago`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={() => exportMmSdrDocx(data)}
          style={{
            background: "#1a3a1a",
            color: "var(--green)",
            border: "1px solid #2a4a2a",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Export Weekly Review
        </button>
      </div>

      {/* MM ROSTER PILL */}
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => setRosterExpanded(!rosterExpanded)}
          style={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: 10,
            color: "#bbb",
            cursor: "pointer",
          }}
        >
          MM Roster ({data.mmRoster.length}) {rosterExpanded ? "▾" : "▸"}
        </button>
        {rosterExpanded && (
          <div style={{ marginTop: 6, padding: "8px 12px", background: "#111", border: "1px solid #333", borderRadius: 6, fontSize: 11, color: "#ddd" }}>
            {data.mmRoster.join(" · ")}
          </div>
        )}
      </div>

      {/* CONTEXT BANNER */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#111", borderRadius: 6, marginBottom: 20, border: "1px solid #333" }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: "var(--green)" }} />
        <span style={{ fontSize: 11, color: "#bbb" }}>
          MM outbound pipeline only — filtered by{" "}
          <span style={{ color: "#fff", fontWeight: 600 }}>account segment + Opp Set Type = SDR Outbound</span>
        </span>
      </div>

      {/* SECTION 1: NORTH STARS */}
      <MmSdrNorthStars data={data.northStars} />

      {/* SECTION 2: ACTIVITY METRICS */}
      <div style={{ padding: 20, background: "#111", borderRadius: 6, marginBottom: 16, border: "1px solid #333" }}>
        <MmSdrActivity data={data.activity} />
      </div>

      {/* SECTION 3: TARGETING */}
      <div style={{ padding: 20, background: "#111", borderRadius: 6, marginBottom: 16, border: "1px solid #333" }}>
        <MmSdrTargeting data={data.targeting} />
      </div>

      {/* SECTION 4: SAO PIPELINE */}
      <div style={{ padding: 20, background: "#111", borderRadius: 6, marginBottom: 16, border: "1px solid #333" }}>
        <MmSdrSaoPipeline data={data.saoPipeline} />
      </div>

      {/* SECTION 5: SAO QUALITY */}
      <div style={{ padding: 20, background: "#111", borderRadius: 6, marginBottom: 16, border: "1px solid #333" }}>
        <MmSdrSaoQuality data={data.saoQuality} />
      </div>

      {/* METHODOLOGY */}
      <div style={{ marginTop: 8, marginBottom: 24 }}>
        <button
          onClick={() => setMethodologyExpanded(!methodologyExpanded)}
          style={{
            background: "none",
            border: "none",
            color: "#777",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Filtering Methodology {methodologyExpanded ? "▾" : "▸"}
        </button>
        {methodologyExpanded && (
          <div
            style={{
              marginTop: 8,
              padding: "16px 20px",
              background: "#111",
              border: "1px solid #333",
              borderRadius: 6,
              fontSize: 11,
              color: "#bbb",
              lineHeight: 1.8,
            }}
          >
            <div style={{ fontWeight: 600, color: "#fff", marginBottom: 8 }}>
              Three Filtering Strategies
            </div>
            <div style={{ marginBottom: 12 }}>
              This dashboard uses three distinct filtering approaches depending on the data source.
              Each source carries different fields, so the strongest available filter is applied to each.
            </div>

            <div style={{ fontWeight: 600, color: "var(--teal)", marginBottom: 4 }}>
              1. Pipeline Tab (North Stars, Accepted SAO Characteristics)
            </div>
            <div style={{ marginBottom: 12, paddingLeft: 12 }}>
              Filters by opp-level attributes: <span style={{ color: "#fff" }}>segment = MM</span> AND{" "}
              <span style={{ color: "#fff" }}>Opp Set Type = SDR Set - Outbound</span>.
              Roster-independent — the opp carries its own segment (Annual Revenue threshold + AE manager override).
              Handles historical promotions correctly because the opp&apos;s attributes don&apos;t change when an SDR moves teams.
            </div>

            <div style={{ fontWeight: 600, color: "var(--brand-yellow)", marginBottom: 4 }}>
              2. SDR Sets Tab (SAO Acceptance / Rejection)
            </div>
            <div style={{ marginBottom: 12, paddingLeft: 12 }}>
              Filters directly on sdrSets fields: <span style={{ color: "#fff" }}>Opp Set Type = SDR Set - Outbound</span> AND{" "}
              <span style={{ color: "#fff" }}>Annual Revenue &lt; $75M</span> AND{" "}
              <span style={{ color: "#fff" }}>AE not on ENT team</span> (manager override).
              SDR Sets and Pipeline are different opportunity types — Opportunity IDs do not match across tabs.
              Date filter uses Qualification Set Date (when the meeting was booked), not Discovery Date.
            </div>

            <div style={{ fontWeight: 600, color: "var(--green)", marginBottom: 4 }}>
              3. Calls Tab (Activity Metrics, Account Targeting)
            </div>
            <div style={{ marginBottom: 12, paddingLeft: 12 }}>
              Filters by <span style={{ color: "#fff" }}>time-aware MM SDR roster</span> built per-month from quota records.
              Calls don&apos;t carry account segment or Opp Set Type — the SDR&apos;s identity is the only available filter.
              The roster is built per-month, so a rep who was MM in January but moved to ENT in March has their January calls counted as MM activity.
              Team Leads with individual quotas (e.g., Valeria) are included.
            </div>

            <div style={{ fontWeight: 600, color: "#fff", marginBottom: 4 }}>
              MM Roster Detection
            </div>
            <div style={{ paddingLeft: 12 }}>
              Built from SFDC quota records: SDR quota quantity = 6 → ENT, all others → MM.
              Excludes reps who have transitioned to AE roles. Includes team leads who have their own individual SDR quota.
              Roster is time-aware — built per-month using quota date ranges for historical accuracy.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
