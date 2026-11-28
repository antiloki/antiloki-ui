// THE TAB'S SIDE OF THE SHARED WORKER (2026-09-21): a tiny client the two stream modules use instead of their
// own EventSource when a SharedWorker is available — the frames come back shaped like EventSource events.
// No SharedWorker (an old WebKit, a blocked worker) → `null`, and the module opens its own EventSource as before.
import { BE_URL } from "./client";
import type { HubFrame, HubMsg } from "./stream-hub";

type Handler = (type: string, data: string, subId?: string) => void;
let port: MessagePort | null | undefined; // undefined = not tried yet; null = unavailable
const handlers = new Map<"events" | "pty", Set<Handler>>();
let pinger: any = null;

function connect(): MessagePort | null {
  if (port !== undefined) return port;
  try {
    if (typeof SharedWorker === "undefined" || (globalThis as any).__ANTILOKI_NO_SHARED_WORKER__) { port = null; return null; }
    const w = new SharedWorker(new URL("./stream-worker.ts", import.meta.url), { type: "module", name: "antiloki-streams" });
    w.onerror = () => { /* a failed worker: the frames never come; the modules' health checks fall back to polling */ };
    port = w.port;
    port.onmessage = (ev: MessageEvent<HubFrame>) => { const f = ev.data; for (const h of handlers.get(f.key) ?? []) { try { h(f.type, f.data ?? "", f.subId); } catch { /* one bad handler must not kill the rest */ } } };
    port.start();
    port.postMessage({ op: "init", be: BE_URL } satisfies HubMsg);
    pinger = setInterval(() => port?.postMessage({ op: "ping" } satisfies HubMsg), 15_000);
    // BACK ON SCREEN: a tab that was hidden may have been swept by the hub - say what it follows again
    const back = () => { if (document.visibilityState === "visible") replayWanted((m) => { try { port?.postMessage(m); } catch { /* gone */ } }); };
    document.addEventListener("visibilitychange", back); window.addEventListener("pageshow", back);
    window.addEventListener("pagehide", () => { try { port?.postMessage({ op: "bye" } satisfies HubMsg); } catch { /* gone */ } });
    return port;
  } catch { port = null; return null; }
}
export function sharedAvailable(): boolean { return connect() !== null; }
/** WHAT THIS TAB WANTS FROM THE HUB, remembered so it can be said again: a hub that swept this tab (its timers were throttled in the background) holds none of it any more. */
const wanted = { opens: new Set<"events" | "pty">(), follows: new Map<string, HubMsg>() };
const followKey = (m: { pane: number; agent?: boolean }) => `${m.agent ? "a" : "p"}:${m.pane}`;
export function sharedSend(m: HubMsg) {
  if (m.op === "open") wanted.opens.add(m.key);
  else if (m.op === "close") wanted.opens.delete(m.key);
  else if (m.op === "follow") wanted.follows.set(followKey(m), m);
  else if (m.op === "unfollow") wanted.follows.delete(followKey(m));
  connect()?.postMessage(m);
}
/** Say it all again: the init, every open stream, every followed pane. Idempotent at the hub, which drops what the tab has already seen by `seq`. Pure over what was remembered - tested. */
export function replayWanted(send: (m: HubMsg) => void) {
  send({ op: "init", be: BE_URL });
  for (const key of wanted.opens) send({ op: "open", key });
  for (const m of wanted.follows.values()) send(m);
}
/** Listen to one stream's frames; returns the unsubscribe. */
export function sharedListen(key: "events" | "pty", h: Handler): () => void {
  if (!connect()) return () => {};
  (handlers.get(key) ?? handlers.set(key, new Set()).get(key)!).add(h);
  return () => { handlers.get(key)?.delete(h); };
}
/** for tests: forget the worker so the next call tries again */
export function _resetShared() { if (pinger) clearInterval(pinger); pinger = null; port = undefined; handlers.clear(); wanted.opens.clear(); wanted.follows.clear(); }
