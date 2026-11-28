// Grokbot QA 2026-10-12, item 35: bare letters must never navigate while somebody is typing, or when a closed dialog left the focus on the page.
import { describe, it, expect } from "vitest";
import { isTypingTarget, isShortcutChord } from "./typing-target";

const el = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; document.body.appendChild(d); return d; };
const ev = (o: Record<string, any>) => ({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, isComposing: false, target: document.body, ...o }) as any;

describe("typing targets", () => {
  it("knows every place a person types", () => {
    const d = el(`<input id="i"><textarea id="t"></textarea><select id="s"><option>x</option></select><div id="c" contenteditable="true"><span id="cs"></span></div>
      <div class="cm-editor"><div class="cm-content" id="cm"></div></div><div class="xterm"><textarea id="x"></textarea></div><div role="dialog"><button id="db">ok</button></div>`);
    for (const id of ["i", "t", "s", "cs", "cm", "x", "db"]) expect(isTypingTarget(d.querySelector("#" + id)), id).toBe(true);
  });
  it("a page, a body and a plain button are not typing targets", () => {
    const d = el(`<button id="b">go</button><div id="p">text</div>`);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(d.querySelector("#b"))).toBe(false);
    expect(isTypingTarget(d.querySelector("#p"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("shortcut chords", () => {
  it("a bare letter is never a shortcut, whatever has focus", () => {
    expect(isShortcutChord(ev({}))).toBe(false);
    const d = el(`<button id="b2">go</button>`);
    expect(isShortcutChord(ev({ target: d.querySelector("#b2") }))).toBe(false);
  });
  it("Alt + a letter is one, when nobody is typing", () => {
    expect(isShortcutChord(ev({ altKey: true }))).toBe(true);
  });
  it("not while somebody is typing in a field", () => {
    const d = el(`<input id="i2">`);
    expect(isShortcutChord(ev({ altKey: true, target: d.querySelector("#i2") }))).toBe(false);
  });
  it.each([["composing", { isComposing: true }], ["repeating", { repeat: true }], ["with ctrl", { ctrlKey: true }], ["with shift", { shiftKey: true }], ["with meta", { metaKey: true }]])("not while %s", (_n, o) => {
    expect(isShortcutChord(ev({ altKey: true, ...o }))).toBe(false);
  });
});
