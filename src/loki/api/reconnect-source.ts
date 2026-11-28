// A STREAM THAT COMES BACK (operator 2026-10-09: after a serve restart the open tab's thread went silent - "nothing happened visually" - until every cockpit tab was closed; the census said
// `pty_subs 0, events_listeners 0` while the serve was emitting). `EventSource` retries by itself on a dropped connection, but when the server ANSWERS with an error (the dev proxy's 502 while the
// serve is down, a 5xx while it boots) the browser closes it for good (readyState CLOSED) and never reconnects. This wrapper opens a fresh one after a growing pause whenever the source ends up
// CLOSED, so the hub's own "hello -> re-add every followed pane" step runs again. Pure over an injected factory and scheduler - tested without a browser.

export type RawSource = { readyState: number; onopen: null | (() => void); onerror: null | (() => void); onmessage: null | ((ev: { data?: unknown }) => void); addEventListener: (name: string, f: (ev: { data?: unknown }) => void) => void; close: () => void };
export function reconnectingSource(
  create: () => RawSource,
  on: (type: string, data: string) => void,
  onState: (state: "open" | "error", readyState: number) => void,
  names: string[] = [],
  schedule: (f: () => void, ms: number) => unknown = (f, ms) => setTimeout(f, ms),
  cancel: (t: unknown) => void = (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
): { close: () => void } {
  let es: RawSource | null = null; let stopped = false; let delay = 500; let timer: unknown = null;
  const connect = () => {
    if (stopped) return;
    const cur = create(); es = cur;
    cur.onopen = () => { delay = 500; onState("open", cur.readyState); };
    cur.onerror = () => {
      onState("error", cur.readyState);
      // CLOSED (2) = the browser gave up; CONNECTING (0) = it is retrying by itself and must be left alone
      if (cur.readyState === 2 && !stopped) { timer = schedule(connect, delay); delay = Math.min(delay * 2, 5000); }
    };
    cur.onmessage = (ev) => on("message", String(ev.data ?? ""));
    for (const n of names) cur.addEventListener(n, (ev) => on(n, String(ev.data ?? "")));
  };
  connect();
  return { close: () => { stopped = true; if (timer != null) cancel(timer); es?.close(); } };
}
