"use client";

import { useState } from "react";

interface ExportButtonProps {
  /** Filename slug, e.g. "pipeline-pulse". Final filename: `{slug}-{YYYY-MM-DD}.png` */
  slug: string;
  /** Optional label override */
  label?: string;
}

/**
 * Full-page screenshot export. Captures document.body at full scroll height
 * and downloads as PNG. Uses html2canvas (already a dep).
 *
 * The button itself is excluded from the capture via data-html2canvas-ignore.
 */
export default function ExportButton({ slug, label = "Export PNG" }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      // Dynamic import keeps html2canvas out of the initial bundle
      const html2canvas = (await import("html2canvas")).default;

      // Scroll to top so fixed/sticky positioning is consistent
      const prevScroll = window.scrollY;
      window.scrollTo(0, 0);

      // Let the browser settle a frame before capture
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const target = document.body;
      const width = Math.max(document.documentElement.scrollWidth, target.scrollWidth);
      const height = Math.max(document.documentElement.scrollHeight, target.scrollHeight);

      const canvas = await html2canvas(target, {
        backgroundColor: "#0b0b0b",
        useCORS: true,
        scale: 2,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0,
        logging: false,
      });

      window.scrollTo(0, prevScroll);

      const today = new Date().toISOString().slice(0, 10);
      const filename = `${slug}-${today}.png`;

      canvas.toBlob((blob) => {
        if (!blob) {
          setBusy(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setBusy(false);
      }, "image/png");
    } catch (err) {
      console.error("[ExportButton] capture failed:", err);
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      data-html2canvas-ignore="true"
      title="Download a full-page PNG screenshot"
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: 4,
        border: "1px solid #3a3a3a",
        background: busy ? "#222" : "#1a1a1a",
        color: busy ? "#777" : "var(--text)",
        cursor: busy ? "wait" : "pointer",
        fontFamily: "inherit",
        transition: "background 120ms, border-color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!busy) {
          e.currentTarget.style.background = "#2a2a2a";
          e.currentTarget.style.borderColor = "#4ecdc4";
        }
      }}
      onMouseLeave={(e) => {
        if (!busy) {
          e.currentTarget.style.background = "#1a1a1a";
          e.currentTarget.style.borderColor = "#3a3a3a";
        }
      }}
    >
      {busy ? "Capturing…" : label}
    </button>
  );
}
