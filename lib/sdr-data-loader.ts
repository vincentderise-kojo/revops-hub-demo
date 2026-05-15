import { RawSdrMeeting, SdrMeeting } from "./types-sdr";
import { SPREADSHEET_ID, SHEET_GIDS } from "./config";

function parseSdrMeeting(raw: RawSdrMeeting): SdrMeeting | null {
  const dateStr = raw["Qualification Set Date"];
  if (!dateStr) return null;

  const qualificationSetDate = new Date(dateStr);
  if (isNaN(qualificationSetDate.getTime())) return null;

  const mhdStr = raw["Meeting Held Date"];
  let meetingHeldDate: Date | null = null;
  if (mhdStr) {
    const d = new Date(mhdStr);
    if (!isNaN(d.getTime())) meetingHeldDate = d;
  }

  return {
    opportunityName: raw["Opportunity Name"] || "",
    qualificationSetDate,
    sdrOwner: raw["SDR Owner"] || "",
    stage: raw.Stage || "",
    amount: parseFloat(raw.Amount) || 0,
    assignedAE: raw["Assigned Account Executive"] || "",
    saoPoints: parseFloat(raw["SAO Points Calculation"]) || 0,
    meetingHeldDate,
  };
}

export async function fetchSdrMeetings(): Promise<SdrMeeting[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GIDS.sdrSets}`;
  const response = await fetch(url, { next: { revalidate: 0 } });

  if (!response.ok) {
    throw new Error(`SDR Sets sheet fetch failed: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();

  if (csvText.trimStart().startsWith("<!") || csvText.trimStart().startsWith("<html")) {
    throw new Error("SDR Sets sheet returned HTML instead of CSV — is the sheet shared?");
  }

  const PapaMod = await import("papaparse");
  const Papa = PapaMod.default || PapaMod;
  const result = Papa.parse<RawSdrMeeting>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const meetings: SdrMeeting[] = [];
  for (const raw of result.data) {
    const parsed = parseSdrMeeting(raw);
    if (parsed) meetings.push(parsed);
  }

  console.log(`[SDR Sets] Loaded ${meetings.length} meetings from Google Sheets`);
  return meetings;
}
