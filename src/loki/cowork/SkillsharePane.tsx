// THE SKILLS PANE (operator 2026-11-10: "skillshare, like herdr's"). What the `skillshare` CLI manages on this machine for every AI tool (skills, agents, MCP servers, plugins, hooks), laid out
// the way herdr's skillshare panel lays it out: a scope switch and kind tabs with counts, a filter, Install, then the list grouped by what needs doing (updates upstream, what a target still
// needs, what is in sync, grouped by source). It is the CLI's own state read through the serve; nothing is stored here. Without the CLI it says what skillshare is and how to get it.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { loadSkillshare, runSkillshare } from "./api";
import { KINDS, allItems, counts, filterItems, groupItems, installSourceOk, rowActions, rowSub, runLine, sourceGroups, type Item, type Kind, type Scope, type SkillshareState } from "./skillshare";

const TONE: Record<string, string> = { update: C.brand, sync: C.warn, missing: C.warn, off: C.muted, unknown: C.muted, ok: C.ok };

export function SkillsharePane({ project = true }: { project?: boolean }) {
  const [st, setSt] = React.useState<SkillshareState | null>(null);
  const [scope, setScope] = React.useState<Scope | "all">("all");
  const [kind, setKind] = React.useState<Kind>("skills");
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<{ ok: boolean; line: string } | null>(null);
  const [showOff, setShowOff] = React.useState(false);
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [confirm, setConfirm] = React.useState<Item | null>(null);
  const [installing, setInstalling] = React.useState(false);
  const [source, setSource] = React.useState("");
  const [creating, setCreating] = React.useState(false); const [newName, setNewName] = React.useState(""); const [newDesc, setNewDesc] = React.useState("");
  // the state first (fast), then the update checks (they ask every source's remote)
  const load = React.useCallback(async (checks: boolean) => { const s = await loadSkillshare(project, checks); setSt((prev) => (checks || !prev || !prev.installed || !s.installed ? s : { ...s, scopes: s.scopes.map((x) => ({ ...x, raw: { ...x.raw, check: prev.scopes.find((p) => p.scope === x.scope)?.raw.check, checkAgents: prev.scopes.find((p) => p.scope === x.scope)?.raw.checkAgents } })) })); }, [project]);
  React.useEffect(() => { void load(false).then(() => load(true)); }, [load]);
  const run = async (label: string, req: Record<string, unknown>, after = true) => { setBusy(label); setNote(null); const r = await runSkillshare(req); setNote(runLine(String(req.op), r)); setBusy(null); if (after) await load(true); };

  const wrap: React.CSSProperties = { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", fontFamily: nav, color: C.fg, fontSize: 12.5 };
  if (!st) return <div data-testid="skillshare" style={{ ...wrap, padding: 14, color: C.muted }}>reading skillshare…</div>;
  if (!st.installed) {   // (only when the serve cannot be reached: the bank is antiloki's own)
    return (
      <div data-testid="skillshare" data-state="missing" style={{ ...wrap, padding: 16, gap: 8, overflow: "auto" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>the skills could not be read</div>
        <div style={{ color: C.dim, lineHeight: 1.55 }}>{st.hint}</div>
        <button data-testid="skillshare-recheck" onClick={() => void load(false)} style={{ alignSelf: "flex-start", fontFamily: nav, fontSize: 12, padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.brand, cursor: "pointer" }}>check again</button>
      </div>
    );
  }
  const items = allItems(st); const hasProject = st.scopes.some((s) => s.scope === "project");
  const sc: Scope | "all" = hasProject ? scope : "global";
  const c = counts(filterItems(items, { scope: sc, kind: null, query: "" })); const cScope = counts(items);
  const listed = filterItems(items, { scope: sc, kind, query }); const disabled = listed.filter((i) => !i.notice && i.state === "off").length;
  const shown = showOff ? listed : filterItems(listed, { scope: sc, kind, query: "", hideDisabled: true }); const g = groupItems(shown); const notices = shown.filter((i) => i.notice);
  const showScope = hasProject && sc === "all";
  const btn = (on?: boolean, tone?: string): React.CSSProperties => ({ fontFamily: nav, fontSize: 12, padding: "3px 10px", borderRadius: 6, border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", color: on ? C.brand : tone ?? C.fg, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap" });
  const seg = (testid: string, opts: [string, string][], cur: string, set: (k: string) => void) => <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{opts.map(([k, l]) => <button key={k} data-testid={`${testid}-${k}`} aria-pressed={cur === k} onClick={() => set(k)} style={btn(cur === k)}>{l}</button>)}</div>;
  const scopesFor = (xs: Item[]): Scope[] => [...new Set(xs.map((i) => i.scope))];

  const row = (i: Item) => {
    const acts = rowActions(i);
    return (
      <div key={i.key} data-testid={`ss-row-${i.kind}-${i.name}`} data-state={i.state} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
        <span title={i.state} style={{ width: 7, height: 7, borderRadius: 4, background: TONE[i.state] ?? C.muted, flex: "0 0 auto" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.label}</div>
          <div style={{ color: C.muted, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rowSub(i, showScope)}</div>
        </div>
        {acts.map((a) => a === "update" ? <button key={a} data-testid={`ss-update-${i.name}`} disabled={!!busy} onClick={() => void run(`update ${i.label}`, { op: "update", scope: i.scope, kind: i.kind, name: i.rel || i.name })} style={btn(true)}>update</button>
          : a === "uninstall" ? <button key={a} data-testid={`ss-uninstall-${i.name}`} disabled={!!busy} onClick={() => setConfirm(i)} style={btn(false, C.muted)}>uninstall</button>
          : (i.kind === "skills" || i.kind === "agents") ? <button key={a} data-testid={`ss-toggle-${a}-${i.name}`} disabled={!!busy} onClick={() => void run(`${a} ${i.label}`, { op: "toggle", off: a === "disable", scope: i.scope, kind: i.kind, name: i.rel || i.name })} style={btn(false, C.muted)}>{a === "disable" ? "switch off" : "switch on"}</button>
          : <button key={a} data-testid={`ss-hook-${a}-${i.name}`} disabled={!!busy} onClick={() => void run(`${a} ${i.label}`, { op: "hook", action: a, scope: i.scope, name: i.name })} style={btn(false, a === "remove" ? C.bad : C.fg)}>{a}</button>)}
      </div>
    );
  };
  const head = (id: string, label: string, color: string, action: React.ReactNode) => <div key={id} data-testid={`ss-group-${id}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0 4px" }}><span style={{ flex: 1, fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", color }}>{label}</span>{action}</div>;
  const syncScopes = scopesFor([...g.sync, ...notices.filter((i) => i.pending)]);
  const bySource = (kind === "skills" || kind === "agents") && !query;
  const sources = bySource ? sourceGroups(g.ok) : null;

  return (
    <div data-testid="skillshare" data-state="ready" style={wrap}>
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{st.native ? "Skills" : "skillshare"}</span><span data-testid="ss-tools" title={st.tools.map((t) => t.label).join(", ")} style={{ color: C.muted, fontFamily: mono, fontSize: 11 }}>{st.native ? "one bank · " : st.version ? `v${st.version.replace(/^v/, "")} · ` : ""}{st.targets} tool{st.targets === 1 ? "" : "s"}{st.native && st.tools.length ? `: ${st.tools.map((t) => t.label).join(", ")}` : ""}</span>
          {st.source && <span title={st.source} style={{ color: C.muted, fontFamily: mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>{st.source}</span>}
          <span style={{ flex: st.source ? 0 : 1 }} /><button aria-label="refresh" title="read it all again" disabled={!!busy} onClick={() => void load(false).then(() => load(true))} style={{ ...btn(), border: "none", color: C.muted }}>↻</button>
        </div>
        {hasProject && seg("ss-scope", [["all", `All ${cScope.all}`], ["project", `Project ${cScope.project}`], ["global", `Global ${cScope.global}`]], sc, (k) => setScope(k as Scope | "all"))}
        {seg("ss-kind", KINDS.filter((k) => !st.native || k.key === "skills" || k.key === "agents").map((k) => [k.key, `${k.label} ${c[k.key]}`]), kind, (k) => setKind(k as Kind))}
        <div style={{ display: "flex", gap: 6 }}>
          <input data-testid="ss-filter" aria-label="filter" placeholder="filter by name or source" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 0, fontFamily: nav, fontSize: 12, padding: "4px 9px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.fg, outline: "none" }} />
          <button data-testid="ss-install" disabled={!!busy} onClick={() => { setInstalling((v) => !v); setCreating(false); setSource(""); }} style={btn(installing)}>＋ Install</button>
          {st.native && <button data-testid="ss-new" disabled={!!busy} onClick={() => { setCreating((v) => !v); setInstalling(false); setNewName(""); setNewDesc(""); }} style={btn(creating)}>＋ New skill</button>}
        </div>
        {creating && (
          <div data-testid="ss-new-form" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input data-testid="ss-new-name" aria-label="skill name" autoFocus placeholder="name (letters, digits, - _ .)" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: "1 1 140px", minWidth: 0, fontFamily: mono, fontSize: 12, padding: "4px 9px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.fg }} />
            <input data-testid="ss-new-desc" aria-label="what it is for" placeholder="when should an agent use it?" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} style={{ flex: "2 1 200px", minWidth: 0, fontFamily: nav, fontSize: 12, padding: "4px 9px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.fg }} />
            <button data-testid="ss-new-go" disabled={!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(newName.trim()) || !!busy} onClick={() => { void run(`new ${newName.trim()}`, { op: "new", scope: sc === "project" ? "project" : "global", name: newName.trim(), description: newDesc.trim() }); setCreating(false); }} style={btn(true)}>Create and link</button>
          </div>
        )}
        {installing && (
          <div data-testid="ss-install-form" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input data-testid="ss-source" aria-label="source" autoFocus placeholder="owner/repo or a git address" value={source} onChange={(e) => setSource(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && installSourceOk(source)) { void run(`install ${source}`, { op: "install", scope: sc === "project" ? "project" : "global", source: source.trim() }); setInstalling(false); } }} style={{ flex: 1, minWidth: 0, fontFamily: mono, fontSize: 11.5, padding: "4px 9px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.fg, outline: "none" }} />
            <button data-testid="ss-install-go" disabled={!installSourceOk(source) || !!busy} onClick={() => { void run(`install ${source}`, { op: "install", scope: sc === "project" ? "project" : "global", source: source.trim() }); setInstalling(false); }} style={{ ...btn(true), opacity: installSourceOk(source) ? 1 : 0.45 }}>install into {sc === "project" ? "project" : "global"}</button>
          </div>
        )}
      </div>
      {busy && <div data-testid="ss-busy" style={{ padding: "5px 12px", color: C.warn, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>working: {busy}…</div>}
      {note && !busy && <div data-testid="ss-note" role="status" style={{ padding: "5px 12px", color: note.ok ? C.ok : C.bad, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{note.line}</div>}
      {confirm && (
        <div data-testid="ss-confirm" role="alertdialog" style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.bad} 8%, transparent)`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>Uninstall <b>{confirm.label}</b> ({confirm.scope})? {st.native ? "It is taken out of the bank, and every tool loses its link to it." : "It moves to the skillshare trash."}</span>
          <button data-testid="ss-confirm-no" onClick={() => setConfirm(null)} style={btn()}>keep</button>
          <button data-testid="ss-confirm-yes" onClick={() => { const i = confirm; setConfirm(null); void run(`uninstall ${i.label}`, { op: "uninstall", scope: i.scope, kind: i.kind, name: i.rel || i.name }); }} style={btn(false, C.bad)}>uninstall</button>
        </div>
      )}
      <div data-testid="ss-list" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 12px 14px" }}>
        {notices.map((n) => <div key={n.key} data-testid="ss-notice" style={{ margin: "8px 0 0", padding: "6px 9px", borderRadius: 6, border: `1px solid ${C.warn}`, color: C.warn, fontSize: 12 }}>{n.scope}{n.root ? ` · ${n.root}` : ""}: {n.reason}{n.blocker ? " Resolve it with the CLI; a sync checks again before it changes anything." : ""}</div>)}
        {st.scopes.filter((s) => s.error && (sc === "all" || sc === s.scope)).map((s) => <div key={s.scope} style={{ color: C.warn, padding: "8px 0" }}>{s.scope}: {s.error}</div>)}
        {g.update.length > 0 && head("update", `Updates available · ${g.update.length}`, C.brand, <button data-testid="ss-update-all" disabled={!!busy} onClick={() => { for (const sco of scopesFor(g.update)) void run(`update all (${sco})`, { op: "update", all: true, scope: sco, kind: kind === "agents" ? "agents" : "skills" }); }} style={btn(true)}>Update all</button>)}
        {g.update.map(row)}
        {g.sync.length > 0 && head("sync", `Needs sync · ${g.sync.length}`, C.warn, <button data-testid="ss-sync" disabled={!!busy} onClick={() => { for (const sco of (syncScopes.length ? syncScopes : ["global"] as Scope[])) void run(`sync ${sco}`, { op: "sync", scope: sco }); }} style={btn(true)}>{syncScopes.length === 1 ? `Sync ${syncScopes[0]}` : "Sync"}</button>)}
        {g.sync.map(row)}
        {(g.ok.length > 0 || disabled > 0 || listed.length === 0) && head("ok", `In sync · ${g.ok.length}`, C.muted, disabled > 0 ? <button data-testid="ss-show-off" onClick={() => setShowOff((v) => !v)} style={{ ...btn(false, C.muted), border: "none" }}>{showOff ? "Hide" : "Show"} disabled · {disabled}</button> : null)}
        {sources ? <>
          {sources.groups.map((grp) => { const isOpen = open.has(grp.key); return (
            <div key={grp.key}>
              <button data-testid={`ss-source-${grp.label}`} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(grp.key)) n.delete(grp.key); else n.add(grp.key); return n; })} style={{ display: "flex", width: "100%", gap: 8, alignItems: "center", padding: "6px 0", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`, color: C.fg, fontFamily: nav, fontSize: 12.5, cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: C.muted, width: 10 }}>{isOpen ? "▾" : "▸"}</span><span style={{ fontWeight: 500, flex: 1 }}>{grp.label}</span><span style={{ color: C.muted }}>{grp.items.length}{grp.repo ? " · tracked repo" : ""}</span>
              </button>
              {isOpen && <div style={{ paddingLeft: 16 }}>{grp.items.map(row)}</div>}
            </div>); })}
          {sources.rows.map(row)}
        </> : g.ok.map(row)}
        {shown.length === 0 && <div style={{ color: C.muted, padding: "10px 0" }}>{listed.length ? "All disabled entries are hidden." : query ? "Nothing matches the filter." : `No ${KINDS.find((k) => k.key === kind)?.label.toLowerCase()} here yet${kind === "skills" ? ": install one with ＋ Install, then sync" : ""}.`}</div>}
      </div>
    </div>
  );
}
