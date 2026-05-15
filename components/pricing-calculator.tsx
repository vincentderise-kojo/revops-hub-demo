"use client";

import { useState, useMemo, useRef } from "react";
import {
  PRODUCTS,
  CONTRACT_TERMS,
  maxFreeMonths,
  DISCOUNT_VP_THRESHOLD,
  DISCOUNT_CEO_THRESHOLD,
} from "@/lib/pricing-config";
import { PricingState } from "@/lib/types-pricing";
import { computePricingState } from "@/lib/pricing-utils";

// ── Formatting Helpers ──
function fmtDollar(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function parseRevenue(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatRevenueInput(n: number): string {
  if (n === 0) return "";
  return n.toLocaleString("en-US");
}

export default function PricingCalculator() {
  // ── Input State ──
  const [revenueInput, setRevenueInput] = useState("45000000");
  const [termMonths, setTermMonths] = useState(12);
  const [freeMonths, setFreeMonths] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [checkedProducts, setCheckedProducts] = useState<Record<string, boolean>>(
    Object.fromEntries(PRODUCTS.map((p) => [p.name, p.defaultChecked]))
  );
  const [prospectSpends, setProspectSpends] = useState<Record<string, number | null>>(
    Object.fromEntries(PRODUCTS.map((p) => [p.name, null]))
  );
  const [flatPrices, setFlatPrices] = useState<Record<string, number | null>>(
    Object.fromEntries(PRODUCTS.map((p) => [p.name, p.defaultPrice ?? null]))
  );
  const [showSlackPicker, setShowSlackPicker] = useState(false);
  const [slackChannel, setSlackChannel] = useState("");
  const [showReferences, setShowReferences] = useState(true);

  const calculatorRef = useRef<HTMLDivElement>(null);

  const annualRevenue = parseRevenue(revenueInput);
  const maxFree = maxFreeMonths(termMonths);

  // ── Computed Pricing State ──
  const pricing: PricingState = useMemo(
    () =>
      computePricingState(
        annualRevenue,
        termMonths,
        freeMonths,
        discountPct,
        checkedProducts,
        prospectSpends,
        flatPrices
      ),
    [annualRevenue, termMonths, freeMonths, discountPct, checkedProducts, prospectSpends, flatPrices]
  );

  // ── Free months effective discount equivalent ──
  const freeMonthEffectiveDiscount =
    freeMonths > 0 ? (freeMonths / (termMonths + freeMonths)) * 100 : 0;

  // ── Toggle product ──
  function toggleProduct(name: string) {
    setCheckedProducts((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  // ── Update prospect spend ──
  function updateProspectSpend(name: string, value: string) {
    const num = parseRevenue(value);
    setProspectSpends((prev) => ({ ...prev, [name]: num > 0 ? num : null }));
  }

  // ── Update flat price (one-time products) ──
  function updateFlatPrice(name: string, value: string) {
    const num = parseRevenue(value);
    setFlatPrices((prev) => ({ ...prev, [name]: num > 0 ? num : null }));
  }

  // ── Clamp free months when term changes + apply term-based discount ──
  function handleTermChange(months: number) {
    setTermMonths(months);
    const newMax = maxFreeMonths(months);
    if (freeMonths > newMax) setFreeMonths(newMax);
    // Auto-apply term-based discount: 2yr = 3%, 3yr = 5%, 1yr = 0%
    if (months === 24) setDiscountPct(3);
    else if (months === 36) setDiscountPct(5);
    else setDiscountPct(0);
  }

  // ── Export: CSV ──
  function handleExportCsv(state: PricingState) {
    const checkedRows = state.rows.filter((r) => r.checked);
    const headers = [
      "Product",
      "Annual Price",
      "Discounted Annual",
      "Monthly",
      "Floor",
      "Current Solution",
      "Savings",
    ];
    const csvRows = checkedRows.map((r) =>
      [
        r.displayName,
        Math.round(r.annualPrice),
        Math.round(r.discountedAnnual),
        Math.round(r.monthly),
        r.annualFloor,
        r.prospectSpend ?? "",
        r.savings !== null ? Math.round(r.savings) : "",
      ].join(",")
    );
    const summaryRows = [
      "",
      `Annual Revenue,${state.annualRevenue}`,
      `Contract Term,${state.termMonths} months`,
      `Free Months,${state.freeMonths}`,
      `Discount,${state.discountPct}%`,
      `List ACV,${Math.round(state.rom.listAcv)}`,
      `Discounted ACV,${Math.round(state.rom.discountedAcv)}`,
      `TCV,${Math.round(state.rom.tcv)}`,
      `Monthly Deal Price,${Math.round(state.rom.monthlyDealPrice)}`,
    ];
    const csv = [headers.join(","), ...csvRows, ...summaryRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crestline-pricing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Export: PDF ──
  async function handleExportPdf(ref: React.RefObject<HTMLDivElement | null>) {
    if (!ref.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const canvas = await html2canvas(ref.current, {
      backgroundColor: "#0f1729",
      scale: 2,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`crestline-pricing-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ── Export: Screenshot ──
  async function handleScreenshot(ref: React.RefObject<HTMLDivElement | null>) {
    if (!ref.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(ref.current, {
      backgroundColor: "#0f1729",
      scale: 2,
    });
    const link = document.createElement("a");
    link.download = `crestline-pricing-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // ── Slack Send ──
  async function handleSlackSend(state: PricingState, channel: string) {
    if (!channel.trim()) return;
    try {
      const res = await fetch("/pricing/api/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: channel.trim(),
          pricing: {
            annualRevenue: state.annualRevenue,
            termMonths: state.termMonths,
            freeMonths: state.freeMonths,
            discountPct: state.discountPct,
            rows: state.rows.filter((r) => r.checked).map((r) => ({
              product: r.displayName,
              annual: Math.round(r.annualPrice),
              discounted: Math.round(r.discountedAnnual),
              monthly: Math.round(r.monthly),
            })),
            listAcv: Math.round(state.rom.listAcv),
            discountedAcv: Math.round(state.rom.discountedAcv),
            tcv: Math.round(state.rom.tcv),
            monthlyTotal: Math.round(state.rom.monthlyDealPrice),
          },
        }),
      });
      if (res.ok) {
        setShowSlackPicker(false);
        setSlackChannel("");
      }
    } catch (err) {
      console.error("Slack send failed:", err);
    }
  }

  return (
    <>
      {/* Crestline header */}
      <div className="kojo-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href="/hub"
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "#FFE500",
              letterSpacing: 1.5,
              textDecoration: "none",
            }}
          >
            CRESTLINE
          </a>
          <span
            style={{
              width: 1,
              height: 16,
              background: "#555",
              display: "inline-block",
            }}
          />
          <a
            href="/hub"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            RevOps Hub
          </a>
        </div>
      </div>

      {/* App header */}
      <div
        style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "var(--blue)",
            }}
          />
          <span style={{ fontSize: 18, fontWeight: 700 }}>
            Pricing Calculator
          </span>
        </div>
      </div>

      {/* References Rail (collapsible) */}
      <div
        style={{
          position: "fixed",
          top: 100,
          left: 16,
          width: showReferences ? 280 : 36,
          maxHeight: "calc(100vh - 120px)",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          transition: "width 0.2s ease",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Toggle header */}
        <button
          onClick={() => setShowReferences((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: showReferences ? "space-between" : "center",
            gap: 8,
            padding: showReferences ? "10px 12px" : "10px 8px",
            background: "transparent",
            border: "none",
            borderBottom: showReferences ? "1px solid var(--border)" : "none",
            color: "var(--text)",
            cursor: "pointer",
            fontFamily: "inherit",
            width: "100%",
          }}
          aria-label={showReferences ? "Collapse references" : "Expand references"}
        >
          {showReferences && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--blue)",
              }}
            >
              References
            </span>
          )}
          <span
            style={{
              fontSize: 14,
              color: "var(--muted)",
              writingMode: showReferences ? "horizontal-tb" : "vertical-rl",
            }}
          >
            {showReferences ? "←" : "References →"}
          </span>
        </button>

        {/* Content */}
        {showReferences && (
          <div
            style={{
              padding: "12px 14px",
              overflowY: "auto",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--text)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--muted)",
                marginBottom: 6,
              }}
            >
              SPIFs
            </div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li style={{ marginBottom: 6 }}>
                <strong>Implementation fee SPIF:</strong> If an AE closes a deal
                with an implementation fee of $5k or more (virtual or onsite),
                they receive a flat <strong>$500 bonus</strong>.
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Content */}
      <div
        ref={calculatorRef}
        style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}
      >
        {/* ── Input Controls Card ── */}
        <div className="card">
          <div className="label" style={{ color: "var(--blue)", marginBottom: 12 }}>
            DEAL CONFIGURATION
          </div>

          {/* Row 1: Revenue + Contract Term */}
          <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
            {/* Annual Revenue */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 4,
                  letterSpacing: 0.5,
                }}
              >
                Annual Construction Revenue
              </div>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--muted)",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  $
                </span>
                <input
                  type="text"
                  value={formatRevenueInput(annualRevenue)}
                  onChange={(e) => setRevenueInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 24px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Contract Term */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 4,
                  letterSpacing: 0.5,
                }}
              >
                Contract Term
              </div>
              <div
                style={{
                  display: "flex",
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                }}
              >
                {CONTRACT_TERMS.map((t) => (
                  <button
                    key={t.months}
                    onClick={() => handleTermChange(t.months)}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      background:
                        termMonths === t.months
                          ? "var(--kojo-yellow)"
                          : "var(--bg)",
                      color:
                        termMonths === t.months ? "#1a1a1a" : "var(--muted)",
                      border: "none",
                      fontSize: 13,
                      fontWeight: termMonths === t.months ? 700 : 400,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Free Months + Discount */}
          <div style={{ display: "flex", gap: 24 }}>
            {/* Free Months */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 4,
                  letterSpacing: 0.5,
                }}
              >
                Free Months{" "}
                <span style={{ color: "#556" }}>
                  {freeMonths} of {maxFree} available
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => setFreeMonths(Math.max(0, freeMonths - 1))}
                    style={{
                      padding: "10px 14px",
                      background: "var(--bg)",
                      border: "none",
                      color: "var(--text)",
                      fontSize: 16,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    −
                  </button>
                  <div
                    style={{
                      padding: "10px 18px",
                      fontSize: 16,
                      fontWeight: 600,
                      minWidth: 40,
                      textAlign: "center",
                    }}
                  >
                    {freeMonths}
                  </div>
                  <button
                    onClick={() =>
                      setFreeMonths(Math.min(maxFree, freeMonths + 1))
                    }
                    style={{
                      padding: "10px 14px",
                      background: "var(--bg)",
                      border: "none",
                      color: "var(--text)",
                      fontSize: 16,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    +
                  </button>
                </div>
                {freeMonths > 0 && (
                  <span style={{ fontSize: 12, color: "var(--teal)" }}>
                    ≈ {fmtPct(freeMonthEffectiveDiscount)} effective discount ·
                    preserves ARR
                  </span>
                )}
              </div>
            </div>

            {/* Discount */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 4,
                  letterSpacing: 0.5,
                }}
              >
                Discount %
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "var(--kojo-yellow)" }}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct}
                  onChange={(e) =>
                    setDiscountPct(
                      Math.max(0, Math.min(100, Number(e.target.value)))
                    )
                  }
                  style={{
                    width: 60,
                    padding: "8px 10px",
                    background: "var(--bg)",
                    border: `1px solid ${
                      discountPct >= DISCOUNT_CEO_THRESHOLD
                        ? "var(--red)"
                        : discountPct >= DISCOUNT_VP_THRESHOLD
                          ? "var(--yellow)"
                          : "var(--border)"
                    }`,
                    borderRadius: 6,
                    color:
                      discountPct >= DISCOUNT_CEO_THRESHOLD
                        ? "var(--red)"
                        : discountPct >= DISCOUNT_VP_THRESHOLD
                          ? "var(--yellow)"
                          : "var(--text)",
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    textAlign: "center",
                    outline: "none",
                  }}
                />
                {discountPct >= DISCOUNT_CEO_THRESHOLD && (
                  <span className="badge badge-red">CEO Approval</span>
                )}
                {discountPct >= DISCOUNT_VP_THRESHOLD &&
                  discountPct < DISCOUNT_CEO_THRESHOLD && (
                    <span className="badge badge-yellow">VP Approval</span>
                  )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Product Pricing Table ── */}
        <div className="card">
          <div className="label" style={{ color: "var(--blue)", marginBottom: 12 }}>
            PRODUCT PRICING
          </div>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "center", width: 36 }}></th>
                <th style={{ textAlign: "left" }}>Product</th>
                <th>Annual</th>
                <th>Discounted</th>
                <th>Monthly</th>
                <th>Floor</th>
                <th>
                  <span
                    title="Monthly cost of the tool the prospect is using today (e.g., Excel, custom app, competitor) — used to show savings vs. Crestline"
                    style={{
                      cursor: "help",
                      borderBottom: "1px dotted var(--muted)",
                    }}
                  >
                    Current Solution
                  </span>
                </th>
                <th>Savings</th>
              </tr>
            </thead>
            <tbody>
              {pricing.rows.map((row) => (
                <tr
                  key={row.product}
                  style={{
                    opacity: row.checked ? 1 : 0.35,
                  }}
                >
                  {/* Toggle */}
                  <td style={{ textAlign: "center" }}>
                    <div
                      onClick={() => toggleProduct(row.product)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: row.checked ? "var(--kojo-yellow)" : "transparent",
                        border: row.checked ? "none" : "2px solid #555",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        fontSize: 12,
                        color: "#1a1a1a",
                        fontWeight: 700,
                      }}
                    >
                      {row.checked ? "✓" : ""}
                    </div>
                  </td>
                  {/* Product */}
                  <td style={{ textAlign: "left", textDecoration: row.checked ? "none" : "line-through" }}>
                    <span style={{ fontWeight: 600 }}>{row.displayName}</span>
                    {row.type === "Core" && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "var(--muted)",
                          display: "block",
                        }}
                      >
                        Core product
                      </span>
                    )}
                    {row.oneTime && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "var(--blue)",
                          display: "block",
                        }}
                      >
                        One-time fee
                      </span>
                    )}
                  </td>
                  {/* Annual (or flat fee input for one-time) */}
                  <td style={{ fontWeight: 600, textDecoration: row.checked ? "none" : "line-through" }}>
                    {row.oneTime ? (
                      row.checked ? (
                        <input
                          type="text"
                          value={
                            flatPrices[row.product] !== null && flatPrices[row.product] !== undefined
                              ? formatRevenueInput(flatPrices[row.product] as number)
                              : ""
                          }
                          onChange={(e) => updateFlatPrice(row.product, e.target.value)}
                          style={{
                            width: 80,
                            padding: "4px 8px",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            color: "var(--text)",
                            fontSize: 11,
                            fontFamily: "inherit",
                            textAlign: "right",
                            outline: "none",
                          }}
                        />
                      ) : (
                        fmtDollar(row.annualPrice)
                      )
                    ) : (
                      fmtDollar(row.annualPrice)
                    )}
                  </td>
                  {/* Discounted */}
                  <td
                    style={{
                      fontWeight: 600,
                      color: row.checked ? "var(--kojo-yellow)" : "var(--muted)",
                      textDecoration: row.checked ? "none" : "line-through",
                    }}
                  >
                    {row.oneTime ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      fmtDollar(row.discountedAnnual)
                    )}
                  </td>
                  {/* Monthly */}
                  <td style={{ textDecoration: row.checked ? "none" : "line-through" }}>
                    {row.oneTime ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      <>
                    {fmtDollar(row.monthly)}
                    {row.atFloor && row.checked && (
                      <span
                        className="badge badge-yellow"
                        style={{ display: "block", marginTop: 2, fontSize: 9 }}
                      >
                        At Floor
                      </span>
                    )}
                      </>
                    )}
                  </td>
                  {/* Floor */}
                  <td
                    style={{
                      color: row.atFloor && row.checked ? "var(--yellow)" : "var(--muted)",
                      fontWeight: row.atFloor && row.checked ? 600 : 400,
                    }}
                  >
                    {row.oneTime ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      fmtDollar(row.annualFloor)
                    )}
                  </td>
                  {/* Prospect Spend */}
                  <td>
                    {row.oneTime ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : row.checked ? (
                      <input
                        type="text"
                        placeholder="—"
                        value={
                          row.prospectSpend !== null
                            ? formatRevenueInput(row.prospectSpend)
                            : ""
                        }
                        onChange={(e) =>
                          updateProspectSpend(row.product, e.target.value)
                        }
                        style={{
                          width: 80,
                          padding: "4px 8px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          color: "var(--text)",
                          fontSize: 11,
                          fontFamily: "inherit",
                          textAlign: "right",
                          outline: "none",
                        }}
                      />
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  {/* Savings */}
                  <td>
                    {row.savings !== null && row.checked ? (
                      <span
                        style={{
                          color:
                            row.savings > 0 ? "var(--teal)" : "var(--red)",
                          fontWeight: 600,
                        }}
                      >
                        {row.savings > 0 ? "+" : ""}
                        {fmtDollar(row.savings)}
                        {row.savingsPct !== null && (
                          <span
                            style={{
                              display: "block",
                              fontSize: 9,
                              fontWeight: 400,
                            }}
                          >
                            {fmtPct(Math.abs(row.savingsPct))} savings
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals */}
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)" }}>
                <td></td>
                <td style={{ textAlign: "left", fontWeight: 700, fontSize: 13 }}>
                  Total ({pricing.rows.filter((r) => r.checked).length} products)
                </td>
                <td style={{ fontWeight: 700, fontSize: 13 }}>
                  {fmtDollar(pricing.rom.listAcv + pricing.rom.oneTimeTotal)}
                </td>
                <td
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--kojo-yellow)",
                  }}
                >
                  {fmtDollar(pricing.rom.discountedAcv)}
                </td>
                <td style={{ fontWeight: 700, fontSize: 13 }}>
                  {fmtDollar(pricing.rom.monthlyDealPrice)}
                </td>
                <td></td>
                <td style={{ fontWeight: 600 }}>
                  {pricing.rom.totalProspectSpend > 0
                    ? fmtDollar(pricing.rom.totalProspectSpend)
                    : ""}
                </td>
                <td
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color:
                      pricing.rom.totalSavings > 0
                        ? "var(--teal)"
                        : pricing.rom.totalSavings < 0
                          ? "var(--red)"
                          : "var(--muted)",
                  }}
                >
                  {pricing.rom.totalSavings !== 0
                    ? `${pricing.rom.totalSavings > 0 ? "+" : ""}${fmtDollar(pricing.rom.totalSavings)}`
                    : ""}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── ROM Card ── */}
        <div className="card">
          <div className="label" style={{ color: "var(--blue)", marginBottom: 12 }}>
            ROUGH ORDER OF MAGNITUDE
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {/* ROM Range */}
            <div
              style={{
                flex: 1,
                background: "var(--bg)",
                borderRadius: 8,
                padding: 16,
                borderLeft: "3px solid var(--kojo-yellow)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  letterSpacing: 0.5,
                  marginBottom: 10,
                }}
              >
                Annual ROM Range ·{" "}
                {pricing.rows.filter((r) => r.checked).length} Products
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 24, fontWeight: 700 }}>
                  {fmtDollar(Math.max(0, pricing.rom.listAcv - 10000))}
                </span>
                <span style={{ fontSize: 16, color: "var(--muted)" }}>—</span>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: "var(--kojo-yellow)",
                  }}
                >
                  {fmtDollar(pricing.rom.listAcv + 10000)}
                </span>
              </div>
              <div
                style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}
              >
                <span style={{ color: "var(--kojo-yellow)" }}>±$10k</span>{" "}
                of whole-deal BPS list price
              </div>
            </div>

            {/* Deal Summary */}
            <div
              style={{
                flex: 0.7,
                background: "var(--bg)",
                borderRadius: 8,
                padding: 16,
                borderLeft: "3px solid var(--teal)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  letterSpacing: 0.5,
                  marginBottom: 10,
                }}
              >
                Deal Summary
              </div>
              {[
                { label: "List ACV", value: fmtDollar(pricing.rom.listAcv) },
                {
                  label: "Discounted ACV",
                  value: fmtDollar(pricing.rom.discountedAcv),
                  color: "var(--kojo-yellow)",
                },
                ...(pricing.rom.oneTimeTotal > 0
                  ? [
                      {
                        label: "One-Time Fees",
                        value: fmtDollar(pricing.rom.oneTimeTotal),
                        color: "var(--blue)",
                      },
                    ]
                  : []),
                {
                  label: `TCV (${termMonths / 12}yr)`,
                  value: fmtDollar(pricing.rom.tcv),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "var(--muted)" }}>{item.label}</span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: item.color ?? "var(--text)",
                    }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 6,
                  marginTop: 4,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: "var(--muted)" }}>
                    Effective Discount
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        pricing.rom.effectiveDiscount >= DISCOUNT_CEO_THRESHOLD
                          ? "var(--red)"
                          : pricing.rom.effectiveDiscount >=
                              DISCOUNT_VP_THRESHOLD
                            ? "var(--yellow)"
                            : "var(--text)",
                    }}
                  >
                    {fmtPct(pricing.rom.effectiveDiscount)}
                  </span>
                </div>
                {pricing.rom.totalSavings !== 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "var(--muted)" }}>
                      Prospect Savings
                    </span>
                    <span
                      style={{ fontWeight: 600, color: "var(--teal)" }}
                    >
                      {fmtDollar(pricing.rom.totalSavings)}/mo
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Deal Comparison ── */}
        {discountPct > 0 && (
          <div className="card">
            <div
              className="label"
              style={{ color: "var(--blue)", marginBottom: 12 }}
            >
              DEAL STRUCTURING: DISCOUNT VS. FREE MONTHS
            </div>
            <div
              style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}
            >
              Compare the ARR impact of achieving the same effective price
              through discounting vs. free months.
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              {/* Discount Approach */}
              <div
                style={{
                  flex: 1,
                  background: "var(--bg)",
                  borderRadius: 8,
                  padding: 16,
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 14,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Discount Approach
                  </span>
                  <span className="badge badge-yellow">Current</span>
                </div>
                {[
                  { label: "Discount", value: fmtPct(pricing.comparison.discountPct) },
                  {
                    label: "Monthly Price",
                    value: fmtDollar(pricing.comparison.discountMonthly),
                  },
                  {
                    label: "ARR Impact",
                    value: fmtDollar(pricing.comparison.discountArr),
                    color: "var(--red)",
                    bold: true,
                  },
                  {
                    label: "ARR Lost vs. List",
                    value: `−${fmtDollar(pricing.comparison.discountArrLost)}`,
                    color: "var(--red)",
                  },
                  {
                    label: "Approval",
                    value:
                      pricing.comparison.discountApproval === "ceo"
                        ? "CEO Required"
                        : pricing.comparison.discountApproval === "vp"
                          ? "VP Required"
                          : "None",
                    color:
                      pricing.comparison.discountApproval === "ceo"
                        ? "var(--red)"
                        : pricing.comparison.discountApproval === "vp"
                          ? "var(--yellow)"
                          : "var(--green)",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 6,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "var(--muted)" }}>{item.label}</span>
                    <span
                      style={{
                        fontWeight: item.bold ? 700 : 600,
                        fontSize: item.bold ? 14 : 12,
                        color: item.color ?? "var(--text)",
                      }}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* VS */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    background: "var(--border)",
                    color: "var(--muted)",
                    borderRadius: "50%",
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  vs
                </div>
              </div>

              {/* Free Months Approach */}
              <div
                style={{
                  flex: 1,
                  background: "var(--bg)",
                  borderRadius: 8,
                  padding: 16,
                  border: "2px solid var(--teal)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 14,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Free Months Approach
                  </span>
                  <span className="badge badge-teal">Recommended</span>
                </div>
                {[
                  {
                    label: "Free Months",
                    value: `${pricing.comparison.freeMonthsNeeded} months free`,
                  },
                  {
                    label: "Effective Monthly",
                    value: fmtDollar(pricing.comparison.freeMonthsMonthly),
                  },
                  {
                    label: "ARR Impact",
                    value: fmtDollar(pricing.comparison.freeMonthsArr),
                    color: "var(--teal)",
                    bold: true,
                  },
                  {
                    label: "ARR Preserved",
                    value: `+${fmtDollar(pricing.comparison.freeMonthsArrPreserved)}`,
                    color: "var(--teal)",
                  },
                  {
                    label: "Approval",
                    value: "No approval needed",
                    color: "var(--green)",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 6,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "var(--muted)" }}>{item.label}</span>
                    <span
                      style={{
                        fontWeight: item.bold ? 700 : 600,
                        fontSize: item.bold ? 14 : 12,
                        color: item.color ?? "var(--text)",
                      }}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Insight callout */}
            <div
              className="callout callout-green"
              style={{ marginTop: 14 }}
            >
              Using{" "}
              <strong>
                {pricing.comparison.freeMonthsNeeded} free month
                {pricing.comparison.freeMonthsNeeded !== 1 ? "s" : ""}
              </strong>{" "}
              instead of a{" "}
              <strong>{fmtPct(pricing.comparison.discountPct)} discount</strong>{" "}
              achieves a similar effective monthly price while preserving{" "}
              <strong>
                {fmtDollar(pricing.comparison.freeMonthsArrPreserved)} in ARR
              </strong>
              {pricing.comparison.discountApproval !== "none" &&
                " and requires no approval"}
              .
            </div>
          </div>
        )}

        {/* ── Export & Share Actions ── */}
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Export or share this pricing scenario
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleExportCsv(pricing)}
                style={{
                  padding: "8px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Export CSV
              </button>
              <button
                onClick={() => handleExportPdf(calculatorRef)}
                style={{
                  padding: "8px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Export PDF
              </button>
              <button
                onClick={() => handleScreenshot(calculatorRef)}
                style={{
                  padding: "8px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Screenshot
              </button>
              <div
                style={{
                  width: 1,
                  background: "var(--border)",
                  margin: "0 4px",
                }}
              />
              <button
                onClick={() => setShowSlackPicker(true)}
                style={{
                  padding: "8px 14px",
                  background: "rgba(78,205,196,0.1)",
                  border: "1px solid var(--teal)",
                  borderRadius: 6,
                  color: "var(--teal)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Share to Slack
              </button>
            </div>
          </div>

          {/* Slack channel picker */}
          {showSlackPicker && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                background: "var(--bg)",
                border: "1px solid var(--teal)",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 6,
                  letterSpacing: 0.5,
                }}
              >
                Send pricing summary to Slack
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--muted)",
                    }}
                  >
                    #
                  </span>
                  <input
                    type="text"
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                    placeholder="channel-name"
                    style={{
                      width: "100%",
                      padding: "10px 14px 10px 28px",
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      color: "var(--text)",
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                </div>
                <button
                  onClick={() => handleSlackSend(pricing, slackChannel)}
                  style={{
                    padding: "10px 20px",
                    background: "var(--teal)",
                    border: "none",
                    borderRadius: 6,
                    color: "#1a1a1a",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Send
                </button>
                <button
                  onClick={() => setShowSlackPicker(false)}
                  style={{
                    padding: "10px 14px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--muted)",
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
