// THE SEATS SCREEN: the provider switches (Zen, Chinese models), where every seat stands, Heimdall's own seat and the forge tokens.
// Shared by Settings and the first-run wizard. (The per-tier engine picker `AiEnginesPicker` and the `EngineModels` table that
// used to sit above were dead exports - nothing rendered them but their own test - and are gone, 2026-10-01; the tiers are the
// router's now: one tolerance, an automatic choice per job.)
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import { apiPostStrict, reasonOf } from "@/loki/api/post-strict";
import { forgetSeats } from "@/loki/api/seats";
import { ConnectClis } from "./connect-clis";

/** THE SEATS AND WHAT EACH ONE IS (the catalogue the seat table's notes come from): five subscriptions plus the gateway. */
export const CLI_ENGINES: { model_id: string; label: string; note: string }[] = [
  { model_id: "claude-code", label: "Claude Code", note: "your Anthropic subscription · `claude -p`" },
  { model_id: "codex", label: "Codex", note: "your OpenAI subscription · `codex exec`" },
  { model_id: "gemini", label: "Antigravity", note: "your Google AI plan · Antigravity CLI `agy` (Gemini CLI was retired for Pro/Ultra on 18 Jun 2026)" },
  { model_id: "grok", label: "Grok", note: "your xAI subscription · `grok -p`" },
  { model_id: "cursor", label: "Cursor", note: "your Cursor plan · `cursor-agent -p` · Composer and cursor-grok only (its own pool)" },
  // NOT "free tier works" (corrected 2026-09-27): every model OpenCode serves is on the Zen gateway, which bills a
  // metered credit balance. It returned HTTP 402 "Insufficient account funds" on twelve consecutive bench runs.
  { model_id: "opencode", label: "OpenCode", note: "the Zen gateway · metered credit, not a subscription · off by default" },
];

type Switch = { on: boolean; default: boolean; label: string; note: string };
type ProviderRow = {
  key: string; name: string; binaries: string[]; binary: string | null; installed: boolean;
  signed_in: boolean | null; usable: boolean; metered_gateway: boolean; blocked: string | null;
  /** how to get it and how to sign in — strings to SHOW; both are the user's own act (absent on an older serve) */
  install?: string; signin?: string;
  /** just the command to paste, the shell it goes in, what must already be installed, and the OS the serve runs on (2026-10-11; absent on an older serve) */
  install_cmd?: string; shell?: string; needs?: string; os?: string;
  /** the operator's own switch for the whole seat — false = the router never uses it (absent on an older serve) */
  on?: boolean;
  /** every model of the seat the router knows, each with its own switch (operator 2026-10-07; absent on an older serve) */
  models?: { model: string; on: boolean }[];
  /** the weekly allowance in dollars the operator declared for a seat that publishes no window (Cursor, Gemini, Grok) - antiloki estimates the week against it (2026-10-09) */
  week_usd?: number | null;
};
type HeimdallSeat = { provider: string; effective?: string | null; options: { key: string; name: string; usable: boolean }[]; label: string; note: string };
type ProvidersPayload = { switches: Record<string, Switch>; engines: ProviderRow[]; /** HEIMDALL'S OWN SEAT (2026-09-27) — absent on an older serve */ heimdall?: HeimdallSeat };

/** THE COMMAND THAT REPAIRS THIS SEAT — "" when nothing needs repairing (2026-09-28).
 *
 *  "installed, not signed in" is a diagnosis; the operator asked for the exact command every time something is
 *  missing. Install and sign-in are always run by the user in their own terminal: a credential never passes
 *  through the agent, which is why this returns a string to show and never a thing to execute. Pure. */
export function seatFix(r: ProviderRow): string {
  if (!r.installed) return r.install ?? "";
  if (r.signed_in === false) return r.signin ?? "";
  return "";
}

/** WHY A SEAT IS NOT BEING USED, in one phrase — pure, so it can be tested without a server. */
/** THE SIGN-IN FLOW (operator 2026-10-11): ask the serve to open a terminal that runs this AI's own login (it opens the vendor's browser flow). antiloki never sees a credential. Resolves with a sentence to show. */
export async function startSignin(engine: string): Promise<{ ok: boolean; note: string }> {
  try { const r: any = await apiPostStrict("/api/v1/onboarding/signin", { engine }); const d = r?.result ?? r; return { ok: true, note: String(d?.how ?? "a terminal window opened: finish signing in there, then come back") }; }
  catch (e) { return { ok: false, note: reasonOf(e) }; }
}
/** "Sign in" for one seat: opens the terminal, then says what to do. The screens already look again every few seconds, so the seat ticks by itself when the sign-in lands. */
export function SignInButton({ engine, label = "Sign in", onStarted }: { engine: string; label?: string; onStarted?: () => void }) {
  const [state, setState] = React.useState<{ busy: boolean; note: string; ok: boolean | null }>({ busy: false, note: "", ok: null });
  const go = async () => { setState({ busy: true, note: "", ok: null }); const r = await startSignin(engine); setState({ busy: false, note: r.note, ok: r.ok }); if (r.ok) onStarted?.(); };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button data-testid={`signin-${engine}`} disabled={state.busy} onClick={() => void go()} title="opens a terminal window with this AI's own sign-in"
        style={{ cursor: "pointer", padding: "3px 11px", borderRadius: 7, fontFamily: mono, fontSize: 10.5, color: "#fff", background: C.brand, border: `1px solid ${C.brand}` }}>{state.busy ? "opening…" : label}</button>
      {state.note && <span data-testid={`signin-note-${engine}`} style={{ fontSize: 10.5, color: state.ok ? C.dim : "#bf616a", lineHeight: 1.4 }}>{state.note}</span>}
    </span>
  );
}

export function seatState(r: ProviderRow): { text: string; tone: "ok" | "warn" | "off" } {
  if (!r.installed) return { text: `not installed · ${r.binaries.join(" or ")}`, tone: "off" };
  if (r.signed_in === false) return { text: "installed, not signed in", tone: "warn" };
  if (r.blocked) return { text: "switched off", tone: "off" };
  if (r.usable) return { text: `ready · ${r.binary}`, tone: "ok" };
  return { text: "unavailable", tone: "off" };
}

/** IS THIS THE PROVIDERS PAYLOAD, OR SOMETHING ELSE WEARING JSON? A shape check, not a version check — `apiGet`
 *  resolves on a 404 with the error body, and the next wrong payload will not be a 404 either. Pure — tested. */
export function providersPayloadOk(d: any): boolean {
  return !!d && typeof d === "object" && !!d.switches && typeof d.switches === "object" && Array.isArray(d.engines);
}

/** THE PROVIDER SWITCHES (operator 2026-09-27: "add on settings an option to make Zen reachable or not … by default
 *  no reachable" · "a button on settings to activate or deactivate Chinese models"). Both default OFF.
 *
 *  The seat table below the switches is the half that makes the screen usable: an operator who cannot see that a CLI
 *  is installed but not signed in has no way to know why the router never picks it. */
/** the providers payload and the three writes on it - shared by Settings and the first-run wizard, so the two screens can never disagree about a seat. */
export function useProviders(opts?: { pollMs?: number }) {
  const [p, setP] = React.useState<ProvidersPayload | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(async () => {
    try {
      const d: any = await apiGet("/api/v1/settings/providers");
      // A SCREEN MUST NOT CRASH BECAUSE A ROUTE IS MISSING (2026-09-27). `apiGet` RESOLVES on a 404 with the error
      // body — `{"message":"Not Found","statusCode":404}` — so `p` became truthy, `Object.entries(p.switches)` was
      // handed `undefined`, and the whole Settings screen went down. This route is new: any serve older than it 404s,
      // which is every running instance until it restarts. The shape is checked before it is trusted.
      if (!providersPayloadOk(d)) {
        setP(null);
        setErr(d?.statusCode === 404
          ? "this antiloki-serve does not have /settings/providers yet — restart it to manage the provider switches"
          : "the providers payload was not in shape");
        return;
      }
      setP(d as ProvidersPayload); setErr("");
    } catch (e: any) { setP(null); setErr(e?.message || "could not read the providers"); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  // THE ONBOARDING LOOKS AGAIN BY ITSELF (2026-10-11): install a CLI in another window, sign in, come back, and the screen has already noticed
  const pollMs = opts?.pollMs ?? 0;
  React.useEffect(() => { if (!pollMs) return; const t = setInterval(() => void load(), pollMs); return () => clearInterval(t); }, [pollMs, load]);
  /** ONE MODEL's switch (operator 2026-10-07: "to all AIs add a disable button, so Heimdall won't choose disabled models") */
  const flipModel = async (seat: string, model: string, on: boolean) => {
    setBusy(`${seat}:${model}`);
    try { await apiPostStrict("/api/v1/settings/providers", { name: seat, model, on }); forgetSeats(); await load(); }
    catch (e) { setErr(`could not save: ${reasonOf(e)}`); } finally { setBusy(null); }
  };
  /** the weekly allowance of a seat that publishes no window: null clears it. The serve then turns antiloki's own 7-day spend on that seat into a `wk ~N%` figure and routes around the seat near the top. */
  /** THE ONE NUMBER (operator 2026-10-09: "I want the less work for the user"): the percentage the seat's own dashboard shows. antiloki divides its own 7-day spend by it and keeps the allowance. */
  const calibrate = async (seat: string, pct: number) => {
    setBusy(`allow-${seat}`);
    try { await apiPostStrict("/api/v1/settings/providers", { name: seat, used_pct: pct }); forgetSeats(); await load(); }
    catch (e) { setErr(`could not calibrate: ${reasonOf(e)}`); } finally { setBusy(null); }
  };
  const setAllowance = async (seat: string, usd: number | null) => {
    setBusy(`allow-${seat}`);
    try { await apiPostStrict("/api/v1/settings/providers", { name: seat, week_usd: usd }); forgetSeats(); await load(); }
    catch (e) { setErr(`could not save: ${reasonOf(e)}`); } finally { setBusy(null); }
  };
  const flip = async (name: string, on: boolean) => {
    setBusy(name);
    // `apiPost` never throws (a refusal, a timeout, a dead serve all come back as null), so the catch below was dead and a refused switch showed nothing (audit 2026-10-01).
    try { await apiPostStrict("/api/v1/settings/providers", { name, on }); forgetSeats(); await load(); }
    catch (e) { setErr(`could not save: ${reasonOf(e)}`); } finally { setBusy(null); }
  };
  // HEIMDALL'S OWN SEAT (operator 2026-09-27: "we should have a main provider for heimdall. On settings as well to
  // select"). The router planned on whatever engine the pane was on; a hand-off had put main on OpenCode with Zen
  // off, and every routed ask died. The brain is chosen here, once, for every pane.
  const pickHeimdall = async (provider: string) => {
    setBusy("heimdall");
    try { await apiPostStrict("/api/v1/settings/providers", { name: "heimdall", provider }); forgetSeats(); await load(); }
    catch (e) { setErr(`could not save: ${reasonOf(e)}`); } finally { setBusy(null); }
  };
  return { p, busy, err, setErr, load, reload: load, flip, flipModel, setAllowance, calibrate, pickHeimdall };
}

/** A DISABLE SWITCH FOR EVERY MODEL OF A SEAT (operator 2026-10-07). A model switched off is refused by the router's one gate, so Heimdall - the job ladders, the fallback picker, the QA gate, a pinned role - never chooses it. Pure view. */
/** THE WEEKLY ALLOWANCE OF A SEAT THAT PUBLISHES NO WINDOW (operator 2026-10-09: "my cursor subscription is almost at the limit weekly and this is not shown ... when a subscription gets to its limits you flag it and use the next best").
 *  Cursor, Gemini and Grok have no usage command, so antiloki can only count what it sent them. Declare a weekly allowance in dollars (calibrate once against the seat's own dashboard) and the preview shows "wk ~N% est.",
 *  warns near the top and the router uses the next best seat from 95 %. Empty = not tracked. */
export function AllowanceField({ seat, name, usd, onSave, onCalibrate, busy }: { seat: string; name?: string; usd: number | null; onSave: (usd: number | null) => void; onCalibrate?: (pct: number) => void; busy?: boolean }) {
  const [pct, setPct] = React.useState("");
  const pctN = pct.trim() === "" ? null : Number(pct);
  const pctOk = pctN !== null && Number.isFinite(pctN) && pctN > 0 && pctN <= 100;
  const [v, setV] = React.useState(usd == null ? "" : String(usd));
  React.useEffect(() => { setV(usd == null ? "" : String(usd)); }, [usd]);
  const parsed = v.trim() === "" ? null : Number(v);
  const valid = parsed === null || (Number.isFinite(parsed) && parsed > 0);
  const dirty = (parsed ?? null) !== (usd ?? null);
  return (
    <div data-testid={`allowance-${seat}`} style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px 100px", fontFamily: mono, fontSize: 10, color: C.muted, flexWrap: "wrap" }}>
      {onCalibrate && <>
        <span title="This seat publishes no usage figure. Read the percentage off its own dashboard once: antiloki divides what it sent the seat this week by it and keeps the allowance.">{name ?? seat}'s dashboard says</span>
        <input data-testid={`calibrate-input-${seat}`} value={pct} inputMode="decimal" placeholder="e.g. 90" disabled={busy} onChange={(e) => setPct(e.target.value)}
          style={{ width: 52, fontFamily: mono, fontSize: 10.5, padding: "2px 6px", background: "transparent", color: C.fg, border: `1px solid ${pct.trim() === "" || pctOk ? C.border : C.bad}`, borderRadius: 4 }} />
        <span>% used this week</span>
        {pctOk && <button data-testid={`calibrate-save-${seat}`} onClick={() => { onCalibrate(pctN as number); setPct(""); }} disabled={busy}
          style={{ fontFamily: mono, fontSize: 9.5, color: C.brand, background: "transparent", border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 7px", cursor: "pointer" }}>set</button>}
        <span style={{ color: C.dim }}>·</span>
      </>}
      <span title="This seat publishes no usage figure. antiloki counts what it sent it in the last 7 days (list price) against this number.">weekly allowance $</span>
      <input data-testid={`allowance-input-${seat}`} value={v} inputMode="decimal" placeholder="not tracked" disabled={busy} onChange={(e) => setV(e.target.value)}
        style={{ width: 84, fontFamily: mono, fontSize: 10.5, padding: "2px 6px", background: "transparent", color: C.fg, border: `1px solid ${valid ? C.border : C.bad}`, borderRadius: 4 }} />
      {dirty && valid && <button data-testid={`allowance-save-${seat}`} onClick={() => onSave(parsed)} disabled={busy}
        style={{ fontFamily: mono, fontSize: 9.5, color: C.brand, background: "transparent", border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 7px", cursor: "pointer" }}>save</button>}
      {usd != null && <span style={{ color: C.dim }}>wk ~% est. in the preview · the router uses the next best seat from 95 %</span>}
    </div>
  );
}
export function ModelSwitches({ seat, models, busy, onFlip }: { seat: string; models?: { model: string; on: boolean }[]; busy: string | null; onFlip: (seat: string, model: string, on: boolean) => void }) {
  if (!models || models.length === 0) return null;
  return (
    <div data-testid={`models-${seat}`} style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 9px 100px" }}>
      {models.map((m) => (
        <button key={m.model} data-testid={`model-toggle-${seat}-${m.model}`} data-on={m.on ? "true" : "false"} disabled={busy === `${seat}:${m.model}`} onClick={() => onFlip(seat, m.model, !m.on)}
          title={m.on ? "Heimdall may choose this model. Click to disable it: it is never chosen while it is off." : "Disabled: Heimdall never chooses this model. Click to enable it again."}
          style={{ fontFamily: mono, fontSize: 9.5, color: m.on ? C.fg : C.muted, background: "transparent", border: `1px solid ${m.on ? C.border : C.muted}`, borderRadius: 4, padding: "1px 7px", cursor: "pointer", textDecoration: m.on ? "none" : "line-through" }}>
          {m.model}{m.on ? "" : " · off"}
        </button>
      ))}
    </div>
  );
}

export function Providers() {
  const { p, busy, err, flip, flipModel, setAllowance, calibrate, pickHeimdall } = useProviders();
  const tone = { ok: C.brand, warn: "#d08770", off: C.muted } as const;
  return (
    <div data-testid="providers" style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>Providers</h2>
      <p style={{ fontSize: 12, color: C.dim, margin: "0 0 12px", lineHeight: 1.5 }}>
        antiloki merges the subscriptions you already hold. These two switches are off until you turn them on, because
        neither is a subscription: one is a metered credit balance, the other a model family you may not want.
      </p>
      {err && <div style={{ fontFamily: mono, fontSize: 11, color: "#bf616a", marginBottom: 8 }}>{err}</div>}
      {Object.entries(p?.switches ?? {}).map(([name, sw]) => (
        <label key={name} data-testid={`switch-${name}`}
               style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={sw.on} disabled={busy === name}
                 onChange={(e) => void flip(name, e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <span style={{ fontSize: 13 }}>{sw.label}</span>
            {!sw.on && <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, marginLeft: 8 }}>off by default</span>}
            <span style={{ display: "block", fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: 2 }}>{sw.note}</span>
          </span>
        </label>
      ))}
      {p?.heimdall && Array.isArray(p.heimdall.options) && (
        <div data-testid="heimdall-provider" style={{ margin: "14px 0 4px" }}>
          <label style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13 }}>⚡ {p.heimdall.label}</span>
            <select data-testid="heimdall-provider-select" value={p.heimdall.provider} disabled={busy === "heimdall"}
                    onChange={(e) => void pickHeimdall(e.target.value)} style={{ fontFamily: mono, fontSize: 11 }}>
              <option value="pane">the pane's own engine</option>
              {p.heimdall.options.map((o) => <option key={o.key} value={o.key} disabled={!o.usable}>{o.name}{o.usable ? "" : " — not usable"}</option>)}
            </select>
          </label>
          <span style={{ display: "block", fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: 2 }}>
            {p.heimdall.note}{p.heimdall.effective ? ` Right now it would plan with ${p.heimdall.effective}.` : " Right now no seat can plan."}
          </span>
        </div>
      )}
      <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 6px" }}>seats</div>
      {(p?.engines ?? []).map((r) => {
        const st = seatState(r);
        return (
          <React.Fragment key={r.key}>
          <div data-testid={`seat-${r.key}`} style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 12, minWidth: 92 }}>{r.name}</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: tone[st.tone] }}>{st.text}</span>
            {r.metered_gateway && <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>· metered gateway</span>}
            {r.on !== undefined && (
              <button data-testid={`seat-toggle-${r.key}`} disabled={busy === r.key} onClick={() => void flip(r.key, r.on === false)}
                title={r.on === false ? "the router may use this seat again" : "the router never uses this seat — e.g. when its subscription ends. Nothing is uninstalled."}
                style={{ fontFamily: mono, fontSize: 9.5, color: r.on === false ? C.brand : C.muted, background: "transparent", border: `1px solid ${r.on === false ? C.brand : C.border}`, borderRadius: 4, padding: "1px 7px", cursor: "pointer" }}>
                {r.on === false ? "turn on" : "turn off"}
              </button>
            )}
            {!!seatFix(r) && (
              <span data-testid={`seat-fix-${r.key}`} title="run this in your own terminal — antiloki never sees your credentials"
                onClick={() => { void navigator.clipboard?.writeText(seatFix(r)).catch(() => {}); }}
                style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4,
                         padding: "1px 6px", cursor: "copy", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {seatFix(r)}
              </span>
            )}
          </div>
          {["cursor", "gemini", "grok"].includes(r.key) && <AllowanceField seat={r.key} name={r.name} usd={r.week_usd ?? null} onSave={(usd) => void setAllowance(r.key, usd)} onCalibrate={(pct) => void calibrate(r.key, pct)} busy={busy === `allow-${r.key}`} />}
          <ModelSwitches seat={r.key} models={r.models} busy={busy} onFlip={(seat, model, on) => void flipModel(seat, model, on)} />
          </React.Fragment>
        );
      })}
      <ConnectClis />
      <ForgeTokens />
    </div>
  );
}

/** THE FIRST-RUN PROVIDERS (operator 2026-09-30: "the onboarding is outdated. Shouldn't ask for planner or worker. Should now show the providers to select which ones we have" · "select a main AI
 *  provider on onboarding"). Which AI does which job is automatic now, so the only thing worth asking is what the operator HAS: each seat is listed as found on this machine (ready / not signed in /
 *  not installed, with the exact command to fix it), can be switched off if they do not subscribe to it, and ONE of the usable ones is chosen as the main provider - the seat Heimdall thinks with. */
/** what each seat IS, in the user's words: the subscription they would have paid for */
const SUBSCRIPTION: Record<string, string> = {
  "claude-code": "a Claude Pro or Max subscription",
  codex: "a ChatGPT Plus, Pro or Business subscription (Codex)",
  cursor: "a Cursor Pro (or higher) subscription",
  gemini: "a Google account: the free Antigravity tier is enough",
  grok: "optional: an xAI (SuperGrok) subscription, since Cursor already serves Grok",
};
const stepBox: React.CSSProperties = { fontFamily: mono, fontSize: 11, color: C.fg, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 9px", cursor: "copy", wordBreak: "break-all" };

export function ProviderSetup() {
  const { p, busy, err, flip, pickHeimdall, reload } = useProviders({ pollMs: 3000 });
  const [choice, setChoice] = React.useState<Record<string, boolean>>({});   // the boxes the user has clicked; every other box follows the machine
  const [checking, setChecking] = React.useState(false);
  const tone = { ok: C.ok, warn: "#d08770", off: C.muted } as const;
  const seats = (p?.engines ?? []).filter((r) => !r.metered_gateway);
  const main = p?.heimdall;
  const usable = (main?.options ?? []).filter((o) => o.usable);
  // A BOX FOLLOWS THE MACHINE UNTIL THE USER CLICKS IT: a CLI that is installed is a strong sign the user holds that subscription, so one installed while this screen is open ticks itself.
  // A box the user has clicked keeps what they chose, whatever the machine says later.
  const ticked = (r: ProviderRow) => (r.key in choice ? choice[r.key] : r.installed && r.on !== false);
  const toggle = (key: string, on: boolean) => { setChoice((c) => ({ ...c, [key]: on })); void flip(key, on); };
  const recheck = async () => { setChecking(true); try { await reload(); } finally { setChecking(false); } };
  // ONE usable AI is the only possible main provider: choosing it is not a decision, so it is made
  const only = usable.length === 1 ? usable[0].key : null;
  React.useEffect(() => { if (only && main && main.provider !== only && busy !== "heimdall") void pickHeimdall(only); }, [only, main?.provider]);   // eslint-disable-line react-hooks/exhaustive-deps
  const copy = (t: string) => { void navigator.clipboard?.writeText(t).catch(() => {}); };
  const anyTicked = seats.some((r) => ticked(r));
  const readySeats = seats.filter((r) => r.usable && r.on !== false);
  return (
    <div data-testid="provider-setup">
      {err && <div style={{ fontFamily: mono, fontSize: 11, color: "#bf616a", marginBottom: 8 }}>{err}</div>}
      <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>1 · which subscriptions do you have?</div>
      <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.5, marginBottom: 8 }}>Tick the ones you pay for. antiloki then looks for the matching command-line tool on this computer and shows exactly what is missing.</div>
      {seats.length === 0 && !err && <div style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>looking for the AI CLIs…</div>}
      <div style={{ display: "grid", gap: 8 }}>
        {seats.map((r) => {
          const st = seatState(r); const on = ticked(r);
          const cmd = !r.installed ? (r.install_cmd || r.install || "") : r.signed_in === false ? (r.signin ?? "") : "";
          const needsSteps = on && !r.usable;
          return (
            <div key={r.key} data-testid={`setup-seat-${r.key}`} data-state={st.tone} style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${on ? C.brand : C.border}`, background: C.bg, opacity: on || r.usable ? 1 : 0.8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, minWidth: 240 }}>
                  <input data-testid={`setup-use-${r.key}`} type="checkbox" checked={on} disabled={busy === r.key} onChange={(e) => toggle(r.key, e.target.checked)} />
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                    {SUBSCRIPTION[r.key] && <span style={{ fontSize: 10.5, color: C.dim }}>{SUBSCRIPTION[r.key]}</span>}
                  </span>
                </label>
                <span style={{ fontFamily: mono, fontSize: 10.5, color: tone[st.tone] }}>{st.text}</span>
                {r.installed && r.signed_in === false && <SignInButton engine={r.key} onStarted={() => { if (!on) toggle(r.key, true); }} />}
              </div>
              {needsSteps && (
                <div data-testid={`setup-steps-${r.key}`} style={{ marginTop: 9, paddingTop: 9, borderTop: `1px dashed ${C.border}`, display: "grid", gap: 7, fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>
                  {!r.installed && <>
                    <div>1 · Install it. Open <b style={{ color: C.fg }}>{r.shell ?? "a terminal"}</b> and run:</div>
                    {!!cmd && <div data-testid={`setup-fix-${r.key}`} title="click to copy - run this in your own terminal; antiloki never sees your credentials" onClick={() => copy(cmd)} style={stepBox}>{cmd}</div>}
                    {!!r.needs && <div data-testid={`setup-needs-${r.key}`} style={{ fontSize: 10.5, color: "#d08770" }}>{r.needs}</div>}
                    <div>2 · Sign in{r.signin ? <>: run <span style={{ fontFamily: mono, color: C.fg }}>{r.signin}</span> once (it opens your browser).</> : "."}</div>
                  </>}
                  {r.installed && r.signed_in === false && <>
                    <div>It is installed but not signed in. Press <b style={{ color: C.fg }}>Sign in</b> above and a terminal window opens with its own sign-in, or open <b style={{ color: C.fg }}>{r.shell ?? "a terminal"}</b> yourself and run:</div>
                    {!!cmd && <div data-testid={`setup-fix-${r.key}`} title="click to copy - run this in your own terminal; antiloki never sees your credentials" onClick={() => copy(cmd)} style={stepBox}>{cmd}</div>}
                  </>}
                  {r.installed && r.signed_in !== false && <div>Installed and signed in, but not available right now: {r.blocked ?? "it may be switched off or still starting"}.</div>}
                  <div style={{ fontSize: 10.5, color: C.muted }}>antiloki looks again every few seconds: come back to this window and it picks the tool up on its own.</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button data-testid="setup-recheck" onClick={() => void recheck()} disabled={checking}
          style={{ cursor: "pointer", padding: "5px 12px", borderRadius: 8, fontFamily: mono, fontSize: 10.5, color: C.fg, background: "transparent", border: `1px solid ${C.border}` }}>{checking ? "checking…" : "check again"}</button>
        <span style={{ fontSize: 10.5, color: C.dim }}>{readySeats.length} ready · antiloki rechecks every few seconds</span>
      </div>
      {seats.length > 0 && readySeats.length === 0 && (
        <div data-testid="setup-none-ready" style={{ marginTop: 10, padding: "9px 12px", borderRadius: 10, border: `1px solid #d08770`, fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>
          {anyTicked ? "No AI is ready yet. antiloki needs at least one signed-in tool to work: follow the steps above." : "Tick the subscription you have. Nothing yet? The free Antigravity tier needs only a Google account, and it is enough to start."}
        </div>
      )}
      <p style={{ fontSize: 11, color: C.dim, margin: "10px 0 0", lineHeight: 1.5 }}>Untick any you do not subscribe to - antiloki never uses it. Which AI does which job (planning, writing, checking) is decided automatically from what you hold.</p>
      {main && Array.isArray(main.options) && (
        <div data-testid="setup-main" style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>2 · your main provider (Heimdall)</div>
          <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.5, marginBottom: 8 }}>The one AI Heimdall thinks with - it reads each ask and decides how to run it. Pick the subscription you trust most.{only ? " Only one is ready, so it is already chosen." : ""}</div>
          {usable.length === 0 && <div data-testid="setup-main-none" style={{ fontFamily: mono, fontSize: 11, color: "#d08770" }}>no AI is ready yet - install and sign in to one above, then it appears here.</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {usable.map((o) => { const on = main.provider === o.key; return (
              <button key={o.key} data-testid={`setup-main-${o.key}`} data-on={on ? "1" : "0"} disabled={busy === "heimdall"} onClick={() => void pickHeimdall(o.key)}
                style={{ cursor: "pointer", padding: "7px 14px", borderRadius: 9, fontFamily: mono, fontSize: 11.5, color: on ? C.brand : C.fg, background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : C.border}` }}>{on ? "✓ " : ""}{o.name}</button>
            ); })}
          </div>
          {usable.length > 1 && main.provider === "pane" && <div data-testid="setup-main-choose" style={{ fontSize: 10.5, color: "#d08770", marginTop: 8 }}>Choose one: until then Heimdall uses whichever AI the pane happens to be on.</div>}
        </div>
      )}
      <ConnectClis heading="3 · connect antiloki to your CLIs" />
    </div>
  );
}


type ForgeRow = { host: string; kind: string; active_from: string | null; stored: boolean };
/** THE FORGE TOKEN, FROM SETTINGS (operator 2026-09-30: "we should have a place on settings to add the token from github"). A pull request needs a token for the forge; it used to come only from an
 *  environment variable, a hand-made file or `gh`. It is checked against GitHub before it is kept, written owner-only outside every repository, and NEVER shown again - the list says where each
 *  host's token comes from, not what it is. */
export function ForgeTokens() {
  const [rows, setRows] = React.useState<ForgeRow[] | null>(null);
  const [gh, setGh] = React.useState<{ installed: boolean; account: string | null } | null>(null);
  const [host, setHost] = React.useState("github.com");
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const load = React.useCallback(async () => {
    try { const r: any = await apiGet("/api/v1/settings/forge-tokens"); const d = r?.result?.result ?? r?.result ?? r; if (Array.isArray(d?.hosts)) { setRows(d.hosts); setGh(d.gh ?? null); } } catch { setRows(null); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      // STRICT (audit 2026-10-01): a refused token (401/400), an old serve (404) or a timeout came back as null, so this said "saved" and emptied the field on a token that was never kept.
      // The token leaves the field only when the serve took it; on any failure it stays, with the reason beside it.
      const r: any = await apiPostStrict("/api/v1/settings/forge-tokens", { host: host.trim(), token });
      const d = r?.result?.result ?? r?.result ?? r;
      setToken("");                                                   // the secret leaves the screen the moment it is kept
      setMsg({ ok: true, text: d?.note ? String(d.note) : d?.login ? `saved - GitHub says this is ${d.login}` : "saved" });
      await load();
    } catch (e) { setMsg({ ok: false, text: `could not save the token: ${reasonOf(e)}` }); } finally { setBusy(false); }
  };
  const remove = async (h: string) => {
    setBusy(true); setMsg(null);
    try { await apiPostStrict("/api/v1/settings/forge-tokens", { host: h, remove: true }); setMsg({ ok: true, text: `the stored token for ${h} is gone` }); await load(); }
    catch (e) { setMsg({ ok: false, text: `could not remove it: ${reasonOf(e)}` }); } finally { setBusy(false); }
  };
  return (
    <div data-testid="forge-tokens" style={{ marginTop: 22 }}>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>pull requests · forge tokens</div>
      <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginBottom: 8, maxWidth: 640 }}>
        A pull request is filed with a token for the forge. Paste one here: it is checked with GitHub first, kept in <span style={{ fontFamily: mono }}>~/.antiloki/tokens/&lt;host&gt;</span> (owner-only, outside your repositories) and never shown again.
        For GitHub use a fine-grained token limited to the repositories you need, with <b>Contents</b> and <b>Pull requests</b>: read and write. {gh?.account ? <>Or skip this: the GitHub CLI is already signed in as <b>{gh.account}</b>, and antiloki uses it.</> : <>Or sign in once with <span style={{ fontFamily: mono }}>gh auth login</span> in your terminal.</>}
      </div>
      {(rows ?? []).map((r) => (
        <div key={r.host} data-testid={`forge-${r.host}`} style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, fontSize: 12 }}>
          <span style={{ minWidth: 118 }}>{r.host}</span>
          <span style={{ fontFamily: mono, fontSize: 10, color: r.active_from ? C.ok : C.muted }}>{r.active_from ? `a token is in use · from ${r.active_from}` : "no token"}</span>
          {r.stored && <button data-testid={`forge-remove-${r.host}`} disabled={busy} onClick={() => void remove(r.host)} style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 7px", cursor: "pointer" }}>remove stored token</button>}
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <input data-testid="forge-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="github.com" spellCheck={false} style={{ width: 150, background: C.bg, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "4px 8px", fontFamily: mono, fontSize: 11 }} />
        <input data-testid="forge-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste the token" autoComplete="new-password" spellCheck={false} style={{ flex: "1 1 240px", maxWidth: 360, background: C.bg, border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "4px 8px", fontFamily: mono, fontSize: 11 }} />
        <button data-testid="forge-save" disabled={busy || !token.trim() || !host.trim()} title={busy ? "checking the token…" : !host.trim() ? "enter the host first (for example github.com)" : !token.trim() ? "paste the token first" : "check the token against the host, then save it"} onClick={() => void save()} style={{ fontFamily: mono, fontSize: 11, color: token.trim() ? C.brand : C.dim, background: "transparent", border: `1px solid ${token.trim() ? C.brand : C.border}`, borderRadius: 6, padding: "4px 12px", cursor: busy ? "default" : "pointer" }}>{busy ? "checking…" : "check & save"}</button>
      </div>
      {msg && <div data-testid="forge-msg" style={{ fontFamily: mono, fontSize: 10.5, marginTop: 6, color: msg.ok ? C.ok : C.bad }}>{msg.ok ? "✓ " : "✗ "}{msg.text}</div>}
    </div>
  );
}
