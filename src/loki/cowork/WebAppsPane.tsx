// THE WEB APPS STORE, AS A PANE (operator 2026-11-10): the official MCP servers of big apps, installed with one button; an app of your own, two ways ("official MCP": you have its MCP address, or "generate": antiloki looks at the app's
// address for the description of its API and turns each operation into a tool); what is installed, each with Open (the app in its own pane) and Remove. Installing puts the app on the "Web apps" part of the new-pane menu.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { inspectWebApp, loadWebApps, webAppConnect, webAppOp, webAppSignIn, type AppTest } from "./api";
import { categoriesOf, filterStore, installLine, isInstalled, type Inspection, type InstalledApp, type StoreApp, type WebApps } from "./webapps";

const btn = (primary = false, disabled = false): React.CSSProperties => ({ background: primary ? C.brand : "transparent", color: primary ? "#fff" : C.fg, border: `1px solid ${primary ? C.brand : C.border}`, borderRadius: 7, padding: "4px 10px", cursor: disabled ? "default" : "pointer", fontFamily: nav, fontSize: 12, opacity: disabled ? 0.55 : 1, fontWeight: primary ? 600 : 400 });
const input: React.CSSProperties = { background: C.panel, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", fontFamily: nav, fontSize: 12.5, minWidth: 0, width: "100%", boxSizing: "border-box" };
const dot = (c: string) => <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: c || C.muted, flexShrink: 0, display: "inline-block" }} />;

export function WebAppsPane({ onOpenApp }: { onOpenApp?: (a: InstalledApp) => void }) {
  const [data, setData] = React.useState<WebApps | null | undefined>(undefined); const [cat, setCat] = React.useState("All"); const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null); const [note, setNote] = React.useState<{ ok: boolean; line: string } | null>(null);
  const [adding, setAdding] = React.useState(false); const [mode, setMode] = React.useState<"generated" | "official">("generated");
  const [name, setName] = React.useState(""); const [url, setUrl] = React.useState(""); const [mcp, setMcp] = React.useState(""); const [spec, setSpec] = React.useState(""); const [insp, setInsp] = React.useState<Inspection | null>(null);
  const load = React.useCallback(async () => { setData(await loadWebApps()); }, []);
  React.useEffect(() => { void load(); }, [load]);
  const op = async (key: string, label: string, body: Record<string, unknown>): Promise<boolean> => {
    setBusy(key); setNote(null); const r = await webAppOp(body); setBusy(null);
    if (body.op === "install") setNote(installLine(label, r)); else setNote({ ok: r.ok, line: r.ok ? `${label} is removed` : r.error || "that did not work" });
    if (r.ok) await load(); return r.ok;
  };
  const look = async () => { setBusy("inspect"); setNote(null); setInsp(null); const r = await inspectWebApp(url.trim(), spec.trim()); setBusy(null); if (r.inspection) setInsp(r.inspection); else setNote({ ok: false, line: r.error || "could not look at that address" }); };
  const addOwn = async () => { const ok = await op("own", name.trim() || "the app", { op: "install", name: name.trim(), app_url: url.trim(), kind: mode, mcp_url: mode === "official" ? mcp.trim() : "", openapi_url: spec.trim(), tools: mode === "generated" && insp ? insp.tools : [] }); if (ok) { setAdding(false); setName(""); setUrl(""); setMcp(""); setSpec(""); setInsp(null); } };
  const [tests, setTests] = React.useState<Record<string, AppTest>>({}); const [tok, setTok] = React.useState<Record<string, string>>({});
  const test = async (id: string) => { setBusy(`t-${id}`); const r = await webAppConnect({ op: "tools", app: id }); setBusy(null); setTests((t) => ({ ...t, [id]: r })); };
  const signIn = async (id: string) => { setBusy(`o-${id}`); const r = await webAppSignIn(id); if (!r.ok) { setBusy(null); setTests((t) => ({ ...t, [id]: { ok: false, needsSignin: true, error: r.error, signedIn: false, tools: [] } })); return; } for (let i = 0; i < 90; i++) { await new Promise((res) => setTimeout(res, 2000)); const t = await webAppConnect({ op: "tools", app: id }); if (t.ok) { setBusy(null); setTests((x) => ({ ...x, [id]: t })); return; } } setBusy(null); };
  const saveToken = async (id: string, forget = false) => { setBusy(`k-${id}`); await webAppConnect(forget ? { op: "token_forget", app: id } : { op: "token_set", app: id, token: (tok[id] || "").trim() }); setTok((t) => ({ ...t, [id]: "" })); setBusy(null); if (!forget) await test(id); else setTests((t) => { const n = { ...t }; delete n[id]; return n; }); };
  const wrap: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 12, padding: 12, fontFamily: nav, color: C.fg, fontSize: 12.5 };
  if (data === undefined) return <div data-testid="webapps" style={{ ...wrap, color: C.muted }}>opening the store…</div>;
  if (data === null) return <div data-testid="webapps" style={wrap}><div data-testid="webapps-error" style={{ color: C.bad }}>the store could not be read: the serve did not answer, or it is an older one (restart antiloki's serve).</div><button style={{ ...btn(), alignSelf: "flex-start" }} onClick={() => { setData(undefined); void load(); }}>Try again</button></div>;
  const shown = filterStore(data.catalog, cat, q);
  const card = (a: StoreApp) => { const on = isInstalled(data.installed, a.id); return (
    <div key={a.id} data-testid={`store-app-${a.id}`} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{dot(a.color)}<b style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</b><span style={{ fontSize: 10.5, color: C.muted }}>{a.category}</span></div>
      <div style={{ color: C.muted, lineHeight: 1.45, fontSize: 12 }}>{a.blurb}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {on ? <><span data-testid={`store-installed-${a.id}`} style={{ color: C.ok, fontSize: 12 }}>✓ installed</span><button data-testid={`store-remove-${a.id}`} disabled={busy !== null} style={btn(false, busy !== null)} onClick={() => void op(`rm-${a.id}`, a.name, { op: "uninstall", id: a.id })}>Remove</button></>
          : <button data-testid={`store-install-${a.id}`} disabled={busy !== null} style={btn(true, busy !== null)} onClick={() => void op(`in-${a.id}`, a.name, { op: "install", store_id: a.id })}>{busy === `in-${a.id}` ? "installing…" : "Install"}</button>}
        <a href={a.docs} target="_blank" rel="noreferrer" style={{ color: C.muted, fontSize: 11.5 }}>docs ↗</a>
        <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>{a.auth === "local" ? "runs on this machine" : a.auth === "token" ? "token" : "sign-in"}</span>
      </div>
    </div>); };
  return (
    <div data-testid="webapps" style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Web apps</div><button data-testid="webapps-add" style={btn(adding)} onClick={() => setAdding((x) => !x)}>{adding ? "close" : "+ add your own"}</button></div>
      {note && <div role="status" data-testid="webapps-note" style={{ color: note.ok ? C.ok : C.bad, lineHeight: 1.45 }}>{note.line}</div>}
      {adding && (
        <div data-testid="webapps-form" style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button data-testid="mode-generated" aria-pressed={mode === "generated"} style={btn(mode === "generated")} onClick={() => setMode("generated")}>Generate MCP</button>
            <button data-testid="mode-official" aria-pressed={mode === "official"} style={btn(mode === "official")} onClick={() => setMode("official")}>Official MCP</button>
          </div>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>{mode === "generated" ? "antiloki reads the app's API description (OpenAPI) and turns each operation into a tool." : "the app's maker publishes an MCP server: give its address."}</div>
          <input data-testid="own-name" aria-label="name" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} style={input} />
          <input data-testid="own-url" aria-label="app address" placeholder="the app's address, https://…" value={url} onChange={(e) => setUrl(e.target.value)} style={input} />
          {mode === "official" ? <input data-testid="own-mcp" aria-label="MCP address" placeholder="its MCP server address, https://…/mcp" value={mcp} onChange={(e) => setMcp(e.target.value)} style={input} />
            : <input data-testid="own-spec" aria-label="OpenAPI address" placeholder="OpenAPI address (optional: the usual places are tried)" value={spec} onChange={(e) => setSpec(e.target.value)} style={input} />}
          {mode === "generated" && <div style={{ display: "flex", gap: 6 }}><button data-testid="own-inspect" disabled={!url.trim() || busy !== null} style={btn(false, !url.trim() || busy !== null)} onClick={() => void look()}>{busy === "inspect" ? "looking…" : "Look at the app"}</button></div>}
          {insp && (
            <div data-testid="own-inspection" style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {insp.count === 0 ? <div style={{ color: C.muted, lineHeight: 1.45 }}>{insp.note || "no tools found"}</div> : <>
                <div>{insp.title ? <b>{insp.title}: </b> : null}{insp.count} tool{insp.count === 1 ? "" : "s"}{insp.writes ? `, ${insp.writes} that change things` : ", all read-only"}</div>
                <div style={{ maxHeight: 120, overflowY: "auto", fontFamily: mono, fontSize: 11, color: C.muted }}>{insp.tools.slice(0, 40).map((t) => <div key={t.name}>{t.risk === "read" ? "·" : "!"} {t.name}</div>)}</div></>}
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}><button data-testid="own-install" disabled={!name.trim() || !url.trim() || busy !== null || (mode === "official" && !mcp.trim())} style={btn(true, !name.trim() || !url.trim() || busy !== null || (mode === "official" && !mcp.trim()))} onClick={() => void addOwn()}>{busy === "own" ? "installing…" : "Install"}</button></div>
        </div>
      )}
      {data.installed.length > 0 && (
        <section aria-label="Installed" data-testid="webapps-installed" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.05em", color: C.muted, textTransform: "uppercase" }}>Installed</div>
          {data.installed.map((a) => (
            <div key={a.id} data-testid={`installed-${a.id}`} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 8px", minWidth: 0 }}>
              {dot(a.color)}<span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}<span style={{ color: C.muted }}> · {a.kind === "official" ? "official MCP" : `generated, ${a.tools} tools`}</span></span>
              {onOpenApp && <button data-testid={`installed-open-${a.id}`} style={btn()} onClick={() => onOpenApp(a)}>Open</button>}
              <button data-testid={`installed-test-${a.id}`} disabled={busy !== null} style={btn(false, busy !== null)} onClick={() => void test(a.id)}>{busy === `t-${a.id}` ? "Testing…" : "Test"}</button>
              <button data-testid={`installed-remove-${a.id}`} disabled={busy !== null} style={btn(false, busy !== null)} onClick={() => void op(`rm-${a.id}`, a.name, { op: "uninstall", id: a.id })}>Remove</button>
            </div>
          ))}
          {data.installed.map((a) => { const t = tests[a.id]; if (!t) return null; const writes = t.tools.filter((x) => x.risk !== "read").length; return (
            <div key={`s-${a.id}`} data-testid={`connect-${a.id}`} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 8, display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.45 }}>
              {t.ok ? <div style={{ color: C.ok }}>{a.name} is connected: {t.tools.length} tool{t.tools.length === 1 ? "" : "s"}{writes ? `, ${writes} that change things (a team needs your yes for those)` : ", all read-only"}{t.signedIn ? " · token kept on this machine" : ""}</div>
                : <div style={{ color: C.bad }}>{t.needsSignin ? `${a.name} wants you to sign in. Open it and sign in, or paste a token below.` : t.error || "that did not work"}</div>}
              {t.ok && <div style={{ maxHeight: 90, overflowY: "auto", fontFamily: mono, fontSize: 11, color: C.muted }}>{t.tools.slice(0, 40).map((x) => <div key={x.name}>{x.risk === "read" ? "·" : "!"} {x.name}</div>)}</div>}
              {!t.ok && t.needsSignin && <div><button data-testid={`installed-signin-${a.id}`} disabled={busy !== null} style={btn(true, busy !== null)} onClick={() => void signIn(a.id)}>{busy === `o-${a.id}` ? "Waiting for the browser…" : `Sign in to ${a.name}`}</button></div>}
              {(!t.ok && t.needsSignin) || t.signedIn ? <div style={{ display: "flex", gap: 6 }}>
                {!t.signedIn && <input data-testid={`token-${a.id}`} type="password" aria-label={`${a.name} token`} placeholder="token (kept in a private file on this machine, never in a project)" value={tok[a.id] || ""} onChange={(e) => setTok((x) => ({ ...x, [a.id]: e.target.value }))} style={input} />}
                {!t.signedIn && <button data-testid={`token-save-${a.id}`} disabled={busy !== null || !(tok[a.id] || "").trim()} style={btn(true, busy !== null || !(tok[a.id] || "").trim())} onClick={() => void saveToken(a.id)}>Save</button>}
                {t.signedIn && <button data-testid={`token-forget-${a.id}`} disabled={busy !== null} style={btn(false, busy !== null)} onClick={() => void saveToken(a.id, true)}>Forget token</button>}
              </div> : null}
            </div>); })}
        </section>
      )}
      <section aria-label="Store" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input data-testid="store-search" aria-label="search the store" placeholder="search the store" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, width: 180 }} />
          {categoriesOf(data.catalog).map((c) => <button key={c} data-testid={`store-cat-${c}`} aria-pressed={cat === c} style={btn(cat === c)} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div data-testid="store-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>{shown.map(card)}</div>
        {shown.length === 0 && <div data-testid="store-empty" style={{ color: C.muted }}>nothing in the store matches that</div>}
      </section>
    </div>
  );
}
