/**
 * Time helpers for the substrate timeline.
 *
 * Substrate timestamps come from SQLite's `datetime('now')` which is
 * UTC ("YYYY-MM-DD HH:MM:SS[.fff]"). The FE has been displaying them
 * raw, which means an operator in Santa Catarina (UTC-3) saw UTC times
 * labeled as if they were local. Every absolute-time display in the
 * FE should route through these helpers so the substrate's clock and
 * the operator's clock agree.
 *
 * Relative times ("Xs ago") are already correct because they're
 * computed from timestamps that DO get parsed as UTC.
 */

function parseUtcMs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  // Naked "YYYY-MM-DD HH:MM:SS" → treat as UTC.
  // Already-ISO ("YYYY-MM-DDTHH:MM:SSZ") → parse as-is.
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** HH:MM:SS in the operator's local timezone. */
export function toLocalHMS(ts: string | null | undefined): string {
  if (!ts) return "";
  const ms = parseUtcMs(ts);
  if (ms == null) {
    // Fallback: extract whatever looks like time from the original
    // string so we never render nothing.
    const m = ts.match(/(\d{2}:\d{2}:\d{2})/);
    return m ? m[1] : ts;
  }
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Full local timestamp: YYYY-MM-DD HH:MM:SS. */
export function toLocalFull(ts: string | null | undefined): string {
  if (!ts) return "";
  const ms = parseUtcMs(ts);
  if (ms == null) return ts;
  const d = new Date(ms);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

/** Compact "Xs / Xm / Xh / Xd" given seconds. */
export function fmtAgoSec(s: number): string {
  if (s < 1) return "now";
  if (s < 60) return `${s | 0}s`;
  if (s < 3600) return `${(s / 60) | 0}m`;
  if (s < 86400) return `${(s / 3600) | 0}h`;
  return `${(s / 86400) | 0}d`;
}

/** Detected local timezone label, e.g. "America/Sao_Paulo · UTC-3". */
export function localTzLabel(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
    const mm = String(Math.abs(offsetMin) % 60).padStart(2, "0");
    return `${tz} · UTC${sign}${hh}${mm === "00" ? "" : ":" + mm}`;
  } catch {
    return "local";
  }
}
