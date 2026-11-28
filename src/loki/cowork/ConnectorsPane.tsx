// THE CONNECTORS PANE (RFC 0022). It starts EMPTY: a connector exists only because the person asked an agent for it. The agent proposes a recipe
// (what it gives, the steps, the inputs); this pane draws that recipe as a connection screen: a short tutorial, the fields for the keys (or a
// Connect button for an OAuth service), a test, and the recipe as YAML. A secret is typed here once and goes straight to the serve's private
// `.antiloki/.env`; the pane never gets it back. Flat, no shadows.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { NEW_CONNECTOR, CONNECTOR_OPEN, connectorLogoUrl, connectorOauthUrl, connectorRemove, connectorSave, connectorsList, connectorSetAccess, connectorTest, monogram, statusWord, takeOpenConnector, type Connector } from "./connectors-api";

const dot = (c: Connector) => (c.status === "connected" ? C.ok : c.status === "error" ? C.bad : C.warn);

function Logo({ c, size }: { c: Connector; size: number }) {
  const [broken, setBroken] = React.useState(false);
  const box: React.CSSProperties = { width: size, height: size, borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel2, display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, color: C.dim, fontFamily: nav, fontSize: Math.round(size * 0.42), fontWeight: 600 };
  return <span style={box} aria-hidden>{c.hasLogo && !broken ? <img src={connectorLogoUrl(c.slug, c.updatedAt)} alt="" width={size - 8} height={size - 8} style={{ objectFit: "contain" }} onError={() => setBroken(true)} /> : monogram(c.title)}</span>;
}

function Detail({ c, onBack, onChanged }: { c: Connector; onBack: () => void; onChanged: (c: Connector | null) => void }) {
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false); const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [yamlOpen, setYamlOpen] = React.useState(false); const [sure, setSure] = React.useState(false);
  const [ask, setAsk] = React.useState(false);
  const setAccess = async (a: "read-only" | "read-write") => { setBusy(true); setAsk(false); const o = await connectorSetAccess(c.slug, a); if (o.connector) onChanged(o.connector); setMsg(o.ok ? null : { ok: false, text: o.message || "could not change it" }); setBusy(false); };
  // no setup needed (a built-in or self-registered sign-in): just the Connect button, unless the person wants their own client
  const [manual, setManual] = React.useState(false); const oneClick = c.auth === "oauth" && c.oauthReady && !manual;
  const done = (o: { ok: boolean; message: string; connector: Connector | null }) => { setMsg({ ok: o.ok, text: o.message }); if (o.connector) onChanged(o.connector); setBusy(false); };
  const save = async () => { setBusy(true); setMsg(null); const typed = Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim())); done(await connectorSave(c.slug, typed)); setVals({}); };
  const test = async () => { setBusy(true); setMsg(null); done(await connectorTest(c.slug)); };
  const connect = async () => { const r = await connectorOauthUrl(c.slug); if ("url" in r) window.open(r.url, "_blank", "noopener"); else setMsg({ ok: false, text: r.error }); };
  const remove = async () => { setBusy(true); if (await connectorRemove(c.slug)) onChanged(null); else { setBusy(false); setMsg({ ok: false, text: "could not remove it" }); } };
  const typedAny = Object.values(vals).some((v) => v.trim());
  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel2, color: C.fg, fontFamily: mono, fontSize: 12.5, outline: "none" };
  // a secret is masked as text, not as a password field: the browser would offer to save it as a login
  const masked: React.CSSProperties = { WebkitTextSecurity: "disc" } as React.CSSProperties;
  const btn = (primary: boolean, off?: boolean): React.CSSProperties => ({ padding: "7px 14px", borderRadius: 6, border: `1px solid ${primary ? C.brand : C.border}`, background: primary ? C.brand : "transparent", color: primary ? "#fff" : C.fg, fontFamily: nav, fontSize: 12.5, cursor: off ? "default" : "pointer", opacity: off ? 0.5 : 1 });
  return (
    <div data-testid={`connector-detail-${c.slug}`} style={{ padding: "16px 20px 28px", maxWidth: 640, margin: "0 auto", fontFamily: nav, color: C.fg }}>
      <button data-testid="connector-back" onClick={onBack} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 12, padding: 0, marginBottom: 12 }}>← all connectors</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Logo c={c} size={44} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{c.title}</div>
          <div style={{ fontSize: 12, color: C.muted, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: dot(c), display: "inline-block" }} /><span data-testid="connector-status">{statusWord(c)}</span>
            <span>·</span><span>{c.kind === "mcp" ? "MCP server" : "HTTP API"}</span><span>·</span><span>{c.access}</span>
          </div>
        </div>
      </div>
      {c.summary && <p style={{ fontSize: 13.5, lineHeight: 1.5, color: C.dim, margin: "14px 0 0" }}>{c.summary}</p>}
      {c.access === "read-only" && <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0" }}>Read-only: agents can look things up through this connector, never change anything.</p>}
      {c.status === "error" && c.note && <p data-testid="connector-error" style={{ fontSize: 12.5, color: C.bad, margin: "10px 0 0" }}>{c.note}</p>}

      {oneClick && c.status !== "connected" && (
        <section style={{ marginTop: 20 }}>
          <p data-testid="connector-oneclick" style={{ fontSize: 13.5, lineHeight: 1.5, color: C.dim, margin: "0 0 12px" }}>Connect opens {c.title}'s own sign-in page in a new tab. You approve there and come straight back: nothing to copy or paste.</p>
          <button data-testid="connector-connect" onClick={() => void connect()} disabled={busy} style={{ ...btn(true, busy), padding: "10px 22px", fontSize: 13.5 }}>Connect {c.title}</button>
          {c.inputs.length > 0 && <div style={{ marginTop: 10 }}><button data-testid="connector-manual" onClick={() => setManual(true)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 12, padding: 0 }}>use my own sign-in client instead</button></div>}
        </section>
      )}
      {!oneClick && c.status !== "connected" && c.steps.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>How to connect</div>
          <ol data-testid="connector-steps" style={{ margin: 0, paddingLeft: 20, listStyle: "decimal", display: "grid", gap: 6, fontSize: 13.5, lineHeight: 1.5 }}>{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
      )}

      {!oneClick && c.auth === "oauth" && c.redirectUri && c.status !== "connected" && (
        <section style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>The service must allow this redirect address (a "Desktop app" or loopback client usually already does):</div>
          <code data-testid="connector-redirect" style={{ display: "block", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel2, color: C.dim, fontFamily: mono, fontSize: 11.5, overflowX: "auto", whiteSpace: "nowrap" }}>{c.redirectUri}</code>
        </section>
      )}

      {c.inputs.length > 0 && !(oneClick && c.status !== "connected") && (
        <section style={{ marginTop: 20, display: "grid", gap: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.muted }}>{c.status === "connected" ? "Saved" : "What to enter"}</div>
          {c.inputs.map((i) => (
            <label key={i.id} style={{ display: "grid", gap: 5 }}>
              <span style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 500 }}>{i.label}{i.optional ? " (optional)" : ""}</span>
                {i.filled && <span data-testid={`filled-${i.id}`} style={{ color: C.ok, fontSize: 11.5 }}>saved ✓</span>}
                {i.link && <a href={i.link} target="_blank" rel="noopener noreferrer" style={{ color: C.brand, fontSize: 11.5, textDecoration: "none" }}>where do I find this ↗</a>}
              </span>
              <input data-testid={`input-${i.id}`} data-secret={i.secret ? "true" : "false"} type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} value={vals[i.id] ?? ""} placeholder={i.filled ? "leave empty to keep the saved value" : ""}
                onChange={(e) => setVals((v) => ({ ...v, [i.id]: e.target.value }))} style={i.secret ? { ...field, ...masked } : field} />
              {i.help && <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>{i.help}</span>}
            </label>
          ))}
        </section>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 20 }}>
        {c.inputs.length > 0 && !(oneClick && c.status !== "connected") && <button data-testid="connector-save" onClick={() => void save()} disabled={busy || (!typedAny && c.missing.length > 0)} style={btn(c.auth !== "oauth", busy || (!typedAny && c.missing.length > 0))}>{c.auth === "oauth" ? "Save" : "Save and test"}</button>}
        {c.auth === "oauth" && !(oneClick && c.status !== "connected") && <button data-testid="connector-connect" onClick={() => void connect()} disabled={busy || c.missing.length > 0} style={btn(true, busy || c.missing.length > 0)}>{c.status === "connected" ? "Sign in again" : "Connect"}</button>}
        {(c.auth === "none" || c.status === "connected" || c.status === "error") && <button data-testid="connector-test" onClick={() => void test()} disabled={busy} style={btn(false, busy)}>Test again</button>}
        {busy && <span style={{ fontSize: 12, color: C.muted }}>working…</span>}
      </div>
      {msg && <p data-testid="connector-message" style={{ fontSize: 12.5, margin: "12px 0 0", color: msg.ok ? C.ok : C.bad }}>{msg.text}</p>}

      <section style={{ marginTop: 26, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>What agents may do</div>
        <div role="group" aria-label="what agents may do through this connector" style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
          {(["read-only", "read-write"] as const).map((a) => (
            <button key={a} data-testid={`access-${a}`} aria-pressed={c.access === a} disabled={busy || c.access === a} onClick={() => (a === "read-write" ? setAsk(true) : void setAccess(a))}
              style={{ padding: "6px 12px", border: "none", background: c.access === a ? C.hover : "transparent", color: c.access === a ? C.fg : C.muted, fontFamily: nav, fontSize: 12, cursor: c.access === a ? "default" : "pointer" }}>{a === "read-only" ? "Look only" : "Look and change"}</button>
          ))}
        </div>
        {ask && <p data-testid="access-confirm" style={{ fontSize: 12.5, margin: "10px 0 0", lineHeight: 1.5 }}>Agents will be able to create, change and delete things in {c.title} with your sign-in. Allow it? <button data-testid="access-yes" onClick={() => void setAccess("read-write")} style={{ background: "none", border: "none", color: C.bad, cursor: "pointer", fontFamily: nav, fontSize: 12.5 }}>allow</button> <button data-testid="access-no" onClick={() => setAsk(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 12.5 }}>keep it look only</button></p>}
      </section>

      <section style={{ marginTop: 26, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <button data-testid="connector-yaml-toggle" onClick={() => setYamlOpen((x) => !x)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 12, padding: 0 }}>{yamlOpen ? "▾" : "▸"} recipe (YAML)</button>
        {yamlOpen && <pre data-testid="connector-yaml" style={{ margin: "8px 0 0", padding: 10, borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel2, color: C.dim, fontFamily: mono, fontSize: 11.5, overflowX: "auto", whiteSpace: "pre-wrap" }}>{c.yaml}</pre>}
        <div style={{ marginTop: 14 }}>
          {!sure ? <button data-testid="connector-remove" onClick={() => setSure(true)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 12, padding: 0 }}>remove this connector</button>
            : <span style={{ fontSize: 12.5 }}>Remove {c.title} and delete its saved keys? <button data-testid="connector-remove-yes" onClick={() => void remove()} style={{ background: "none", border: "none", color: C.bad, cursor: "pointer", fontFamily: nav, fontSize: 12.5 }}>remove</button> <button onClick={() => setSure(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 12.5 }}>keep</button></span>}
        </div>
      </section>
    </div>
  );
}

export function ConnectorsPane({ every = 3000 }: { every?: number }) {
  const [list, setList] = React.useState<Connector[] | null>(null); const [open, setOpen] = React.useState<string | null>(() => takeOpenConnector());
  // an agent proposed a connector while this pane is open: show its connection screen
  React.useEffect(() => { const on = (e: Event) => { const slug = (e as CustomEvent).detail; if (typeof slug === "string") { takeOpenConnector(); setOpen(slug); void connectorsList().then((l) => l && setList(l)); } }; window.addEventListener(CONNECTOR_OPEN, on); return () => window.removeEventListener(CONNECTOR_OPEN, on); }, []);
  const load = React.useCallback(async () => { const l = await connectorsList(); if (l) setList(l); }, []);
  React.useEffect(() => { void load(); const t = setInterval(() => void load(), every); return () => clearInterval(t); }, [load, every]);
  const sel = list?.find((c) => c.slug === open) ?? null;
  const changed = (n: Connector | null) => { if (!n) { setOpen(null); void load(); return; } setList((l) => (l ?? []).map((c) => (c.slug === n.slug ? n : c))); };
  if (sel) return <div style={{ height: "100%", overflowY: "auto" }}><Detail key={sel.slug} c={sel} onBack={() => setOpen(null)} onChanged={changed} /></div>;
  return (
    <div data-testid="connectors-pane" style={{ height: "100%", overflowY: "auto", padding: "16px 20px", fontFamily: nav, color: C.fg }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Connectors</span>
        <span style={{ fontSize: 12, color: C.muted }}>{list === null ? "looking…" : list.length === 1 ? "1 connector" : `${list.length} connectors`}</span>
        <span style={{ flex: 1 }} />
        <button data-testid="connector-new" aria-label="create a connector" title="Create a connector: a new agent asks you which service" onClick={() => window.dispatchEvent(new CustomEvent(NEW_CONNECTOR))} style={{ alignSelf: "center", width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.fg, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
      {list !== null && list.length === 0 && (
        <div data-testid="connectors-empty" style={{ maxWidth: 440, margin: "56px auto 0", textAlign: "center", color: C.dim, fontSize: 13.5, lineHeight: 1.6 }}>
          <div style={{ fontSize: 15, color: C.fg, marginBottom: 6 }}>No connectors yet</div>
          Ask any agent to connect a service, for example <em>"connect my Google Drive"</em> or <em>"connect the Stripe API"</em>. It writes the recipe; the connection screen appears here with the steps and the fields for the keys.
        </div>
      )}
      <div data-testid="connector-grid" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {(list ?? []).map((c) => (
          <button key={c.slug} data-testid={`connector-card-${c.slug}`} onClick={() => setOpen(c.slug)} title={`${c.title} · ${statusWord(c)}`} aria-label={`${c.title}, ${statusWord(c)}`}
            style={{ position: "relative", width: 68, height: 68, padding: 0, borderRadius: 14, border: `1px solid ${C.border}`, background: C.panel, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Logo c={c} size={44} />
            <span aria-hidden style={{ position: "absolute", right: 6, top: 6, width: 8, height: 8, borderRadius: 4, background: dot(c), border: `1px solid ${C.panel}` }} />
          </button>
        ))}
      </div>
    </div>
  );
}
