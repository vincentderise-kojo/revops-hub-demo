import type { Metadata } from "next";
import ArchitecturePage from "@/components/architecture-page";

export const metadata: Metadata = {
  title: "System Architecture — Kojo RevOps Hub",
  description: "How the RevOps AI operating system is wired",
};

export default function Architecture() {
  return <ArchitecturePage />;
}
