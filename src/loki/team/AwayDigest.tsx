// WHILE YOU WERE AWAY (RFC 0010 §4.17, BL-8): what the teams did since the person last said "got it": runs finished, failed, waiting for them, skipped by a limit. Read from the run files by the serve, so it is right after a closed
// window, a restart or a phone opening the app. Quiet when nothing happened. "Got it" moves the mark to now (kept in this browser; a different device starts from the last 24 hours).
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { awayDigest } from "./api";
import { Icon } from "./icons";
import type { Digest } from "./types";

const KEY = "antiloki.team.away.seen";
const get = (): number | undefined => { try { const v = Number(localStorage.getItem(KEY)); return v > 0 ? v : undefined; } catch { return undefined; } };
const put = (ms: number) => { try { localStorage.setItem(KEY, String(ms)); } catch { /* private window */ } };

export function AwayDigest({ onOpenRun }: { onOpenRun?: (team: string) => void }) {
  const [d, setD] = React.useState<Digest | null>(null); const [more, setMore] = React.useState(false);
  React.useEffect(() => { let stop = false; void Promise.resolve(awayDigest(get())).then((x) => { if (!stop) setD(x ?? null); }); return () => { stop = true; }; }, []);
  if (!d || d.quiet) return null;
  return (
    <div data-testid="away-digest" style={{ fontFamily: nav, fontSize: 12.5, color: C.fg, margin: "10px 16px 4px", padding: "10px 12px", border: `1px solid color-mix(in srgb, ${d.needs_you.length || d.skips.length || /fail|not finish/i.test(d.words) ? "#f5a524" : "#4d8dff"} 40%, ${C.border})`, borderRadius: 14, background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 82%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <i aria-hidden style={{ width: 7, height: 7, borderRadius: 4, flex: "none", background: d.needs_you.length || d.skips.length || /fail|not finish/i.test(d.words) ? "#f5a524" : "#4d8dff" }} /><b style={{ fontSize: 12.5, fontWeight: 600 }}>While you were away</b>
        <span data-testid="away-words" style={{ flex: "1 1 240px", color: C.muted }}>{d.words.replace(/^while you were away:?\s*/i, "")}</span>
        {(d.needs_you.length > 0 || d.skips.length > 0) && <button data-testid="away-more" aria-expanded={more} aria-label={more ? "hide the details" : "show the details"} onClick={() => setMore((m) => !m)} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 12 }}>{d.needs_you.length + d.skips.length} detail{d.needs_you.length + d.skips.length === 1 ? "" : "s"}<span style={{ display: "inline-flex", transform: more ? "rotate(180deg)" : "none" }}><Icon name="chev" size={12} /></span></button>}
        <button data-testid="away-dismiss" onClick={() => { put(d.now_ms); setD(null); }} style={{ fontFamily: nav, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 999, padding: "2px 12px", cursor: "pointer" }}>Got it</button>
      </div>
      {more && d.needs_you.length > 0 && <ul data-testid="away-needs" style={{ margin: "6px 0 0", paddingLeft: 18, color: C.muted }}>{d.needs_you.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {more && d.skips.length > 0 && <div style={{ marginTop: 4, color: C.muted }}>skipped: {d.skips.map((s) => `${s.team} · ${s.why}`).join("; ")}</div>}
    </div>
  );
}
