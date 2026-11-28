// THE SAGA PACK, AS A LIST (operator 2026-11-11: "the saga pack should be more linear-like design, not boxes"; mockup board 1): rows grouped by status, each with a ring, an id, a title, a slim bar, the cost and the time; the team's own saga
// is the first row, marked "team saga"; a row opens into its EPISODES (a pass of the loop, the retry it makes, the pass of the team that produced it).
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { getSaga, listSagas } from "@/loki/sagas/api";
import type { Episode, Saga, Status } from "@/loki/sagas/model";
import { RoleBox } from "./icons";
import { money } from "./model";

const WORD: Record<string, string> = { doing: "In progress", todo: "Todo", done: "Done", failed: "Failed", canceled: "Canceled" };
const ORDER = ["doing", "failed", "todo", "done", "canceled"];
const dur = (ms: number) => (ms < 1000 ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`);
const SC: Record<string, string> = { todo: "#6a6f75", doing: "#7a9fb5", done: "#6aa88a", failed: "#b0615d", canceled: "#6a6f75" };

/** A status as Linear draws it: a dashed circle for todo, half-filled for in progress, a tick for done, a cross for failed. */
export function StatusIcon({ status, size = 14 }: { status: string; size?: number }) {
  const c = SC[status] ?? SC.todo;
  if (status === "doing") return <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden><circle cx="7" cy="7" r="5.6" stroke={c} strokeWidth="1.5" /><path d="M7 3.6a3.4 3.4 0 0 1 0 6.8z" fill={c} /></svg>;
  if (status === "done") return <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden><circle cx="7" cy="7" r="6" fill={c} /><path d="M4.3 7.2l1.9 1.9 3.5-3.9" stroke="#0e0f10" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (status === "failed") return <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden><circle cx="7" cy="7" r="5.6" stroke={c} strokeWidth="1.5" /><path d="M5 5l4 4M9 5l-4 4" stroke={c} strokeWidth="1.4" strokeLinecap="round" /></svg>;
  return <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden><circle cx="7" cy="7" r="5.6" stroke={c} strokeWidth="1.5" strokeDasharray="2.2 2.2" /></svg>;
}
export function Ring({ p, color, size = 13 }: { p: number; color: string; size?: number }) {
  const r = 5, c = 2 * Math.PI * r;
  return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden><circle cx="7" cy="7" r={r} fill="none" stroke="var(--c-border)" strokeWidth="1.6" /><circle cx="7" cy="7" r={r} fill="none" stroke={color} strokeWidth="1.6" strokeDasharray={`${c * Math.max(0, Math.min(1, p))} ${c}`} transform="rotate(-90 7 7)" strokeLinecap="round" /></svg>;
}
const chipStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 8px", fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", fontFamily: nav };
const dot = (c: string) => <i style={{ width: 6, height: 6, borderRadius: "50%", background: c, display: "inline-block" }} />;
/** The sagas of a team: its own first, then the pack's, grouped in the order a person reads them. Pure. */
export function packOf(sagas: Saga[], team: string, run?: string | null): { own: Saga | null; pack: Saga[] } {
  const own = sagas.find((s) => (s as any).meta?.kind === "team" && (s as any).meta?.team === team) ?? null;
  const all = sagas.filter((s) => (s as any).meta?.kind === "pack" && (s as any).meta?.team === team);
  const mine = run ? all.filter((s) => (s as any).meta?.run === run) : all;
  return { own, pack: (mine.length ? mine : all).sort((a, b) => a.id - b.id) };
}
export const groupByStatus = (list: Saga[]): { status: string; items: Saga[] }[] => ORDER.map((st) => ({ status: st, items: list.filter((s) => s.status === st) })).filter((g) => g.items.length);
const pct = (s: Saga) => { const r = (s as any).rollup; return r && r.episodes ? (r.done + r.canceled) / r.episodes : s.status === "done" ? 1 : 0; };

function EpisodeRows({ id }: { id: number }) {
  const [eps, setEps] = React.useState<Episode[] | null>(null);
  React.useEffect(() => { let stop = false; const load = () => void getSaga(id).then((d) => { if (!stop && d) setEps(d.episodes); }); load(); const t = setInterval(load, 3000); return () => { stop = true; clearInterval(t); }; }, [id]);
  if (!eps) return <div style={{ padding: "6px 16px 6px 44px", color: C.muted, fontSize: 12 }}>…</div>;
  if (!eps.length) return <div style={{ padding: "6px 16px 6px 44px", color: C.muted, fontSize: 12 }}>no episodes yet</div>;
  return <>{eps.map((e, i) => (
    <div key={e.id} data-testid={`episode-row-${e.id}`} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, height: 32, padding: "0 16px 0 44px", borderTop: `1px solid ${C.border}`, fontFamily: nav, fontSize: 12.5, color: C.muted }}>
      <span style={{ position: "absolute", left: 23, top: 0, bottom: 0, width: 1, background: "var(--c-border)" }} />
      <StatusIcon status={e.status} size={13} /><span style={{ width: 40, fontFamily: mono, fontSize: 11.5, color: C.dim }}>EP-{i + 1}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
      {e.meta?.path ? <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>{e.meta.path}</span> : null}
      {e.meta?.retry_of != null ? <span data-testid="tag-retry" style={chipStyle}>{dot("#b89a5a")}retry{typeof e.meta.retry_of === "number" ? " of the pass before" : ""}</span> : null}
      {e.meta?.produced_by != null ? <span data-testid="tag-produced" style={chipStyle}>{dot("#8f7fb8")}produced by the team's pass</span> : null}
      <span style={{ width: 54, textAlign: "right", fontFamily: mono, fontSize: 11.5 }}>{e.usd_total ? money(e.usd_total) : "—"}</span><span style={{ width: 34, textAlign: "right", fontFamily: mono, fontSize: 11.5, color: C.dim }}>{dur(e.ms_total || 0)}</span>
    </div>))}</>;
}
function SagaRow({ s, label, team, open, onToggle }: { s: Saga; label: string; team?: boolean; open: boolean; onToggle: () => void }) {
  const r: any = (s as any).rollup ?? {}; const n = r.episodes ?? 0; const who = team ? "leader" : "worker";
  return (
    <div data-testid={`pack-row-${s.id}`} data-status={s.status}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12, height: 36, padding: "0 16px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontFamily: nav, fontSize: 13 }}>
        <StatusIcon status={s.status} /><span style={{ width: 46, flex: "none", fontFamily: mono, fontSize: 12, color: C.dim }}>{label}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
        {team && <span style={chipStyle}>{dot("#6aa8a0")}team saga</span>}
        {n > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: mono, fontSize: 11.5, color: C.muted }}><Ring p={pct(s)} color="#7a9fb5" />{r.done ?? 0}/{n}</span>}
        <RoleBox role={who} size={18} />
        <span style={{ width: 54, textAlign: "right", fontFamily: mono, fontSize: 11.5, color: C.muted }}>{money(r.usd)}</span><span style={{ width: 34, textAlign: "right", fontFamily: mono, fontSize: 11.5, color: C.dim }}>{dur(r.ms ?? 0)}</span>
      </div>
      {open && <EpisodeRows id={s.id} />}
    </div>
  );
}
export function PackList({ team, run, refreshKey, hideOwn }: { team: string; run?: string | null; refreshKey?: number | string; /** the team's own saga is shown in full beside it (the Saga tab) */ hideOwn?: boolean }) {
  const [sagas, setSagas] = React.useState<Saga[]>([]); const [open, setOpen] = React.useState<Record<number, boolean>>({}); const [view, setView] = React.useState<"all" | "active" | "done">("all");
  React.useEffect(() => { let stop = false; let busy = false;
    // ONE ASK AT A TIME, NOT ONE EVERY THREE SECONDS: the list of sagas is a big answer and a slow serve takes longer than the interval, so the asks piled up and held the serve (and the terminals) back; a hidden tab asks nothing
    const load = () => { if (busy || (typeof document !== "undefined" && document.hidden)) return; busy = true; void listSagas().then((l) => { if (!stop && l) setSagas((old) => (JSON.stringify(old) === JSON.stringify(l) ? old : l)); }).finally(() => { busy = false; }); }; load(); const t = setInterval(load, 10_000); return () => { stop = true; clearInterval(t); }; }, [refreshKey]);
  const { own, pack } = React.useMemo(() => packOf(sagas, team, run), [sagas, team, run]);
  const shown = pack.filter((s) => view === "all" || (view === "active" ? s.status !== "done" && s.status !== "canceled" : s.status === "done"));
  const groups = groupByStatus(shown); const ownOpenDefault = own ? open[own.id] ?? true : false;
  return (
    <div data-testid="pack-list" style={{ borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, height: 36, padding: "0 16px", fontFamily: nav, fontSize: 12.5, color: C.muted }}>
        {(["all", "active", "done"] as const).map((v) => <button key={v} data-testid={`pack-view-${v}`} onClick={() => setView(v)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: nav, fontSize: 12.5, color: view === v ? C.fg : C.muted }}>{v === "all" ? "All" : v === "active" ? "Active" : "Done"}</button>)}
        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11.5, color: C.dim }}>{team} · {pack.length} saga{pack.length === 1 ? "" : "s"}</span>
      </div>
      {own && !hideOwn && <SagaRow s={own} label="TEAM" team open={ownOpenDefault} onToggle={() => setOpen((o) => ({ ...o, [own.id]: !ownOpenDefault }))} />}
      {groups.map((g) => <React.Fragment key={g.status}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", height: 34, padding: "0 16px", background: "var(--c-panel2)", borderTop: `1px solid ${C.border}`, fontFamily: nav, fontSize: 13 }}><StatusIcon status={g.status} size={15} /><b style={{ fontWeight: 500 }}>{WORD[g.status]}</b><span style={{ color: C.dim }}>{g.items.length}</span></div>
        {g.items.map((s, i) => <SagaRow key={s.id} s={s} label={`${((s as any).meta?.unit as string | undefined)?.slice(0, 8) ?? `S-${i + 1}`}`} open={!!open[s.id]} onToggle={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))} />)}
      </React.Fragment>)}
      {(hideOwn ? !pack.length : !own && !pack.length) && <div style={{ padding: "14px 16px", color: C.muted, fontSize: 12.5, fontFamily: nav, borderTop: `1px solid ${C.border}` }}>No sagas yet: run the team and the planner will split the ask into sagas.</div>}
    </div>
  );
}
export type { Status };
