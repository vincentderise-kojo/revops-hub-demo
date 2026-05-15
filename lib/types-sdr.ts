// ── Quota Types ──

export interface RawQuotaRecord {
  "ForecastingQuota ID": string;
  "Quota Amount": string;
  "Quota Quantity": string;
  "Forecasting Type: API Name": string;
  "Is Active": string;
  "Created Date": string;
  "Created By: Full Name": string;
  "Start Date": string;
  "End Date": string;
  "Owner: Full Name": string;
  "Owner: Manager: Full Name": string;
  "Is Ramping (Vlookup)": string;
}

export interface QuotaRecord {
  id: string;
  quotaAmount: number;
  quotaQuantity: number;
  forecastingType: string;
  isActive: boolean;
  isRamping: boolean;
  startDate: Date;
  endDate: Date;
  ownerName: string;
  ownerManager: string;
}

// ── SDR Meeting Types ──

export interface RawSdrMeeting {
  "Opportunity Name": string;
  "Qualification Set Date": string;
  "Qualification Scheduled Date": string;
  Industry: string;
  Amount: string;
  Stage: string;
  "Fiscal Period": string;
  "Created Date": string;
  "SDR Owner": string;
  "Assigned Account Executive": string;
  "SAO Points Calculation": string;
  "Meeting Held Date": string;
}

export interface SdrMeeting {
  opportunityName: string;
  qualificationSetDate: Date;
  sdrOwner: string;
  stage: string;
  amount: number;
  assignedAE: string;
  saoPoints: number;
  meetingHeldDate: Date | null;
}

// ── SDR Roster ──

export interface SdrRosterEntry {
  name: string;
  segment: "MM" | "ENT";
  monthlyQuota: number;
  status: "Ramped" | "Ramping";
  manager: string;
  isTeamLead: boolean;
}

// ── SDR Performance State ──

export interface SdrWeekCell {
  weekLabel: string;
  saoCount: number;
  pipelineDollars: number;
  meetingsSet: number;
  isCurrentWeek: boolean;
}

export interface SdrHeatmapRow {
  sdrName: string;
  segment: "MM" | "ENT";
  status: "On Pace" | "At Risk" | "Behind" | "Ramping";
  isTeamLead: boolean;
  monthlyQuota: number;
  weeks: SdrWeekCell[];
  rollingAvgSao: number;
  rollingAvgPipeline: number;
}

export interface SdrRepDetail {
  sdrName: string;
  segment: "MM" | "ENT";
  monthlyQuota: number;
  reqPerWeek: number;
  thisWeekSaos: number;
  avgPerWeek: number;
  qtdSaos: number;
  reqQtd: number;
  gap: number;
  pacePercent: number;
  status: "On Pace" | "At Risk" | "Behind" | "Ramping";
}

export interface SdrFunnelRow {
  sdrName: string;
  segment: "MM" | "ENT";
  meetingsSet: number;
  saos: number;
  conversionRate: number;
  pipelineDollars: number;
  avgDealSize: number;
  closedWonDollars: number;
}

export interface SdrMonthlyAttainment {
  monthLabel: string;
  totalQuota: number;
  totalSaos: number;
  attainmentPercent: number;
}

export interface SdrPerformanceState {
  focusWeekLabel: string;
  filterLabel: string;
  execSummary: string;
  monthlyAttainment: SdrMonthlyAttainment;
  kpiCards: {
    saosThisWeek: number;
    saosWow: number;
    pipelineThisWeek: number;
    pipelineWow: number;
    meetingsThisWeek: number;
    meetingsWow: number;
    conversionRate: number;
    conversionWow: number;
  };
  heatmap: {
    mm: SdrHeatmapRow[];
    ent: SdrHeatmapRow[];
    ramping: SdrHeatmapRow[];
    mmSubtotals: SdrWeekCell[];
    entSubtotals: SdrWeekCell[];
  };
  repDetail: {
    mm: SdrRepDetail[];
    ent: SdrRepDetail[];
    ramping: SdrRepDetail[];
    mmTotals: SdrRepDetail;
    entTotals: SdrRepDetail;
  };
  funnel: {
    teamTotals: {
      meetingsSet: number;
      saos: number;
      conversionRate: number;
      pipelineDollars: number;
      closedWonDollars: number;
    };
    mm: SdrFunnelRow[];
    ent: SdrFunnelRow[];
    mmTotals: SdrFunnelRow;
    entTotals: SdrFunnelRow;
    teamTotal: SdrFunnelRow;
  };
}
