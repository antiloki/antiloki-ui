// A TEAM ON ITS OWN SCHEDULE (RFC 0010 §4.9; operator 2026-11-12: "cron jobs on teams", "close antiloki and keep running the agents, the cron jobs"). The person sets the schedules and says yes once; the serve starts the team
// itself, window or no window, while it runs as the background service. Changing a schedule asks for the yes again; an agent can set none of this.
import * as React from "react";
import { listEngines } from "../cowork/api";
import { pickDefaultEngine } from "../cowork/default-engine";
import { C, mono, nav } from "@/loki/theme";
import { consentTriggers, fireTrigger, setTriggers, triggerStatus, webhookToken } from "./api";
import type { Trigger, TriggerStatus } from "./types";
import { ScheduleWeek } from "./ScheduleWeek";

export const PRESETS: { key: string; label: string; cron: string }[] = [
  { key: "daily", label: "every day at 08:00", cron: "0 8 * * *" }, { key: "weekdays", label: "weekdays at 08:00", cron: "0 8 * * 1-5" }, { key: "monday", label: "Mondays at 08:00", cron: "0 8 * * 1" },
  { key: "hourly", label: "every hour", cron: "0 * * * *" }, { key: "quarter", label: "every 15 minutes", cron: "*/15 * * * *" }, { key: "custom", label: "custom cron", cron: "" },
];
/** What a trigger waits for, in the row's first column. Pure. */
export const kindWords = (t: { kind?: string; cron?: string; watch?: string; team?: string; id?: string }): string => t.kind === "webhook" ? `webhook ${t.id ?? ""}`.trim() : t.kind === "file_watch" ? `files ${t.watch ?? ""}`.trim() : t.kind === "on_error" ? `when ${t.team || "another team"} fails` : cronWords(t.cron ?? "");
/** A cron in words when it is one of the presets, else the cron itself. Pure. */
export const cronWords = (cron: string): string => PRESETS.find((p) => p.cron && p.cron === cron.trim())?.label ?? cron;
/** A moment as the person reads it: weekday, date and time in their own zone. Pure. */
export const when = (ms: number | null | undefined): string => { if (!ms) return "never"; const d = new Date(ms); return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "3px 10px", cursor: "pointer" };
const field: React.CSSProperties = { background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", fontFamily: nav, fontSize: 12.5 };
export function TeamTriggers({ team, onChanged }: { team: string; onChanged?: () => void }) {
  const [st, setSt] = React.useState<TriggerStatus | null>(null); const [msg, setMsg] = React.useState<{ text: string; bad?: boolean } | null>(null);
  const [preset, setPreset] = React.useState("daily"); const [cron, setCron] = React.useState("0 8 * * *"); const [ask, setAsk] = React.useState(""); const [budget, setBudget] = React.useState("1"); const [engine, setEngine] = React.useState("");
  // the seats this machine has; the one offered first is the person's own, never Claude by assumption
  const [seats, setSeats] = React.useState<[string, string][]>([]); React.useEffect(() => { void listEngines().then((l) => { setSeats(l.filter((e) => e.installed).map((e) => [e.key, e.label])); const d = pickDefaultEngine(l); if (d) setEngine(d.key); }); }, []);
  const load = React.useCallback(async () => { setSt(await triggerStatus(team)); }, [team]);
  React.useEffect(() => { let stop = false; const go = async () => { const s = await triggerStatus(team); if (!stop) setSt(s); }; void go(); const t = setInterval(go, 5000); return () => { stop = true; clearInterval(t); }; }, [team]);
  const [token, setToken] = React.useState<{ id: string; token: string; path: string } | null>(null);
  if (!st) return null;
  const asTriggers = (): Trigger[] => st.raw ?? st.triggers.map((t) => ({ id: t.id, kind: "schedule", ...(t.engine ? { engine: t.engine } : {}), cron: t.cron, ask: t.ask, budget_usd: t.budget_usd ?? undefined, missed: (t.missed as "skip" | "run_once") ?? "run_once" }));
  const save = async (triggers: Trigger[], limits = st.limits) => { const r = await setTriggers(team, triggers, limits); if (r.ok) { setSt(r as any); setMsg({ text: "saved: the team asks for your yes again before it runs on its own" }); onChanged?.(); } else setMsg({ text: r.error ?? "not saved", bad: true }); };
  const add = async () => { const c = (preset === "custom" ? cron : PRESETS.find((p) => p.key === preset)?.cron ?? cron).trim(); await save([...asTriggers(), { kind: "schedule", ...(engine ? { engine } : {}), cron: c, ask: ask.trim(), budget_usd: parseFloat(budget) || undefined, missed: "run_once" }]); if (!msg?.bad) setAsk(""); };
  const addWebhook = async () => { const id = `hook${(st.raw ?? st.triggers).filter((x) => x.kind === "webhook").length + 1}`; const r = await setTriggers(team, [...asTriggers(), { id, kind: "webhook", ask: ask.trim(), budget_usd: parseFloat(budget) || undefined, ...(engine ? { engine } : {}), token_hash: "0".repeat(64) }], st.limits); if (!r.ok) { setMsg({ text: r.error ?? "not saved", bad: true }); return; } const t = await webhookToken(team, id); if (t.ok && t.token) { setToken({ id, token: t.token, path: t.path }); setAsk(""); } await load(); onChanged?.(); };
  return (
    <div data-testid="team-triggers" style={{ fontFamily: nav, color: C.fg, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", fontSize: 12.5 }}>
        <b style={{ fontWeight: 500 }}>Schedule</b><span style={{ color: C.muted }}>· the team runs on its own</span>
        <span data-testid="service-state" style={{ marginLeft: "auto", fontSize: 11.5, color: st.service ? "var(--c-ok)" : "#c9a34e" }}>{st.service ? "background service: on" : "background service: off"}</span>
      </div>
      <ScheduleWeek onMove={(id, cron) => void save(asTriggers().map((x) => ((x.id ?? x.cron) === id ? { ...x, cron } : x)))} triggers={st.raw ?? (st.triggers as any)} usedToday={st.today.runs} maxToday={st.limits.max_runs_per_day} />
      {!st.service && <div data-testid="service-hint" style={{ padding: "0 16px 8px", fontSize: 12, color: C.muted }}>While the serve is not a background service, schedules only run as long as antiloki is open. Run <code style={{ fontFamily: mono }}>antiloki-main --service --yes</code> once to keep agents, runs and schedules going when every window is closed.</div>}
      {st.triggers.map((t) => <div key={t.id} data-testid={`trigger-${t.id}`} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "7px 16px", borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
        <span style={{ fontFamily: mono, color: C.muted }}>{kindWords(t)}</span>{t.engine && <span style={{ color: C.muted, fontSize: 11.5 }}>{t.engine}</span>}<span style={{ minWidth: 0, flex: "1 1 160px" }}>{t.ask}</span>
        <span style={{ color: C.muted, fontSize: 12 }}>{t.kind === "schedule" || !t.kind ? `next ${when(t.next_ms)}` : "waits for its event"}{t.last ? ` · last ${when(t.last.at_ms)}` : ""}</span>
        {t.kind === "webhook" && <button data-testid={`trigger-token-${t.id}`} style={btn} onClick={async () => { const r = await webhookToken(team, t.id); if (r.ok && r.token) { setToken({ id: t.id, token: r.token, path: r.path }); void load(); } else setMsg({ text: r.error ?? "no token made", bad: true }); }}>New token</button>}
        <button data-testid={`trigger-fire-${t.id}`} style={btn} onClick={async () => { const r = await fireTrigger(team, t.id); setMsg(r.ok ? { text: `started run ${r.run}` } : { text: r.error ?? "not started", bad: true }); onChanged?.(); }}>Run now</button>
        <button data-testid={`trigger-remove-${t.id}`} style={{ ...btn, border: "none", color: C.muted }} onClick={() => void save(asTriggers().filter((x) => x.id !== t.id))}>Remove</button>
      </div>)}
      {token && <div data-testid="webhook-token" style={{ padding: "8px 16px", borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.fg }}>
        <div>Webhook <b style={{ fontWeight: 500 }}>{token.id}</b>: this token is shown once. Keep it somewhere safe.</div>
        <div style={{ fontFamily: mono, wordBreak: "break-all", margin: "4px 0" }}>POST {token.path} · header X-Antiloki-Token: {token.token}</div>
        <div style={{ color: C.muted }}>A caller outside reaches it only when remote access is on. The team still needs your yes below before a call starts a run.</div>
        <button data-testid="webhook-token-close" style={{ ...btn, marginTop: 4 }} onClick={() => setToken(null)}>I saved it</button></div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 16px", borderTop: `1px solid ${C.border}` }}>
        <select data-testid="trigger-preset" value={preset} onChange={(e) => { setPreset(e.target.value); setCron(PRESETS.find((p) => p.key === e.target.value)?.cron ?? ""); }} style={field}>{PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
        {preset === "custom" && <input data-testid="trigger-cron" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="m h dom mon dow" style={{ ...field, width: 130, fontFamily: mono }} />}
        <input data-testid="trigger-ask" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="what the team is asked ({date} and {weekday} fill in)" style={{ ...field, flex: "1 1 220px" }} />
        <select data-testid="trigger-engine" value={engine} onChange={(e) => setEngine(e.target.value)} title="the seat that does the work when nobody is there" style={field}>{seats.map(([k, label]) => <option key={k} value={k}>{label}</option>)}<option value="">router's choice</option></select>
        <label style={{ fontSize: 12, color: C.muted }}>budget $ <input data-testid="trigger-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} style={{ ...field, width: 56, fontFamily: mono }} /></label>
        <button data-testid="trigger-add-webhook" disabled={!ask.trim()} title="start the team when something outside calls its address" style={{ ...btn, opacity: ask.trim() ? 1 : 0.5 }} onClick={() => void addWebhook()}>Add as webhook</button>
        <button data-testid="trigger-add" disabled={!ask.trim()} style={{ ...btn, opacity: ask.trim() ? 1 : 0.5 }} onClick={() => void add()}>Add</button>
      </div>
      {st.triggers.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 16px", borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}><input data-testid="trigger-consent" type="checkbox" checked={st.consented} onChange={async (e) => { const r = await consentTriggers(team, e.target.checked); if (r.ok) setSt(r as any); else setMsg({ text: r.error ?? "not allowed", bad: true }); }} />
          <span>Let this team run on its own: up to <b style={{ fontWeight: 500 }}>{st.limits.max_runs_per_day}</b> runs and <b style={{ fontWeight: 500 }}>${st.limits.max_usd_per_day}</b> a day, while the serve is running. It stops at any gate and waits for you.</span></label>
        <span style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>today: {st.today.runs} run{st.today.runs === 1 ? "" : "s"}</span>
      </div>}
      {st.log.length > 0 && <div data-testid="trigger-log" style={{ padding: "4px 16px 8px", fontSize: 11.5, color: C.muted, fontFamily: mono }}>{st.log.slice(0, 4).map((l, i) => <div key={i}>{when(l.t_ms)} · {l.trigger} · {l.what}{l.why ? ` · ${l.why}` : ""}</div>)}</div>}
      {msg && <div style={{ padding: "4px 16px 8px", fontSize: 12, color: msg.bad ? "var(--c-bad)" : C.muted }}>{msg.text}</div>}
    </div>
  );
}
