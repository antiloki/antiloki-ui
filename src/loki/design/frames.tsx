// DESIGN FRAMES (operator 2026-09-17: "a figma pixel-perfect representation of the screens,
// deterministically based on the code, that I can edit like Figma — not the code, the design — as
// snapshots I create with the code-based design as the base").
//
// The base is what antiIDE already captures: the project's REAL rendered DOM + CSS per screen
// (`codebase/design/capture` opens the dev server headless; `codebase/design/snapshots` serves it).
// A frame renders that HTML in a same-origin iframe — pixel-perfect, deterministic, no model — and
// this editor works on the frame's DOM the way Figma works on layers: click to select, drag to move,
// handles to resize, a properties panel for color / type / radius / spacing, double-click to retype.
// "Save as snapshot" keeps the edited HTML under your name; the code is never touched. Snapshots
// live per workspace in localStorage (`antiloki:design-frames:<ws>`) — the substrate route for them
// is a follow-up; export gives you the HTML any time.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet, apiPost, isNotWired, unwrapResult as unwrap } from "@/loki/api/client";
import { useWorkspaces } from "@/loki/api/hooks";
import { noteTimeline } from "@/loki/widgets/agents-timeline";

import { askForMockup, bodyOfDocument, FRAMES_SHOW_EVENT, listMockups, mockupHtml, mockupLine, peekPendingMockup, removeMockup, takePendingMockup, type Mockup } from "./frames-agent";
import { type Snap, type Frame, type FrameChange, PROPS, changePrompt, changeRfc, diffFrame, frameDoc, layerName, mint, nextName, readFrames, toHex, upsertFrame, writeFrames } from "./frames-store";

// ─────────────────────────────────────────────────────────────────────────────────────────────
export function DesignFrames({ payload }: { payload?: any }) {
  const ws = useWorkspaces().data?.active?.name ?? "default";
  const [data, setData] = React.useState<{ snapshots: Snap[]; css: string; baseUrl?: string } | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ok" | "empty" | "notwired" | "error">("loading");
  const [frames, setFrames] = React.useState<Frame[]>(() => readFrames(ws));
  const [cur, setCur] = React.useState<{ kind: "code"; name: string } | { kind: "mine"; id: string } | { kind: "mockup"; id: string } | null>(payload?.screen ? { kind: "code", name: String(payload.screen) } : null);
  const [zoom, setZoom] = React.useState(0.6);
  const [dirty, setDirty] = React.useState(false);
  const [sel, setSel] = React.useState<HTMLElement | null>(null);
  const [hover, setHover] = React.useState<HTMLElement | null>(null);
  const [tick, setTick] = React.useState(0); // re-read computed styles after an edit
  // THE PROJECT RUNS INSIDE ANTILOKI (operator 2026-09-17: "the project was never run — we have a
  // running env, docker or local"): the same preview manager the Run pane and Pulls use boots the
  // workspace root's dev server (host or docker per Settings › Environments); once its URL shows
  // up, the capture reads the real screens from it. No URL to type.
  const [run, setRun] = React.useState<{ phase: "idle" | "booting" | "running" | "capturing" | "error"; url: string | null; msg: string }>({ phase: "idle", url: null, msg: "" });
  const pollStatus = React.useCallback(async () => { const r: any = await apiGet(`/api/v1/pr/preview/status?ref_slug=root`); const d = r?.result ?? r; return d && typeof d === "object" ? d : null; }, []);
  React.useEffect(() => { void pollStatus().then((d) => { if (d?.url) setRun({ phase: "running", url: d.url, msg: `running · ${d.url}` }); }); }, [pollStatus]);
  const iframe = React.useRef<HTMLIFrameElement | null>(null);
  const drag = React.useRef<null | { kind: "move" | "resize"; el: HTMLElement; x: number; y: number; left: number; top: number; w: number; h: number }>(null);

  React.useEffect(() => { setFrames(readFrames(ws)); }, [ws]);
  // MOCKUPS MADE BY AGENTS: listed from the serve (every 3 s while one is being made, else every 10 s); one's document is read when it is opened
  const [mockups, setMockups] = React.useState<Mockup[]>([]); const [mockDocs, setMockDocs] = React.useState<Record<string, string>>({});
  const [ask, setAsk] = React.useState(""); const [asking, setAsking] = React.useState(false); const [askErr, setAskErr] = React.useState("");
  const working = mockups.some((m) => m.status === "working");
  const refreshMockups = React.useCallback(async () => { const l = await listMockups(); if (l) setMockups(l); }, []);
  React.useEffect(() => { void refreshMockups(); const t = setInterval(() => void refreshMockups(), working ? 3000 : 10_000); return () => clearInterval(t); }, [refreshMockups, working]);
  React.useEffect(() => { if (cur?.kind !== "mockup" || mockDocs[cur.id] !== undefined) return; const id = cur.id; void mockupHtml(id).then((h) => { if (h !== null) setMockDocs((d) => ({ ...d, [id]: bodyOfDocument(h) })); }); }, [cur, mockDocs]);
  // an agent handed a mockup in and the screen was asked to show it: select it as soon as the list has it
  const [want, setWant] = React.useState<string | null>(() => peekPendingMockup());
  React.useEffect(() => { const h = (e: Event) => { const id = (e as CustomEvent).detail?.id; if (typeof id === "string") { setWant(id); void refreshMockups(); } }; window.addEventListener(FRAMES_SHOW_EVENT, h); return () => window.removeEventListener(FRAMES_SHOW_EVENT, h); }, [refreshMockups]);
  React.useEffect(() => { if (!want) return; const m = mockups.find((x) => x.id === want); if (m && m.status === "done") { setCur({ kind: "mockup", id: want }); takePendingMockup(want); setWant(null); } else if (!m) { const t = setTimeout(() => void refreshMockups(), 1200); return () => clearTimeout(t); } }, [want, mockups, refreshMockups]);
  React.useEffect(() => { if (!want) return; const t = setTimeout(() => { takePendingMockup(want); setWant(null); }, 15_000); return () => clearTimeout(t); }, [want]);   // a mockup that never shows up does not keep the code screen from opening
  const makeMockup = async () => { const p = ask.trim(); if (!p || asking) return; setAsking(true); setAskErr(""); const r = await askForMockup(p); setAsking(false); if (r.ok) { setAsk(""); void refreshMockups(); } else setAskErr(r.error ?? ""); };
  const load = React.useCallback(async () => {
    const raw = await apiPost("/api/v1/codebase/design/snapshots", {});
    if (isNotWired(raw)) { setStatus("notwired"); return; }
    const d = unwrap(raw);
    if (!d || !Array.isArray(d.snapshots)) { setStatus("error"); return; }
    setData(d); setStatus(d.snapshots.some((s: Snap) => s.kind === "screen") ? "ok" : "empty");
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const screens = React.useMemo(() => (data?.snapshots ?? []).filter((s) => s.kind === "screen"), [data]);
  const current = React.useMemo(() => {
    if (!cur) return null;
    if (cur.kind === "code") { const s = screens.find((x) => x.name === cur.name); return s ? { title: s.name, html: s.html, base: s.name, editable: true } : null; }
    if (cur.kind === "mockup") { const m = mockups.find((x) => x.id === cur.id); const h = mockDocs[cur.id]; return m && h !== undefined ? { title: m.name, html: h, base: m.name, editable: true } : null; }
    const f = frames.find((x) => x.id === cur.id); return f ? { title: f.name, html: f.html, base: f.base, editable: true } : null;
  }, [cur, screens, frames, mockups, mockDocs]);
  React.useEffect(() => { if (!cur && !want && screens.length) setCur({ kind: "code", name: screens[0].name }); }, [cur, screens, want]);
  const dropMockup = async (m: Mockup) => { if (await removeMockup(m.id)) { if (cur?.kind === "mockup" && cur.id === m.id) setCur(null); void refreshMockups(); } };
  const curKey = cur ? (cur.kind === "code" ? `code:${cur.name}` : cur.kind === "mockup" ? `mockup:${cur.id}` : `mine:${cur.id}`) : "";
  React.useEffect(() => { setSel(null); setHover(null); setDirty(false); }, [curKey]);

  const doc = () => iframe.current?.contentDocument ?? null;
  const rect = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left * zoom, y: r.top * zoom, w: r.width * zoom, h: r.height * zoom }; };
  const pick = (e: React.MouseEvent) => { const d = doc(); if (!d) return null; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const el = d.elementFromPoint((e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom) as HTMLElement | null; return el && el !== d.body && el !== d.documentElement ? el : null; };

  // ── the editor's verbs — every edit is inline style on the frame's DOM
  const setStyle = (key: string, value: string) => { if (!sel) return; sel.style.setProperty(key, value); setDirty(true); setTick((t) => t + 1); };
  const hide = () => { if (!sel) return; sel.setAttribute("data-lf-hidden", "1"); setSel(null); setDirty(true); };
  const [editing, setEditing] = React.useState<HTMLElement | null>(null); // the layer whose text is being edited in place
  React.useEffect(() => { const h = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if ((e.key === "Backspace" || e.key === "Delete") && t.tagName !== "INPUT" && t.tagName !== "TEXTAREA" && !t.isContentEditable && sel && !editing) { sel.setAttribute("data-lf-hidden", "1"); setSel(null); setDirty(true); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [sel, editing]);
  // INLINE TEXT (operator 2026-09-18: "the edit text should be inline"): the layer itself becomes
  // editable in the frame — like Figma's double-click on a text layer. Enter or clicking away commits,
  // Escape restores. While editing, the overlay steps aside so the caret can be placed by mouse.
  const retype = () => {
    if (!sel || editing) return;
    const el = sel; const before = el.textContent ?? ""; const d = el.ownerDocument;
    el.setAttribute("contenteditable", "true"); el.style.outline = "none"; el.setAttribute("spellcheck", "false");
    setEditing(el);
    // ends on ⏎ / esc, or a click anywhere outside the layer — never on blur (focus flickers between the
    // host document and the frame while the overlay steps aside, and a blur there would commit too early)
    const finish = (keep: boolean) => { el.removeAttribute("contenteditable"); el.removeEventListener("keydown", onKey); d.removeEventListener("mousedown", onOutside, true); window.removeEventListener("mousedown", onOutside, true); if (!keep) el.textContent = before; else if (el.textContent !== before) setDirty(true); setEditing(null); setTick((t) => t + 1); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(true); } else if (e.key === "Escape") { e.preventDefault(); finish(false); } e.stopPropagation(); };
    const onOutside = (e: MouseEvent) => { if (!(e.target instanceof Node) || !el.contains(e.target)) finish(true); };
    el.addEventListener("keydown", onKey); d.addEventListener("mousedown", onOutside, true); window.addEventListener("mousedown", onOutside, true);
    el.focus();
    const r = d.createRange(); r.selectNodeContents(el); const s = d.defaultView?.getSelection(); s?.removeAllRanges(); s?.addRange(r);
  };
  const onDown = (e: React.MouseEvent, kind: "move" | "resize") => {
    if (!sel) return; e.preventDefault(); e.stopPropagation();
    const cs = sel.ownerDocument.defaultView!.getComputedStyle(sel);
    if (kind === "move" && cs.position === "static") sel.style.position = "relative";
    drag.current = { kind, el: sel, x: e.clientX, y: e.clientY, left: parseFloat(sel.style.left) || 0, top: parseFloat(sel.style.top) || 0, w: sel.getBoundingClientRect().width, h: sel.getBoundingClientRect().height };
  };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) { const el = pick(e); setHover(el && el !== sel ? el : null); return; }
    const dx = (e.clientX - d.x) / zoom, dy = (e.clientY - d.y) / zoom;
    if (d.kind === "move") { d.el.style.left = `${Math.round(d.left + dx)}px`; d.el.style.top = `${Math.round(d.top + dy)}px`; }
    else { d.el.style.width = `${Math.max(4, Math.round(d.w + dx))}px`; d.el.style.height = `${Math.max(4, Math.round(d.h + dy))}px`; }
    setDirty(true); setTick((t) => t + 1);
  };
  const onUp = () => { drag.current = null; };
  const onClick = (e: React.MouseEvent) => { if (drag.current) return; const el = pick(e); setSel(el); };

  // ── snapshots
  const save = (asNew: boolean) => {
    const d = doc(); if (!d || !current) return;
    const html = d.body.innerHTML;
    const existing = cur?.kind === "mine" ? frames.find((f) => f.id === cur.id) : null;
    const f: Frame = existing && !asNew ? { ...existing, html, updatedAt: Date.now() } : { id: mint(), name: nextName(current.base, frames), base: current.base, html, createdAt: Date.now(), updatedAt: Date.now(), width: d.documentElement.scrollWidth };
    const next = upsertFrame(frames, f); setFrames(next); writeFrames(ws, next); setCur({ kind: "mine", id: f.id }); setDirty(false);
    noteTimeline("saved", `design snapshot · ${f.name}`);
  };
  const rename = () => { if (cur?.kind !== "mine") return; const f = frames.find((x) => x.id === cur.id); if (!f) return; const v = prompt("snapshot name", f.name); if (!v) return; const next = upsertFrame(frames, { ...f, name: v, updatedAt: Date.now() }); setFrames(next); writeFrames(ws, next); };
  const remove = () => { if (cur?.kind !== "mine") return; const next = frames.filter((x) => x.id !== cur.id); setFrames(next); writeFrames(ws, next); setCur(screens.length ? { kind: "code", name: current?.base ?? screens[0].name } : null); };
  const exportHtml = () => { const d = doc(); if (!d || !current) return; const blob = new Blob([frameDoc(d.body.innerHTML, data?.css ?? "", data?.baseUrl)], { type: "text/html" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${current.title.replace(/[^\w.-]+/g, "_")}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const [urlDraft, setUrlDraft] = React.useState("");
  const capture = async (url: string) => {
    setRun({ phase: "capturing", url, msg: `reading the real screens from ${url}…` });
    const raw = await apiPost("/api/v1/codebase/design/capture", { url, crawl: true }, { timeoutMs: 180_000 });
    const r = unwrap(raw);
    if (!r?.ok) { setRun({ phase: "error", url, msg: String(r?.error ?? "capture failed") }); return; }
    setRun({ phase: "running", url, msg: `captured ${r.screens ?? 0} screen${r.screens === 1 ? "" : "s"} · ${r.components ?? 0} components · ${r.framework ?? ""}` });
    noteTimeline("opened", `design capture · ${r.screens ?? 0} screens`);
    await load();
  };
  const runAndCapture = async () => {
    const cur0 = await pollStatus();
    if (cur0?.url) { await capture(cur0.url); return; }
    setRun({ phase: "booting", url: null, msg: "booting the project's dev server…" });
    const r: any = await apiPost("/api/v1/pr/preview/start", { target: "root" }, { timeoutMs: 30_000 });
    const d = r?.result ?? r;
    if (!d?.ok) { setRun({ phase: "error", url: null, msg: String(d?.error ?? "could not boot the dev server — give the project a dev or start script in its package.json") }); return; }
    setRun({ phase: "booting", url: null, msg: `booting · ${d.cmd ?? "dev"}${d.docker ? " · docker" : ""}` });
    for (let i = 0; i < 60; i++) {
      await new Promise((res) => setTimeout(res, 1500));
      const s = await pollStatus();
      if (s?.url) { setRun({ phase: "running", url: s.url, msg: `running · ${s.url} · settling…` }); await new Promise((res) => setTimeout(res, 2500)); await capture(s.url); return; }
      if (s?.exited != null) { setRun({ phase: "error", url: null, msg: `the dev server exited (${s.exited}) — ${String(s.log ?? "").split("\n").slice(-3).join(" ")}` }); return; }
    }
    setRun({ phase: "error", url: null, msg: "the dev server never printed a URL — check its log on the Run pane" });
  };
  const stopRun = async () => { await apiPost("/api/v1/pr/preview/stop", { ref_slug: "root" }, { timeoutMs: 15_000 }); setRun({ phase: "idle", url: null, msg: "" }); };

  // CHANGES DETECTED (operator 2026-09-18): the delta between this frame's DOM and its code-based screen,
  // re-read after every edit — and the three ways out: a prompt on the clipboard, an RFC as .md, an agent.
  const baseScreen = React.useMemo(() => screens.find((s) => s.name === current?.base) ?? null, [screens, current?.base]);
  const changes = React.useMemo<FrameChange[]>(() => { const d = doc(); if (!d || !baseScreen) return []; return diffFrame(baseScreen.html, d.body.innerHTML); }, [tick, dirty, curKey, baseScreen]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeMeta = () => ({ screen: baseScreen?.name ?? current?.base ?? "screen", snapshot: current?.title ?? "snapshot", path: baseScreen?.path, framework: baseScreen?.framework, changes });
  const [copied, setCopied] = React.useState(false);
  const copyPrompt = async () => { try { await navigator.clipboard.writeText(changePrompt(changeMeta())); setCopied(true); setTimeout(() => setCopied(false), 1600); noteTimeline("saved", `design prompt · ${changes.length} changes`); } catch { /* clipboard blocked — the RFC download still works */ } };
  const downloadRfc = () => { const md = changeRfc(changeMeta()); const blob = new Blob([md], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `RFC-${(baseScreen?.name ?? "screen").replace(/[^A-Za-z0-9._-]+/g, "-")}-${(current?.title ?? "snapshot").replace(/[^A-Za-z0-9._-]+/g, "-")}.md`; a.click(); URL.revokeObjectURL(a.href); noteTimeline("saved", `design RFC · ${changes.length} changes`); };
  // → an agent in a NEW thread: the card opens prefilled with the prompt (the operator picks the scope), and the
  // prompt ends with the commit — the PR is opened from Pulls with this text as its description
  const sendToAgent = () => { window.dispatchEvent(new CustomEvent("antiloki:agent-card", { detail: { ask: changePrompt(changeMeta()), scope: baseScreen?.path ? [baseScreen.path] : [], thread: "new" } })); noteTimeline("opened", `design change → agent · ${changes.length} changes`); };

  const cs = sel ? sel.ownerDocument.defaultView?.getComputedStyle(sel) : null; void tick;
  const ancestors: HTMLElement[] = []; for (let p = sel?.parentElement; p && p.tagName !== "BODY" && ancestors.length < 5; p = p.parentElement) ancestors.unshift(p);
  const children = sel ? Array.from(sel.children).filter((c): c is HTMLElement => c instanceof HTMLElement).slice(0, 12) : [];

  const sideBtn = (on: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", background: on ? C.panel2 : "transparent", border: "none", borderLeft: `2px solid ${on ? C.brand : "transparent"}`, color: on ? C.fg : C.muted, padding: "5px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
  const tb: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: mono, fontSize: 10 };
  const lab: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, padding: "8px 10px 3px" };

  return (
    <div data-testid="design-frames" style={{ flex: 1, minHeight: 0, height: "100%", display: "grid", gridTemplateColumns: "190px 1fr 210px", background: C.panel, overflow: "hidden" }}>
      {/* frames — from code, and yours */}
      <div style={{ borderRight: `1px solid ${C.border}`, background: C.bg, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div style={lab}>mockups · made by agents · {mockups.length}</div>
        <form data-testid="frames-ask-form" onSubmit={(e) => { e.preventDefault(); void makeMockup(); }} style={{ padding: "0 10px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
          <textarea data-testid="frames-ask" aria-label="ask for a mockup" value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void makeMockup(); } }} rows={3} placeholder="ask for a mockup: a settings screen with…" style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 5, padding: "4px 6px", fontFamily: mono, fontSize: 10, resize: "vertical" }} />
          <button type="submit" data-testid="frames-ask-go" disabled={!ask.trim() || asking} style={{ ...tb, color: C.brand, borderColor: C.brand, alignSelf: "flex-start" }} title="a design agent makes it and it appears here">{asking ? "asking…" : "ask an agent"}</button>
          {askErr && <span data-testid="frames-ask-error" role="alert" style={{ fontFamily: mono, fontSize: 9, color: C.warn, lineHeight: 1.4 }}>{askErr}</span>}
        </form>
        {mockups.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "stretch" }}>
            <button data-testid={`frame-mockup-${m.id}`} data-status={m.status} onClick={() => { if (m.status === "done") setCur({ kind: "mockup", id: m.id }); }} title={m.error ?? m.ask} style={{ ...sideBtn(cur?.kind === "mockup" && cur.id === m.id), flex: 1, minWidth: 0, flexDirection: "column", alignItems: "flex-start", gap: 1, cursor: m.status === "done" ? "pointer" : "default" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{m.name}</span>
              <span style={{ fontSize: 8.5, color: m.status === "failed" ? C.warn : m.status === "working" ? C.brand : C.muted }}>{m.status === "working" ? "● " : ""}{mockupLine(m)}</span>
            </button>
            {m.status !== "working" && <button data-testid={`frame-mockup-drop-${m.id}`} aria-label={`delete ${m.name}`} onClick={() => void dropMockup(m)} style={{ ...tb, border: "none", padding: "0 6px" }}>×</button>}
          </div>
        ))}
        <div style={lab}>screens · from code</div>
        {status === "loading" && <div style={{ ...lab, textTransform: "none", color: C.muted }}>loading…</div>}
        {status === "notwired" && <div style={{ ...lab, textTransform: "none", color: C.warn }}>route not wired — restart the BE</div>}
        {status === "empty" && <div style={{ ...lab, textTransform: "none", letterSpacing: 0, color: C.muted, lineHeight: 1.5 }}>no screens captured yet — point the capture at your dev server below</div>}
        {screens.map((s) => <button key={s.name} data-testid={`frame-code-${s.name}`} onClick={() => setCur({ kind: "code", name: s.name })} style={sideBtn(cur?.kind === "code" && cur.name === s.name)} title={s.path}><span style={{ color: C.dim }}>▢</span>{s.name}</button>)}
        <div style={lab}>my snapshots · {frames.length}</div>
        {!frames.length && <div style={{ ...lab, textTransform: "none", letterSpacing: 0, color: C.muted, lineHeight: 1.5 }}>edit a screen, then “save as snapshot” — the code stays as it is</div>}
        {frames.map((f) => <button key={f.id} data-testid={`frame-mine-${f.id}`} onClick={() => setCur({ kind: "mine", id: f.id })} style={sideBtn(cur?.kind === "mine" && cur.id === f.id)} title={`from ${f.base} · ${new Date(f.updatedAt).toLocaleString()}`}><span style={{ color: C.brand }}>◆</span>{f.name}</button>)}
        {/* THE RUN BLOCK (operator 2026-09-19: "run and capture is not working … it should say so"): the
            reason sits ABOVE the button where it is visible (it used to sit below, under the trial pill),
            and when the dev script is not configured the capture can be pointed at a running URL instead. */}
        <div style={{ marginTop: "auto", padding: "10px 10px 40px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ ...lab, padding: 0 }}>the project · runs inside antiloki</div>
          <span data-testid="frames-run-msg" style={{ fontFamily: mono, fontSize: 9, color: run.phase === "error" ? C.warn : C.muted, lineHeight: 1.4 }}>{run.msg || "boots the workspace root's dev server (the project's dev or start script), then reads every screen's real DOM + CSS"}</span>
          <button onClick={() => void runAndCapture()} disabled={run.phase === "booting" || run.phase === "capturing"} data-testid="frames-run" style={{ ...tb, color: C.brand, borderColor: C.brand }}>{run.phase === "booting" ? "booting…" : run.phase === "capturing" ? "capturing…" : run.url ? "↻ capture the screens" : "▶ run and capture"}</button>
          {run.url && <button onClick={() => void stopRun()} style={tb}>■ stop the dev server</button>}
          {(run.phase === "error" || run.phase === "idle") && (
            <form data-testid="frames-url-form" onSubmit={(e) => { e.preventDefault(); const u = urlDraft.trim(); if (u) void capture(/^https?:\/\//.test(u) ? u : `http://${u}`); }} style={{ display: "flex", gap: 4 }}>
              <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="or a running URL · localhost:3000" data-testid="frames-url" style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 5, padding: "2px 6px", fontFamily: mono, fontSize: 9.5 }} />
              <button type="submit" disabled={!urlDraft.trim()} style={tb} title="read the screens from an app that is already running">capture</button>
            </form>
          )}
        </div>
      </div>

      {/* the canvas */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: `1px solid ${C.border}`, background: C.bg, fontFamily: mono, fontSize: 10.5 }}>
          <span style={{ color: C.fg, fontWeight: 700 }}>{current?.title ?? "—"}</span>
          {cur?.kind === "mine" && <span style={{ color: C.muted }}>from {current?.base}</span>}
          {cur?.kind === "mockup" && <span style={{ color: C.muted }}>made by an agent</span>}
          {dirty && <span style={{ color: C.warn }}>· edited</span>}
          <span style={{ flex: 1 }} />
          <button onClick={() => setZoom((z) => Math.max(0.2, +(z - 0.1).toFixed(2)))} style={tb}>−</button><span style={{ color: C.dim, width: 34, textAlign: "center" }}>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} style={tb}>+</button>
          <button onClick={() => save(true)} disabled={!current} title={current ? "save a copy of this frame as a snapshot" : "pick or capture a frame first"} data-testid="frame-save-new" style={{ ...tb, color: C.brand, borderColor: C.brand }}>save as snapshot</button>
          {cur?.kind === "mine" && <button onClick={() => save(false)} disabled={!dirty} style={tb}>save</button>}
          {cur?.kind === "mine" && <button onClick={rename} style={tb}>rename</button>}
          {cur?.kind === "mine" && <button onClick={remove} style={tb}>delete</button>}
          {cur?.kind === "mine" && <button onClick={() => setCur({ kind: "code", name: current!.base })} style={tb} title="back to the code-based screen">↺ code</button>}
          <button onClick={exportHtml} disabled={!current} style={tb}>export html</button>
        </div>
        {changes.length > 0 && (
          <div data-testid="frame-changes" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: `1px solid ${C.border}`, background: `color-mix(in oklab, ${C.warn} 8%, ${C.bg})`, fontFamily: mono, fontSize: 10.5 }}>
            <span style={{ color: C.warn, fontWeight: 700 }}>{changes.length} change{changes.length === 1 ? "" : "s"} detected</span>
            <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{changes.slice(0, 3).map((c) => `${c.kind} ${c.layer}`).join(" · ")}{changes.length > 3 ? " …" : ""}</span>
            <button onClick={() => void copyPrompt()} data-testid="frame-copy-prompt" style={tb} title="a very detailed prompt: every selector, every property before → after, how to implement it in source">{copied ? "copied ✓" : "copy prompt"}</button>
            <button onClick={downloadRfc} data-testid="frame-download-rfc" style={tb} title="the same delta as an RFC document (markdown)">download RFC .md</button>
            <button onClick={sendToAgent} data-testid="frame-send-agent" style={{ ...tb, color: C.brand, borderColor: C.brand }} title="a new thread with an agent: the prompt is its ask; it implements the change, commits, and the PR is opened from Pulls">→ agent · PR</button>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: `repeating-conic-gradient(${C.panel} 0 25%, ${C.bg} 0 50%) 0 0 / 16px 16px` }}>
          {current ? (
            <div style={{ position: "relative", width: 1280 * zoom, height: 900 * zoom, margin: 24 }}>
              <iframe ref={iframe} title={current.title} srcDoc={frameDoc(current.html, data?.css ?? "", data?.baseUrl)} onLoad={() => { setSel(null); setTick((t) => t + 1); }}
                style={{ width: 1280, height: 900, border: "none", background: "#fff", transform: `scale(${zoom})`, transformOrigin: "0 0", display: "block", boxShadow: "0 20px 60px rgba(0,0,0,.45)" }} />
              {/* the interaction layer — Figma-style: hover outline, selection with handles, drag to move, corner to resize */}
              <div data-testid="frame-overlay" onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onClick={onClick} onDoubleClick={retype} style={{ position: "absolute", inset: 0, cursor: sel ? "default" : "crosshair", pointerEvents: editing ? "none" : "auto" }}>
                {hover && <div style={{ position: "absolute", ...(() => { const r = rect(hover); return { left: r.x, top: r.y, width: r.w, height: r.h }; })(), outline: `1px solid ${C.brand}`, outlineOffset: -1, pointerEvents: "none", opacity: 0.6 }} />}
                {sel && !editing && (() => { const r = rect(sel); return (
                  <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, outline: `1.5px solid ${C.brand}`, outlineOffset: -1 }} onMouseDown={(e) => onDown(e, "move")}>
                    <span style={{ position: "absolute", top: -18, left: -1, background: C.brand, color: C.bg, fontFamily: mono, fontSize: 9, padding: "1px 5px", borderRadius: 3, whiteSpace: "nowrap" }}>{layerName(sel)} · {Math.round(r.w / zoom)}×{Math.round(r.h / zoom)}</span>
                    <span onMouseDown={(e) => onDown(e, "resize")} style={{ position: "absolute", right: -5, bottom: -5, width: 9, height: 9, background: C.bg, border: `1.5px solid ${C.brand}`, cursor: "nwse-resize" }} />
                  </div>
                ); })()}
              </div>
            </div>
          ) : <div style={{ padding: 24, fontFamily: mono, fontSize: 10.5, color: C.muted }}>{status === "ok" ? "pick a screen on the left" : ""}</div>}
        </div>
      </div>

      {/* inspector */}
      <div style={{ borderLeft: `1px solid ${C.border}`, background: C.bg, overflow: "auto", fontFamily: mono, fontSize: 10.5 }}>
        <div style={lab}>layer</div>
        {!sel && <div style={{ padding: "0 10px 8px", color: C.muted, lineHeight: 1.5 }}>click an element on the frame · drag to move · corner handle to resize · double-click to edit its text in place (⏎ commits, esc restores) · ⌫ hides</div>}
        {sel && (
          <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
            {ancestors.map((a, i) => <button key={i} onClick={() => setSel(a)} style={{ ...sideBtn(false), padding: "1px 0", borderLeft: "none", color: C.muted }}>{"·".repeat(i)} {layerName(a)}</button>)}
            <div style={{ color: C.fg, fontWeight: 700 }}>{layerName(sel)}</div>
            {children.map((c, i) => <button key={i} onClick={() => setSel(c)} style={{ ...sideBtn(false), padding: "1px 0 1px 10px", borderLeft: "none" }}>↳ {layerName(c)}</button>)}
          </div>
        )}
        {sel && cs && (<>
          <div style={lab}>box</div>
          <div style={{ padding: "0 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, color: C.dim }}>
            <span>w <b style={{ color: C.fg }}>{Math.round(sel.getBoundingClientRect().width)}</b></span><span>h <b style={{ color: C.fg }}>{Math.round(sel.getBoundingClientRect().height)}</b></span>
            <span>x <b style={{ color: C.fg }}>{Math.round(sel.getBoundingClientRect().left)}</b></span><span>y <b style={{ color: C.fg }}>{Math.round(sel.getBoundingClientRect().top)}</b></span>
          </div>
          <div style={lab}>properties</div>
          <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
            {PROPS.map((p) => { const v = cs.getPropertyValue(p.key); return (
              <label key={p.key} style={{ display: "grid", gridTemplateColumns: "62px 1fr", alignItems: "center", gap: 6, color: C.dim }}>
                <span>{p.label}</span>
                {p.kind === "color"
                  ? <span style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="color" value={toHex(v)} onChange={(e) => setStyle(p.key, e.target.value)} style={{ width: 22, height: 18, padding: 0, border: `1px solid ${C.border}`, background: "transparent", borderRadius: 3 }} /><span style={{ color: C.muted, fontSize: 9.5 }}>{toHex(v)}</span></span>
                  : <input defaultValue={p.kind === "number" ? parseFloat(v) || 0 : v} key={`${p.key}-${tick}`} onBlur={(e) => setStyle(p.key, p.kind === "number" ? `${e.target.value}${p.unit ?? ""}` : e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 4, padding: "2px 6px", fontFamily: mono, fontSize: 10.5, outline: "none" }} />}
              </label>
            ); })}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}><button onClick={retype} style={tb} disabled={!!editing}>{editing ? "editing… ⏎" : "edit text"}</button><button onClick={hide} style={tb}>hide</button><button onClick={() => { if (sel) { sel.removeAttribute("style"); setDirty(true); setTick((t) => t + 1); } }} style={tb} title="drop this layer's edits">reset</button></div>
          </div>
        </>)}
        <div style={lab}>about</div>
        <div style={{ padding: "0 10px 12px", color: C.muted, lineHeight: 1.5 }}>the base is the real rendered screen — deterministic, from the code. Edits are design, not code: save them as snapshots, hand them to an agent as intent, or export the HTML.</div>
      </div>
    </div>
  );
}
