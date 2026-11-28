// THE EXPERIMENT CARD (approved mockup 15, 2026-11-18; drawn by us): a small glass card at the bottom right of a team's pane while the team tests one of its own improvement requests against the current version, and the verdict when it ends (admitted or not, and why).
// It reads what the serve already says (`experiment_status`); it starts nothing and spends nothing. Dismissing a verdict hides it for this page.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { experimentStatus, listRequests, type TeamRequest } from "./api";
import { money } from "./model";

type Live = { n: number; state: string; spent?: number; admitted?: boolean; why?: string; problem: string };
/** What the card shows for a request: running, or the verdict of a finished experiment; null for anything else. Pure. */
export function cardOf(req: TeamRequest, st: { state: string; admitted?: boolean; why?: string; spent_usd?: number } | null): Live | null {
  if (st?.state === "running") return { n: req.n, state: "running", spent: st.spent_usd, problem: req.problem };
  if (req.status === "open" && req.experiment) return { n: req.n, state: req.experiment.admitted ? "admitted" : "held back", spent: req.experiment.spent_usd, admitted: req.experiment.admitted, why: req.experiment.why, problem: req.problem };
  return null;
}
export function ExperimentCard({ team, onOpen }: { team: string; onOpen?: () => void }) {
  const [cards, setCards] = React.useState<Live[]>([]); const gone = React.useRef(new Set<string>());
  React.useEffect(() => {
    let stop = false;
    const go = async () => {
      if (typeof document !== "undefined" && document.hidden) return; const reqs = await listRequests(team); if (stop) return;
      const open = reqs.filter((r) => r.status === "open"); const out: Live[] = [];
      for (const r of open) { const st = await experimentStatus(team, r.n); const c = cardOf(r, st.ok ? (st as any) : null); if (c) out.push(c); }
      if (!stop) setCards((old) => (JSON.stringify(old) === JSON.stringify(out) ? old : out));
    };
    void go(); const t = setInterval(go, 6000); return () => { stop = true; clearInterval(t); };
  }, [team]);
  const [, bump] = React.useReducer((x: number) => x + 1, 0);
  const shown = cards.filter((c) => c.state === "running" || !gone.current.has(`${team}/${c.n}/${c.state}`)).slice(0, 1);
  if (!shown.length) return null; const c = shown[0]; const tone = c.state === "running" ? "#4d8dff" : c.admitted ? "#3ecf8e" : "#f5a524";
  return (
    <div data-testid="experiment-card" data-state={c.state} style={{ position: "relative", width: "100%", boxSizing: "border-box", pointerEvents: "auto", fontFamily: nav, color: C.fg, background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 82%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `1px solid color-mix(in srgb, ${tone} 40%, ${C.border})`, borderRadius: 14, padding: "10px 12px", boxShadow: "0 8px 28px rgba(0,0,0,.35)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <i aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: tone, animation: c.state === "running" ? "tg-blink .9s steps(2,jump-none) infinite" : "none" }} />
        <b style={{ fontSize: 12.5, fontWeight: 600 }}>{c.state === "running" ? "Testing a change" : c.admitted ? "The change is better" : "The change was held back"}</b>
        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: C.dim }}>#{c.n}{c.spent != null ? ` · ${money(c.spent)}` : ""}</span>
        {c.state !== "running" && <button aria-label="dismiss" onClick={() => { gone.current.add(`${team}/${c.n}/${c.state}`); bump(); }} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>✕</button>}
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, margin: "5px 0 0 15px", lineHeight: 1.5 }}>{c.state === "running" ? `The current version and the candidate run side by side on the replay bank: ${c.problem}` : c.why || c.problem}</div>
      {onOpen && <button onClick={onOpen} style={{ margin: "8px 0 0 15px", fontFamily: nav, fontSize: 12, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "2px 11px", cursor: "pointer" }}>Open the request</button>}
    </div>
  );
}
