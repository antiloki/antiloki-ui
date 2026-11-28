// FEAT-FE-SSE-SUBSTRATE-STREAM: one shared EventSource for the whole tab.
// The BE pushes coarse "substrate changed" pings at GET /api/v1/events
// (see antiloki-BE EventsController). usePoll subscribes here and refetches
// on each ping instead of polling on a fixed interval, so an idle board makes
// zero requests. The stream carries no data — only "WHEN to refetch", never
// "WHAT changed" — so every surface still fetches over its own authed endpoint.

import { BE_URL } from "./client";
// ONE STREAM PER BROWSER (2026-09-21): the SharedWorker owns the EventSource; this tab listens to its frames
import { sharedAvailable, sharedListen, sharedSend } from "./shared-stream";

// Mirrors antiloki-BE EventsService.SubstrateChange. EVENT-SOURCED-FE (Phase 1):
// the ping is now entity-scoped + typed, so a subscriber (Phase 5) can patch ONE
// entity in place instead of refetching its whole payload.
export interface EntityChange {
  kind: "card" | "contract" | "timeline" | "driver" | "notification";
  id?: string;
  op?: "append" | "update" | "delete";
}
export interface SubstrateChange {
  t: "change";
  ts: string;
  topics?: string[];
  entities?: EntityChange[];
  action?: string;
  outcome?: string;
}

type Listener = (change?: SubstrateChange) => void;
type Subscription = { fn: Listener; topics?: string[] };

let es: EventSource | null = null;
let sharedOff: (() => void) | null = null; // the shared worker's frames, when the stream lives there
const listeners = new Set<Subscription>();
let connected = false;
let lastEventAt = 0;
let reconnectTimer: any = null;

const RECONNECT_MS = 3000;
// A healthy stream emits a heartbeat every 20s (HEARTBEAT_MS on the BE); if we
// have not heard anything in 50s the connection is effectively dead and callers
// should fall back to their safety-net poll.
const STALE_MS = 50_000;

// pingTopics undefined/empty → broadcast to ALL subscribers (backward
// compatible: old pings carry no topics). When BOTH the ping and the
// subscriber declare topics, deliver only on overlap — this is what stops one
// tick ping from fanning out into every mounted usePoll's refetch.
function notify(change?: SubstrateChange) {
  lastEventAt = Date.now();
  const pingTopics = change?.topics;
  const filtered = Array.isArray(pingTopics) && pingTopics.length > 0;
  for (const sub of listeners) {
    if (filtered && sub.topics && sub.topics.length > 0
      && !pingTopics!.some((t) => sub.topics!.includes(t))) continue;
    // Pass the typed change so an entity-aware subscriber can patch one entity
    // in place (Phase 5); topic-only subscribers ignore the arg and refetch.
    try { sub.fn(change); } catch { /* a bad listener must not kill the stream */ }
  }
}

function connect() {
  if (es || sharedOff) return;
  if (sharedAvailable()) {
    sharedOff = sharedListen("events", (type, data) => {
      if (type === "open") { const wasDown = !connected; connected = true; if (wasDown) notify(); return; }
      if (type === "error") { connected = false; return; }
      let msg: any = null; try { msg = JSON.parse(data); } catch { /* non-JSON frame */ }
      if (msg && msg.t === "ping") { lastEventAt = Date.now(); return; }
      notify(msg && typeof msg === "object" ? (msg as SubstrateChange) : undefined);
    });
    sharedSend({ op: "open", key: "events" });
    return;
  }
  if (typeof EventSource === "undefined") return;
  try {
    es = new EventSource(`${BE_URL}/api/v1/events`);
  } catch {
    es = null;
    return;
  }
  es.onopen = () => {
    const wasDown = !connected;
    connected = true;
    // On (re)connect, kick a refetch so any change missed while disconnected
    // is reconciled immediately rather than waiting for the next ping.
    if (wasDown) notify();
  };
  es.onmessage = (ev) => {
    let msg: any = null;
    try { msg = JSON.parse(ev.data); } catch { /* non-JSON frame */ }
    // Heartbeats keep the socket alive but are not substrate changes.
    if (msg && msg.t === "ping") { lastEventAt = Date.now(); return; }
    notify(msg && typeof msg === "object" ? (msg as SubstrateChange) : undefined);
  };
  es.onerror = () => {
    connected = false;
    if (es && es.readyState === EventSource.CLOSED) {
      es.close();
      es = null;
      if (!reconnectTimer && listeners.size > 0) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, RECONNECT_MS);
      }
    }
    // readyState CONNECTING → EventSource is already retrying on its own.
  };
}

function maybeDisconnect() {
  if (listeners.size > 0) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (es) { es.close(); es = null; }
  if (sharedOff) { sharedOff(); sharedOff = null; sharedSend({ op: "close", key: "events" }); }
  connected = false;
}

// Subscribe to "substrate changed" pings. Returns an unsubscribe function.
// The shared EventSource is opened on the first subscriber and closed when the
// last one leaves. Optional `topics`: when the incoming ping ALSO declares
// topics, this subscriber is only notified on overlap; pings without topics
// reach everyone (backward compatible).
export function subscribeToSubstrate(listener: Listener, topics?: string[]): () => void {
  const sub: Subscription = { fn: listener, topics };
  listeners.add(sub);
  connect();
  return () => {
    listeners.delete(sub);
    maybeDisconnect();
  };
}

// True when the stream is connected AND has produced traffic recently. Callers
// use this to decide whether their safety-net poll can be skipped.
export function isStreamHealthy(): boolean {
  return connected && Date.now() - lastEventAt < STALE_MS;
}
