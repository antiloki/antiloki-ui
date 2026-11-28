// THE STREAM HUB (operator 2026-09-21, after the day the cap bit twice): Chrome allows 6 connections per
// host per BROWSER, not per tab — two antiloki tabs each holding the events stream, the PTY/agent stream
// and their polls starve each other, and the second tab shows "connecting to the substrate…" until the
// first one closes. The hub runs in ONE SharedWorker per browser and owns the two long-lived streams:
//   · `events`  — /api/v1/events, the substrate-changed pings, broadcast to every tab;
//   · `pty`     — /api/v1/cockpit/pty/streams?sub=…, the multiplexed pane stream: ONE subscription id for
//                 the whole browser, the panes every tab follows refcounted here, `add`/`remove` posted
//                 once, the events fanned out to the tabs that follow the pane.
// Pure over injected sources and a poster, so the whole protocol is tested without a worker.
// Wire: tab → hub `{op}` messages; hub → tab `{key, type, data}` frames a tab handles like EventSource events.

export type HubMsg =
  | { op: "init"; be: string }
  | { op: "open"; key: "events" | "pty" }
  | { op: "close"; key: "events" | "pty" }
  | { op: "follow"; pane: number; after: number; agent?: boolean }
  | { op: "unfollow"; pane: number; agent?: boolean }
  | { op: "ping" }
  | { op: "bye" };
export type HubFrame = { key: "events" | "pty"; type: string; data?: string; subId?: string };

export type Source = { close: () => void };
export type OpenSource = (url: string, on: (type: string, data: string) => void, onState: (state: "open" | "error", readyState: number) => void) => Source;
export type Poster = (be: string, body: { sub: string; add: { pane_id: number; after: number; agent?: boolean }[]; remove: number[] }) => Promise<void>;
export type PortLike = { postMessage: (m: HubFrame) => void };
/** The history of an agent pane from `after` on, as the frames the stream itself would have carried — for a tab that joins a pane somebody already follows. */
export type Replayer = (be: string, pane: number, after: number) => Promise<HubFrame[]>;

type Client = { port: PortLike; keys: Set<"events" | "pty">; follows: Set<string>; lastSeen: number };
const followKey = (pane: number, agent?: boolean) => `${agent ? "a" : "p"}:${pane}`;

export class StreamHub {
  private clients = new Map<PortLike, Client>();
  private be = "";
  private events: Source | null = null;
  private pty: Source | null = null;
  private ptyHello = false;
  /** the browser-wide subscription id the serve keys the pane stream by */
  readonly subId: string;
  /** pane follows across every tab: key → {ports, the earliest `after` asked for} */
  private follows = new Map<string, { ports: Set<PortLike>; after: number }>();
  constructor(private openSource: OpenSource, private poster: Poster, private now: () => number = () => Date.now(), subId?: string, private replayer?: Replayer) {
    this.subId = subId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  attach(port: PortLike) { this.clients.set(port, { port, keys: new Set(), follows: new Set(), lastSeen: this.now() }); }
  detach(port: PortLike) {
    const c = this.clients.get(port); if (!c) return;
    for (const k of Array.from(c.follows)) this.unfollow(port, k);
    this.clients.delete(port);
    this.gc();
  }
  handle(port: PortLike, m: HubMsg) {
    // A PORT THAT SPEAKS IS ALIVE (operator 2026-10-09: a cockpit tab in a background window went stale for good): a hidden tab's timers are throttled, its 15 s ping arrives late, `sweep` took it for a closed
    // tab and released its follows - and this method then ignored it for ever, even after the tab was back on screen. A message from a port the hub does not hold re-adopts it; the tab replays what it follows.
    if (!this.clients.has(port) && m.op !== "bye") this.attach(port);
    const c = this.clients.get(port); if (!c) return;
    c.lastSeen = this.now();
    switch (m.op) {
      case "init": if (m.be) this.be = m.be; break;
      case "ping": break;
      case "bye": this.detach(port); break;
      case "open": c.keys.add(m.key); if (m.key === "events") this.ensureEvents(); else this.ensurePty(); break;
      case "close": c.keys.delete(m.key); this.gc(); break;
      case "follow": {
        const k = followKey(m.pane, m.agent); c.follows.add(k); c.keys.add("pty");
        const f = this.follows.get(k);
        if (f) {
          f.ports.add(port); f.after = Math.min(f.after, m.after);
          // A SECOND TAB (or a reload within the 45 s a dead port lingers) JOINS A PANE THAT IS ALREADY FOLLOWED: the serve
          // replays only on `add`, and nothing is added — so the newcomer saw an empty thread until the next live event
          // (2026-09-28: Main's whole history missing after a reload while another window held the pane). Its own history
          // is fetched and handed to THAT port alone; the tab drops anything it has already seen by `seq`.
          if (m.agent && this.replayer) void this.replayer(this.be, m.pane, m.after).then((frames) => { for (const fr of frames) { try { port.postMessage(fr); } catch { /* a dead port is swept */ } } }).catch(() => { /* the live stream still runs */ });
        }
        else { this.follows.set(k, { ports: new Set([port]), after: m.after }); if (this.ptyHello) void this.poster(this.be, { sub: this.subId, add: [{ pane_id: m.pane, after: m.after, agent: m.agent || undefined }], remove: [] }); }
        this.ensurePty();
        break;
      }
      case "unfollow": this.unfollow(port, followKey(m.pane, m.agent)); this.gc(); break;
    }
  }
  private unfollow(port: PortLike, k: string) {
    const c = this.clients.get(port); c?.follows.delete(k);
    const f = this.follows.get(k); if (!f) return;
    f.ports.delete(port);
    if (f.ports.size) return;
    this.follows.delete(k);
    // the serve removes a pane, not a kind — only when nobody follows either of its kinds
    const pane = Number(k.slice(2));
    const other = this.follows.has(followKey(pane, k.startsWith("p:"))) ;
    if (this.ptyHello && !other) void this.poster(this.be, { sub: this.subId, add: [], remove: [pane] });
  }
  /** Ports silent for `staleMs` are gone tabs (a closed tab sends nothing) — their follows are released. */
  sweep(staleMs = 45_000) { const t = this.now(); for (const [port, c] of Array.from(this.clients)) if (t - c.lastSeen > staleMs) this.detach(port); }
  private ensureEvents() {
    if (this.events) return;
    this.events = this.openSource(`${this.be}/api/v1/events`, (type, data) => this.fan("events", type, data), (state, rs) => this.fan("events", state, String(rs)));
  }
  private ensurePty() {
    if (this.pty) return;
    this.ptyHello = false;
    this.pty = this.openSource(`${this.be}/api/v1/cockpit/pty/streams?sub=${encodeURIComponent(this.subId)}`, (type, data) => {
      if (type === "hello") {
        this.ptyHello = true;
        // a (re)connect lands on an empty subscription: every followed pane, from the earliest point asked
        const add = Array.from(this.follows, ([k, f]) => ({ pane_id: Number(k.slice(2)), after: f.after, agent: k.startsWith("a:") || undefined }));
        if (add.length) void this.poster(this.be, { sub: this.subId, add, remove: [] });
      }
      this.fan("pty", type, data);
    }, (state, rs) => { if (state === "error") this.ptyHello = false; this.fan("pty", state, String(rs)); });
  }
  private fan(key: "events" | "pty", type: string, data: string) {
    const frame: HubFrame = { key, type, data, subId: key === "pty" ? this.subId : undefined };
    for (const c of this.clients.values()) if (c.keys.has(key)) { try { c.port.postMessage(frame); } catch { /* a dead port is swept */ } }
  }
  private gc() {
    const wanted = (k: "events" | "pty") => Array.from(this.clients.values()).some((c) => c.keys.has(k));
    if (this.events && !wanted("events")) { this.events.close(); this.events = null; }
    if (this.pty && !wanted("pty") && this.follows.size === 0) { this.pty.close(); this.pty = null; this.ptyHello = false; }
  }
  /** for tests and the status line */
  state() { return { clients: this.clients.size, events: !!this.events, pty: !!this.pty, hello: this.ptyHello, follows: Array.from(this.follows.keys()).sort() }; }
}
