// A LIVE MARKDOWN PAGE, LIKE OBSIDIAN'S (operator 2026-10-11: "at notes the styling through markdown is not working, it should be live like obsidian does on its notes"; before that: "notes should accept md writing and automatically show the preview live,
// like using # already makes it a title").
// One editor, no separate preview: you write markdown and it is drawn as you write. A `# ` makes the line a title the moment it is typed, `**bold**` is bold, `- ` is a bullet, `- [ ]` is a checkbox you can click, `> ` is a quote, a fenced block is
// code. The syntax marks (`#`, `**`, the brackets and address of a link...) are hidden, EXCEPT on the line the cursor is on, where the raw markdown comes back so it can be edited - which is exactly what Obsidian's live preview does.
// The text is plain markdown the whole time: nothing is converted, so what is saved is what was typed.
import * as React from "react";
import { EditorState, StateField, type Extension, type Range } from "@codemirror/state";
import { EditorView, ViewPlugin, Decoration, WidgetType, keymap, placeholder, drawSelection, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxTree, ensureSyntaxTree, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import { tags as t } from "@lezer/highlight";
import { C, nav, mono } from "@/loki/theme";
import { isDarkBackground } from "@/loki/codebase/code-editor";
import { parseTable, tableElement, safeHref } from "./md-table";

// ── widgets ───────────────────────────────────────────────────────────────────────────────────────────────────
class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement("span"); s.className = "cm-md-bullet"; s.textContent = "•"; return s; }
}
class RuleWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement("span"); s.className = "cm-md-rule"; return s; }
}
/** A TABLE DRAWN AS A TABLE (operator 2026-11-18): while the cursor is outside it; a click puts the cursor in it, and the raw rows come back to edit. */
class TableWidget extends WidgetType {
  constructor(readonly src: string) { super(); }
  eq(o: TableWidget) { return o.src === this.src; }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div"); wrap.className = "cm-md-table-wrap"; const t = parseTable(this.src); if (t) wrap.appendChild(tableElement(document, t));
    wrap.addEventListener("mousedown", (e) => { if ((e.target as HTMLElement).closest("a")) return; e.preventDefault(); const pos = view.posAtDOM(wrap); view.dispatch({ selection: { anchor: pos } }); view.focus(); });
    return wrap;
  }
  ignoreEvent() { return true; }
}
/** An image `![alt](address)` drawn as the picture while the cursor is off its line. Only http(s), data and relative addresses are drawn. */
class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  eq(o: ImageWidget) { return o.src === this.src && o.alt === this.alt; }
  toDOM() { const i = document.createElement("img"); i.className = "cm-md-img"; i.alt = this.alt; i.loading = "lazy"; if (/^(https?:|data:image\/|\/)/i.test(this.src)) i.src = this.src; return i; }
}
/** a task's `[ ]` / `[x]` drawn as a checkbox; clicking it rewrites the marker in the text */
class CheckWidget extends WidgetType {
  constructor(readonly checked: boolean) { super(); }
  eq(o: CheckWidget) { return o.checked === this.checked; }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox"; box.checked = this.checked; box.className = "cm-md-check"; box.setAttribute("aria-label", this.checked ? "done" : "to do");
    box.addEventListener("mousedown", (e) => e.preventDefault());   // a click on it does not move the cursor into the line
    box.addEventListener("click", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      const mark = view.state.doc.sliceString(pos, pos + 3);
      if (/^\[[ xX]\]$/.test(mark)) view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: /x/i.test(mark[1]) ? " " : "x" } });
    });
    return box;
  }
  ignoreEvent() { return true; }
}

// ── the decorations (the whole of the live preview) ───────────────────────────────────────────────────────────
const HIDE = Decoration.replace({});
const dim = Decoration.mark({ class: "cm-md-mark" });
const lineDeco = (cls: string) => Decoration.line({ class: cls });

/** The lines (1-based) the selection touches: the raw markdown is shown on these and only these. Pure. */
export function activeLines(state: EditorState): Set<number> {
  const out = new Set<number>();
  for (const r of state.selection.ranges) { const a = state.doc.lineAt(r.from).number, b = state.doc.lineAt(r.to).number; for (let i = a; i <= b; i++) out.add(i); }
  return out;
}

/** Everything the page draws over the markdown text, for the given state: styled lines and spans, the hidden syntax marks (not on the active lines) and the widgets. Pure over the state - tested. */
export function liveDecorations(state: EditorState, ranges?: ReadonlyArray<{ from: number; to: number }>): DecorationSet {
  const out: Range<Decoration>[] = [];
  const doc = state.doc, active = activeLines(state);
  const tree = ensureSyntaxTree(state, doc.length, 100) ?? syntaxTree(state);
  const onActive = (from: number, to: number) => { for (let i = doc.lineAt(from).number, e = doc.lineAt(Math.min(to, doc.length)).number; i <= e; i++) if (active.has(i)) return true; return false; };
  const eachLine = (from: number, to: number, cls: string) => { for (let i = doc.lineAt(from).number, e = doc.lineAt(Math.min(to, doc.length)).number; i <= e; i++) out.push(lineDeco(cls).range(doc.line(i).from)); };
  const mark = (cls: string, from: number, to: number) => { if (to > from) out.push(Decoration.mark({ class: cls }).range(from, to)); };
  const hideOrDim = (from: number, to: number, shown: boolean) => { if (to > from) out.push((shown ? dim : HIDE).range(from, to)); };

  for (const r of ranges ?? [{ from: 0, to: doc.length }]) {
    tree.iterate({
      from: r.from, to: r.to,
      enter: (n) => {
        const { name, from, to } = n;
        let m: RegExpExecArray | null;
        if ((m = /^ATXHeading([1-6])$/.exec(name))) {
          eachLine(from, from, `cm-md-h${m[1]}`);
          const hm = n.node.getChild("HeaderMark");
          if (hm) { const line = doc.lineAt(hm.from); hideOrDim(hm.from, Math.min(line.to, hm.to + 1), onActive(from, to)); }   // the `#`s and the space after them
        } else if ((m = /^SetextHeading([12])$/.exec(name))) {
          eachLine(from, from, `cm-md-h${m[1]}`);
          for (const hm of n.node.getChildren("HeaderMark")) out.push(dim.range(hm.from, hm.to));
        } else if (name === "StrongEmphasis" || name === "Emphasis" || name === "Strikethrough") {
          mark(name === "StrongEmphasis" ? "cm-md-strong" : name === "Emphasis" ? "cm-md-em" : "cm-md-strike", from, to);
          const shown = onActive(from, to);
          for (const c of [...n.node.getChildren("EmphasisMark"), ...n.node.getChildren("StrikethroughMark")]) hideOrDim(c.from, c.to, shown);
        } else if (name === "InlineCode") {
          mark("cm-md-icode", from, to);
          const shown = onActive(from, to);
          for (const c of n.node.getChildren("CodeMark")) hideOrDim(c.from, c.to, shown);
        } else if (name === "Link") {
          const marks = n.node.getChildren("LinkMark"), url = n.node.getChild("URL");
          if (marks.length === 4 && url) {   // [text](address): the text is the link, the rest is syntax
            mark("cm-md-link", marks[0].to, marks[1].from);
            const shown = onActive(from, to);
            hideOrDim(marks[0].from, marks[0].to, shown); hideOrDim(marks[1].from, to, shown);
          } else mark("cm-md-link", from, to);
        } else if (name === "Blockquote") {
          eachLine(from, to, "cm-md-quote");
          const shown = (qFrom: number) => onActive(qFrom, qFrom);
          for (const q of n.node.getChildren("QuoteMark")) { const line = doc.lineAt(q.from); hideOrDim(q.from, Math.min(line.to, q.to + 1), shown(q.from)); }
        } else if (name === "FencedCode") {
          eachLine(from, to, "cm-md-fence");
          const first = doc.lineAt(from).number, last = doc.lineAt(to).number;
          out.push(lineDeco("cm-md-fence-edge").range(doc.line(first).from)); if (last !== first) out.push(lineDeco("cm-md-fence-edge").range(doc.line(last).from));
          for (const c of [...n.node.getChildren("CodeMark"), ...n.node.getChildren("CodeInfo")]) out.push(dim.range(c.from, c.to));
        } else if (name === "Table") {
          eachLine(from, to, "cm-md-tablesrc");   // the raw rows, in a steady font, while the cursor is in the table (outside it the table is drawn: see tableField)
        } else if (name === "Image") {
          const url = n.node.getChild("URL"); const marks = n.node.getChildren("LinkMark");
          if (url && marks.length >= 2 && !onActive(from, to)) out.push(Decoration.replace({ widget: new ImageWidget(doc.sliceString(url.from, url.to), doc.sliceString(marks[0].to, marks[1].from)) }).range(from, to));
          else out.push(dim.range(from, to));
          return false;
        } else if (name === "URL" && n.node.parent && !["Link", "Image"].includes(n.node.parent.name)) {
          if (safeHref(doc.sliceString(from, to))) mark("cm-md-link", from, to);
        } else if (name === "CodeBlock") {
          eachLine(from, to, "cm-md-fence");
        } else if (name === "HorizontalRule") {
          if (onActive(from, to)) out.push(dim.range(from, to)); else out.push(Decoration.replace({ widget: new RuleWidget() }).range(from, to));
        } else if (name === "ListMark") {
          const parent = n.node.parent?.parent?.name;   // ListMark -> ListItem -> BulletList / OrderedList
          const isTask = !!n.node.parent?.getChild("Task")?.getChild("TaskMarker");
          if (isTask) hideOrDim(from, Math.min(doc.lineAt(from).to, to + 1), onActive(from, to));   // a task shows its checkbox, not a bullet as well
          else if (parent === "BulletList") { if (onActive(from, to)) out.push(dim.range(from, to)); else out.push(Decoration.replace({ widget: new BulletWidget() }).range(from, to)); }
          else mark("cm-md-listnum", from, to);
        } else if (name === "TaskMarker") {
          const checked = /x/i.test(doc.sliceString(from, to));
          out.push(Decoration.replace({ widget: new CheckWidget(checked) }).range(from, to));
          if (checked) { const task = n.node.parent; if (task) mark("cm-md-done", to, task.to); }
        }
      },
    });
  }
  return Decoration.set(out, true);
}

/** The tables outside the cursor, drawn as tables. A block replacement may only come from a state field, not from the plugin. Pure over the state. */
export function tableDecorations(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = []; const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state);
  tree.iterate({ enter: (n) => {
    if (n.name !== "Table") return;
    const inside = state.selection.ranges.some((r) => r.to >= n.from && r.from <= n.to);
    if (!inside) { const src = state.sliceDoc(n.from, n.to); if (parseTable(src)) out.push(Decoration.replace({ widget: new TableWidget(src), block: true }).range(n.from, n.to)); }
    return false;
  } });
  return Decoration.set(out, true);
}
const tableField = StateField.define<DecorationSet>({
  create: (state) => tableDecorations(state),
  update: (v, tr) => (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? tableDecorations(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f),
});

const plugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = liveDecorations(view.state, view.visibleRanges); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = liveDecorations(u.state, u.view.visibleRanges);
  }
}, {
  decorations: (v) => v.decorations,
  // the cursor steps over a hidden mark instead of stopping inside it
  provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
});

// ── look ──────────────────────────────────────────────────────────────────────────────────────────────────────
const HUE = { comment: "oklch(0.55 0.02 150)", string: "oklch(0.78 0.12 52)", keyword: "oklch(0.74 0.14 292)", number: "oklch(0.80 0.10 40)", fn: "oklch(0.86 0.12 95)", type: "oklch(0.76 0.12 200)" };
// only the code inside a fenced block is coloured; the markdown's own structure is drawn by the decorations above
const codeColours = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: HUE.comment, fontStyle: "italic" },
  { tag: [t.string, t.regexp], color: HUE.string }, { tag: [t.keyword, t.modifier, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: HUE.keyword },
  { tag: [t.number, t.bool, t.null], color: HUE.number }, { tag: [t.function(t.variableName), t.function(t.propertyName)], color: HUE.fn }, { tag: [t.typeName, t.className], color: HUE.type },
]);
const theme = (dark: boolean): Extension => EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: C.fg, fontSize: "14.5px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: nav, lineHeight: "1.75", overflow: "auto" },
  ".cm-content": { caretColor: C.brand, padding: "14px 18px 40px", maxWidth: "820px" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: C.brand },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": { background: `color-mix(in oklab, ${C.brand} 28%, transparent)` },
  ".cm-placeholder": { color: C.dim, fontStyle: "normal" },
  ".cm-md-h1": { fontSize: "1.9em", fontWeight: 700, lineHeight: 1.3, paddingTop: ".35em" },
  ".cm-md-h2": { fontSize: "1.55em", fontWeight: 700, lineHeight: 1.3, paddingTop: ".3em" },
  ".cm-md-h3": { fontSize: "1.3em", fontWeight: 650, lineHeight: 1.35, paddingTop: ".25em" },
  ".cm-md-h4": { fontSize: "1.12em", fontWeight: 650, paddingTop: ".2em" },
  ".cm-md-h5, .cm-md-h6": { fontSize: "1em", fontWeight: 650, color: C.muted },
  ".cm-md-strong": { fontWeight: 700 },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-strike": { textDecoration: "line-through", color: C.muted },
  ".cm-md-icode": { fontFamily: mono, fontSize: ".9em", backgroundColor: C.panel2, borderRadius: "4px", padding: "1px 4px" },
  ".cm-md-link": { color: C.brand, textDecoration: "underline", textUnderlineOffset: "2px" },
  ".cm-md-mark": { color: C.dim, fontWeight: 400, fontStyle: "normal" },
  ".cm-md-quote": { borderLeft: `3px solid color-mix(in oklab, ${C.brand} 55%, transparent)`, paddingLeft: "12px", color: C.muted, fontStyle: "italic" },
  ".cm-md-fence": { fontFamily: mono, fontSize: ".9em", backgroundColor: C.panel, paddingLeft: "10px" },
  ".cm-md-fence-edge": { color: C.dim },
  ".cm-md-bullet": { color: C.brand, display: "inline-block", width: "1.1em", textAlign: "center" },
  ".cm-md-listnum": { color: C.brand },
  ".cm-md-check": { accentColor: C.brand, margin: "0 6px 0 0", verticalAlign: "-1px", cursor: "pointer" },
  ".cm-md-done": { textDecoration: "line-through", color: C.dim },
  ".cm-md-tablesrc": { fontFamily: mono, fontSize: ".88em", color: C.muted },
  ".cm-md-table-wrap": { overflowX: "auto", margin: ".4em 0", cursor: "text" },
  ".cm-md-table": { borderCollapse: "collapse", fontSize: ".95em", minWidth: "40%" },
  ".cm-md-table th, .cm-md-table td": { border: `1px solid ${C.border}`, padding: "5px 12px", verticalAlign: "top" },
  ".cm-md-table th": { background: C.panel2, fontWeight: 650, textAlign: "left" },
  ".cm-md-table tr:nth-child(even) td": { background: `color-mix(in oklab, ${C.panel} 60%, transparent)` },
  ".cm-md-table a": { color: C.brand, textDecoration: "underline", textUnderlineOffset: "2px" },
  ".cm-md-table code": { fontFamily: mono, fontSize: ".9em", backgroundColor: C.panel2, borderRadius: "4px", padding: "1px 4px" },
  ".cm-md-img": { maxWidth: "100%", maxHeight: "420px", borderRadius: "6px", verticalAlign: "middle" },
  ".cm-md-rule": { display: "inline-block", width: "100%", borderTop: `1px solid ${C.border}`, verticalAlign: "middle" },
}, { dark });

// ── the component ─────────────────────────────────────────────────────────────────────────────────────────────
export type LiveMarkdownHandle = { getText: () => string; setText: (text: string) => void; /** put the caret in the page, so the person can just write */ focus: () => void; /** take the caret out of the page */ blur: () => void };
export const LiveMarkdown = React.forwardRef<LiveMarkdownHandle, { initial: string; placeholderText?: string; onChange?: (text: string) => void; onBlur?: () => void; testId?: string }>(function LiveMarkdown(props, ref) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const view = React.useRef<EditorView | null>(null);
  const latest = React.useRef(props); latest.current = props;
  React.useImperativeHandle(ref, () => ({
    getText: () => view.current?.state.doc.toString() ?? "",
    setText: (text) => { const v = view.current; if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } }); },
    focus: () => { view.current?.focus(); },
    blur: () => { view.current?.contentDOM.blur(); },
  }), []);
  React.useEffect(() => {
    if (!host.current) return;
    const dark = isDarkBackground(getComputedStyle(document.documentElement).getPropertyValue("--c-bg"));
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: latest.current.initial,
        extensions: [
          history(), drawSelection(), EditorView.lineWrapping,
          markdown({ base: markdownLanguage, extensions: [GFM], codeLanguages: languages }),
          syntaxHighlighting(codeColours), plugin, tableField,
          keymap.of([...historyKeymap, ...defaultKeymap, indentWithTab]),
          placeholder(latest.current.placeholderText ?? ""), theme(dark),
          EditorView.contentAttributes.of({ "aria-label": "note", "aria-multiline": "true" }),
          EditorView.updateListener.of((u) => { if (u.docChanged) latest.current.onChange?.(u.state.doc.toString()); }),
          EditorView.domEventHandlers({ blur: () => { latest.current.onBlur?.(); return false; } }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
  }, []);
  return <div ref={host} data-testid={props.testId ?? "live-markdown"} style={{ flex: 1, minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }} />;
});
