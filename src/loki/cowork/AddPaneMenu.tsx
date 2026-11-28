// THE "+" MENU (board v3): the engines this machine can run, a plain terminal, and the Studio tools that can open as panes. The pane opens beside the
// focused one, on the side chosen at the bottom (right, below, left). An engine that is not installed is shown and cannot be picked, with the reason.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import type { Engine } from "./api";
import { ENGINE_DOCS, OLLAMA_DOWNLOAD } from "./api";
import { openExternal } from "@/loki/desktop/shell";
import type { Side } from "./layout";
import { STUDIO_MENU, XRAY_MENU } from "./studio-panes";
import { loadWebApps } from "./api";
import type { InstalledApp } from "./webapps";
import { localModels, panesOp, specialistsOpenable, specialistDrafts, type LocalModel, type SpecialistRow } from "./api";
import { SpecialistAvatar } from "./SpecialistAvatar";
import { parseImport } from "./panebundle";
import { LocalModelsWindow } from "./LocalModelsWindow";

/** `tool` is a key of the Studio catalogue (studio-panes.ts): Notes, Issues, Preview and every other Studio tool. */
export type Pick = { kind: "engine"; engine: Engine } | { kind: "shell" } | { kind: "tool"; tool: string }
  /** one whole-space view of X-ray, as a pane of its own */ | { kind: "xray"; view: string; label: string }
  /** an installed web app, in a pane of its own (its page); the store is the `webapps` tool */ | { kind: "webapp"; app: { id: string; name: string; url: string } }
  /** a team's own pane (RFC 0008): its Run, Edit and Saga tabs */ | { kind: "team"; team: string; label: string }
  /** a free pane (RFC 0016): a page of the project's own folder, in a sandbox */ | { kind: "free"; id: string; title: string };

/** Said by the empty specialists list: open an agent that makes one (found 2026-11-22: an empty list was a dead end). */
export const NEW_SPECIALIST = "antiloki:new-specialist";
export const NEW_SPECIALIST_ASK = "I want a new antiloki specialist and have not said what for. Ask me what it should do, in one short question, then create it with the antiloki_specialist_create tool. Do not write a skill file or plugin of your own for it.";
export type MenuMode = "agent" | "specialist" | "pane" | "all";
/** "agent": the engines. "pane": a plain terminal and the Studio tools. "all": both (a pane header's split buttons). */
// THE STUDIO IN THE NEW-PANE MENU (the operator 2026-11-24: "drop the studio completely, and the panes are only the ones an agent creates"): off. The Studio tools and X-ray still exist as code and open through agents; the menu no longer offers them. Set to true to bring them back.
export const STUDIO_IN_MENU = false;
export function AddPaneMenu({ engines, anchor, onPick, onClose, atLimit, initialSide = "right", mode = "all", onSpecialist, onLocal, onDraft }: { /** a specialist that waits for approval: its editor opens, to read it and approve it */ onDraft?: (id: string) => void; /** open an agent on a local model (agents only) */ onLocal?: (tag: string, side: Side) => void; /** open a specialist as a pane (agents only) */ onSpecialist?: (id: string, side: Side) => void; /** "Make a new pane…": the dialog of the four kinds (RFC 0017) */ engines: Engine[]; anchor: { left: number; bottom?: number; top?: number }; onPick: (p: Pick, side: Side) => void; onClose: () => void; atLimit: string | null; initialSide?: Side ; mode?: MenuMode}) {
  const [side, setSide] = React.useState<Side>(initialSide);
  // what this menu lists: the agents, the panes, or only the specialists (Ctrl+Space then S)
  const agents = mode === "agent" || mode === "all"; const panes = mode === "pane" || mode === "all";
  // IT OPENS AND CLOSES LIKE THE OTHER WINDOWS (operator 2026-11-23): it rises in from where it opened and folds back out before it goes
  const [closing, setClosing] = React.useState(false);
  const close = React.useCallback(() => { if (closing) return; setClosing(true); window.setTimeout(onClose, 150); }, [closing, onClose]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [close]);
  const row = (disabled: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "6px 8px", border: "none", borderRadius: 6, background: "transparent", cursor: disabled ? "default" : "pointer", color: disabled ? C.muted : C.fg, fontFamily: nav, fontSize: 12.5, breakInside: "avoid" });
  const head: React.CSSProperties = { padding: "6px 8px 3px", fontFamily: nav, fontSize: 10.5, letterSpacing: "0.05em", color: C.muted, textTransform: "uppercase", breakAfter: "avoid" };
  const pick = (p: Pick) => { onPick(p, side); close(); };
  const [xray, setXray] = React.useState(false); const [localWin, setLocalWin] = React.useState(false);
  // SPECIALISTS: the approved ones of this project, each a pane with its own memory and tools behind the same terminal
  const [specs, setSpecs] = React.useState<SpecialistRow[]>([]); const [drafts, setDrafts] = React.useState<{ id: string; name: string }[]>([]); const [locals, setLocals] = React.useState<LocalModel[]>([]);
  // THE LOCAL MODEL SERVER, IN ONE OF THREE STATES (operator 2026-11-23: "error handling... the model is there but not found"): answering with models, answering with none, or not answering. Each says what to do.
  const [ollama, setOllama] = React.useState<{ reachable: boolean; base: string; error?: string; gpuMb?: number | null; loaded?: { name: string; gpu_pct: number }[] } | null>(null);
  React.useEffect(() => { if (mode !== "pane" && onLocal) void localModels().then((r) => { setLocals(r.reachable ? r.models : []); setOllama({ reachable: r.reachable, base: r.base, error: r.error, gpuMb: r.gpuMb, loaded: r.loaded }); }); }, [mode, onLocal]);
  React.useEffect(() => { if (mode !== "pane" && onSpecialist) void specialistsOpenable().then(setSpecs); }, [mode, onSpecialist]);
  React.useEffect(() => { if (mode !== "pane" && onDraft) void specialistDrafts().then(setDrafts); }, [mode, onDraft]);   // the ones that wait for the person: listed too, so a specialist an agent made is not lost
  // THE "WEB APPS" PART (operator 2026-11-10: installing a web app "installs the pane on the new pane list"): the installed apps, each its own pane, and the store
  const [apps, setApps] = React.useState(false); const [installed, setInstalled] = React.useState<InstalledApp[] | null>(null);
  React.useEffect(() => { if (apps && installed === null) void loadWebApps().then((w) => setInstalled(w?.installed ?? [])); }, [apps, installed]);
  // "YOUR PANES" (RFC 0016): the folders of the project's `.antiloki/panes/`, each a pane of its own; a draft says so
  const [importMsg, setImportMsg] = React.useState<{ ok: boolean; text: string } | null>(null); const importRef = React.useRef<HTMLInputElement>(null);
  const importFile = async (file: File | undefined) => {
    if (!file) return; const body = parseImport(await file.text().catch(() => "")); if (typeof body === "string") { setImportMsg({ ok: false, text: body }); return; }
    const r = await panesOp(body); if (r?.ok === true) { setImportMsg({ ok: true, text: `Brought in as “${r.id}”: a draft. It asks for your approval when you open it.` }); setFree(null); } else setImportMsg({ ok: false, text: String(r?.error ?? "the pane was not imported") });
  };
  const [freeOpen, setFreeOpen] = React.useState(false); const [free, setFree] = React.useState<{ id: string; title: string; approved: boolean; problems: string[] }[] | null>(null);
  React.useEffect(() => { if (freeOpen && free === null) void Promise.resolve().then(() => panesOp({ op: "list" })).then((r) => setFree(Array.isArray(r?.panes) ? r.panes.map((p: any) => ({ id: String(p.id), title: String(p.title ?? p.id), approved: p.approved === true, problems: Array.isArray(p.problems) ? p.problems : [] })) : [])).catch(() => setFree([])); }, [freeOpen, free]);
  // THE MENU NEVER RUNS OFF THE SCREEN (operator 2026-11-23: "the list is huge and cut at the top; it should have columns if needed and never be cut"): its height is the space the screen has beside the anchor, and when the list does not fit
  // it grows a column at a time (as many as the width allows) before it ever scrolls. A menu anchored near the bottom opens upward; one near the top, downward; one with too little room below flips up.
  const menuRef = React.useRef<HTMLDivElement>(null); const [cols, setCols] = React.useState(1);
  const sig = [engines.length, specs.length, drafts.length, locals.length, xray, freeOpen, apps, free?.length, installed?.length, !!importMsg, mode, !!atLimit].join("|");
  React.useLayoutEffect(() => { setCols(1); }, [sig]);
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth; const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const COL_W = 262; const GAP = 12; const maxCols = Math.max(1, Math.min(4, Math.floor((vw - 24 + GAP) / (COL_W + GAP))));
  // ONLY A LIST TOO TALL GROWS A COLUMN (operator 2026-11-24: the menu was horizontal for a short list): a row wider than the column never does
  React.useLayoutEffect(() => { const el = menuRef.current; if (!el || cols >= maxCols) return; if (el.scrollHeight > el.clientHeight + 1) setCols(cols + 1); });
  const center = (anchor as { center?: boolean }).center === true;   // opened from an empty thread: in the middle of the screen (operator 2026-11-26)
  const below = anchor.top !== undefined && vh - anchor.top >= 300;                       // enough room under the anchor to open downward
  const room = center ? vh - 24 : below ? vh - (anchor.top as number) - 12 : anchor.top !== undefined ? vh - 24 : vh - (anchor.bottom ?? 12) - 12;
  const width = cols * COL_W + (cols - 1) * GAP + 16; const left = center ? Math.max(12, Math.round((vw - width) / 2)) : Math.max(12, Math.min(anchor.left, vw - width - 12));
  const vertical: React.CSSProperties = center ? { top: 12, bottom: 12, height: "fit-content", margin: "auto 0" } : below ? { top: anchor.top } : anchor.top !== undefined ? { bottom: 12 } : { bottom: anchor.bottom };
  return (
    <>
      <style>{"@keyframes apm-in{from{opacity:0;transform:translateY(8px) scale(.94)}to{opacity:1;transform:none}}@keyframes apm-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(6px) scale(.95)}}@media (prefers-reduced-motion: reduce){[data-testid=add-pane-menu]{animation:none!important}}"}</style>
      <div onMouseDown={close} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
      <div ref={menuRef} role="menu" data-testid="add-pane-menu" data-closing={closing ? "1" : "0"} data-cols={cols} style={{ position: "fixed", left, ...vertical, transformOrigin: below ? "top left" : "bottom left", animation: closing ? "apm-out 150ms cubic-bezier(.4,0,.8,.4) both" : "apm-in 190ms cubic-bezier(.2,.9,.25,1.05) both", maxHeight: Math.max(160, room), overflowY: "auto", overflowX: "hidden", zIndex: 999, width, padding: 8, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 16px 40px -12px rgba(0,0,0,.6)" }}>
      <div data-testid="add-pane-columns" style={{ columnCount: cols, columnGap: GAP }}>
        {atLimit && <div data-testid="add-pane-limit" style={{ padding: "6px 8px", color: C.warn, fontFamily: nav, fontSize: 11.5, lineHeight: 1.4 }}>{atLimit}</div>}
        <div style={head}>{mode === "pane" ? "New pane" : mode === "agent" ? "New agent" : mode === "specialist" ? "Specialists" : "Open a pane"}</div>
        {agents && engines.length === 0 && <div style={{ ...row(true), cursor: "default" }}>looking for installed agents…</div>}
        {agents && engines.map((e) => {
          // a CLI that is not found (or found and broken) opens its vendor's official install page; one the person switched off does nothing; a good one is picked
          const gone = !e.off && (!e.installed || !!e.broken); const docs = gone ? ENGINE_DOCS[e.key] : undefined; const usable = e.installed && !e.broken;
          const blocked = usable ? !!atLimit : !docs;
          return (
          <button key={e.key} role="menuitem" data-testid={`pick-${e.key}`} disabled={blocked}
            title={gone ? `${e.missing ?? ""}${docs ? `\n\nClick to open the official install page: ${docs}` : ""}`.trim() : usable && e.seat === false ? e.missing : undefined}
            onClick={() => { if (usable) pick({ kind: "engine", engine: e }); else if (docs) void openExternal(docs); }} style={row(blocked)}>
            <span style={{ color: e.broken ? C.warn : e.installed ? C.ok : C.muted }}>{usable ? "✓" : e.broken ? "!" : "–"}</span><span style={{ flex: 1 }}>{e.label}</span>
            <span style={{ fontSize: 11, color: e.broken ? C.warn : C.muted }}>{e.broken ? "found, will not run" : e.installed ? (e.seat === false ? "not signed in" : "installed") : e.off ? "switched off" : "not found"}{docs ? " · install guide ↗" : ""}</span>
          </button>
          );
        })}
        {agents && (
          <button role="menuitem" data-testid="pick-hermes" disabled style={row(true)} title="Hermes (Nous Research) is coming: it is not wired into antiloki yet">
            <span style={{ color: C.muted }}>–</span><span style={{ flex: 1 }}>Hermes</span>
            <span style={{ fontSize: 11, color: C.muted }}>soon</span>
          </button>
        )}
        {agents && onLocal && (locals.length > 0 || (ollama !== null && !ollama.reachable) || (ollama?.reachable && locals.length === 0)) && <div style={head}>Local models</div>}
        {agents && onLocal && ollama !== null && !ollama.reachable && (
          <button role="menuitem" data-testid="ollama-down" onClick={() => void openExternal(OLLAMA_DOWNLOAD)} title={ollama.error ?? ""} style={{ ...row(false), whiteSpace: "normal", alignItems: "flex-start" }}>
            <span style={{ color: C.warn, width: 14, textAlign: "center" }}>!</span><span style={{ flex: 1, lineHeight: 1.4 }}>Ollama is not answering{ollama.base ? ` at ${ollama.base}` : ""}. Start it (<code>ollama serve</code>) or install it · download ↗</span>
          </button>
        )}
        {agents && onLocal && ollama?.reachable && locals.length === 0 && (
          <div data-testid="ollama-empty" style={{ ...row(true), cursor: "default", whiteSpace: "normal", alignItems: "flex-start" }}>
            <span style={{ color: C.warn, width: 14, textAlign: "center" }}>!</span><span style={{ flex: 1, lineHeight: 1.4 }}>Ollama is running but holds no chat model yet. In a terminal: <code>ollama pull qwen3:4b</code></span>
          </div>
        )}
        {agents && onLocal && locals.length > 0 && (
          <button role="menuitem" data-testid="pick-local-window" disabled={!!atLimit} onClick={() => setLocalWin(true)} style={row(!!atLimit)} title="every model installed on this machine, with its size, parameters and whether it is loaded">
            <span style={{ width: 20, height: 20, display: "grid", placeItems: "center", color: C.ok, fontSize: 13 }}>⌂</span><span style={{ flex: 1 }}>Local</span><span style={{ fontSize: 11, color: C.muted }}>{locals.length} model{locals.length === 1 ? "" : "s"} ▸</span>
          </button>
        )}
        {localWin && onLocal && <LocalModelsWindow models={locals} info={ollama} onClose={() => setLocalWin(false)} onPick={(x) => { onLocal(x.tag, side); setLocalWin(false); close(); }} />}
        {mode === "specialist" && specs.length === 0 && drafts.length === 0 && <div data-testid="specialists-none" style={{ ...row(true), cursor: "default", whiteSpace: "normal" }}>No specialist yet.</div>}
        {mode === "specialist" && specs.length === 0 && drafts.length === 0 && <button role="menuitem" data-testid="specialists-make" title="opens an agent that asks you what the specialist is for, and makes it" onClick={() => { window.dispatchEvent(new CustomEvent(NEW_SPECIALIST)); close(); }} style={row(false)}><span style={{ color: C.brand }}>+</span><span style={{ flex: 1 }}>Make one with an agent</span></button>}
        {mode !== "pane" && mode !== "specialist" && onSpecialist && specs.length > 0 && <div style={head}>Specialists</div>}
        {mode !== "pane" && onSpecialist && specs.map((x) => (
          <button key={x.id} role="menuitem" data-testid={`pick-specialist-${x.id}`} disabled={!!atLimit} title={x.purpose || x.name} onClick={() => { onSpecialist(x.id, side); close(); }} style={row(!!atLimit)}>
            <SpecialistAvatar id={x.id} size={20} shape={x.shape} color={x.color} /><span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span><span style={{ color: C.muted, fontSize: 10.5 }}>{x.notes} note{x.notes === 1 ? "" : "s"}</span>
          </button>
        ))}
        {mode !== "pane" && onDraft && drafts.length > 0 && <div style={head}>Waiting for your approval</div>}
        {mode !== "pane" && onDraft && drafts.map((x) => (
          <button key={x.id} role="menuitem" data-testid={`pick-draft-${x.id}`} title={`${x.name}: a draft. Open it, read it and approve it`} onClick={() => { onDraft(x.id); close(); }} style={row(false)}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span><span style={{ color: C.warn, fontSize: 10.5 }}>draft</span>
          </button>))}
        {panes && <button role="menuitem" data-testid="pick-shell" disabled={!!atLimit} onClick={() => pick({ kind: "shell" })} style={row(!!atLimit)}><span style={{ color: C.brand }}>▣</span><span style={{ flex: 1 }}>Terminal</span><span style={{ fontSize: 11, color: C.muted }}>shell</span></button>}
        {panes && <button role="menuitem" data-testid="pick-board" title="every running agent, the tasks between them, and your routines" disabled={!!atLimit} onClick={() => pick({ kind: "tool", tool: "board" })} style={row(!!atLimit)}><span style={{ color: C.brand }}>☰</span><span style={{ flex: 1 }}>Board</span></button>}
        {panes && <button role="menuitem" data-testid="pick-connectors" title="the services your agents can use: ask an agent to connect one" disabled={!!atLimit} onClick={() => pick({ kind: "tool", tool: "connectors" })} style={row(!!atLimit)}><span style={{ color: C.brand }}>⌁</span><span style={{ flex: 1 }}>Connectors</span></button>}
        {STUDIO_IN_MENU && panes && <div style={head}>Studio</div>}
        {STUDIO_IN_MENU && panes && STUDIO_MENU.map((t) => (
          <button key={t.key} role="menuitem" data-testid={`pick-${t.key}`} title={t.hint} disabled={!!atLimit} onClick={() => pick({ kind: "tool", tool: t.key })} style={row(!!atLimit)}>
            <span style={{ color: C.ok, width: 14, textAlign: "center" }}>{t.glyph}</span><span style={{ flex: 1 }}>{t.label}</span><span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{t.hint}</span>
          </button>
        ))}
        {STUDIO_IN_MENU && panes && (
          <>
            <button role="menuitem" data-testid="pick-xray" aria-expanded={xray} disabled={!!atLimit} onClick={() => setXray((x) => !x)} style={row(!!atLimit)}>
              <span style={{ color: C.ok, width: 14, textAlign: "center" }}>◈</span><span style={{ flex: 1 }}>X-ray</span><span style={{ fontSize: 11, color: C.muted }}>{xray ? "▾" : "▸"}</span>
            </button>
            {xray && (
              <div data-testid="xray-submenu" role="menu" style={{ marginLeft: 14, paddingLeft: 6, borderLeft: `1px solid ${C.border}` }}>
                {XRAY_MENU.map((x) => (
                  <button key={x.view} role="menuitem" data-testid={`pick-xray-${x.view}`} title={x.hint} disabled={!!atLimit} onClick={() => pick({ kind: "xray", view: x.view, label: x.label })} style={row(!!atLimit)}>
                    <span style={{ color: C.ok, width: 14, textAlign: "center" }}>{x.glyph}</span><span style={{ flex: 1 }}>{x.label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {panes && (
          <>
            <button role="menuitem" data-testid="pick-free-menu" aria-expanded={freeOpen} disabled={!!atLimit} onClick={() => setFreeOpen((x) => !x)} style={row(!!atLimit)}>
              <span style={{ color: C.brand, width: 14, textAlign: "center" }}>▣</span><span style={{ flex: 1 }}>Your panes</span><span style={{ fontSize: 11, color: C.muted }}>{freeOpen ? "▾" : "▸"}</span>
            </button>
            {freeOpen && (
              <div data-testid="free-submenu" role="menu" style={{ marginLeft: 14, paddingLeft: 6, borderLeft: `1px solid ${C.border}` }}>
                {free === null && <div style={{ ...row(true), cursor: "default" }}>looking…</div>}
                {(free ?? []).map((p) => (
                  <button key={p.id} role="menuitem" data-testid={`pick-free-${p.id}`} title={p.problems[0] ?? (p.approved ? "approved" : "a draft: it asks for your approval when it opens")} disabled={!!atLimit} onClick={() => pick({ kind: "free", id: p.id, title: p.title })} style={row(!!atLimit)}>
                    <span style={{ flex: 1 }}>{p.title}</span><span style={{ fontSize: 11, color: p.problems.length ? C.bad : p.approved ? C.ok : C.warn }}>{p.problems.length ? "problem" : p.approved ? "approved" : "draft"}</span>
                  </button>
                ))}
                <button role="menuitem" data-testid="free-import" onClick={() => importRef.current?.click()} style={row(false)}><span style={{ color: C.muted, width: 14, textAlign: "center" }}>↑</span><span style={{ flex: 1 }}>Import a pane…</span></button>
                <input ref={importRef} data-testid="free-import-file" type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
                {importMsg && <div data-testid="free-import-msg" style={{ ...row(true), cursor: "default", whiteSpace: "normal", color: importMsg.ok ? C.ok : C.bad }}>{importMsg.text}</div>}
                {free !== null && free.length === 0 && <div data-testid="free-none" style={{ ...row(true), cursor: "default", whiteSpace: "normal" }}>none yet: a pane is a folder in .antiloki/panes/ (RFC 0016)</div>}
              </div>
            )}
          </>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 8px 2px", marginTop: 4, borderTop: `1px solid ${C.border}`, fontFamily: nav, fontSize: 11.5, color: C.muted }}>
          <span>open it</span>
          {(["right", "below", "left"] as Side[]).map((s) => <button key={s} data-testid={`side-${s}`} aria-pressed={side === s} onClick={() => setSide(s)} style={{ fontFamily: nav, fontSize: 11.5, padding: "2px 8px", borderRadius: 5, cursor: "pointer", border: `1px solid ${side === s ? C.brand : C.border}`, background: side === s ? `color-mix(in oklab, ${C.brand} 20%, transparent)` : "transparent", color: C.fg }}>{s}</button>)}
        </div>
      </div>
      </div>
    </>
  );
}
