// NEW PANE (RFC 0017 §2, reshaped 2026-11-21: "on choosing a new pane a team template is created to make that pane; each kind has a template YAML behind it; reusing a pane that already exists is not a new pane"): every kind makes a TEAM from its template and the team makes the pane.
//   Web app (MCP or API)  → `pane-webapp`        designs a pane from the app's real tools, you approve the design, it writes the pane as a draft you approve
//   Web app, recreated    → `recreate-webapp`    the REA team studies the app (you sign in once) and builds the pane
//   Deterministic         → `pane-deterministic` finds a zero-AI X-ray source, previews it, you approve, it saves the widget
//   Specialist            → not built (its card says why)
import { useTourUnlock } from "@/loki/shell/mini-tour";
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { loadWebApps } from "./api";
import type { InstalledApp } from "./webapps";
import { startFromTemplate, runTeam } from "@/loki/team/api";

type Kind = "webapp" | "rea" | "deterministic";
export const KIND_TEMPLATE: Record<Kind, string> = { webapp: "pane-webapp", rea: "recreate-webapp", deterministic: "pane-deterministic" };
const KINDS: { key: Kind | "specialist"; title: string; line: string; who: string; off?: string }[] = [
  { key: "webapp", title: "Web app", line: "A team designs a new pane for an app you connected, from the app's own tools (MCP or API).", who: "You approve the design, then the draft page. Writes always ask you." },
  { key: "rea", title: "Web app, recreated", line: "A REA team studies a web app and builds a pane that looks like it.", who: "You sign in once in a window and approve the design before any code." },
  { key: "deterministic", title: "Deterministic", line: "A team finds the right facts about your code and project (code graph, diagrams, metrics) and saves a widget.", who: "No model is called by the widget itself, ever." },
  { key: "specialist", title: "Specialist", line: "An agent with a memory of its own, its skills and tools.", who: "Written down in RFC 0017 §2.4.", off: "Not built yet: a specialist needs a memory store and a definition file (RFC 0017, milestone T3)." },
];

export function NewPaneDialog({ onClose, onTeam }: { onClose: () => void; onTeam: (thread: string) => void }) {
  useTourUnlock("newpane");   // the progressive tour: the first time the dialog opens
  const [kind, setKind] = React.useState<Kind | null>(null); const [apps, setApps] = React.useState<InstalledApp[] | null>(null); const [err, setErr] = React.useState(""); const [busy, setBusy] = React.useState(false);
  const [app, setApp] = React.useState<InstalledApp | null>(null); const [goal, setGoal] = React.useState("");
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  React.useEffect(() => { if ((kind === "webapp" || kind === "rea") && apps === null) void loadWebApps().then((w) => setApps(w?.installed ?? [])); }, [kind, apps]);

  /** Make the team from the kind's template; for the two that take a goal in words, start its run with that goal. */
  const make = async () => {
    if (!kind) return; setBusy(true); setErr("");
    const name = (kind === "webapp" ? `Pane: ${app?.name ?? "app"}` : kind === "rea" ? `Recreate ${app?.name ?? "app"}` : `Widget: ${goal.trim()}`).slice(0, 60);
    const r = await startFromTemplate(KIT(kind), name, kind === "rea" ? 6 : kind === "webapp" ? 3 : 2);
    if (!r.ok) { setBusy(false); return setErr(r.error ?? "the team was not made"); }
    if (kind !== "rea") { const run = await runTeam(r.team ?? r.thread, kind === "webapp" ? `${app?.id}: ${goal.trim()}` : goal.trim()); if (!run.ok) { setBusy(false); return setErr(`the team was made but did not start: ${run.error ?? "no reason given"}`); } }
    setBusy(false); onTeam(r.thread); onClose();
  };
  const ready = kind === "rea" ? !!app : kind === "webapp" ? !!app && goal.trim().length >= 8 : kind === "deterministic" ? goal.trim().length >= 8 : false;
  const why = kind === "rea" ? (app ? "" : "Pick the app first") : kind === "webapp" ? (!app ? "Pick the app first" : "Say what the pane should do (a few words)") : "Say what you want to see (a few words)";

  const card: React.CSSProperties = { textAlign: "left", fontFamily: nav, border: `1px solid ${C.border}`, borderRadius: 10, background: "transparent", color: C.fg, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5, cursor: "pointer" };
  const field: React.CSSProperties = { background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 9px", fontFamily: nav, fontSize: 13, boxSizing: "border-box", width: "100%" };
  const btn = (primary = false): React.CSSProperties => ({ fontFamily: nav, fontSize: 12.5, padding: "5px 12px", borderRadius: 7, border: primary ? "none" : `1px solid ${C.border}`, background: primary ? C.brand : "transparent", color: primary ? "var(--c-bg)" : C.fg, cursor: "pointer" });
  const pickApp = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {apps === null && <div style={{ color: C.muted }}>looking…</div>}
      {apps !== null && apps.length === 0 && <div data-testid="new-pane-no-apps" style={{ color: C.muted }}>No app is installed: connect one in the Web apps store first.</div>}
      {(apps ?? []).map((a) => <button key={a.id} data-testid={`new-pane-app-${a.id}`} aria-pressed={app?.id === a.id} onClick={() => setApp(a)} style={{ ...card, flexDirection: "row", alignItems: "center", padding: "6px 10px", borderColor: app?.id === a.id ? C.brand : C.border }}><b style={{ fontWeight: 500 }}>{a.name}</b></button>)}
    </div>);
  return (
    <div role="dialog" aria-label="new pane" data-testid="new-pane" style={{ position: "fixed", inset: 0, zIndex: 1300, display: "grid", placeItems: "center", background: "rgba(0,0,0,.5)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 640, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12, fontFamily: nav, fontSize: 13, color: C.fg }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{kind && <button data-testid="new-pane-back" style={btn()} onClick={() => { setKind(null); setErr(""); setApp(null); setGoal(""); }}>←</button>}<b style={{ fontSize: 15, fontWeight: 600 }}>{kind ? KINDS.find((k) => k.key === kind)?.title : "New pane"}</b></div>
        {!kind && <div data-testid="new-pane-kinds" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10 }}>
          {KINDS.map((k) => <button key={k.key} data-testid={`new-pane-kind-${k.key}`} disabled={!!k.off} title={k.off ?? ""} onClick={() => k.key !== "specialist" && setKind(k.key)} style={{ ...card, opacity: k.off ? 0.55 : 1, cursor: k.off ? "not-allowed" : "pointer" }}>
            <b style={{ fontSize: 14 }}>{k.title}</b><span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{k.line}</span><span style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{k.off ?? k.who}</span></button>)}
        </div>}
        {kind && <div data-testid={`new-pane-${kind}`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{KINDS.find((k) => k.key === kind)?.line} <span data-testid="new-pane-template" style={{ color: C.dim }}>Team: {KIT(kind)}.</span></div>
          {(kind === "webapp" || kind === "rea") && pickApp}
          {kind !== "rea" && <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: C.muted }}>{kind === "webapp" ? "What should the pane show or do?" : "What do you want to see?"}
            <textarea data-testid="new-pane-goal" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={kind === "webapp" ? "e.g. my issues by cycle, with a quick capture" : "e.g. the files that changed most this month"} style={{ ...field, resize: "vertical" }} /></label>}
          {kind === "rea" && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>The REA team looks at the app in a window you sign in to once, you approve the design, and the pane is made at the end.</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button data-testid="new-pane-make" disabled={!ready || busy} title={ready ? "" : why} style={{ ...btn(true), opacity: ready && !busy ? 1 : 0.5 }} onClick={() => void make()}>{busy ? "Starting the team…" : "Make this pane"}</button>
            {!ready && <span style={{ fontSize: 12, color: C.muted }}>{why}</span>}
            {ready && <span style={{ fontSize: 12, color: C.muted }}>A team is made from the template{kind === "rea" ? "" : " and starts"}; you approve before anything is written.</span>}
          </div>
        </div>}
        {err && <div data-testid="new-pane-error" role="alert" style={{ color: "var(--c-bad)", fontSize: 12.5 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button style={btn()} onClick={onClose}>Close</button></div>
      </div>
    </div>);
}
const KIT = (k: Kind): string => KIND_TEMPLATE[k];
