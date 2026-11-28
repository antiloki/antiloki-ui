// NOTIFICATIONS AND DECISIONS FROM ANYWHERE (approved mockups 12 and 13, 2026-11-18; drawn by us in the AffectUI feel): a small glass stack at the bottom right of the whole app. A run that needs YOU shows a decision toast (what it asks, Approve / Deny) wherever you are,
// until you answer; a run that failed or finished shows a notice that fades. At most four show; the rest wait. `toastsFrom` is pure: it compares the runs now with the runs last seen, so a run that was already finished when the page opened says nothing.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { answerAt, listTeams, runStatus } from "./api";
import { panesOp } from "@/loki/cowork/api";
import { ProviderCard, useProviderProposals } from "@/loki/cowork/ProviderCards";
import { BrowserCards, useWatch } from "@/loki/cockpit/pane-watch";
import { GroupCards } from "@/loki/cowork/Groups";
import { AUTO_SECONDS, accessWords, autoApprovable, draftKey, parseDrafts, type PaneDraft } from "@/loki/cowork/pane-drafts";
import { money, parkedAt } from "./model";
import type { RunRow } from "./types";

export type Toast = { id: string; kind: "decision" | "failed" | "done"; team: string; run: string; text: string; t: number };
export const MAX_TOASTS = 4;
/** The toasts a poll adds: a decision for every run that needs the person (kept while it does), a notice for each run that moved to blocked or done since the last look. `seen` is what the last poll saw (null on the first poll: nothing is news). Pure. */
export function toastsFrom(seen: Map<string, string> | null, rows: RunRow[], now: number): Toast[] {
  const out: Toast[] = [];
  for (const r of rows) {
    const st = r.status?.status ?? "";
    if (r.needs_you) { out.push({ id: `d-${r.id}`, kind: "decision", team: r.team, run: r.id, text: r.ask || "a step is waiting for your yes", t: now }); continue; }
    if (!seen || seen.get(r.id) === st || !seen.has(r.id)) continue;
    if (st === "blocked") out.push({ id: `f-${r.id}`, kind: "failed", team: r.team, run: r.id, text: `${r.ask ? `“${r.ask.slice(0, 80)}” ` : ""}failed: the Leader was told`, t: now });
    else if (st === "done") out.push({ id: `k-${r.id}`, kind: "done", team: r.team, run: r.id, text: `${r.ask ? `“${r.ask.slice(0, 80)}” ` : ""}finished · ${money(r.spent_usd)}`, t: now });
  }
  return out;
}
const TONE = { decision: "#f5a524", failed: "#f04e4e", done: "#3ecf8e" } as const;

export function TeamToasts({ paneEveryMs = 4000, autoMs = AUTO_SECONDS * 1000 }: { paneEveryMs?: number; autoMs?: number } = {}) {
  const [toasts, setToasts] = React.useState<Toast[]>([]); const seen = React.useRef<Map<string, string> | null>(null); const gone = React.useRef(new Set<string>()); const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return; const l = await listTeams(); if (stop || l.failed) return;
      const fresh = toastsFrom(seen.current, l.runs, Date.now()); seen.current = new Map(l.runs.map((r) => [r.id, r.status?.status ?? ""]));
      setToasts((old) => {
        const needs = new Set(l.runs.filter((r) => r.needs_you).map((r) => `d-${r.id}`)); const keep = old.filter((t) => (t.kind === "decision" ? needs.has(t.id) : Date.now() - t.t < 14_000));
        const have = new Set(keep.map((t) => t.id)); const add = fresh.filter((t) => !have.has(t.id) && !gone.current.has(t.id));
        const next = [...keep, ...add]; return JSON.stringify(next.map((t) => t.id)) === JSON.stringify(old.map((t) => t.id)) ? old : next;
      });
    };
    void poll(); const t = setInterval(poll, 5000); const u = setInterval(() => setToasts((old) => { const n = old.filter((x) => x.kind === "decision" || Date.now() - x.t < 14_000); return n.length === old.length ? old : n; }), 2000);
    return () => { stop = true; clearInterval(t); clearInterval(u); };
  }, []);
  // A FREE PANE AN AGENT WROTE ASKS FOR APPROVAL HERE (operator 2026-11-25), and one that reaches no app is approved by the clock unless rejected; one that reaches an app waits for the person
  const [drafts, setDrafts] = React.useState<PaneDraft[]>([]); const [now, setNow] = React.useState(() => Date.now());
  const firstSeen = React.useRef(new Map<string, number>()); const rejected = React.useRef(new Set<string>()); const inflight = React.useRef(new Set<string>());
  React.useEffect(() => {
    let stop = false; let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!(typeof document !== "undefined" && document.hidden)) { const d = parseDrafts(await panesOp({ op: "list" })); if (stop) return; for (const x of d) if (!firstSeen.current.has(draftKey(x))) firstSeen.current.set(draftKey(x), Date.now()); setDrafts((old) => (JSON.stringify(old.map(draftKey)) === JSON.stringify(d.map(draftKey)) ? old : d)); }
      if (!stop) t = setTimeout(() => void tick(), paneEveryMs);
    };
    void tick(); return () => { stop = true; clearTimeout(t); };
  }, [paneEveryMs]);
  // a proposed agent provider waits here too, until the person confirms or rejects it (RFC 0023)
  const { proposals, act } = useProviderProposals(paneEveryMs);
  const watch = useWatch(); const browserWaits = watch.asks.length + watch.control.length + watch.groups.filter((g) => g.status === "proposed").length > 0;
  const visible = drafts.filter((d) => !rejected.current.has(draftKey(d)));
  React.useEffect(() => { if (!visible.length) return; const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i); }, [visible.length]);
  const approveDraft = async (d: PaneDraft) => { const k = draftKey(d); if (inflight.current.has(k)) return; inflight.current.add(k); const r = await panesOp({ op: "approve", id: d.id, hash: d.hash }); inflight.current.delete(k); if (r?.ok === true) setDrafts((o) => o.filter((x) => draftKey(x) !== k)); };
  const rejectDraft = (d: PaneDraft) => { rejected.current.add(draftKey(d)); setDrafts((o) => o.filter((x) => draftKey(x) !== draftKey(d))); };
  React.useEffect(() => { for (const d of visible) { const t0 = firstSeen.current.get(draftKey(d)); if (autoApprovable(d) && t0 !== undefined && now - t0 >= autoMs) void approveDraft(d); } });   // eslint-disable-line react-hooks/exhaustive-deps
  const close = (id: string) => { gone.current.add(id); setToasts((o) => o.filter((t) => t.id !== id)); };
  const decide = async (t: Toast, approve: boolean) => {
    setBusy(t.id); const s = await runStatus(t.run); const node = s ? parkedAt(s.graph, s) : null;
    if (s && node) { await answerAt(t.run, node, approve); close(t.id); } setBusy(null);
  };
  if (!toasts.length && !visible.length && !proposals.length && !browserWaits) return null;
  const shown = toasts.slice(-MAX_TOASTS);
  return (
    <div data-testid="team-toasts" role="region" aria-label="notifications" style={{ position: "fixed", right: 16, bottom: 112 /* above the chat box: a card covered its send button (2026-11-26) */, zIndex: 70, display: "flex", flexDirection: "column", gap: 8, width: 320, maxWidth: "calc(100vw - 32px)", fontFamily: nav }}>
      {shown.map((t) => (
        <div key={t.id} data-testid={`toast-${t.kind}`} role={t.kind === "decision" ? "alertdialog" : "status"} style={{ background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 82%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `1px solid color-mix(in srgb, ${TONE[t.kind]} 40%, ${C.border})`, borderRadius: 14, padding: "10px 12px", color: C.fg, boxShadow: "0 8px 28px rgba(0,0,0,.35)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <i aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: TONE[t.kind], flex: "none", boxShadow: t.kind === "decision" ? `0 0 0 4px color-mix(in srgb, ${TONE[t.kind]} 20%, transparent)` : "none" }} />
            <b style={{ fontSize: 12.5, fontWeight: 600 }}>{t.kind === "decision" ? "Needs you" : t.kind === "failed" ? "Run failed" : "Run finished"}</b><span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.team}</span>
            <button aria-label="dismiss" title="dismiss" onClick={() => close(t.id)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.muted, opacity: 0.6, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, margin: "5px 0 0 15px", lineHeight: 1.5 }}>{t.text}</div>
          {t.kind === "decision" && <div style={{ display: "flex", gap: 8, margin: "9px 0 0 15px" }}>
            <button data-testid="toast-approve" disabled={busy === t.id} onClick={() => void decide(t, true)} style={{ fontFamily: nav, fontSize: 12, background: "color-mix(in srgb, #3ecf8e 16%, transparent)", color: "#3ecf8e", border: "1px solid color-mix(in srgb, #3ecf8e 45%, transparent)", borderRadius: 8, padding: "3px 12px", cursor: "pointer" }}>Approve</button>
            <button data-testid="toast-deny" disabled={busy === t.id} onClick={() => void decide(t, false)} style={{ fontFamily: nav, fontSize: 12, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 12px", cursor: "pointer" }}>Deny</button>
          </div>}
        </div>
      ))}
      {visible.slice(0, MAX_TOASTS).map((d) => { const left = autoApprovable(d) ? Math.max(0, Math.ceil((autoMs - (now - (firstSeen.current.get(draftKey(d)) ?? now))) / 1000)) : null; return (
        <div key={draftKey(d)} data-testid="toast-pane" role="alertdialog" aria-label={`${d.title} is ready to open`} style={{ background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 82%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `1px solid color-mix(in srgb, ${TONE.decision} 40%, ${C.border})`, borderRadius: 14, padding: "10px 12px", color: C.fg }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><i aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: TONE.decision, flex: "none" }} /><b style={{ fontSize: 12.5, fontWeight: 600 }}>Pane ready</b><span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span></div>
          <div data-testid="toast-pane-words" style={{ fontSize: 12.5, color: C.muted, margin: "5px 0 0 15px", lineHeight: 1.5 }}>{d.madeBy ? `Made by ${d.madeBy}. ` : ""}{accessWords(d)}{left !== null ? ` Opens in ${left}s.` : " It asks for your yes."}</div>
          <div style={{ display: "flex", gap: 8, margin: "9px 0 0 15px" }}>
            <button data-testid="toast-pane-approve" onClick={() => void approveDraft(d)} style={{ fontFamily: nav, fontSize: 12, background: "color-mix(in srgb, #3ecf8e 16%, transparent)", color: "#3ecf8e", border: "1px solid color-mix(in srgb, #3ecf8e 45%, transparent)", borderRadius: 8, padding: "3px 12px", cursor: "pointer" }}>Approve</button>
            <button data-testid="toast-pane-reject" onClick={() => rejectDraft(d)} style={{ fontFamily: nav, fontSize: 12, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 12px", cursor: "pointer" }}>Reject</button>
          </div>
        </div>); })}
      {proposals.map((p) => <ProviderCard key={p.provider} p={p} act={act} />)}
      <GroupCards />
      <BrowserCards />
    </div>
  );
}
