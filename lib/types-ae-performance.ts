import type { SourceLabel } from "./types";

/**
 * Minimal opp shape used by the AE Performance tab.
 *
 * Distinct from Opportunity (process-pipeline.ts) because:
 *   - Qualification opps may have no Discovery Date (parseOpp would skip them)
 *   - We need an explicit Created Date (clock starts here for SLAs)
 *   - We don't need every field Opportunity carries
 */
export interface AeOpp {
  oppId: string;
  name: string;
  owner: string;                       // AE name (Opportunity Owner: Full Name)
  manager: string;                     // Opportunity Owner: Manager
  source: SourceLabel | null;          // null if Opp Set Type didn't map
  oppSetType: string;                  // raw SFDC value (Inbound / Events / AE - Self Set / etc.)
  stage: string;                       // raw stage name; "Qualification" or Discovery+
  createdDate: Date;
  closeDate: Date | null;
  lastActivityDate: Date | null;
  amount: number;
  annualRevenue: number;               // SFDC Account.AnnualRevenue
  segment: "MM" | "ENT" | null;        // derived from manager via aeSegmentFromManager()
  stageDurationDays: number;           // days in current stage (from SFDC Stage Duration field)
}

/** Opps after parsing: split by which sheet they came from. */
export interface AeOppPools {
  qualificationOpps: AeOpp[];          // from new qualification tab (stage = "Qualification")
  pipelineOpps: AeOpp[];               // from existing pipeline tab (stage = Discovery+)
  qualificationDataAvailable: boolean; // false if the qualification GID is unwired or fetch failed
}

/**
 * A single per-AE row in any of the four matrices.
 *
 * Invariant: rows are only built for AEs whose segment is resolvable via
 * `aeSegmentFromManager`. Null-segment AEs (manager not in MANAGER_SEGMENT_MAP)
 * are filtered out upstream during roster construction in process-ae-performance.ts.
 */
export interface AeMatrixRow {
  ae: string;                          // AE name
  segment: "MM" | "ENT";               // derived team membership (never null — see invariant above)
  metrics: Record<string, AeMetricCell>; // keyed by metric id
}

/** A single computed metric cell — value + color band + drill-down opp ids. */
export interface AeMetricCell {
  value: number | null;                // null = "—" (insufficient data)
  display: string;                     // pre-formatted for rendering (e.g. "82%", "3.2h", "—")
  color: "green" | "yellow" | "red" | "neutral";
  oppIds: string[];                    // opp IDs that contribute to this cell (for drill-down)
}

/** Section 1 + Section 3 are static; Section 2 needs per-pill rows. */
export interface AePerformanceState {
  inboundRows: AeMatrixRow[];          // Section 1 — Inbound
  eventRows: AeMatrixRow[];            // Section 1 — Event
  qualifiedRowsByThreshold: Record<7 | 14 | 30, AeMatrixRow[]>; // Section 2 — keyed by stale-days pill
  selfSetRows: AeMatrixRow[];          // Section 3
  drillDownOpps: AeDrillDownOpp[];     // ALL opps that appear anywhere on the page (deduplicated by oppId)
  qualificationDataAvailable: boolean; // false → Section 1 shows the "not yet wired" placeholder
  generatedAt: string;                 // ISO timestamp for audit
}

/**
 * Lightweight opp shape used for the drill-down table.
 *
 * Invariant: same as AeMatrixRow — only opps whose owner AE has a resolvable
 * segment make it into this list. Null-segment opps are excluded upstream.
 */
export interface AeDrillDownOpp {
  oppId: string;
  name: string;
  ae: string;
  segment: "MM" | "ENT";               // never null — see invariant above
  source: string;                      // human-readable, e.g. "Inbound" / "Events" / "AE Self-Set" / other
  stage: string;
  createdDate: string;                 // ISO
  closeDate: string | null;            // ISO
  lastActivityDate: string | null;     // ISO
  daysSinceLastActivity: number | null;
  amount: number;
  annualRevenue: number;
  stageDurationDays: number;           // days in current stage (Coefficient SFDC field)
  /** Tags this opp into the matrices it contributes to. Powers click-from-cell filtering. */
  appearsIn: AeOppTag[];
}

/**
 * Each tag pinpoints exactly which (matrix, AE, metric) the opp shows up in.
 * Click on a metric cell → drill-down filters where t.section, t.ae, t.metric all match.
 */
export interface AeOppTag {
  section: "inbound" | "event" | "qualified" | "self-set";
  ae: string;
  metric: string;                      // matches AeMatrixRow.metrics key
  /** Only set for "qualified" — the staleness pill threshold this tag applies to. */
  thresholdDays?: 7 | 14 | 30;
}
