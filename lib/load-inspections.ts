/**
 * Load the Pulse inspection cache.
 *
 * Primary: Vercel Blob at inspections/latest.json (written by the
 * /api/cron/refresh-inspections cron on Mondays).
 * Fallback: the committed data/inspections.json — used when Blob is empty
 * (pre-first-cron) or unreachable (e.g. local dev without BLOB_READ_WRITE_TOKEN).
 */

import { head } from "@vercel/blob";
import inspectionsFallback from "@/data/inspections.json";
import type { InspectionCache } from "./types";

const BLOB_PATHNAME = "inspections/latest.json";
const FETCH_REVALIDATE_SECONDS = 300;

export async function loadInspections(): Promise<InspectionCache> {
  try {
    const blob = await head(BLOB_PATHNAME);
    const res = await fetch(blob.url, { next: { revalidate: FETCH_REVALIDATE_SECONDS } });
    if (!res.ok) {
      console.warn(`[load-inspections] Blob fetch returned ${res.status}; using fallback`);
      return inspectionsFallback as InspectionCache;
    }
    return (await res.json()) as InspectionCache;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[load-inspections] Blob unavailable (${msg}); using fallback`);
    return inspectionsFallback as InspectionCache;
  }
}
