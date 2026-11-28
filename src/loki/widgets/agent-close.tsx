// CLOSING AN AGENT (operator 2026-09-16: "when closing an agent it should check for changes and ask
// for merge or discard"). The dock's ✕ on a CLI-agent widget no longer just destroys the slot: the
// pane's box is inspected (pane/diff mode=status — read-only) and the operator chooses:
//   THE PULL REQUEST (operator 2026-09-21: "a PR is only created when an agent that changed the code is closed
//   and the user does not discard") — this dialog is the ONE place a PR is born; the merge happens on the PR screen.
//   merge   → pr/open {pane_id}            commits the box (the bake's own files left out), scope-gates
//                                          the diff, opens the PR — and lands on the PR screen where
//                                          the diff, the analysis and the checks are read before the
//                                          merge; the box closes from there (2026-09-19: "once we want
//                                          to merge a worktree the PR screen must be reached")
//   discard → pane/remove {mode: discard}  removes the worktree AND the branch (unmerged commits go)
//   keep    → the widget leaves the dock; the pane, its box and its scope claims stay (reopen later)
// A clean box is removed without asking — its scope claims would otherwise block the next agent.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import { paneDisplay } from "./types";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
// every seat, since 2026-09-28 — closing a Cursor or Gemini pane is the same act as closing a Claude one
export const CLI_KINDS = new Set(["claude-code", "codex", "gemini", "grok", "cursor", "opencode", "opencode-direct"]);

export type PaneStatus = { ok: boolean; error?: string; base?: string; branch?: string | null; uncommitted?: number; files?: string[]; ahead?: number; ahead_files?: string[]; dirty?: boolean };

/** The pane row behind a vibe-pane widget (subagent_name = the widget's stable key). */
export async function findPaneForWidget(payload: any, chatSessionId: number | null | undefined): Promise<any | null> {
  const sessionId = Number(payload?.sessionId ?? payload?.session_id);
  const paneId = Number(payload?.paneId ?? payload?.pane_id);
  if (!Number.isFinite(sessionId) || !Number.isFinite(paneId)) return null;
  const key = `chat-${sessionId}-${paneId}`.slice(0, 80);
  const name = `antichat#${chatSessionId ?? "solo"}`;
  try {
    const list = unwrap(await apiPost(`/api/v1/cockpit/session/get`, {}, { timeoutMs: 15_000 }));
    const cs = (Array.isArray(list?.sessions) ? list.sessions : []).filter((s: any) => s?.name === name && s?.status !== "closed").sort((a: any, b: any) => a.id - b.id)[0];
    if (!cs?.id) return null;
    const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: cs.id }, { timeoutMs: 15_000 }));
    return (Array.isArray(got?.panes) ? got.panes : []).find((x: any) => x?.subagent_name === key) ?? null;
  } catch { return null; }
}

export async function paneStatus(paneId: number): Promise<PaneStatus> {
  try { return unwrap(await apiPost(`/api/v1/cockpit/pane/diff`, { pane_id: paneId, mode: "status" }, { timeoutMs: 30_000 })) ?? { ok: false, error: "no answer" }; }
  catch (e: any) { return { ok: false, error: String(e?.message ?? "status failed") }; }
}

/** Open (or refresh) the PR of a pane: commits its box, gates the diff by its scope, upserts the PR row. */
export type SealVerdict = { passed: boolean; score: number; summary: string; findings: { task?: string | null; kind: string; text: string }[] };
export async function openPaneReview(paneId: number, force = false): Promise<{ ok: boolean; prId?: number; error?: string; sealed?: SealVerdict }> {
  try {
    // QA v2 (2026-09-21): the pane route — the box's QA verdicts ride on the PR body; a failed latest verdict
    // SEALS the box (`sealed`) until the operator opens it anyway (`force`)
    const raw = await apiPost(`/api/v1/cockpit/pane/pr`, { pane_id: paneId, ...(force ? { force: true } : {}) }, { timeoutMs: 120_000 })
      .then(unwrap)
      // a serve from before the pane route (404): the plain engine action, no seal, no verdicts on the body
      .catch(async (e: any) => (/404|not found/i.test(String(e?.message ?? "")) ? unwrap(await apiPost(`/api/v1/cockpit/pr/open`, { pane_id: paneId }, { timeoutMs: 120_000 })) : Promise.reject(e)));
    if (raw?.sealed) return { ok: false, sealed: raw.qa as SealVerdict, error: String(raw?.error?.message ?? "sealed by the QA judge") };
    const r = raw?.result ?? raw;
    const id = Array.isArray(r?.opened) ? Number(r.opened[0]) : NaN;
    if (Number.isFinite(id) && id > 0) return { ok: true, prId: id };
    const sk = Array.isArray(r?.skipped) ? r.skipped[0] : null;
    return { ok: false, error: sk?.reason === "out_of_scope" ? `out of scope: ${(sk.files ?? []).slice(0, 6).join(", ")}${(sk.files ?? []).length > 6 ? ", …" : ""} — the pane scope is the boundary; discard or re-scope` : String(sk?.reason ?? r?.error ?? "could not open the pull request") };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? "open failed") }; }
}
/** where the PR screen lives, with the PR selected — pure */
export const prScreenHref = (prId: number) => `/operations/pulls?pr=${prId}`;

export async function removePane(paneId: number, mode: "merge" | "discard" | null): Promise<{ ok: boolean; error?: string; merged?: boolean }> {
  try { return unwrap(await apiPost(`/api/v1/cockpit/pane/remove`, { pane_id: paneId, ...(mode ? { mode } : {}) }, { timeoutMs: 120_000 })) ?? { ok: false, error: "no answer" }; }
  catch (e: any) { return { ok: false, error: String(e?.message ?? "remove failed") }; }
}

/** What the dialog says for a status — pure, so it is testable. */
export function statusSummary(s: PaneStatus): string {
  if (!s.ok) return s.error ?? "could not inspect the box";
  const u = Number(s.uncommitted ?? 0); const a = Number(s.ahead ?? 0);
  if (!u && !a) return "the box is clean — nothing to merge";
  const bits: string[] = [];
  if (u) bits.push(`${u} uncommitted file${u === 1 ? "" : "s"}`);
  if (a) bits.push(`${a} commit${a === 1 ? "" : "s"} ahead of ${s.base || "base"}`);
  return bits.join(" · ");
}

/** A pane by id, searched across the open cockpit sessions (for a pane whose widget is gone). */
export async function findPaneById(paneId: number): Promise<any | null> {
  try {
    const list = unwrap(await apiPost(`/api/v1/cockpit/session/get`, {}, { timeoutMs: 15_000 }));
    for (const s of (Array.isArray(list?.sessions) ? list.sessions : [])) {
      if (s?.status === "closed") continue;
      const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: s.id }, { timeoutMs: 15_000 }));
      const p = (Array.isArray(got?.panes) ? got.panes : []).find((x: any) => Number(x?.id) === paneId);
      if (p) return p;
    }
  } catch { /* fall through */ }
  return null;
}

export function AgentCloseDialog({ kind, payload, paneId, chatSessionId, onDone, onCancel }: { kind: string; payload?: any; paneId?: number; chatSessionId?: number | null; onDone: () => void; onCancel: () => void }) {
  const [pane, setPane] = React.useState<any | null | undefined>(undefined); // undefined = looking
  const [status, setStatus] = React.useState<PaneStatus | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const d = paneDisplay(String(pane?.pane_kind ?? kind));
  React.useEffect(() => {
    let live = true;
    void (async () => {
      const p = paneId != null ? await findPaneById(paneId) : await findPaneForWidget(payload, chatSessionId);
      if (!live) return;
      setPane(p);
      if (!p) return; // never provisioned — nothing to ask
      if (!p.worktree_path) { setStatus({ ok: true, dirty: false }); return; }
      const s = await paneStatus(p.id);
      if (!live) return;
      setStatus(s);
    })();
    return () => { live = false; };
  }, [payload, paneId, chatSessionId]);
  // no pane row, or a clean box → tear down silently and let the widget go
  React.useEffect(() => {
    if (pane === undefined) return;
    if (pane === null) { onDone(); return; }
    if (status && status.ok && !status.dirty && !busy) {
      setBusy("removing");
      void removePane(pane.id, null).then(() => onDone());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, status]);
  const [seal, setSeal] = React.useState<SealVerdict | null>(null);
  const act = async (mode: "merge" | "discard", force = false) => {
    if (!pane) return;
    setBusy(mode); setErr(null);
    if (mode === "merge") {
      // THE PR SCREEN IS THE WAY TO A MERGE: open the pane's PR, then go read it there
      const r = await openPaneReview(pane.id, force);
      if (r.ok && r.prId) { window.location.assign(prScreenHref(r.prId)); return; }
      if (r.sealed) { setSeal(r.sealed); setBusy(null); return; }
      setErr(r.error ?? "could not open the pull request"); setBusy(null); return;
    }
    const r = await removePane(pane.id, mode);
    if (r.ok) { onDone(); return; }
    setErr(r.error ?? `${mode} failed`);
    setBusy(null);
  };
  const files = [...(status?.files ?? []), ...(status?.ahead_files ?? [])].filter((f, i, a) => a.indexOf(f) === i);
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="agent-close" style={{ width: "min(560px, 94vw)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>{d.glyph} closing {d.name}{pane?.branch ? <span style={{ color: C.dim, fontWeight: 400 }}> · {pane.branch}</span> : null}</span>
        {pane === undefined && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>looking at the box…</span>}
        {pane && !status && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>inspecting the box for changes…</span>}
        {pane && status && !status.dirty && status.ok && <span style={{ fontFamily: mono, fontSize: 10, color: C.ok }}>the box is clean — removing it and freeing its scope…</span>}
        {pane && status && !status.ok && <span style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>{statusSummary(status)}</span>}
        {pane && status?.dirty && (
          <>
            <span style={{ fontFamily: mono, fontSize: 10.5, color: C.warn, fontWeight: 600 }}>{statusSummary(status)}</span>
            {files.length > 0 && (
              <div style={{ maxHeight: 160, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", fontFamily: mono, fontSize: 9.5, color: C.fg, lineHeight: 1.6 }}>
                {files.slice(0, 40).map((f) => <div key={f}>{f}</div>)}
                {files.length > 40 && <div style={{ color: C.muted }}>… {files.length - 40} more</div>}
              </div>
            )}
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>
              <b style={{ color: C.ok }}>Pull Request</b> commits the box, checks every change against the scope, and opens the pull request of <code>{pane.branch}</code> → <code>{status.base || "base"}</code> on the PR screen — the diff, the analysis and the checks are read there before the merge; a conflict aborts and nothing changes.
              {" "}<b style={{ color: C.bad }}>discard</b> deletes the box and the branch — the changes are gone.
              {" "}<b>keep</b> leaves the box in place (it still owns its scope) for a later reopen.
            </span>
            {err && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err}</span>}
            {seal && <div data-testid="agent-close-seal" style={{ border: `1px solid ${C.bad}`, borderRadius: 8, padding: "8px 10px", fontFamily: mono, fontSize: 10.5, color: C.fg, display: "flex", flexDirection: "column", gap: 4 }}>
                <b style={{ color: C.bad }}>sealed — the QA judge failed the latest run · {seal.score}/100</b>
                <span style={{ color: C.dim }}>{seal.summary}</span>
                {seal.findings.slice(0, 4).map((f, i) => <span key={i} style={{ color: C.dim }}>· [{f.kind}]{f.task ? ` ${f.task} ·` : ""} {f.text}</span>)}
                <span style={{ marginTop: 4 }}><button disabled={!!busy} onClick={() => void act("merge", true)} style={{ background: "transparent", border: `1px solid ${C.bad}`, color: C.bad, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700 }}>⎇ open the pull request anyway</button></span>
              </div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button disabled={!!busy} onClick={() => void act("merge")} style={{ background: C.ok, border: "none", color: C.bg, borderRadius: 6, padding: "4px 14px", cursor: busy ? "wait" : "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700 }}>{busy === "merge" ? "opening the pull request…" : "⎇ Pull Request"}</button>
              <button disabled={!!busy} onClick={() => { if (window.confirm(`Discard the box and branch ${pane.branch ?? ""}? The changes listed above are lost.`)) void act("discard"); }} style={{ background: "transparent", border: `1px solid ${C.bad}`, color: C.bad, borderRadius: 6, padding: "4px 14px", cursor: busy ? "wait" : "pointer", fontFamily: mono, fontSize: 10.5 }}>{busy === "discard" ? "discarding…" : "✕ discard"}</button>
              <span style={{ flex: 1 }} />
              <button disabled={!!busy} onClick={onDone} title="close the widget, keep the box and its scope" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>keep the box</button>
              <button disabled={!!busy} onClick={onCancel} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>cancel</button>
            </div>
          </>
        )}
        {pane && status && !status.ok && (
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ flex: 1 }} />
            <button onClick={onDone} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>close the widget anyway</button>
            <button onClick={onCancel} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
