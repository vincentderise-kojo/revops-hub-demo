import { DashboardState } from "@/lib/types";
import { fmtK, pctColor } from "@/lib/format";

export default function ExecSummary({ data }: { data: DashboardState }) {
  return (
    <div className="card">
      <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div className="label">Who reads this</div>
          <div style={{ fontSize: 13 }}>
            Sales &amp; Marketing Managers and Executive Leadership
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="label">What actions do we need to take</div>
          <div style={{ fontSize: 13 }}>
            Recognize the owner groups on pace with the Q2&apos;26 board plan
            this week and direct support toward any trailing groups to keep
            the quarter on track.
          </div>
        </div>
      </div>
      <div
        style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}
      >
        <div style={{ marginBottom: 10 }}>
          <div className="label" style={{ marginBottom: 4 }}>
            Last Fully Completed Week
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
            {data.focusWeekLabel}, {new Date(data.focusWeekStart).getFullYear()}
          </div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          {renderWeekNarrative(data)}
        </div>
        {data.execSummary.gapNarrative && (
          <div style={{ fontSize: 13, lineHeight: 1.8, marginTop: 10 }}>
            <strong>Owner group pacing:</strong> {data.execSummary.gapNarrative}
          </div>
        )}
        <div style={{ fontSize: 13, lineHeight: 1.8, marginTop: 10 }}>
          <strong>MTD context:</strong> {data.execSummary.mtdNarrative}
        </div>
      </div>
    </div>
  );
}

function renderWeekNarrative(data: DashboardState) {
  const { blended, aeUpside } = data.scoreboard;
  const hitColor = pctColor(blended.pctHit);

  return (
    <>
      Board-plan pipeline this week (BDR + Field + Perf):{" "}
      <strong style={{ color: hitColor }}>
        {fmtK(blended.created)}
      </strong>{" "}
      against a{" "}
      <strong style={{ color: "var(--teal)" }}>{fmtK(blended.target)}</strong>{" "}
      weekly target —{" "}
      <strong style={{ color: hitColor }}>
        {blended.pctHit >= 100
          ? `${Math.round(blended.pctHit)}% to goal`
          : `${Math.round(blended.pctHit)}% to goal (${fmtK(Math.abs(blended.gap))} gap)`}
      </strong>
      .
      {aeUpside.created > 0 && (
        <>
          {" "}AE Self-Set upside:{" "}
          <strong>{fmtK(aeUpside.created)}</strong> tracked separately.
        </>
      )}
    </>
  );
}
