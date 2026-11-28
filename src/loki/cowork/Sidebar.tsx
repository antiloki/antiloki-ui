// THE SIDEBAR (board v3): Spaces (each with its threads and, under them, its agents as icons), Sagas. Spaces are the workspaces. Agents are grouped by urgency (Needs you, Done, Working, Idle) the way
// herdr groups them, with a finished agent you looked at staying in Done until you leave it. The sagas are the agents' own (made by themselves as an agent works, an episode for every ask), newest first, each with
// its summary. The logo menu is the desk's own, at the top, so the account, settings and docs stay where they were.
import { treeDrift } from "./thread-drift";
import { RunningNow } from "../team/RunningNow";
import { cleanSagaWords } from "./saga-words";
import { Inbox } from "../team/Inbox";
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { LogoMark } from "@/loki/shell/logo-menu";
import { teamGroups, effectiveStatuses, sections, type AgentRow, type AgentStatus, type Seen } from "./agent-state";
import { ROLE_COLOR } from "./TeamBar";
import { initialOf, glassStyle, tileColor } from "./space-tile";
import { PixelShadow } from "./SpecialistAvatar";
import { SideFx, onRowStyle } from "./sidebar-fx";
import { usePixelStyle } from "./use-appearance";
import { RemoteSection } from "@/loki/shell/remote-section";
import { ProviderIcon, spriteOf, SPRITE_NAME } from "./provider-icons";
import { ROLE_LABEL } from "./team-layout";
import type { AgentSaga, Thread } from "./api";
import { InlineName } from "./InlineName";

const label: React.CSSProperties = { fontFamily: nav, fontSize: 11, letterSpacing: "0.05em", color: C.muted, padding: "0 6px 6px", textTransform: "uppercase" };
const railBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 7, border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 15, padding: 0 };
const footBtn: React.CSSProperties = { flex: 1, height: 44, textAlign: "center", padding: "0 8px", border: "none", background: "transparent", color: C.brand, cursor: "pointer", fontFamily: nav, fontSize: 12.5 };
const tone = (s: string) => (s === "blocked" ? C.warn : s === "done" ? C.ok : s === "working" ? C.brand : C.muted);

export type Space = { name: string; active: boolean; missing?: boolean };
/** What the three dots offer an agent: the bottom strip's actions, for this one. `ship` opens the commit / commit-and-push card (the push is its own button there, and says so). */
export type AgentAction = "preview" | "commit" | "push";
export const AGENT_ACTIONS: ReadonlyArray<{ action: AgentAction; label: string; hint: string }> = [
  { action: "preview", label: "Preview its app", hint: "run what this agent built, beside it" },
  { action: "commit", label: "Commit…", hint: "commit what this agent changed in its box" },
  { action: "push", label: "Commit and push…", hint: "commit, then push its branch to the remote" },
];

/** THE PROVIDER'S MARK with the agent's state at its corner (operator 2026-11-10: the provider's logo instead of the coloured dot): a ring that turns while it works, an amber dot when it needs you, a green one when it finished; idle has none. */
export function ProviderBadge({ engine, status, size = 18 }: { engine?: string; status: AgentStatus; size?: number }) {
  const k = spriteOf(engine); const word = { blocked: "needs you", done: "done", working: "working", idle: "idle" }[status];
  return (
    <span data-testid="provider-badge" data-status={status} title={`${k ? SPRITE_NAME[k] : "agent"} · ${word}`} style={{ position: "relative", display: "inline-flex", flexShrink: 0, width: size, height: size }}>
      <ProviderIcon engine={engine} size={size} />
      {status === "working" && <span style={{ position: "absolute", right: -4, bottom: -3, width: 8, height: 8, boxSizing: "border-box", borderRadius: 4, border: `2px solid ${C.brand}`, borderRightColor: "transparent", background: C.bg, animation: "antilokiSpin 0.9s linear infinite" }} />}
      {status === "blocked" && <span style={{ position: "absolute", right: -3, bottom: -3, width: 8, height: 8, borderRadius: 4, background: C.warn, border: `1.5px solid ${C.bg}` }} />}
      {status === "done" && <span style={{ position: "absolute", right: -3, bottom: -3, width: 8, height: 8, borderRadius: 4, background: C.ok, border: `1.5px solid ${C.bg}` }} />}
    </span>
  );
}

/** THE THREADS OF THE OPEN SPACE, under it: click one to open its screen, double-click to rename, + for a new one, ✕ on an empty one that is not the only one. */
function ThreadList({ threads, onThread, onNew, onNewTeam, onRename, onDelete, onTree, agentIcons = [], focusedId = null, onFocusAgent }: { agentIcons?: { r: AgentRow; status: AgentStatus }[]; focusedId?: string | null; onFocusAgent?: (id: string) => void; onNewTeam?: () => void; onTree?: (id: string, op: "integrate" | "land" | "update" | "discard") => void; threads: Thread[]; onThread: (id: string) => void; onNew: (name: string) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void }) {
  const pixelStyle = usePixelStyle(); const [adding, setAdding] = React.useState(false); const [draft, setDraft] = React.useState(""); const [treeMenu, setTreeMenu] = React.useState<string | null>(null);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const commit = () => { const n = draft.trim(); setAdding(false); setDraft(""); if (n) onNew(n); };
  return (
    <div data-testid="threads" onClick={stop} style={{ marginTop: 6, marginLeft: 16, paddingLeft: 10, minWidth: 0, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 2, cursor: "default" }}>
      {threads.map((t) => (
        <div key={t.id} role="button" tabIndex={0} data-testid={`thread-${t.id}`} data-active={t.active ? "1" : "0"} onClick={() => !t.active && onThread(t.id)} onKeyDown={(e) => { if (e.key === "Enter" && !t.active) onThread(t.id); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", minWidth: 0, borderRadius: 5, cursor: t.active ? "default" : "pointer", background: t.active ? `color-mix(in srgb, ${C.brand} 16%, transparent)` : "transparent", color: t.active ? C.fg : C.muted, fontSize: 12, ...(t.active ? onRowStyle(pixelStyle, C.brand) : {}) }}>
          {t.active && <SideFx color={C.brand} />}
          <span aria-hidden style={{ color: t.active ? C.brand : C.dim }}>{t.team ? "⛓" : t.active ? "●" : "○"}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><InlineName value={t.name} label="rename this thread" max={60} onCommit={(n) => onRename(t.id, n)} /></span>
          {t.tree && treeDrift(t.tree).warn && <span data-testid={`thread-drift-${t.id}`} role="img" aria-label="this thread has drifted from the workspace" title={`${treeDrift(t.tree).line}. Update it from the workspace (menu on the right): nothing is deleted.`} style={{ fontSize: 10, color: C.warn, flexShrink: 0 }}>⚠</span>}
          {t.tree && <span data-testid={`thread-ahead-${t.id}`} title={`its own branch ${t.tree.branch}: ${t.tree.ahead} commit${t.tree.ahead === 1 ? "" : "s"} the workspace does not have yet${t.tree.dirty ? "; uncommitted changes in its folder" : ""}`} style={{ fontSize: 10, color: t.tree.ahead || t.tree.dirty ? C.warn : C.dim, fontFamily: mono, flexShrink: 0 }}>↑{t.tree.ahead}{t.tree.dirty ? "*" : ""}</span>}
          <span title={`${t.panes.length} pane${t.panes.length === 1 ? "" : "s"}`} style={{ fontSize: 10.5, color: C.dim, flexShrink: 0 }}>{t.panes.length}</span>
          {t.tree && onTree && (
            <span style={{ position: "relative" }}>
              <button data-testid={`thread-tree-menu-${t.id}`} aria-label={`the work of ${t.name}`} aria-haspopup="menu" aria-expanded={treeMenu === t.id} title="this thread's own branch and worktree" onClick={(e) => { e.stopPropagation(); setTreeMenu((m) => (m === t.id ? null : t.id)); }} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 13, lineHeight: "14px", padding: "0 3px" }}>⋯</button>
              {treeMenu === t.id && (
                <div role="menu" data-testid={`thread-tree-list-${t.id}`} onMouseLeave={() => setTreeMenu(null)} onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 16, zIndex: 60, minWidth: 220, padding: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 12px 30px -10px rgba(0,0,0,.6)" }}>
                  {([...((t.tree.behind ?? 0) > 0 ? [["update", `Update from the workspace (${t.tree.behind} behind)`, "merge the workspace's newest work into this thread, so it keeps up; the thread's own work stays and nothing is deleted. Only when its folder has nothing uncommitted"]] : []), ["integrate", "Bring the agents' work together", "commit each agent's work and merge it into the thread's branch; every agent then has the others' work"], ["land", "Land in the workspace (merge)", "merge the thread's branch into the workspace; only when the workspace has nothing uncommitted"], ["discard", "Discard this thread", "stop its terminals, save its work to the archive, then delete the thread and its branch and folder"]] as unknown as readonly (readonly [string, string, string])[]).map(([op, label, hint]) => <button key={op} role="menuitem" data-testid={`thread-tree-${op}-${t.id}`} title={hint} onClick={() => { setTreeMenu(null); onTree(t.id, op as "integrate" | "land" | "update" | "discard"); }} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: op === "discard" ? C.bad : C.fg, cursor: "pointer", fontFamily: nav, fontSize: 12, padding: "5px 8px", borderRadius: 4 }}>{label}</button>)}
                </div>
              )}
            </span>
          )}
          {threads.length > 1 && t.panes.length === 0 && <button aria-label={`delete the thread ${t.name}`} title="delete this empty thread" data-testid={`thread-delete-${t.id}`} onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", padding: 0, fontSize: 11 }}>✕</button>}
        </div>
      ))}
      {adding
        ? <input autoFocus data-testid="new-thread-input" aria-label="the new thread's name" value={draft} placeholder="thread name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commit(); else if (e.key === "Escape") { setAdding(false); setDraft(""); } }} onBlur={commit} style={{ background: C.bg, color: C.fg, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "2px 6px", fontFamily: nav, fontSize: 12, outline: "none" }} />
        : <div style={{ display: "flex", gap: 10 }}><button data-testid="new-thread" onClick={() => setAdding(true)} style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: nav, fontSize: 11.5, padding: "2px 6px", textAlign: "left" }}>+ new thread</button>{onNewTeam && <button data-testid="new-team" onClick={onNewTeam} title="a team: a graph of avatars, a Leader terminal and a saga of its own, in a thread of its own" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: nav, fontSize: 11.5, padding: "2px 6px", textAlign: "left" }}>+ new team</button>}</div>}
      {/* THE AGENTS, AS ICONS, under the threads (operator 2026-11-18: "agents as an inner section below the threads, just the icons"): the provider's mark with its state; a click goes to it */}
      {agentIcons.length > 0 && (
        <div data-testid="thread-agents" role="group" aria-label="agents" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 2px 2px" }}>
          {agentIcons.map(({ r, status }) => (
            <button key={r.id} data-testid={`agent-${r.id}`} data-status={status} aria-label={`${r.name} · ${status === "blocked" ? "needs you" : status}`} title={`${r.name}${r.role ? ` (${ROLE_LABEL[r.role]})` : ""} · ${status === "blocked" ? "needs you" : status}`} onClick={() => onFocusAgent?.(r.id)}
              style={{ width: 30, height: 30, padding: 0, borderRadius: 8, cursor: "pointer", border: `1px solid ${r.id === focusedId || (status === "working" && pixelStyle === "minimal") ? C.brand : C.border}`, background: r.id === focusedId && pixelStyle !== "minimal" ? `color-mix(in srgb, ${C.brand} 14%, transparent)` : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", isolation: "isolate" }}>
              {status === "working" && <SideFx color={C.brand} running />}
              <ProviderBadge engine={r.engine} status={status} size={17} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ onOpenTeam, onSettings, threads, onThread, onNewThread, onNewTeam, onRenameThread, onDeleteThread, onThreadTree, spaces, agents, seen, focusedId, episodes, onOpenSaga, onAllSagas, paneCount, collapsed, onToggle, onSpace, onNewSpace, onFocusAgent, onAddAgent, onAddPane, addLocked, onRenameAgent, onRenameSpace, onAgentAction }: {
  /** open a team from the Running Now list */ onOpenTeam?: (team: string) => void;
  /** the way to the settings: a gear at the sidebar's top, since the logo has no menu any more */ onSettings?: () => void;
  /** the open space's threads: each a screen of its own */ threads: Thread[]; onThread: (id: string) => void; onNewThread: (name: string) => void; /** make a team (RFC 0008): opens the new-team dialog */ onNewTeam?: () => void; onRenameThread: (id: string, name: string) => void; onDeleteThread: (id: string) => void; /** a thread's own tree: bring its agents' work together, land it in the workspace, discard it */ onThreadTree?: (id: string, op: "integrate" | "land" | "update" | "discard") => void;
  spaces: Space[]; agents: AgentRow[]; seen: Seen; focusedId: string | null; episodes: AgentSaga[]; /** open a saga on the Sagas screen */ onOpenSaga: (id: number) => void; /** the word "all" beside Sagas: the Sagas page */ onAllSagas?: () => void; paneCount: number; collapsed: boolean; onToggle: () => void;
  onSpace: (name: string) => void; onNewSpace: () => void; onFocusAgent: (id: string) => void; onAddAgent: (anchor: HTMLElement) => void; onAddPane: (anchor: HTMLElement) => void; /** a team's thread has its own panes (the Leader and the team): nothing is added to it by hand */ addLocked?: boolean;
  onRenameAgent: (id: string, name: string) => void; onRenameSpace: (name: string, next: string) => void;
  /** the agent's own actions, the strip's but for THIS agent (operator 2026-11-10: three dots on the agents): preview, commit, commit and push */
  onAgentAction?: (id: string, action: AgentAction) => void;
}) {
  const pixelStyleS = usePixelStyle();
  const lockTip = "A team's panes are its own (the Leader and the team): nothing is added to it by hand.";
  const [menu, setMenu] = React.useState<string | null>(null);
  const groups = sections(agents, seen, focusedId); const teams = teamGroups(agents, seen, focusedId); const effAll = effectiveStatuses(agents, seen, focusedId);
  const renderRow = (r: AgentRow, status: AgentStatus) => (
                <div key={r.id} role="button" tabIndex={0} data-testid={`agent-${r.id}`} onClick={() => onFocusAgent(r.id)} onKeyDown={(e) => { if (e.key === "Enter") onFocusAgent(r.id); }} style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: r.id === focusedId ? C.panel2 : "transparent", color: C.fg, fontFamily: nav, fontSize: 12.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ProviderBadge engine={r.engine} status={status} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><InlineName value={r.name} label="rename this agent" max={80} onCommit={(n) => onRenameAgent(r.id, n)} /></span>
                    {r.side && <span data-testid={`agent-side-${r.id}`} title="a side question: read-only" style={{ color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 999, padding: "0 6px", fontSize: 10, whiteSpace: "nowrap" }}>side</span>}
                    {r.role && <span data-testid={`agent-role-${r.id}`} title={`the team's ${ROLE_LABEL[r.role]}${r.role === "planner" ? "" : ": read-only, the planner drives it"}`} style={{ color: ROLE_COLOR[r.role], border: `1px solid ${ROLE_COLOR[r.role]}`, borderRadius: 999, padding: "0 6px", fontSize: 10, whiteSpace: "nowrap" }}>{ROLE_LABEL[r.role]}</span>}
                    {status === "blocked" && <span style={{ fontSize: 10.5, fontWeight: 600, padding: "1px 7px", borderRadius: 4, color: C.warn, background: `color-mix(in oklab, ${C.warn} 16%, transparent)` }}>Needs you</span>}
                    {onAgentAction && (
                      <span style={{ position: "relative" }}>
                        <button data-testid={`agent-menu-${r.id}`} aria-label={`actions for ${r.name}`} aria-haspopup="menu" aria-expanded={menu === r.id} title="actions" onClick={(e) => { e.stopPropagation(); setMenu((m) => (m === r.id ? null : r.id)); }}
                          style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 15, lineHeight: "16px", padding: "0 4px", borderRadius: 4 }}>⋯</button>
                        {menu === r.id && (
                          <div role="menu" data-testid={`agent-menu-list-${r.id}`} onMouseLeave={() => setMenu(null)} onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 20, zIndex: 60, minWidth: 190, padding: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.4)", display: "flex", flexDirection: "column" }}>
                            {AGENT_ACTIONS.map((a) => <button key={a.action} role="menuitem" data-testid={`agent-action-${a.action}`} title={a.hint} onClick={() => { setMenu(null); onAgentAction(r.id, a.action); }} style={{ background: "transparent", border: "none", color: C.fg, textAlign: "left", cursor: "pointer", fontFamily: nav, fontSize: 12.5, padding: "6px 9px", borderRadius: 5 }}>{a.label}</button>)}
                          </div>
                        )}
                      </span>
                    )}
                  </span>
                  {r.detail && <span style={{ display: "block", paddingLeft: 17, fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.detail}</span>}
                </div>
  );

  const shown = episodes.slice(0, 3);   // the sidebar shows the latest few; the word "all" opens the Sagas page
  const dot = (status: string): React.CSSProperties => (status === "working" ? { width: 10, height: 10, borderRadius: 5, border: `2px solid ${C.brand}`, borderRightColor: "transparent", animation: "antilokiSpin 0.9s linear infinite" }
    : status === "blocked" ? { width: 9, height: 9, borderRadius: 5, background: C.warn } : status === "done" ? { width: 9, height: 9, borderRadius: 5, background: C.ok } : { width: 9, height: 9, borderRadius: 5, border: `1.5px solid ${C.muted}` });
  // THE COLLAPSED RAIL: the screen's room back, with what you need still in reach: the expand button, the logo menu, the active space's initial, a dot per agent (colour = its state,
  // click focuses it, the title says who and what), and the add button.
  if (collapsed) {
    const active = spaces.find((x) => x.active);
    return (
      <aside data-testid="cowork-sidebar" data-collapsed="1" style={{ width: 52, flexShrink: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "10px 0", background: `color-mix(in srgb, ${C.bg} var(--cw-pane, 100%), transparent)`, borderRight: `1px solid ${C.border}`, minHeight: 0 }}>
        <button data-testid="sidebar-toggle" aria-label="expand the sidebar" title="expand the sidebar (Alt+B)" onClick={onToggle} style={railBtn}>»</button>
        <LogoMark />
        {onSettings && <button data-testid="sidebar-settings" aria-label="settings" title="settings" onClick={onSettings} style={railBtn}>⚙</button>}
        {active && <div title={`space: ${active.name}`} data-testid="rail-space" style={{ width: 28, height: 28, borderRadius: 7, background: C.panel2, color: C.fg, display: "grid", placeItems: "center", fontFamily: nav, fontWeight: 700, fontSize: 13 }}>{active.name.slice(0, 1).toUpperCase()}</div>}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 6 }}>
          {groups.flatMap((g) => g.rows.map((r) => (
            <button key={r.id} data-testid={`rail-agent-${r.id}`} aria-label={`${r.name}, ${g.label}`} title={`${r.name} · ${g.label}${r.detail ? ` · ${r.detail}` : ""}`} onClick={() => onFocusAgent(r.id)}
              style={{ ...railBtn, outline: r.id === focusedId ? `1.5px solid ${C.brand}` : "none", display: "grid", placeItems: "center" }}><ProviderBadge engine={r.engine} status={g.status} /></button>
          )))}
        </div>
        <button data-testid="add-agent" aria-label="new agent" title={addLocked ? lockTip : "new agent"} aria-disabled={addLocked || undefined} onClick={(e) => { if (!addLocked) onAddAgent(e.currentTarget); }} style={{ ...railBtn, color: C.brand, fontSize: 18, ...(addLocked ? { opacity: 0.35, cursor: "not-allowed" } : {}) }}>+</button>
        <button data-testid="add-pane" aria-label="new pane" title={addLocked ? lockTip : "new pane"} aria-disabled={addLocked || undefined} onClick={(e) => { if (!addLocked) onAddPane(e.currentTarget); }} style={{ ...railBtn, color: C.brand, fontSize: 14, ...(addLocked ? { opacity: 0.35, cursor: "not-allowed" } : {}) }}>▣</button>
      </aside>
    );
  }
  return (
    <aside data-testid="cowork-sidebar" style={{ width: 236, flexShrink: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", background: `color-mix(in srgb, ${C.bg} var(--cw-pane, 100%), transparent)`, backdropFilter: "blur(var(--cw-blur, 0px))", borderRight: `1px solid ${C.border}`, minHeight: 0 }}>
      <div style={{ padding: "10px 8px 6px 12px", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <LogoMark overlay />
        <div style={{ flex: 1 }} />
        {onSettings && <button data-testid="sidebar-settings" aria-label="settings" title="settings" onClick={onSettings} style={railBtn}>⚙</button>}
        <button data-testid="sidebar-toggle" aria-label="collapse the sidebar" title="collapse the sidebar (Alt+B)" onClick={onToggle} style={railBtn}>«</button>
      </div>
      <RunningNow onOpenTeam={onOpenTeam} />
      <Inbox onOpenTeam={onOpenTeam} />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none", padding: "4px 8px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        <section aria-label="Spaces">
          <div style={label}>Spaces</div>
          {/* THE SPACES ARE A GRID (operator 2026-11-10): a space that is not open is only its tile, so several sit on one line; the open one takes a whole row, with its name, its threads and what it holds */}
          <div data-testid="spaces" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
            {spaces.map((s) => { const g = glassStyle(s.name, s.active); const tile = (
              <span data-testid={`space-tile-${s.name}`} aria-hidden style={{ width: 36, height: 36, borderRadius: 11, boxSizing: "border-box", flexShrink: 0, display: "grid", placeItems: "center", position: "relative", isolation: "isolate", overflow: "hidden", fontWeight: 700, fontSize: 15, opacity: s.missing ? 0.45 : 1, ...g, ...(pixelStyleS === "minimal" ? { background: "transparent", border: `1px solid ${tileColor(s.name)}`, color: tileColor(s.name) } : {}) }}><PixelShadow behind hex={tileColor(s.name)} px={3} strength={2.2} testid="space-pixels" />{initialOf(s.name)}</span>
            ); return s.active ? (
              <div key={s.name} data-testid={`space-${s.name}`} data-active="1" style={{ flexBasis: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", padding: "4px 4px 6px", borderRadius: 12, background: C.panel2, color: C.fg, fontFamily: nav, fontSize: 12.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {tile}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600 }}><InlineName value={s.name} label="rename this space" max={60} onCommit={(n) => onRenameSpace(s.name, n)} /></div>
                    <div style={{ fontSize: 11, color: C.muted }}>{paneCount} pane{paneCount === 1 ? "" : "s"}</div>
                  </div>
                </div>
                <ThreadList threads={threads} onThread={onThread} onNew={onNewThread} onNewTeam={onNewTeam} onRename={onRenameThread} onDelete={onDeleteThread} onTree={onThreadTree} agentIcons={[...teams.flatMap((c) => c.rows.map((r) => ({ r, status: effAll.get(r.id) ?? r.status }))), ...groups.flatMap((g) => g.rows.map((r) => ({ r, status: g.status })))]} focusedId={focusedId} onFocusAgent={onFocusAgent} />
              </div>
            ) : (
              <button key={s.name} data-testid={`space-${s.name}`} data-active="0" onClick={() => onSpace(s.name)} title={s.missing ? `${s.name}: this folder is gone from the disk` : `open ${s.name}`} aria-label={`open the space ${s.name}`} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", borderRadius: 11 }}>{tile}</button>
            ); })}
            <button data-testid="new-space" onClick={onNewSpace} title="new space" aria-label="new space" style={{ width: 36, height: 36, borderRadius: 11, boxSizing: "border-box", background: "transparent", border: `1px dashed ${C.border}`, color: C.brand, cursor: "pointer", fontFamily: nav, fontSize: 18, lineHeight: 1, padding: 0 }}>+</button>
          </div>
        </section>
        <section aria-label="Sagas" data-testid="episodes">
          <div style={{ ...label, display: "flex", alignItems: "center" }}><span>Sagas</span><span style={{ flex: 1 }} />
            <button data-testid="episodes-all" onClick={() => onAllSagas?.()} title="Open the Sagas page" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: nav, fontSize: 11, textTransform: "none", letterSpacing: 0 }}>all</button>
          </div>
          {episodes.length === 0 && <div style={{ color: C.muted, fontFamily: nav, fontSize: 12, padding: "0 8px", lineHeight: 1.4 }}>no sagas yet. An agent's work shows up here by itself, as a saga with an episode for every ask.</div>}
          {shown.map((e) => (
            <button key={e.id} data-testid={`episode-${e.id}`} data-open={e.open ? "1" : "0"} title="open this saga" onClick={() => onOpenSaga(e.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 8, borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: C.fg, fontFamily: nav, ...(e.open ? onRowStyle(pixelStyleS, C.warn) : {}) }}>
              {e.open && <SideFx color={C.warn} running />}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span title={e.open ? "open: still being worked on" : "closed"} style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: e.open ? C.warn : C.ok }} /><span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanSagaWords(e.title) || "untitled saga"}</span></div>
              <div style={{ fontSize: 11, lineHeight: 1.35, color: C.muted, paddingLeft: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{cleanSagaWords(e.summary)}</div>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, padding: "2px 0 0 12px" }}>{[e.pane, e.turns ? `${e.turns} turn${e.turns === 1 ? "" : "s"}` : "", e.usd > 0 ? `$${e.usd.toFixed(2)}` : "", e.open ? "open" : ""].filter(Boolean).join(" · ")}</div>
            </button>
          ))}
        </section>
        <RemoteSection />
      </div>
      <div style={{ display: "flex", flexShrink: 0, borderTop: `1px solid ${C.border}` }}>
        <button data-testid="add-agent" title={addLocked ? lockTip : undefined} aria-disabled={addLocked || undefined} onClick={(e) => { if (!addLocked) onAddAgent(e.currentTarget); }} style={{ ...footBtn, ...(addLocked ? { opacity: 0.35, cursor: "not-allowed" } : {}) }}>+ new agent</button>
        <button data-testid="add-pane" title={addLocked ? lockTip : undefined} aria-disabled={addLocked || undefined} onClick={(e) => { if (!addLocked) onAddPane(e.currentTarget); }} style={{ ...footBtn, borderLeft: `1px solid ${C.border}`, ...(addLocked ? { opacity: 0.35, cursor: "not-allowed" } : {}) }}>+ new pane</button>
      </div>
    </aside>
  );
}
