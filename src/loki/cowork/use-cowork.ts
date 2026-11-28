// THE COWORK SCREEN'S STATE (RFC 0007): the layout (saved a moment after it changes), each pane's numbers (polled, read-only), the strip's
// summary machine, and the agent states the sidebar groups. All the rules are in the pure modules; this only holds them and ticks the clock.
import * as React from "react";
import { getLayout, threadsOp, type ThreadList, listAsks, listCommands, listWorkers, putLayout, ptyUsage, reportCommand, type OpenAsk, type PaneUsage } from "./api";
import type { Command, Report } from "./commands";
import type { WorkerTask } from "./workers";
import { emptyLayout, leaves, type Layout, type PaneRef } from "./layout";
import { live, stripReduce, type StripAction, type StripState } from "./strip-model";
import { noteViewing, type AgentRow, type AgentStatus, type Seen } from "./agent-state";

export const SAVE_MS = 500;
export const USAGE_MS = 1500;
export const WORKERS_MS = 2000;
export const ASKS_MS = 1500;
/** How often the screen asks what agents want it to do. The serve counts a screen as open for a few seconds after each ask. */
const COMMANDS_MS = 1000;
const SIDEBAR_KEY = "antiloki.cowork.sidebar";

/** The left sidebar open or collapsed, remembered per browser. Only a convenience: storage that is blocked or empty just means it starts open. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, set] = React.useState<boolean>(() => { try { return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed"; } catch { return false; } });
  const toggle = React.useCallback(() => set((v) => { const next = !v; try { window.localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "open"); } catch { /* blocked storage: it still toggles */ } return next; }), []);
  return [collapsed, toggle];
}

/** Each engine pane's delegated tasks, keyed by the pane's layout id: polled while the pane exists, read-only (the backend does the delegating). */
export function useWorkers(panes: PaneRef[]): Record<string, WorkerTask[]> {
  const [map, setMap] = React.useState<Record<string, WorkerTask[]>>({});
  const key = panes.filter((p) => p.kind === "engine" && p.paneId).map((p) => `${p.id}=${p.paneId}`).join(",");
  React.useEffect(() => {
    const pairs = key ? key.split(",").map((x) => x.split("=")) : [];
    if (pairs.length === 0) { setMap({}); return; }
    let stop = false;
    const poll = async () => {
      const got = await Promise.all(pairs.map(async ([id, pid]) => [id, await listWorkers(Number(pid))] as const));
      if (!stop) setMap(Object.fromEntries(got));
    };
    void poll();
    const t = setInterval(poll, WORKERS_MS);
    return () => { stop = true; clearInterval(t); };
  }, [key]);
  return map;
}

/** The questions the pre-check has parked for the person. Polled for as long as the screen is up: that polling is also what tells the serve a screen is open, so it does not
 *  keep an agent waiting on a question nobody can see. */
export function useAsks(): OpenAsk[] {
  const [asks, setAsks] = React.useState<OpenAsk[]>([]);
  React.useEffect(() => {
    let stop = false;
    const poll = async () => { const a = await listAsks(); if (!stop) setAsks((prev) => (JSON.stringify(prev.map((x) => x.id)) === JSON.stringify(a.map((x) => x.id)) ? prev : a)); };
    void poll();
    const t = setInterval(poll, ASKS_MS);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return asks;
}

/** THE SCREEN DOES WHAT AN AGENT ASKS (RFC 0007 §17.10): asks the serve for commands on a timer (which also tells the serve a screen is open) and does each once, reporting what it made. */
export function useCommands(exec: (c: Command) => Promise<Report>) {
  const execRef = React.useRef(exec); execRef.current = exec;
  React.useEffect(() => {
    let stop = false; const done = new Set<number>();
    const tick = async () => {
      for (const c of await listCommands()) {
        if (stop || done.has(c.id)) continue;
        done.add(c.id);
        let r: Report; try { r = await execRef.current(c); } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : "the screen could not do that" }; }
        await reportCommand(c.id, r);
      }
    };
    void tick(); const t = setInterval(() => void tick(), COMMANDS_MS);
    return () => { stop = true; clearInterval(t); };
  }, []);
}

export function useClock(ms = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
export function useReducedMotion(): boolean {
  const [r, setR] = React.useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  React.useEffect(() => { const m = window.matchMedia?.("(prefers-reduced-motion: reduce)"); if (!m) return; const f = () => setR(m.matches); m.addEventListener?.("change", f); return () => m.removeEventListener?.("change", f); }, []);
  return r;
}

/** The layout: loaded once per workspace, saved SAVE_MS after the last change, never saved before it has been loaded (an empty default must not overwrite a stored layout). */
export function useLayout(workspaceKey: string): { layout: Layout; loaded: boolean; update: (f: (l: Layout) => Layout) => void; flush: () => Promise<void> } {
  const [layout, setLayout] = React.useState<Layout>(emptyLayout());
  const [loaded, setLoaded] = React.useState(false); const [loadedFor, setLoadedFor] = React.useState("");   // the key the loaded layout was read for: after a switch, the old thread's layout must not read as the new one's (a new team's panes were skipped for it)
  const dirty = React.useRef(false);
  const latest = React.useRef(layout); latest.current = layout;
  // THE WORKSPACE THIS LAYOUT WAS READ FROM: every save names it, and the serve refuses a save for any other (operator 2026-11-10: two spaces ended up with the same panes, a save having crossed a switch)
  const owner = React.useRef(""); const thread = React.useRef("");   // ...and the thread of it: a save names both
  React.useEffect(() => {
    let live = true; setLoaded(false); dirty.current = false;
    // THE LAYOUT IS READ UNTIL THE SERVE ANSWERS: an unanswered ask is not an empty layout (it seeded a new Leader terminal and saved it over the real panes); a busy serve is asked again, a little later each time
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (n: number) => { void getLayout().then((r) => { if (!live) return; if (!r.ok) { timer = setTimeout(() => attempt(n + 1), Math.min(800 * (n + 1), 5000)); return; } owner.current = r.workspace; thread.current = r.thread; setLayout(r.layout); setLoadedFor(workspaceKey); setLoaded(true); }); };
    attempt(0);
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [workspaceKey]);
  React.useEffect(() => {
    if (!loaded || !dirty.current) return;
    const t = setTimeout(() => { dirty.current = false; void putLayout(layout, owner.current, thread.current); }, SAVE_MS);
    return () => clearTimeout(t);
  }, [layout, loaded]);
  const update = React.useCallback((f: (l: Layout) => Layout) => { dirty.current = true; setLayout((l) => f(l)); }, []);
  /** Save the layout NOW instead of after the timer: an agent that has just had a pane opened reads the layout straight away, and must find it there. */
  const flush = React.useCallback(async () => { if (!dirty.current) return; dirty.current = false; await putLayout(latest.current, owner.current, thread.current); }, []);
  return { layout, loaded: loaded && loadedFor === workspaceKey, update, flush };
}

/** The open space's threads, polled (an agent may switch or make one through the MCP), and the calls that change them. Each returns the serve's sentence when it refuses. */
export function useThreads(workspaceKey: string): { list: ThreadList | null; refresh: () => Promise<void>; act: (b: Parameters<typeof threadsOp>[0]) => Promise<string | null> } {
  const [list, setList] = React.useState<ThreadList | null>(null);
  const refresh = React.useCallback(async () => { const r = await threadsOp({ op: "list" }); if (r.list) setList(r.list); }, []);
  React.useEffect(() => { setList(null); void refresh(); const t = setInterval(() => void refresh(), 3000); return () => clearInterval(t); }, [workspaceKey, refresh]);
  const act = React.useCallback(async (b: Parameters<typeof threadsOp>[0]) => { const r = await threadsOp(b); if (r.list) { setList(r.list); return null; } return r.error ?? "could not change the threads"; }, []);
  return { list, refresh, act };
}

/** Each engine pane's numbers, polled. Tool panes and shells have none. */
export function usePaneUsages(panes: PaneRef[]): Record<number, PaneUsage | null> {
  const [map, setMap] = React.useState<Record<number, PaneUsage | null>>({});
  const key = panes.filter((p) => p.kind === "engine" && p.paneId).map((p) => p.paneId).join(",");
  React.useEffect(() => {
    const ids = key ? key.split(",").map(Number) : [];
    if (ids.length === 0) { setMap({}); return; }
    let stop = false;
    const poll = async () => {
      const got = await Promise.all(ids.map(async (id) => [id, await ptyUsage(id)] as const));
      if (!stop) setMap(Object.fromEntries(got));
    };
    void poll();
    const t = setInterval(poll, USAGE_MS);
    return () => { stop = true; clearInterval(t); };
  }, [key]);
  return map;
}

/** The strip's machine, fed by the polled usages: a run that finishes while the screen is open (never one that finished before it opened) raises the summary. */
export function useStrip(panes: PaneRef[], usages: Record<number, PaneUsage | null>, now: number, enabled = true): {
  state: StripState; hover: () => void; leave: () => void; dismiss: () => void; finishedPanes: ReadonlySet<number>;
} {
  const [state, setState] = React.useReducer(stripReduce, undefined, live) as [StripState, React.Dispatch<StripAction>];
  const seen = React.useRef<Record<number, string | null>>({});
  const wasWorking = React.useRef<Record<number, boolean>>({});
  const [finished, setFinished] = React.useState<ReadonlySet<number>>(new Set());
  React.useEffect(() => {
    for (const p of panes) {
      const id = p.paneId; const u = id ? usages[id] : null;
      if (!id || !u || !u.known) continue;
      const fin = u.run?.finishedT ?? null;
      if (!(id in seen.current)) { seen.current[id] = fin; wasWorking.current[id] = u.working; continue; } // the first look is a baseline, not news
      if (u.working && !wasWorking.current[id]) setFinished((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });
      if (fin && fin !== seen.current[id] && u.run) {
        seen.current[id] = fin;
        setFinished((s) => new Set(s).add(id));
        if (enabled) setState({ type: "finished", item: { usage: u.run, pane: String(id), paneName: p.title ?? p.engine }, now });
      }
      wasWorking.current[id] = u.working;
    }
  }, [panes, usages, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (state.mode !== "summary") return; const t = setInterval(() => setState({ type: "tick", now: Date.now() }), 250); return () => clearInterval(t); }, [state.mode]);
  return { state, hover: () => setState({ type: "hover", now: Date.now() }), leave: () => setState({ type: "leave", now: Date.now() }), dismiss: () => setState({ type: "dismiss", now: Date.now() }), finishedPanes: finished };
}

/** The sidebar's agent rows from the panes and what is known about them. A pane is "done" only if it was seen finishing while this screen was open. */
export function agentRows(panes: PaneRef[], usages: Record<number, PaneUsage | null>, finished: ReadonlySet<number>): AgentRow[] {
  return panes.filter((p) => p.kind === "engine").map((p) => {
    const u = p.paneId ? usages[p.paneId] : null;
    const status: AgentStatus = u?.blocked ? "blocked" : u?.working ? "working" : p.paneId && finished.has(p.paneId) ? "done" : "idle";
    const detail = u?.blocked ? u.blocked : status === "done" && u?.run ? `${u.run.prompt.slice(0, 48)}` : u?.model ?? "";
    return { id: p.id, name: p.title ?? p.engine ?? "agent", status, detail, engine: p.engine };
  });
}
export function useSeen(rows: AgentRow[], focusedId: string | null): Seen {
  const [seen, setSeen] = React.useState<Seen>(new Set());
  React.useEffect(() => { setSeen((s) => noteViewing(s, rows, focusedId)); }, [rows, focusedId]);
  return seen;
}
export const enginePanes = (l: Layout): PaneRef[] => leaves(l.root).filter((p) => p.kind === "engine");
