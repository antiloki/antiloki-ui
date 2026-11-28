// A WEB APP THROUGH ITS TOOLS (RFC 0009, BL-12). Many apps forbid being shown inside another page; their MCP server still lets the person (and the agents) use them. This panel lists an installed app's tools with their risk, takes the
// sign-in token (the serve keeps it: it is never shown again), and calls a tool with JSON arguments. A write is the person's own click; a destructive tool asks to be confirmed.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { appCall, appSignIn, appTools, loadWebApps, webAppSignIn, type AppTool } from "./api";

const RISK: Record<AppTool["risk"], { label: string; color: string }> = { read: { label: "reads", color: "var(--c-ok)" }, write: { label: "writes", color: "#c9a34e" }, destructive: { label: "destroys", color: "var(--c-bad)" } };
/** The arguments a tool's schema asks for, as editable JSON: each required property with an empty value of its type. Pure. */
export function argsTemplate(schema: any): string {
  const props = schema?.properties && typeof schema.properties === "object" ? schema.properties : {}; const req: string[] = Array.isArray(schema?.required) ? schema.required : Object.keys(props).slice(0, 0);
  const empty = (t: any) => (t === "number" || t === "integer" ? 0 : t === "boolean" ? false : t === "array" ? [] : t === "object" ? {} : "");
  return JSON.stringify(Object.fromEntries(req.map((k) => [k, empty(props[k]?.type)])), null, 1);
}
const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "3px 10px", cursor: "pointer" };

export function AppTools({ app }: { app: { id: string; name: string } }) {
  const [st, setSt] = React.useState<{ ok: boolean; error?: string; tools: AppTool[]; signed_in: boolean; needs_signin: boolean } | null>(null);
  const [meta, setMeta] = React.useState<{ url: string; docs: string }>({ url: "", docs: "" }); const [signing, setSigning] = React.useState<string | null>(null);
  React.useEffect(() => { let stop = false; void Promise.resolve().then(() => loadWebApps()).then((w) => { const a = w?.installed.find((x) => x.id === app.id); if (a && !stop) setMeta({ url: a.app_url, docs: a.docs }); }).catch(() => {}); return () => { stop = true; }; }, [app.id]);
  // CONNECT WITH THE APP'S OWN SIGN-IN (no token to paste): the serve opens the app's sign-in in the person's browser and this panel goes on by itself when it is done
  const connect = async () => { setSigning("Opening the sign-in in your browser…"); const r = await webAppSignIn(app.id); if (!r.ok) { setSigning(r.error || "the sign-in did not start"); return; } setSigning(r.url ? `Open this address in your browser: ${r.url}` : "Sign in in the browser window that opened. This goes on by itself."); for (let i = 0; i < 90; i++) { await new Promise((res) => setTimeout(res, 2000)); const t = await appTools(app.id); if (t.ok && !t.needs_signin) { setSigning(null); await load(); return; } } setSigning("The sign-in did not finish. Try again."); };
  const [token, setToken] = React.useState(""); const [open, setOpen] = React.useState<string | null>(null); const [args, setArgs] = React.useState(""); const [ok2, setOk2] = React.useState(false);
  const [out, setOut] = React.useState<{ text: string; bad?: boolean } | null>(null); const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => { setSt(await appTools(app.id)); }, [app.id]);
  React.useEffect(() => { void load(); }, [load]);
  if (!st) return null;
  const noMcp = !st.ok && !st.needs_signin;   // an app without an MCP address (or one that does not answer) has nothing to show here
  if (noMcp) return <div data-testid="apptools-none" style={{ padding: "6px 14px", fontSize: 11.5, color: C.dim }}>{app.name} has no tools to use here{st.error ? ` (${st.error})` : ""}.</div>;
  const call = async (t: AppTool) => { let a: unknown; try { a = args.trim() ? JSON.parse(args) : {}; } catch { setOut({ text: "the arguments are not valid JSON", bad: true }); return; } setBusy(true); const r = await appCall(app.id, t.name, a, ok2); setBusy(false); setOut(r.ok ? { text: r.text || "(no text)", bad: r.is_error } : { text: r.error ?? "failed", bad: true }); };
  return (
    <div data-testid="apptools" style={{ borderTop: `1px solid ${C.border}`, fontFamily: nav, fontSize: 12.5, color: C.fg, maxHeight: "50%", overflowY: "auto" }}>
      <div style={{ padding: "6px 14px", display: "flex", gap: 10, alignItems: "center" }}><b style={{ fontWeight: 500 }}>Tools</b><span style={{ color: C.muted }}>{st.tools.length} · {st.signed_in ? "signed in" : "not signed in"}</span>
        {st.signed_in && <button data-testid="apptools-signout" style={{ ...btn, marginLeft: "auto" }} onClick={async () => { await appSignIn(app.id, null); await load(); }}>Sign out</button>}</div>
      {st.needs_signin && <div data-testid="apptools-signin" style={{ padding: "4px 14px 8px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button data-testid="apptools-connect" disabled={signing !== null && !/did not|could not/i.test(signing)} style={{ ...btn, background: "var(--c-brand)", color: "#fff", borderColor: "var(--c-brand)" }} onClick={() => void connect()}>Connect with {app.name}</button>
        {signing && <span data-testid="apptools-signing" style={{ color: C.muted }}>{signing}</span>}
        <span style={{ color: C.muted }}>{app.name} asks you to sign in. Connect with its own sign-in, or paste an access token (kept on this machine; never shown again).</span>
        <span style={{ display: "inline-flex", gap: 12 }}>
          {meta.url && <a data-testid="apptools-app-link" href={meta.url} target="_blank" rel="noreferrer" style={{ color: C.brand, textDecoration: "underline" }}>Open {app.name} ↗</a>}
          {meta.docs && <a data-testid="apptools-docs-link" href={meta.docs} target="_blank" rel="noreferrer" style={{ color: C.brand, textDecoration: "underline" }}>How to get a token: {app.name} docs ↗</a>}
        </span>
        <input data-testid="apptools-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} style={{ background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px", fontFamily: mono, width: 220 }} />
        <button data-testid="apptools-save" disabled={!token.trim()} style={btn} onClick={async () => { const r = await appSignIn(app.id, token.trim()); setToken(""); if (r.ok) await load(); else setOut({ text: r.error ?? "not saved", bad: true }); }}>Sign in</button></div>}
      {st.tools.map((t) => <div key={t.name} data-testid={`apptool-${t.name}`} style={{ padding: "6px 14px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}><span style={{ fontFamily: mono }}>{t.name}</span><span data-testid={`apptool-risk-${t.name}`} style={{ color: RISK[t.risk]?.color ?? C.muted, fontSize: 11.5 }}>{RISK[t.risk]?.label ?? t.risk}</span>
          <span style={{ color: C.muted, flex: "1 1 200px", minWidth: 0 }}>{t.description}</span><button data-testid={`apptool-open-${t.name}`} style={btn} onClick={() => { setOpen(open === t.name ? null : t.name); setArgs(argsTemplate(t.input_schema)); setOk2(false); setOut(null); }}>{open === t.name ? "Close" : "Use"}</button></div>
        {open === t.name && <div style={{ marginTop: 6 }}>
          <textarea data-testid="apptool-args" value={args} onChange={(e) => setArgs(e.target.value)} rows={Math.min(8, Math.max(3, args.split("\n").length))} spellCheck={false} style={{ width: "100%", boxSizing: "border-box", background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 6, fontFamily: mono, fontSize: 12 }} />
          {t.risk === "destructive" && <label style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--c-bad)", margin: "4px 0" }}><input data-testid="apptool-confirm" type="checkbox" checked={ok2} onChange={(e) => setOk2(e.target.checked)} />this destroys data in {app.name}: I confirm</label>}
          <button data-testid="apptool-call" disabled={busy || (t.risk === "destructive" && !ok2)} style={{ ...btn, marginTop: 4 }} onClick={() => void call(t)}>{busy ? "Calling…" : "Call"}</button>
          {out && <pre data-testid="apptool-out" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: mono, fontSize: 11.5, color: out.bad ? "var(--c-bad)" : C.fg, maxHeight: 220, overflowY: "auto" }}>{out.text.slice(0, 4000)}</pre>}</div>}
      </div>)}
    </div>
  );
}
