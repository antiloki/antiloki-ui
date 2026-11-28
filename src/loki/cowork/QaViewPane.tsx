// THE QA PANE (operator 2026-11-10: an agent's QA is "not headless but really a pane with the thing, tested"). An agent's `antiloki_qa` runs antiloki's deterministic QA executor and opens this
// pane on the screen: the browser's frames as they come, the step being played, and each step's result. It only shows what the serve's run holds; it decides nothing.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import { initialLive, reduceLive, runIsMoving, type LiveState } from "@/loki/chat/qa-live";

const POLL_MS = 600;
/** The serve's snapshot of the run (`{type:"snapshot", ...}`) as the viewer's state. Pure (the Studio's own reducer). */
export const viewOf = (snapshot: unknown): LiveState => (snapshot && typeof snapshot === "object" ? reduceLive(initialLive, snapshot as { type: string }) : initialLive);

export function QaViewPane({ run }: { run: number }) {
  const [v, setV] = React.useState<LiveState>(initialLive);
  const [gone, setGone] = React.useState(false);
  React.useEffect(() => {
    let stop = false; let t: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const r: any = await apiGet(`/api/v1/cockpit/cowork/qa/view?id=${run}`).catch(() => null);
      if (stop) return;
      if (r?.snapshot) { setGone(false); const next = viewOf(r.snapshot); setV(next); if (next.status === "over") return; } else if (r && r.ok === false) { setGone(true); return; }
      t = setTimeout(() => void tick(), POLL_MS);
    };
    void tick(); return () => { stop = true; if (t) clearTimeout(t); };
  }, [run]);
  const failed = v.results.filter((r) => !r.ok).length;
  return (
    <div data-testid="qa-view" data-status={gone ? "gone" : v.status} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", fontFamily: nav, color: C.fg, fontSize: 12.5 }}>
      <div style={{ padding: "6px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", fontFamily: mono, fontSize: 11 }}>
        <span style={{ color: v.status === "over" ? (failed ? C.bad : C.ok) : C.warn }}>{gone ? "not held by this server" : v.status === "over" ? (failed ? `done · ${failed} failed` : "done · all steps ran") : runIsMoving(v.status) ? "testing…" : "connecting…"}</span>
        <span style={{ color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} data-testid="qa-step">{v.step ? `${v.step.n}/${v.step.of} ${v.step.text}` : ""}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center", background: "rgba(127,127,127,.08)", overflow: "hidden" }}>
        {v.frame ? <img data-testid="qa-frame" alt="the page under test" src={v.frame} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", boxShadow: "0 8px 30px -10px rgba(0,0,0,.6)" }} /> : <span style={{ color: C.muted }}>{gone ? "this run is no longer on the server" : "waiting for the first picture…"}</span>}
      </div>
      {v.steps.length > 0 && (
        <div data-testid="qa-steps" style={{ maxHeight: 120, overflow: "auto", padding: "6px 12px", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11, lineHeight: 1.5 }}>
          {[...v.steps].sort((a, b) => a.n - b.n).map((s) => { const r = v.results.find((x) => x.n === s.n); return <div key={s.n} style={{ color: r ? (r.ok ? C.ok : C.bad) : C.muted }}>{r ? (r.ok ? "✓" : "✗") : "·"} {s.n}. {s.text}{r && !r.ok && r.message ? ` — ${r.message}` : ""}</div>; })}
        </div>
      )}
    </div>
  );
}
