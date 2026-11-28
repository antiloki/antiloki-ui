import * as React from "react";
import { createPortal } from "react-dom";
import { C } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import { apiPostStrict, reasonOf } from "@/loki/api/post-strict";

// COMMIT AND PUSH, UNDER THE INPUT (operator 2026-10-11: "add below the input field at the agent chat a commit and push button, with an edit commit option or auto"). The agent never commits;
// this is the one click that does, on the box the agent is working in. AUTO writes the message from what the agent was asked and what changed; EDIT lets the operator write it.
// Nothing is pushed by opening the menu: the preview is a read, the two buttons are the acts.
const mono = "'JetBrains Mono', ui-monospace, monospace";

export type ShipPreview = { ok?: boolean; dirty: boolean; files: string[]; branch: string; remote: boolean; ahead: number; message: string; why?: string };
export type ShipResult = { ok?: boolean; committed: boolean; sha?: string; pushed: boolean; branch?: string; message?: string; error?: string; push_error?: string };

export async function fetchShipPreview(paneId: number): Promise<ShipPreview | null> {
  try { const r: any = await apiGet(`/api/v1/cockpit/agent/ship?pane_id=${paneId}`); const d = r?.result?.result ?? r?.result ?? r; return d && d.ok !== false && Array.isArray(d.files) ? d as ShipPreview : null; } catch { return null; }
}

/** The sentence under the click: what happened, said plainly. Pure - tested. */
export function shipNote(r: ShipResult): string {
  if (r.error) return `could not commit - ${r.error}`;
  const where = r.branch ? ` on ${r.branch}` : "";
  const c = r.committed ? `committed ${r.sha ?? ""}${where}` : `nothing new to commit${where}`;
  if (r.push_error) return `${c}; could not push - ${r.push_error}`;
  return r.pushed ? `${c}; pushed` : c;
}

/** What the button offers for this preview. Pure - tested. */
export function shipChoice(p: ShipPreview | null): { canCommit: boolean; canPush: boolean; label: string } {
  if (!p) return { canCommit: false, canPush: false, label: "looking at the box…" };
  const n = p.files.length;
  const canCommit = p.dirty && n > 0;
  const canPush = p.remote && (canCommit || p.ahead > 0);
  const label = canCommit ? `${n} changed file${n === 1 ? "" : "s"}${p.ahead ? ` · ${p.ahead} unpushed` : ""}` : p.ahead > 0 ? `${p.ahead} commit${p.ahead === 1 ? "" : "s"} not pushed` : "nothing to commit";
  return { canCommit, canPush, label: p.remote ? label : `${label} · no remote` };
}

export function CommitPushButton({ paneId }: { paneId?: number | null }) {
  const [open, setOpen] = React.useState(false);
  const [pv, setPv] = React.useState<ShipPreview | null>(null);
  const [auto, setAuto] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ text: string; bad: boolean } | null>(null);
  React.useEffect(() => {
    if (!open || !paneId) return;
    let live = true; setPv(null);
    void fetchShipPreview(paneId).then((r) => { if (live) { setPv(r); if (r) setMsg(r.message); } });
    return () => { live = false; };
  }, [open, paneId]);
  React.useEffect(() => { if (!note) return; const h = setTimeout(() => setNote(null), 30_000); return () => clearTimeout(h); }, [note]);
  if (!paneId) return null;
  const ch = shipChoice(pv);
  const go = async (push: boolean) => {
    setBusy(true);
    try {
      const r = await apiPostStrict<ShipResult>("/api/v1/cockpit/agent/ship", { pane_id: paneId, push, ...(auto ? {} : { message: msg.trim() }) });
      const d: ShipResult = (r as any)?.result?.result ?? (r as any)?.result ?? r;
      setNote({ text: shipNote(d), bad: !!d.error || !!d.push_error }); setOpen(false);
    } catch (e) { setNote({ text: `could not commit - ${reasonOf(e)}`, bad: true }); }
    finally { setBusy(false); }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {note && <span data-testid="ship-note" onClick={() => setNote(null)} title={note.text} style={{ fontFamily: mono, fontSize: 10.5, lineHeight: 1.45, cursor: "pointer", color: note.bad ? C.bad : C.ok, border: `1px solid ${note.bad ? C.bad : C.ok}`, borderRadius: 6, padding: "3px 8px", maxWidth: 420, whiteSpace: "normal", wordBreak: "break-word" }}>{note.text}</span>}
      <button data-testid="ship-open" onClick={() => setOpen((o) => !o)} title="commit what this agent changed, and push it" style={{ fontFamily: mono, fontSize: 10.5, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 9px", cursor: "pointer", color: C.dim }}>⎇ commit &amp; push</button>
      {open && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }} />
          <div data-testid="ship-menu" style={{ position: "fixed", right: 20, bottom: 66, zIndex: 401, width: 380, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 10, display: "flex", flexDirection: "column", gap: 8, fontFamily: mono, fontSize: 11, color: C.fg }}>
            <div data-testid="ship-summary" style={{ color: C.dim }}>{pv?.why ? pv.why : pv ? `${pv.branch || "this box"} · ${ch.label}` : ch.label}</div>
            {pv && pv.files.length > 0 && <div style={{ maxHeight: 84, overflowY: "auto", color: C.dim, fontSize: 10 }}>{pv.files.slice(0, 40).map((f) => <div key={f}>{f}</div>)}{pv.files.length > 40 && <div>…and {pv.files.length - 40} more</div>}</div>}
            <div style={{ display: "flex", gap: 6 }}>
              <button data-testid="ship-auto" onClick={() => setAuto(true)} style={{ flex: 1, fontFamily: mono, fontSize: 10.5, padding: "3px 0", cursor: "pointer", borderRadius: 6, background: auto ? C.brand : "transparent", color: auto ? "#fff" : C.dim, border: `1px solid ${auto ? C.brand : C.border}` }}>auto message</button>
              <button data-testid="ship-edit" onClick={() => setAuto(false)} style={{ flex: 1, fontFamily: mono, fontSize: 10.5, padding: "3px 0", cursor: "pointer", borderRadius: 6, background: !auto ? C.brand : "transparent", color: !auto ? "#fff" : C.dim, border: `1px solid ${!auto ? C.brand : C.border}` }}>edit message</button>
            </div>
            <textarea data-testid="ship-message" value={msg} readOnly={auto} onChange={(e) => setMsg(e.target.value)} rows={4} spellCheck={false} style={{ resize: "vertical", fontFamily: mono, fontSize: 11, background: C.bg, color: auto ? C.dim : C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 6 }} />
            <div style={{ display: "flex", gap: 6 }}>
              <button data-testid="ship-commit" disabled={busy || !ch.canCommit || (!auto && !msg.trim())} onClick={() => void go(false)} style={{ flex: 1, fontFamily: mono, fontSize: 11, padding: "4px 0", cursor: "pointer", borderRadius: 6, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, opacity: busy || !ch.canCommit ? .5 : 1 }}>commit</button>
              <button data-testid="ship-push" disabled={busy || !ch.canPush || (!auto && ch.canCommit && !msg.trim())} onClick={() => void go(true)} title={pv && !pv.remote ? "this repo has no remote to push to" : "commit, then push the branch to origin"} style={{ flex: 1, fontFamily: mono, fontSize: 11, padding: "4px 0", cursor: "pointer", borderRadius: 6, background: C.brand, color: "#fff", border: `1px solid ${C.brand}`, opacity: busy || !ch.canPush ? .5 : 1 }}>{busy ? "working…" : "commit & push"}</button>
            </div>
          </div>
        </>, document.body)}
    </span>
  );
}
