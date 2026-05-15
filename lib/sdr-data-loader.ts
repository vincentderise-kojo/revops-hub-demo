import { RawSdrMeeting, SdrMeeting } from "./types-sdr";
import { loadCsvFile, DEMO_CSV_PATHS } from "./data-loader";

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
  // Demo build: read from data/demo/sdrSets.csv
  const rawRows = await loadCsvFile<RawSdrMeeting>(DEMO_CSV_PATHS.sdrSets);
  const meetings: SdrMeeting[] = [];
  for (const raw of rawRows) {
    const parsed = parseSdrMeeting(raw);
    if (parsed) meetings.push(parsed);
  }
  console.log(`[SDR Sets] Loaded ${meetings.length} meetings from demo CSV`);
  return meetings;
}
