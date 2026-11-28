// A FREE PANE (RFC 0016): a page of the project's own folder, in a sandbox, behind a bridge: reads (M1), writes behind the host's own confirmation card (M2), the pane's memory, pictures, links and notices (M3), and what it shows by meaning for an agent (M5).
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { BE_URL } from "@/loki/api/client";
import { panesOp } from "./api";
import { asBridge, buildSrcDoc, noticeOk, openable, themeTokens, writeWords, BRIDGE_TYPES, type PaneFolder } from "./free-pane-kit";
import { cleanDescription, registerFreePane, type PaneDescription } from "./freepaneview";

const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12.5, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 12px", cursor: "pointer" };

/** The card a draft pane shows: who made it, what for, which apps and which tools it may read and write, the fingerprint: in words, so the person approves what is really there. */
function DraftCard({ f, busy, err, onApprove }: { f: PaneFolder; busy: boolean; err: string; onApprove: () => void }) {
  const m = f.manifest ?? {}; const apps: any[] = Array.isArray(m.apps) ? m.apps : [];
  return (
    <div data-testid="pane-draft" role="group" aria-label="This pane is a draft" style={{ margin: 10, border: `1px solid color-mix(in srgb, #f5a524 45%, ${C.border})`, borderRadius: 14, padding: "12px 14px", display: "grid", gap: 8, fontFamily: nav, fontSize: 13, color: C.fg, background: "color-mix(in srgb, #f5a524 7%, transparent)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><b style={{ fontWeight: 600 }}>Draft: {m.title ?? f.id}</b><span style={{ color: C.muted, fontSize: 12 }}>made by {m.made_by || "someone"} · v{m.version ?? "?"}</span></div>
      {m.notes && <div data-testid="pane-notes" style={{ lineHeight: 1.5 }}>{m.notes}</div>}
      <div style={{ display: "grid", gap: 4 }}>
        {apps.length === 0 && <span style={{ color: C.muted }}>It talks to no app.</span>}
        {apps.map((a) => <div key={a.app} data-testid={`pane-app-${a.app}`} style={{ lineHeight: 1.5 }}><b style={{ fontWeight: 600 }}>{a.app}</b>: may <span style={{ color: "var(--c-ok)" }}>read</span> {(a.read ?? []).join(", ") || "nothing"}{(a.write ?? []).length ? <> · may <span style={{ color: "#f5a524" }}>write</span> {(a.write ?? []).join(", ")} <span style={{ color: C.muted }}>(each write asks you first)</span></> : null}</div>)}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button data-testid="pane-approve" disabled={busy} onClick={onApprove} style={btn}>{busy ? "Approving…" : "Approve this pane"}</button>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }} title={f.hash}>{f.hash.slice(0, 19)}…</span>
        <span style={{ color: C.muted, fontSize: 12 }}>Until you approve it, the page below cannot reach any app.</span>
      </div>
      {err && <div data-testid="pane-approve-error" style={{ color: C.bad }}>{err}</div>}
    </div>
  );
}


type Ask = { kind: "write"; app: string; tool: string; args: Record<string, unknown>; label: string; risk: string; done: (yes: boolean, second: boolean) => void } | { kind: "open"; host: string; url: string; done: (yes: boolean, second: boolean) => void };

/** THE HOST'S OWN CARD (RFC 0016 §4.3): drawn outside the frame, over the pane, so the page can neither draw over it nor click it. A write says what will change in words and shows every argument; a destructive one needs a second, explicit tick. */
function ConfirmCard({ a, appName, onAnswer }: { a: Ask; appName: string; onAnswer: (yes: boolean, second: boolean) => void }) {
  const [tick, setTick] = React.useState(false); const destructive = a.kind === "write" && a.risk === "destructive";
  return (
    <div data-testid="pane-confirm" role="alertdialog" aria-label="Confirm" style={{ position: "absolute", inset: 0, zIndex: 5, background: "color-mix(in srgb, var(--c-bg, #131316) 78%, transparent)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 12, overflowY: "auto" }}>
      <div style={{ width: "min(100%, 520px)", border: `1px solid ${destructive ? C.bad : C.border}`, borderRadius: 14, background: C.panel, padding: "14px 16px", display: "grid", gap: 10, fontFamily: nav, fontSize: 13, color: C.fg }}>
        {a.kind === "write" ? <>
          <b style={{ fontWeight: 600 }}>{destructive ? "This pane wants to DELETE something in" : "This pane wants to change something in"} {appName}</b>
          <div data-testid="pane-confirm-tool" style={{ color: C.muted }}>It will run <span style={{ fontFamily: mono }}>{a.tool}</span>{a.label ? <> — the page calls it “<span data-testid="pane-confirm-label">{a.label}</span>”</> : null}. The page's own words are only its claim; these are the arguments:</div>
          <div style={{ display: "grid", gap: 3, maxHeight: 240, overflowY: "auto", fontFamily: mono, fontSize: 12 }}>{writeWords(a.args).map((w) => <div key={w.name} data-testid="pane-confirm-arg"><span style={{ color: C.dim }}>{w.name}:</span> {w.value}</div>)}{writeWords(a.args).length === 0 && <span style={{ color: C.muted }}>(no arguments)</span>}</div>
          {destructive && <label style={{ display: "flex", gap: 8, alignItems: "center", color: C.bad }}><input data-testid="pane-confirm-tick" type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} /> I understand this destroys data in {appName} and cannot be undone here.</label>}
        </> : <>
          <b style={{ fontWeight: 600 }}>This pane wants to open {a.host} in your browser</b>
          <div style={{ color: C.muted, wordBreak: "break-all", fontFamily: mono, fontSize: 12 }}>{a.url}</div>
        </>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button data-testid="pane-confirm-yes" disabled={destructive && !tick} title={destructive && !tick ? "Tick the box first: this deletes data" : ""} onClick={() => onAnswer(true, tick)} style={{ ...btn, opacity: destructive && !tick ? 0.5 : 1 }}>{a.kind === "write" ? "Do it" : "Open it"}</button>
          <button data-testid="pane-confirm-no" onClick={() => onAnswer(false, false)} style={btn}>Decline</button>
          {destructive && !tick && <span style={{ color: C.muted, fontSize: 12 }}>Tick the box to enable “Do it”.</span>}
        </div>
      </div>
    </div>
  );
}

export function FreePane({ id, paneKey, pollMs = 2500 }: { id: string; paneKey?: string; /** how often the pane's folder is looked at for a rewrite by an agent */ pollMs?: number }) {
  const [f, setF] = React.useState<PaneFolder | null | undefined>(undefined); const [err, setErr] = React.useState(""); const [busy, setBusy] = React.useState(false);
  const [details, setDetails] = React.useState(false);
  const [ask, setAsk] = React.useState<Ask | null>(null); const [notice, setNotice] = React.useState(""); const [calls, setCalls] = React.useState({ n: 0, lastWrite: "" });
  const frame = React.useRef<HTMLIFrameElement>(null); const desc = React.useRef<PaneDescription | null>(null); const lastNotice = React.useRef(0); const askOpen = React.useRef(false);
  const actWait = React.useRef(new Map<number, (r: { ok: boolean; detail: string }) => void>()); const actSeq = React.useRef(0); const domains = React.useRef(new Set<string>());
  const load = React.useCallback(async () => { const r = await panesOp({ op: "read", id }); if (r?.ok === true) { setF({ id, manifest: r.manifest, files: r.files ?? {}, assets: r.assets ?? {}, hash: String(r.hash ?? ""), approved: r.approved === true, problems: Array.isArray(r.problems) ? r.problems : [] }); setErr(""); } else { setF(null); setErr(String(r?.error ?? "the pane could not be read")); } }, [id]);
  React.useEffect(() => { void load(); }, [load]);
  // AN AGENT REWROTE THE PANE WHILE IT WAS OPEN (operator 2026-11-25: "it doesn't refresh"): the folder's stamp (file count, newest change, size: no reading) is looked at every few seconds, and the pane is read again when it changed.
  // A rewrite makes the pane a draft again (the person approved the old hash), so the card to approve it shows, and the page below it is the new one.
  React.useEffect(() => {
    let stop = false; let t: ReturnType<typeof setTimeout>; let last: string | null = null;
    const tick = async () => {
      if (!document.hidden) { const r = await panesOp({ op: "stamp", id }); if (stop) return; if (r?.ok === true) { const st = String(r.stamp); if (last !== null && st !== last) await load(); last = st; } }
      if (!stop) t = setTimeout(() => void tick(), pollMs);
    };
    void tick(); return () => { stop = true; clearTimeout(t); };
  }, [id, load, pollMs]);
  const approve = async () => { if (!f) return; setBusy(true); const r = await panesOp({ op: "approve", id, hash: f.hash }); setBusy(false); if (r?.ok === true) await load(); else setErr(String(r?.error ?? "not approved")); };
  // AN AGENT'S HANDS (M5): the page said what it shows and which controls it takes; an agent's act goes to the page's own handler, which uses the same bridge as a click, so a write still asks the person
  React.useEffect(() => {
    if (!paneKey) return;
    return registerFreePane(paneKey, {
      description: () => desc.current,
      act: (ref, value, action) => new Promise((resolve) => {
        const w = frame.current?.contentWindow; if (!w) { resolve({ ok: false, detail: "the pane is not showing" }); return; }
        const aid = ++actSeq.current; const timer = setTimeout(() => { actWait.current.delete(aid); resolve({ ok: false, detail: "no answer from the page yet: if a change is waiting for the person's click, ask them" }); }, 120000);
        actWait.current.set(aid, (r) => { clearTimeout(timer); resolve(r); }); w.postMessage({ __antiloki: 1, id: aid, type: "act", ref, value, action }, "*");
      }),
    });
  }, [paneKey]);
  // THE BRIDGE, HOST SIDE: only the pane's own frame is listened to; only a message of the right shape; only a type it knows. A pane that has not been approved gets `hello`, `notice` and `describe` and nothing else (no app, no memory, no link).
  React.useEffect(() => {
    if (!f) return;
    const on = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return; const m = asBridge(e.data); if (!m) return;
      const reply = (ok: boolean, body: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ __antiloki: 1, id: m.id, ok, ...body }, "*");   // answered through the pane's own frame, the one it was checked against
      const draft = "this pane is a draft: the person has not approved it, so it cannot do that";
      const p = m.payload as Record<string, unknown>;
      if (!(BRIDGE_TYPES as readonly string[]).includes(m.type)) { reply(false, { error: `\`${m.type}\` is not a message of the bridge` }); return; }
      if (m.type === "hello") { reply(true, { result: { theme: themeTokens((n) => getComputedStyle(document.documentElement).getPropertyValue(n)), manifest: f.manifest, approved: f.approved, kit: 2 } }); return; }
      if (m.type === "act_result") { const w = actWait.current.get(m.id); if (w) { actWait.current.delete(m.id); w({ ok: p.ok === true, detail: typeof p.detail === "string" ? p.detail.slice(0, 600) : "" }); } return; }
      if (m.type === "notice") { const t = noticeOk(p.text, lastNotice.current, Date.now()); if (t == null) { reply(false, { error: "a notice is text, at most 200 characters, one every 3 seconds" }); return; } lastNotice.current = Date.now(); setNotice(t); reply(true, { result: true }); return; }
      if (m.type === "describe") { const d = cleanDescription(p.tree); if (typeof d === "string") { reply(false, { error: d }); return; } desc.current = d; reply(true, { result: true }); return; }
      if (!f.approved) { reply(false, { error: draft }); return; }
      if (m.type === "read") {
        // THE READ (M1): the serve checks the manifest and the approved hash again from the disk and calls only a read tool. What comes back is the app's own JSON.
        const { app, tool, args } = p as { app?: unknown; tool?: unknown; args?: unknown }; if (typeof app !== "string" || typeof tool !== "string") { reply(false, { error: "read needs an app and a tool (names)" }); return; }
        setCalls((c) => ({ ...c, n: c.n + 1 }));
        void panesOp({ op: "call", id, app, tool, args: args && typeof args === "object" && !Array.isArray(args) ? args : {} }).then((r) => {
          if (r?.ok !== true) { reply(false, { error: String(r?.error ?? "the read did not work") }); return; }
          const res = r.result ?? {}; if (res.is_error) { reply(false, { error: String(res.text ?? "the app said error").slice(0, 300) }); return; }
          let data = res.structured ?? null; if (data == null && typeof res.text === "string") { try { data = JSON.parse(res.text); } catch { data = res.text; } } reply(true, { result: data });
        });
        return;
      }
      if (m.type === "write") {
        // THE WRITE (M2): never without the person's click, on a card the host draws; a destructive tool needs a second tick; declining tells the page "declined"
        const { app, tool, args, label } = p as { app?: unknown; tool?: unknown; args?: unknown; label?: unknown }; if (typeof app !== "string" || typeof tool !== "string") { reply(false, { error: "write needs an app and a tool (names)" }); return; }
        if (askOpen.current) { reply(false, { error: "another change is waiting for the person's answer" }); return; }
        const a2 = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {}; askOpen.current = true;
        void panesOp({ op: "risk", id, app, tool }).then((rk) => {
          if (rk?.ok !== true) { askOpen.current = false; reply(false, { error: String(rk?.error ?? "this write is not allowed") }); return; }
          setAsk({ kind: "write", app, tool, args: a2, label: typeof label === "string" ? label.slice(0, 200) : "", risk: String(rk.risk ?? "write"), done: (yes, second) => {
            setAsk(null);
            if (!yes) { askOpen.current = false; reply(false, { error: "declined" }); return; }
            void panesOp({ op: "write", id, app, tool, args: a2, confirm: true, confirm2: second }).then((r) => {
              askOpen.current = false; setCalls((c) => ({ n: c.n + 1, lastWrite: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }));
              if (r?.ok !== true) { reply(false, { error: String(r?.error ?? "the write did not work") }); return; }
              const res = r.result ?? {}; if (res.is_error) { reply(false, { error: String(res.text ?? "the app said error").slice(0, 300) }); return; }
              let data = res.structured ?? null; if (data == null && typeof res.text === "string") { try { data = JSON.parse(res.text); } catch { data = res.text; } } reply(true, { result: data });
            });
          } });
        });
        return;
      }
      if (m.type === "state.get") { void panesOp({ op: "state_get", id }).then((r) => (r?.ok === true ? reply(true, { result: r.state ?? null }) : reply(false, { error: String(r?.error ?? "no memory") }))); return; }
      if (m.type === "state.set") { void panesOp({ op: "state_set", id, state: p.state ?? null }).then((r) => (r?.ok === true ? reply(true, { result: true }) : reply(false, { error: String(r?.error ?? "not saved") }))); return; }
      if (m.type === "open") {
        const u = openable(p.url); if (!u) { reply(false, { error: "open takes an http or https address" }); return; }
        const go = () => { window.open(u.toString(), "_blank", "noopener,noreferrer"); reply(true, { result: true }); };
        if (domains.current.has(u.host)) { go(); return; }
        if (askOpen.current) { reply(false, { error: "another question is waiting for the person's answer" }); return; } askOpen.current = true;
        setAsk({ kind: "open", host: u.host, url: u.toString(), done: (yes) => { askOpen.current = false; setAsk(null); if (!yes) { reply(false, { error: "declined" }); return; } domains.current.add(u.host); go(); } }); return;
      }
      if (m.type === "asset") {
        // A PICTURE OF AN APP (M3): only an app the manifest names, only that app's own upload host (the serve checks it), handed back as data (the page's policy allows data:), at most 1.5 MB
        const { app, url } = p as { app?: unknown; url?: unknown }; const named = (f.manifest?.apps ?? []).some((a: any) => a.app === app); if (typeof app !== "string" || typeof url !== "string" || !named) { reply(false, { error: "asset needs an app of this pane's manifest and an address" }); return; }
        void fetch(`${BE_URL}/api/v1/webapps/asset?app=${encodeURIComponent(app)}&url=${encodeURIComponent(url)}`).then(async (r) => { if (!r.ok) { reply(false, { error: `the app's upload host answered ${r.status}` }); return; } const b = await r.blob(); if (b.size > 1.5 * 1024 * 1024) { reply(false, { error: "the picture is over 1.5 MB" }); return; } const rd = new FileReader(); rd.onload = () => reply(true, { result: String(rd.result) }); rd.onerror = () => reply(false, { error: "the picture could not be read" }); rd.readAsDataURL(b); }).catch(() => reply(false, { error: "the picture could not be fetched" }));
        return;
      }
    };
    window.addEventListener("message", on); return () => window.removeEventListener("message", on);
  }, [f, id]);
  const doc = React.useMemo(() => (f && f.problems.length === 0 ? buildSrcDoc(f, BE_URL, themeTokens((n) => (typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(n) : ""))) : ""), [f]);
  const wrap: React.CSSProperties = { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", fontFamily: nav, color: C.fg, fontSize: 13, overflow: "hidden", position: "relative" };
  if (f === undefined) return <div data-testid="free-pane" style={{ ...wrap, padding: 14, color: C.muted }}>opening the pane…</div>;
  if (f === null) return <div data-testid="free-pane" style={{ ...wrap, padding: 14 }}><div data-testid="pane-error" style={{ color: C.bad }}>{err}</div><div><button style={{ ...btn, marginTop: 8 }} onClick={() => void load()}>Try again</button></div></div>;
  if (f.problems.length) return <div data-testid="free-pane" style={{ ...wrap, padding: 14, gap: 8, overflowY: "auto" }}><b style={{ fontWeight: 600 }}>This pane cannot open</b>{f.problems.map((p, i) => <div key={i} data-testid="pane-problem" style={{ color: C.bad, lineHeight: 1.5 }}>{p}</div>)}<div><button style={btn} onClick={() => void load()}>Check again</button></div></div>;
  const appName = ask && ask.kind === "write" ? ask.app : "";
  return (
    <div data-testid="free-pane" data-approved={f.approved ? "1" : "0"} style={wrap}>
      {/* A DRAFT IS DISCREET (operator 2026-11-25): the approval is the floating card at the bottom right; here only a thin line, and the full card (what it may reach, the fingerprint) when asked for or when the pane has problems */}
      {!f.approved && f.problems.length === 0 && (
        <div data-testid="pane-draft-line" style={{ display: "flex", gap: 10, alignItems: "center", padding: "2px 12px", fontSize: 11, color: C.muted, borderBottom: `1px solid ${C.border}` }}>
          <span>Draft: not approved yet. Approve it in the notification at the bottom right, or here.</span><span style={{ flex: 1 }} />
          <button data-testid="pane-approve-quick" disabled={busy} onClick={() => void approve()} style={{ background: "none", border: "none", color: C.brand, cursor: "pointer", fontFamily: nav, fontSize: 11, padding: 0 }}>approve</button>
          <button data-testid="pane-details" onClick={() => setDetails((x) => !x)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 11, padding: 0 }}>{details ? "hide" : "what it can do"}</button>
        </div>
      )}
      {!f.approved && (f.problems.length > 0 || details) && <DraftCard f={f} busy={busy} err={err} onApprove={() => void approve()} />}
      {((notice && f.approved) || calls.n > 0) && <div data-testid="pane-header" style={{ display: "flex", gap: 10, padding: "3px 12px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap", alignItems: "center" }}>
        {notice && f.approved && <span data-testid="pane-notice" style={{ color: C.fg }}>{notice}</span>}{calls.n > 0 && <span data-testid="pane-calls">{calls.n} call{calls.n === 1 ? "" : "s"}{calls.lastWrite ? ` · last write ${calls.lastWrite}` : ""}</span>}
      </div>}
      <iframe key={f.approved ? "approved" : "draft"} ref={frame} data-testid="free-pane-frame" title={f.manifest?.title ?? id} sandbox="allow-scripts" srcDoc={doc} style={{ flex: 1, minHeight: 0, width: "100%", border: 0, background: "var(--c-bg, #131316)" }} />
      {ask && <ConfirmCard a={ask} appName={appName} onAnswer={(yes, second) => ask.done(yes, second)} />}
    </div>
  );
}
