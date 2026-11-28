import { describe, it, expect } from "vitest";
import { ACTIONS, ACTION_IDS, actionFor, chordOf, chordProblem, clearChord, defaultBindings, holder, keyBelongsToLeader, keyName, leaderProblem, normalizeChord, parseOverrides, resetChord, resolve, setChord, showChord } from "./shortcuts";

const ev = (o: Partial<{ code: string; key: string; altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }>) => ({ code: "", key: "", altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...o });

describe("the actions and their keys after the leader", () => {
  it("every action has a key that may follow the leader, no two share one, and every id is listed once", () => {
    const seen = new Set<string>();
    for (const a of ACTIONS) { expect(chordProblem(a.chord), `${a.id} ${a.chord}`).toBeNull(); expect(normalizeChord(a.chord), a.id).toBe(a.chord); expect(seen.has(a.chord), `${a.id} duplicates ${a.chord}`).toBe(false); seen.add(a.chord); }
    expect(new Set(ACTION_IDS).size).toBe(ACTIONS.length);
  });
  it("covers what was asked: terminal, browsers, agent, specialist, close, remove a thread, go to a thread by number, the dial", () => {
    const b = defaultBindings(); expect([b["pane.terminal"], b["browser.light"], b["pane.agent"], b["agent.specialist"], b["pane.close"], b["thread.remove"]]).toEqual(["T", "B", "A", "S", "W", "Q"]);
    expect([b["thread.1"], b["thread.9"], b["thread.10"], b["thread.prev"], b["thread.next"]]).toEqual(["1", "9", "0", "Up", "Down"]);
  });
});

describe("a key event as a chord", () => {
  it("is read from the physical key", () => {
    expect(chordOf(ev({ code: "KeyZ", key: "Ω", altKey: true }))).toBe("Alt+Z");
    expect(chordOf(ev({ code: "KeyB", key: "B", shiftKey: true }))).toBe("Shift+B");
    expect(chordOf(ev({ code: "BracketRight", key: "]", shiftKey: true }))).toBe("Shift+]");
    expect(chordOf(ev({ code: "Digit0", key: "0" }))).toBe("0");
    expect(chordOf(ev({ code: "Space", key: " ", ctrlKey: true }))).toBe("Ctrl+Space");
    expect(chordOf(ev({ code: "ArrowUp", key: "ArrowUp" }))).toBe("Up");
  });
  it("a lone modifier and an unnameable key are not chords", () => { expect(chordOf(ev({ code: "AltLeft", key: "Alt", altKey: true }))).toBeNull(); expect(chordOf(ev({ code: "", key: "", altKey: true }))).toBeNull(); expect(keyName({ code: "Dead", key: "Dead" })).toBeNull(); });
  it("a chord typed by hand is put in the one spelling", () => {
    expect(normalizeChord("shift+alt+h")).toBe("Alt+Shift+H"); expect(normalizeChord("ctrl+space")).toBe("Ctrl+Space"); expect(normalizeChord("super+left")).toBe("Meta+Left"); expect(normalizeChord("")).toBeNull(); expect(normalizeChord("alt+nonsense")).toBeNull();
  });
});

describe("what the leader and the keys after it may be", () => {
  it("the leader needs Ctrl, Alt or Super with it, and not what the browser or the desktop keeps", () => {
    expect(leaderProblem("Ctrl+Space")).toBeNull(); expect(leaderProblem("Alt+Space")).toBeNull(); expect(leaderProblem("Meta+K")).toBeNull();
    for (const bad of ["Space", "H", "Shift+H"]) expect(leaderProblem(bad), bad).toMatch(/Ctrl, Alt or Super/);
    for (const bad of ["Ctrl+T", "Ctrl+W", "Ctrl+Shift+T", "Alt+Left", "Alt+F4", "Ctrl+Escape", "Ctrl+Tab"]) expect(leaderProblem(bad), bad).toBeTruthy(); expect(leaderProblem("banana")).toBe("that is not a key combination");
  });
  it("a key after the leader is plain or with Shift; Escape and Enter are kept", () => {
    for (const ok of ["T", "Shift+B", "1", "Up", "Space", "Tab", "]"]) expect(chordProblem(ok), ok).toBeNull();
    for (const bad of ["Ctrl+T", "Alt+T", "Meta+T"]) expect(chordProblem(bad), bad).toMatch(/plain key/);
    for (const bad of ["Escape", "Enter", "Backspace"]) expect(chordProblem(bad), bad).toMatch(/cannot be/); expect(chordProblem("banana")).toBe("that is not a key");
  });
});

describe("the person's choices", () => {
  it("an action with no override has its default, and an override or a clearing replaces it", () => {
    expect(resolve({})).toEqual(defaultBindings()); expect(resolve({ "pane.close": "X" })["pane.close"]).toBe("X"); expect(resolve({ "pane.close": "" })["pane.close"]).toBe("");
  });
  it("storage that is empty, broken or hostile gives the defaults, action by action", () => {
    expect(parseOverrides(null)).toEqual({}); expect(parseOverrides("{")).toEqual({}); expect(parseOverrides([1])).toEqual({}); expect(parseOverrides(7)).toEqual({});
    expect(parseOverrides({ "pane.close": "X", "bogus.action": "Y", "pane.zoom": "Ctrl+C", "pane.flip": 5, "pane.rename": "" })).toEqual({ "pane.close": "X", "pane.rename": "" });
  });
  it("two actions on one key can only come from a hand-edited file: the earlier keeps it", () => { const b = resolve({ "pane.zoom": "H" }); expect(b["pane.zoom"]).toBe("H"); expect(b["focus.left"]).toBe(""); });
  it("giving an action a key another holds is refused by name; taking it leaves the other with none", () => {
    const refused = setChord({}, "pane.close", "z"); expect(refused).toEqual({ ok: false, error: "zoom this pane already uses Z", holder: "pane.zoom" });
    const taken = setChord({}, "pane.close", "z", true); expect(taken.ok).toBe(true);
    if (taken.ok) { const b = resolve(taken.overrides); expect([b["pane.close"], b["pane.zoom"]]).toEqual(["Z", ""]); expect(taken.displaced).toBe("pane.zoom"); }
    expect(setChord({}, "pane.close", "Ctrl+C")).toMatchObject({ ok: false }); expect(setChord({}, "pane.close", "")).toMatchObject({ ok: false });
  });
  it("setting an action to its own default stores nothing, clearing keeps it empty, and reset puts the default back", () => {
    const same = setChord({ "pane.close": "X" }, "pane.close", "W"); expect(same.ok && same.overrides).toEqual({});
    const cleared = clearChord({}, "pane.close"); expect(resolve(cleared)["pane.close"]).toBe(""); expect(resolve(resetChord(cleared, "pane.close"))["pane.close"]).toBe("W");
    expect(holder(defaultBindings(), "w")).toBe("pane.close"); expect(holder(defaultBindings(), "w", "pane.close")).toBeNull();
  });
  it("a key after the leader runs the action bound to it, and nothing otherwise", () => {
    const b = resolve({ "pane.close": "X" });
    expect(actionFor(b, ev({ code: "KeyX" }))).toBe("pane.close"); expect(actionFor(b, ev({ code: "KeyW" }))).toBeNull(); expect(actionFor(b, ev({ code: "KeyH" }))).toBe("focus.left");
  });
  it("shows a key for the eye", () => { expect(showChord("Left")).toBe("←"); expect(showChord("Shift+Up")).toBe("Shift+↑"); expect(showChord("Ctrl+Space")).toBe("Ctrl+Space"); expect(showChord("Meta+K")).toBe("Super+K"); expect(showChord("")).toBe("none"); });
});

describe("the leader chord inside a text field", () => {
  it("is not swallowed by the field, and neither is the key that follows it", () => {
    expect(keyBelongsToLeader(false, true)).toBe(true);    // Ctrl+Space typed in an agent's message field
    expect(keyBelongsToLeader(true, false)).toBe(true);    // the next key (T, A, ...) while the leader window is open
    expect(keyBelongsToLeader(false, false)).toBe(false);  // ordinary typing stays in the field
  });
});
