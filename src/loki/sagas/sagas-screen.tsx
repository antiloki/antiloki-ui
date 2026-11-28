import * as React from "react";
import { RunPanel } from "./run-panel";
import { C } from "@/loki/theme";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { reasonOf } from "@/loki/api/post-strict";
import { apiGet } from "@/loki/api/client";
import { getSaga, getEpisode, listSagas, runSaga, write, type SagaDetail, type EpisodeDetail } from "./api";
import { btn, font, input, Meter, primary, Row, Seats, StatusIcon, Trail } from "./parts";
import { Board } from "./board";
import { Changes } from "./changes";
import { Faces, ModelIcon, Who } from "./model-icon";
import { actorLabel, ago, boardMove, canClose, episodeRows, fmtMs, fmtUsd, group, nextStatus, ordered, originWord, progress, STATUSES, STATUS_WORD, episodesToMove, type Saga, type Status, type Episode } from "./model";

// SAGAS (operator 2026-10-11): a third screen next to Cowork and X-ray. The list of sagas, a saga with its episodes, an episode with its steps - in the shape of Linear's issues page, for a team of
// one person and their agents. The activity trail names who did each step; the numbers (time, cost, seat) come from the real runs.

type View = { kind: "list" } | { kind: "saga"; id: number; ws?: string } | { kind: "episode"; id: number; saga: number; ws?: string };
/** The workspace a page is about: `ws` names one (a saga of another workspace than the open one); `all` lists every workspace; `embedded` is the pane inside Cowork (the open workspace, no URL). */
const WsContext = React.createContext<{ ws: string; all: boolean; embedded: boolean }>({ ws: "", all: false, embedded: false });
const useWs = () => React.useContext(WsContext);

/** Re-reads `load` now and every `ms` while mounted (the live numbers of a running saga). */
/** What a polled page showed last, for the life of the page (the operator 2026-11-18: "sagas still slow, not instant"): opening it paints this at once and the fresh answer replaces it. */
const SEEN = new Map<string, unknown>();
/** For tests: forget what the pages showed last. */
export const forgetSeen = () => SEEN.clear();
function usePolled<T>(load: () => Promise<T | null>, deps: unknown[], ms = 4000, key?: string) {
  const [data, setDataRaw] = React.useState<T | null>(() => (key ? ((SEEN.get(key) as T | undefined) ?? null) : null));
  const setData = (d: T | null) => { if (key && d) SEEN.set(key, d); setDataRaw(d); };
  React.useEffect(() => { setDataRaw(key ? ((SEEN.get(key) as T | undefined) ?? null) : null); }, [key]);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let dead = false;
    const run = async () => { const d = await load(); if (!dead && d) setData(d); };
    void run();
    const h = setInterval(() => void run(), ms);
    return () => { dead = true; clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, reload: () => setTick((n) => n + 1) };
}

const wrap: React.CSSProperties = { fontFamily: font, color: C.fg, display: "flex", flexDirection: "column", minHeight: 0, flex: 1, overflow: "auto" };
/** IN A PANE THE SAGAS ARE GLASS, LIKE EVERY OTHER PANE (operator 2026-11-21: the list and a saga showed the wallpaper bare): the pane's own translucent surface and blur, the same as the folded strip and the team menu. */
const glass: React.CSSProperties = { background: "color-mix(in srgb, var(--c-panel) min(var(--cw-pane, 100%), 70%), transparent)", backdropFilter: "blur(var(--cw-blur, 10px))", WebkitBackdropFilter: "blur(var(--cw-blur, 10px))" };
const col: React.CSSProperties = { maxWidth: 1080, width: "100%", margin: "0 auto", padding: "56px 28px 80px" };
const crumbBtn: React.CSSProperties = { background: "none", border: "none", color: C.dim, cursor: "pointer", font: "inherit", fontSize: 13, padding: 0 };

/** `#saga/3` and `#episode/10/3` (episode, then its saga) open that page, so a view can be linked to and reloaded. Pure - tested. */
export function parseView(hash: string): View {
  const m = hash.replace(/^#/, "").split("/");
  const id = (x?: string) => (x && /^\d+$/.test(x) ? Number(x) : 0);
  const ws = (x?: string) => { try { return x ? decodeURIComponent(x) : undefined; } catch { return undefined; } };
  if (m[0] === "saga" && id(m[1])) return { kind: "saga", id: id(m[1]), ...(m[2] ? { ws: ws(m[2]) } : {}) };
  if (m[0] === "episode" && id(m[1]) && id(m[2])) return { kind: "episode", id: id(m[1]), saga: id(m[2]), ...(m[3] ? { ws: ws(m[3]) } : {}) };
  return { kind: "list" };
}
export function hashOf(v: View): string {
  const w = (x?: string) => (x ? `/${encodeURIComponent(x)}` : "");
  return v.kind === "saga" ? `#saga/${v.id}${w(v.ws)}` : v.kind === "episode" ? `#episode/${v.id}/${v.saga}${w(v.ws)}` : "";
}

/** THE SAGAS SCREEN: the page lists the sagas of EVERY workspace (each says which it is in); `embedded` is the Sagas pane inside Cowork, for the open workspace. */
export function SagasScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const readBoard = () => { try { return localStorage.getItem("antiloki.sagas.mode") === "board"; } catch { return false; } };
  const [wide, setWide] = React.useState<boolean>(readBoard); React.useEffect(() => { const h = () => setWide(readBoard()); window.addEventListener("antiloki-sagas-mode", h); return () => window.removeEventListener("antiloki-sagas-mode", h); }, []);
  const [view, setViewRaw] = React.useState<View>(() => (!embedded && typeof location !== "undefined" ? parseView(location.hash) : { kind: "list" }));
  const setView = (v: View) => { setViewRaw(v); if (embedded) return; try { history.replaceState(null, "", location.pathname + location.search + hashOf(v)); } catch { /* a view still works without a URL */ } };
  const ws = view.kind === "list" ? "" : view.ws ?? "";
  return (
    <WsContext.Provider value={{ ws, all: !embedded, embedded }}>
      <div data-testid={embedded ? "sagas-pane" : "sagas-screen"} style={embedded ? { ...wrap, ...glass } : { ...wrap, ...glass, margin: 8, borderRadius: 10, border: `1px solid ${C.border}` }}>
        <div style={embedded ? { ...col, maxWidth: "none", padding: "14px 16px 24px" } : wide ? { ...col, maxWidth: "none", padding: "40px 28px 60px" } : col}>
          {!embedded && <button data-testid="sagas-back" onClick={() => { try { if (history.length > 1) { history.back(); return; } } catch { /* none */ } location.assign("/"); }} style={{ ...crumbBtn, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10 }}>← Back</button>}
          {view.kind === "list" && <ListView onOpen={(id, w) => setView({ kind: "saga", id, ...(w ? { ws: w } : {}) })} />}
          {view.kind === "saga" && <SagaView id={view.id} onBack={() => setView({ kind: "list" })} onEpisode={(id) => setView({ kind: "episode", id, saga: view.id, ...(view.ws ? { ws: view.ws } : {}) })} />}
          {view.kind === "episode" && <EpisodeView id={view.id} onBack={() => setView({ kind: "saga", id: view.saga, ...(view.ws ? { ws: view.ws } : {}) })} onList={() => setView({ kind: "list" })} onEpisode={(id) => setView({ kind: "episode", id, saga: view.saga, ...(view.ws ? { ws: view.ws } : {}) })} />}
        </div>
      </div>
    </WsContext.Provider>
  );
}

// ------------------------------------------------------------------------------------------------------------------ the list
function ListView({ onOpen }: { onOpen: (id: number, ws?: string) => void }) {
  const { all, embedded } = useWs(); const wr: typeof write = (op, body) => write(op, body);
  const { data, reload } = usePolled<Saga[]>(() => listSagas(all), [all], 4000, `sagas:${all}`);
  const [wsFilter, setWsFilter] = React.useState("");
  // LIST OR BOARD (operator 2026-11-10): the same sagas either way; the choice is remembered
  const [mode, setModeRaw] = React.useState<"list" | "board">(() => { try { return localStorage.getItem("antiloki.sagas.mode") === "board" ? "board" : "list"; } catch { return "list"; } });
  const setMode = (m: "list" | "board") => { setModeRaw(m); try { localStorage.setItem("antiloki.sagas.mode", m); } catch { /* fine */ } window.dispatchEvent(new Event("antiloki-sagas-mode")); };
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [err, setErr] = React.useState("");
  const create = async () => {
    if (!title.trim()) { setErr("give the saga a title first: the work you want done"); return; }   // Grokbot QA 2026-10-12, item 39: Enter on an empty title did nothing, silently
    try { const d = await wr<SagaDetail>("create", { title }); setTitle(""); setAdding(false); setErr(""); reload(); if (d?.saga) onOpen(d.saga.id); } catch (e) { setErr(reasonOf(e)); }
  };
  const workspaces = [...new Set((data ?? []).map((x) => x.workspace).filter((w): w is string => !!w))].sort();
  const showWs = all && workspaces.length > 1;
  const groups = group((data ?? []).filter((x) => !wsFilter || x.workspace === wsFilter));
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: embedded ? 14 : 22 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Sagas <span style={{ color: C.muted, fontWeight: 400, fontSize: 15 }}>{data ? data.length : ""}</span></h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div role="group" aria-label="view" style={{ display: "flex" }}>
            {(["list", "board"] as const).map((m) => <button key={m} data-testid={`saga-mode-${m}`} aria-pressed={mode === m} onClick={() => setMode(m)} style={{ ...btn, borderRadius: m === "list" ? "7px 0 0 7px" : "0 7px 7px 0", background: mode === m ? C.hover : "transparent", color: mode === m ? C.fg : C.dim }}>{m}</button>)}
          </div>
          <button data-testid="saga-new" style={primary} onClick={() => setAdding(true)}>+ New saga</button>
        </div>
      </div>
      {adding && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input data-testid="saga-new-title" autoFocus style={input} placeholder="A title for the work to be done" value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void create(); if (e.key === "Escape") { setAdding(false); setTitle(""); } }} />
          <button data-testid="saga-create" style={primary} disabled={!title.trim()} title={title.trim() ? undefined : "give the saga a title first"} onClick={() => void create()}>Create</button>
          <button style={btn} onClick={() => { setAdding(false); setTitle(""); }}>Cancel</button>
        </div>
      )}
      {err && <div role="alert" style={{ color: C.bad, fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {showWs && (
        <div data-testid="saga-workspaces" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {["", ...workspaces].map((w) => <button key={w || "all"} data-testid={`saga-ws-${w || "all"}`} aria-pressed={wsFilter === w} onClick={() => setWsFilter(w)} style={{ ...btn, padding: "2px 10px", fontSize: 12, borderColor: wsFilter === w ? C.brand : C.border, color: wsFilter === w ? C.brand : C.muted }}>{w || "all workspaces"} <span style={{ opacity: 0.65 }}>{(data ?? []).filter((x) => !w || x.workspace === w).length}</span></button>)}
        </div>
      )}
      {data && data.length === 0 && !adding && (
        <div data-testid="sagas-empty" data-tour="sagas-list" style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "36px 24px", textAlign: "center", color: C.dim, lineHeight: 1.6 }}>
          <div style={{ fontSize: 16, color: C.fg, marginBottom: 6 }}>No sagas yet</div>
          A saga is a goal and the episodes that get it done. Write one, or just ask an agent for something: the plan it makes shows up here as a saga.
        </div>
      )}
      {data === null && <div style={{ color: C.muted }}>reading this project's sagas…</div>}
      {mode === "board" && data && data.length > 0 && (
        <Board sagas={data.filter((x) => !wsFilter || x.workspace === wsFilter)} showWs={showWs} onOpen={(x) => onOpen(x.id, x.workspace)} onMove={async (x, to) => {
          const v = boardMove(x.status, to, x.rollup.episodes - x.rollup.canceled > 0); if (!v.ok) return v.why;
          try {
            const ws = x.workspace; const w = (op: Parameters<typeof write>[0], body: Record<string, unknown>) => write(op, body, ws);
            if (v.kind === "cancel") await w("update", { id: x.id, status: "canceled" }); else if (v.kind === "reopen") await w("update", { id: x.id, status: "todo" });
            else { const d = await getSaga(x.id, ws); for (const id of episodesToMove(v.kind, d?.episodes ?? [])) await w("episode-update", { id, status: v.kind === "start" ? "doing" : "done" }); }
            reload(); return null;
          } catch (e) { return reasonOf(e); }
        }} />
      )}
      <div data-tour="sagas-list" style={mode === "board" ? { display: "none" } : undefined}>
      {groups.map((g) => (
        <section key={g.status} style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", color: C.dim, fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
            <StatusIcon status={g.status} size={14} /> {STATUS_WORD[g.status]} <span style={{ color: C.muted }}>{g.items.length}</span>
          </div>
          {g.items.map((s) => <SagaRow key={`${s.workspace ?? ""}:${s.id}`} s={s} showWs={showWs} onOpen={() => onOpen(s.id, s.workspace)} />)}
        </section>
      ))}
      </div>
    </>
  );
}
function SagaRow({ s, onOpen, showWs = false }: { s: Saga; onOpen: () => void; showWs?: boolean }) {
  const r = s.rollup; const seats = Object.keys(r.seats);
  return (
    <div data-testid={`saga-row-${s.id}`} data-ws={s.workspace ?? ""} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <StatusIcon status={s.status} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>{s.title}</span>
      {showWs && s.workspace && <span data-testid="saga-ws-chip" title="the workspace this saga is in" style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 8px", whiteSpace: "nowrap" }}>{s.workspace}</span>}
      {s.meta?.kind === "episode" && <span data-testid="saga-episode-chip" title={`an episode of ${s.meta.pane}'s work`} style={{ fontSize: 11, color: C.ok, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 8px", whiteSpace: "nowrap" }}>{s.meta.pane || "agent"}{s.meta.open ? " · open" : ""}</span>}
      {s.origin === "heimdall" && <span title="planned by Heimdall from an ask" style={{ fontSize: 11, color: C.brand, border: `1px solid ${C.border}`, borderRadius: 999, padding: "0 8px" }}>plan</span>}
      <Faces agents={r.agents} />
      {seats.length > 0 && <Seats seats={r.seats} size={17} />}
      <span data-testid={`saga-progress-${s.id}`} style={{ fontSize: 12, color: C.dim, minWidth: 34, textAlign: "right" }}>{progress(r)}</span>
      <span style={{ fontSize: 12, color: C.muted, minWidth: 46, textAlign: "right" }}>{fmtUsd(r.usd)}</span>
      <span style={{ fontSize: 12, color: C.muted, minWidth: 62, textAlign: "right" }}>{ago(s.updated_ms)}</span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ a saga
function Crumbs({ items, back }: { items: { label: string; on?: () => void }[]; back?: { label: string; on: () => void } }) {
  return <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 22, color: C.muted, fontSize: 13 }}>
    {back && <button data-testid="back" onClick={back.on} title={`back to ${back.label}`} style={{ ...btn, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 6, marginRight: 8 }}>← {back.label}</button>}
    {items.map((c, i) => <React.Fragment key={i}>{i > 0 && <span>›</span>}{c.on ? <button style={crumbBtn} onClick={c.on}>{c.label}</button> : <span style={{ color: C.fg }}>{c.label}</span>}</React.Fragment>)}</div>;
}
/** Sizes a textarea to its own text: as tall as the text needs, never a scrollbar, never a drag handle. Exported for the test. */
export function fitHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}
/** A text that saves itself when you leave it (or press Enter, for a one-line one) and GROWS WITH ITS TEXT (operator 2026-10-11: "the description field on a saga is too small, it should adapt to the size of its text").
 *  The title is the same kind of box with one line to start: a long title wraps instead of being cut off. */
function Editable({ value, onSave, testId, placeholder, multiline, big }: { value: string; onSave: (v: string) => void; testId: string; placeholder?: string; multiline?: boolean; big?: boolean }) {
  const [v, setV] = React.useState(value);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => setV(value), [value]);
  React.useLayoutEffect(() => fitHeight(ref.current), [v]);
  React.useEffect(() => { const on = () => fitHeight(ref.current); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  const commit = () => { if (v.trim() !== value.trim() && (big ? v.trim() : true)) onSave(v); else setV(value); };
  const style: React.CSSProperties = { ...input, border: "1px solid transparent", padding: "4px 6px", margin: "0 -6px", width: "calc(100% + 12px)", fontSize: big ? 24 : 14, fontWeight: big ? 600 : 400, lineHeight: 1.5, resize: "none", overflow: "hidden", display: "block", minHeight: multiline ? 54 : undefined };
  const focus = (e: React.FocusEvent<any>) => (e.currentTarget.style.borderColor = C.border);
  const blur = (e: React.FocusEvent<any>) => { e.currentTarget.style.borderColor = "transparent"; commit(); };
  return <textarea ref={ref} data-testid={testId} rows={1} style={style} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onFocus={focus} onBlur={blur}
    onKeyDown={multiline ? undefined : (e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />;
}
function Side({ children }: { children: React.ReactNode }) {
  return <aside style={{ width: 270, flex: "0 0 auto", borderLeft: `1px solid ${C.border}`, paddingLeft: 24, display: "grid", gap: 22, alignContent: "start" }}>{children}</aside>;
}
const H: React.CSSProperties = { fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 10px", fontWeight: 600 };

function SagaView({ id, onBack, onEpisode }: { id: number; onBack: () => void; onEpisode: (id: number) => void }) {
  const { ws } = useWs(); const wr: typeof write = (op, body) => write(op, body, ws || undefined);
  const { data, reload } = usePolled<SagaDetail>(() => getSaga(id, ws || undefined), [id, ws], 4000, `saga:${ws}:${id}`);
  useTourUnlock("saga", !!data);   // the three steps of a saga page, the first time one is opened
  const [title, setTitle] = React.useState("");
  const [err, setErr] = React.useState("");
  const [sure, setSure] = React.useState(false); const [starting, setStarting] = React.useState(false);
  if (!data) return <><Crumbs back={{ label: "Sagas", on: onBack }} items={[{ label: "Sagas", on: onBack }]} /><div style={{ color: C.muted }}>reading the saga…</div></>;
  const s = data.saga;
  const run = async (f: () => Promise<unknown>) => { try { await f(); setErr(""); reload(); } catch (e) { setErr(reasonOf(e)); } };
  const add = () => { if (!title.trim()) return; const t = title; setTitle(""); void run(() => wr("episode-create", { saga_id: id, title: t })); };
  const titles: Record<number, string> = {}; const walk = (ts: Episode[]) => ts.forEach((t) => { titles[t.id] = t.title; walk(t.steps ?? []); }); walk(data.episodes);
  return (
    <>
      <Crumbs back={{ label: "Sagas", on: onBack }} items={[{ label: "Sagas", on: onBack }, { label: s.title }]} />
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <Editable big testId="saga-title" value={s.title} onSave={(v) => void run(() => wr("update", { id, title: v }))} />
          <div style={{ height: 8 }} />
          <Editable multiline testId="saga-objective" value={s.objective} placeholder="What is this saga for? (a line or two)" onSave={(v) => void run(() => wr("update", { id, objective: v }))} />
          {err && <div role="alert" style={{ color: C.bad, fontSize: 13, margin: "10px 0" }}>{err}</div>}
          <h3 style={{ ...H, margin: "28px 0 8px" }}>Episodes <span style={{ color: C.muted, fontWeight: 400 }}>{progress(data.rollup)}</span></h3>
          <div data-tour="saga-episodes" style={{ borderTop: `1px solid ${C.border}` }}>
            {ordered(data.episodes).map((t) => <EpisodeRow key={t.id} t={t} onOpen={() => onEpisode(t.id)} onCycle={() => void run(() => wr("episode-update", { id: t.id, status: nextStatus(t.status) }))} />)}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.muted, width: 16, textAlign: "center" }}>+</span>
              <input data-testid="episode-new-title" style={{ ...input, border: "none", padding: "2px 0" }} placeholder="Add an episode" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
            </div>
          </div>
          {(data.changes?.length ?? 0) > 0 && <div data-tour="saga-changes"><h3 style={{ ...H, margin: "34px 0 12px" }}>Changes</h3><Changes changes={data.changes!} workspace={s.workspace} episodeTitles={titles} /></div>}
          <h3 style={{ ...H, margin: "34px 0 12px" }}>Activity</h3>
          <div data-tour="saga-activity"><Trail events={data.events} episodeTitles={titles} /></div>
        </div>
        <Side>
          <div><h3 style={H}>Properties</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <Row k="status"><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><StatusIcon status={s.status} size={14} />{STATUS_WORD[s.status]}</span></Row>
              {s.workspace && <Row k="workspace" v={s.workspace} />}
              <Row k="origin" v={originWord(s.origin)} />
              {episodeRows(s.meta).map((r) => <Row key={r.k} k={r.k} v={r.v} />)}
              {s.confidence && <Row k="confidence" v={s.confidence} />}
              <Row k="created" v={ago(s.created_ms)} /><Row k="updated" v={ago(s.updated_ms)} />
            </div></div>
          {s.status !== "done" && s.status !== "failed" && (!s.plan_ref || s.plan_ref.startsWith("run:")) && <div data-tour="saga-run"><h3 style={H}>Run</h3><RunPanel saga={s} episodes={data.episodes} busy={starting} onSet={(patch) => void run(() => wr("update", { id, ...patch }))} onRun={() => { setStarting(true); void run(() => runSaga(id, ws || undefined)).finally(() => setStarting(false)); }} onStop={() => void run(() => runSaga(id, ws || undefined, "stop"))} /></div>}
          <div data-tour="saga-telemetry"><h3 style={H}>Telemetry</h3><Meter r={data.rollup} /></div>
          {/* A FINISHED SAGA IS PART OF THE RECORD (operator 2026-10-11): done and failed ones can be neither canceled nor deleted; a canceled one can only be reopened. Only an open saga offers both. */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canClose(s.status) && <button data-testid="saga-cancel" style={btn} onClick={() => void run(() => wr("update", { id, status: "canceled" }))}>Cancel saga</button>}
            {s.status === "canceled" && <button data-testid="saga-reopen" style={btn} onClick={() => void run(() => wr("update", { id, status: "todo" }))}>Reopen</button>}
            {canClose(s.status) && (!sure ? <button data-testid="saga-delete" style={{ ...btn, color: C.bad }} onClick={() => setSure(true)}>Delete…</button>
              : <button data-testid="saga-delete-yes" style={{ ...btn, color: "#fff", background: C.bad, borderColor: C.bad }} onClick={() => void run(async () => { await wr("delete", { id }); onBack(); })}>Really delete it and its episodes</button>)}
          </div>
        </Side>
      </div>
    </>
  );
}
/** THE NAMES AN ASSIGNEE CAN BE (Grokbot QA 2026-10-12, item 31: "the assignee dropdown doesn't list existing agents"). `you` and `heimdall` always; then this project's agents, by the name they go by. Free text stays allowed. Pure over the roster rows - tested. */
export function assigneeOptions(rows: any, live?: any): string[] {
  const out = ["you", "heimdall"];
  for (const a of Array.isArray(rows) ? rows : []) { const n = String(a?.slug ?? a?.name ?? "").trim(); if (n && !out.includes(n)) out.push(n); }
  // FORKS ARE NOT ROSTER ROWS (Grokbot QA round 2, item 10: "missing forked agents (wayward alibi)"): the roster lists the recipes (Main among them); a fork is an open pane, listed by `agents/live` with `forked_from`,
  // under the two-word name the tab strip shows.
  for (const a of Array.isArray(live) ? live : []) { if (Number(a?.forked_from) > 0) { const n = String(a?.name || a?.key || "").trim(); if (n && !out.includes(n)) out.push(n); } }
  return out;
}
function useAssignees(): string[] {
  const [names, setNames] = React.useState<string[]>(() => assigneeOptions([]));
  React.useEffect(() => {
    let off = false;
    void (async () => {
      let roster: any = null, live: any = null;
      try { const r: any = await apiGet("/api/v1/cockpit/agents/roster"); roster = (r?.result ?? r)?.agents; } catch { /* the fixed names stay */ }
      try { const r: any = await apiGet("/api/v1/cockpit/agents/live"); live = (r?.result ?? r)?.agents; } catch { /* no forks to offer */ }
      if (!off) setNames(assigneeOptions(roster, live));
    })();
    return () => { off = true; };
  }, []);
  return names;
}
function EpisodeRow({ t, onOpen, onCycle }: { t: Episode; onOpen: () => void; onCycle: () => void }) {
  const subs = t.steps ?? [];
  return (
    <>
      <div data-testid={`episode-row-${t.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: `1px solid ${C.border}` }}>
        <span data-testid={`episode-status-${t.id}`}><StatusIcon status={t.status} onClick={onCycle} title={`${STATUS_WORD[t.status]} → ${STATUS_WORD[nextStatus(t.status)]} (click)`} /></span>
        <span onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} style={{ flex: 1, minWidth: 0, cursor: "pointer", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: t.status === "canceled" ? "line-through" : "none", color: t.status === "done" ? C.dim : C.fg }}>{t.title}</span>
        {subs.length > 0 && <span style={{ fontSize: 12, color: C.muted }}>{subs.filter((s) => s.status === "done").length}/{subs.length}</span>}
        <span style={{ fontSize: 12, color: C.muted }}>{fmtMs(t.ms_total) !== "—" ? fmtMs(t.ms_total) : ""}</span>
        <span style={{ fontSize: 12, color: C.muted, minWidth: 40, textAlign: "right" }}>{fmtUsd(t.usd_total) !== "—" ? fmtUsd(t.usd_total) : ""}</span>
        <Who assignee={t.assignee} engine={t.engine} model={t.model} status={t.status} />
      </div>
      {subs.map((k) => (
        <div key={k.id} data-testid={`episode-row-${k.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 4px 7px 30px", borderBottom: `1px solid ${C.border}`, background: "rgba(127,127,127,.04)" }}>
          <StatusIcon status={k.status} size={14} />
          <span onClick={() => onOpenSub(k.id)} style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.title}</span>
          <Who assignee={k.assignee} engine={k.engine} model={k.model} status={k.status} size={18} />
        </div>
      ))}
    </>
  );
  function onOpenSub(_id: number) { onOpen(); }
}

// ------------------------------------------------------------------------------------------------------------------ an episode
function EpisodeView({ id, onBack, onList, onEpisode }: { id: number; onBack: () => void; onList: () => void; onEpisode: (id: number) => void }) {
  const assignees = useAssignees();
  const { ws } = useWs(); const wr: typeof write = (op, body) => write(op, body, ws || undefined);
  const { data, reload } = usePolled<EpisodeDetail>(() => getEpisode(id, ws || undefined), [id, ws], 4000, `episode:${ws}:${id}`);
  const [title, setTitle] = React.useState("");
  const [err, setErr] = React.useState("");
  const [sure, setSure] = React.useState(false);
  if (!data) return <><Crumbs back={{ label: "saga", on: onBack }} items={[{ label: "Sagas", on: onList }]} /><div style={{ color: C.muted }}>reading the episode…</div></>;
  const t = data.episode; const isSub = t.parent_id != null;
  const run = async (f: () => Promise<unknown>) => { try { await f(); setErr(""); reload(); } catch (e) { setErr(reasonOf(e)); } };
  const set = (patch: Record<string, unknown>) => void run(() => wr("episode-update", { id, ...patch }));
  const add = () => { if (!title.trim()) return; const x = title; setTitle(""); void run(() => wr("episode-create", { saga_id: t.saga_id, parent_id: id, title: x })); };
  const titles: Record<number, string> = {}; data.steps.forEach((k) => (titles[k.id] = k.title));   // the page's own episode is not repeated on every line
  return (
    <>
      <Crumbs back={{ label: data.saga.title ?? "saga", on: onBack }} items={[{ label: "Sagas", on: onList }, { label: data.saga.title ?? "saga", on: onBack }, { label: t.title }]} />
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <StatusIcon status={t.status} size={22} onClick={() => set({ status: nextStatus(t.status) })} />
            <div style={{ flex: 1 }}><Editable big testId="episode-title" value={t.title} onSave={(v) => set({ title: v })} /></div>
          </div>
          <div style={{ height: 8 }} />
          <Editable multiline testId="episode-body" value={t.body} placeholder="Add a description…" onSave={(v) => set({ body: v })} />
          {err && <div role="alert" style={{ color: C.bad, fontSize: 13, margin: "10px 0" }}>{err}</div>}
          {!isSub && <>
            <h3 style={{ ...H, margin: "28px 0 8px" }}>Steps <span style={{ color: C.muted, fontWeight: 400 }}>{data.steps.filter((k) => k.status === "done").length}/{data.steps.length}</span></h3>
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              {ordered(data.steps).map((k) => (
                <div key={k.id} data-testid={`episode-row-${k.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: `1px solid ${C.border}` }}>
                  <StatusIcon status={k.status} onClick={() => void run(() => wr("episode-update", { id: k.id, status: nextStatus(k.status) }))} />
                  <span onClick={() => onEpisode(k.id)} role="button" tabIndex={0} style={{ flex: 1, cursor: "pointer", fontSize: 14 }}>{k.title}</span>
                  <Who assignee={k.assignee} engine={k.engine} model={k.model} status={k.status} />
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.muted, width: 16, textAlign: "center" }}>+</span>
                <input data-testid="step-new-title" style={{ ...input, border: "none", padding: "2px 0" }} placeholder="Add a step" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
              </div>
            </div>
          </>}
          <h3 style={{ ...H, margin: "34px 0 12px" }}>Activity</h3>
          <Trail events={data.events} episodeTitles={titles} />
        </div>
        <Side>
          <div><h3 style={H}>Properties</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {STATUSES.map((s) => (
                  <button key={s} data-testid={`set-${s}`} onClick={() => set({ status: s })} style={{ ...btn, padding: "2px 8px", fontSize: 12, display: "inline-flex", gap: 5, alignItems: "center", background: t.status === s ? C.active : "transparent" }}><StatusIcon status={s} size={12} />{STATUS_WORD[s]}</button>
                ))}
              </div>
              <label style={{ display: "grid", gap: 4, fontSize: 12, color: C.muted }}>assignee
                <input data-testid="episode-assignee" list="assignees" style={input} defaultValue={t.assignee} key={t.assignee} placeholder="you, heimdall, an agent…" onBlur={(e) => { if (e.target.value.trim() !== t.assignee) set({ assignee: e.target.value }); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <datalist id="assignees">{assignees.map((n) => <option key={n} value={n} />)}</datalist>
              </label>
              <Row k="made by" v={actorLabel(t.created_by)} />
              {(t.engine || t.model) && <Row k="ran on"><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ModelIcon engine={t.engine} model={t.model} size={18} />{t.engine}{t.model ? ` · ${t.model}` : ""}</span></Row>}
              {t.status === "failed" && <Row k="result"><span style={{ color: C.bad }}>failed</span></Row>}
              <Row k="created" v={ago(t.created_ms)} />
              {t.started_ms && <Row k="started" v={ago(t.started_ms)} />}
              {t.done_ms && <Row k="finished" v={ago(t.done_ms)} />}
            </div></div>
          <div><h3 style={H}>Telemetry</h3><Meter r={data.rollup} /></div>
          {!sure ? <button data-testid="episode-delete" style={{ ...btn, color: C.bad }} onClick={() => setSure(true)}>Delete…</button>
            : <button data-testid="episode-delete-yes" style={{ ...btn, color: "#fff", background: C.bad, borderColor: C.bad }} onClick={() => void run(async () => { await wr("episode-delete", { id }); onBack(); })}>Really delete it{isSub ? "" : " and its steps"}</button>}
        </Side>
      </div>
    </>
  );
}
