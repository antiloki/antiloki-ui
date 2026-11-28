// A SPECIALIST'S REPLY IS A VERDICT, NOT A PAYLOAD (2026-09-24). A lens — the TypeScript reviewer, the correctness
// axis, any of the specialists — answers with a JSON object: a summary, cards, the evidence behind them, and what it
// expects to be argued with. The chat was printing that object verbatim, so the centre of the screen was a wall of
// braces and quoted keys. It is the first thing anyone sees, and it made the product look like a debugger.
//
// This renders it as what it is: a headline, then one card per finding with its severity and how sure the lens is,
// then the evidence as chips. The raw object is one click away and nothing is hidden — a verdict you cannot audit is
// worth less than one you can, which is the whole argument of the product.
//
// It is deliberately FORGIVING. A lens that answers with a shape we do not know, or with prose, must fall through to
// the ordinary markdown path rather than render half a card: `parseLens` returns null and the caller does what it
// always did.
import React from "react";

export type LensCard = { type?: string; severity?: string; title?: string; body?: string; confidence?: number };
export type Lens = {
  level?: string; title?: string; headline?: string;
  cards: LensCard[];
  evidence: { kind?: string; id?: string }[];
  actions: unknown[];
  pushback?: string; lesson?: string; theory?: string;
};

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** A lens verdict, or null when the text is not one. Pure — tested. */
export function parseLens(text: string): Lens | null {
  const t = (text ?? "").trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  let o: any;
  try { o = JSON.parse(t); } catch { return null; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const s = o.summary && typeof o.summary === "object" ? o.summary : null;
  const cards = arr(o.cards).filter((c) => c && typeof c === "object");
  // the shape has to be recognisably a lens, or we are guessing: a summary or at least one card
  if (!s && !cards.length) return null;
  return {
    level: str(s?.level), title: str(s?.title), headline: str(s?.headline),
    cards: cards.map((c: any) => ({ type: str(c.type), severity: str(c.severity), title: str(c.title), body: str(c.body),
      confidence: typeof c.confidence === "number" ? c.confidence : undefined })),
    evidence: arr(o.evidence).filter((e) => e && typeof e === "object").map((e: any) => ({ kind: str(e.kind), id: str(e.id) })),
    actions: arr(o.actions),
    pushback: str(o.expected_pushback), lesson: str(o.lesson), theory: str(o.theory),
  };
}
/** how sure it is, as a person reads it. Pure — tested. */
export const confidenceWord = (c?: number): string =>
  c == null ? "" : c >= 0.9 ? "certain" : c >= 0.75 ? "confident" : c >= 0.5 ? "likely" : "a guess";

export function LensReply({ lens, raw, colors }: {
  lens: Lens; raw: string;
  colors: { fg: string; dim: string; muted: string; border: string; panel: string; accent: string; bad: string; warn: string; ok: string; mono: string; font: string };
}) {
  const [showRaw, setShowRaw] = React.useState(false);
  const C = colors;
  const tone = (sev?: string) => (sev === "error" || sev === "critical" ? C.bad : sev === "warn" || sev === "warning" ? C.warn : sev === "risk" ? C.warn : C.ok);
  const label: React.CSSProperties = { fontFamily: C.mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim };
  return (
    <div data-testid="lens-reply" style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
      {(lens.title || lens.headline) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {lens.title && <span style={{ fontFamily: C.font, fontSize: 13.5, fontWeight: 600, color: C.fg, lineHeight: 1.35 }}>{lens.title}</span>}
          {lens.headline && <span style={{ fontFamily: C.font, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{lens.headline}</span>}
        </div>
      )}

      {lens.cards.map((c, i) => (
        <div key={i} data-testid={`lens-card-${i}`} style={{ borderLeft: `2px solid ${tone(c.severity ?? c.type)}`, paddingLeft: 9, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
            {c.title && <span style={{ fontFamily: C.font, fontSize: 12.5, color: C.fg, fontWeight: 600 }}>{c.title}</span>}
            {c.type && <span style={{ ...label, color: tone(c.severity ?? c.type) }}>{c.type}</span>}
            {c.confidence != null && <span style={{ fontFamily: C.mono, fontSize: 9, color: C.dim }}>{confidenceWord(c.confidence)}</span>}
          </span>
          {c.body && <span style={{ fontFamily: C.font, fontSize: 11.5, color: C.muted, lineHeight: 1.55 }}>{c.body}</span>}
        </div>
      ))}

      {lens.evidence.length > 0 && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={label}>on</span>
          {lens.evidence.map((e, i) => (
            <span key={i} style={{ fontFamily: C.mono, fontSize: 9.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, padding: "0 6px" }}>{e.id ?? e.kind}</span>
          ))}
        </div>
      )}

      {lens.pushback && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={label}>what it expects to be argued with</span>
          <span style={{ fontFamily: C.font, fontSize: 11.5, color: C.muted, lineHeight: 1.55 }}>{lens.pushback}</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button data-testid="lens-raw" onClick={() => setShowRaw((v) => !v)}
          title={showRaw ? "back to the verdict" : "the object the lens actually answered with"}
          style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: C.mono, fontSize: 9.5, padding: 0, textDecoration: "underline", textUnderlineOffset: 2 }}>
          {showRaw ? "↩ the verdict" : "↪ raw"}
        </button>
        {lens.actions.length === 0 && <span style={{ fontFamily: C.mono, fontSize: 9, color: C.dim }}>nothing to change</span>}
      </div>
      {showRaw && <pre data-testid="lens-raw-body" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: C.mono, fontSize: 10, color: C.dim, lineHeight: 1.5 }}>{raw}</pre>}
    </div>
  );
}
