// DRIVING A PANE'S UI FROM AN AGENT (operator 2026-11-10: "all Studio panes should be controllable by the agents via the MCP, with all their features"). Instead of a hand-made protocol per pane (and
// one more to write for every pane added later), an agent gets what a person gets: it can SEE a pane (its text, and every control in it, named) and ACT in it (click, type, choose, press a key,
// scroll). Whatever the pane can do for a person, it can do for the agent, and what the agent does is the pane's own code running, visible on the screen.
//
// A snapshot gives each control a short ref (`e1`, `e2` ...), good until the next snapshot of that pane; an act names a control by that ref, by its `data-testid`, or by its visible name. A name that
// matches several controls is refused with the candidates, never guessed at. Pure over a DOM element (tested in jsdom against React-controlled inputs, which need their value set the way a browser does).

export type UiElement = { ref: string; role: string; name: string; value?: string; checked?: boolean; disabled?: boolean; testid?: string; options?: string[] };
export type Snapshot = { text: string; elements: UiElement[]; truncated: boolean; frames: { name: string; src: string }[] };
export type ActRequest = { action: "click" | "type" | "select" | "press" | "scroll" | "focus" | "hover" | "check" | "uncheck"; ref?: string; testid?: string; text?: string; value?: string; key?: string; dy?: number; submit?: boolean; append?: boolean };
export type ActResult = { ok: true; detail: string } | { ok: false; error: string };

const MAX_ELEMENTS = 160; const MAX_TEXT = 6000; const NAME_MAX = 90;
import { EditorView } from "@codemirror/view";
const INTERACTIVE = 'button, a[href], input:not([type=hidden]), textarea, select, summary, [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [role=option], [role=link], [role=radio], [contenteditable=""], [contenteditable=true], [tabindex]:not([tabindex="-1"])';
const refs = new Map<string, Map<string, Element>>();   // pane id -> ref -> element, from that pane's latest snapshot

const clean = (s: string, n = NAME_MAX) => s.replace(/\s+/g, " ").trim().slice(0, n);
const hasLayout = () => typeof document !== "undefined" && document.body.getClientRects().length > 0;   // false in jsdom: no layout to ask
function visible(el: Element): boolean {
  if (el.closest("[hidden], [aria-hidden=true]")) return false;
  const st = typeof getComputedStyle === "function" ? getComputedStyle(el) : null; if (st && (st.display === "none" || st.visibility === "hidden")) return false;
  return !hasLayout() || el.getClientRects().length > 0;
}
/** What a control is called: its aria-label, its label, its placeholder, its own text, its title; the test id when it has nothing else. */
export function nameOf(el: Element): string {
  const a = el.getAttribute("aria-label"); if (a?.trim()) return clean(a);
  const id = el.getAttribute("id"); if (id) { const l = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`); if (l?.textContent?.trim()) return clean(l.textContent); }
  const wrap = el.closest("label"); if (wrap && wrap !== el && wrap.textContent?.trim()) return clean(wrap.textContent);
  const ph = el.getAttribute("placeholder"); if (ph?.trim() && el.tagName !== "BUTTON") return clean(ph);
  const own = clean((el as HTMLElement).innerText ?? el.textContent ?? ""); if (own && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return own;
  const t = el.getAttribute("title"); if (t?.trim()) return clean(t);
  const tid = el.getAttribute("data-testid"); return tid ?? el.tagName.toLowerCase();
}
export function roleOf(el: Element): string {
  const r = el.getAttribute("role"); if (r) return r;
  const t = el.tagName;
  if (t === "A") return "link"; if (t === "BUTTON" || t === "SUMMARY") return "button"; if (t === "TEXTAREA") return "textbox"; if (t === "SELECT") return "select";
  if (t === "INPUT") { const ty = (el as HTMLInputElement).type; return ty === "checkbox" ? "checkbox" : ty === "radio" ? "radio" : ty === "range" ? "slider" : ty === "submit" || ty === "button" ? "button" : "textbox"; }
  if (el.getAttribute("contenteditable") !== null && el.getAttribute("contenteditable") !== "false") return "textbox";
  return "clickable";
}
const valueOf = (el: Element): string | undefined => { if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value; if (el.getAttribute("contenteditable") !== null) return clean(el.textContent ?? "", 200); return undefined; };

/** Every control in a pane, in reading order, each with a ref, a role, a name and (for an input) its value. A click-only element with no role (a div with a handler) is found by its pointer cursor. */
export function snapshotPane(paneId: string, root: Element, textChars = MAX_TEXT): Snapshot {
  const found: Element[] = []; const seen = new Set<Element>();
  for (const el of Array.from(root.querySelectorAll(INTERACTIVE))) { if (visible(el)) { found.push(el); seen.add(el); } }
  if (typeof getComputedStyle === "function") {
    for (const el of Array.from(root.querySelectorAll("div, span, li, tr, td, h1, h2, h3, img, svg"))) {
      if (seen.has(el) || !visible(el)) continue;
      if (getComputedStyle(el).cursor === "pointer" && !el.closest(INTERACTIVE) && !found.some((f) => f.contains(el))) { found.push(el); seen.add(el); }
    }
  }
  found.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const map = new Map<string, Element>(); const elements: UiElement[] = [];
  found.slice(0, MAX_ELEMENTS).forEach((el, i) => {
    const ref = `e${i + 1}`; map.set(ref, el);
    const u: UiElement = { ref, role: roleOf(el), name: nameOf(el) };
    const v = valueOf(el); if (v !== undefined) u.value = v.slice(0, 200);
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) u.checked = el.checked; else if (el.getAttribute("aria-pressed")) u.checked = el.getAttribute("aria-pressed") === "true";
    if ((el as HTMLButtonElement).disabled) u.disabled = true;
    const tid = el.getAttribute("data-testid"); if (tid) u.testid = tid;
    if (el instanceof HTMLSelectElement) u.options = Array.from(el.options).map((o) => o.label || o.value).slice(0, 30);
    elements.push(u);
  });
  refs.set(paneId, map);
  const raw = (root as HTMLElement).innerText ?? root.textContent ?? "";
  const text = raw.split("\n").map((l) => l.trimEnd()).filter((l, i, a) => l.trim() || (a[i - 1] ?? "").trim()).join("\n").trim();
  const frames = Array.from(root.querySelectorAll("iframe")).map((f) => ({ name: f.getAttribute("title") || f.getAttribute("name") || "frame", src: f.getAttribute("src") ?? "" }));
  return { text: text.slice(0, textChars), elements, truncated: text.length > textChars || found.length > MAX_ELEMENTS, frames };
}

/** The control an act names: its ref (from the pane's latest snapshot), its test id, or its visible name (one match only). */
export function findControl(paneId: string, root: Element, req: { ref?: string; testid?: string; text?: string }): { el: Element } | { error: string } {
  if (req.ref) { const el = refs.get(paneId)?.get(req.ref); return el && root.contains(el) ? { el } : { error: `\`${req.ref}\` is not on the pane any more: look at it again (antiloki_pane_view) and use the new refs` }; }
  if (req.testid) { const el = root.querySelector(`[data-testid="${CSS.escape(req.testid)}"]`); return el ? { el } : { error: `nothing on the pane has the test id \`${req.testid}\`` }; }
  if (req.text) {
    const want = req.text.trim().toLowerCase(); const all = Array.from(root.querySelectorAll(INTERACTIVE)).filter(visible);
    const exact = all.filter((e) => nameOf(e).toLowerCase() === want); const hits = exact.length ? exact : all.filter((e) => nameOf(e).toLowerCase().includes(want));
    if (hits.length === 1) return { el: hits[0] };
    if (hits.length === 0) return { error: `no control on the pane is named like "${req.text}"` };
    return { error: `${hits.length} controls are named like "${req.text}": ${hits.slice(0, 6).map((h) => `${roleOf(h)} "${nameOf(h)}"`).join(", ")}. Use a ref from antiloki_pane_view.` };
  }
  return { error: "name the control: a `ref` from antiloki_pane_view, a `testid`, or its visible `text`" };
}

const fire = (el: Element, type: string, init: MouseEventInit | KeyboardEventInit = {}) => { const C = type.startsWith("key") ? KeyboardEvent : type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent; el.dispatchEvent(new C(type, { bubbles: true, cancelable: true, composed: true, ...init } as never)); };
/** Set a React-controlled input's value the way a browser does (React ignores a plain `.value =`): through the prototype's own setter, then an `input` event. */
function setValue(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
}
const label = (el: Element) => `${roleOf(el)} "${nameOf(el)}"`;
const scrollable = (el: Element): Element => { let n: Element | null = el; while (n && n.scrollHeight <= n.clientHeight + 1) n = n.parentElement; return n ?? el; };

/** Do one thing in a pane. The pane's own handlers run; nothing is called around them. */
export function actOnPane(paneId: string, root: Element, req: ActRequest): ActResult {
  const f = findControl(paneId, root, req); if ("error" in f) return { ok: false, error: f.error };
  const el = f.el as HTMLElement;
  if ((el as HTMLButtonElement).disabled) return { ok: false, error: `${label(el)} is disabled` };
  switch (req.action) {
    case "click": case "check": case "uncheck": {
      if ((req.action === "check" || req.action === "uncheck") && el instanceof HTMLInputElement && el.checked === (req.action === "check")) return { ok: true, detail: `${label(el)} was already ${req.action === "check" ? "checked" : "unchecked"}` };
      el.focus?.(); fire(el, "pointerdown"); fire(el, "mousedown"); fire(el, "pointerup"); fire(el, "mouseup"); fire(el, "click"); return { ok: true, detail: `clicked ${label(el)}` };
    }
    case "hover": fire(el, "pointerover"); fire(el, "mouseover"); fire(el, "mouseenter", { bubbles: false }); fire(el, "mousemove"); return { ok: true, detail: `hovered ${label(el)}` };
    case "focus": el.focus?.(); return { ok: true, detail: `focused ${label(el)}` };
    case "type": {
      // `value` is what to type; `text` names the control when no ref/testid is given, and is the TEXT TO TYPE when one is (an agent that sent {ref, text} typed nothing at all: found 2026-11-11 trying to fill the Frames ask box)
      const text = req.value !== undefined ? req.value : (req.ref || req.testid) && req.text !== undefined ? req.text : "";
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el instanceof HTMLInputElement && ["checkbox", "radio", "button", "submit", "file"].includes(el.type)) return { ok: false, error: `${label(el)} is not a text field` };
        el.focus(); setValue(el, req.append ? el.value + text : text);
      } else if (el.getAttribute("contenteditable") !== null && el.getAttribute("contenteditable") !== "false") {
        // A CODEMIRROR PAGE (the notes) is written through its own state (2026-11-18: an agent typed a note with line breaks and got ONE LINE, because setting the text of its contenteditable replaces the editor's lines with a single text node):
        // the whole text, newlines included, goes in as the document, so lists, headings and tables arrive as written
        const cm = el.closest(".cm-editor") ? EditorView.findFromDOM(el.closest(".cm-editor") as HTMLElement) : null;
        if (cm) { const from = req.append ? cm.state.doc.length : 0; cm.focus(); cm.dispatch({ changes: { from, to: cm.state.doc.length, insert: text }, selection: { anchor: from + text.length } }); }
        else { el.focus(); el.textContent = req.append ? (el.textContent ?? "") + text : text; el.dispatchEvent(new Event("input", { bubbles: true })); }
      } else return { ok: false, error: `${label(el)} is not something text can be typed into` };
      if (req.submit) { fire(el, "keydown", { key: "Enter", code: "Enter" } as KeyboardEventInit); fire(el, "keyup", { key: "Enter", code: "Enter" } as KeyboardEventInit); }
      return { ok: true, detail: `typed ${JSON.stringify(text.slice(0, 60))} into ${label(el)}${req.submit ? " and pressed Enter" : ""}` };
    }
    case "select": {
      if (!(el instanceof HTMLSelectElement)) return { ok: false, error: `${label(el)} is not a dropdown: click it, then click the option` };
      const want = (req.value ?? req.text ?? "").toLowerCase(); const o = Array.from(el.options).find((x) => x.value.toLowerCase() === want || (x.label || x.text).toLowerCase() === want);
      if (!o) return { ok: false, error: `${label(el)} has no option "${req.value}": it has ${Array.from(el.options).map((x) => x.label || x.value).join(", ")}` };
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, o.value); el.dispatchEvent(new Event("change", { bubbles: true })); return { ok: true, detail: `chose "${o.label || o.value}" in ${label(el)}` };
    }
    case "press": {
      const key = req.key ?? ""; if (!key) return { ok: false, error: "press needs a `key` (Enter, Escape, Tab, ArrowDown ...)" };
      el.focus?.(); const code = key.length === 1 ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key) : key; fire(el, "keydown", { key, code } as KeyboardEventInit); fire(el, "keyup", { key, code } as KeyboardEventInit); return { ok: true, detail: `pressed ${key} on ${label(el)}` };
    }
    case "scroll": { const t = scrollable(el); t.scrollBy?.({ top: req.dy ?? 400 }); if (!t.scrollBy) (t as HTMLElement).scrollTop += req.dy ?? 400; return { ok: true, detail: `scrolled ${label(el)} by ${req.dy ?? 400}px` }; }
    default: return { ok: false, error: `action is one of: click, type, select, press, scroll, focus, hover, check, uncheck` };
  }
}
