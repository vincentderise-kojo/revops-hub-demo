import { describe, it, expect } from "vitest";
import { extractAcrFromText } from "./parse";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseContractAcr } from "./parse";

describe("extractAcrFromText", () => {
  it("extracts ACR from the standard Order Form template", () => {
    const text = `
Products
Annual Construction Revenue: $28,000,000.00

Recurring Services    List Price    Discount    Grand Total
Procurement
`;
    const result = extractAcrFromText(text);
    expect(result.statedAcr).toBe(28_000_000);
    expect(result.method).toBe("regex");
    expect(result.rawExcerpt).toContain("Annual Construction Revenue");
  });

  it("returns not_found when the label is absent", () => {
    const text = "This contract has no ACR line at all, just some other text.";
    const result = extractAcrFromText(text);
    expect(result.statedAcr).toBeNull();
    expect(result.method).toBe("not_found");
  });

  it("handles values without decimal cents", () => {
    const text = "Annual Construction Revenue: $50,000,000";
    const result = extractAcrFromText(text);
    expect(result.statedAcr).toBe(50_000_000);
    expect(result.method).toBe("regex");
  });

  it("flags ambiguous when label matches multiple lines and picks the largest", () => {
    const text = `
Annual Construction Revenue: $10,000,000
[boilerplate]
Annual Construction Revenue: $80,000,000
`;
    const result = extractAcrFromText(text);
    expect(result.statedAcr).toBe(80_000_000);
    expect(result.method).toBe("regex_ambiguous");
  });

  it("captures excerpt ±200 chars around match", () => {
    const text = "A".repeat(300) + "Annual Construction Revenue: $1,000,000.00" + "B".repeat(300);
    const result = extractAcrFromText(text);
    expect(result.rawExcerpt.length).toBeLessThanOrEqual(500);
    expect(result.rawExcerpt).toContain("Annual Construction Revenue");
  });
});

describe("parseContractAcr (PDF buffer)", () => {
  it.skipIf(!existsSync(resolve(__dirname, "fixtures/all-weather.pdf")))(
    "extracts $28M from the All Weather Contractors signed contract",
    async () => {
      const buf = readFileSync(resolve(__dirname, "fixtures/all-weather.pdf"));
      const result = await parseContractAcr(buf);
      expect(result.statedAcr).toBe(28_000_000);
      expect(result.method).toBe("regex");
    }
  );

  it("returns not_found for an empty buffer", async () => {
    const buf = Buffer.from("not a real pdf");
    const result = await parseContractAcr(buf);
    expect(result.statedAcr).toBeNull();
    expect(result.method).toBe("not_found");
  });
});
