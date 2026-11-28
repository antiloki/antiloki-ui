// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { actOnPane, findControl, nameOf, roleOf, snapshotPane } from "./pane-driver";

afterEach(() => cleanup());

function Sample({ onChange }: { onChange?: (s: string) => void }) {
  const [title, setTitle] = React.useState(""); const [added, setAdded] = React.useState<string[]>([]); const [checked, setChecked] = React.useState(false); const [pick, setPick] = React.useState("b"); const [clicks, setClicks] = React.useState(0);
  return (
    <div data-testid="pane-body-t1">
      <h2>Sagas</h2>
      <button data-testid="saga-new" onClick={() => setClicks((n) => n + 1)}>+ New saga</button>
      <input data-testid="saga-new-title" placeholder="A title for the work" value={title} onChange={(e) => { setTitle(e.target.value); onChange?.(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter" && title) { setAdded((a) => [...a, title]); setTitle(""); } }} />
      <label>Only mine <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /></label>
      <select aria-label="status" value={pick} onChange={(e) => setPick(e.target.value)}><option value="a">todo</option><option value="b">doing</option><option value="c">done</option></select>
      <div role="button" tabIndex={0} aria-label="open row" onClick={() => setClicks((n) => n + 10)}>a row</div>
      <div style={{ cursor: "pointer" }} onClick={() => setClicks((n) => n + 100)}>a clickable div with no role</div>
      <button disabled>locked</button><button hidden>secret</button>
      <ul>{added.map((a) => <li key={a}>{a}</li>)}</ul><p data-testid="state">{`clicks=${clicks} checked=${checked} pick=${pick} added=${added.join("|")}`}</p>
    </div>
  );
}
const root = () => document.querySelector('[data-testid="pane-body-t1"]')!;
const ref = (snap: ReturnType<typeof snapshotPane>, name: string) => snap.elements.find((e) => e.name === name)!.ref;
const state = () => document.querySelector('[data-testid="state"]')!.textContent;

describe("driving a pane's UI", () => {
  it("a snapshot gives the pane's text and every visible control in order with a role, a name, a value and a ref; hidden and unnamed noise is left out", () => {
    render(<Sample />); const s = snapshotPane("t1", root());
    expect(s.text).toContain("Sagas"); expect(s.text).toContain("+ New saga");
    expect(s.elements.map((e) => `${e.role}:${e.name}`)).toEqual(["button:+ New saga", "textbox:A title for the work", "checkbox:Only mine", "select:status", "button:open row", "clickable:a clickable div with no role", "button:locked"]);
    expect(s.elements.map((e) => e.ref)).toEqual(["e1", "e2", "e3", "e4", "e5", "e6", "e7"]);
    expect(s.elements.find((e) => e.name === "status")).toMatchObject({ value: "b", options: ["todo", "doing", "done"] }); expect(s.elements.find((e) => e.name === "locked")?.disabled).toBe(true); expect(s.elements.find((e) => e.name === "+ New saga")?.testid).toBe("saga-new");
    expect(s.elements.some((e) => e.name === "secret")).toBe(false);
  });
  it("click works by ref, by test id and by visible name, and runs the pane's own handler", () => {
    render(<Sample />); const s = snapshotPane("t1", root());
    act(() => { expect(actOnPane("t1", root(), { action: "click", ref: ref(s, "+ New saga") })).toMatchObject({ ok: true }); }); expect(state()).toContain("clicks=1");
    act(() => { actOnPane("t1", root(), { action: "click", testid: "saga-new" }); }); expect(state()).toContain("clicks=2");
    act(() => { actOnPane("t1", root(), { action: "click", text: "open row" }); }); expect(state()).toContain("clicks=12");
    act(() => { actOnPane("t1", root(), { action: "click", ref: ref(s, "a clickable div with no role") }); }); expect(state()).toContain("clicks=112");
  });
  it("typing sets a controlled input the way a browser does (React sees it), and Enter submits; text can be appended", () => {
    const seen: string[] = []; render(<Sample onChange={(v) => seen.push(v)} />); snapshotPane("t1", root());
    act(() => { expect(actOnPane("t1", root(), { action: "type", testid: "saga-new-title", value: "Ship the pitch" })).toMatchObject({ ok: true }); }); expect(seen).toEqual(["Ship the pitch"]); expect((document.querySelector('[data-testid="saga-new-title"]') as HTMLInputElement).value).toBe("Ship the pitch");
    act(() => { actOnPane("t1", root(), { action: "type", testid: "saga-new-title", value: " now", append: true }); }); expect((document.querySelector('[data-testid="saga-new-title"]') as HTMLInputElement).value).toBe("Ship the pitch now");
    act(() => { actOnPane("t1", root(), { action: "type", testid: "saga-new-title", value: "A new saga", submit: true }); }); expect(state()).toContain("added=A new saga"); expect((document.querySelector('[data-testid="saga-new-title"]') as HTMLInputElement).value).toBe("");
  });
  it("a checkbox is checked and unchecked (already-so is said, not toggled back), and a dropdown is chosen by its value or label", () => {
    render(<Sample />); snapshotPane("t1", root());
    act(() => { actOnPane("t1", root(), { action: "check", text: "Only mine" }); }); expect(state()).toContain("checked=true"); act(() => { const r = actOnPane("t1", root(), { action: "check", text: "Only mine" }); expect(r).toMatchObject({ ok: true }); }); expect(state()).toContain("checked=true");
    act(() => { actOnPane("t1", root(), { action: "uncheck", text: "Only mine" }); }); expect(state()).toContain("checked=false");
    act(() => { expect(actOnPane("t1", root(), { action: "select", text: "status", value: "done" })).toMatchObject({ ok: true }); }); expect(state()).toContain("pick=c"); act(() => { actOnPane("t1", root(), { action: "select", text: "status", value: "c" }); });
    expect(actOnPane("t1", root(), { action: "select", text: "status", value: "nope" })).toMatchObject({ ok: false, error: expect.stringContaining("has no option") }); expect(actOnPane("t1", root(), { action: "select", testid: "saga-new", value: "x" })).toMatchObject({ ok: false, error: expect.stringContaining("not a dropdown") });
  });
  it("an ambiguous name is refused with the candidates, an unknown one says so, a stale ref says to look again, a disabled control cannot be clicked, and a button is not typed into", () => {
    render(<Sample />); const s = snapshotPane("t1", root());
    const amb = findControl("t1", root(), { text: "o" }); expect("error" in amb && amb.error).toContain("controls are named like"); expect(findControl("t1", root(), { text: "zzz" })).toMatchObject({ error: expect.stringContaining("no control") });
    expect(findControl("t1", root(), { ref: "e99" })).toMatchObject({ error: expect.stringContaining("look at it again") }); expect(findControl("t1", root(), {})).toMatchObject({ error: expect.stringContaining("name the control") });
    expect(actOnPane("t1", root(), { action: "click", ref: ref(s, "locked") })).toEqual({ ok: false, error: 'button "locked" is disabled' }); expect(actOnPane("t1", root(), { action: "type", testid: "saga-new", value: "x" })).toMatchObject({ ok: false, error: expect.stringContaining("not something text can be typed into") });
    cleanup(); expect(findControl("t1", document.body, { ref: ref(s, "locked") })).toMatchObject({ error: expect.stringContaining("look at it again") });
  });
  it("press sends the key to the control and scroll moves what scrolls; a press with no key is refused", () => {
    const keys: string[] = []; const { container } = render(<div data-testid="pane-body-t2"><input aria-label="q" onKeyDown={(e) => keys.push(e.key)} /></div>); const r2 = container.querySelector('[data-testid="pane-body-t2"]')!; snapshotPane("t2", r2);
    act(() => { expect(actOnPane("t2", r2, { action: "press", text: "q", key: "Escape" })).toMatchObject({ ok: true }); }); expect(keys).toEqual(["Escape"]); expect(actOnPane("t2", r2, { action: "press", text: "q" })).toMatchObject({ ok: false });
    expect(actOnPane("t2", r2, { action: "scroll", text: "q", dy: 100 })).toMatchObject({ ok: true }); expect(actOnPane("t2", r2, { action: "teleport" as never, text: "q" })).toMatchObject({ ok: false });
  });
  it("names and roles read from labels, placeholders, titles and content; an iframe is reported as one, since what is inside it is not reachable", () => {
    const { container } = render(<div><label htmlFor="x">Search</label><input id="x" /><button title="Refresh">↻</button><a href="#a">link text</a><iframe title="the app" src="http://localhost:3000" /></div>);
    const el = (q: string) => container.querySelector(q)!; expect(nameOf(el("input"))).toBe("Search"); expect(nameOf(el("button"))).toBe("↻"); expect(roleOf(el("a"))).toBe("link"); expect(roleOf(el("input"))).toBe("textbox");
    expect(snapshotPane("t3", container).frames).toEqual([{ name: "the app", src: "http://localhost:3000" }]);
  });
});

describe("typing into a control", () => {
  it("takes the text from `text` when a ref or test id names the control (an agent that sent {ref, text} typed nothing), and from `value` first", async () => {
    const { actOnPane } = await import("./pane-driver");
    const root = document.createElement("div"); root.innerHTML = '<textarea data-testid="ask" aria-label="ask"></textarea>'; document.body.appendChild(root);
    const ta = root.querySelector("textarea") as HTMLTextAreaElement;
    expect(actOnPane("p", root, { action: "type", testid: "ask", text: "a settings screen" }).ok).toBe(true); expect(ta.value).toBe("a settings screen");
    expect(actOnPane("p", root, { action: "type", testid: "ask", value: "from value", text: "ignored" }).ok).toBe(true); expect(ta.value).toBe("from value");
    root.remove();
  });
  it("writes a note through the editor, so the line breaks, list and table arrive as written (an agent's multi-line note came out as one line)", async () => {
    (Range.prototype as any).getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
    (Range.prototype as any).getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) });
    (document as any).elementFromPoint = () => null;
    const { EditorView } = await import("@codemirror/view"); const { actOnPane } = await import("./pane-driver");
    const root = document.createElement("div"); document.body.appendChild(root);
    const view = new EditorView({ parent: root, doc: "old" });
    const text = "Next steps\n\n1. one\n2. two\n\n| a | b |\n|---|---|\n| 1 | 2 |";
    // the driver finds the control by its role: the editor's contenteditable is a textbox
    const content = root.querySelector(".cm-content") as HTMLElement; content.setAttribute("data-testid", "note"); content.setAttribute("aria-label", "note");
    expect(actOnPane("p", root, { action: "type", testid: "note", value: text }).ok).toBe(true); expect(view.state.doc.toString()).toBe(text); expect(view.state.doc.lines).toBe(8);
    expect(actOnPane("p", root, { action: "type", testid: "note", value: "\n- more", append: true }).ok).toBe(true); expect(view.state.doc.toString()).toBe(text + "\n- more");
    view.destroy(); root.remove();
  });
});
