// THE SHARED WORKER (2026-09-21): one per browser — see stream-hub.ts for what it does and why. This file is
// only the wiring: real EventSources, a real fetch for the pane subscription, one hub, every tab a port.
/// <reference lib="webworker" />
import { StreamHub, type HubMsg } from "./stream-hub";
import { reconnectingSource, type RawSource } from "./reconnect-source";

const openSource = (url: string, on: (type: string, data: string) => void, onState: (state: "open" | "error", readyState: number) => void) =>
  // reconnectingSource: an EventSource the server answered with an error (the proxy's 502 while the serve restarts) is closed for good by the browser - see reconnect-source.ts
  reconnectingSource(() => new EventSource(url) as unknown as RawSource, on, onState, ["hello", "pane"]);
const poster = async (be: string, body: { sub: string; add: { pane_id: number; after: number; agent?: boolean }[]; remove: number[] }) => {
  try { await fetch(`${be}/api/v1/cockpit/pty/streams/sub`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); } catch { /* the next hello re-adds */ }
};
// the history a tab that joins an already-followed pane is owed — the same frames the pane stream carries
const replayer = async (be: string, pane: number, after: number) => {
  const j = async (path: string) => { const r = await fetch(`${be}${path}`); return r.json(); };
  const ev = await j(`/api/v1/cockpit/agent/events?pane_id=${pane}&after=${after}`);
  const frames: { key: "pty"; type: string; data: string }[] = [];
  for (const e of Array.isArray(ev?.events) ? ev.events : []) frames.push({ key: "pty", type: "pane", data: JSON.stringify({ pane, kind: "agent", seq: e.seq, data: { seq: e.seq, t: e.t, ev: e.ev } }) });
  const st = await j(`/api/v1/cockpit/agent/status?pane_id=${pane}`);
  frames.push({ key: "pty", type: "pane", data: JSON.stringify({ pane, kind: "agent-ready", seq: Number(st?.last_seq) || 0, data: st }) });
  return frames;
};
const hub = new StreamHub(openSource, poster, () => Date.now(), undefined, replayer);
setInterval(() => hub.sweep(), 15_000);

(self as unknown as SharedWorkerGlobalScope).onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  hub.attach(port);
  port.onmessage = (ev: MessageEvent<HubMsg>) => hub.handle(port, ev.data);
  port.start();
};
