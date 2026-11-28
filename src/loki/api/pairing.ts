// PAIRING THIS DEVICE (operator 2026-11-10, the phone): the QR on the machine opens `<address>/?pair=<code>`. The page trades the code for a token (the serve answers with a cookie, so every request and every event stream carries it) and
// cleans the address. Pure parts tested; the call is one POST.
import { BE_URL } from "./client";

/** The pairing code in an address's query, upper-cased, or null. Pure. */
export function pairCodeIn(search: string): string | null {
  const c = new URLSearchParams(search).get("pair"); const t = (c ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{6,16}$/.test(t) ? t : null;
}
/** What to call this device: the kind of thing it is, from its user agent. Pure. */
export function deviceName(ua: string): string {
  const u = ua.toLowerCase();
  const kind = /iphone/.test(u) ? "iPhone" : /ipad/.test(u) ? "iPad" : /android/.test(u) ? (/mobile/.test(u) ? "Android phone" : "Android tablet") : /macintosh|mac os/.test(u) ? "Mac" : /windows/.test(u) ? "Windows PC" : /linux/.test(u) ? "Linux PC" : "device";
  const browser = /edg\//.test(u) ? "Edge" : /firefox/.test(u) ? "Firefox" : /chrome|crios/.test(u) ? "Chrome" : /safari/.test(u) ? "Safari" : "";
  return browser ? `${kind} · ${browser}` : kind;
}
/** The address without the pairing code, so a reload does not claim a spent code and the code does not sit in the history. Pure. */
export function withoutPair(href: string): string { const u = new URL(href); u.searchParams.delete("pair"); return u.pathname + (u.search ? u.search : "") + u.hash; }

/** If this page was opened by a pairing link, claim it. `null` = nothing to claim; `{ok:true}` = paired (the cookie is set); `{ok:false, error}` = the serve's sentence. */
export async function claimFromLocation(loc: Location = window.location): Promise<{ ok: boolean; error?: string } | null> {
  const code = pairCodeIn(loc.search); if (!code) return null;
  try {
    const r = await fetch(`${BE_URL}/api/v1/remote/pair/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, name: deviceName(navigator.userAgent) }) });
    const j: any = await r.json().catch(() => null);
    if (j?.ok === true) { try { history.replaceState(null, "", withoutPair(loc.href)); } catch { /* old webview */ } return { ok: true }; }
    return { ok: false, error: String(j?.error ?? `the machine answered ${r.status}`) };
  } catch (e: any) { return { ok: false, error: `could not reach the machine: ${String(e?.message ?? e)}` }; }
}
