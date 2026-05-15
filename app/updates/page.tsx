import type { Metadata } from "next";
import { readFileSync } from "fs";
import path from "path";
import UpdatesPage from "@/components/updates-page";

export const metadata: Metadata = {
  title: "Updates — Kojo RevOps Hub",
  description: "What's been shipped across the RevOps Hub",
};

export const dynamic = "force-dynamic";

interface ChangelogEntry {
  date: string;
  app: string;
  status: string;
  title: string;
  description?: string;
}

export default function Updates() {
  const filePath = path.join(process.cwd(), "data", "changelog.json");
  const raw = readFileSync(filePath, "utf-8");
  const data: { entries: ChangelogEntry[] } = JSON.parse(raw);

  return <UpdatesPage entries={data.entries} />;
}
