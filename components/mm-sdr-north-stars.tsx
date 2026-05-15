"use client";

import { NorthStarMetrics } from "@/lib/types-mm-sdr";
import { MM_SDR_TARGETS } from "@/lib/config";

function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string;
  subtext?: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: "#111",
        border: `1px solid ${color === "var(--green)" ? "#1a3a1a" : color === "var(--red)" || color === "#ff6b6b" ? "#2a1a1a" : "#333"}`,
        borderRadius: 6,
        padding: "10px 12px",
        textAlign: "center",
        minWidth: 80,
      }}
    >
      <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, margin: "2px 0" }}>{value}</div>
      {subtext && <div style={{ fontSize: 10, color: "#999" }}>{subtext}</div>}
    </div>
  );
}

export default function MmSdrNorthStars({ data }: { data: NorthStarMetrics }) {
  const { benchmarks, volume, quality, outcome } = data;

  const volColor = volume.saosThisWeek >= volume.target ? "var(--green)" : "#ff6b6b";
  const evalColor = quality.evalConversionPct >= 0.3 ? "var(--green)" : quality.evalConversionPct >= 0.2 ? "var(--brand-yellow)" : "#ff6b6b";
  const cwColor = outcome.cwRate90d >= outcome.cwTarget ? "var(--green)" : "#ff6b6b";

  return (
    <div style={{ marginBottom: 16 }}>
      {/* BENCHMARKS — trailing 12 months, independent of week selector */}
      <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>
        12-Month Baseline
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <StatCard label="Avg SAOs/Wk" value={String(benchmarks.avgWeeklySaos12mo)} subtext="trailing 12mo" color="var(--teal)" />
        <StatCard label="Eval Rate" value={`${Math.round(benchmarks.evalPct12mo * 100)}%`} subtext="SAO → Eval+" color="var(--teal)" />
        <StatCard label="C/W Rate" value={`${Math.round(benchmarks.cwPct12mo * 100)}%`} subtext="MM outbound" color="var(--teal)" />
        <StatCard label="Other Ch. Eval" value={`${Math.round(benchmarks.evalPctOtherChannels * 100)}%`} subtext="non-outbound MM" color="#ddd" />
        <StatCard label="Dials per SAO" value={String(benchmarks.dialsPerSao)} subtext="trailing 4mo*" color="#ddd" />
      </div>
      <div style={{ fontSize: 10, color: "#999", fontStyle: "italic", marginBottom: 16 }}>
        Fixed baselines — not affected by week selector. *Dials per SAO uses 4-month call data window; other metrics use full 12 months.
      </div>

      <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>
        Volume
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <StatCard label="Selected Week" value={String(volume.saosThisWeek)} color={volColor} />
        <StatCard label="SAOs Prior Week" value={String(volume.saosLastWeek)} color="#ddd" />
        <StatCard label="SAOs 4-Wk Avg" value={String(volume.fourWeekAvg)} color="#ddd" />
        <StatCard label="SAO Target" value={`${volume.target}/wk`} subtext={`${MM_SDR_TARGETS.saosPerMonth}/mo`} color="#fff" />
      </div>

      <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>
        Quality
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <StatCard label="Selected Wk → Eval+" value={`${quality.saosAtEvalThisWeek} of ${quality.saosCreatedThisWeek}`} color={evalColor} />
        <StatCard label="Prior 4-Wk Avg" value={`${quality.saosAtEvalFourWeekAvg} of ${quality.saosCreatedFourWeekAvg}`} color="#ddd" />
        <StatCard label="Eval Conv % (12 wk)" value={`${Math.round(quality.evalConversionPct * 100)}%`} subtext={`${quality.totalSaosInPeriod} SAOs in period`} color={evalColor} />
      </div>
      <div style={{ fontSize: 10, color: "#999", fontStyle: "italic", marginTop: -10, marginBottom: 16 }}>
        Cohort advancement: of SAOs created in the period, how many reached Evaluation+. Recent weeks will be low — SAOs need time to advance.
      </div>

      <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>
        Outcome
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <StatCard label="C/W (90d)" value={String(outcome.cwCount90d)} subtext={`of ${outcome.totalSaos90d} SAOs`} color={cwColor} />
        <StatCard label="C/W Rate (90d)" value={`${Math.round(outcome.cwRate90d * 100)}%`} color={cwColor} />
        <StatCard label="C/W Target" value={`${Math.round(outcome.cwTarget * 100)}%`} color="#fff" />
      </div>
      <div style={{ fontSize: 10, color: "#999", fontStyle: "italic", marginBottom: 16 }}>
        Trailing 90-day figures — won&apos;t move weekly. Stage 2 advancement is the leading indicator.
      </div>
    </div>
  );
}
