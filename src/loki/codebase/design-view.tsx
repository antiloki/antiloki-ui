// Design — FEAT-DESIGN-SYSTEM P3. The self-generated style guide, harvested from the REAL UI.
// THREE TABS (operator 2026-09-18: "design is messy — merge System + Palette, drop the AI guide, fold
// Consistency in, no Snapshots tab, Components auto-detected"):
//   System      — the showcase (type, spacing, radii…) + the token swatches (declared + de-facto literals)
//                 + the DRIFT at the end: the deterministic consistency audit (off-palette colors,
//                 near-duplicates, no-scale), file:line. Drift is what makes the system honest — the
//                 palette says what you declared, the drift says where the code disagrees.
//   Components  — the gallery (name · props · renders · tokens), auto-harvested from the source on first
//                 open; a live snapshot links where the component rendered on a captured screen.
//   Frames      — the captured screens (the snapshots live here) and the frame editor.
// Self-fetches /api/v1/codebase/design/get; "rebuild" re-runs the harvest.
import * as React from "react";
import { apiPost, isNotWired, unwrapResult as unwrap } from "@/loki/api/client";
import { C } from "@/loki/theme";
import { DesignFrames } from "@/loki/design/frames";
import { DesignSystemShowcase } from "./design-system-showcase";
import { Highlighted } from "./highlight";
import { askEngine, type TemplateAsk } from "@/loki/api/engine";
import { fileRead } from "@/loki/api/codebase";

// THE WIRE BETWEEN THE CODE AND THE UI (operator 2026-09-19: "components on the design tab — find a way
// for our local AI subscription to wire the code to the generated UI"): per component, the engine reads
// its source and answers a DOSSIER — what it renders, each prop's meaning, its variants/states, who uses
// it, a usage example — kept per file in localStorage; the card shows it beside the live snapshot, so the
// picture and the code explain each other. `◆ wire all` runs the visible cards one by one.
export type Dossier = { purpose: string; renders: string; props: { name: string; type?: string; meaning: string }[]; variants: string[]; used_by: string[]; example: string;
  /** the engine's own drawing of the component (self-contained HTML, no scripts) — the card's preview
   *  when no captured screen shows it (operator 2026-09-19: "wire … not showing the snapshot") */
  preview_html?: string };
const DOSSIER_KEY = (path: string) => `antiloki:component-dossier:${path}`;
/** A COMPONENT'S SOURCE, READ THE WAY THE REST OF X-RAY READS FILES (Grokbot QA 2026-10-12, item 26: "couldn't load source for client/src/App.tsx", a file that exists). The atlas indexes the folder on disk, but
 *  `/code/file` only serves files git tracks, so a project that is not a git repo (or a file not added yet) was shown as unreadable. The workspace-rooted reader (no git needed) goes first; the git one is the fallback. */
export async function loadSource(path: string): Promise<{ code: string; err?: string }> {
  const d = await fileRead({ path }).catch(() => null);
  if (typeof d?.content === "string") return { code: d.content };
  const g: any = unwrap(await apiPost("/api/v1/code/file", { path }));
  if (typeof g?.content === "string") return { code: g.content };
  const why = typeof g?.error === "string" && g.error ? ` (${g.error})` : "";
  return { code: "", err: `couldn't load source for ${path}${why}` };
}

export function readDossier(path: string): Dossier | null { try { const v = localStorage.getItem(DOSSIER_KEY(path)); return v ? JSON.parse(v) : null; } catch { return null; } }
export function writeDossier(path: string, d: Dossier | null) { try { if (d) localStorage.setItem(DOSSIER_KEY(path), JSON.stringify(d)); else localStorage.removeItem(DOSSIER_KEY(path)); } catch { /* private mode */ } }
/** the dossier's catalog call (template `xray.component_dossier` on the serve — Settings › Prompts edits the text) */
export const dossierAsk = (c: Comp): TemplateAsk => ({ template: "xray.component_dossier", vars: { path: c.path, name: c.name, line: c.line } });
export function parseDossier(j: any): Dossier | null {
  if (!j || typeof j !== "object") return null;
  const s = (v: any, n = 400) => String(v ?? "").slice(0, n);
  return {
    purpose: s(j.purpose), renders: s(j.renders, 600),
    props: Array.isArray(j.props) ? j.props.filter((p: any) => p && typeof p.name === "string").map((p: any) => ({ name: s(p.name, 60), type: p.type ? s(p.type, 80) : undefined, meaning: s(p.meaning, 200) })).slice(0, 30) : [],
    variants: Array.isArray(j.variants) ? j.variants.map((v: any) => s(v, 80)).filter(Boolean).slice(0, 12) : [],
    used_by: Array.isArray(j.used_by) ? j.used_by.map((v: any) => s(v, 200)).filter(Boolean).slice(0, 20) : [],
    example: s(j.example, 800),
    preview_html: typeof j.preview_html === "string" && j.preview_html.trim() ? scrubPreview(j.preview_html.slice(0, 6000)) : undefined,
  };
}
/** the preview is drawn in a sandboxed iframe without scripts anyway; scripts and event handlers are stripped so the stored fragment is inert. Pure. */
export function scrubPreview(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<script[^>]*>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
}

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
// stub/placeholder CSS for the snapshot iframes (prepended to the project's compiled CSS), same as the gallery.
const SNAP_BASE = `*{box-sizing:border-box}body{margin:0;padding:10px;background:#fff;color:#111;font-family:system-ui,sans-serif}.ds-stub{display:inline-flex;align-items:center;min-width:36px;min-height:20px;padding:2px 6px;margin:2px;border:1px dashed #c9c9c9;border-radius:5px;color:#9a9a9a;font:10px/1.2 ui-monospace,monospace}.ds-dyn{color:#bcbcbc}`;
const sevColor = (s: string) => (s === "error" ? C.bad : s === "warn" ? C.warn : C.dim);
const padded: React.CSSProperties = { padding: "20px 14px", color: C.muted, fontStyle: "italic", fontFamily: mono, fontSize: 12 };
const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: "3px 10px", borderRadius: 5 };
const chip = (bg: string, fg: string): React.CSSProperties => ({ fontFamily: mono, fontSize: 11, color: fg, background: bg, padding: "2px 7px", borderRadius: 10 });

type Tok = { token: string | null; value: string; usage_count: number; sources: { path: string; line: number }[] };
type Cat = { declared: Tok[]; literals: Tok[] };
type Comp = { name: string; path: string; line: number; props: string[]; renders: string[]; tokens: string[] };
type Finding = { kind: string; category: string; severity: string; title: string; detail: string; values: string[]; usage_count: number; sources: { path: string; line: number }[] };
type Data = { palette: Record<string, Cat>; categories: string[]; components: Comp[]; audit: { findings: Finding[]; summary: any }; summary: any };

const isColor = (cat: string) => cat === "color";

export type DesignTab = "system" | "components" | "frames";
/** the retired tabs still resolve (old widgets carry them): palette/consistency/ai → system, snapshots → frames */
export const designTabOf = (t: unknown): DesignTab => (t === "components" || t === "frames" ? t : t === "snapshots" ? "frames" : "system");
const TAB_LABEL: Record<DesignTab, string> = { system: "System", components: "Components", frames: "Frames" };
export function DesignView({ initialTab = "system", only }: { initialTab?: DesignTab | string; /** draw ONLY the design: `showcase` = the visual design system, `frames` = the captured screens (the Editor view asks for these two); no header, no tables */ only?: "showcase" | "frames" } = {}) {
  const [data, setData] = React.useState<Data | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ok" | "notwired" | "error" | "empty">("loading");
  const [tab, setTab] = React.useState<DesignTab>(designTabOf(initialTab));
  const [busy, setBusy] = React.useState(false);
  const autoRan = React.useRef(false);

  const load = React.useCallback(async () => {
    const raw = await apiPost("/api/v1/codebase/design/get", {});
    if (isNotWired(raw)) { setStatus("notwired"); return; }
    const d = unwrap(raw);
    if (!d || !d.palette) { setStatus("error"); return; }
    setData(d);
    setStatus((d.summary?.tokens ?? 0) === 0 && (d.summary?.components ?? 0) === 0 ? "empty" : "ok");
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const rebuild = React.useCallback(async () => { setBusy(true); try { await apiPost("/api/v1/codebase/design/rebuild", {}); await load(); } finally { setBusy(false); } }, [load]);
  // AUTO-DETECT: an empty harvest runs itself once — nobody should have to press ↻ to see their components
  React.useEffect(() => { if (status === "empty" && !autoRan.current) { autoRan.current = true; void rebuild(); } }, [status, rebuild]);

  const s = data?.summary ?? {};
  if (only === "frames") return <div data-testid="design-only-frames" style={{ minHeight: 520, display: "flex", flex: 1 }}><DesignFrames /></div>;
  if (only === "showcase") return status === "ok" && data ? <div data-testid="design-only-showcase" style={{ padding: 14 }}><DesignSystemShowcase palette={data.palette} /></div> : <div style={{ padding: 16, fontSize: 12.5, color: C.dim }}>{status === "empty" ? "no design tokens for this workspace yet: rebuild the index to harvest them" : status === "loading" ? "loading the design…" : "the design could not be read"}</div>;
  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
        <span style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontWeight: 600 }}>Design</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>self-generated from the real UI</span>
        {status === "ok" && <>
          <span title="design values found in the code: declared tokens and hard-coded literals together (each category below says how many of each)" style={chip(C.panel2, C.muted)}>{s.tokens} tokens</span>
          <span style={chip(C.panel2, C.muted)}>{s.components} components</span>
          {s.drift > 0 && <span style={chip(`color-mix(in oklab, ${C.warn} 16%, transparent)`, C.warn)}>{s.drift} drift</span>}
        </>}
        <button onClick={rebuild} disabled={busy} style={{ marginLeft: "auto", ...btn, color: C.muted }}>{busy ? "rebuilding…" : "↻ rebuild"}</button>
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        {(["system", "components", "frames"] as const).map((t) => (
          <button key={t} data-testid={`design-tab-${t}`} onClick={() => setTab(t)} style={{ ...btn, color: tab === t ? C.brand : C.muted, borderColor: tab === t ? C.brand : C.border }}>
            {TAB_LABEL[t]}{t === "components" && data?.components?.length ? ` (${data.components.length})` : ""}{t === "system" && data?.audit?.findings?.length ? ` · ${data.audit.findings.length} drift` : ""}
          </button>
        ))}
      </div>

      {status === "notwired" && <div style={padded}>route not wired — restart the BE to pick up /api/v1/codebase/design/*.</div>}
      {status === "error" && <div style={padded}>can't reach /api/v1/codebase/design/get — retry with ↻.</div>}
      {status === "loading" && <div style={padded}>loading this project's design system…</div>}
      {status === "empty" && <div style={padded}>{busy ? "harvesting this project's palette + components…" : "no design tokens for this workspace yet — press ↻ rebuild (or rebuild the atlas) to harvest THIS project's palette + components."}</div>}

      {tab === "frames" && <div style={{ minHeight: 520, display: "flex" }}><DesignFrames /></div>}
      {status === "ok" && data && <>
        {tab === "system" && <>
          <DesignSystemShowcase palette={data.palette} />
          <Section t="the palette — declared tokens and the literals the code uses instead" />
          <Palette palette={data.palette} categories={data.categories} />
          <Section t={`the drift — ${data.audit.findings.length} place${data.audit.findings.length === 1 ? "" : "s"} where the code disagrees with the system`} />
          <Consistency findings={data.audit.findings} />
        </>}
        {tab === "components" && <Components components={data.components} />}
      </>}
    </div>
  );
}

const Section = ({ t }: { t: string }) => <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.dim, borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>{t}</div>;
function Swatch({ t, color }: { t: Tok; color: boolean }) {
  return (
    <div title={(t.token ? t.token + " = " : "") + t.value + `  (${t.usage_count}×)`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel, minWidth: 0 }}>
      {color
        ? <span style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0, background: t.value, border: `1px solid ${C.border}` }} />
        : <span style={{ minWidth: 28, textAlign: "center", fontFamily: mono, fontSize: 12, color: C.fg, background: C.panel2, borderRadius: 4, padding: "2px 4px" }}>{t.value}</span>}
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.token ?? t.value}</span>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{t.usage_count}×{t.token ? " · " + String(t.value).slice(0, 18) : ""}</span>
      </span>
    </div>
  );
}

function Palette({ palette, categories }: { palette: Record<string, Cat>; categories: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {categories.map((cat) => {
        const c = palette[cat]; const color = isColor(cat);
        return (
          <div key={cat} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{cat} · {c.declared.length} declared · {c.literals.length} literal</div>
            {c.declared.length > 0 && <>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginBottom: 5 }}>declared (the scale)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: c.literals.length ? 10 : 0 }}>{c.declared.map((t, i) => <Swatch key={i} t={t} color={color} />)}</div>
            </>}
            {c.literals.length > 0 && <>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginBottom: 5 }}>de-facto literals (hardcoded)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{c.literals.slice(0, 40).map((t, i) => <Swatch key={i} t={t} color={color} />)}</div>
            </>}
          </div>
        );
      })}
    </div>
  );
}

// The component inventory (harvested from source) as an expandable gallery: each card LINKS to its live
// snapshot (matched by name — present where the component rendered on a captured route) and expands on click
// to show its SOURCE, syntax-highlighted, scrolled to the component's line. Source via /api/v1/code/file;
// snapshots via /api/v1/codebase/design/snapshots (both already wired — no BE change).
function Components({ components }: { components: Comp[] }) {
  const [snap, setSnap] = React.useState<{ map: Record<string, string>; css: string; baseUrl: string } | null>(null);
  const [open, setOpen] = React.useState<number | null>(null);
  const [src, setSrc] = React.useState<Record<string, { code: string; err?: string }>>({});

  React.useEffect(() => {
    (async () => {
      const d = unwrap(await apiPost("/api/v1/codebase/design/snapshots", {}));
      const map: Record<string, string> = {};
      if (d && Array.isArray(d.snapshots)) for (const s of d.snapshots) if (s.kind === "component" && !map[s.name]) map[s.name] = s.html;
      setSnap({ map, css: d?.css ?? "", baseUrl: d?.baseUrl ?? "" });
    })();
  }, []);

  const toggle = async (i: number, c: Comp) => {
    const next = open === i ? null : i;
    setOpen(next);
    if (next !== null && c.path && !src[c.path]) {
      const r = await loadSource(c.path);
      setSrc((m) => ({ ...m, [c.path]: r }));
    }
  };

  const [dossiers, setDossiers] = React.useState<Record<string, Dossier | null>>(() => Object.fromEntries(components.map((c) => [c.path, readDossier(c.path)])));
  const [wiring, setWiring] = React.useState<string | null>(null);
  const [wireErr, setWireErr] = React.useState<string | null>(null);
  const wire = async (c: Comp) => {
    setWiring(c.path); setWireErr(null);
    const r = await askEngine(dossierAsk(c), { json: true, timeoutMs: 300_000, maxTurns: 15 });
    if (!r.ok) { setWireErr(`${c.name}: ${r.error}`); setWiring(null); return; }
    const d = parseDossier(r.json);
    writeDossier(c.path, d); setDossiers((m) => ({ ...m, [c.path]: d })); setWiring(null);
  };
  const wireAll = async () => { for (const c of components.slice(0, 12)) { if (!dossiers[c.path]) await wire(c); } };
  const doc = (html: string) => `<!doctype html><html><head><meta charset="utf-8">${snap?.baseUrl ? `<base href="${snap.baseUrl}/">` : ""}<style>${SNAP_BASE}\n${snap?.css ?? ""}</style></head><body>${html}</body></html>`;

  if (!components.length) return <div style={padded}>no components extracted.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, flex: 1 }}>auto-detected from the source · {snap && Object.keys(snap.map).length === 0 ? "capture the running app on the Frames tab and each card gets its live snapshot" : "a live snapshot links where the component rendered on a captured screen"} · click a card for its code · ◆ wires the code to the UI with your subscription engine</div>
        <button data-testid="components-wire-all" onClick={() => void wireAll()} disabled={!!wiring} style={{ ...btn, color: C.brand }} title="the engine reads each of the first 12 components and writes its dossier — what it renders, what each prop changes, its variants, who uses it">{wiring ? `◆ wiring ${wiring.split("/").pop()}…` : "◆ wire all (first 12)"}</button>
      </div>
      {wireErr && <div data-testid="components-wire-error" style={{ fontFamily: mono, fontSize: 10, color: C.bad }}>✗ {wireErr}</div>}
      {components.map((c, i) => {
        const live = snap?.map[c.name];
        const drawn = !live ? dossiers[c.path]?.preview_html : undefined;
        const html = live ?? drawn;
        const isOpen = open === i;
        const s = src[c.path];
        return (
          <div key={i} style={{ background: C.panel, border: `1px solid ${isOpen ? C.brand : C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div onClick={() => toggle(i, c)} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 11px", cursor: "pointer" }}>
              <span style={{ color: C.dim, fontFamily: mono, fontSize: 11, width: 9 }}>{isOpen ? "▾" : "▸"}</span>
              <div style={{ width: 80, height: 46, flexShrink: 0, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden", background: "#fff" }}>
                {html
                  ? <iframe title={c.name} data-testid={`component-thumb-${i}`} data-source={live ? "live" : "drawn"} srcDoc={doc(html)} sandbox="" tabIndex={-1} style={{ width: 200, height: 115, border: "none", transform: "scale(0.4)", transformOrigin: "top left", pointerEvents: "none" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.dim, fontSize: 8, fontFamily: mono, background: C.panel2, textAlign: "center", lineHeight: 1.2 }}>no snapshot<br />◆ wire draws one</div>}
              </div>
              <div style={{ minWidth: 0, flex: 1, fontFamily: mono, fontSize: 11 }}>
                <div><span style={{ color: C.brand }}>{c.name}</span><span style={{ color: C.dim }}> · {c.path?.split("/").pop()}:{c.line}</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, color: C.muted, marginTop: 2, fontSize: 10 }}>
                  {c.props.length > 0 && <span title={c.props.join(", ")}>props({c.props.length})</span>}
                  {c.renders.length > 0 && <span style={{ color: C.fg }}>renders: {c.renders.slice(0, 5).join(" ")}</span>}
                  {c.tokens.length > 0 && <span style={{ color: C.dim }}>tokens: {c.tokens.length}</span>}
                  {snap && !live && Object.keys(snap.map).length > 0 && <span style={{ color: C.dim }}>not on a captured screen</span>}
                  {dossiers[c.path] && <span style={{ color: C.ok }}>◆ wired{drawn ? " · preview drawn by the engine" : ""}</span>}
                </div>
                {dossiers[c.path]?.purpose && <div data-testid={`dossier-purpose-${i}`} style={{ color: C.muted, fontSize: 10.5, marginTop: 3 }}>{dossiers[c.path]!.purpose}</div>}
              </div>
              <button data-testid={`component-wire-${i}`} onClick={(e) => { e.stopPropagation(); void wire(c); }} disabled={!!wiring} title="the engine reads this component and explains it: what it renders, each prop, its variants, who uses it" style={{ ...btn, fontSize: 10, padding: "2px 8px", color: dossiers[c.path] ? C.muted : C.brand }}>{wiring === c.path ? "◆ …" : dossiers[c.path] ? "◆ re-wire" : "◆ wire"}</button>
            </div>
            {dossiers[c.path] && (
              <div data-testid={`dossier-${i}`} style={{ borderTop: `1px solid ${C.border}`, padding: "8px 12px 10px 40px", fontFamily: mono, fontSize: 10.5, color: C.muted, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                <div style={{ gridColumn: "1 / -1", color: C.fg }}>renders · {dossiers[c.path]!.renders}</div>
                <div>
                  <div style={{ color: C.dim, textTransform: "uppercase", fontSize: 8.5, letterSpacing: 1 }}>props — what each changes on screen</div>
                  {dossiers[c.path]!.props.map((p) => <div key={p.name}><span style={{ color: C.brand }}>{p.name}</span>{p.type ? <span style={{ color: C.dim }}>: {p.type}</span> : null} — {p.meaning}</div>)}
                  {!dossiers[c.path]!.props.length && <div style={{ color: C.dim }}>no props</div>}
                </div>
                <div>
                  {dossiers[c.path]!.variants.length > 0 && <div><span style={{ color: C.dim, textTransform: "uppercase", fontSize: 8.5, letterSpacing: 1 }}>variants</span> · {dossiers[c.path]!.variants.join(" · ")}</div>}
                  {dossiers[c.path]!.used_by.length > 0 && <div style={{ marginTop: 4 }}><span style={{ color: C.dim, textTransform: "uppercase", fontSize: 8.5, letterSpacing: 1 }}>used by</span> · {dossiers[c.path]!.used_by.map((u) => u.split("/").pop()).join(", ")}</div>}
                  {dossiers[c.path]!.example && <pre style={{ margin: "6px 0 0", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", color: C.fg, whiteSpace: "pre-wrap", fontSize: 10 }}>{dossiers[c.path]!.example}</pre>}
                </div>
              </div>
            )}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {html && <div style={{ position: "relative" }}>
                  <iframe title={`${c.name} preview`} srcDoc={doc(html)} sandbox="" style={{ width: "100%", height: 200, border: "none", borderBottom: `1px solid ${C.border}`, background: "#fff", display: "block" }} />
                  <span style={{ position: "absolute", top: 6, right: 8, fontFamily: mono, fontSize: 9, color: live ? C.ok : C.warn, background: "rgba(0,0,0,.55)", padding: "1px 6px", borderRadius: 8 }}>{live ? "live snapshot · captured screen" : "preview drawn by the engine from the source — capture the app on Frames for the real one"}</span>
                </div>}
                <div style={{ maxHeight: 440, overflow: "auto", background: C.bg, padding: "8px 4px" }}>
                  {!s ? <div style={padded}>loading source…</div> : s.err ? <div style={padded}>{s.err}</div> : <Highlighted code={s.code} blink={{ line: Math.max(0, (c.line || 1) - 1), nonce: i + 1 }} />}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Consistency({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return <div style={padded}>no drift — every value maps to a token. ✓</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {findings.map((f, i) => (
        <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${sevColor(f.severity)}`, borderRadius: 6, padding: "9px 12px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: sevColor(f.severity), textTransform: "uppercase" }}>{f.kind.replace(/_/g, " ")}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: C.fg }}>{f.title}</span>
            <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10, color: C.dim }}>{f.usage_count}×</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, marginTop: 3 }}>{f.detail}</div>
          {f.sources?.length > 0 && (
            <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginTop: 4, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {f.sources.slice(0, 8).map((s, j) => <span key={j}>{s.path.split("/").pop()}:{s.line}</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
