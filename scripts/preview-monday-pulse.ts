import { loadDashboardData } from "../lib/load-dashboard-state";
import { composePulseBlocks, sanityGate } from "../lib/monday-pulse";

function renderBlocks(blocks: any[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.type === "header") {
      lines.push(`\n# ${b.text.text}\n`);
    } else if (b.type === "divider") {
      lines.push(`\n---\n`);
    } else if (b.type === "section" && b.text) {
      lines.push(slackToMd(b.text.text));
    } else if (b.type === "section" && b.fields) {
      const cells = b.fields.map((f: any) => slackToMd(f.text));
      // Two columns like Slack renders fields
      for (let i = 0; i < cells.length; i += 2) {
        const left = cells[i] ?? "";
        const right = cells[i + 1] ?? "";
        lines.push(`${left}    ${right}`);
      }
    } else if (b.type === "actions") {
      const btns = b.elements.map((e: any) => `[${e.text.text}](${e.url})`).join("   ");
      lines.push(`\n${btns}`);
    }
  }
  return lines.join("\n");
}

function slackToMd(s: string): string {
  return s.replace(/\*([^*]+)\*/g, "**$1**");
}

(async () => {
  const { segmented } = await loadDashboardData();
  const state = segmented.all;

  const gate = sanityGate(state);
  if (!gate.ok) {
    console.error(`SANITY GATE FAILED: ${gate.reason}`);
    process.exit(1);
  }

  const { blocks, text } = composePulseBlocks(state);

  console.log("\n========== SLACK FALLBACK TEXT ==========");
  console.log(text);
  console.log("\n========== RENDERED MESSAGE PREVIEW ==========");
  console.log(renderBlocks(blocks));
  console.log("\n========== END ==========\n");
  console.log(`Focus week: ${state.focusWeekLabel}`);
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
