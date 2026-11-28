// AGENT INTERACTIONS (operator 2026-07-25) — the shared verbs every widget uses to talk to an agent
// terminal: say (type into its PTY), feed (hand-deliver a file into its worktree + tell it to read),
// listAgents (the chat session's CLI panes, for pickers). All against existing routes.
import type React from "react";
import { apiGet, apiPost } from "@/loki/api/client";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
// every seat, since 2026-09-28: `/model` and a typed ask reach all of them through the same `agent/send`
const CLI = new Set(["claude-code", "codex", "gemini", "grok", "cursor", "opencode", "opencode-direct"]);

export type AgentPane = { id: number; kind: string; name: string; branch?: string | null };

export async function listAgents(chatSessionId: number | null | undefined): Promise<AgentPane[]> {
  try {
    const list = unwrap(await apiPost(`/api/v1/cockpit/session/get`, {}, { timeoutMs: 12_000 }));
    const cs = (Array.isArray(list?.sessions) ? list.sessions : []).filter((s: any) => s?.name === `antichat#${chatSessionId ?? "solo"}` && s?.status !== "closed").sort((a: any, b: any) => a.id - b.id)[0];
    if (!cs?.id) return [];
    const got = unwrap(await apiPost(`/api/v1/cockpit/session/get`, { id: cs.id }, { timeoutMs: 12_000 }));
    return (Array.isArray(got?.panes) ? got.panes : [])
      .filter((p: any) => CLI.has(String(p.pane_kind)) && p.worktree_path)
      .map((p: any) => ({ id: p.id, kind: p.pane_kind, name: p.subagent_name, branch: p.branch }));
  } catch { return []; }
}

// type into the agent's terminal — the PTY is the agent's stdin, so this IS talking to it.
// TWO writes, not one: CLI TUIs paste-detect a chunk arriving all at once, and a \r INSIDE a paste is a
// soft newline in the composer (text lands in the field, nothing submits). A lone \r after a beat is a
// real Enter keypress — that's the submit.
// THE CHAT AGENT (2026-09-20): a pane in chat mode has no PTY — the same call goes to its session
// (`agent/send`); a `/model x` line becomes the session's model switch (the router's tier).
const chatPanes = new Set<number>();
export function markChatPane(paneId: number, on: boolean) { if (on) chatPanes.add(paneId); else chatPanes.delete(paneId); }
export function isChatPane(paneId: number): boolean { return chatPanes.has(paneId); }
export async function sayToAgent(paneId: number, text: string, opts: { /** MIN's fallback (2026-09-21): this ask names files without intel — the serve lifts MIN for one turn */ liftMin?: boolean; /** what the bubble shows (the ask alone) when the text carries context */ display?: string } = {}): Promise<boolean> {
  if (chatPanes.has(paneId)) {
    try {
      const body = text.replace(/[\r\n]+$/, "");
      const m = /^\/model\s+(\S+)$/.exec(body.trim());
      if (m) { await apiPost(`/api/v1/cockpit/agent/send`, { pane_id: paneId, text: "", model: m[1] }, { timeoutMs: 60_000 }); return true; }
      // `/tier low|mid|high` (2026-09-20): the router's tier for a non-Claude chat pane — the serve picks the engine's model
      const tr = /^\/tier\s+(low|mid|high)$/.exec(body.trim());
      if (tr) { await apiPost(`/api/v1/cockpit/agent/send`, { pane_id: paneId, text: "", tier: tr[1] }, { timeoutMs: 60_000 }); return true; }
      const r: any = await apiPost(`/api/v1/cockpit/agent/send`, { pane_id: paneId, text: body, ...(opts.liftMin ? { lift_min: true } : {}), ...(opts.display ? { display: opts.display } : {}) }, { timeoutMs: 60_000 });
      return (r?.result ?? r)?.ok !== false; // a refused send (engine not supported, session gone) is a failure, not a delivery
    } catch { return false; }
  }
  try {
    const body = text.replace(/[\r\n]+$/, "");
    // A STOPPED TERMINAL STARTS (operator 2026-09-21: "if an agent is stopped, the buttons that act on it start
    // it and then do their thing"): a chip typed into a dead PTY was lost — the CLI is started first, the ask
    // typed once its composer is painted (the chat session already does this on its own send)
    await ensurePtyRunning(paneId);
    if (body) await apiPost(`/api/v1/cockpit/pty/input`, { pane_id: paneId, data: body }, { timeoutMs: 10_000 });
    await new Promise((r) => setTimeout(r, 350));
    await apiPost(`/api/v1/cockpit/pty/input`, { pane_id: paneId, data: "\r" }, { timeoutMs: 10_000 });
    return true;
  } catch { return false; }
}
/** The pane's PTY, started when it is not running (the serve derives the CLI from the pane's kind), then awaited
 *  until its composer is painted (`ready`) — up to 40 s, the boot beat the first ask uses. */
export async function ensurePtyRunning(paneId: number): Promise<boolean> {
  const status = async () => { try { const s: any = await apiGet(`/api/v1/cockpit/pty/status?pane_id=${paneId}`); return (s?.result ?? s) ?? {}; } catch { return {}; } };
  let st = await status();
  if (st.running) return true;
  // the serve takes the CLI from the pane's kind
  try { await apiPost(`/api/v1/cockpit/pty/start`, { pane_id: paneId, cols: 110, rows: 32 }, { timeoutMs: 60_000 }); } catch { return false; }
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 1000)); st = await status(); if (st.running && st.ready !== false) return true; if (!st.running && i > 3) return false; }
  return !!st.running;
}
// put text INTO the terminal's input field WITHOUT submitting — the user (or agent) completes it.
export async function typeToAgent(paneId: number, text: string): Promise<boolean> {
  try { await apiPost(`/api/v1/cockpit/pty/input`, { pane_id: paneId, data: text.replace(/\r|\n/g, " ") }, { timeoutMs: 10_000 }); return true; }
  catch { return false; }
}

// ── BLOCK DRAG (operator 2026-07-25: "drag blocks from widgets and use them at the agent") ──────
// a draggable BLOCK is any piece of a widget: a kanban card, a file, a finding. Sources call
// startBlockDrag in onDragStart; the agent pane's drop overlay reads it back and Adds (standing
// context) or Uses (one-shot). Deliberate, visible, provenance-labeled prompt injection.
export const BLOCK_MIME = "application/x-antiloki-block";
export type Block = { label: string; uid: string; source: string; content: string };
export function startBlockDrag(e: React.DragEvent, block: Block) {
  try {
    e.dataTransfer.setData(BLOCK_MIME, JSON.stringify(block));
    e.dataTransfer.setData("text/plain", block.content.slice(0, 2000)); // outside-world fallback
    e.dataTransfer.effectAllowed = "copy";
  } catch { /* dnd unavailable */ }
}
export function readBlockDrag(e: React.DragEvent): Block | null {
  try { const b = JSON.parse(e.dataTransfer.getData(BLOCK_MIME) || "null"); return b?.content ? b : null; } catch { return null; }
}
export const hasBlockDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes(BLOCK_MIME);

// hand a widget's intel to the agent: file into its box, then one line into the PTY.
// sayLine === null → SILENT (implicit context: the file + AGENTS.md index deliver it, no terminal text).
export async function feedAgent(paneId: number, name: string, content: string, sayLine?: string | null): Promise<string | null> {
  const r = unwrap(await apiPost(`/api/v1/pane/feed`, { pane_id: paneId, name, content }, { timeoutMs: 20_000 }));
  if (!r?.path) return null;
  if (sayLine !== null) await sayToAgent(paneId, sayLine ?? `Read ${r.path} — it carries context relevant to your task. Acknowledge in one line, then continue.`);
  return r.path;
}
