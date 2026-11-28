// OffersWidget — the RESPONSE ACTION ROW under each reply. Trimmed 2026-07-26 (operator: "take out
// Add to notebook, propose and diagram this"): ✂ Simplify · ⤢ Expand · ⧉ Copy stay, plus the
// remaining ⊞ SUGGESTION buttons (code/improvements/logic) which open the Studio with that
// generator SELECTED — a suggestion never generates by itself. A Studio result pastes back inline.
import React from "react";
import type { WidgetProps } from "./types";
import { C, mono } from "@/loki/theme";
import { ImprovementsWidget, MemorySearchWidget, CodeSampleWidget, DiagramWidget, ArtifactWidget } from "./view-widgets";
import { widgetSave } from "@/loki/api/codebase";
import { StudioOverlay, type StudioPreselect } from "./studio-overlay";

// kind → component for a Studio result that's a widget. `code` is the producer's raw kind → CodeSampleWidget.
const RENDER: Record<string, any> = { code: CodeSampleWidget, diagram: DiagramWidget, improvements: ImprovementsWidget, "memory-search": MemorySearchWidget };
// offer kind → Studio generator key. Only studio-generable offers render as suggestions.
// "diagram this" was removed from the row (operator 2026-07-26) — diagram offers no longer render.
const OFFER_TO_STUDIO: Record<string, string> = { code: "code", improvements: "improvements", "logic-spec": "logic" };
const LINKBTN = { fontFamily: mono, fontSize: 10, padding: "2px 0", border: "none", background: "transparent", color: C.muted, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 };

export function OffersWidget({ payload, ctx }: WidgetProps) {
  const conv = payload?.context ?? null;        // { request, response } — grounds the Studio + Propose
  const [active, setActive] = React.useState<any>(null);   // a Studio result: { type:'widget', kind, payload } | { type:'artifact', item }
  const [saved, setSaved] = React.useState<string | null>(null);
  const [wizard, setWizard] = React.useState<{ open: boolean; preselect: StudioPreselect }>({ open: false, preselect: null });

  // the persisted deterministic offers → ⊞ suggestion buttons (dedup by studio generator). Each
  // carries an intent prefill for the Studio's intent box (the question that produced the offer).
  const suggestions = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { studioKind: string; label: string; paths?: string[]; intent?: string }[] = [];
    for (const o of Array.isArray(payload?.offers) ? payload.offers : []) {
      const studioKind = OFFER_TO_STUDIO[o?.kind];
      if (!studioKind || seen.has(studioKind)) continue;
      seen.add(studioKind);
      out.push({
        studioKind,
        label: String(o.label ?? o.kind),
        paths: o?.args?.path ? [String(o.args.path)] : undefined,
        intent: typeof o?.args?.query === "string" && o.args.query.trim() ? o.args.query.trim() : undefined,
      });
    }
    return out;
  }, [payload?.offers]);

  // ⧉ Copy — the reply as currently shown (rewrite-aware via ctx.shownReply).
  const [copied, setCopied] = React.useState(false);
  const copyReply = async () => {
    const text = ctx?.shownReply ?? conv?.response ?? "";
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { /* clipboard unavailable (permissions/http) — nothing sane to do */ }
  };

  // save a rendered widget result into a notebook (the artifact⇄widget bridge).
  const save = async () => {
    if (!active?.kind || saved) return;
    try {
      const r: any = await widgetSave({ kind: active.kind, payload: active.payload, scope: { kind: "conversation" }, request: conv?.request });
      const slug = r?.notebook_slug ?? r?.result?.notebook_slug;
      if (slug) setSaved(slug);
    } catch { /* no-op */ }
  };

  const turnId = ctx?.turnId;
  const busyOp = (op: "simplify" | "expand") => ctx?.rewriteBusy === `${turnId}:${op}`;
  const rewriteDisabled = !!ctx?.rewriteBusy || !ctx?.onRewrite || turnId == null || !conv?.response;
  const rwBtn = (op: "simplify" | "expand", glyph: string, label: string) => (
    <button
      onClick={() => { if (!rewriteDisabled && turnId != null) ctx.onRewrite!(turnId, op); }}
      disabled={rewriteDisabled}
      title={`${label} this reply in place (↩ original stays available)`}
      style={{ ...LINKBTN, cursor: rewriteDisabled ? "wait" : "pointer", opacity: rewriteDisabled && !busyOp(op) ? 0.6 : 1 } as any}
    >{busyOp(op) ? `${glyph} ${label.toLowerCase()}ing…` : `${glyph} ${label}`}</button>
  );

  const ActiveComp = active && active.kind && active.type !== "artifact" ? RENDER[active.kind] : null;
  return (
    <div style={{ marginTop: 8 }}>
      {/* the result a Studio generation pasted back into the chat */}
      {active?.type === "artifact" ? (
        <ArtifactWidget payload={{ item: active.item }} ctx={ctx} />
      ) : ActiveComp ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => void save()} disabled={!!saved} title="save this widget into a notebook — it becomes a persistent, re-scopeable artifact"
              style={{ fontFamily: mono, fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: saved ? "default" : "pointer", border: `1px solid ${saved ? C.border : C.brand}`, background: "transparent", color: saved ? C.muted : C.brand }}>
              {saved ? `✓ saved → ${saved}` : "⊞ save to notebook"}
            </button>
          </div>
          <ActiveComp payload={active.payload} ctx={ctx} />
        </div>
      ) : null}
      {/* the response action row */}
      <div style={{ marginTop: 8, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {rwBtn("simplify", "✂", "Simplify")}
        {rwBtn("expand", "⤢", "Expand")}
        <button
          onClick={() => void copyReply()}
          disabled={!(ctx?.shownReply ?? conv?.response)}
          title="copy this reply (as shown) to the clipboard"
          style={LINKBTN as any}
        >{copied ? "✓ copied" : "⧉ Copy"}</button>
        {suggestions.map((s) => (
          <button
            key={s.studioKind}
            onClick={() => setWizard({ open: true, preselect: { type: "widget", kind: s.studioKind, paths: s.paths, intent: s.intent } })}
            title={`open the Studio with "${s.label}" selected — set the context + intent, then Generate`}
            style={{ ...LINKBTN, color: C.brand } as any}
          >⊞ {s.label}</button>
        ))}
      </div>
      {wizard.open && <StudioOverlay conv={conv} preselect={wizard.preselect} onClose={() => setWizard({ open: false, preselect: null })} onResult={(r: any) => {
        setWizard({ open: false, preselect: null });
        // persist onto the turn (chat-history durability) — the thread refetches and re-renders it;
        // only when persistence is unavailable does the old ephemeral inline display kick in.
        void (async () => {
          const persisted = ctx?.turnId != null && await ctx.onPersistStudioResult?.(ctx.turnId, r);
          if (!persisted) { setSaved(null); setActive({ ...r, srcKind: "studio" }); }
        })();
      }} />}
    </div>
  );
}
