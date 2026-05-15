// Types for the CW spot-check. Shapes mirror the SFDC REST fields we query
// in lib/cw-spotcheck/sfdc.ts and feed to the Claude synthesizer.
//
// Field naming follows SFDC's API names (snake_case + __c) to make it obvious
// when reading Claude prompts which field came from which SFDC object.

export interface SfdcOpportunity {
  Id: string;
  Name: string;
  AccountId: string;
  OwnerId: string;
  StageName: string;
  IsWon: boolean;
  IsClosed: boolean;
  Type: string | null;
  CloseDate: string;          // YYYY-MM-DD
  Amount: number | null;
  SyncedQuoteId: string | null;
  ContractId: string | null;  // always null at Kojo per memory; kept for completeness
  Opp_Owner_Name__c: string | null;
  Opp_Set_Type__c: string | null;
  Opportunity_Source__c: string | null;
  Demo_Held_Date__c: string | null;   // Kojo's Discovery Date proxy
  Start_Date__c: string | null;        // Subscription Start
  End_Date__c: string | null;          // Subscription End (NOT Initial_Term_End_Date__c)
  Initial_Term_End_Date__c: string | null;
  Contract_Term__c: string | null;     // total term in months as string
  Date_Contract_Signed__c: string | null;
  Contract_Sent_Date__c: string | null;
  Renewal_Term__c: number | null;
  Invoice_Frequency__c: string | null;
  Recurring_Discount_Percentage__c: number | null;
  Non_Recurring_Discount_Percentage__c: number | null;
  Discount_Percentage__c: number | null;
  Non_Recurring_List_Price__c: number | null;
  // MEDDPICCCR free-text fields
  Champion__c: string | null;
  Economic_Buyer__c: string | null;
  Metrics__c: string | null;
  Decision_Criteria__c: string | null;
  Decision_Processes__c: string | null;
  Paper_Process__c: string | null;
  Implicate_Pains__c: string | null;
  Critical_Event__c: string | null;
  Risks__c: string | null;
  Competition2__c: string | null;
  Primary_Contact_Title__c: string | null;
  ContactId: string | null;
  Created_by_Role__c: string | null;
  Created_By_Manager__c: string | null;
  Rep_Manager__c: string | null;
}

export interface SfdcQuote {
  Id: string;
  Name: string;
  Status: string;
  OpportunityId: string;
  QuoteNumber: string | null;
  TotalPrice: number | null;
  Subtotal: number | null;
  GrandTotal: number | null;
  Discount: number | null;
  Subscription_Start_Date__c: string | null;
  Subscription_End_Date__c: string | null;
  Contract_Term__c: string | null;
  Invoice_Frequency__c: string | null;
  Payment_Method__c: string | null;
  Payment_Terms__c: string | null;
  Recurring_ARR__c: number | null;
  Non_Recurring_ARR__c: number | null;
  Annual_Construction_Revenue__c: number | null;
  Implementation_Type__c: string | null;
  Implementation_Product_Name__c: string | null;
  DocuSign_Envelope_ID__c: string | null;
  Sent_for_Signature_Date__c: string | null;
  Initial_Renewal_Date__c: string | null;
  Primary_Contact__c: string | null;
  Billing_Contact_Name__c: string | null;
  Offer_Valid_Through__c: string | null;
}

export interface SfdcLineItem {
  Id: string;
  Product2Id: string;
  ProductName: string;           // flattened from Product2.Name
  Quantity: number;
  UnitPrice: number;
  TotalPrice: number;
  ListPrice: number | null;
  Description: string | null;
  ServiceDate: string | null;
}

export interface SfdcOppHistoryEntry {
  Id: string;
  StageName: string;
  CreatedDate: string;           // ISO timestamp
  Amount: number | null;
}

export interface SfdcContractPdf {
  contentDocumentId: string;
  contentVersionId: string;
  title: string;
  fileType: string;
  bytes: Buffer;
}

// Everything the synthesizer needs about one opp.
export interface SpotCheckBundle {
  opp: SfdcOpportunity;
  quote: SfdcQuote | null;
  oppLineItems: SfdcLineItem[];
  quoteLineItems: SfdcLineItem[];
  oppHistory: SfdcOppHistoryEntry[];
  contractPdf: SfdcContractPdf | null;
}

// ── Check results ──

export type CheckSeverity = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;                    // stable check ID, e.g. "subscription-end-opp-matches-pdf"
  label: string;                 // human-readable
  severity: CheckSeverity;
  detail: string;                // 1-2 sentence explanation; quote the actual values
}

export interface SpotCheckResult {
  oppId: string;
  oppName: string;
  accountName: string | null;
  owner: string;
  manager: string | null;
  amount: number | null;
  closeDate: string;
  oppUrl: string;                // SFDC lightning URL for the Opp
  pdfFilename: string | null;
  pdfDownloadUrl: string | null; // SFDC link to the PDF (requires SFDC login)
  checks: CheckResult[];
  generatedAt: string;           // ISO timestamp
}
