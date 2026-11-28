// THREADS OF A TEAM (operator 2026-11-16): the same team forked, with a recipe of its own (the same steps on Cursor instead of Claude). A tab per thread, a fork form, and a table of the recorded runs of two threads side by side.
// A thread runs as a team of its own (`<team>--t-<name>`): opening a tab opens that team. Nothing here spends money.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { ProviderIcon, SPRITE_NAME, spriteOf } from "@/loki/cowork/provider-icons";
import { Icon } from "./icons";
import { benchmarkOf, threadFork, threadList, threadOpen, type ThreadRow, type VersionRow } from "./api";

export const ENGINES = ["claude-code", "codex", "cursor", "gemini", "grok", "opencode"];
export const nameOk = (n: string) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(n);
/** The newest version that has recorded runs, or the newest. Pure. */
export const latestMeasured = (v: VersionRow[]): VersionRow | null => v.find((x) => x.measured) ?? v[0] ?? null;
const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const usd = (x: number | null | undefined) => (x == null ? "—" : `$${x.toFixed(2)}`);
const mins = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 60000).toFixed(1)} min`);
/** Which of two numbers is better (lower or higher), "" when either is missing or they tie. Pure. */
export const better = (a: number | null | undefined, b: number | null | undefined, lowerIsBetter: boolean): "a" | "b" | "" => { if (a == null || b == null || a === b) return ""; return (a < b) === lowerIsBetter ? "a" : "b"; };

const tabStyle = (on: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 8px", borderRadius: 5, border: 0, background: on ? "var(--c-hover, #1a1b1f)" : "none", color: on ? C.fg : C.muted, cursor: "pointer", font: "inherit", fontSize: 13 });
const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", borderRadius: 5, border: `1px solid ${C.border}`, background: "none", color: C.fg, cursor: "pointer", font: "inherit", fontSize: 12.5 };

function Fork({ team, onDone, onCancel, onForked }: { team: string; onDone: (name: string) => void; onCancel: () => void; onForked?: (name: string, engine: string, left: number) => void }) {
  const [name, setName] = React.useState(""); const [engine, setEngine] = React.useState("cursor"); const [err, setErr] = React.useState<string | null>(null); const [left, setLeft] = React.useState<number | null>(null); const [busy, setBusy] = React.useState(false);
  const go = async () => { setBusy(true); const r = await threadFork(team, name, engine); setBusy(false); if (!r.ok) { setErr(r.error ?? "the thread was not made"); return; } setErr(null); setLeft(r.thread?.llm_left ?? 0); onForked?.(name, engine, r.thread?.llm_left ?? 0); onDone(name); };
  return (
    <div data-testid="thread-fork" style={{ border: `1px solid ${C.border}`, borderRadius: 8, margin: "8px 12px", fontFamily: nav, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 32, padding: "0 14px" }}><span style={{ width: 70, color: C.muted }}>Name</span><input data-testid="thread-name" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="cursor" style={{ flex: 1, background: "none", border: 0, outline: 0, color: C.fg, font: "inherit" }} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 32, padding: "0 14px", borderTop: `1px solid ${C.border}` }}><span style={{ width: 70, color: C.muted }}>Engine</span>
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 2, minWidth: 0 }}>{ENGINES.map((e) => <button key={e} data-testid={`thread-engine-${e}`} title={SPRITE_NAME[spriteOf(e) ?? "claude-code"]} onClick={() => setEngine(e)} style={{ ...tabStyle(engine === e), padding: "0 6px" }}><ProviderIcon engine={e} size={16} /></button>)}</span></div>
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, color: C.muted }}>{left == null ? "Every agent step moves to this engine. Typed model calls stay as they are; the count is shown after the fork." : `Done. ${left} typed model call${left === 1 ? "" : "s"} stayed as they were.`}</div>
      {err && <div data-testid="thread-error" style={{ padding: "0 14px 8px", color: "var(--c-bad)" }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "8px 14px", borderTop: `1px solid ${C.border}` }}><button style={btn} onClick={onCancel}>Cancel</button><button data-testid="thread-make" disabled={!nameOk(name) || busy} onClick={go} style={{ ...btn, background: "var(--c-brand, #8a8fff)", borderColor: "var(--c-brand, #8a8fff)", color: "#0e0f11", opacity: nameOk(name) && !busy ? 1 : 0.5 }}>Fork thread</button></div>
    </div>
  );
}

function Compare({ team, th }: { team: string; th: ThreadRow }) {
  const [a, setA] = React.useState<VersionRow | null | undefined>(undefined); const [b, setB] = React.useState<VersionRow | null | undefined>(undefined);
  React.useEffect(() => { let on = true; void benchmarkOf(team).then((r) => on && setA(latestMeasured(r?.versions ?? []))); void benchmarkOf(th.team).then((r) => on && setB(latestMeasured(r?.versions ?? []))); return () => { on = false; }; }, [team, th.team]);
  const rows: [string, number | null | undefined, number | null | undefined, string, boolean][] = [["Passes", a?.pass_rate, b?.pass_rate, "pct", false], ["Lower bound", a?.lower, b?.lower, "pct", false], ["Cost per run", a?.avg_cost_usd, b?.avg_cost_usd, "usd", true], ["Time per run", a?.avg_wall_ms, b?.avg_wall_ms, "min", true]];
  const f = (k: string, v: number | null | undefined) => (k === "pct" ? pct(v) : k === "usd" ? usd(v) : mins(v));
  const cell = (win: boolean): React.CSSProperties => ({ textAlign: "right", padding: "0 14px", height: 32, color: win ? "var(--c-ok, #4cb782)" : C.fg, fontVariantNumeric: "tabular-nums", borderTop: `1px solid ${C.border}` });
  return (
    <div data-testid="thread-compare" style={{ border: `1px solid ${C.border}`, borderRadius: 8, margin: "8px 12px", fontFamily: nav, fontSize: 13 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={{ textAlign: "left", padding: "0 14px", height: 28, color: C.dim, fontWeight: 500, fontSize: 11 }}>RECORDED RUNS</th><th style={{ textAlign: "right", padding: "0 14px", color: C.muted, fontWeight: 500 }}>main</th><th style={{ textAlign: "right", padding: "0 14px", color: C.muted, fontWeight: 500 }}><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><ProviderIcon engine={th.engine} size={14} />{th.name}</span></th></tr></thead>
        <tbody>{rows.map(([label, x, y, k, low]) => { const w = better(x, y, low); return <tr key={label}><td style={{ ...cell(false), textAlign: "left", color: C.muted }}>{label}</td><td style={cell(w === "a")}>{f(k, x)}</td><td style={cell(w === "b")}>{f(k, y)}</td></tr>; })}</tbody></table>
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, color: C.muted }}>{a === undefined || b === undefined ? "reading…" : !a?.measured || !b?.measured ? "A thread with no recorded runs shows —. Run it, or run an experiment from Requests (it asks before spending)." : "From the runs each thread has made. Nothing here spends money."}</div>
    </div>
  );
}

/** The bar above a team's pane. `onOpen` gets the team to show: the team itself for main, the thread's own team for a thread. */
export function TeamThreads({ team, onOpen, column, shown, note, onForked, onLeader }: { /** a fork was opened: its team and the engine it runs on, so its own Leader can be made */ onLeader?: (forkTeam: string, engine: string) => void; /** what the last fork said (kept by the pane, so it survives the switch to the new thread) */ note?: string | null; onForked?: (name: string, engine: string, left: number) => void; team: string; onOpen: (team: string) => void; /** drawn as a list in a panel, not as a bar */ column?: boolean; /** the team the pane shows now, so a remounted list still marks the right thread */ shown?: string }) {
  const [rows, setRows] = React.useState<ThreadRow[]>([]); const [cur, setCur] = React.useState<string>(""); const [form, setForm] = React.useState(false); const [cmp, setCmp] = React.useState(false);
  const reload = React.useCallback(() => { void threadList(team).then(setRows); }, [team]);
  React.useEffect(reload, [reload]);
  React.useEffect(() => { if (shown !== undefined) setCur(rows.find((r) => r.team === shown)?.name ?? ""); }, [rows, shown]);
  const pick = async (t: ThreadRow | null) => { setCmp(false); if (!t) { setCur(""); onOpen(team); return; } const r = await threadOpen(team, t.name); if (r.ok && r.team) { setCur(t.name); onOpen(r.team); onLeader?.(r.team, t.engine || "claude-code"); } };
  if (!rows.length && !form) return <div data-testid="thread-bar" style={{ display: "flex", alignItems: "center", height: 32, padding: column ? "0 6px" : "0 10px", borderBottom: column ? "none" : `1px solid ${C.border}` }}><button data-testid="thread-new" title="Fork this team into a thread" style={{ ...tabStyle(false), color: C.dim }} onClick={() => setForm(true)}><Icon name="branch" size={14} />Fork a thread</button></div>;
  const th = rows.find((r) => r.name === cur) ?? null;
  return (
    <div data-testid="thread-bar" style={{ borderBottom: column ? "none" : `1px solid ${C.border}` }}>
      <div style={column ? { display: "flex", flexDirection: "column", alignItems: "stretch", padding: 6, gap: 2 } : { display: "flex", alignItems: "center", height: 36, padding: "0 6px", gap: 2, overflowX: "auto" }}>
        <button data-testid="thread-main" style={{ ...tabStyle(!cur), ...(column ? { justifyContent: "flex-start", height: 30 } : {}) }} onClick={() => pick(null)}><Icon name="branch" size={14} />main</button>
        {rows.map((r) => <button key={r.name} data-testid={`thread-${r.name}`} style={{ ...tabStyle(cur === r.name), ...(column ? { justifyContent: "flex-start", height: 30 } : {}) }} onClick={() => pick(r)}><Icon name="branch" size={14} />{r.name}{r.engine && <ProviderIcon engine={r.engine} size={14} title={r.engine} />}</button>)}
        <button data-testid="thread-new" title="Fork this team into a thread" style={{ ...tabStyle(form), ...(column ? { justifyContent: "flex-start", height: 30 } : { width: 24, justifyContent: "center", padding: 0 }) }} onClick={() => setForm((v) => !v)}><Icon name="plus" size={14} />{column && "Fork a thread"}</button>
        {!column && <span style={{ flex: 1 }} />}{th && <button data-testid="thread-compare-btn" style={btn} onClick={() => setCmp((v) => !v)}>Compare with main</button>}
      </div>
      {note && <div data-testid="thread-note" role="status" style={{ margin: "6px 12px", padding: "8px 10px", border: `1px solid var(--c-ok, #4cb782)`, borderRadius: 8, fontSize: 12, lineHeight: 1.45, color: C.fg }}>{note}</div>}
      {form && <Fork team={team} onForked={onForked} onCancel={() => setForm(false)} onDone={(n) => { setForm(false); reload(); void threadList(team).then((l) => { const t = l.find((x) => x.name === n); if (t) void pick(t); }); }} />}
      {cmp && th && <Compare team={team} th={th} />}
    </div>
  );
}
