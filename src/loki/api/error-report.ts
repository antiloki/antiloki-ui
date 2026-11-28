// FEAT-FE-ERROR-TELEMETRY (2026-06-11). Born from a debugging loop where
// every server-side check passed while the operator's browser stayed broken:
// the substrate audits everything EXCEPT browser-side failures, so the one
// signal that mattered was invisible. This module (a) reports every
// window.onerror / unhandledrejection / route-crash to the BE (fire-and-
// forget, deduped, throttled) so FE errors land in substrate notifications,
// and (b) is paired with a visible route error panel in main.tsx so a crash
// can never again render as a silent blank screen.
import { BE_URL, getFeSession } from "./client";

const seen = new Set<string>();
let sentThisMinute = 0;
let windowStart = Date.now();
const MAX_PER_MINUTE = 10;

export function reportFeError(kind: string, message: string, stack?: string | null) {
  try {
    const key = `${kind}:${message}`.slice(0, 200);
    if (seen.has(key)) return;
    seen.add(key);
    if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); sentThisMinute = 0; }
    if (++sentThisMinute > MAX_PER_MINUTE) return;
    // Fire-and-forget; a 404 (endpoint not yet deployed) is harmless.
    fetch(`${BE_URL}/api/v1/fe-errors`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-FE-Session": getFeSession() },
      body: JSON.stringify({
        kind,
        message: String(message).slice(0, 500),
        stack: (stack ?? "").slice(0, 2000),
        url: typeof location !== "undefined" ? location.href : "",
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "",
      }),
    }).catch(() => { /* never recurse into reporting */ });
  } catch { /* reporting must never break the app */ }
}

export function installGlobalErrorReporting() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => {
    reportFeError("window.onerror", e.message ?? String(e.error ?? "unknown"), e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r: any = e.reason;
    reportFeError("unhandledrejection", r?.message ?? String(r ?? "unknown"), r?.stack);
  });
}
