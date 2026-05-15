#!/usr/bin/env node
/**
 * Converts data/gmv-snapshot-raw.csv (Luke's Customer Summary tab export)
 * to data/customer-gmv-snapshot.json.
 *
 * CSV shape (confirmed 2026-04-23):
 *   Rows 1-3: subtotal / summary rows (skipped)
 *   Row 4:    header — Customer, Salesforce ID, Simplified SF ID, Trade Check,
 *             Trade, Simple Trade, Revenue, Rev Range, [15 monthly columns
 *             1/31/2025 → 3/31/2026], MOM % Change, Mom $ Change
 *   Row 5+:   customer rows
 *
 * Output fields per customer:
 *   sfdcId18       — 18-char Salesforce ID (join key)
 *   sfdcId15       — 15-char Simplified SF ID (alt join key)
 *   customer       — display name
 *   annualRevenue  — number (parsed from "$112,000,000 ")
 *   trade          — Simple Trade ("Electrical" | "Mechanical")
 *   t12Gmv         — sum of last 12 monthly columns (Apr 2025 → Mar 2026)
 *   monthsWithData — count of non-zero months in the T12 window (coverage hint)
 *
 * Wrapper adds:
 *   windowEnd      — "2026-03-31"
 *   generatedAt    — ISO timestamp
 *   source         — "Luke Brown 2025_09 GMV Backup.xlsx · Customer Summary"
 */

const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const csvPath = path.join(__dirname, "../data/gmv-snapshot-raw.csv");
const jsonPath = path.join(__dirname, "../data/customer-gmv-snapshot.json");

const raw = fs.readFileSync(csvPath, { encoding: "utf-8" });

// Skip the 3 subtotal rows — Papa.parse with header:true then reads row 4 as header.
const lines = raw.split(/\r?\n/);
const trimmed = lines.slice(3).join("\n");

const { data, errors } = Papa.parse(trimmed, {
  header: true,
  skipEmptyLines: true,
});

if (errors.length > 0) {
  console.error("Parse errors:", errors);
  process.exit(1);
}

const MONTH_COLS = [
  "1/31/2025", "2/28/2025", "3/31/2025",
  "4/30/2025", "5/31/2025", "6/30/2025", "7/31/2025", "8/31/2025", "9/30/2025",
  "10/31/2025", "11/30/2025", "12/31/2025",
  "1/31/2026", "2/28/2026", "3/31/2026",
];
const T12_COLS = MONTH_COLS.slice(-12); // 4/30/2025 → 3/31/2026

function parseDollar(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (s === "" || s === "$0" || s === "$0.00") return 0;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const records = [];
let skippedNoId = 0;

for (const row of data) {
  const sfdcId18 = (row["Salesforce ID"] || "").trim();
  const customer = (row["Customer"] || "").trim();
  if (!sfdcId18 || !customer) {
    skippedNoId += 1;
    continue;
  }

  const monthly = T12_COLS.map((col) => parseDollar(row[col]));
  const t12Gmv = monthly.reduce((a, b) => a + b, 0);
  const monthsWithData = monthly.filter((v) => v > 0).length;

  records.push({
    sfdcId18,
    sfdcId15: (row["Simplified SF ID"] || "").trim(),
    customer,
    annualRevenue: parseDollar(row["Revenue"]),
    trade: (row["Simple Trade"] || "").trim() || null,
    t12Gmv,
    monthsWithData,
  });
}

const output = {
  windowEnd: "2026-03-31",
  generatedAt: new Date().toISOString(),
  source: "Luke Brown 2025_09 GMV Backup.xlsx · Customer Summary",
  recordCount: records.length,
  records,
};

console.log(`Parsed ${records.length} customer records (skipped ${skippedNoId} rows without ID).`);

// Spot-check output for Adams + Besko so divergence is obvious if the CSV shape shifts.
const adams = records.find((r) => r.sfdcId18 === "0014x00000KnGwmAAF");
const besko = records.find((r) => r.sfdcId18 === "0014x00000Kpy9QAAR");
console.log(`  Adams Electric → T12 GMV $${adams?.t12Gmv.toLocaleString()} · ratio ${((adams?.t12Gmv / adams?.annualRevenue) * 100).toFixed(0)}%`);
console.log(`  Besko/Broadway → T12 GMV $${besko?.t12Gmv.toLocaleString()} · ratio ${((besko?.t12Gmv / besko?.annualRevenue) * 100).toFixed(0)}%`);

fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
console.log(`Written ${records.length} records to ${jsonPath}`);
