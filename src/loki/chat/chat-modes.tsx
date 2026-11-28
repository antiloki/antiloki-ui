// Redesign 2026-06-21: the chat MODES are DISTINCT screens with their own data — NOT the chat
// thread's turns (operator). The mode switch flips the whole surface:
//   · Agent     — the normal chat thread (chat-thread).
//   · Terminal  — the AI's real terminal: a raw REPL with its OWN transcript; talks directly to
//                 the AI, shows raw I/O. (The direct-AI backend is cockpit Wave 4 — not wired;
//                 the shell keeps its own transcript + says so.)
//   · DeepSearch— a research console: pick the sources (DBs · graph RAG · codebase · internet),
//                 generate a document, and EXPORT it as md / html / pdf. (The federated research +
//                 synthesis backend is cockpit Wave 6 — not wired; generation is a templated
//                 placeholder for now, but the scopes + the export pipeline are real.)
import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useRouter, Link } from "@tanstack/react-router";
import { C, nav, mono } from "@/loki/theme";
import { Markdown } from "@/loki/components/Markdown";
import { sendTerminalCommand, sendTerminalSandbox, sendDeepSearch, fetchByokStatus } from "@/loki/api/dispatch";
import { GlassBar, DockGrip } from "@/loki/shell/dock";
import { useSeats, offered } from "@/loki/api/seats";

// THE PRODUCT TABS (operator 2026-07-20: "sell tabs" — the whole app looks like a
// simple chat; the text field's tabs ARE the products). Trimmed 2026-09-17 (operator: "take out
// antiVibe, antiFlow, antiDocs and the threads button"): antiDesk is the one chat surface — its
// two views (Blocks · Threads) switch from the floating pill top-center — and antiIDE is the one
// screen tab. The terminal/search mode keys stay wired underneath (dispatch/skills) — no tab shows them.
const MODES = [
  { key: "agent", label: "antiDesk", icon: "✦" },
];
const NAV_TABS = [
  // /operations/atlas IS the Code & Design screen (nav simplification 2026-07-05) — never /code (the bare file explorer).
  // match mirrors the old rail's highlight rules so the tab reads SELECTED on its own screen.
  { key: "code", label: "antiIDE", icon: "⟨⟩", to: "/operations/atlas", hint: "antiIDE — the code explorer & review", match: (p: string) => p.startsWith("/operations/atlas") || p.startsWith("/operations/design") },
];

// THE TAB STORE (＋): today a quiet map of what each tab is — every tab is
// unlocked in this build; plans/promotions arrive with the control plane.
const STORE_ROWS = [
  { icon: "✦", label: "antiDesk", blurb: "the desk — Blocks view (every instrument on one stage) or Threads view (a list, one fills the right)" },
  { icon: "⟨⟩", label: "antiIDE", blurb: "finally see the code, read-only" },
];

// Shared product-tab switch (composer + shells + the Dock). Discrete: ICONS only —
// the selected tab wears its name; a hovered tab reveals its name (operator
// 2026-07-20); nav tabs leave the chat; ＋ opens the tab store.
export function ModeSwitch({ mode, setMode }: any) {
  const router = useRouter();
  const { pathname } = useLocation();
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeUp, setStoreUp] = useState(true); // popover opens away from the nearest screen edge
  const [hovered, setHovered] = useState<string | null>(null);
  const btn = (on: boolean): React.CSSProperties => ({ border: "none", borderRadius: 7, padding: "3px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", background: on ? C.panel2 : "transparent", color: on ? C.brand : C.muted, fontFamily: nav, fontSize: 11, fontWeight: on ? 500 : 400, whiteSpace: "nowrap" });
  // the name slides out only when the tab is selected or hovered — icons stay the resting state
  const name = (show: boolean, label: string) => (
    <span style={{ display: "inline-block", overflow: "hidden", maxWidth: show ? 76 : 0, opacity: show ? 1 : 0, paddingLeft: show ? 5 : 0, transition: "max-width .18s ease, opacity .16s ease, padding-left .18s ease" }}>{label}</span>
  );
  const tabBtn = (key: string, icon: string, label: string, on: boolean, title: string, onClick: () => void) => (
    <button key={key} onClick={onClick} title={title} style={btn(on)}
      onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered((h) => (h === key ? null : h))}>
      <span style={{ fontSize: 10, opacity: 0.9 }}>{icon}</span>{name(on || hovered === key, label)}
    </button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", background: C.bg, borderRadius: 9, padding: 2, gap: 2, position: "relative" }}>
      {MODES.map((m) => tabBtn(m.key, m.icon, m.label, (mode ?? "agent") === m.key, `${m.label} tab`, () => setMode(m.key)))}
      {NAV_TABS.map((t) => tabBtn(t.key, t.icon, t.label, t.match(pathname), `${t.label} tab — ${t.hint}`, () => router.navigate({ to: t.to as any })))}
      <button onClick={(e) => { setStoreUp(e.clientY > window.innerHeight / 2); setStoreOpen((o) => !o); }} title="tabs — what each one is, and your plan"
        style={{ ...btn(storeOpen), padding: "3px 7px", color: storeOpen ? C.brand : C.dim, fontSize: 12, lineHeight: 1 }}>＋</button>
      {storeOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 160 }} onClick={() => setStoreOpen(false)} />
          <div style={{ position: "absolute", ...(storeUp ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }), right: 0, zIndex: 170, width: 264, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 11, padding: 6, boxShadow: "0 12px 34px rgba(0,0,0,.5)" }}>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1.2, padding: "3px 8px 5px" }}>your tabs</div>
            {STORE_ROWS.map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 8px", borderRadius: 7 }}>
                <span style={{ fontFamily: mono, fontSize: 10, color: C.brand, width: 16, textAlign: "center", flexShrink: 0 }}>{r.icon}</span>
                <span style={{ fontFamily: nav, fontSize: 11.5, color: C.fg, fontWeight: 600, flexShrink: 0 }}>{r.label}</span>
                <span style={{ fontFamily: nav, fontSize: 10.5, color: C.muted, minWidth: 0 }}>{r.blurb}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.ok, flexShrink: 0 }}>✓</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 2px 0", padding: "6px 8px", fontFamily: mono, fontSize: 9, color: C.dim }}>all tabs unlocked in this build · plans & promotions coming</div>
          </div>
        </>
      )}
    </div>
  );
}

// Fallback shortlist, used only when the BYOK status is unavailable (BE not restarted / no key set).
// THE CHAT ENGINE (operator 2026-09-16: "the antichat should use claude, opencode or codex
// underneath, and we should be able to choose"): a `cli:` pin sends every turn's AI call to the
// BE's CLI-backed completions route — the named coding CLI answers headless, in the workspace root.
export const CLI_ENGINE_MODELS = [
  { id: "cli:claude-code", label: "Claude Code", glyph: "✦", note: "subscription · claude -p" },
  { id: "cli:codex", label: "Codex", glyph: "◇", note: "subscription · codex exec" },
  { id: "cli:gemini", label: "Antigravity", glyph: "✧", note: "subscription · your Google AI plan" },
  { id: "cli:grok", label: "Grok", glyph: "✕", note: "subscription · grok" },
  { id: "cli:cursor", label: "Cursor", glyph: "▣", note: "subscription · cursor-agent" },
  { id: "cli:opencode", label: "OpenCode", glyph: "○", note: "your OpenCode login · opencode run" },
];
export const CHAT_MODELS = [
  { id: "deepseek/deepseek-r1", label: "deepseek-r1" },
  { id: "anthropic/claude-sonnet-4.6", label: "claude-sonnet-4.6" },
  { id: "openai/gpt-5", label: "gpt-5" },
];

// One shared fetch of the cost-screen config across every picker instance (the status read syncs the
// live OpenRouter catalog server-side, so it isn't free). Cache resets on null so a later open retries;
// a page reload always re-reads, so cost-screen edits show up.
let _byokOnce: Promise<any> | null = null;
const loadByok = () => (_byokOnce ??= fetchByokStatus().then((s) => { if (s == null) _byokOnce = null; return s; }));

// tier = the COMPLEXITY dial: low = simple/cheap, mid = balanced, high = deep reasoning.
const TIER_HINT: Record<string, { word: string; dot: string }> = {
  low: { word: "simple", dot: C.ok },
  mid: { word: "balanced", dot: C.warn },
  high: { word: "complex", dot: C.bad },
};
const shortModel = (id: string) => String(id).split("/").pop() || id;

// The composer/terminal/deepsearch model picker. Heimdall (model=null) is the per-turn router — it casts
// the model for the turn AND learns from your tags (the router training loop); the rest are the models
// you set per tier in the Cost screen — pick one to choose the COMPLEXITY (tier) for this turn.
export function ModelPicker({ model, setModel, up }: any) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<any>(null);
  // only the seats that are on and usable (review 2026-10-01: Claude Code was offered unconditionally); the one pinned stays so the picker can show it
  const seats = useSeats();
  const seatsOn = offered(seats, String(model ?? "").replace(/^cli:/, ""));
  useEffect(() => { let alive = true; loadByok().then((s) => { if (alive) setStatus(s); }); return () => { alive = false; }; }, []);

  // Per-tier groups of the CONFIGURED models (primary + fallbacks, by failover_rank), so you can switch
  // between any AI inside a tier. Falls back to the curated flat list only if the catalog can't be read.
  const groups = useMemo(() => {
    const models = status?.models;
    if (!models) return null;
    const out: { tier: "low" | "mid" | "high"; list: any[] }[] = [];
    (["low", "mid", "high"] as const).forEach((tier) => {
      const list = (models[tier] || [])
        .filter((m: any) => m.active)
        .sort((a: any, b: any) => (a.failover_rank ?? 0) - (b.failover_rank ?? 0));
      if (list.length) out.push({ tier, list });
    });
    return out.length ? out : null;
  }, [status]);

  const flat = useMemo(() => (groups ? groups.flatMap((g) => g.list.map((m) => ({ ...m, tier: g.tier }))) : []), [groups]);
  const cur = flat.find((m) => m.model_id === model);
  const cli = CLI_ENGINE_MODELS.find((m) => m.id === model);
  const curLabel = cli ? `${cli.glyph} ${cli.label}` : cur ? `${cur.tier} · ${shortModel(cur.model_id)}` : "⚡ Heimdall";

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="model — ⚡ Heimdall routes the model per turn and learns from your tags; or pin any AI in a tier (primary or a fallback) to set the complexity for this turn"
        style={{ background: "transparent", border: "none", color: model ? C.brand : C.muted, cursor: "pointer", fontFamily: nav, fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4 }}
      >{curLabel} <span style={{ fontSize: 9 }}>▾</span></button>
      <Link to="/" title="⇄ Tagging — rate answers to teach Heimdall (the router training loop)" onClick={(e) => e.stopPropagation()}
        style={{ color: C.muted, fontSize: 12.5, lineHeight: 1, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>⇄</Link>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", [up ? "bottom" : "top"]: "calc(100% + 6px)", right: 0, zIndex: 70, minWidth: 280, maxHeight: 360, overflowY: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px -8px rgba(0,0,0,.45)", padding: 4 }}>
            <PickerRow on={(model ?? "") === ""} onClick={() => { setModel(null); setOpen(false); }}>
              <span style={{ color: C.brand }}>⚡ Heimdall</span>
              <span style={{ color: C.muted, fontSize: 10 }}>routes this turn · your tags train it</span>
            </PickerRow>
            {/* ENGINES — the coding CLIs as the chat's brain */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 3px", fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 7, background: C.brand }} />engine · the chat runs on a coding CLI
            </div>
            {CLI_ENGINE_MODELS.filter((m) => (seatsOn as readonly string[]).includes(m.id.replace(/^cli:/, ""))).map((m) => {
              const on = (model ?? "") === m.id;
              return (
                <PickerRow key={m.id} on={on} onClick={() => { setModel(m.id); setOpen(false); }}>
                  <span style={{ color: on ? C.brand : C.fg }}>{m.glyph} {m.label}</span>
                  <span style={{ color: C.muted, fontSize: 9.5, fontFamily: mono }}>{m.note}</span>
                </PickerRow>
              );
            })}
            {!status && <div style={{ padding: "6px 10px", color: C.muted, fontSize: 10.5, fontFamily: nav }}>loading models…</div>}
            {groups ? groups.map((g) => {
              const hint = TIER_HINT[g.tier];
              return (
                <React.Fragment key={g.tier}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 3px", fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 7, background: hint.dot }} />{g.tier} · {hint.word}
                  </div>
                  {g.list.map((m: any) => {
                    const on = (model ?? "") === m.model_id;
                    const isPrimary = (m.failover_rank ?? 0) === 0;
                    return (
                      <PickerRow key={`${m.provider}:${m.model_id}`} on={on} onClick={() => { setModel(m.model_id); setOpen(false); }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: on ? C.brand : C.fg, overflow: "hidden", minWidth: 0 }}>
                          {m.is_local && <span title="local model">🖥</span>}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.model_id}</span>
                        </span>
                        <span style={{ color: isPrimary ? C.dim : C.muted, fontSize: 9.5, fontFamily: mono, flexShrink: 0 }}>{isPrimary ? "primary" : "fallback"}</span>
                      </PickerRow>
                    );
                  })}
                </React.Fragment>
              );
            }) : (
              CHAT_MODELS.map((m) => {
                const on = (model ?? "") === m.id;
                return (
                  <PickerRow key={m.id} on={on} onClick={() => { setModel(m.id); setOpen(false); }}>
                    <span style={{ color: on ? C.brand : C.fg }}>{m.id}</span>
                  </PickerRow>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PickerRow({ on, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", background: on ? C.panel2 : "transparent", fontFamily: nav, fontSize: 12, whiteSpace: "nowrap" }}
      onMouseEnter={(e) => { if (!on) (e.currentTarget as HTMLElement).style.background = C.hover; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = on ? C.panel2 : "transparent"; }}
    >{children}</button>
  );
}

function downloadBlob(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tiny markdown → HTML for export (headings, bold, hr, lists, paragraphs). Good enough for the
// generated research docs; the real renderer in-app is the <Markdown> component.
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (!l.trim()) { out.push(""); continue; }
    if (l.startsWith("### ")) { out.push(`<h3>${esc(l.slice(4))}</h3>`); continue; }
    if (l.startsWith("## ")) { out.push(`<h2>${esc(l.slice(3))}</h2>`); continue; }
    if (l.startsWith("# ")) { out.push(`<h1>${esc(l.slice(2))}</h1>`); continue; }
    if (l.startsWith("> ")) { out.push(`<blockquote>${esc(l.slice(2))}</blockquote>`); continue; }
    if (/^[-*] /.test(l)) { out.push(`<li>${esc(l.slice(2))}</li>`); continue; }
    out.push(`<p>${esc(l)}</p>`);
  }
  const body = out.join("\n").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return body;
}
function docHtml(title: string, md: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title || "DeepSearch"}</title>` +
    `<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1a1a1a}` +
    `h1,h2,h3{line-height:1.25}blockquote{border-left:3px solid #ccc;margin:0;padding:4px 14px;color:#555}code{font-family:ui-monospace,monospace}</style>` +
    `</head><body>${mdToHtml(md)}</body></html>`;
}

// ── Terminal mode — the AI's raw REPL (own transcript) ───────────────────────
export function TerminalView({ mode, setMode }: any) {
  const [lines, setLines] = useState<{ cmd: string; out: string }[]>([]);
  const [cmd, setCmd] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // dual-mode: which substrate context to inject; codebase=on also lets the AI read/grep repo files.
  const [ctx, setCtx] = useState({ laws: true, memory: true, codebase: false });
  // sandbox allow-set (sparse-checkout INCLUDE folders); empty = whole repo. With codebase on, the
  // terminal runs in a writable sparse worktree keyed by this session id; edits stay isolated until
  // you "apply".
  const [scopeStr, setScopeStr] = useState("");
  const [sessionId] = useState(() => "term-" + Math.random().toString(36).slice(2, 12));
  const scroller = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [lines.length]);
  const run = async () => {
    const c = cmd.trim(); if (!c || busy) return;
    setCmd("");
    if (c === "clear") { setLines([]); return; }
    const history = lines.flatMap((l) => [{ role: "user", text: l.cmd }, { role: "assistant", text: l.out }]);
    setLines((l) => [...l, { cmd: c, out: "…" }]);
    setBusy(true);
    try {
      const include = scopeStr.split(",").map((s) => s.trim()).filter(Boolean);
      const r: any = await sendTerminalCommand(c, history, model, ctx, ctx.codebase ? { include_folders: include } : undefined, ctx.codebase ? sessionId : null);
      const resp = r?.response ?? r?.result?.response ?? (typeof r === "string" ? r : "(no response)");
      setLines((l) => { const n = [...l]; n[n.length - 1] = { cmd: c, out: resp }; return n; });
    } catch (e: any) {
      setLines((l) => { const n = [...l]; n[n.length - 1] = { cmd: c, out: `error: ${e?.message || "request failed"}` }; return n; });
    } finally { setBusy(false); }
  };
  // sandbox merge-back controls (codebase on): review the diff, apply it to the real repo, or discard.
  const sbAction = async (m: "diff" | "apply" | "discard") => {
    if (busy) return;
    setBusy(true);
    setLines((l) => [...l, { cmd: `sandbox ${m}`, out: "…" }]);
    try {
      const r: any = await sendTerminalSandbox(m, sessionId);
      let out: string;
      if (m === "diff") out = r?.exists ? (r.patch ? r.patch : "(no changes in the sandbox)") : "(no sandbox yet — run a command with codebase on)";
      else if (m === "apply") out = r?.applied ? `✓ applied ${r.count ?? (r.files?.length ?? 0)} file(s) to the real repo` : `not applied — ${r?.reason || "?"}`;
      else out = r?.removed ? "✓ sandbox discarded" : (r?.reason || "nothing to discard");
      setLines((l) => { const n = [...l]; n[n.length - 1] = { cmd: `sandbox ${m}`, out }; return n; });
    } catch (e: any) {
      setLines((l) => { const n = [...l]; n[n.length - 1] = { cmd: `sandbox ${m}`, out: `error: ${e?.message || "failed"}` }; return n; });
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "color-mix(in oklab, var(--c-bg) 80%, black)", fontFamily: mono }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", color: C.muted, fontSize: 11 }}>
        <span style={{ color: C.brand }}>●</span>
        <span>antiloki — vibe code</span>
        <span style={{ opacity: 0.7 }}>· direct AI · own session · sandbox edits (not the chat)</span>
        <div style={{ flex: 1 }} />
        <ModelPicker model={model} setModel={setModel} />
        <ModeSwitch mode={mode} setMode={setMode} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px 8px", fontFamily: mono, fontSize: 10.5, color: C.dim, flexWrap: "wrap" }}>
        <span style={{ color: C.muted }}>context</span>
        {(["laws", "memory", "codebase"] as const).map((k) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: ctx[k] ? C.brand : C.dim }}>
            <input type="checkbox" checked={ctx[k]} onChange={(e) => setCtx((c) => ({ ...c, [k]: e.target.checked }))} style={{ accentColor: C.brand }} />
            {k}
          </label>
        ))}
        {ctx.codebase && (
          <>
            <span style={{ color: C.brand, marginLeft: 6 }} title="writable sparse-worktree sandbox">⊟ sandbox</span>
            <span style={{ color: C.muted }}>include</span>
            <input
              value={scopeStr}
              onChange={(e) => setScopeStr(e.target.value)}
              placeholder="folders the sandbox includes (empty = whole repo), comma-sep"
              title="sparse-checkout allow-set — only these folders exist in the sandbox; everything else is physically absent"
              style={{ flex: 1, minWidth: 160, background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`, color: C.dim, fontFamily: mono, fontSize: 10.5, outline: "none", padding: "1px 2px" }}
            />
            {(["diff", "apply", "discard"] as const).map((m) => (
              <button key={m} onClick={() => sbAction(m)} disabled={busy}
                title={m === "diff" ? "review the sandbox changes" : m === "apply" ? "apply the changes to the real repo (gated)" : "discard the sandbox"}
                style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: mono, fontSize: 10.5, color: m === "apply" ? C.ok : m === "discard" ? C.bad : C.brand }}>
                {m === "diff" ? "review" : m}
              </button>
            ))}
          </>
        )}
      </div>
      <div ref={scroller} style={{ flex: 1, overflowY: "auto", padding: "6px 14px 14px", fontSize: 12.5, lineHeight: 1.6, color: C.fg }}>
        <div style={{ color: C.muted, marginBottom: 8 }}>vibe code — talk to the AI directly, edits land in a sandbox (isolated from the chat). `clear` resets.</div>
        {lines.map((ln, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div><span style={{ color: C.brand }}>$</span> <span style={{ color: C.fg }}>{ln.cmd}</span></div>
            <div style={{ color: C.dim, whiteSpace: "pre-wrap" }}>{ln.out}</div>
          </div>
        ))}
      </div>
      {/* the NEW field skin (operator 2026-07-20): ghost glass, nitid on hover, grip docks the chat */}
      <div style={{ padding: "6px 14px 14px" }}>
        <GlassBar style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.brand, fontFamily: mono, fontSize: 13 }}>$</span>
            <input
              autoFocus
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run(); } }}
              placeholder={busy ? "running…" : "talk to the AI…"}
              disabled={busy}
              style={{ flex: 1, background: "transparent", color: C.fg, border: "none", outline: "none", fontFamily: mono, fontSize: 13 }}
            />
            <DockGrip />
          </div>
        </GlassBar>
      </div>
    </div>
  );
}

// ── DeepSearch mode — research console → exportable document ──────────────────
const SCOPES = [
  { key: "codebase", label: "Codebase", hint: "the atlas graph + files" },
  { key: "graphrag", label: "Graph RAG", hint: "knowledge graph + memories" },
  { key: "knowledge", label: "Knowledge", hint: "ingested docs / vault" },
  { key: "internet", label: "Internet", hint: "web search" },
  { key: "memory", label: "Memory", hint: "consolidated narratives" },
  { key: "db", label: "Databases", hint: "the substrate DBs" },
];

export function DeepSearchView({ mode, setMode }: any) {
  const [scopes, setScopes] = useState<Record<string, boolean>>({ codebase: true, graphrag: true, knowledge: true, db: true, internet: false, memory: false });
  const [q, setQ] = useState("");
  const [doc, setDoc] = useState<{ title: string; md: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const toggle = (k: string) => setScopes((s) => ({ ...s, [k]: !s[k] }));

  const generate = async () => {
    const query = q.trim(); if (!query || busy) return;
    setBusy(true);
    const on = SCOPES.filter((s) => scopes[s.key]).map((s) => s.key);
    try {
      const r: any = await sendDeepSearch(query, on, model);
      const md = r?.md ?? r?.result?.md ?? "";
      const title = r?.title ?? r?.result?.title ?? query;
      setDoc({ title, md: md || "_(the synthesizer returned an empty document.)_" });
      setQ("");
    } catch (e: any) {
      setDoc({ title: query, md: `> DeepSearch failed: ${e?.message || "request failed"}` });
    } finally { setBusy(false); }
  };

  const slug = (doc?.title || "deepsearch").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "deepsearch";
  const exportAs = (fmt: "md" | "html" | "pdf") => {
    if (!doc) return;
    if (fmt === "md") downloadBlob(`${slug}.md`, doc.md, "text/markdown");
    else if (fmt === "html") downloadBlob(`${slug}.html`, docHtml(doc.title, doc.md), "text/html");
    else {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(docHtml(doc.title, doc.md));
      w.document.close(); w.focus();
      setTimeout(() => w.print(), 250); // user picks "Save as PDF"
    }
  };

  const expBtn = (fmt: "md" | "html" | "pdf", label: string) => (
    <button onClick={() => exportAs(fmt)} disabled={!doc} title={`export as ${label}`}
      style={{ border: `1px solid ${C.border}`, background: "transparent", color: doc ? C.dim : C.muted, borderRadius: 7, padding: "4px 10px", cursor: doc ? "pointer" : "not-allowed", fontFamily: nav, fontSize: 11 }}>
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, fontFamily: '-apple-system, system-ui, sans-serif' }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px" }}>
        <span style={{ fontFamily: nav, fontSize: 14, fontWeight: 600, color: C.fg }}>DeepSearch</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>research console · synthesizes a document from the substrate sources</span>
        <div style={{ flex: 1 }} />
        <ModelPicker model={model} setModel={setModel} />
        <ModeSwitch mode={mode} setMode={setMode} />
      </div>

      {/* scope toggles */}
      <div style={{ padding: "2px 16px 8px", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {SCOPES.map((s) => {
          const on = !!scopes[s.key];
          return (
            <button key={s.key} onClick={() => toggle(s.key)} title={s.hint}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", color: on ? C.brand : C.dim, cursor: "pointer", fontFamily: nav, fontSize: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? C.brand : C.muted }} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* generated document + export */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px", minHeight: 0 }}>
        {!doc ? (
          <div style={{ color: C.muted, fontSize: 13, fontFamily: nav, padding: "20px 0" }}>
            Pick your sources, ask a research question, and DeepSearch will synthesize a document you can export as Markdown, HTML, or PDF.
          </div>
        ) : (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, flex: 1 }}>generated document</span>
              {expBtn("md", "Markdown")}{expBtn("html", "HTML")}{expBtn("pdf", "PDF")}
            </div>
            <Markdown text={doc.md} />
          </div>
        )}
      </div>

      {/* query bar — the NEW field skin (ghost glass, grip docks the chat) */}
      <div style={{ padding: "10px 16px 16px" }}>
        <GlassBar style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.muted, fontSize: 14 }}>⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); generate(); } }}
              placeholder="Research question — generates an exportable document…"
              style={{ flex: 1, background: "transparent", color: C.fg, border: "none", outline: "none", fontFamily: '-apple-system, system-ui, sans-serif', fontSize: 14 }}
            />
            <DockGrip />
            <button onClick={generate} disabled={busy || !q.trim()} title="generate document"
              style={{ border: "none", borderRadius: 9, padding: "6px 14px", background: C.brand, color: C.bg, cursor: busy ? "wait" : "pointer", fontFamily: nav, fontSize: 12, fontWeight: 600, opacity: (busy || !q.trim()) ? 0.45 : 1 }}>
              Generate
            </button>
          </div>
        </GlassBar>
      </div>
    </div>
  );
}
