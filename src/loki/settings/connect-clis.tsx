// CONNECT ANTILOKI TO YOUR CLIs (operator 2026-11-18): a CLI started in an ordinary terminal does not know antiloki's tools; the panes antiloki starts itself always do.
// One row per installed provider: where it stands and one button. The server runs the CLI's own `mcp add` (or edits its config file after a backup); see mcp_install.rs.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import { apiPostStrict, reasonOf } from "@/loki/api/post-strict";

export type CliRow = { key: string; label: string; cli: string; installed: boolean; connected: boolean; how: string; will: string };
export type CliPayload = { ok: boolean; why: string; providers: CliRow[] };
/** The payload the screen can draw, else null. Pure. */
export function cliPayloadOf(d: any): CliPayload | null { return d && d.ok === true && Array.isArray(d.providers) ? (d as CliPayload) : null; }
/** The rows the screen shows (only CLIs that are installed here) and how many of them still wait for the button. Pure. */
export function cliSummary(p: CliPayload | null): { rows: CliRow[]; open: CliRow[] } { const rows = (p?.providers ?? []).filter((r) => r.installed); return { rows, open: rows.filter((r) => !r.connected) }; }

export function ConnectClis({ heading }: { heading?: string }) {
  const [p, setP] = React.useState<CliPayload | null>(null); const [busy, setBusy] = React.useState<string | null>(null); const [err, setErr] = React.useState<string | null>(null); const [asked, setAsked] = React.useState(false);
  const load = React.useCallback(async () => { try { setP(cliPayloadOf(await apiGet("/api/v1/onboarding/mcp"))); } catch { /* a busy serve: keep what is shown */ } setAsked(true); }, []);
  React.useEffect(() => { void load(); }, [load]);
  const act = async (provider: string, action: "install" | "remove") => {
    setBusy(provider); setErr(null);
    try { const r: any = await apiPostStrict("/api/v1/onboarding/mcp", { provider, action }); const d = r?.result ?? r; if (d?.ok === false) setErr(`${provider}: ${d.error ?? "it did not work"}`); } catch (e) { setErr(`${provider}: ${reasonOf(e)}`); }
    await load(); setBusy(null);
  };
  const { rows, open } = cliSummary(p);
  const all = async () => { for (const r of open) await act(r.key, "install"); };
  if (!p) return asked ? null : <div data-testid="connect-clis" style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontSize: 11.5, color: C.dim }}>looking at your CLIs…</div>;   // a serve without the route (an older build) shows nothing, not a spinner
  return (
    <div data-testid="connect-clis" style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{heading ?? "connect antiloki to your CLIs"}</div>
      <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>{p.why}</div>
      {rows.length === 0 && <div data-testid="connect-none" style={{ fontSize: 11.5, color: C.muted }}>No supported CLI is installed here yet. Install one above, then come back.</div>}
      {rows.map((r) => (
        <div key={r.key} data-testid={`connect-${r.key}`} data-connected={r.connected ? "1" : "0"} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, flex: "none", background: r.connected ? C.ok : C.border }} />
          <span style={{ flex: 1, minWidth: 0 }}><span style={{ fontSize: 13, color: C.fg }}>{r.label}</span><span title={r.will} style={{ display: "block", fontFamily: mono, fontSize: 10.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.connected ? "connected: its sessions can use antiloki" : r.will}</span></span>
          <button data-testid={`connect-btn-${r.key}`} disabled={busy !== null} onClick={() => void act(r.key, r.connected ? "remove" : "install")}
            style={{ cursor: busy ? "default" : "pointer", flex: "none", padding: "5px 12px", borderRadius: 8, fontFamily: mono, fontSize: 11, color: r.connected ? C.muted : C.brand, background: "transparent", border: `1px solid ${r.connected ? C.border : C.brand}` }}>{busy === r.key ? "…" : r.connected ? "Disconnect" : "Connect"}</button>
        </div>
      ))}
      {open.length > 1 && <button data-testid="connect-all" disabled={busy !== null} onClick={() => void all()} style={{ cursor: "pointer", marginTop: 10, padding: "6px 14px", borderRadius: 8, fontFamily: mono, fontSize: 11, color: C.brand, background: "transparent", border: `1px solid ${C.brand}` }}>Connect all ({open.length})</button>}
      {err && <div data-testid="connect-err" style={{ fontFamily: mono, fontSize: 11, color: "#d08770", marginTop: 8 }}>{err}</div>}
    </div>
  );
}

const NUDGE_KEY = "antiloki.connect.nudge.off";
/** A one-line card for a menu where a provider is opened: some installed CLI does not know antiloki when it is started by hand. One click connects them all; "not now" is remembered. */
export function ConnectNudge() {
  const [p, setP] = React.useState<CliPayload | null>(null); const [busy, setBusy] = React.useState(false); const [off, setOff] = React.useState(() => { try { return localStorage.getItem(NUDGE_KEY) === "1"; } catch { return false; } });
  const load = React.useCallback(async () => { try { setP(cliPayloadOf(await apiGet("/api/v1/onboarding/mcp"))); } catch { /* nothing to offer without an answer */ } }, []);
  React.useEffect(() => { if (!off) void load(); }, [off, load]);
  const { open } = cliSummary(p); if (off || open.length === 0) return null;
  const go = async () => { setBusy(true); try { for (const r of open) await apiPostStrict("/api/v1/onboarding/mcp", { provider: r.key, action: "install" }); } catch { /* the Settings list shows the reason */ } await load(); setBusy(false); };
  const hide = () => { try { localStorage.setItem(NUDGE_KEY, "1"); } catch { /* it comes back next time */ } setOff(true); };
  return (
    <div data-testid="connect-nudge" style={{ margin: "6px 8px 2px", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11.5, lineHeight: 1.45, color: C.dim }}>
      {open.map((r) => r.label).join(", ")} {open.length === 1 ? "does" : "do"} not know antiloki when you start {open.length === 1 ? "it" : "them"} by hand.
      <span style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button data-testid="nudge-connect" disabled={busy} onClick={() => void go()} style={{ cursor: "pointer", padding: "3px 10px", borderRadius: 7, fontFamily: mono, fontSize: 11, color: C.brand, background: "transparent", border: `1px solid ${C.brand}` }}>{busy ? "…" : "Connect"}</button>
        <button data-testid="nudge-off" onClick={hide} style={{ cursor: "pointer", padding: "3px 6px", fontFamily: mono, fontSize: 11, color: C.muted, background: "transparent", border: "none" }}>not now</button>
      </span>
    </div>
  );
}
