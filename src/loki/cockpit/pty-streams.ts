// THE MULTIPLEXED PTY STREAM (2026-09-20): ONE EventSource per browser tab carrying every terminal pane
// the tab shows. A stream per pane plus the events stream hit Chrome's 6-connections-per-host cap at
// five agents — the sixth terminal never connected and every other request queued behind ("the
// terminal UI broke" when a sixth agent was added). Panes subscribe here; the module opens the stream
// on the first subscriber, tells the serve which panes to follow, re-adds them all on every `hello`
// (a reconnect lands on a fresh, empty subscription), and closes the stream with the last subscriber.
import { BE_URL, apiPost } from "@/loki/api/client";
// ONE STREAM PER BROWSER (2026-09-21): the SharedWorker owns the stream and the subscription; every tab's
// panes are followed through it (refcounted there) — see api/stream-hub.ts
import { sharedAvailable, sharedListen, sharedSend } from "@/loki/api/shared-stream";

export type PaneStreamHandlers = {
  chunk: (id: number, data: string) => void;
  ready: (lastId: number) => void;
  exit: (data: string) => void;
  /** the stream could not be opened at all — the pane falls back to polling */
  unavailable?: () => void;
};
type Follower = { after: number; h: PaneStreamHandlers };
/** THE CHAT AGENT (2026-09-20): the same stream carries a pane's agent-session events (`kind: "agent"`),
 *  keyed apart from its PTY so a tab may follow both. */
export type AgentStreamHandlers = { event: (seq: number, data: any) => void; ready: (lastSeq: number, status: any) => void };
type AgentFollower = { after: number; h: AgentStreamHandlers };
const agentFollowers = new Map<number, AgentFollower>();

/** The one event the serve sends: `{pane, kind, id?, data?}`. Pure — tested. */
export function parsePaneEvent(raw: string): { pane: number; kind: string; id: number | null; data: string } | null {
  try {
    const m = JSON.parse(raw);
    const pane = Number(m?.pane);
    if (!Number.isFinite(pane) || typeof m?.kind !== "string") return null;
    return { pane, kind: m.kind, id: m.id == null ? null : Number(m.id), data: typeof m.data === "string" ? m.data : "" };
  } catch { return null; }
}

const subId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const followers = new Map<number, Follower>();
let es: EventSource | null = null;
let sharedOff: (() => void) | null = null; // the worker's frames, when the stream lives there
const shared = () => sharedAvailable();
let hello = false;      // the serve acknowledged THIS connection — adds may be posted
let everOpened = false; // never connected → the panes poll instead

async function post(add: { pane_id: number; after: number; agent?: boolean }[], remove: number[]) {
  if (!add.length && !remove.length) return;
  try { await apiPost(`/api/v1/cockpit/pty/streams/sub`, { sub: subId, add, remove }, { timeoutMs: 10_000 }); } catch { /* the next hello re-adds */ }
}

/** One `pane` frame, from either transport. */
function onPane(raw: string) {
    const m = parsePaneEvent(raw);
    if (!m) return;
    if (m.kind === "agent" || m.kind === "agent-ready" || m.kind === "agent-lagged") {
      const a = agentFollowers.get(m.pane); if (!a) return;
      let full: any = null; try { full = JSON.parse(raw); } catch { return; }
      const seq = Number(full.seq) || 0;
      if (m.kind === "agent") { if (seq && seq <= a.after) return; if (seq) a.after = seq; a.h.event(seq, full.data); }
      else if (m.kind === "agent-ready") { if (seq > a.after) a.after = seq; a.h.ready(a.after, full.data); }
      return;
    }
    const f = followers.get(m.pane);
    if (!f) return;
    // a backlog chunk carries the telemetry row `id` (dedup + the resume point); a LIVE chunk carries the
    // PTY's own `seq`, which restarts at 1 on every start — never compared with an id (that dropped every
    // live chunk after a restart: a frozen screen with the keys "useless", 2026-09-20)
    if (m.kind === "chunk") { if (m.id != null) { if (m.id <= f.after) return; f.after = m.id; } f.h.chunk(m.id ?? 0, m.data); }
    else if (m.kind === "ready") { if (m.id != null && m.id > f.after) f.after = m.id; f.h.ready(f.after); }
    else if (m.kind === "exit") f.h.exit(m.data);
}
function open() {
  if (es || sharedOff) return;
  if (shared()) {
    // the worker follows the panes for this tab; `hello` means its stream is up (it re-adds by itself)
    sharedOff = sharedListen("pty", (type, data) => {
      if (type === "hello") { hello = true; everOpened = true; return; }
      if (type === "error") { hello = false; return; }
      if (type === "pane") onPane(data);
    });
    sharedSend({ op: "open", key: "pty" });
    for (const [pane, f] of followers) sharedSend({ op: "follow", pane, after: f.after });
    for (const [pane, f] of agentFollowers) sharedSend({ op: "follow", pane, after: f.after, agent: true });
    return;
  }
  if (typeof EventSource === "undefined") { for (const f of followers.values()) f.h.unavailable?.(); return; }
  hello = false;
  es = new EventSource(`${BE_URL}/api/v1/cockpit/pty/streams?sub=${encodeURIComponent(subId)}`);
  es.addEventListener("hello", () => {
    hello = true; everOpened = true;
    // every pane this tab follows, from where each one is — the serve's side is empty on a (re)connect
    void post([...Array.from(followers, ([pane_id, f]) => ({ pane_id, after: f.after })), ...Array.from(agentFollowers, ([pane_id, f]) => ({ pane_id, after: f.after, agent: true }))], []);
  });
  es.addEventListener("pane", (ev: any) => onPane(String(ev.data ?? "")));
  es.onerror = () => {
    // never connected → the panes poll; connected then dropped (a serve restart) → the browser
    // reconnects by itself and the next hello re-adds every pane
    if (!everOpened) { es?.close(); es = null; for (const f of followers.values()) f.h.unavailable?.(); }
    hello = false;
  };
}

/** Follow a pane's output from `after`; returns the unsubscribe. */
export function subscribePane(paneId: number, after: number, h: PaneStreamHandlers): () => void {
  followers.set(paneId, { after, h });
  if (!es && !sharedOff) open();
  else if (sharedOff) sharedSend({ op: "follow", pane: paneId, after });
  else if (hello) void post([{ pane_id: paneId, after }], []);
  return () => {
    followers.delete(paneId);
    if (sharedOff) sharedSend({ op: "unfollow", pane: paneId });
    else if (hello) void post([], [paneId]);
    closeIfIdle();
  };
}
function closeIfIdle() {
  if (followers.size || agentFollowers.size) return;
  if (es) { es.close(); es = null; hello = false; }
  if (sharedOff) { sharedOff(); sharedOff = null; hello = false; sharedSend({ op: "close", key: "pty" }); }
}

/** Follow a pane's chat-agent session from `after`; returns the unsubscribe. */
export function subscribeAgent(paneId: number, after: number, h: AgentStreamHandlers): () => void {
  agentFollowers.set(paneId, { after, h });
  if (!es && !sharedOff) open();
  else if (sharedOff) sharedSend({ op: "follow", pane: paneId, after, agent: true });
  else if (hello) void post([{ pane_id: paneId, after, agent: true }], []);
  return () => {
    agentFollowers.delete(paneId);
    if (sharedOff) sharedSend({ op: "unfollow", pane: paneId, agent: true });
    else if (hello && !followers.has(paneId)) void post([], [paneId]);
    closeIfIdle();
  };
}
/** For tests and the status line: how many panes ride the one stream. */
export function streamFollowers(): number { return followers.size + agentFollowers.size; }
