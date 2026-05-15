import { describe, it, expect } from "vitest";
import { maxStrength, deriveContractAcrSignal } from "./process-account-intelligence";
import { AI_CONFIG } from "./config";

describe("maxStrength (variadic)", () => {
  it("returns the highest-ranked of any number of inputs", () => {
    expect(maxStrength("weak", "moderate", "no-data")).toBe("moderate");
    expect(maxStrength("strong", "weak", "moderate")).toBe("strong");
    expect(maxStrength("no-data", "no-data", "no-data")).toBe("no-data");
    expect(maxStrength("moderate")).toBe("moderate");
  });
});

describe("deriveContractAcrSignal", () => {
  const { warning, accurate } = AI_CONFIG.revenueDeltaThresholds;

  it("returns no-data when contractAcr is null", () => {
    expect(deriveContractAcrSignal(null, 10_000_000)).toEqual({
      contractAcrDeltaPct: null,
      contractAcrSignal: "no-data",
    });
  });

  it("returns no-data when sfdcRevenue is 0", () => {
    expect(deriveContractAcrSignal(50_000_000, 0)).toEqual({
      contractAcrDeltaPct: null,
      contractAcrSignal: "no-data",
    });
  });

  it("returns weak when delta is below the accurate threshold", () => {
    const sfdc = 10_000_000;
    const acr = sfdc * (1 + accurate / 2); // below accurate threshold
    const result = deriveContractAcrSignal(acr, sfdc);
    expect(result.contractAcrSignal).toBe("weak");
  });

  it("returns moderate when delta exceeds the accurate threshold but not warning", () => {
    const sfdc = 10_000_000;
    const acr = sfdc * (1 + (accurate + warning) / 2);
    const result = deriveContractAcrSignal(acr, sfdc);
    expect(result.contractAcrSignal).toBe("moderate");
  });

  it("returns strong when delta exceeds the warning threshold", () => {
    const sfdc = 10_000_000;
    const acr = sfdc * (1 + warning + 0.1);
    const result = deriveContractAcrSignal(acr, sfdc);
    expect(result.contractAcrSignal).toBe("strong");
  });

  it("treats negative deltas symmetrically (customer self-stated smaller than SFDC)", () => {
    const sfdc = 10_000_000;
    const acr = sfdc * (1 - warning - 0.1);
    const result = deriveContractAcrSignal(acr, sfdc);
    expect(result.contractAcrSignal).toBe("strong");
    expect(result.contractAcrDeltaPct).toBeLessThan(0);
  });
});
