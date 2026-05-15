import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  WidthType,
  AlignmentType,
  BorderStyle,
} from "docx";
import { MmSdrState } from "./types-mm-sdr";

// ── Helpers ──

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, font: "Calibri" })] })],
    width: { size: 0, type: WidthType.AUTO },
  });
}

function cell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18, font: "Calibri" })] })],
    width: { size: 0, type: WidthType.AUTO },
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 300, after: 100 } });
}

function bodyText(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: "Calibri" })],
    spacing: { after: 100 },
  });
}

function emptyPrompt(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, color: "888888", size: 20, font: "Calibri" })],
    spacing: { after: 200 },
  });
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ── Build Document ──

export function buildMmSdrDocument(data: MmSdrState): Document {
  const tables: (Paragraph | Table)[] = [];

  // Title
  tables.push(
    new Paragraph({
      text: "Mid-Market SDR Weekly Pipeline Review",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 100 },
    })
  );
  tables.push(bodyText(`Week of ${data.focusWeekLabel}`));
  tables.push(bodyText(`MM Roster: ${data.mmRoster.join(", ")}`));

  // ── Section 1: North Star Metrics ──
  tables.push(sectionHeading("North Star Metrics"));

  tables.push(subHeading("Volume"));
  tables.push(
    new Table({
      rows: [
        new TableRow({ children: [headerCell("This Week"), headerCell("Last Week"), headerCell("4-Wk Avg"), headerCell("Target")] }),
        new TableRow({
          children: [
            cell(String(data.northStars.volume.saosThisWeek)),
            cell(String(data.northStars.volume.saosLastWeek)),
            cell(String(data.northStars.volume.fourWeekAvg)),
            cell(`${data.northStars.volume.target}/wk`),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    })
  );

  tables.push(subHeading("Quality"));
  tables.push(
    new Table({
      rows: [
        new TableRow({ children: [headerCell("At Eval+ This Wk"), headerCell("4-Wk Avg"), headerCell("Eval Conv %")] }),
        new TableRow({
          children: [
            cell(String(data.northStars.quality.saosAtEvalThisWeek)),
            cell(String(data.northStars.quality.saosAtEvalFourWeekAvg)),
            cell(pct(data.northStars.quality.evalConversionPct)),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    })
  );

  tables.push(subHeading("Outcome (Trailing 90d)"));
  tables.push(
    new Table({
      rows: [
        new TableRow({ children: [headerCell("SAOs C/W"), headerCell("C/W Rate"), headerCell("Target")] }),
        new TableRow({
          children: [
            cell(String(data.northStars.outcome.cwCount90d)),
            cell(pct(data.northStars.outcome.cwRate90d)),
            cell(pct(data.northStars.outcome.cwTarget)),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    })
  );

  // ── Section 2: Activity Metrics ──
  tables.push(sectionHeading("SDR Activity Metrics"));
  const activityRows = [
    new TableRow({
      children: [headerCell("SDR"), headerCell("Calls"), headerCell("Connects"), headerCell("Connect %"), headerCell("Sets"), headerCell("Set %"), headerCell("Mtgs Held"), headerCell("Hold %"), headerCell("SAOs"), headerCell("SAO %")],
    }),
    ...data.activity.rows.map(
      (r) =>
        new TableRow({
          children: [cell(r.sdrName), cell(String(r.callsMade)), cell(String(r.connects)), cell(pct(r.connectRate)), cell(String(r.sets)), cell(pct(r.setRate)), cell(String(r.meetingsHeld)), cell(pct(r.meetingHoldRate)), cell(String(r.saosCreated)), cell(pct(r.saoRate))],
        })
    ),
    new TableRow({
      children: [
        cell("Team Total", true),
        cell(String(data.activity.teamTotal.callsMade), true),
        cell(String(data.activity.teamTotal.connects), true),
        cell(pct(data.activity.teamTotal.connectRate), true),
        cell(String(data.activity.teamTotal.sets), true),
        cell(pct(data.activity.teamTotal.setRate), true),
        cell(String(data.activity.teamTotal.meetingsHeld), true),
        cell(pct(data.activity.teamTotal.meetingHoldRate), true),
        cell(String(data.activity.teamTotal.saosCreated), true),
        cell(pct(data.activity.teamTotal.saoRate), true),
      ],
    }),
  ];
  tables.push(new Table({ rows: activityRows, width: { size: 100, type: WidthType.PERCENTAGE } }));

  // ── Section 3: Account Targeting ──
  tables.push(sectionHeading("Account Targeting Coverage"));
  const targetingRows = [
    new TableRow({
      children: [headerCell("SDR"), headerCell("Accts Touched"), headerCell("Avg Contacts/Acct"), headerCell("1 Contact"), headerCell("3+ Contacts"), headerCell("No Activity 30d")],
    }),
    ...data.targeting.rows.map(
      (r) =>
        new TableRow({
          children: [cell(r.sdrName), cell(String(r.uniqueAccountsTouched)), cell(String(r.avgContactsPerAccount)), cell(String(r.accountsWith1Contact)), cell(String(r.accountsWith3PlusContacts)), cell(String(r.accountsNoActivity30d))],
        })
    ),
  ];
  tables.push(new Table({ rows: targetingRows, width: { size: 100, type: WidthType.PERCENTAGE } }));

  // ── Section 4: SAO Acceptance / Rejection ──
  tables.push(sectionHeading("SAO Acceptance / Rejection"));
  if (data.saoPipeline.acceptanceSummary.length > 0) {
    const saoRows = [
      new TableRow({
        children: [headerCell("AE"), headerCell("Rcvd"), headerCell("Accepted"), headerCell("Rejected"), headerCell("Accept %"), headerCell("Pending")],
      }),
      ...data.saoPipeline.acceptanceSummary.map(
        (r) =>
          new TableRow({
            children: [cell(r.aeName), cell(String(r.saosReceived)), cell(String(r.accepted)), cell(String(r.rejected)), cell(pct(r.acceptanceRate)), cell(String(r.pending))],
          })
      ),
    ];
    tables.push(new Table({ rows: saoRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  if (data.saoPipeline.rejectionLog.length > 0) {
    tables.push(subHeading("Rejection Log"));
    const rejRows = [
      new TableRow({ children: [headerCell("Opp"), headerCell("AE"), headerCell("SDR"), headerCell("Reason"), headerCell("Notes")] }),
      ...data.saoPipeline.rejectionLog.map(
        (r) =>
          new TableRow({
            children: [cell(r.oppName), cell(r.ae), cell(r.sdr), cell(r.rejectionReason), cell(r.notes || "—")],
          })
      ),
    ];
    tables.push(new Table({ rows: rejRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  // ── Section 5: Accepted SAO Characteristics ──
  tables.push(sectionHeading("Accepted SAO Characteristics"));
  if (data.saoQuality.acceptedSaos.length > 0) {
    const qualRows = [
      new TableRow({ children: [headerCell("Opp"), headerCell("AE"), headerCell("Company"), headerCell("Industry"), headerCell("Entry Point"), headerCell("Amount")] }),
      ...data.saoQuality.acceptedSaos.map(
        (s) =>
          new TableRow({
            children: [cell(s.oppName), cell(s.ae), cell(s.company), cell(s.industry || "—"), cell(s.entryPointTitle), cell(`$${Math.round(s.amount).toLocaleString()}`)],
          })
      ),
    ];
    tables.push(new Table({ rows: qualRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  } else {
    tables.push(emptyPrompt("No accepted MM outbound SAOs this week."));
  }

  // ── Templated Sections (blank for manual/MCP population) ──
  tables.push(sectionHeading("Qualitative Call Analysis (AI)"));
  tables.push(emptyPrompt("[Paste AI-generated team summary here]"));
  for (const name of data.mmRoster) {
    tables.push(subHeading(name));
    tables.push(emptyPrompt("Strengths identified:"));
    tables.push(emptyPrompt("Areas of opportunity:"));
    tables.push(emptyPrompt("Notable calls / coaching moments:"));
  }

  tables.push(sectionHeading("Reschedules / No-Shows Analysis"));
  tables.push(emptyPrompt("[Flag patterns in cancellations or no-shows]"));

  tables.push(sectionHeading("ICP Alignment Check"));
  tables.push(emptyPrompt("[Any accounts touched this week that shouldn't be in the book?]"));

  tables.push(sectionHeading("Under-Penetrated Accounts"));
  tables.push(emptyPrompt("[Accounts with promising ICP fit but low contact coverage]"));

  tables.push(sectionHeading("AE Plays — SDR Outbound Opps"));
  tables.push(emptyPrompt("[What plays did AEs run this week on SDR outbound opps?]"));

  tables.push(sectionHeading("Key Decisions"));
  tables.push(emptyPrompt("[Captured during Tuesday discussion]"));

  tables.push(sectionHeading("Action Items"));
  tables.push(
    new Table({
      rows: [
        new TableRow({ children: [headerCell("Action Item"), headerCell("Owner"), headerCell("Due Date"), headerCell("Status")] }),
        new TableRow({ children: [cell(""), cell(""), cell(""), cell("")] }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    })
  );

  tables.push(sectionHeading("Parking Lot"));
  tables.push(emptyPrompt("[Topics to revisit in a future session]"));

  return new Document({
    sections: [{ children: tables }],
  });
}

// ── Generate + Download ──

export async function exportMmSdrDocx(data: MmSdrState): Promise<void> {
  const doc = buildMmSdrDocument(data);
  const blob = await Packer.toBlob(doc);

  // Extract date from focusWeekStart for filename
  const weekDate = data.focusWeekStart.split("T")[0];
  const filename = `MM_SDR_Weekly_Review_${weekDate}.docx`;

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
