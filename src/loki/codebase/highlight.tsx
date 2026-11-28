// A small dependency-free syntax highlighter for the atlas code preview / modal — a VSCode-dark
// flavour. Not a full grammar: a per-line tokenizer (with block-comment + backtick-template carry)
// over a universal keyword set + string/number/comment/call/type rules. Good enough for an IDE
// look across JS/TS/Python/Go/Rust/… without pulling in Shiki/Prism.
import React from "react";
import { C, mono } from "@/loki/theme";

const HUE = {
  comment: "oklch(0.55 0.02 150)",
  string: "oklch(0.78 0.12 52)",
  keyword: "oklch(0.74 0.14 292)",
  number: "oklch(0.80 0.10 40)",
  fn: "oklch(0.86 0.12 95)",
  type: "oklch(0.76 0.12 200)",
  punct: "oklch(0.62 0.015 250)",
};
const KW = new Set(
  ("const let var function return if else for while do switch case break continue new class extends " +
   "implements interface type enum import export from default async await yield try catch finally throw " +
   "typeof instanceof in of void delete this super static public private protected readonly get set null " +
   "undefined true false def lambda elif except with as pass raise package func go defer chan struct fn " +
   "impl pub use mod match where self None True False and or not is print render namespace using " +
   // 2026-09-11: the engine now walks kotlin/swift/scala/ruby/php/lua/elixir/bash too — keywords
   // that read as plain text made a Kotlin file look unhighlighted next to a TypeScript one.
   "fun val when object companion data sealed override open internal guard protocol extension func " +
   "trait sealed given then elseif end local nil require module unless until begin rescue ensure " +
   "defmodule defp defmacro alias fi esac done esac elif abstract virtual sizeof template typename " +
   "unsigned signed int float double char bool string long short auto goto register volatile extern").split(" "),
);

// Tokenize one line given carry state {block, tpl}. Returns {out:[{text,hue}], st}.
function tokenize(line: string, st: any) {
  const out: Array<{ text: string; hue?: string }> = [];
  let i = 0;
  const push = (text: string, hue?: string) => { if (text) out.push({ text, hue }); };

  if (st.block) {
    const end = line.indexOf("*/");
    if (end === -1) { push(line, HUE.comment); return { out, st }; }
    push(line.slice(0, end + 2), HUE.comment); i = end + 2; st = { ...st, block: false };
  }
  if (st.tpl) {
    let j = 0; while (j < line.length && line[j] !== "`") { if (line[j] === "\\") j++; j++; }
    if (j >= line.length) { push(line, HUE.string); return { out, st }; }
    push(line.slice(0, j + 1), HUE.string); i = j + 1; st = { ...st, tpl: false };
  }

  while (i < line.length) {
    const rest = line.slice(i);
    if (rest.startsWith("/*")) { const e = rest.indexOf("*/"); if (e === -1) { push(rest, HUE.comment); st = { ...st, block: true }; break; } push(rest.slice(0, e + 2), HUE.comment); i += e + 2; continue; }
    if (rest.startsWith("//") || rest[0] === "#") { push(rest, HUE.comment); break; }
    const ch = rest[0];
    if (ch === '"' || ch === "'") {
      let j = 1; while (j < rest.length && rest[j] !== ch) { if (rest[j] === "\\") j++; j++; }
      push(rest.slice(0, j + 1), HUE.string); i += j + 1; continue;
    }
    if (ch === "`") {
      let j = 1; while (j < rest.length && rest[j] !== "`") { if (rest[j] === "\\") j++; j++; }
      if (j >= rest.length) { push(rest, HUE.string); st = { ...st, tpl: true }; break; }
      push(rest.slice(0, j + 1), HUE.string); i += j + 1; continue;
    }
    const num = rest.match(/^\d[\d_.eExXa-fA-F]*/);
    if (num) { push(num[0], HUE.number); i += num[0].length; continue; }
    const id = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (id) {
      const w = id[0];
      let hue;
      if (KW.has(w)) hue = HUE.keyword;
      else if (/^\s*\(/.test(rest.slice(w.length))) hue = HUE.fn;
      else if (/^[A-Z]/.test(w)) hue = HUE.type;
      else hue = C.fg;
      push(w, hue); i += w.length; continue;
    }
    const p = rest.match(/^[^\w$"'`]+/);
    if (p) { push(p[0], HUE.punct); i += p[0].length; continue; }
    push(rest[0], C.fg); i++;
  }
  return { out, st };
}

// Light primitives for OTHER surfaces (the constitution paper's listings and
// classroom figures): IDE colors without the Highlighted chrome.
export function TokLine({ text }: { text: string }) {
  const r = tokenize(String(text ?? ""), { block: false, tpl: false });
  return <>{r.out.map((t, j) => <span key={j} style={{ color: t.hue ?? C.fg }}>{t.text}</span>)}</>;
}
export function TokCode({ code }: { code: string }) {
  const lines = String(code ?? "").split("\n");
  let st = { block: false, tpl: false };
  return (
    <>
      {lines.map((ln, i) => { const r = tokenize(ln, st); st = r.st; return (
        <div key={i} style={{ whiteSpace: "pre" }}>{r.out.length ? r.out.map((t, j) => <span key={j} style={{ color: t.hue ?? C.fg }}>{t.text}</span>) : " "}</div>
      ); })}
    </>
  );
}

// One-time CSS for the line-blink pulse (keyframes can't be inline). Idempotent + SSR-safe.
let _blinkCssDone = false;
function ensureBlinkCss() {
  if (_blinkCssDone || typeof document === "undefined") return;
  _blinkCssDone = true;
  const s = document.createElement("style");
  s.textContent = "@keyframes loki-line-blink{0%,100%{background:transparent}20%,60%{background:oklch(0.64 0.11 38 / 0.5)}40%,80%{background:transparent}}";
  document.head.appendChild(s);
}

// Render highlighted code with line numbers. `lineNumW`/`fontSize`/`lineHeight` differ for the
// compact preview vs the fullscreen modal. `blink` (0-based line + a nonce) scrolls that line into
// view and pulses it — used when a diagram block node is clicked (the node ↔ its source line).
export function Highlighted({ code, fontSize = 10.5, lineHeight = 1.45, lineNumW = 34, pad = 10, selectable = false, sel = null, onLineDown, blink = null, decorations = null, changedLines = null, heatLines = null }: {
  code: string; fontSize?: number; lineHeight?: number; lineNumW?: number; pad?: number;
  selectable?: boolean; sel?: { a: number; b: number } | null; onLineDown?: (i: number, shift: boolean) => void;
  blink?: { line: number; nonce: number } | null;
  decorations?: Map<number, React.ReactNode> | null; // 0-based line → a virtual node rendered ABOVE that line
  changedLines?: Set<number> | null; // 0-based lines that are NEW/changed → tinted (PR review full-file view)
  heatLines?: Map<number, string> | null; // 0-based line → background colour (the coverage executed-line heatmap)
}) {
  const lines = code.split("\n");
  let st = { block: false, tpl: false };
  const rows = lines.map((ln) => { const r = tokenize(ln, st); st = r.st; return r.out; });
  const lo = sel ? Math.min(sel.a, sel.b) : -1, hi = sel ? Math.max(sel.a, sel.b) : -1;
  const blinkIdx = blink ? blink.line : -1;
  const blinkRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { ensureBlinkCss(); }, []);
  // re-scroll on every nonce (so re-clicking the same node re-centers + re-pulses)
  React.useEffect(() => { if (blink && blinkRef.current) blinkRef.current.scrollIntoView({ block: "center", behavior: "smooth" }); }, [blink?.nonce]);
  return (
    <>
      {rows.map((spans, i) => {
        const inSel = i >= lo && i <= hi;
        const isBlink = i === blinkIdx;
        const deco = decorations?.get(i) ?? null;
        const lineEl = (
          // keying the blink line by nonce remounts it → the CSS pulse replays on every click
          <div key={isBlink ? `${i}:${blink!.nonce}` : i} ref={isBlink ? blinkRef : undefined}
            onMouseDown={selectable && onLineDown ? (e) => { e.preventDefault(); onLineDown(i, e.shiftKey); } : undefined}
            style={{ display: "flex", fontSize, lineHeight, cursor: selectable ? "pointer" : undefined, background: inSel ? `color-mix(in oklab, ${C.brand} 30%, transparent)` : (heatLines?.get(i) ?? (changedLines && changedLines.has(i) ? `color-mix(in oklab, ${C.ok} 13%, transparent)` : undefined)), animation: isBlink ? "loki-line-blink 1.1s ease" : undefined }}>
            <span style={{ width: lineNumW, textAlign: "right", paddingRight: 8, color: changedLines && changedLines.has(i) ? C.ok : inSel ? C.brand : C.muted, userSelect: "none", flexShrink: 0 }}>{i + 1}</span>
            <code style={{ whiteSpace: "pre", paddingRight: pad }}>
              {spans.length ? spans.map((s, j) => <span key={j} style={{ color: s.hue }}>{s.text}</span>) : " "}
            </code>
          </div>
        );
        return deco ? <React.Fragment key={"f" + i}>{deco}{lineEl}</React.Fragment> : lineEl;
      })}
    </>
  );
}

// Shared editor key handling: tab = 2 spaces, auto-close brackets/quotes, skip over a closer, backspace
// removes an empty pair, Enter inside a brace pair expands to an indented block. Reused by CodeEditor AND
// the playground's JSON fixture/expected fields (so typing `"` gives `""` — double-quote JSON made easy).
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
const CLOSERS = new Set([")", "]", "}", '"', "'", "`"]);
export function autoEditKeydown(e: React.KeyboardEvent<HTMLTextAreaElement>, value: string, onChange: (v: string) => void) {
  const ta = e.currentTarget, s = ta.selectionStart, en = ta.selectionEnd, v = value;
  const caret = (a: number, b = a) => requestAnimationFrame(() => { try { ta.selectionStart = a; ta.selectionEnd = b; } catch { /* unmounted */ } });
  if (e.key === "Tab") { e.preventDefault(); onChange(v.slice(0, s) + "  " + v.slice(en)); caret(s + 2); return; }
  if (s === en && CLOSERS.has(e.key) && v[s] === e.key) { e.preventDefault(); caret(s + 1); return; } // step over a closer
  const close = PAIRS[e.key];
  if (close) { e.preventDefault(); const sel = v.slice(s, en); onChange(v.slice(0, s) + e.key + sel + close + v.slice(en)); sel ? caret(s + 1, en + 1) : caret(s + 1); return; }
  if (e.key === "Backspace" && s === en && s > 0 && PAIRS[v[s - 1]] === v[s]) { e.preventDefault(); onChange(v.slice(0, s - 1) + v.slice(s + 1)); caret(s - 1); return; }
  if (e.key === "Enter" && s === en && s > 0 && "{[(".includes(v[s - 1]) && PAIRS[v[s - 1]] === v[s]) {
    e.preventDefault();
    const indent = (v.slice(v.lastIndexOf("\n", s - 1) + 1, s).match(/^\s*/) || [""])[0];
    onChange(v.slice(0, s) + "\n" + indent + "  " + "\n" + indent + v.slice(s));
    caret(s + 1 + indent.length + 2);
  }
}

// CodeEditor — an editable, syntax-highlighted code box with line numbers (the IDE feel) WITHOUT a heavy
// editor dependency: a transparent <textarea> (the real input + caret + selection) overlaid pixel-for-pixel
// on a <Highlighted> render (the colors + gutter). Scroll is synced. Same font metrics keep them aligned.
export function CodeEditor({ value, onChange, fontSize = 12, lineHeight = 1.5, lineNumW = 44, pad = 12, minHeight = 180 }: {
  value: string; onChange: (v: string) => void; fontSize?: number; lineHeight?: number; lineNumW?: number; pad?: number; minHeight?: number;
}) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const hlRef = React.useRef<HTMLDivElement | null>(null);
  const sync = () => { if (taRef.current && hlRef.current) { hlRef.current.scrollTop = taRef.current.scrollTop; hlRef.current.scrollLeft = taRef.current.scrollLeft; } };
  return (
    <div style={{ position: "relative", flex: 1, minHeight, overflow: "hidden", background: C.bg, fontFamily: mono }}>
      <div ref={hlRef} aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <Highlighted code={value || " "} fontSize={fontSize} lineHeight={lineHeight} lineNumW={lineNumW} pad={pad} />
      </div>
      <textarea ref={taRef} value={value} onChange={(e) => onChange(e.target.value)} onScroll={sync} onKeyDown={(e) => autoEditKeydown(e, value, onChange)} spellCheck={false} wrap="off"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", fontFamily: mono, fontSize, lineHeight, color: "transparent", caretColor: C.fg, background: "transparent", border: "none", outline: "none", resize: "none", whiteSpace: "pre", overflow: "auto", paddingLeft: lineNumW + 8, paddingRight: pad, paddingTop: 0, paddingBottom: 0, margin: 0, boxSizing: "border-box" }} />
    </div>
  );
}
