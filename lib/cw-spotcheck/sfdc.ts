// SFDC client for the CW spot-check.
//
// Auth: OAuth 2.0 JWT bearer flow against the "Kojo CW Spot-Check" External
// Client App. Signs a JWT with the private key (env: SFDC_JWT_PRIVATE_KEY),
// exchanges it at /services/oauth2/token, caches the access token in-memory.
//
// Reads: Opportunity, Quote, OpportunityLineItem, QuoteLineItem,
// OpportunityHistory, ContentDocumentLink/ContentVersion (PDF binary).

import { createSign } from "node:crypto";
import type {
  SfdcOpportunity,
  SfdcQuote,
  SfdcLineItem,
  SfdcOppHistoryEntry,
  SfdcContractPdf,
} from "./types";

const API_VERSION = "v66.0";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in the environment`);
  return value;
}

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

interface TokenResponse {
  access_token: string;
  instance_url: string;
  scope: string;
  token_type: string;
}

let cachedToken: { token: string; instanceUrl: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<{ token: string; instanceUrl: string }> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return { token: cachedToken.token, instanceUrl: cachedToken.instanceUrl };
  }

  const consumerKey = requiredEnv("SFDC_CONSUMER_KEY");
  const username = requiredEnv("SFDC_USERNAME");
  // PEM string with literal \n or real newlines — both work for crypto.createSign
  const privateKey = requiredEnv("SFDC_JWT_PRIVATE_KEY").replace(/\\n/g, "\n");
  const loginUrl = process.env.SFDC_LOGIN_URL ?? "https://login.salesforce.com";

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: consumerKey,
    sub: username,
    aud: loginUrl,
    exp: now + 180,
  };
  const headerB64 = base64url(JSON.stringify(header));
  const claimsB64 = base64url(JSON.stringify(claims));
  const signingInput = `${headerB64}.${claimsB64}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = base64url(signer.sign(privateKey));
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`SFDC JWT exchange failed (${res.status}): ${errBody}`);
  }
  const data = (await res.json()) as TokenResponse;

  // SFDC access tokens are typically valid for the org's session timeout (default 2h).
  // We assume 1h to leave plenty of buffer.
  cachedToken = {
    token: data.access_token,
    instanceUrl: data.instance_url,
    expiresAt: now + 3600,
  };
  return { token: data.access_token, instanceUrl: data.instance_url };
}

export async function soqlQuery<T>(soql: string): Promise<T[]> {
  const { token, instanceUrl } = await getAccessToken();
  const url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SOQL failed (${res.status}): ${body}\nQuery: ${soql}`);
  }
  const data = (await res.json()) as { records: T[]; totalSize: number; done: boolean };
  return data.records;
}

async function getRecord<T>(sobject: string, id: string, fields: string[]): Promise<T> {
  const fieldList = fields.join(", ");
  const records = await soqlQuery<T>(`SELECT ${fieldList} FROM ${sobject} WHERE Id='${id}' LIMIT 1`);
  if (records.length === 0) throw new Error(`${sobject} ${id} not found`);
  return records[0];
}

// ── Field lists ──

const OPP_FIELDS = [
  "Id", "Name", "AccountId", "OwnerId", "StageName", "IsWon", "IsClosed", "Type", "CloseDate",
  "Amount", "SyncedQuoteId", "ContractId",
  "Opp_Owner_Name__c", "Opp_Set_Type__c", "Opportunity_Source__c",
  "Demo_Held_Date__c", "Start_Date__c", "End_Date__c", "Initial_Term_End_Date__c", "Contract_Term__c",
  "Date_Contract_Signed__c", "Contract_Sent_Date__c", "Renewal_Term__c", "Invoice_Frequency__c",
  "Recurring_Discount_Percentage__c", "Non_Recurring_Discount_Percentage__c",
  "Discount_Percentage__c", "Non_Recurring_List_Price__c",
  "Champion__c", "Economic_Buyer__c", "Metrics__c", "Decision_Criteria__c", "Decision_Processes__c",
  "Paper_Process__c", "Implicate_Pains__c", "Critical_Event__c", "Risks__c", "Competition2__c",
  "Primary_Contact_Title__c", "ContactId",
  "Created_by_Role__c", "Created_By_Manager__c", "Rep_Manager__c",
];

const QUOTE_FIELDS = [
  "Id", "Name", "Status", "OpportunityId", "QuoteNumber",
  "TotalPrice", "Subtotal", "GrandTotal", "Discount",
  "Subscription_Start_Date__c", "Subscription_End_Date__c", "Contract_Term__c",
  "Invoice_Frequency__c", "Payment_Method__c", "Payment_Terms__c",
  "Recurring_ARR__c", "Non_Recurring_ARR__c", "Annual_Construction_Revenue__c",
  "Implementation_Type__c", "Implementation_Product_Name__c",
  "DocuSign_Envelope_ID__c", "Sent_for_Signature_Date__c", "Initial_Renewal_Date__c",
  "Primary_Contact__c", "Billing_Contact_Name__c", "Offer_Valid_Through__c",
];

// ── Public API ──

export async function getOpportunity(oppId: string): Promise<SfdcOpportunity> {
  return getRecord<SfdcOpportunity>("Opportunity", oppId, OPP_FIELDS);
}

export async function getQuote(quoteId: string): Promise<SfdcQuote> {
  return getRecord<SfdcQuote>("Quote", quoteId, QUOTE_FIELDS);
}

interface RawLineItem {
  Id: string;
  Product2Id: string;
  Product2?: { Name: string };
  Quantity: number;
  UnitPrice: number;
  TotalPrice: number;
  ListPrice: number | null;
  Description: string | null;
  ServiceDate: string | null;
}

function normalizeLineItem(r: RawLineItem): SfdcLineItem {
  return {
    Id: r.Id,
    Product2Id: r.Product2Id,
    ProductName: r.Product2?.Name ?? "(unknown)",
    Quantity: r.Quantity,
    UnitPrice: r.UnitPrice,
    TotalPrice: r.TotalPrice,
    ListPrice: r.ListPrice,
    Description: r.Description,
    ServiceDate: r.ServiceDate,
  };
}

export async function getOpportunityLineItems(oppId: string): Promise<SfdcLineItem[]> {
  const records = await soqlQuery<RawLineItem>(
    `SELECT Id, Product2Id, Product2.Name, Quantity, UnitPrice, TotalPrice, ListPrice, Description, ServiceDate
     FROM OpportunityLineItem WHERE OpportunityId='${oppId}'`
  );
  return records.map(normalizeLineItem);
}

export async function getQuoteLineItems(quoteId: string): Promise<SfdcLineItem[]> {
  const records = await soqlQuery<RawLineItem>(
    `SELECT Id, Product2Id, Product2.Name, Quantity, UnitPrice, TotalPrice, ListPrice, Description, ServiceDate
     FROM QuoteLineItem WHERE QuoteId='${quoteId}'`
  );
  return records.map(normalizeLineItem);
}

export async function getOpportunityHistory(oppId: string): Promise<SfdcOppHistoryEntry[]> {
  return soqlQuery<SfdcOppHistoryEntry>(
    `SELECT Id, StageName, CreatedDate, Amount FROM OpportunityHistory
     WHERE OpportunityId='${oppId}' ORDER BY CreatedDate ASC`
  );
}

interface ContentDocumentLinkRow {
  ContentDocumentId: string;
  ContentDocument: {
    Title: string;
    FileType: string;
    LatestPublishedVersionId: string;
    CreatedDate: string;
    ContentSize: number;
  };
}

/** Find the most recent PDF attached to the Quote and download its binary. */
export async function getContractPdfForQuote(quoteId: string): Promise<SfdcContractPdf | null> {
  const links = await soqlQuery<ContentDocumentLinkRow>(
    `SELECT ContentDocumentId, ContentDocument.Title, ContentDocument.FileType,
            ContentDocument.LatestPublishedVersionId, ContentDocument.CreatedDate, ContentDocument.ContentSize
     FROM ContentDocumentLink WHERE LinkedEntityId='${quoteId}'
     ORDER BY ContentDocument.CreatedDate DESC`
  );
  const pdf = links.find((l) => l.ContentDocument.FileType === "PDF");
  if (!pdf) return null;

  const { token, instanceUrl } = await getAccessToken();
  const url = `${instanceUrl}/services/data/${API_VERSION}/sobjects/ContentVersion/${pdf.ContentDocument.LatestPublishedVersionId}/VersionData`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PDF download failed (${res.status}): ${body}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    contentDocumentId: pdf.ContentDocumentId,
    contentVersionId: pdf.ContentDocument.LatestPublishedVersionId,
    title: pdf.ContentDocument.Title,
    fileType: pdf.ContentDocument.FileType,
    bytes,
  };
}

/** Find New Business CW opps closed within the last `hours` window. */
export async function findRecentClosedWonNewBusinessOpps(hours: number): Promise<string[]> {
  const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const records = await soqlQuery<{ Id: string }>(
    `SELECT Id FROM Opportunity
     WHERE IsWon=true AND Type='New Business' AND CloseDate >= ${sinceIso.slice(0, 10)}
     AND LastModifiedDate >= ${sinceIso}
     ORDER BY CloseDate DESC LIMIT 50`
  );
  return records.map((r) => r.Id);
}

/**
 * Find the latest closed-won Opportunity for an Account that has a synced Quote.
 * Used by the Contract ACR snapshot script to locate the most recent signed PDF.
 *
 * Returns null if the Account has no closed-won opps OR no closed-won opp has a
 * SyncedQuoteId (legacy customers may have closed-won opps without synced quotes).
 */
export async function findLatestSignedContractForAccount(
  accountId: string
): Promise<{ oppId: string; quoteId: string; closeDate: string; type: string } | null> {
  const records = await soqlQuery<{
    Id: string;
    SyncedQuoteId: string;
    CloseDate: string;
    Type: string;
  }>(
    `SELECT Id, SyncedQuoteId, CloseDate, Type FROM Opportunity
     WHERE AccountId='${accountId}' AND IsWon=true AND SyncedQuoteId != null
     ORDER BY CloseDate DESC LIMIT 1`
  );
  if (records.length === 0) return null;
  const r = records[0];
  return { oppId: r.Id, quoteId: r.SyncedQuoteId, closeDate: r.CloseDate, type: r.Type };
}

export function buildOppUrl(instanceUrl: string, oppId: string): string {
  return `${instanceUrl}/lightning/r/Opportunity/${oppId}/view`;
}

export function buildContentVersionUrl(instanceUrl: string, contentVersionId: string): string {
  return `${instanceUrl}/lightning/r/ContentVersion/${contentVersionId}/view`;
}

/** Exposed for the route to construct user-facing SFDC URLs. */
export async function getInstanceUrl(): Promise<string> {
  const { instanceUrl } = await getAccessToken();
  return instanceUrl;
}
