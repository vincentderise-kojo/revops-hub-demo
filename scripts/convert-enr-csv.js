#!/usr/bin/env node
/**
 * Converts data/enr-top-600-2025.csv to data/enr-top-600-2025.json
 *
 * Field mappings:
 *   ENR_Rank_2025    → enrRank2025    (number)
 *   ENR_Rank_2024    → enrRank2024    (number | null if "**")
 *   Firm_Name        → firmName       (string)
 *   City             → city           (string)
 *   State            → state          (string)
 *   Firm_Type        → firmType       (string)
 *   Revenue_2024_Mil → revenue2024Mil (number)
 *   New_Contracts_Mil→ newContractsMil(number | null if blank)
 */

const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const csvPath = path.join(__dirname, "../data/enr-top-600-2025.csv");
const jsonPath = path.join(__dirname, "../data/enr-top-600-2025.json");

const csvContent = fs.readFileSync(csvPath, { encoding: "utf-8" });

const { data, errors } = Papa.parse(csvContent, {
  header: true,
  skipEmptyLines: true,
});

if (errors.length > 0) {
  console.error("Parse errors:", errors);
  process.exit(1);
}

const records = data.map((row, i) => {
  const rank2024Raw = row["ENR_Rank_2024"]?.trim();
  const newContractsRaw = row["New_Contracts_Mil"]?.trim();

  return {
    enrRank2025: Number(row["ENR_Rank_2025"]),
    enrRank2024: rank2024Raw === "**" || rank2024Raw === "" ? null : Number(rank2024Raw),
    firmName: row["Firm_Name"].trim(),
    city: row["City"].trim(),
    state: row["State"].trim(),
    firmType: row["Firm_Type"].trim(),
    revenue2024Mil: Number(row["Revenue_2024_Mil"]),
    newContractsMil: newContractsRaw === "" || newContractsRaw == null ? null : Number(newContractsRaw),
  };
});

console.log(`Parsed ${records.length} records`);

if (records.length !== 600) {
  console.error(`ERROR: Expected 600 entries, got ${records.length}`);
  process.exit(1);
}

fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2));
console.log(`Written to ${jsonPath}`);
