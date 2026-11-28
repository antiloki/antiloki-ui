// THE BUILT-IN PROMPTS, TO READ (operator 2026-11-27: "builting prompts should have a window to be seen"). antiloki is open source: what it tells a model is shown, word for word, from the serve's own list. Read only.
import * as React from "react";
import { createPortal } from "react-dom";
import { apiGet } from "@/loki/api/client";
import { C, mono, nav } from "@/loki/theme";

export type Prompt = { base: string; name: string; purpose: string; tier: string; version: string; text: string };
/** The serve's catalog; anything unreadable is null. Pure. */
export function parsePrompts(r: any): Prompt[] | null {
  const d = r?.result ?? r; if (!d || d.ok !== true || !Array.isArray(d.prompts)) return null;
  return d.prompts.filter((p: any) => p && typeof p.base === "string").map((p: any) => ({ base: p.base, name: String(p.name ?? p.base), purpose: String(p.purpose ?? ""), tier: String(p.tier ?? ""), version: String(p.version ?? ""), text: String(p.template_md ?? "") }));
}
const AREAS: Record<string, string> = { agent: "Agents in panes", goal: "Planned runs", front: "Understanding an ask", chat: "Chat", cli: "Background calls", xray: "X-ray", design: "Design review" };
export const areaOf = (base: string): string => AREAS[base.split(".")[0]] ?? "Other";
/** The prompts whose name, purpose or words hold the search. Pure. */
export const found = (all: Prompt[], q: string): Prompt[] => { const s = q.trim().toLowerCase(); return s ? all.filter((p) => `${p.base} ${p.name} ${p.purpose} ${p.text}`.toLowerCase().includes(s)) : all; };

export function PromptsWindow({ onClose }: { onClose: () => void }) {
  const [all, setAll] = React.useState<Prompt[] | null | undefined>(undefined); const [q, setQ] = React.useState(""); const [sel, setSel] = React.useState(""); const [copied, setCopied] = React.useState(false);
  React.useEffect(() => { let on = true; void apiGet("/api/v1/prompts/catalog").catch(() => null).then((r) => { if (on) setAll(parsePrompts(r)); }); return () => { on = false; }; }, []);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const shown = found(all ?? [], q); const cur = shown.find((p) => p.base === sel) ?? shown[0];
  const copy = () => { if (cur) void navigator.clipboard?.writeText(cur.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  const groups = [...new Set(shown.map((p) => areaOf(p.base)))];
  return createPortal(
    <div data-testid="prompts-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 16 }}>
      <div role="dialog" aria-label="built-in prompts" data-testid="prompts-window" style={{ width: "min(1040px, 100%)", height: "min(720px, 100%)", display: "flex", flexDirection: "column", background: `color-mix(in srgb, ${C.panel} 96%, transparent)`, backdropFilter: "blur(16px)", border: `1px solid ${C.border}`, borderRadius: 14, color: C.fg, fontFamily: nav, fontSize: 12.5, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Built-in prompts</div>
          <span style={{ color: C.muted }}>{all ? `${shown.length} of ${all.length}` : ""}</span>
          <span style={{ flex: 1 }} />
          <input data-testid="prompts-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="search the words" aria-label="search the prompts" style={{ width: 240, maxWidth: "40%", background: "color-mix(in srgb, var(--c-fg) 6%, transparent)", border: "none", borderRadius: 8, padding: "6px 10px", color: C.fg, fontFamily: nav, fontSize: 12.5, outline: "none" }} />
          <button data-testid="prompts-close" aria-label="close" onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 15 }}>✕</button>
        </div>
        {all === undefined && <div style={{ padding: 16, color: C.muted }}>reading…</div>}
        {all === null && <div data-testid="prompts-noserve" style={{ padding: 16, color: C.muted }}>The serve did not answer.</div>}
        {all && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", borderTop: `1px solid ${C.border}` }}>
            <nav aria-label="prompts" style={{ width: 270, flex: "none", overflowY: "auto", padding: "6px 8px" }}>
              {shown.length === 0 && <div style={{ padding: 8, color: C.muted }}>nothing matches</div>}
              {groups.map((g) => <div key={g}><div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, textTransform: "uppercase", letterSpacing: ".05em", padding: "10px 8px 4px" }}>{g}</div>
                {shown.filter((p) => areaOf(p.base) === g).map((p) => <button key={p.base} data-testid={`prompt-${p.base}`} aria-current={cur?.base === p.base} onClick={() => setSel(p.base)} style={{ all: "unset", boxSizing: "border-box", display: "block", width: "100%", padding: "5px 8px", borderRadius: 8, cursor: "pointer", background: cur?.base === p.base ? `color-mix(in srgb, ${C.brand} 16%, transparent)` : "transparent" }}>{p.name}</button>)}</div>)}
            </nav>
            {cur && (
              <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderLeft: `1px solid ${C.border}` }}>
                <div style={{ padding: "10px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ lineHeight: 1.5 }}>{cur.purpose}</div><div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 4 }}>{cur.base} · {cur.tier} tier · version {cur.version}</div></div>
                  <button data-testid="prompts-copy" onClick={copy} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 8, padding: "3px 10px", fontFamily: nav, fontSize: 12, cursor: "pointer" }}>{copied ? "copied" : "Copy"}</button>
                </div>
                <pre data-testid="prompts-text" tabIndex={0} style={{ flex: 1, minHeight: 0, overflow: "auto", margin: 0, padding: "4px 16px 16px", fontFamily: mono, fontSize: 11.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", userSelect: "text" }}>{cur.text}</pre>
              </section>)}
          </div>)}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.border}`, color: C.dim, fontSize: 11 }}>These are the registered prompts, word for word; {"{{words in braces}}"} are filled in at run time. A few short instructions written elsewhere in the source are not listed here.</div>
      </div>
    </div>, document.body);
}
