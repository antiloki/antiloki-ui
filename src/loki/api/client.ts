// Real BE client. Resolves base URL once. All fetches: 5s timeout, return null on error.
// Never throws to React tree.
// v2: returns NotWired sentinel on 404 so screens can render EndpointStub.
import { demoIntercept } from "@/loki/demo/demo-mode";

/** WHERE THE SERVE IS. A page served by the serve itself to another device (a phone on the Wi-Fi, a tunnel) asks the machine it came from; the desktop app and the dev server keep their configured address. Pure - tested. */
export function beUrlFor(env: string | undefined, loc: { protocol: string; hostname: string; origin: string } | null): string {
  if (env) return env;
  if (loc && /^https?:$/.test(loc.protocol) && loc.hostname && !["localhost", "127.0.0.1", "[::1]", "::1", "tauri.localhost"].includes(loc.hostname)) return loc.origin;
  return "http://localhost:41931";
}
export const BE_URL: string = beUrlFor((typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_BE_URL) || undefined, typeof window !== "undefined" ? window.location : null);

// 30 s, not 5 (2026-09-19): antiloki-serve runs every dispatch on ONE writer connection, so a
// page burst (the X-ray mounts ~40 reads at once) queues head-of-line — a 5 s budget aborted the
// tail of every burst ("signal is aborted without reason": the specialists roster read
// "registry unavailable", the scope rail "atlas empty"). Long calls pass their own timeoutMs.
const TIMEOUT_MS = 30000;
const SESSION_KEY = "antiloki:fe_session";

// FEAT-BE-ACTOR-ATTRIBUTION-FROM-ORIGIN: every browser tab gets a
// random session ID that lives in sessionStorage (clears on tab close,
// stays through reloads). BE reads X-FE-Session and uses it to build
// actor=web-fe:<8-char-prefix> instead of the misleading
// human:tui-operator default. Lets sacred_timeline tell the truth.
export function getFeSession(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.sessionStorage?.getItem(SESSION_KEY);
    if (!id) {
      id = (window.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      window.sessionStorage?.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "session-unavailable";
  }
}

// GOD MODE REMOVED (2026-08-13): antiloki is a local single-operator app, so the god session
// token, its CSRF binding and the X-God-Token header are gone. Privileged actions are reachable
// or not by the substrate's own permissions — the browser no longer holds a second key.

type FetchOpts = { signal?: AbortSignal; timeoutMs?: number;
  /** THROW THE SERVER'S REFUSAL INSTEAD OF SWALLOWING IT (2026-09-28).
   *
   *  `withTimeout` turns every failure into `null`, which is right for the hundred read paths that must not
   *  crash a screen — and wrong for the few where the REASON is the product. A refused route has to reach the
   *  operator ("delegation is off for this pane"), and the code written to do that was dead: the throw was
   *  caught two frames up and collapsed to the same `null` as a network blip. Opt-in, so nothing else changes. */
  throwOnError?: boolean };

export function isNotWired(v: any): boolean {
  return !!(v && typeof v === "object" && v.__not_wired === true);
}

// A 404 can mean two very different things:
//   (a) the route genuinely doesn't exist — Nest default body
//       { statusCode:404, message:"Cannot POST /…", error:"Not Found" }
//   (b) the route ran and the engine threw NOT_FOUND/SKILL_NOT_FOUND, which
//       EngineErrorFilter maps to HTTP 404 with { error:{ code, cause, … } }.
// Only (a) is "not wired — restart". (b) is a real engine error (e.g. a card
// slug absent from the DB) and restarting never helps; surface its cause.
export function engineError(v: any): { code: string; cause?: string; skill?: string | null } | null {
  return v && typeof v === "object" && v.__engine_error ? v.__engine_error : null;
}

async function parse404(res: Response, path: string): Promise<any> {
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON 404 body */ }
  const eng = body?.error;
  if (eng && typeof eng.code === "string") return { __engine_error: eng, path };
  return { __not_wired: true, path };
}

/** THE WORKSPACE A SCREEN IS ABOUT WHEN IT IS NOT THE ACTIVE ONE (operator 2026-11-10: "make x-ray work for multiple spaces at the same time with a filter per space"). The serve answers a request that carries
 *  this header from THAT workspace's own database, without switching the active one; null means the active workspace, as ever. Set by the X-ray screen while it is open (`xray-space.ts`). */
let requestWorkspace: string | null = null;
export function setRequestWorkspace(root: string | null) { requestWorkspace = root && root.trim() ? root.trim() : null; }
export function getRequestWorkspace(): string | null { return requestWorkspace; }

function makeHeaders(opts: FetchOpts, hasBody: boolean): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  if (hasBody) h["content-type"] = "application/json";
  // FEAT-BE-ACTOR-ATTRIBUTION-FROM-ORIGIN: always send.
  h["X-FE-Session"] = getFeSession();
  if (requestWorkspace) h["X-Antiloki-Workspace"] = requestWorkspace;
  return h;
}

// TYPING MUST NEVER WAIT IN LINE (the operator 2026-11-15: "I send two messages and it is stuck, I thought this was a real terminal"): a browser keeps only 6 connections to one host, and the screens ask the serve for their
// numbers in the background; on a slow serve each of those held a connection for seconds and a keystroke had to wait behind them. Background asks now share THREE slots; what the person does (typing, sending, stopping)
// and anything that is meant to run long goes around the queue.
/** A gate that lets `max` runs through at once and the rest wait their turn, in order. Exported for the test. */
export function createLimiter(max: number) {
  let active = 0; const waiting: (() => void)[] = [];
  return async function limited<T>(run: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((res) => waiting.push(res));
    active++; try { return await run(); } finally { active--; waiting.shift()?.(); }
  };
}
const background = createLimiter(3);
/** What the person is doing, and what is meant to run long: these never queue behind the pollers. Pure. */
export function isUrgent(path: string, timeoutMs: number): boolean { return timeoutMs > 45_000 || /\/pty\/(input|send|resize)(\?|$|\/)/.test(path) || /\/agent\/(send|message|stop|interrupt)(\?|$|\/)/.test(path); }

async function withTimeout<T>(
  path: string,
  fn: (signal: AbortSignal) => Promise<T>,
  external?: AbortSignal,
  timeoutMs: number = TIMEOUT_MS,
): Promise<T | null> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  const go = async () => { timer = setTimeout(() => ctrl.abort(), timeoutMs); return await fn(ctrl.signal); };   // the budget starts when the ask is sent, not while it waits for a slot
  try {
    return await (isUrgent(path, timeoutMs) ? go() : background(go));
  } catch (e: any) {
    if (e?.__not_wired) return e as T;
    if (typeof console !== "undefined") console.warn("[api]", path, e?.message || e);
    if (e?.__surface) throw e;                 // a refusal the caller asked to be told about (FetchOpts.throwOnError)
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function apiGet<T = any>(path: string, opts: FetchOpts = {}): Promise<T | null> {
  // DEMO MODE (sell-tabs): an unowned tab renders itself on fixtures — no network.
  const demoG = demoIntercept("GET", path);
  if (demoG !== undefined) return Promise.resolve(demoG as T);
  return withTimeout(path, async (signal) => {
    const res = await fetch(`${BE_URL}${path}`, {
      method: "GET",
      headers: makeHeaders(opts, false),
      signal,
    });
    if (res.status === 404) {
      return (await parse404(res, path)) as any;
    }
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return (await res.json()) as T;
  }, opts.signal, opts.timeoutMs);
}

export async function apiPost<T = any>(path: string, body: any = {}, opts: FetchOpts = {}): Promise<T | null> {
  // DEMO MODE (sell-tabs): mutations resolve ok-shaped, reads serve fixtures.
  const demoP = demoIntercept("POST", path, body);
  if (demoP !== undefined) return Promise.resolve(demoP as T);
  return withTimeout(path, async (signal) => {
    const res = await fetch(`${BE_URL}${path}`, {
      method: "POST",
      headers: makeHeaders(opts, true),
      body: JSON.stringify(body ?? {}),
      signal,
    });
    if (res.status === 404) {
      return (await parse404(res, path)) as any;
    }
    if (!res.ok) {
      // THE SERVER'S OWN SENTENCE, NOT JUST ITS NUMBER (2026-09-28). A refusal that reaches the operator as
      // "→ 400" tells them nothing they can act on; serve always says why ({"error":{"message":…}}), and that
      // reason is what the thread shows when Heimdall declines an ask.
      let why = "";
      try { const b: any = JSON.parse(await res.text()); why = String(b?.error?.message ?? b?.error ?? b?.message ?? ""); } catch { /* not JSON */ }
      const err: any = new Error(why ? `POST ${path} → ${res.status}: ${why}` : `POST ${path} → ${res.status}`);
      if (opts.throwOnError) err.__surface = true;
      throw err;
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }, opts.signal, opts.timeoutMs);
}

// Visibility-aware polling. Pauses when document is hidden.
export function makePoll(fn: () => Promise<void>, intervalMs: number): () => void {
  let stopped = false;
  let inFlight = false;
  let timer: any = null;

  const tick = async () => {
    if (stopped) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      timer = setTimeout(tick, intervalMs);
      return;
    }
    if (inFlight) {
      timer = setTimeout(tick, intervalMs);
      return;
    }
    inFlight = true;
    try { await fn(); } finally { inFlight = false; }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };

  tick();
  const onVis = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      if (timer) clearTimeout(timer);
      tick();
    }
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
  };
}

// action-run may return the skill result directly or nested under .result —
// the canonical unwrap for that shape (module-local copies predate this).
export function unwrapResult<T = any>(r: any): T | null {
  return (r?.result ?? r) ?? null;
}

export function sameOrNext<T>(prev: T, next: T): T {
  try {
    return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
  } catch { return next; }
}
