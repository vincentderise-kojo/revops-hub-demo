export function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1)}M`;
  }
  return `$${Math.round(n / 1000)}K`;
}

export function fmtDollar(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function pctColor(pct: number): string {
  if (pct >= 90) return "var(--green)";
  if (pct >= 60) return "var(--yellow)";
  return "var(--red)";
}

export function gapColor(gap: number): string {
  return gap >= 0 ? "var(--green)" : "var(--red)";
}

export function fmtGap(gap: number): string {
  if (gap >= 0) return `+${fmtK(gap)}`;
  return `-${fmtK(Math.abs(gap))}`;
}

export function fmtM(n: number): string {
  return `$${(n / 1_000_000).toFixed(1)}M`;
}
