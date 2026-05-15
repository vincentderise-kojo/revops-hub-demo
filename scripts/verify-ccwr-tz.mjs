// Verify the CCWR timezone fix end-to-end:
// 1. Use real live-sheet CSV
// 2. Invoke the production parseCcwrOpp + buildCohorts
// 3. Run the script under EDT (the timezone that exposed the bug)
// 4. Assert: Component Assembly Systems lands in 2025-10
//
// Run via: TZ=America/New_York node scripts/verify-ccwr-tz.mjs

import fs from "fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Use ts-node-style on-the-fly transpile via tsx if available.
// Easiest: compile process-ccwr.ts inline using a tiny shim.
// Instead we'll just import via dynamic ESM after running the TypeScript build,
// but to keep it dependency-free, we re-implement parse+filter using the SAME
// public logic by importing the .ts file via the Next.js compiled output.
//
// Simplest reliable path: read the source, transpile with TypeScript, eval.

import ts from "typescript";

const srcPath = new URL("../lib/process-ccwr.ts", import.meta.url);
const cfgPath = new URL("../lib/config.ts", import.meta.url);

function loadTs(p) {
  const code = fs.readFileSync(p, "utf-8");
  return ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

// Hacky inline module: write transpiled JS to tmp and dynamic-import.
const tmpDir = new URL("../.tmp-verify/", import.meta.url);
fs.mkdirSync(tmpDir, { recursive: true });

// Need types.ts and config.ts dependencies too — transpile and write as siblings.
const writes = [
  ["lib/process-ccwr.ts", "process-ccwr.mjs"],
  ["lib/config.ts", "config.mjs"],
  ["lib/types-ccwr.ts", "types-ccwr.mjs"],
  ["lib/types.ts", "types.mjs"],
];
for (const [src, out] of writes) {
  let js = loadTs(new URL(`../${src}`, import.meta.url));
  // rewrite local imports to .mjs
  js = js.replace(/from "\.\/(.+?)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(new URL(out, tmpDir), js);
}

const { processCcwr } = await import(new URL("process-ccwr.mjs", tmpDir).href);

// Load live CSV
import Papa from "papaparse";
const csv = fs.readFileSync("/tmp/ccwr_pipeline.csv", "utf-8");
const rows = Papa.parse(csv, { header: true, skipEmptyLines: true }).data
  .filter((r) => {
    const a = parseFloat(r.Amount);
    return !isNaN(a) && a > 0;
  });

const data = processCcwr(rows);

console.log(`TZ: ${process.env.TZ}, offset: ${new Date().getTimezoneOffset()} min`);
console.log(`Total opps parsed: ${data.allOpps.length}`);

const ca = data.allOpps.find((o) => o.name === "Component Assembly Systems");
console.log(`\nComponent Assembly Systems:`);
console.log(`  discoveryDate stored: "${ca?.discoveryDate}"`);
console.log(`  closeDate stored:     "${ca?.closeDate}"`);

const oct = data.cohorts.find((c) => c.monthKey === "2025-10");
const sep = data.cohorts.find((c) => c.monthKey === "2025-09");
console.log(`\n2025-10 cohort: totalCount=${oct?.totalCount}`);
console.log(`2025-09 cohort: totalCount=${sep?.totalCount}`);

const oct1opps = data.allOpps.filter((o) => o.discoveryDate === "2025-10-01");
console.log(`\nOpps with discoveryDate=2025-10-01: ${oct1opps.length}`);
oct1opps.forEach((o) => console.log(`  - ${o.name}`));

// Exit with status reflecting the assertion
const ok =
  ca?.discoveryDate === "2025-10-01" &&
  oct?.totalCount === 113;
console.log(`\nResult: ${ok ? "PASS" : "FAIL"} (expected discoveryDate=2025-10-01, oct count=113)`);
process.exit(ok ? 0 : 1);
