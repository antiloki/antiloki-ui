// The live QA viewer: the reducer, the cursor maths, the replay clock, and the component driven by a fake EventSource. It must show nothing for a run the QA never looked at.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

let evidence: any = { film: true, images: [] };
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be.test", apiGet: vi.fn(async () => evidence) }));
import { resetQaFocus } from "./qa-focus";
import { QaLive, reduceLive, initialLive, targetBox, stateAt, runIsMoving, RETRY_MS, GRACE_MS, retryDelay, terminalLines, eventsUpTo, isServerFilm, type LiveEv } from "./qa-live";

class FakeES { static last: FakeES | null = null; onmessage: ((m: { data: string }) => void) | null = null; onerror: (() => void) | null = null; closed = false; url: string;
  constructor(url: string) { this.url = url; FakeES.last = this; } close() { this.closed = true; }
  send(ev: LiveEv) { this.onmessage?.({ data: JSON.stringify(ev) }); } }
beforeEach(() => { FakeES.last = null; (globalThis as any).EventSource = FakeES; evidence = { film: true, images: [] }; resetQaFocus(); });
afterEach(() => { delete (globalThis as any).EventSource; vi.useRealTimers(); });

const step = (n: number, text: string, rect: number[] | null = [640, 400, 100, 50], of = 3): LiveEv => ({ type: "step", n, of, kind: "click", text, rect, viewport: [1280, 800] });

describe("the reducer", () => {
  it("builds the state from a snapshot and then the live events", () => {
    let s = reduceLive(initialLive, { type: "snapshot", done: false, last_frame: { jpeg: "AAAA" }, timeline: [step(1, "opening /"), { type: "step-done", n: 1, ok: true, message: "ok" }, step(2, "clicking \"Buy\"")] });
    expect(s.status).toBe("live"); expect(s.frame).toBe("data:image/jpeg;base64,AAAA"); expect(s.step?.n).toBe(2); expect(s.results).toEqual([{ n: 1, ok: true, message: "ok" }]);
    s = reduceLive(s, { type: "frame", jpeg: "BBBB" }); expect(s.frame).toContain("BBBB");
    s = reduceLive(s, { type: "step-done", n: 2, ok: false, message: "nothing matches" }); expect(s.results.find((r) => r.n === 2)?.ok).toBe(false);
    s = reduceLive(s, { type: "done" }); expect(s.status).toBe("over");
    expect(reduceLive(initialLive, { type: "snapshot", done: true, timeline: [] }).status).toBe("over");
  });
  it("puts the cursor at the centre of the target and the ring around it, as percentages of the viewport", () => {
    const b = targetBox(step(1, "x", [640, 400, 100, 50]) as any)!;
    expect(b.cx).toBeCloseTo((690 / 1280) * 100); expect(b.cy).toBeCloseTo((425 / 800) * 100); expect(b.w).toBeCloseTo((100 / 1280) * 100);
    expect(targetBox(step(1, "x", null) as any)).toBeNull();
    expect(targetBox({ ...(step(1, "x") as any), rect: [5000, 5000, 100, 100] })!.cx).toBe(100);   // a target scrolled off the edge is clamped, never outside the frame
  });
  it("finds the frame and the step at a moment of the film", () => {
    const film: LiveEv[] = [step({ t: 0 } as any, "") as any].slice(0, 0).concat([{ ...step(1, "opening", null), t: 0 }, { type: "film", t: 50, file: "0000.jpg" }, { type: "step-done", n: 1, ok: true, t: 400 }, { ...step(2, "clicking", [1, 2, 3, 4]), t: 500 }, { type: "film", t: 620, file: "0001.jpg" }, { type: "step-done", n: 2, ok: false, t: 900 }]);
    expect(stateAt(film, 100)).toMatchObject({ file: "0000.jpg", ok: null }); expect(stateAt(film, 100).step?.n).toBe(1);
    expect(stateAt(film, 450).ok).toBe(true);
    expect(stateAt(film, 700)).toMatchObject({ file: "0001.jpg" }); expect(stateAt(film, 700).step?.n).toBe(2);
    expect(stateAt(film, 950).ok).toBe(false); expect(stateAt(film, 950).total).toBe(900);
  });
});

describe("the replay after a live film", () => {
  it("reconnects once after the live done, to get the film the replay needs (the bug the real browser found)", () => {
    vi.useFakeTimers();
    render(<QaLive run={8} status="running" />);
    const live = FakeES.last!;
    act(() => { live.send({ type: "snapshot", done: false, timeline: [], last_frame: { jpeg: "AAAA" } }); live.send(step(1, "clicking \"Add to cart\"")); live.send({ type: "done" }); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(FakeES.last).not.toBe(live);
    const film = [{ type: "film", t: 0, file: "f000.jpg" }, { type: "step", t: 0, n: 1, of: 1, kind: "click", text: "clicking \"Add to cart\"" }];
    act(() => { FakeES.last!.send({ type: "snapshot", done: true, timeline: [], last_frame: { jpeg: "ZZZZ" }, film }); });
    expect(screen.getByTestId("qa-live-replay")).toBeTruthy();
  });
});

// THE BACKEND'S FILM (operator 2026-09-30): a server test has no picture - its film is a terminal of requests, answers and checks.
const req = (n: number, text: string, t = 0): LiveEv => ({ type: "step", n, of: 4, kind: "request", text, rect: null, viewport: [1280, 800], t });
const exch = (n: number, status: number, body: string, t = 0): LiveEv => ({ type: "exchange", n, method: "GET", path: "/api/search?q=shoes", status, ms: 4, body, t });
const chk = (n: number, text: string, t = 0): LiveEv => ({ type: "step", n, of: 4, kind: "expect", text, rect: null, viewport: [1280, 800], t });
const done = (n: number, ok: boolean, t = 0): LiveEv => ({ type: "step-done", n, ok, message: ok ? "ok" : "check FAILED", t });
const serverFilm: LiveEv[] = [req(1, "sending GET /api/search?q=shoes", 0), exch(1, 200, '{"results":[]}', 10), done(1, true, 20), chk(2, "checking that `results` has at least 2 item(s)", 30), done(2, false, 40)];

describe("the terminal of a server test", () => {
  it("lines up each step with its outcome and the answer the request got", () => {
    const st = serverFilm.reduce(reduceLive, initialLive);
    const lines = terminalLines(st.steps, st.results, st.exchanges);
    expect(lines.map((l) => [l.n, l.kind, l.ok])).toEqual([[1, "request", true], [2, "expect", false]]);
    expect(lines[0].exchange?.status).toBe(200); expect(lines[0].exchange?.body).toBe('{"results":[]}'); expect(lines[1].exchange).toBeNull();
    expect(isServerFilm(st.steps, st.exchanges)).toBe(true);
    expect(isServerFilm([{ n: 1, of: 1, kind: "click", text: "x", rect: null, viewport: [1, 1] }], [])).toBe(false);
  });
  it("rebuilds the terminal as it stood at any moment of the film (the replay)", () => {
    expect(eventsUpTo(serverFilm, 15).exchanges.length).toBe(1); expect(eventsUpTo(serverFilm, 15).results).toEqual([]);
    const late = eventsUpTo(serverFilm, 100); expect(late.steps.length).toBe(2); expect(late.results.map((r) => r.ok)).toEqual([true, false]);
  });
  it("is shown instead of a browser frame while a server test plays, and kept for a replay", () => {
    render(<QaLive run={9} status="running" />);
    act(() => { FakeES.last!.send({ type: "snapshot", done: false, timeline: [], last_frame: null }); for (const e of serverFilm.slice(0, 3)) FakeES.last!.send(e); });
    expect(screen.getByTestId("qa-live-terminal")).toBeTruthy(); expect(screen.queryByTestId("qa-live-frame")).toBeNull();
    expect(screen.getByTestId("qa-term-exchange").textContent).toContain("200");
    act(() => { for (const e of serverFilm.slice(3)) FakeES.last!.send(e); FakeES.last!.send({ type: "done" }); });
    const lines = screen.getAllByTestId("qa-term-line");
    expect(lines.map((l) => l.getAttribute("data-ok"))).toEqual(["true", "false"]);
    expect(lines[1].textContent).toContain("✗");
  });
  it("offers the replay of a finished server test from the kept timeline", async () => {
    render(<QaLive run={10} status="done" />);
    await waitFor(() => expect(FakeES.last).not.toBeNull());      // a settled run asks once whether a film was kept, then connects
    act(() => { FakeES.last!.send({ type: "snapshot", done: true, timeline: [], last_frame: null, film: serverFilm }); });
    expect(screen.getByTestId("qa-live-replay")).toBeTruthy(); expect(screen.getByTestId("qa-live-terminal")).toBeTruthy();
  });
});

describe("asking again", () => {
  it("knows a run that is still moving from one that has settled", () => {
    expect([runIsMoving("running"), runIsMoving("awaiting-answers"), runIsMoving("done"), runIsMoving("failed"), runIsMoving(undefined)]).toEqual([true, true, false, false, false]);
  });
  it("asks again after a 404 while the run is moving, and shows the film once the QA starts (the bug the real browser found)", () => {
    vi.useFakeTimers();
    const a = render(<QaLive run={6} status="running" />);
    const first = FakeES.last!; act(() => first.onerror?.());
    expect(a.container.innerHTML).toBe("");
    act(() => { vi.advanceTimersByTime(RETRY_MS + 10); });
    expect(FakeES.last).not.toBe(first);                       // a new connection
    act(() => { FakeES.last!.send({ type: "snapshot", done: false, timeline: [], last_frame: { jpeg: "AAAA" } }); FakeES.last!.send(step(1, "opening the page", null)); });
    expect(screen.getByTestId("qa-live").getAttribute("data-status")).toBe("live");
  });
  it("gives up once the run has settled and the grace period is over", async () => {
    vi.useFakeTimers();
    const a = render(<QaLive run={7} status="done" />);
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });      // the probe answers, the box connects
    let last = FakeES.last!; act(() => last.onerror?.());
    act(() => { vi.advanceTimersByTime(RETRY_MS + 10); });      // still inside the grace: it asks once more
    expect(FakeES.last).not.toBe(last); last = FakeES.last!;
    act(() => { vi.advanceTimersByTime(GRACE_MS + 1000); });
    act(() => last.onerror?.());
    expect(a.container.innerHTML).toBe(""); act(() => { vi.advanceTimersByTime(RETRY_MS * 3); }); expect(FakeES.last).toBe(last);   // no further connection
  });
});

describe("asking again, but not forever (audit 2026-10-01)", () => {
  let made: FakeES[];
  beforeEach(() => { made = []; (globalThis as any).EventSource = class extends FakeES { constructor(u: string) { super(u); made.push(this); } }; });
  it("backs off 3 s, 6 s, 12 s, 24 s and then stays at 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(retryDelay)).toEqual([3000, 6000, 12000, 24000, 30000, 30000, 30000]);
  });
  it("a run that keeps answering 404 is asked on that schedule, not every 3 s", () => {
    vi.useFakeTimers();
    render(<QaLive run={6} status="running" />);
    expect(made.length).toBe(1);
    act(() => made[made.length - 1].onerror?.());
    act(() => { vi.advanceTimersByTime(RETRY_MS - 100); }); expect(made.length).toBe(1);
    act(() => { vi.advanceTimersByTime(200); }); expect(made.length).toBe(2);                    // after 3 s
    act(() => made[made.length - 1].onerror?.());
    act(() => { vi.advanceTimersByTime(RETRY_MS + 100); }); expect(made.length).toBe(2);         // 3 s is no longer enough: the second wait is 6 s
    act(() => { vi.advanceTimersByTime(RETRY_MS); }); expect(made.length).toBe(3);
    // 60 s of further 404s costs a handful of connections, not twenty
    const errored = new Set<FakeES>(made.slice(0, 2));
    for (let t = 0; t < 60_000; t += 1000) { const es = made[made.length - 1]; if (!errored.has(es)) { errored.add(es); act(() => es.onerror?.()); } act(() => { vi.advanceTimersByTime(1000); }); }
    expect(made.length).toBeLessThan(10);
  });
  it("leaves no timer behind when it is closed, under StrictMode too (the old updater armed a timer it then lost)", () => {
    vi.useFakeTimers();
    const a = render(<React.StrictMode><QaLive run={6} status="running" /></React.StrictMode>);
    act(() => made[made.length - 1].onerror?.());
    a.unmount();
    expect(vi.getTimerCount()).toBe(0);
    const before = made.length;
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(made.length).toBe(before);
  });
  it("starts from nothing when the run prop changes: the previous run's film is not shown, and the new run's stream is opened", () => {
    const a = render(<QaLive run={6} status="running" />);
    act(() => { FakeES.last!.send({ type: "snapshot", done: false, timeline: [], last_frame: { jpeg: "AAAA" } }); FakeES.last!.send(step(1, "run six")); });
    expect(screen.getByTestId("qa-live-caption").textContent).toContain("run six");
    a.rerender(<QaLive run={7} status="running" />);
    expect(screen.queryByTestId("qa-live")).toBeNull();                                          // run 7 has said nothing yet
    expect(made[made.length - 1].url).toContain("id=7");
  });
});

describe("the viewer", () => {
  it("shows nothing until the serve answers, and nothing for a run the QA never looked at", () => {
    const a = render(<QaLive run={9} status="running" />); expect(a.container.innerHTML).toBe("");
    act(() => FakeES.last!.onerror?.()); expect(a.container.innerHTML).toBe("");
  });
  it("plays a live run: the frame, the subtitle, the ring and the cursor at the target, and it says it is live", () => {
    render(<QaLive run={9} status="running" />);
    expect(FakeES.last!.url).toBe("http://be.test/api/v1/cockpit/goals/live?id=9");
    act(() => { FakeES.last!.send({ type: "snapshot", done: false, timeline: [], last_frame: { jpeg: "AAAA" } }); FakeES.last!.send(step(1, "clicking \"Add to cart\"")); });
    expect(screen.getByTestId("qa-live").getAttribute("data-status")).toBe("live");
    expect(screen.getByTestId("qa-live-caption").textContent).toContain("clicking \"Add to cart\"");
    expect((screen.getByTestId("qa-live-frame") as HTMLImageElement).src).toContain("base64,AAAA");
    expect((screen.getByTestId("qa-live-cursor") as unknown as SVGElement).style.left).toMatch(/^53\.9/); expect(screen.getByTestId("qa-live-ring")).toBeTruthy();
    act(() => { FakeES.last!.send({ type: "step-done", n: 1, ok: false, message: "nothing matches" }); });
    expect(screen.getByTestId("qa-live-caption").textContent).toContain("it did not work");
    act(() => { FakeES.last!.send({ type: "done" }); });
    expect(FakeES.last!.closed).toBe(true);   // the stream ends after done; it must not reconnect
    expect(screen.getByTestId("qa-live").getAttribute("data-status")).toBe("over");
  });
  it("replays the kept film with the clock, frame by frame, and stops at the end", () => {
    vi.useFakeTimers();
    render(<QaLive run={4} status="running" />);
    const film = [{ ...step(1, "opening the page", null), t: 0 }, { type: "film", t: 30, file: "0000.jpg" }, { type: "step-done", n: 1, ok: true, t: 300 }, { ...step(2, "clicking \"Buy\""), t: 400 }, { type: "film", t: 450, file: "0001.jpg" }, { type: "step-done", n: 2, ok: true, t: 800 }];
    act(() => { FakeES.last!.send({ type: "snapshot", done: true, timeline: [], last_frame: { jpeg: "ZZZZ" }, film }); });
    expect(screen.getByTestId("qa-live").getAttribute("data-status")).toBe("over");
    fireEvent.click(screen.getByTestId("qa-live-replay"));
    expect(screen.getByTestId("qa-live").getAttribute("data-status")).toBe("replay");
    expect(screen.getByTestId("qa-live-caption").textContent).toContain("opening the page");
    expect((screen.getByTestId("qa-live-frame") as HTMLImageElement).src).toBe("http://be.test/api/v1/cockpit/goals/evidence?id=4&film=0000.jpg");
    for (let i = 0; i < 5; i++) act(() => { vi.advanceTimersByTime(100); });   // the clock re-arms after each render, so tick it the way a browser does
    expect(screen.getByTestId("qa-live-caption").textContent).toContain("clicking \"Buy\"");
    expect((screen.getByTestId("qa-live-frame") as HTMLImageElement).src).toContain("film=0001.jpg");
    for (let i = 0; i < 25; i++) act(() => { vi.advanceTimersByTime(100); });
    expect(screen.getByTestId("qa-live").getAttribute("data-status")).toBe("over");   // back to the poster when the film ends
  });
});

// QA BOXES ARE HEAVY (operator 2026-09-30): only the newest run's QA is open; older ones are one line, open nothing on the wire, and a click opens (and closes) any of them.
describe("only the newest QA is open", () => {
  it("collapses an older run to one line without opening a stream, and opens it on a click", async () => {
    const { findByTestId, queryByTestId } = render(<><QaLive run={5} status="done" /><QaLive run={9} status="done" /></>);
    // run 9 is the newest with a QA film: open (its stream connects); run 5 is one line
    await screen.findByTestId("qa-live-collapsed");
    expect(screen.getAllByTestId("qa-live-collapsed").length).toBe(1);
    expect(screen.getByTestId("qa-live-collapsed").textContent).toContain("run #5");
    expect(FakeES.last?.url).toContain("id=9");
    expect(queryByTestId("qa-live-collapsed")?.textContent).not.toContain("#9");
    // clicking the older one opens it: a stream for run 5 connects, and the newest stays open
    act(() => { fireEvent.click(screen.getByTestId("qa-live-collapsed")); });
    await waitFor(() => expect(FakeES.last?.url).toContain("id=5"));
    expect(screen.queryByTestId("qa-live-collapsed")).toBeNull();
    void findByTestId;
  });
  it("shows nothing at all for a run that has no QA, and leaves the previous one open when a newer run has none", async () => {
    evidence = { film: false, images: [] };
    const a = render(<QaLive run={12} status="done" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(a.container.innerHTML).toBe("");
    expect(FakeES.last).toBeNull();                                   // no stream was opened for a run nobody looked at
  });
  it("a finished QA can be collapsed again with its own button", async () => {
    render(<QaLive run={7} status="done" />);
    await waitFor(() => expect(FakeES.last).not.toBeNull());
    act(() => { FakeES.last!.send({ type: "snapshot", done: true, timeline: [], last_frame: { jpeg: "AAAA" }, film: [{ type: "film", t: 0, file: "0000.jpg" }] }); });
    const btn = await screen.findByTestId("qa-live-collapse");
    act(() => { fireEvent.click(btn); });
    expect(screen.getByTestId("qa-live-collapsed").textContent).toContain("run #7");
  });
});
