// MentionInput — the composer's text field, as a contentEditable so references render as INLINE chips
// integrated in the sentence (operator 2026-07-25: "inside the text, integrated"), not a row above.
// Typing @ opens an autocomplete of the SELECTED context; # opens the session's widgets/artefacts (each
// a distinct instance). Picking inserts a removable inline chip at the caret. The chip's send-token
// (#tw-<id> (Label) or @Label) is carried in data-token and serialized into the message on send, so the
// AI resolves the exact reference. Enter serializes the live DOM and sends — the message can't be lost.
import React from "react";
import { C, mono, nav } from "@/loki/theme";

type Item = { label: string; refId: string; /** the send-token when it is not the plain `@Label` (agents, specialists: `@agent:<id> (Label)`) */ token?: string; hint?: string };

// ── serialize the editor DOM → the plain message string (text verbatim; chips → their send-token) ──
function serialize(root: HTMLElement | null): string {
  if (!root) return "";
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { out += node.textContent ?? ""; return; }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.dataset && el.dataset.token != null) { out += el.dataset.token; return; } // a chip — emit its token, don't recurse
      if (el.tagName === "BR") { out += "\n"; return; }
      el.childNodes.forEach(walk);
    }
  };
  root.childNodes.forEach(walk);
  return out.replace(/\u00a0/g, " ");
}

// `!` (operator 2026-09-21: "at the input field !episode-number — like @ and # but for episodes I can add to the context")
export type Trigger = "@" | "#" | "!";
// ── the autocomplete dropdown (shared look with the old menu) ──
function Menu({ trigger, items, hi, onPick }: { trigger: Trigger; items: Item[]; hi: number; onPick: (i: Item) => void }) {
  const empty = trigger === "@" ? "no context yet — ⊕ attaches a file; agents and specialists list here once they exist" : trigger === "!" ? "no closed episode yet — the chat's consolidations list here" : "no widgets or artefacts in this session yet";
  return (
    <div onMouseDown={(e) => e.preventDefault()} style={{ position: "absolute", left: 12, right: 12, bottom: "100%", marginBottom: 6, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.3)", zIndex: 30, overflow: "hidden", maxHeight: 240, overflowY: "auto" }}>
      <div style={{ padding: "4px 10px", fontFamily: mono, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", color: C.dim, borderBottom: `1px solid ${C.border}` }}>{trigger === "@" ? "reference a selected context" : trigger === "!" ? "add an episode's consolidation to the context" : "reference a session widget / artefact"}</div>
      {items.length === 0 ? <div style={{ padding: "8px 10px", fontFamily: mono, fontSize: 10, color: C.muted }}>{empty}</div>
        : items.map((it, i) => (
          <button key={it.refId + i} onMouseDown={(e) => { e.preventDefault(); onPick(it); }}
            style={{ display: "flex", width: "100%", textAlign: "left", gap: 8, alignItems: "center", background: i === hi ? C.panel2 : "transparent", border: "none", cursor: "pointer", padding: "6px 10px", color: C.fg, fontFamily: nav, fontSize: 12.5 }}>
            <span style={{ color: trigger === "@" ? C.brand : trigger === "!" ? C.warn : C.ok, fontFamily: mono, fontSize: 11 }}>{trigger}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
            {it.hint && <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 9, color: C.dim, whiteSpace: "nowrap" }}>{it.hint}</span>}
          </button>
        ))}
    </div>
  );
}

export function MentionInput({
  value, onChange, onEnter, placeholder, disabled = false, editorRef, hint, ariaLabel,
  refs, refKey, trayLabel, sessionRefables, atExtras, bangItems,
}: {
  /** a one-line notice shown just above the field (an empty or blocked send says why instead of doing nothing) */
  hint?: string | null;
  /** the field's accessible name; defaults to the placeholder's first sentence */
  ariaLabel?: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: (serialized: string) => void;
  placeholder?: string;
  disabled?: boolean;
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  refs: any[]; refKey: (r: any) => string; trayLabel: (r: any) => string;
  sessionRefables: { refId: string; label: string; hint?: string }[];
  /** more `@` entries beyond the selected context — other agents, specialists (each with its own send-token) */
  atExtras?: Item[];
  /** the `!` menu — the chat's episodes (chats-tab.tsx); absent = no `!` trigger */
  bangItems?: Item[];
}) {
  const [menu, setMenu] = React.useState<{ trigger: Trigger; query: string } | null>(null);
  const [hi, setHi] = React.useState(0);
  const [empty, setEmpty] = React.useState(!value);
  const lastEmit = React.useRef<string>(value ?? "");

  // EXTERNAL sets only (clear on send, dock draft, prefill) rewrite the DOM as plain text — never on our
  // own edits (guarded by lastEmit), so chips + caret survive typing.
  React.useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastEmit.current) return;
    if (serialize(el) === value) { lastEmit.current = value; return; }
    el.textContent = value ?? "";
    lastEmit.current = value ?? "";
    setEmpty(!value);
    setMenu(null);
  }, [value, editorRef]);

  const emit = () => {
    const s = serialize(editorRef.current);
    lastEmit.current = s;
    setEmpty(s.trim() === "");
    onChange(s);
  };

  const items: Item[] = React.useMemo(() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    const src: Item[] = menu.trigger === "@"
      ? [...(refs ?? []).map((r) => ({ label: String(trayLabel(r)), refId: refKey(r) })), ...(atExtras ?? [])]
      : menu.trigger === "!" ? (bangItems ?? [])
      : (sessionRefables ?? []).map((s) => ({ label: s.label, refId: s.refId, hint: s.hint }));
    return src.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 10);
  }, [menu, refs, sessionRefables, atExtras, bangItems, trayLabel, refKey]);

  // detect a mention token immediately before the collapsed caret, within its text node
  const detect = () => {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.rangeCount) { setMenu(null); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setMenu(null); return; }
    const before = (node.textContent ?? "").slice(0, range.startOffset);
    const m = (bangItems ? /(?:^|\s)([@#!])([\w./-]*)$/ : /(?:^|\s)([@#])([\w./-]*)$/).exec(before);
    if (!m) { setMenu(null); return; }
    setMenu({ trigger: m[1] as Trigger, query: m[2] });
    setHi(0);
  };

  const pick = (it: Item) => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !menu || !sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const off = range.startOffset;
    const before = (node.textContent ?? "").slice(0, off);
    const m = /(?:^|\s)([@#!])([\w./-]*)$/.exec(before);
    if (!m) return;
    const tokenLen = m[1].length + m[2].length;          // the "@query" / "#query" just typed
    const start = off - tokenLen;
    // delete the typed token, insert the chip in its place
    const r = document.createRange();
    r.setStart(node, start); r.setEnd(node, off);
    r.deleteContents();
    const chip = buildChip(menu.trigger, it.refId, it.label, it.token);
    r.insertNode(chip);
    const space = document.createTextNode(" ");
    chip.after(space);
    const after = document.createRange();
    after.setStartAfter(space); after.collapse(true);
    sel.removeAllRanges(); sel.addRange(after);
    setMenu(null);
    emit();
    el.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (menu && items.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % items.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + items.length) % items.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(items[hi] ?? items[0]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMenu(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // serialize the LIVE dom (never a stale React value) so the message can't be lost
      const text = serialize(editorRef.current);
      onEnter(text);
    }
  };

  // an inline ✕ inside a chip removes it
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t?.dataset?.x != null) {
      e.preventDefault();
      t.closest("[data-token]")?.remove();
      emit();
      editorRef.current?.focus();
    }
  };

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      {menu && <Menu trigger={menu.trigger} items={items} hi={hi} onPick={pick} />}
      {hint && <div role="status" data-testid="composer-hint" style={{ position: "absolute", left: 0, bottom: "100%", marginBottom: 4, fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: C.warn, pointerEvents: "none" }}>{hint}</div>}
      {/* THE FIELD AND ITS PLACEHOLDER SHARE ONE GRID CELL (operator 2026-10-11: the placeholder leaked out of a narrow input and did not make it taller). The placeholder used to be absolutely positioned, so it had no right edge to wrap
          against and no height the field could grow to. In the same cell the row is as tall as the taller of the two, and the placeholder wraps at the field's width. */}
      <div style={{ display: "grid", minWidth: 0 }}>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel ?? (placeholder ? placeholder.split(/\s{2,}/)[0] : "Message")}
        aria-multiline="false"
        onInput={() => { emit(); detect(); }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) detect(); }}
        onClick={onClick}
        onMouseUp={detect}
        onBlur={() => setTimeout(() => setMenu(null), 120)}
        style={{
          gridArea: "1 / 1", minWidth: 0, minHeight: 20, outline: "none", color: C.fg, fontFamily: "-apple-system, system-ui, sans-serif",
          fontSize: 14, lineHeight: 1.5, padding: "2px 0", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere",
        }}
      />
      {empty && (
        <div data-testid="composer-placeholder" style={{ gridArea: "1 / 1", minWidth: 0, pointerEvents: "none", color: C.muted, fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 14, lineHeight: 1.5, padding: "2px 0", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere" }}>{placeholder}</div>
      )}
      </div>
    </div>
  );
}

// build an inline chip element: [trigger] label [✕], contentEditable=false so it behaves as one unit.
function buildChip(trigger: Trigger, refId: string, label: string, token?: string): HTMLElement {
  const col = trigger === "#" ? C.ok : trigger === "!" ? C.warn : C.brand;
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.token = token ?? (trigger === "#" ? `#${refId} (${label})` : trigger === "!" ? `!${refId} (${label})` : `@${label}`);
  span.style.cssText = `display:inline-flex;align-items:center;gap:4px;vertical-align:baseline;border:1px solid ${col};background:color-mix(in oklab, ${col} 13%, ${C.bg});border-radius:11px;padding:0 5px 0 7px;margin:0 1px;font-family:${mono};font-size:11px;line-height:1.6;`;
  const tr = document.createElement("span"); tr.textContent = trigger; tr.style.color = col;
  const lb = document.createElement("span"); lb.textContent = label; lb.style.color = C.fg;
  const x = document.createElement("span"); x.textContent = "✕"; x.dataset.x = "1"; x.style.cssText = `cursor:pointer;color:${C.muted};font-size:10px;padding-left:1px;`;
  span.append(tr, lb, x);
  return span;
}
