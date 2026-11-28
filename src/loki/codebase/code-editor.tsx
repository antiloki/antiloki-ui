// THE CODE EDITOR OF THE X-RAY CODE TAB (operator 2026-10-11: "turn the read-only into a real code editor like VSCode so we can edit and save code directly").
// CodeMirror 6, not Monaco: it is the same kind of editor core (multiple cursors, search and replace, folding, bracket matching, undo history, auto-indent) at a fraction of the weight, and it needs no web workers
// or CDN, which the desktop app's security policy (`default-src 'self'`) would block. Languages load on demand, one chunk per file type, from the language-data catalogue.
//
// What the old read-only view carried stays, in the editor's own terms:
//   · the virtual doc cards and violation strips above blocks  -> block widgets, rendered through React PORTALS so they keep the app's contexts; they move with the text as it is edited
//   · the coverage heat-map                                    -> line backgrounds
//   · "jump to this line" from the graph and the reviews       -> scroll + a pulse on the line
// What is new: the text is editable, Ctrl/Cmd+S saves, and `onDirty` says whether it differs from the last saved text. This component never talks to the serve: the pane owns saving.
import React from "react";
import { createPortal } from "react-dom";
import { EditorState, Compartment, StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentUnit, LanguageDescription } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";
import { C, mono } from "@/loki/theme";

// ── pure helpers (tested) ─────────────────────────────────────────────────────────────────────────────────────
/** the editor works in LF; a CRLF file is shown as LF and the serve writes it back as CRLF (`file_save::with_file_eol`) */
export const lf = (text: string): string => text.replace(/\r\n?/g, "\n");

/** The indentation a file already uses, so Tab and auto-indent match it: a tab when most indented lines start with one, else the smallest space step seen among the first indented lines (2 when it cannot tell). Pure. */
export function indentOf(text: string): string {
  let tabs = 0, spaces = 0, step = 0;
  for (const ln of lf(text).split("\n").slice(0, 400)) {
    if (ln.startsWith("\t")) tabs++;
    else { const m = /^( +)\S/.exec(ln); if (m) { spaces++; const n = m[1].length; if (n >= 2 && (step === 0 || n < step)) step = n; } }
  }
  if (tabs > spaces) return "\t";
  return " ".repeat(step >= 2 && step <= 8 ? step : 2);
}

/** Is the theme dark? Reads the lightness out of `oklch(L …)` (a fraction or a percentage); dark when it cannot tell. Pure. */
export function isDarkBackground(bg: string): boolean {
  const m = /oklch\(\s*([\d.]+)(%?)/i.exec(bg);
  if (!m) return true;
  const l = parseFloat(m[1]) / (m[2] ? 100 : 1);
  return !(l > 0.55);
}

/** The 1-based line numbers the block widgets and heat tints sit on, clamped into the document and in order. Pure. */
export function clampLines(zeroBased: Iterable<number>, docLines: number): number[] {
  const out = new Set<number>();
  for (const z of zeroBased) if (Number.isFinite(z)) out.add(Math.min(Math.max(0, Math.floor(z)), Math.max(0, docLines - 1)) + 1);
  return [...out].sort((a, b) => a - b);
}

// ── look ──────────────────────────────────────────────────────────────────────────────────────────────────────
// the same token hues the read-only highlighter used, so the code keeps the colours people are used to
const HUE = { comment: "oklch(0.55 0.02 150)", string: "oklch(0.78 0.12 52)", keyword: "oklch(0.74 0.14 292)", number: "oklch(0.80 0.10 40)", fn: "oklch(0.86 0.12 95)", type: "oklch(0.76 0.12 200)", punct: "oklch(0.62 0.015 250)" };
const highlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: HUE.comment, fontStyle: "italic" },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: HUE.string },
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: HUE.keyword },
  { tag: [t.number, t.bool, t.null, t.atom], color: HUE.number },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: HUE.fn },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: HUE.type },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: HUE.punct },
  { tag: t.heading, fontWeight: "bold", color: HUE.keyword },
  { tag: t.link, textDecoration: "underline", color: HUE.type },
  { tag: t.invalid, color: C.bad },
]);
const theme = (dark: boolean): Extension => EditorView.theme({
  "&": { height: "100%", backgroundColor: C.bg, color: C.fg, fontSize: "var(--cm-fs, 12px)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: mono, lineHeight: "1.5", overflow: "auto" },
  ".cm-content": { caretColor: C.brand, padding: "8px 0" },
  ".cm-gutters": { backgroundColor: C.bg, color: C.muted, border: "none" },
  ".cm-activeLine": { backgroundColor: `color-mix(in oklab, ${C.brand} 7%, transparent)` },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: C.brand },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: C.brand },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": { background: `color-mix(in oklab, ${C.brand} 30%, transparent)` },
  ".cm-selectionMatch": { backgroundColor: `color-mix(in oklab, ${C.brand} 18%, transparent)` },
  ".cm-searchMatch": { backgroundColor: `color-mix(in oklab, ${C.warn} 30%, transparent)`, outline: `1px solid color-mix(in oklab, ${C.warn} 60%, transparent)` },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: `color-mix(in oklab, ${C.brand} 45%, transparent)` },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "transparent", outline: `1px solid ${C.brand}` },
  ".cm-panels": { backgroundColor: C.panel, color: C.fg, borderColor: C.border, fontFamily: mono, fontSize: "11px" },
  ".cm-panels input, .cm-panels button, .cm-panels label": { fontFamily: mono, fontSize: "11px", color: C.fg },
  ".cm-panels input[type=text], .cm-panels input:not([type])": { backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "2px 6px" },
  ".cm-panels button": { backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: "4px", cursor: "pointer", backgroundImage: "none" },
  ".cm-tooltip": { backgroundColor: C.panel, border: `1px solid ${C.border}`, color: C.fg },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: `color-mix(in oklab, ${C.brand} 30%, transparent)`, color: C.fg },
  ".cm-foldPlaceholder": { backgroundColor: C.panel, border: `1px solid ${C.border}`, color: C.dim },
  ".cm-blink-line": { animation: "loki-line-blink 1.6s ease-in-out" },
  ".cm-react-block": { fontFamily: "inherit" },
}, { dark });

let blinkCss = false;
function ensureBlinkCss() {
  if (blinkCss || typeof document === "undefined") return;
  blinkCss = true;
  const s = document.createElement("style");
  s.textContent = "@keyframes loki-line-blink{0%,100%{background:transparent}20%,60%{background:oklch(0.64 0.11 38 / 0.5)}40%,80%{background:transparent}}";
  document.head.appendChild(s);
}

// ── block widgets (doc cards, violation strips) rendered through portals ──────────────────────────────────────
type BlockHost = { add: (id: string, el: HTMLElement, line: number) => void; remove: (id: string) => void };
const widgetIds = new WeakMap<HTMLElement, string>();
let widgetSeq = 0;
class ReactBlock extends WidgetType {
  constructor(readonly line: number, readonly ver: number, readonly host: BlockHost) { super(); }
  eq(o: ReactBlock) { return o.line === this.line && o.ver === this.ver; }
  toDOM() { const el = document.createElement("div"); el.className = "cm-react-block"; const id = `${this.line}:${this.ver}:${++widgetSeq}`; widgetIds.set(el, id); this.host.add(id, el, this.line); return el; }
  destroy(dom: HTMLElement) { const id = widgetIds.get(dom); if (id) this.host.remove(id); }
  ignoreEvent() { return true; }   // the cards handle their own clicks; the editor stays out of it
}
const setBlocks = StateEffect.define<DecorationSet>();
const blocksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) { v = v.map(tr.changes); for (const e of tr.effects) if (e.is(setBlocks)) v = e.value; return v; },
  provide: (f) => EditorView.decorations.from(f),
});
const setHeat = StateEffect.define<DecorationSet>();
const heatField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) { v = v.map(tr.changes); for (const e of tr.effects) if (e.is(setHeat)) v = e.value; return v; },
  provide: (f) => EditorView.decorations.from(f),
});
const setBlink = StateEffect.define<DecorationSet>();
const blinkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) { v = v.map(tr.changes); for (const e of tr.effects) if (e.is(setBlink)) v = e.value; return v; },
  provide: (f) => EditorView.decorations.from(f),
});

// ── the component ─────────────────────────────────────────────────────────────────────────────────────────────
export type CodeEditorHandle = {
  getText: () => string;
  /** replace the whole text (undoable) */
  setText: (text: string) => void;
  /** the text on disk is now this one: dirty is measured against it from here on, and the undo history stays */
  markSaved: (text: string) => void;
  goToLine: (n: number) => void;
  focus: () => void;
};
export type CodeEditorProps = {
  /** a new document (another file, or a reload from disk) is a new key; the editor is rebuilt for it. Saving does NOT change it, so the cursor and the undo history survive a save */
  docKey: string;
  path: string;
  /** the text to open with (read at mount) */
  initial: string;
  /** the text on disk, which dirty is measured against (defaults to `initial`) */
  saved?: string;
  fontSize: number;
  readOnly?: boolean;
  decorations?: Map<number, React.ReactNode> | null;
  heatLines?: Map<number, string> | null;
  blink?: { line: number; nonce: number } | null;
  onDirty?: (dirty: boolean) => void;
  onSave?: () => void;
  /** the document being left behind (another file opened, a reload, the pane closed): its text, whether it was unsaved, and WHICH document it was (its `docKey`), so the pane can keep a draft for the right file */
  onLeave?: (text: string, dirty: boolean, docKey: string) => void;
};

export const CodeEditor = React.forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(props, ref) {
  const { docKey, path, fontSize, readOnly = false, decorations = null, heatLines = null, blink = null } = props;
  const host = React.useRef<HTMLDivElement | null>(null);
  const view = React.useRef<EditorView | null>(null);
  const baseline = React.useRef<string>("");
  const dirtyRef = React.useRef(false);
  const latest = React.useRef(props); latest.current = props;
  const [mounted, setMounted] = React.useState(0);
  const [blocks, setBlocksState] = React.useState<Record<string, { el: HTMLElement; line: number }>>({});
  const verRef = React.useRef(0);

  const blockHost = React.useMemo<BlockHost>(() => ({
    add: (id, el, line) => setBlocksState((b) => ({ ...b, [id]: { el, line } })),
    remove: (id) => setBlocksState((b) => { if (!(id in b)) return b; const { [id]: _gone, ...rest } = b; return rest; }),
  }), []);

  React.useImperativeHandle(ref, () => ({
    getText: () => view.current?.state.doc.toString() ?? "",
    setText: (text) => { const v = view.current; if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: lf(text) } }); },
    markSaved: (text) => { baseline.current = lf(text); const v = view.current; const d = v ? v.state.doc.toString() !== baseline.current : false; if (d !== dirtyRef.current) { dirtyRef.current = d; latest.current.onDirty?.(d); } },
    goToLine: (n) => { const v = view.current; if (!v) return; const ln = v.state.doc.line(Math.min(Math.max(1, Math.floor(n)), v.state.doc.lines)); v.dispatch({ selection: { anchor: ln.from }, effects: EditorView.scrollIntoView(ln.from, { y: "center" }) }); v.focus(); },
    focus: () => view.current?.focus(),
  }), []);

  // build the editor for this document
  React.useEffect(() => {
    if (!host.current) return;
    ensureBlinkCss();
    const mountKey = docKey;
    const initial = lf(latest.current.initial);
    baseline.current = lf(latest.current.saved ?? latest.current.initial);
    const lang = new Compartment();
    const dark = typeof document !== "undefined" ? isDarkBackground(getComputedStyle(document.documentElement).getPropertyValue("--c-bg")) : true;
    const state = EditorState.create({
      doc: initial,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), foldGutter(), drawSelection(), dropCursor(),
        EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(highlight), bracketMatching(), closeBrackets(), autocompletion(),
        rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightSelectionMatches(),
        indentUnit.of(indentOf(initial)), EditorState.tabSize.of(4),
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => { latest.current.onSave?.(); return true; } },
          ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab,
        ]),
        lang.of([]), blocksField, heatField, blinkField, theme(dark),
        EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          const d = u.state.doc; const dirty = d.length !== baseline.current.length || d.toString() !== baseline.current;
          if (dirty !== dirtyRef.current) { dirtyRef.current = dirty; latest.current.onDirty?.(dirty); }
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    dirtyRef.current = initial !== baseline.current;
    latest.current.onDirty?.(dirtyRef.current);
    // the language arrives later, one chunk per file type
    const name = path.split(/[/\\]/).pop() ?? path;
    const desc = LanguageDescription.matchFilename(languages, name);
    let alive = true;
    if (desc) void desc.load().then((support) => { if (alive && view.current === v) v.dispatch({ effects: lang.reconfigure(support) }); }).catch(() => { /* a language that fails to load is plain text */ });
    setMounted((n) => n + 1);
    return () => {
      alive = false;
      const text = v.state.doc.toString();
      latest.current.onLeave?.(text, text !== baseline.current, mountKey);
      v.destroy(); view.current = null; setBlocksState({});
    };
  }, [docKey, readOnly]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the virtual cards above blocks
  React.useEffect(() => {
    const v = view.current; if (!v) return;
    const ver = ++verRef.current;
    const lines = clampLines((decorations ?? new Map()).keys(), v.state.doc.lines);
    const set = Decoration.set(lines.map((n) => Decoration.widget({ widget: new ReactBlock(n - 1, ver, blockHost), block: true, side: -1 }).range(v.state.doc.line(n).from)), true);
    v.dispatch({ effects: setBlocks.of(set) });
  }, [decorations, mounted, blockHost]);

  // the coverage heat-map
  React.useEffect(() => {
    const v = view.current; if (!v) return;
    const entries = [...(heatLines ?? new Map<number, string>())].filter(([i]) => Number.isFinite(i));
    const set = Decoration.set(entries.map(([i, color]) => Decoration.line({ attributes: { style: `background:${color}` } }).range(v.state.doc.line(Math.min(Math.max(0, i), v.state.doc.lines - 1) + 1).from)), true);
    v.dispatch({ effects: setHeat.of(set) });
  }, [heatLines, mounted]);

  // jump to a line and pulse it
  React.useEffect(() => {
    const v = view.current; if (!v || !blink) return;
    const ln = v.state.doc.line(Math.min(Math.max(0, blink.line), v.state.doc.lines - 1) + 1);
    v.dispatch({ effects: [EditorView.scrollIntoView(ln.from, { y: "center" }), setBlink.of(Decoration.set([Decoration.line({ class: "cm-blink-line" }).range(ln.from)]))] });
    const timer = setTimeout(() => { if (view.current === v) v.dispatch({ effects: setBlink.of(Decoration.none) }); }, 1700);
    return () => clearTimeout(timer);
  }, [blink?.nonce, mounted]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="code-editor" style={{ flex: 1, minHeight: 0, height: "100%", display: "flex", flexDirection: "column", ["--cm-fs" as any]: `${fontSize}px` }}>
      <div ref={host} style={{ flex: 1, minHeight: 0 }} />
      {Object.entries(blocks).map(([id, b]) => createPortal(<React.Fragment key={id}>{decorations?.get(b.line) ?? null}</React.Fragment>, b.el, id))}
    </div>
  );
});
