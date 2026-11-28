// EPIC-CHAT-WIDGETS: the shared interviewer chat body. Both the right-side
// drawer (variant="drawer") and the full-page chat (variant="page") render
// this — the behavior is identical; variant only changes layout (column width,
// where the close button lives). It lists sessions, shows the active session's
// turns, dispatches POST /api/v1/turn, and renders each turn's inline widgets
// through the registry (deriveWidgets → WidgetHost). Extracted from the former
// monolithic chat-drawer.tsx so the page and drawer can't drift.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { designTabOf } from "@/loki/codebase/design-view";
import { TraceTrail } from "./chat-trace";
import { useShell } from "@/loki/shell/slug-context";
import { Markdown } from "@/loki/components/Markdown";
import { C, mono, nav } from "@/loki/theme";
import { useChatSessions, useChatTurns, useSessionWidgets } from "@/loki/api/hooks";
import {
  sendChatTurn, sendCardDiscuss, sendTurnRewrite, saveTurnWidget, createChatSession, uploadFile, confirmInterviewerTurn, consolidateEpisodeRemote,
  type DiscussOperation, type RewriteOperation, type ChatRef, type ChatAttachment,
} from "@/loki/api/dispatch";
import { getFeSession, apiPost, isNotWired } from "@/loki/api/client";
import { fetchAutoContext, withAutoContext, readUsed, noteUsed, readContextPrefs, setContextPref, writeContextPrefs, UsedChips, type UsedPick } from "./auto-context";
import { startNarrationJob, armAudio } from "@/loki/widgets/narration-jobs";
import { dockStore } from "@/loki/shell/dock-store";
import { EndpointStub } from "@/loki/components/EndpointStub";
import { AICallChip } from "@/loki/components/AICallChip";
import { ChatHistorySidebar, ContextBox } from "./chat-history-sidebar";
import { MentionInput } from "./mention-input";
import { DockZone, type ZoneItem, type Thread, type ThreadStrip, type AddTarget } from "./widget-dock";
import { buildChatMarkdown, downloadChatMarkdown } from "./chat-export";
import { TerminalView, ModeSwitch, ModelPicker, CHAT_MODELS } from "./chat-modes";
import { ScreenSwitch } from "@/loki/shell/screen-switch";
import { useTourUnlock } from "@/loki/shell/mini-tour";
import { useAgentsTab, EpisodesSidebar, EpisodeReader, useMergesLite, jobWinners, winnerLabel, sideFromKey, sizeWord, makeWinnerRecipe, isWinnerRecipe, winnerRecipeOf, type MergeRowLite } from "./agents-tab";
import { mergeName, jobNote, sideName } from "./jobs";
import { fetchRoles, byFamily, adapterLine, OBJECTIVES, type Objective, type RoleWithMerges } from "./roles";
import { RoleCard } from "./role-card";
import { cardOf, MergeCardView } from "./merge-card";
import { parseFaceIcon, badgeOf } from "./chibi-face";
import { appendContext, isContextDrag, readContextDrop } from "@/loki/shell/drag-context";
import { CockpitView } from "../cockpit/cockpit-view";
import { NotebooksView } from "../notebooks/notebooks-view";
import { deriveWidgets } from "@/loki/widgets/derive";
import { paneDisplay, type WidgetKind } from "@/loki/widgets/types";
import { WidgetHost } from "@/loki/widgets/widget-host";
import { SplitPane, widgetWord, type ChatWidget } from "./chat-widgets";
import { LensReply, parseLens } from "@/loki/cockpit/lens-reply";
import { widgetIds } from "./widget-ids";
import { parseWidgetCommand, WIDGET_COMMANDS } from "@/loki/widgets/palette";
import { type StudioFocus, StudioOverlay, AGENTS, ATLAS_IDE, ATLAS_VIBE, ATLAS_DESIGN, VIBE_PANES } from "@/loki/widgets/studio-overlay";
import { DESC as STUDIO_DESC, sampleFor } from "@/loki/widgets/studio-kit";
import { demoFor } from "@/loki/widgets/studio-demos";
import { PANE_KINDS } from "@/loki/cockpit/pane-gallery";
// which catalog a kind belongs to — the Threads category follows the catalog, never a name prefix
const TOOL_KINDS = new Set<string>([...ATLAS_VIBE.map((w) => w.kind), ...VIBE_PANES.map((w) => w.kind), "automation", "vibe-sketch", "vibe-todo", "vibe-kanban" /* no longer offered in the list, but one already in a thread is still a tool */]);
const IDE_KINDS = new Set<string>(ATLAS_IDE.map((w) => w.kind));
const DESIGN_KINDS = new Set<string>(["design-view", "design-frames"]);
import { useWorkspaces } from "@/loki/api/hooks";
import { AgentRecipeWizard } from "@/loki/widgets/agent-recipe-wizard";
import { listRecipes, blankRecipe, type AgentRecipe } from "@/loki/widgets/agent-recipes";
import { useSeats } from "@/loki/api/seats";
import { AgentCard, agentCardEngine, type AgentEngine } from "@/loki/widgets/agent-card";
import { baseAgent, type BaseAgent } from "@/loki/widgets/base-agents";
import { faceColor } from "@/loki/cockpit/agent-themes";
import { noteTimeline } from "@/loki/widgets/agents-timeline";
import { subagentKey } from "@/loki/widgets/subagents";
import { WidgetsSidebar } from "./widgets-sidebar";
import { composeScreenManifest, widgetUid, STAGE_ACTIONS, reportScreenState } from "./screen-manifest";
import { sentinelFlags, episodeReportLanded } from "./sentinel-watch";
import { executeUiCommands, describeUiCommand, type UiCommand } from "./ui-bus";
import { DockShell, DockGhostField } from "@/loki/shell/dock";
import { useDock } from "@/loki/shell/dock-store";
import { Logo } from "@/loki/shell/logo";
import { RebuildPanel } from "@/loki/codebase/rebuild-panel";
import { ContextWizard } from "./context-wizard";
import { AgentCloseDialog, CLI_KINDS } from "@/loki/widgets/agent-close";

// Reply reveal: a gentle fade-in that settles down from the top, + a pulse for the thinking bubble.
// Injected once at module load (inline styles can't carry @keyframes).
if (typeof document !== "undefined" && !document.getElementById("antiloki-chat-anim")) {
  const s = document.createElement("style");
  s.id = "antiloki-chat-anim";
  s.textContent =
    "@keyframes antilokiFadeInDown{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:translateY(0)}}" +
    "@keyframes antilokiPulse{0%,100%{opacity:.5}50%{opacity:1}}";
  document.head.appendChild(s);
}

type DbRowTable = "cards" | "contracts" | "memories" | "ai_calls";
type TrayRef =
  | { kind: "card"; slug: string }
  | { kind: "knowledge"; docId: number; label: string }
  | { kind: "db_row"; table: DbRowTable; id: string; label: string }
  | { kind: "code_file"; path: string }
  | { kind: "source"; source: string; label: string }
  | { kind: "attachment"; docId: number; label: string };

// COCKPIT Wave 3: a curated model shortlist for the composer picker (OpenRouter ids). "auto" (the
// empty value) keeps today's per-turn tier routing. A pin that isn't in the BYOK key degrades to the
// interviewer's AI-failure fallback. (A future wave swaps this for the live cost-center catalog.)
// COCKPIT Wave 3/7: short label for the per-turn model badge. Prefer the picker label,
// else the last path segment of the OpenRouter id ("deepseek/deepseek-r1" → "deepseek-r1").
function modelLabel(id?: string | null): string | null {
  if (!id) return null;
  return CHAT_MODELS.find((m) => m.id === id)?.label ?? id.split("/").pop() ?? id;
}

// compact token count: 6001 → "6.0k", 120 → "120".
function fmtTok(n: number): string {
  if (!n) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function buildRefPayload(refs: TrayRef[]): { references: ChatRef[]; attachments: ChatAttachment[] } {
  const references: ChatRef[] = [];
  const attachments: ChatAttachment[] = [];
  for (const r of refs) {
    if (r.kind === "card") references.push({ ref_type: "card", id: r.slug });
    else if (r.kind === "knowledge") references.push({ ref_type: "knowledge", id: r.docId });
    else if (r.kind === "db_row") references.push({ ref_type: "db_row", table: r.table, id: r.id });
    else if (r.kind === "code_file") references.push({ ref_type: "code_file", id: r.path });
    else if (r.kind === "source") references.push({ ref_type: "source", id: r.source });
    else if (r.kind === "attachment") attachments.push({ document_id: r.docId });
  }
  return { references, attachments };
}

function trayLabel(r: TrayRef): string {
  if (r.kind === "card") return `@${r.slug}`;
  if (r.kind === "knowledge") return `@${r.label}`;
  if (r.kind === "code_file") return `@${r.path.split("/").pop() ?? r.path}`;
  if (r.kind === "source") return `🔌 ${r.label}`;
  if (r.kind === "attachment") return `📎 ${r.label}`;
  return `@${r.table}#${r.id}`;
}

export function ChatThread({ variant = "drawer", onRequestClose }: {
  variant?: "drawer" | "page";
  onRequestClose?: () => void;
}) {
  // CHATS · THREADS (operator 2026-09-21: "place Chats as a tab with threads", chats first): the desk sidebar's
  // tab, remembered per install. On `chats` the chat is the stage (sessions left, the conversation right) and the
  // thread cell for it is not mounted; on `threads` the chat is a cell like any other widget.
  // ONE SURFACE (operator 2026-09-23: "not using threads anymore"). The agents ARE the desk: no tab to switch, no
  // thread to create. The constant stays where the tab state was so the rest of the file reads unchanged while the
  // thread machinery is removed piece by piece.
  const sideTab: "chats" | "threads" = "chats";
  const setSideTab = (_t: "chats" | "threads") => { /* there is nothing to switch to */ };
  useTourUnlock("chats", variant === "page" && sideTab === "chats");
  // the desk's tab on the root — the floating agents pill reads it (agents-float.tsx): on chats the
  // bottom-right corner is the composer's chips, so the pill sits in the chat header's free right end
  useEffect(() => { if (variant !== "page") return; document.documentElement.dataset.deskTab = sideTab; return () => { delete document.documentElement.dataset.deskTab; }; }, [variant, sideTab]);
  // the chats themselves (chats-tab.tsx): agent-backed, read-only, with episodes — not the interviewer's sessions
  const chatsTab = useAgentsTab(variant === "page" && sideTab === "chats");
  // WHICH EPISODE IS BEING READ (operator 2026-09-27: "the episodes are clickable they carry the history of the
  // conversation"). `null` is the live conversation, which is the stage's normal state.
  const [readEpisode, setReadEpisode] = useState<number | null>(null);
  const { activeSlug, chatSeed, setChatSeed } = useShell();
  const sessionsQ = useChatSessions();
  const sessions = sessionsQ.data ?? [];
  const [activeId, setActiveId] = useState<number | null>(null);

  const turnsQ = useChatTurns(activeId, true);
  const turns = turnsQ.data ?? [];
  // the session's durable, turn-independent widget/artefact + pinned-context store (retrieve always).
  const sessionWidgetsQ = useSessionWidgets(activeId, true);
  const sessionWidgets: any[] = sessionWidgetsQ.data ?? [];
  // Session totals — sum every reply's cost + tokens for the discrete header line.
  const sessionTotals = useMemo(() => {
    let cost = 0, tok = 0, n = 0;
    for (const t of turns) {
      if (t.ai_cost_usd != null) { cost += Number(t.ai_cost_usd) || 0; n++; }
      tok += (Number(t.ai_tokens_in) || 0) + (Number(t.ai_tokens_out) || 0);
    }
    return { cost, tok, n };
  }, [turns]);
  const [composing, setComposing] = useState("");
  const [sending, setSending] = useState(false);
  // Optimistic echo of the in-flight turn so the message NEVER vanishes on send: shown immediately,
  // cleared once the real turn is refetched, or flipped to an error bubble if the send fails/times out.
  const [pending, setPending] = useState<{ text: string; status: "sending" | "error"; error?: string } | null>(null);
  // The optimistic echo AND the interviewer's reply-LESS early turn row both render the user's message. Show it
  // ONCE: while the echo covers a not-yet-answered matching turn, HIDE that early turn (the echo + its live trace
  // stand in for it) — otherwise the message renders twice until the reply lands. Once the turn has a REAL reply,
  // echoLanded flips → the real turn shows and the echo below is suppressed.
  const _lastTurn = turns[turns.length - 1];
  const _hasReply = (t: any) => !!(t?.interviewer_response_md || t?.presentation_md || t?.content_md);
  const echoMatchesLast = pending?.status === "sending" && !!_lastTurn && String(_lastTurn.user_text ?? "").trim() === pending.text.trim();
  const echoLanded = echoMatchesLast && _hasReply(_lastTurn);
  const visibleTurns = echoMatchesLast && !echoLanded ? turns.slice(0, -1) : turns;
  // COCKPIT Wave 3: pinned model (null = auto). A `cli:` pin (the chat engine — Claude Code / Codex /
  // OpenCode underneath) is remembered across reloads; other pins stay per session as before.
  const [model, setModelState] = useState<string | null>(() => { try { const v = localStorage.getItem("antiloki:chat-engine"); return v && v.startsWith("cli:") ? v : null; } catch { return null; } });
  const setModel = (m: string | null) => { setModelState(m); try { if (m && m.startsWith("cli:")) localStorage.setItem("antiloki:chat-engine", m); else localStorage.removeItem("antiloki:chat-engine"); } catch { /* fine */ } };
  const [debug, setDebug] = useState(false); // COCKPIT Wave 7: per-turn AI-call debug chips
  // composer mode switch. BLOCKS IS RETIRED (operator 2026-09-18: "threads is now very similar to
  // blocks"): antiDesk is Threads; "agent" (the old tile queue) only survives as the drawer's name for
  // the plain chat and maps to threads on the page.
  const [mode, setMode] = useState<"agent" | "threads" | "terminal" | "search">("threads");
  // publish the mode so the dock panel knows when it may ride (vibe/research yes, agent no)
  useEffect(() => { dockStore.set({ chatMode: mode }); }, [mode]);
  // THE DOCK handoff (tabs shell 2026-07-20): a tab clicked on another screen's
  // floating field lands here on mount with its draft — sessionStorage, consumed
  // once. (Enter on the dock never routes here: the dock's OWN panel sends.)
  useEffect(() => {
    try {
      const m = sessionStorage.getItem("antiloki:dock-mode");
      // publish the mode SYNCHRONOUSLY before the key is consumed: the mounting
      // surface's first fetches run before this component's [mode] effect, and
      // demo-mode needs chatMode correct at that instant.
      if (m === "agent" || m === "threads" || m === "terminal" || m === "search") { dockStore.set({ chatMode: m }); setMode(m); sessionStorage.removeItem("antiloki:dock-mode"); }
      const d = sessionStorage.getItem("antiloki:dock-draft");
      if (d) { setComposing(d); sessionStorage.removeItem("antiloki:dock-draft"); }
    } catch { /* storage unavailable — nothing to hand off */ }
    // live tab switches from the dock field while already on "/"
    const h = (e: any) => { const m2 = e?.detail; if (m2 === "agent" || m2 === "threads" || m2 === "terminal" || m2 === "search") setMode(m2); };
    window.addEventListener("antiloki:chat-mode", h);
    // OPEN A THREAD ON REQUEST (2026-09-20: the floating agents bar): `{thread, item}` — the thread
    // becomes active in Threads view and the widget gets the focus. Handed over in sessionStorage when
    // the bar navigated here from another screen (consumed once), live as an event when already here.
    const openReq = (d: any) => { if (d && typeof d.thread === "string") { setMode("threads"); pendingOpen.current = d; setActiveThread(d.thread); } };
    try { const o = sessionStorage.getItem("antiloki:open-thread"); if (o) { sessionStorage.removeItem("antiloki:open-thread"); openReq(JSON.parse(o)); } } catch { /* nothing handed over */ }
    const h2 = (e: any) => openReq(e?.detail);
    window.addEventListener("antiloki:open-thread", h2);
    return () => { window.removeEventListener("antiloki:chat-mode", h); window.removeEventListener("antiloki:open-thread", h2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [confirmingTurnId, setConfirmingTurnId] = useState<number | null>(null);
  const [confirmError, setConfirmError] = useState<{ turnId: number; msg: string } | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLDivElement | null>(null);

  // Live presenter overlay: view_intent/view_data are emitted on the POST /turn
  // response but never persisted on interviewer_turns, so they vanish on reload.
  // Keep them keyed by turn_id and merge into that turn while the session is
  // open, so board/card_detail/table/code widgets render for the just-sent turn.
  const [livePresenter, setLivePresenter] = useState<Record<number, any>>({});
  // Operator-summoned read widgets ("/queue", "/cost", …) + Studio results that couldn't anchor to a turn.
  // afterTurnId = the last turn id when it was created, so they render IN ORDER (interleaved with turns),
  // not piled at the bottom — a widget made before a message stays above that message.
  const [localWidgets, setLocalWidgets] = useState<Array<{ id: string; widget: any; afterTurnId: number | null }>>([]);
  // ONE DOCK (operator 2026-07-26: "the entire screen should be 1 docking area — the queue of
  // widgets docked together just like it was, but one area instead of 3"). The whole page is a
  // single queue of dockables — sessions · instruments · context (optional) · every user widget —
  // ALL open side by side; an item becomes a strip only when the user clicks ITS ▾ ("dont collapse
  // docked widgets unless the user collapse it himself"). ⠿ reorders along the queue. The chat
  // floats in its own translucent overlay dock above the stage.
  type DockState = { items: string[]; collapsed: string[] };
  const DEFAULT_DOCK: DockState = { items: ["sessions", "instruments"], collapsed: [] };
  // THE STAGE IS AN ENVIRONMENT, NOT A DOCUMENT (episodes, 2026-07-27): the dock layout + docked
  // widgets persist GLOBALLY — they do not follow chat sessions. Like an IDE workspace: it changes
  // only when the operator changes it.
  const STAGE_KEY = "antiloki:stage.v1";
  // Only the two lazy initializers below read this, and those run once — but as a bare IIFE it
  // re-read and re-parsed localStorage on EVERY render of the thread.
  // the stage is loaded per workspace (below); nothing global boots here any more
  const stageBoot = useMemo(() => null as any, []);
  const [dock, setDock] = useState<DockState>(() =>
    (stageBoot && Array.isArray(stageBoot.dock?.items))
      ? { items: stageBoot.dock.items.filter((x: any) => typeof x === "string"), collapsed: Array.isArray(stageBoot.dock.collapsed) ? stageBoot.dock.collapsed : [] }
      : DEFAULT_DOCK);
  const [userDocked, setUserDocked] = useState<Record<string, any>>(() =>
    (stageBoot?.userDocked && typeof stageBoot.userDocked === "object") ? stageBoot.userDocked : {}); // uw-<n> → the widget object
  const uwSeq = useRef(0);
  useEffect(() => { // boot: id counter past every restored id; drop stray ids a corrupt store left behind
    for (const k of Object.keys(userDocked)) uwSeq.current = Math.max(uwSeq.current, Number(k.slice(3)) || 0);
    setDock((d) => sanitizeDock(d, userDocked));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // THREADS (operator 2026-09-18: "we don't create categories, we create threads"): named, ordered
  // compositions over the same widget instances. The active thread is the split in Threads view.
  // Blocks view keeps its own tile set (`dock.items`) — the two views are UNWIRED: an instance can be
  // in any number of threads and/or on the Blocks stage; it closes when nothing references it.
  const [threadList, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  // a requested open (the floating agents bar) waiting for the stage to load / the thread to be active
  const pendingOpen = useRef<{ thread: string; item?: string } | null>(null);
  useEffect(() => {
    const req = pendingOpen.current; if (!req || !threadList.length) return;
    if (!threadList.some((t) => t.id === req.thread)) { pendingOpen.current = null; return; }
    if (activeThread !== req.thread) { setActiveThread(req.thread); return; }
    pendingOpen.current = null;
    if (req.item) setTimeout(() => window.dispatchEvent(new CustomEvent("antiloki:focus-widget", { detail: { item: req.item } })), 60);
  }, [threadList, activeThread]);
  const threadSeq = useRef(0);
  const mintThreadId = () => `th-${++threadSeq.current}`;
  // THE STAGE IS PER WORKSPACE (operator 2026-09-17: "antiDesk and Threads didn't reset when switching
  // workspace"): the layout, the docked widgets and the custom categories are stored under the active
  // workspace's name and swapped when it changes. The legacy global key is adopted once, by the first
  // workspace that boots after this change.
  const wsQ = useWorkspaces();
  const wsKey = wsQ.data?.active?.name ?? null;
  const stageKeyFor = (k: string) => `${STAGE_KEY}:${k}`;
  const loadedWs = useRef<string | null>(null);
  const skipSave = useRef(false);
  useEffect(() => {
    if (!wsKey || loadedWs.current === wsKey) return;
    // no adoption of the pre-per-workspace layout: a workspace never inherits another's stage
    let boot: any = null;
    try { const raw = localStorage.getItem(stageKeyFor(wsKey)); if (raw) boot = JSON.parse(raw); } catch { boot = null; }
    const uw = boot?.userDocked && typeof boot.userDocked === "object" ? boot.userDocked : {};
    for (const k of Object.keys(uw)) uwSeq.current = Math.max(uwSeq.current, Number(k.slice(3)) || 0);
    setUserDocked(uw);
    setDock(boot && Array.isArray(boot.dock?.items) ? sanitizeDock({ items: boot.dock.items.filter((x: any) => typeof x === "string"), collapsed: Array.isArray(boot.dock.collapsed) ? boot.dock.collapsed : [] }, uw) : DEFAULT_DOCK);
    // threads — or, once, the old custom categories become threads (their shortcut members, same names)
    let ths: Thread[] = Array.isArray(boot?.threads) ? boot.threads.filter((x: any) => x && typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.items)).map((x: any) => ({ id: x.id, name: x.name, items: x.items.filter((i: any) => typeof i === "string"), aliases: x.aliases && typeof x.aliases === "object" ? x.aliases : undefined, collapsed: x.collapsed && typeof x.collapsed === "object" ? Object.fromEntries(Object.entries(x.collapsed).filter(([, v]) => v === "v" || v === "h")) as Record<string, ThreadStrip> : undefined })) : [];
    if (!ths.length && Array.isArray(boot?.customCats)) ths = boot.customCats.filter((c: any) => typeof c === "string").map((c: string, i: number) => ({ id: `th-m${i + 1}`, name: c, items: Object.entries(uw).filter(([, w]: any) => Array.isArray(w?.payload?.shortcuts) && w.payload.shortcuts.includes(c)).map(([k]) => k) }));
    for (const th of ths) threadSeq.current = Math.max(threadSeq.current, Number(String(th.id).replace(/^th-m?/, "")) || 0);
    setThreads(ths);
    setActiveThread(typeof boot?.activeThread === "string" && ths.some((x) => x.id === boot.activeThread) ? boot.activeThread : ths[0]?.id ?? null);
    loadedWs.current = wsKey;
    skipSave.current = true; // the save effect of THIS commit still holds the pre-load (empty) state — it must not write it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsKey]);
  useEffect(() => {
    if (!wsKey || loadedWs.current !== wsKey) return; // never write one workspace's stage under another's key
    if (skipSave.current) { skipSave.current = false; return; }
    try { localStorage.setItem(stageKeyFor(wsKey), JSON.stringify({ dock, userDocked, threads: threadList, activeThread })); } catch { /* full/blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dock, userDocked, threadList, activeThread, wsKey]);
  // a workspace switch elsewhere in the shell → re-read the active one now, not on the next poll
  useEffect(() => { const h = () => wsQ.refetch?.(); window.addEventListener("antiloki:workspace-changed", h); return () => window.removeEventListener("antiloki:workspace-changed", h); }, [wsQ]);
  const newThread = (items: string[] = [], name?: string) => { const id = mintThreadId(); setThreads((ts) => { let n = ts.length + 1; let nm = name ?? `thread ${n}`; while (ts.some((x) => x.name === nm)) nm = `thread ${++n}`; return [...ts, { id, name: nm, items }]; }); setActiveThread(id); return id; };
  const renameThread = (id: string, to: string) => { const name = to.trim(); if (!name) return; setThreads((ts) => ts.map((x) => (x.id === id ? { ...x, name } : x))); };
  const setThreadItems = (id: string, items: string[]) => setThreads((ts) => ts.map((x) => (x.id === id ? { ...x, items: Array.from(new Set(items)) } : x)));
  const setThreadCollapsed = (id: string, collapsed: Record<string, ThreadStrip>) => setThreads((ts) => ts.map((x) => (x.id === id ? { ...x, collapsed } : x)));
  const aliasInThread = (id: string, alias: string) => { if (!activeThread) return; const v = alias.trim(); setThreads((ts) => ts.map((x) => (x.id === activeThread ? { ...x, aliases: { ...(x.aliases ?? {}), [id]: v } } : x))); };
  // an instance is referenced by the Blocks stage and/or threads; when the last reference goes, it closes
  const referencedElsewhere = (id: string, exceptThread?: string) => dock.items.includes(id) || threadList.some((th) => th.id !== exceptThread && th.items.includes(id));
  const toggleDock = (id: string, c: boolean) => setDock((d) => ({
    ...d, collapsed: c ? [...d.collapsed.filter((x) => x !== id), id] : d.collapsed.filter((x) => x !== id),
  }));
  // summon a PANEL by id (the Studio's "◆ Context box"): appended if absent, always expanded.
  const summonPanel = (id: string) => setDock((d) => ({
    items: d.items.includes(id) ? d.items : [...d.items, id],
    collapsed: d.collapsed.filter((x) => x !== id),
  }));
  // ✕ — a panel undocks; a user widget's slot is DESTROYED (operator 2026-07-26: "only disappears
  // if a destroy button is clicked… it remains in the widget history"). The durable store is untouched.
  const destroySlot = (id: string) => {
    setDock((d) => ({ items: d.items.filter((x) => x !== id), collapsed: d.collapsed.filter((x) => x !== id) }));
    setThreads((ts) => ts.map((th) => (th.items.includes(id) ? { ...th, items: th.items.filter((x) => x !== id) } : th)));
    if (id.startsWith("uw-")) setUserDocked((m) => { const n = { ...m }; delete n[id]; return n; });
  };
  // CLOSING AN AGENT (operator 2026-09-16): a CLI-agent widget's ✕ first inspects its box — merge /
  // discard / keep — and only then leaves the dock. Everything else destroys the slot at once.
  const [closingAgent, setClosingAgent] = useState<{ id: string; widget: any } | null>(null);
  const closeDockable = (id: string) => {
    const w = id.startsWith("uw-") ? userDocked[id] : null;
    if (w?.kind === "vibe-pane" && CLI_KINDS.has(String((w.payload as any)?.paneKind ?? ""))) { setClosingAgent({ id, widget: w }); return; }
    destroySlot(id);
  };
  // a thread's ⊟ / a deleted thread: drop the reference; the instance closes only when nothing else holds it
  const setThreadItemsOrDrop = (threadId: string, items: string[]) => {
    const th = threadList.find((x) => x.id === threadId); if (!th) return;
    const gone = th.items.filter((x) => !items.includes(x));
    setThreadItems(threadId, items);
    for (const id of gone) if (id !== "chat" && !referencedElsewhere(id, threadId)) closeDockable(id);
  };
  const deleteThread = (id: string) => {
    const th = threadList.find((x) => x.id === id); if (!th) return;
    setThreads((ts) => ts.filter((x) => x.id !== id));
    if (activeThread === id) setActiveThread(threadList.find((x) => x.id !== id)?.id ?? null);
    for (const item of th.items) if (item !== "chat" && !referencedElsewhere(item, id)) closeDockable(item);
  };
  // a widget's stable identity — the persisted uid when it has one, else its render key. Used to
  // guarantee the SAME widget is never docked twice (operator 2026-07-25): re-docking one that's
  // already in a zone MOVES it there instead of duplicating it.
  // ONE WIDGET BESIDE THE CHAT (operator 2026-09-23: "was suppose to open in split screen … at least 1 per time",
  // and "do not show them in the chat inside"). A pick from the Studio opens here, in the right half of a vertical
  // split, and a second pick replaces it. The surface that owns the conversation owns the split too — an earlier
  // attempt routed this through a window event to whichever chat pane claimed the front, and hidden agent panes
  // kept claiming it. Nothing is addressed to a pane any more; there is one split, and this is it.
  const [chatSplit, setChatSplit] = useState<ChatWidget | null>(null);
  // EVERY widget that reaches the chat opens here, not only a Studio pick: ▶ preview raises a run cell through this
  // same path, and gating on an explicit `split` flag made that button look dead — it saved the pane setting and
  // then had nowhere to draw. One widget at a time; a new one replaces whatever is open.
  const raiseIntoChat = (widget: any, opts?: { why?: string; split?: boolean }) => {
    if (!widget?.kind) return;
    setChatSplit({ id: `cs-${Date.now().toString(36)}`, seq: Date.now(), t: Date.now(),
      title: widgetWord(String(widget.kind)), widget, why: opts?.why });
  };
  const widgetIdentity = (w: any) => String((w?.payload as any)?._uid ?? w?.key ?? `${w?.kind}:${JSON.stringify(w?.payload ?? null)}`);
  // dock = append at the LAST position, expanded (operator 2026-07-26: generated widgets land
  // docked). Re-docking one already in the queue MOVES it to the end — never a duplicate. The side
  // argument is kept for caller compatibility (pills, ui-bus) and ignored: there is one dock now.
  // WHERE A NEW WIDGET LANDS (2026-09-18): Blocks view → the tile queue, as always. Threads view →
  // the target thread (`{thread:"new"}` opens one around it; a thread id adds to it; nothing → the
  // active thread, or a new one when there is none). Never both.
  const dockWidget = (_side: "left" | "right", widget: any, target?: AddTarget, opts?: { split?: boolean; raise?: boolean }) => {
    const ident = widgetIdentity(widget);
    const existing = Object.entries(userDocked).find(([, w]) => widgetIdentity(w) === ident)?.[0];
    const id = existing ?? `uw-${++uwSeq.current}`;
    if (!existing) setUserDocked((m) => ({ ...m, [id]: widget }));
    // the widget goes into the CONVERSATION — a card in the agent's chat, with a `split` button on it. There is no
    // thread to put it in and no dock to queue it on (operator 2026-09-23: "not using threads anymore").
    if (opts?.raise !== false) raiseIntoChat(widget, { split: opts?.split });
    if (mode === "threads") return;
    setDock((d) => ({ items: [...d.items.filter((x) => x !== id), id], collapsed: d.collapsed.filter((x) => x !== id) }));
  };
  // live ⠿ reorder along the queue — collapse state is id-keyed, so it just rides along.
  const reorderDock = (dragId: string, overId: string, before: boolean) => setDock((d) => {
    if (dragId === overId || !d.items.includes(dragId) || !d.items.includes(overId)) return d;
    const rest = d.items.filter((x) => x !== dragId);
    const i = rest.indexOf(overId) + (before ? 0 : 1);
    const items = [...rest.slice(0, i), dragId, ...rest.slice(i)];
    return items.join("\u0000") === d.items.join("\u0000") ? d : { ...d, items };
  });
  // dock_move — the AI's "position N": N counts among the DOCKED WIDGETS (panels keep their
  // interleaved spots); clamped, deterministic.
  const moveDockTo = (id: string, pos: number) => setDock((d) => {
    if (!d.items.includes(id)) return d;
    const rest = d.items.filter((x) => x !== id);
    const uwSlots = rest.map((x, i) => ({ x, i })).filter((e) => e.x.startsWith("uw-"));
    const clamped = Math.max(1, Math.min(Math.round(pos) || 1, uwSlots.length + 1));
    const insertAt = clamped <= uwSlots.length ? uwSlots[clamped - 1].i : rest.length;
    const items = [...rest.slice(0, insertAt), id, ...rest.slice(insertAt)];
    return { ...d, items };
  });
  const destroyAllWidgets = () => {
    setDock((d) => ({ items: d.items.filter((x) => !x.startsWith("uw-")), collapsed: d.collapsed.filter((x) => !x.startsWith("uw-")) }));
    setUserDocked({});
  };


  // A globally-unique token per "New chat" so finding the just-created session can't collide with an
  // OLD one. The previous monotonic counter reset to 0 on every reload, so "New chat" reused #1/#2/…
  // and matched a session from a prior load → "new chat opened an old session". A random token can't.
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [pendingFresh, setPendingFresh] = useState(false);
  const chatIdentifier = useMemo(
    () => (sessionToken ? `${getFeSession()}#${sessionToken}` : getFeSession()),
    [sessionToken],
  );

  // Auto-open a session on FIRST mount only; never override a later selection. activeId only returns to
  // null via newSession (which sets pendingFresh — handled above), so a background sessions refetch can
  // no longer reset the session the user explicitly clicked.
  const didInitialSelect = useRef(false);
  useEffect(() => {
    if (activeId != null || sessions.length === 0) return;
    if (pendingFresh) {
      const fresh = sessions.find((s: any) => s.user_identifier === chatIdentifier);
      if (fresh) { setActiveId(fresh.id); setPendingFresh(false); }
      return;
    }
    if (!didInitialSelect.current) { didInitialSelect.current = true; setActiveId(sessions[0].id); }
  }, [sessions, activeId, pendingFresh, chatIdentifier]);

  const [refs, setRefs] = useState<TrayRef[]>([]);
  // the @ CONTEXT WIZARD (operator 2026-07-15): a window overlay replaced the anchored popup.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refKey = (r: TrayRef) =>
    r.kind === "card" ? `card:${r.slug}`
      : r.kind === "knowledge" ? `knowledge:${r.docId}`
        : r.kind === "code_file" ? `code_file:${r.path}`
          : r.kind === "source" ? `source:${r.source}`
            : r.kind === "attachment" ? `attachment:${r.docId}`
              : `db_row:${r.table}:${r.id}`;

  // multi-add: the wizard stays open; the trailing "@" that summoned it is stripped once.
  const addRef = (r: TrayRef) => {
    setRefs((prev) => (prev.some((p) => refKey(p) === refKey(r)) ? prev : [...prev, r]));
    setComposing((c) => (c.endsWith("@") ? c.slice(0, -1) : c));
  };

  const removeRef = (key: string) => setRefs((prev) => prev.filter((p) => refKey(p) !== key));

  const closePicker = () => {
    setPickerOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      if (res) addRef({ kind: "attachment", docId: res.document_id, label: res.title || res.vault_path });
    } finally {
      setUploading(false);
    }
  };

  const [discuss, setDiscuss] = useState<{ slug: string; field: string | null } | null>(null);
  const [discussThread, setDiscussThread] = useState<{ role: "you" | "ai"; text: string; cost?: number }[]>([]);

  // Opening a session lands on its most recent message, unconditionally — a thread you just opened
  // has no reading position to preserve.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeId]);

  // After that, follow the conversation only while the operator is ALREADY at the bottom. Scrolling
  // up to re-read something used to be undone by the next turn or poll, which yanked the view back
  // down mid-sentence. The threshold is generous so "near enough to the bottom" still follows.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= 120) el.scrollTop = el.scrollHeight;
  }, [turns.length, discussThread.length, localWidgets.length, pending]);

  const runDiscuss = async (
    slug: string,
    field: string | null,
    opts?: { operation?: DiscussOperation; question?: string },
  ) => {
    if (sending) return;
    setSending(true);
    const operation = opts?.operation;
    const question = opts?.question?.trim() || undefined;
    const asked =
      question ??
      (operation && field
        ? `${operation[0].toUpperCase()}${operation.slice(1)} the “${field}” field.`
        : field
          ? `Discuss the “${field}” field.`
          : "Explain this card.");
    setDiscussThread((prev) => [...prev, { role: "you", text: asked }]);
    try {
      const { references, attachments } = buildRefPayload(refs);
      const r = await sendCardDiscuss(slug, question, field ?? undefined, operation, references, attachments);
      setDiscussThread((prev) => [...prev, {
        role: "ai",
        text: r?.answer_md || "(no answer produced)",
        cost: r?.cost_usd,
      }]);
    } catch (e: any) {
      setDiscussThread((prev) => [...prev, { role: "ai", text: `discuss failed: ${e?.message || "error"}` }]);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!chatSeed) return;
    const { cardSlug, field, compose } = chatSeed;
    setChatSeed(null);
    if (!cardSlug && compose) {
      setDiscuss(null);
      setComposing(compose);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (!cardSlug) return;
    const fld = field ?? null;
    setDiscuss({ slug: cardSlug, field: fld });
    setDiscussThread([]);
    setComposing("");
    if (!fld) runDiscuss(cardSlug, null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [chatSeed, setChatSeed]);

  const exitDiscuss = () => {
    setDiscuss(null);
    setDiscussThread([]);
  };

  // ✦ NEW TOPIC (episodes, 2026-07-27): the only IMPOSED boundary. With turns on the table it
  // rotates (consolidate + snapshot + meta row); on an empty episode it is a no-op ceremony, and
  // the legacy eager-create path only serves the very first boot (no session at all).
  const newSession = (opts?: { force?: boolean }) => {
    if (sending) return;
    exitDiscuss();
    setPickerOpen(false);
    setComposing("");
    setPending(null);
    requestAnimationFrame(() => inputRef.current?.focus());
    if (activeId != null && turns.length > 0) {
      void rotateEpisode("you marked a new topic", consolidateEpisode());
      return;
    }
    // an empty episode is a fresh topic already — except when the operator explicitly asks for a new
    // session from the Threads list (2026-09-17): then a new episode row appears at once
    if (activeId != null && !opts?.force) return;
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setSessionToken(token);
    void (async () => {
      try {
        const id = await createChatSession(`${getFeSession()}#${token}`);
        if (id != null) { setPendingFresh(false); setActiveId(id); sessionsQ.refetch?.(); return; }
      } catch { /* fall through */ }
      setPendingFresh(true);
    })();
  };

  // ── EPISODES (2026-07-27): boundaries are DERIVED, priority marker > 4h gap > size rotation —
  // every one deterministic, every one printed in the journal ("episode opened — 9h gap").
  const EP_GAP_MIN = 240, EP_PAUSE_MIN = 20, EP_SOFT_TURNS = 60, EP_HARD_TURNS = 120;
  const rotationReason = (): string | null => {
    if (activeId == null || turns.length === 0) return null;
    const lastTs = Date.parse(String((turns[turns.length - 1] as any)?.ts ?? ""));
    const gapMin = Number.isFinite(lastTs) ? (Date.now() - lastTs) / 60000 : 0;
    if (gapMin >= EP_GAP_MIN) return `${Math.round(gapMin / 60)}h gap`;
    if (turns.length >= EP_HARD_TURNS) return `rotated at ${turns.length} turns`;
    if (turns.length >= EP_SOFT_TURNS && gapMin >= EP_PAUSE_MIN) return `rotated at ${turns.length} turns, after a ${Math.round(gapMin)}m pause`;
    return null;
  };
  // deterministic consolidation — the closed episode's tail, compacted. This snapshot is the
  // rolling context the NEXT episode's envelope grounds on (the book-import wave pattern applied
  // to our own conversation). No AI, no cost; a gated one-line title can come later.
  const consolidateEpisode = (): string => {
    const L: string[] = [`episode #${activeId} · ${turns.length} turns`];
    for (const t of turns.slice(-8) as any[]) {
      const q = String(t.user_text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
      const a = String(t.interviewer_response_md ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (q) L.push(`- you: ${q}${a ? ` → loki: ${a}` : ""}`);
    }
    return L.join("\n").slice(0, 1800);
  };
  // ⛨ THE SENTINEL REPORT (operator 2026-07-27: "each episode should have a deterministic summary
  // of what was done there"). v1 is pure arithmetic over the episode's own rows — turns, cost,
  // models, widgets by kind, artefacts, dispatches. The sentinel agent will later author richer
  // reports into the SAME 'episode-report' row; the journal renders whatever the row holds.
  const sentinelReport = () => {
    let cost = 0, dispatched = 0;
    const models = new Set<string>();
    for (const t of turns as any[]) {
      cost += Number(t.ai_cost_usd ?? 0) || 0;
      const m = String(t.model_id ?? "").split("/").pop();
      if (m) models.add(m);
      try { const d = JSON.parse(t.dispatched_action_ids_json ?? "null"); if (Array.isArray(d) && d.length) dispatched += 1; } catch { /* row predates the field */ }
    }
    const kinds = new Map<string, number>();
    let widgets = 0, artifacts = 0;
    for (const w of sessionWidgets as any[]) {
      if (w.kind === "session-context" || w.kind === "episode-meta" || w.kind === "episode-report") continue;
      if (w.type === "artifact") { artifacts += 1; continue; }
      widgets += 1;
      kinds.set(String(w.kind), (kinds.get(String(w.kind)) ?? 0) + 1);
    }
    const widget_kinds = [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
    // the chapter's own opening line — so the report tells the story even with no successor snapshot
    const first = (turns as any[]).find((t: any) => String(t?.user_text ?? "").trim());
    const story = first ? String(first.user_text).replace(/\s+/g, " ").trim().slice(0, 96) : null;
    return { turns: turns.length, cost_usd: Math.round(cost * 10000) / 10000, models: [...models].slice(0, 3), widgets, widget_kinds, artifacts, dispatched, story };
  };
  const rotateEpisode = async (reason: string, prior_md: string): Promise<number | null> => {
    const fromId = activeId;
    const report = sentinelReport(); // computed BEFORE the switch — from the closing episode's rows
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setSessionToken(token);
    let newId: number | null = null;
    try { newId = await createChatSession(`${getFeSession()}#${token}`); } catch { /* endpoint down */ }
    if (newId == null) return null; // can't rotate — keep talking in the current episode
    try { await saveTurnWidget({ session_id: newId, turn_id: null, type: "widget", kind: "episode-meta", payload: { reason, from_session_id: fromId, prior_md } }); } catch { /* best-effort */ }
    if (fromId != null) { // the report lives ON the closed episode — its consolidated snapshot's receipt
      try { await saveTurnWidget({ session_id: fromId, turn_id: null, type: "widget", kind: "episode-report", payload: report }); } catch { /* best-effort */ }
      // ⛨ the sentinel authors the richer account in the background (one gated low-tier call).
      // Its row supersedes the deterministic one (newest wins); the timeline re-reads on the signal.
      void consolidateEpisodeRemote(fromId).then(() => episodeReportLanded(fromId)).catch(() => { /* the deterministic row already landed */ });
    }
    setLocalWidgets([]);
    contextLoadedFor.current = null;
    lastSavedCtx.current = "";
    setActiveId(newId);
    sessionsQ.refetch?.();
    return newId;
  };
  // ⛨ THE SENTINEL'S LIVE WATCH — deterministic flags on the live episode; shown under the
  // timeline's ● now beat and published into the screen manifest so the assistant sees them too.
  const liveFlags = useMemo(() => sentinelFlags(turns), [turns]);
  useEffect(() => {
    reportScreenState("sentinel", liveFlags.length ? `sentinel flags: ${liveFlags.map((f) => f.text).join(" · ")}` : null);
    return () => reportScreenState("sentinel", null);
  }, [liveFlags]);
  // the ACTIVE episode's meta row — its opening reason (printed at the divider) and the previous
  // episode's snapshot (sent with every turn as {{prior_episode}}).
  const episodeMeta = useMemo(() => {
    let m: any = null;
    for (const w of sessionWidgets) if (w?.kind === "episode-meta") m = w; // asc → last wins
    try { return m ? JSON.parse(m.payload_json ?? "null") : null; } catch { return null; }
  }, [sessionWidgets]);

  const onConfirmTurn = async (turnId: number, confirmationText: string) => {
    if (confirmingTurnId != null) return;
    setConfirmingTurnId(turnId);
    setConfirmError(null);
    try {
      const res = await confirmInterviewerTurn(turnId, confirmationText);
      if (!res.ok) setConfirmError({ turnId, msg: res.error || "dispatch failed" });
      await sessionsQ.refetch?.();
      await turnsQ.refetch?.();
    } finally {
      setConfirmingTurnId(null);
    }
  };

  // ✂/⤢ IN-PLACE REWRITE (operator 2026-07-15): system.turn.rewrite rewrites ONE reply for display —
  // the turn row is never mutated, so ↩ original is always available. Keyed by turn id; display-only
  // (lost on reload, like discuss rewrites).
  const [rewrites, setRewrites] = useState<Record<number, { op: RewriteOperation; md: string | null; cost?: number; error?: string; showOriginal: boolean }>>({});
  const [rewriteBusy, setRewriteBusy] = useState<string | null>(null); // "12:simplify" while in flight
  const onRewrite = async (turnId: number, op: RewriteOperation) => {
    if (rewriteBusy) return;
    setRewriteBusy(`${turnId}:${op}`);
    try {
      const r = await sendTurnRewrite(turnId, op);
      if (r?.answer_md) setRewrites((prev) => ({ ...prev, [turnId]: { op, md: r.answer_md, cost: r.cost_usd, showOriginal: false } }));
      else setRewrites((prev) => ({ ...prev, [turnId]: { op, md: null, error: "rewrite failed — the model returned nothing (check the BE / tier keys)", showOriginal: true } }));
    } catch (e: any) {
      setRewrites((prev) => ({ ...prev, [turnId]: { op, md: null, error: e?.message || "rewrite failed", showOriginal: true } }));
    } finally {
      setRewriteBusy(null);
    }
  };
  const toggleRewrite = (turnId: number) =>
    setRewrites((prev) => (prev[turnId] ? { ...prev, [turnId]: { ...prev[turnId], showOriginal: !prev[turnId].showOriginal } } : prev));

  // STUDIO RESULT DURABILITY (operator 2026-07-15): a generated widget/artifact is anchored to the
  // turn that grounded it (interviewer_turn_widgets) — the refetch re-renders it from the DB, so it
  // survives reload. Returns false when persistence isn't possible (no turn / endpoint down) and the
  // caller falls back to the old ephemeral display.
  // SESSION-SCOPED persist: keyed on the SESSION (activeId), so it saves even with no turn yet (a fresh
  // chat). turnId is an optional render-order hint. Retrievable always via the session widgets store.
  const persistStudioResult = async (turnId: number | null | undefined, r: any, opts?: { dock?: boolean; target?: AddTarget; split?: boolean; raise?: boolean }): Promise<boolean> => {
    if (r == null || activeId == null) return false; // need a session (created eagerly on New chat)
    const type: "widget" | "artifact" = r.type === "artifact" ? "artifact" : "widget";
    const kind = String(r.kind ?? (type === "artifact" ? "artifact" : "")).trim();
    const payload = type === "artifact" ? { item: r.item } : r.payload;
    if (!kind || payload == null) return false;
    try {
      const res = await saveTurnWidget({ session_id: activeId, turn_id: turnId ?? lastTurnId ?? null, type, kind, payload });
      if (!res?.ok) return false;
      await Promise.all([turnsQ.refetch?.(), sessionWidgetsQ.refetch?.()]);
      // AUTO-DOCK (operator 2026-07-26): every freshly generated widget lands docked at the LAST
      // position. Built with the same key/_uid the store row renders with, so its identity matches
      // the instruments rail (dock-from-rail later moves it instead of duplicating). The auto-heal
      // flush passes dock:false — re-persisting an old rail widget must not re-summon it on stage.
      if (opts?.dock !== false && type === "widget" && kind !== "session-context") {
        const rowId = (res as any)?.id;
        const uid = rowId != null ? `${kind.replace(/[^\w]+/g, "-")}-w${rowId}` : null;
        dockWidget("right", rowId != null
          ? { kind, key: `sw-${rowId}`, payload: { ...(payload ?? {}), _uid: uid } }
          : { kind, key: `dock-${Date.now().toString(36)}`, payload }, opts?.target, { split: opts?.split, raise: opts?.raise });
      }
      return true;
    } catch { return false; }
  };

  // ⊞ COMPOSER STUDIO (operator 2026-07-15: the Studio lives in the composer, not under every reply).
  // conv = the last replied turn; results persist onto that turn (fallback: thread-bottom localWidgets).
  const [composerStudio, setComposerStudio] = useState(false);
  const [studioFocus, setStudioFocus] = useState<StudioFocus>(null); // the Threads "+" opens the Studio on one category
  const agentTargetRef = useRef<AddTarget | undefined>(undefined); // the agent card is async: remember where its pane should land
  const seats = useSeats();
  const [agentCard, setAgentCardRaw] = useState<{ /** none named = the card opens on the serve's own pick (useSeats().defaultKey) - never a fixed Claude */ engine?: AgentEngine; ask?: string; scope?: string[]; fixed?: boolean; recipe?: AgentRecipe; /** the Studio tile it came from — DeepSeek · Kimi · Qwen carry a model and a theme */ base?: BaseAgent } | null>(null);
  // AGENT RECIPES (operator 2026-09-20): the operator's own agents — tiles in the Studio's agents section
  const [recipes, setRecipes] = useState<AgentRecipe[]>([]);
  const [recipeWizard, setRecipeWizard] = useState<false | AgentRecipe | "new">(false);
  // a role arrives fully configured by the benchmark, so its wizard asks the three things only it can't know
  const [recipeBrief, setRecipeBrief] = useState(false);
  // the recipes are the active workspace's — re-read when it changes (a switch must not carry another workspace's agents over)
  const { data: wsForRecipes } = useWorkspaces();
  const wsRoot = wsForRecipes?.active?.root_path ?? null;
  useEffect(() => { void listRecipes().then(setRecipes); }, [wsRoot]);
  // MERGED WINNERS (operator 2026-09-23: "the merge agents on studio should have a different category called Merged
  // Winners"): the first-place merge of every job, from the benchmarks — a tile each, stamped with the job
  const mergeRows: MergeRowLite[] = useMergesLite(true).data?.rows ?? [];
  const [makingWinner, setMakingWinner] = useState<string | null>(null);
  // THE ROLES (operator 2026-09-23: "agents that do multiple jobs under a category") — the serve owns the list and,
  // per role, the merge that won on THAT kind of work under each of the three objectives
  const [roles, setRoles] = useState<RoleWithMerges[]>([]);
  useEffect(() => { void fetchRoles().then((r) => setRoles(r.roles)); }, [wsRoot]);
  const [winnerErr, setWinnerErr] = useState<{ job: string; msg: string } | null>(null);
  // a bare engine = opened from that engine's own tile: the engine is settled, the card shows no chooser
  const setAgentCard = (v: AgentEngine | { engine: AgentEngine; ask?: string; scope?: string[]; fixed?: boolean } | null) => setAgentCardRaw(typeof v === "string" ? { engine: v, fixed: true } : v);
  // A WIDGET OPENS THE AGENT CARD (operator 2026-09-18: Design › Frames "send the change to an agent in a
  // thread"): `antiloki:agent-card` {engine?, ask, scope?} → the card, prefilled, landing in a NEW thread.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      agentTargetRef.current = { thread: d.thread && d.thread !== "new" ? String(d.thread) : "new" };
      setAgentCardRaw({ engine: agentCardEngine(d.engine), ask: typeof d.ask === "string" ? d.ask : undefined, scope: Array.isArray(d.scope) ? d.scope.map(String) : undefined });
    };
    window.addEventListener("antiloki:agent-card", h);
    return () => window.removeEventListener("antiloki:agent-card", h);
  }, []);
  // THE AGENT CARD: engine · scope · ask → one thread
  // RENAME a docked user widget (✎): the name lives on the widget payload, so it persists with the
  // stage (localStorage + the session's stage record) and shows in the dock, Threads and the rail.

  const lastConv = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t: any = turns[i];
      const reply = t.interviewer_response_md ?? t.content_md ?? t.presentation_md ?? "";
      if (reply) return { request: t.user_text ?? "", response: reply, turnId: t.id as number };
    }
    return { request: "", response: "", turnId: null as number | null };
  }, [turns]);
  // SESSION PERSISTENCE (operator 2026-07-25: "store everything — the widgets, the artifacts, the current
  // context — in the right db"). A session row exists only once it has a turn, so the LAST turn (replied or
  // not) is always a valid anchor. persistOrLocal writes the generated widget/artifact to
  // interviewer_turn_widgets (state.sqlite, via system.turn.widget.save) so a reloaded session re-renders
  // it; it falls back to the ephemeral thread-bottom rail only when there is genuinely no turn yet.
  const lastTurnId = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) { const id = (turns[i] as any)?.id; if (id != null) return id as number; }
    return null as number | null;
  }, [turns]);
  const persistOrLocal = (r: any, target?: AddTarget, opts?: { split?: boolean }) => {
    const anchor = lastTurnId; // capture the timeline position now, so the fallback renders in order
    const key = `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const widget = r?.type === "artifact"
      ? { kind: "artifact", key, payload: { item: r.item } }
      : { kind: r?.kind, key, payload: r?.payload };
    // OPEN IT NOW (operator 2026-09-23: "when i click on a widget has a big delay, investigate"). The click used to
    // wait on persistStudioResult — a save, then TWO refetches of the session — before anything appeared, because
    // that is where the widget reached the screen. It opens first and the save follows: the board it opens on is
    // derived from the kind (widget-ids.ts), so the durable row and this one are the same board either way, and
    // the later dock is told not to raise a second copy.
    if (r?.type !== "artifact") raiseIntoChat(widget, { split: opts?.split });
    void (async () => {
      if (await persistStudioResult(anchor, r, { target, split: opts?.split, raise: false })) return;
      if (widget.kind) {
        setLocalWidgets((prev) => [...prev, { id: key, widget, afterTurnId: anchor }]);
        if (r?.type !== "artifact") dockWidget("right", widget, target, { split: opts?.split, raise: false });
      }
    })();
    // the timeline notes it (the chat does not, in Threads)
    const label = r?.type === "artifact" ? String(r?.item?.title ?? "artefact") : r?.kind === "vibe-pane" ? paneDisplay(String(r?.payload?.paneKind ?? "")).name : String(r?.kind ?? "widget").replace(/^atlas-|^vibe-/, "");
    noteTimeline(r?.type === "artifact" ? "saved" : "opened", label);
  };
  const onComposerStudioResult = (r: any) => {
    setComposerStudio(false);
    // a LAYOUT action, not a widget: "◆ Context box" docks the optional context panel (left side).
    if (r?.type === "dock" && typeof r.dockId === "string") { summonPanel(r.dockId); return; }
    // an AGENT: the Studio hands over to the agent card (engine · scope · ask) instead of a bare pane
    if (r?.type === "agent-card") { setAgentCardRaw({ engine: agentCardEngine(r.engine), fixed: true, base: r.base && typeof r.base === "object" ? r.base : baseAgent(r.engine) }); return; }
    persistOrLocal(r);
  };
  // save any widget's output as an artefact into the session — reuses the persist+fallback path, so it
  // lands on the session's last turn (durable, on the artefacts rail) or the thread-bottom rail.
  const saveArtifact = (item: any) => persistOrLocal({ type: "artifact", kind: "artifact", item });

  // one ephemeral widget/artefact — the save FAILED (or no session yet), so it is honestly labeled as
  // not-persisted instead of silently masquerading as saved (operator 2026-07-25: widgets "disappear on
  // reload" — they were living here). The dominant cause of landing here: the BE running an old build.
  const renderLocalWidget = (lw: { id: string; widget: any }) => (
    <div key={lw.id} style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: C.warn, fontFamily: '"JetBrains Mono", monospace' }} title="the save to the session store failed — this widget will NOT survive a reload. If this keeps happening, restart the BE (it needs the session-persistence routes).">⚠ not saved · {lw.widget.kind === "artifact" ? "artefact" : lw.widget.kind}</span>
        <button onClick={() => setLocalWidgets((prev) => prev.filter((w) => w.id !== lw.id))} title="dismiss" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 12 }}>✕</button>
      </div>
      <WidgetHost widget={lw.widget} ctx={{ variant, collapsible: true, onSaveArtifact: saveArtifact, onDockWidget: dockWidget, chatSessionId: activeId, sessionBrief }} />
    </div>
  );

  // AUTO-HEAL the ephemeral rail: a "⚠ not saved" widget exists only because its save failed at the
  // moment of generation. Whenever a session is active, retry each one ONCE per session-load — on
  // success it moves into the durable store and leaves the rail (so pre-restart leftovers self-repair).
  const flushTried = useRef<Set<string>>(new Set());
  useEffect(() => { flushTried.current = new Set(); }, [activeId]);
  useEffect(() => {
    if (activeId == null || !localWidgets.length) return;
    for (const lw of localWidgets) {
      if (flushTried.current.has(lw.id)) continue;
      flushTried.current.add(lw.id);
      const w = lw.widget;
      const r = w.kind === "artifact" ? { type: "artifact", kind: "artifact", item: w.payload?.item } : { type: "widget", kind: w.kind, payload: w.payload };
      void persistStudioResult((lw as any).afterTurnId ?? null, r, { dock: false }).then((ok) => {
        if (ok) setLocalWidgets((prev) => prev.filter((x) => x.id !== lw.id));
      });
    }
  }, [activeId, localWidgets]); // eslint-disable-line react-hooks/exhaustive-deps

  // PERSISTED session-level widgets/artefacts (turn_id null — generated before/without a message). They
  // load from the durable session store and render at the top of the thread. Turn-anchored persisted ones
  // render under their turn (studio_widgets), so they're excluded here.
  const sessionLevelWidgets = useMemo(() => {
    const out: { id: string; widget: any }[] = [];
    for (const w of sessionWidgets) {
      if (w.turn_id != null || w.kind === "session-context" || w.kind === "episode-meta" || w.kind === "episode-report") continue;
      let payload: any = null; try { payload = JSON.parse(w.payload_json ?? "null"); } catch { /* corrupt */ }
      // _uid = family + identity — shown on the card, matches the digest's # token.
      const uid = `${String(w.kind).replace(/[^\w]+/g, "-")}-w${w.id}`;
      out.push({ id: `sw-${w.id}`, widget: { kind: w.type === "artifact" ? "artifact" : w.kind, key: `sw-${w.id}`, payload: { ...(payload ?? {}), _uid: uid } } });
    }
    return out;
  }, [sessionWidgets]);
  const renderSessionWidget = (sw: { id: string; widget: any }) => (
    <div key={sw.id} style={{ marginBottom: 8 }}>
      <WidgetHost widget={sw.widget} ctx={{ variant, collapsible: true, onSaveArtifact: saveArtifact, onDockWidget: dockWidget, chatSessionId: activeId, sessionBrief }} />
    </div>
  );

  // CONTEXT + LAYOUT PERSISTENCE — the session's pinned @ context AND its dock arrangement (zones +
  // user-docked widgets) travel WITH the session (operator 2026-07-25: "docking positions saved per
  // session on the db"). One 'session-context' row in the session widget store carries
  // { refs, zones, userDocked }; restored when the session reopens; never renders as a widget.
  const contextLoadedFor = useRef<number | null>(null);
  const skipNextCtxSave = useRef(false);
  const lastSavedCtx = useRef<string>(""); // serialized snapshot of the last write — dedups redundant saves
  // when the active session changed — a fetch older than this is the PREVIOUS session's data.
  const switchedAt = useRef(0);
  useEffect(() => { switchedAt.current = Date.now(); }, [activeId]);
  // context is NOT obligatory (closable, docked on demand from the Studio) but stays a KNOWN dockable.
  const OBLIGATORY_IDS = ["sessions", "instruments"];
  const OPTIONAL_IDS = ["context"];
  // a stored layout is DATA — sanitize before adopting: drop unknown ids, dedupe, re-seat missing
  // obligatory panels, clamp the open index. A corrupt row can never wedge the page.
  const sanitizeDock = (d: any, uw: Record<string, any>): DockState => {
    const known = new Set([...OBLIGATORY_IDS, ...OPTIONAL_IDS, ...Object.keys(uw)]);
    const seen = new Set<string>();
    const raw = Array.isArray(d?.items) ? d.items : [];
    const items: string[] = raw.filter((x: any) => typeof x === "string" && known.has(x) && !seen.has(x) && (seen.add(x), true));
    for (const id of OBLIGATORY_IDS) if (!seen.has(id)) items.push(id);
    const collapsed: string[] = (Array.isArray(d?.collapsed) ? d.collapsed : []).filter((x: any) => typeof x === "string" && items.includes(x));
    return { items, collapsed };
  };
  const layoutSnapshot = () => JSON.stringify({ refs });
  useEffect(() => {
    // RESTORE once per session, after its widget store has actually loaded (lastSuccessAt proves a real
    // fetch settled). Never clears on a miss: a brand-new session keeps the context the user is already
    // using (selectSession resets on an explicit switch).
    if (activeId == null) { contextLoadedFor.current = null; return; }
    if (contextLoadedFor.current === activeId || sessionWidgetsQ.lastSuccessAt == null) return;
    // OWNERSHIP GUARDS (operator bug 2026-07-25: "new chat shows the previous session's docked widgets"):
    // across a session switch the poll still holds the PREVIOUS session's data until the new fetch lands —
    // restoring from it dragged another session's layout/context in here (and then SAVED it here).
    // 1) time: only trust a fetch that settled AFTER the switch (covers the stale-EMPTY store too);
    // 2) rows: every row must belong to THIS session (rows carry session_id).
    if (sessionWidgetsQ.lastSuccessAt <= switchedAt.current) return;
    if (sessionWidgets.some((w: any) => w?.session_id != null && Number(w.session_id) !== activeId)) return;
    contextLoadedFor.current = activeId;
    let latest: any = null;
    for (const w of sessionWidgets) if (w?.kind === "session-context") latest = w; // rows are asc → last wins
    let p: any = null;
    if (latest) { try { p = JSON.parse(latest.payload_json ?? "null"); } catch { /* corrupt row — ignore */ } }
    if (p && (Array.isArray(p.refs) || p.dock || p.zones || p.userDocked)) {
      skipNextCtxSave.current = true;
      if (Array.isArray(p.refs)) setRefs(p.refs);
      // MIGRATION ONLY (stage-global, 2026-07-27): a legacy per-session layout is adopted once,
      // when the global stage is still virgin — after that, stored layouts are ignored (the stage
      // is an environment; it does not follow sessions).
      const stageVirgin = Object.keys(userDocked).length === 0 && dock.items.every((x) => OBLIGATORY_IDS.includes(x));
      if (stageVirgin && (p.userDocked || p.dock || p.zones || p.dockCol)) {
        const seenIdent = new Set<string>();
        const uw = (p.userDocked && typeof p.userDocked === "object")
          ? Object.fromEntries(Object.entries(p.userDocked).filter(([k, v]: any) => {
              if (!k.startsWith("uw-") || !v || !v.kind) return false;
              const ident = widgetIdentity(v);
              if (seenIdent.has(ident)) return false;
              seenIdent.add(ident);
              uwSeq.current = Math.max(uwSeq.current, Number(k.slice(3)) || 0);
              return true;
            }))
          : {};
        setUserDocked(uw);
        let dk: DockState | null = null;
        if (p.dock && Array.isArray(p.dock.items)) {
          const collapsed = Array.isArray(p.dock.collapsed) ? p.dock.collapsed
            : Number.isInteger(p.dock.open) ? p.dock.items.filter((_: any, i: number) => i !== p.dock.open) : [];
          dk = sanitizeDock({ items: p.dock.items, collapsed }, uw);
        } else if (p.zones || Array.isArray(p.dockCol)) {
          const legacy = (["left", "center", "right"] as const).flatMap((k) => (Array.isArray(p.zones?.[k]?.items) ? p.zones[k].items : []));
          const col = Array.isArray(p.dockCol) ? p.dockCol.filter((x: any) => !legacy.includes(x)) : [];
          dk = sanitizeDock({ items: [...legacy, ...col], collapsed: [] }, uw);
        }
        if (dk) setDock(dk);
      }
      lastSavedCtx.current = JSON.stringify({ refs: Array.isArray(p.refs) ? p.refs : refs });
    } else lastSavedCtx.current = layoutSnapshot(); // nothing stored → current state is the baseline
  }, [activeId, sessionWidgets, sessionWidgetsQ.lastSuccessAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // SAVE (debounced) when the context OR the dock layout genuinely CHANGES — session-scoped (no turn
    // needed), never the restore echo, never before restore, never a no-op (dedup on the snapshot).
    if (skipNextCtxSave.current) { skipNextCtxSave.current = false; lastSavedCtx.current = layoutSnapshot(); return; }
    if (activeId == null || contextLoadedFor.current !== activeId) return;
    const ser = layoutSnapshot();
    if (ser === lastSavedCtx.current) return;
    const h = setTimeout(() => { void saveTurnWidget({ session_id: activeId, turn_id: lastTurnId, type: "widget", kind: "session-context", payload: { refs } }).then(() => { lastSavedCtx.current = ser; sessionWidgetsQ.refetch?.(); }).catch(() => { /* best-effort */ }); }, 800);
    return () => clearTimeout(h);
  }, [refs, activeId, lastTurnId]); // eslint-disable-line react-hooks/exhaustive-deps
  // context is per-session: an explicit switch clears the tray, then the restore effect loads the target's.
  // an explicit switch resets EVERYTHING session-scoped — including the ephemeral rail (operator
  // 2026-07-25: unsaved widgets were following the user into other sessions).
  // an explicit switch (the legacy dropdown) still exists, but the STAGE persists — only the
  // conversation-scoped things reset (context tray, ephemeral rail).
  const selectSession = (id: number) => { setPendingFresh(false); setRefs([]); setLocalWidgets([]); contextLoadedFor.current = null; lastSavedCtx.current = ""; setActiveId(id); };

  // the session's referable intelligence (#): sourced from the DURABLE session store, one entry per
  // widget instance. uid = FAMILY + IDENTITY ("<kind>-w<row id>") — the exact token the BE digest lists,
  // so the model resolves the reference to this precise widget. Two of the same family stay distinct.
  const sessionRefables = useMemo(() => {
    const nice = (k: string) => k.replace(/^atlas-|^vibe-/, "").replace(/-/g, " ").trim();
    const out: { refId: string; label: string; kind: string; type: string }[] = [];
    const labelN = new Map<string, number>();
    const add = (refId: string, type: string, kind: string, title?: string) => {
      if (!kind || kind === "session-context" || kind === "episode-meta" || kind === "episode-report") return;
      let label = type === "artifact" ? (title || "artefact") : nice(kind);
      const n = (labelN.get(label) ?? 0) + 1; labelN.set(label, n);
      if (n > 1) label = `${label} ${n}`; // disambiguate identical instances in the list
      out.push({ refId, label, kind, type });
    };
    for (const w of sessionWidgets) {
      if (w.kind === "session-context") continue;
      let title: string | undefined;
      if (w.type === "artifact") { try { title = JSON.parse(w.payload_json ?? "null")?.item?.title; } catch { /* */ } }
      add(`${String(w.kind).replace(/[^\w]+/g, "-")}-w${w.id}`, w.type, w.kind, title);
    }
    for (const lw of localWidgets) {
      const wk = lw.widget?.kind;
      add(lw.id, wk === "artifact" ? "artifact" : "widget", wk, wk === "artifact" ? lw.widget?.payload?.item?.title : undefined);
    }
    return out;
  }, [sessionWidgets, localWidgets]);

  // a short brief of THIS chat session — CLI panes get it as their box's context (mission/extra prompt).
  const sessionBrief = useMemo(() => {
    const L: string[] = [`You are an inline pane of antiDesk session #${activeId ?? "?"}.`];
    if (refs.length) L.push(`Pinned context: ${refs.map((r) => trayLabel(r)).join(", ")}`);
    const wl = sessionRefables.slice(0, 12).map((s) => `${s.label} (#${s.refId})`);
    if (wl.length) L.push(`Session widgets/artefacts: ${wl.join(", ")}`);
    return L.join("\n").slice(0, 2000);
  }, [activeId, refs, sessionRefables]);

  // the automatic context's picks per turn, and the session's pins/drops
  const [usedByTurn, setUsedByTurn] = useState<Record<string, UsedPick[]>>({});
  const [ctxPrefs, setCtxPrefs] = useState<{ pins: string[]; drops: string[] }>({ pins: [], drops: [] });
  useEffect(() => { setUsedByTurn(readUsed(activeId)); setCtxPrefs(readContextPrefs(activeId)); }, [activeId]);
  const sendText = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setPendingUi(null); // a new message supersedes any unconfirmed UI offer
    setPending({ text: content, status: "sending" }); // echo immediately so it can't vanish
    try {
      const { references, attachments } = buildRefPayload(refs);
      // SCREEN MANIFEST (operator 2026-07-26): serialize what's on stage RIGHT NOW — layout, docked
      // widgets (live lines when they publish), the instruments rail, live agent panes — so the AI
      // sees what the user sees. Deterministic, capped, no vision.
      const screenMd = (() => {
        try {
          const label = (id: string) => (id.startsWith("uw-") && userDocked[id] ? `#${widgetUid(userDocked[id])}` : id);
          const isCollapsed = (id: string) => dock.collapsed.includes(id);
          const docked = dock.items.filter((id) => id.startsWith("uw-") && userDocked[id])
            .map((id) => ({ zone: isCollapsed(id) ? "collapsed strip" : "open", w: userDocked[id] }));
          return composeScreenManifest({
            stage: dock.items.map((id) => (isCollapsed(id) ? `${label(id)} (collapsed)` : label(id))),
            docked,
            instruments: [...sessionLevelWidgets, ...localWidgets].map((x: any) => x.widget).filter(Boolean),
            extra: STAGE_ACTIONS, // the LOCAL tier this screen publishes (two-tier hands, 2026-07-26)
          });
        } catch { return ""; }
      })();
      // EPISODE BOUNDARY (derived, printed): rotation happens BEFORE the send, so this turn lands
      // in the fresh episode and carries the closed one's snapshot as rolling context.
      let sendSession = activeId;
      let priorMd: string | null = typeof episodeMeta?.prior_md === "string" ? episodeMeta.prior_md : null;
      const boundary = rotationReason();
      if (boundary) {
        const snap = consolidateEpisode();
        const nid = await rotateEpisode(boundary, snap);
        if (nid != null) { sendSession = nid; priorMd = snap; }
      }
      // ANTICHAT'S AUTOMATIC CONTEXT: the serve's retriever picks the agents' chats, the runs and the intel the ask
      // needs (deterministic, capped; nothing when nothing matches) — it rides in front of the screen manifest
      const auto = await fetchAutoContext(content, activeId);
      const autoUsed: UsedPick[] = auto.used;
      const screenWithAuto = withAutoContext(screenMd, auto.md);
      const resp: any = await sendChatTurn(content, chatIdentifier, references, attachments, model, sendSession, screenWithAuto, priorMd);
      // A 404 IS NOT AN ANSWER EITHER (audit 2026-09-28). `apiGet`/`apiPost` resolve a MISSING ROUTE to the
      // truthy `__not_wired` sentinel, which sailed past `resp == null`: `resp.turn_id` was undefined, the
      // refetch found nothing, and the optimistic echo was then cleared — the operator's typed message vanished
      // with no error anywhere. The error text below was written for exactly this and never fired for it.
      if (resp == null || isNotWired(resp) || !(resp as any)?.turn_id) {
        // apiPost swallows aborts/errors to null — surface it instead of dropping the message.
        setPending({
          text: content, status: "error",
          error: "No response — the request timed out or the model didn't reply. Check the BE is up and the tier's OpenRouter model + key are valid, or pin a model in the composer.",
        });
        return;
      }
      // what the retriever attached, kept by turn for the chips under the reply
      if (resp?.turn_id != null && autoUsed.length) { noteUsed(sendSession ?? activeId, resp.turn_id, autoUsed); setUsedByTurn((m) => ({ ...m, [String(resp.turn_id)]: autoUsed })); }
      // Stash the live presenter view (not persisted) so view widgets render.
      if (resp?.turn_id && resp?.view_intent) {
        setLivePresenter((prev) => ({
          ...prev,
          [resp.turn_id]: { view_intent: resp.view_intent, view_data: resp.view_data ?? null, dispatch_results: resp.dispatch_results ?? null },
        }));
      }
      // UI COMMAND BUS (operator 2026-07-26: "show a button for confirmation before do it") —
      // commands are OFFERED, never auto-executed; the ✓ click is the consent.
      if (Array.isArray(resp?.ui_commands) && resp.ui_commands.length) setPendingUi(resp.ui_commands.slice(0, 4));
      await sessionsQ.refetch?.();
      await turnsQ.refetch?.();
      setPending(null); // the real turn is now loaded → drop the echo
    } catch (e: any) {
      setPending({ text: content, status: "error", error: `send failed: ${e?.message || "error"}` });
    } finally {
      setSending(false);
    }
  };

  // the pending UI commands awaiting the user's ✓ (the consent gate)
  const [pendingUi, setPendingUi] = useState<UiCommand[] | null>(null);
  // UI bus listeners this thread can honor: summon a palette widget, dock a manifest widget.
  React.useEffect(() => {
    const h = (e: any) => {
      const d = e?.detail ?? {};
      if (d.verb === "summon" && typeof d.command === "string") {
        const w = parseWidgetCommand(d.command);
        if (w) persistOrLocal({ type: "widget", kind: w.kind, payload: w.payload });
      }
      // THE LINKED PREVIEW (2026-09-21): the agent's ▶ preview button — on: a `run` cell pinned to that pane joins
      // its thread and boots the worktree's dev server; off: the cell linked to that pane is closed
      // THE PREVIEW FOLLOWS THE AGENT YOU ARE LOOKING AT (operator 2026-09-28: "preview is not wired to the
      // worktree agent. When i switch between the agents tabs the preview stayed the same").
      //
      // The split slot is surface-global and the target was baked into the widget payload at the moment ▶ preview
      // was pressed, so switching tabs left the old agent's dev server on screen beside the new agent's chat. The
      // ▶ button's own lit state IS per-pane, which is what made it look wired: the button flipped while the
      // iframe did not. The pane announces itself on mount now, and an open preview re-points at it.
      //
      // Re-pointing only. Whether it BOOTS is still that pane's own `autoboot` setting, so following a tab never
      // starts a dev server the operator did not ask for.
      if (d.verb === "preview-follow" && Number.isFinite(Number(d.pane))) {
        const to = Number(d.pane);
        setChatSplit((cur) => {
          const w: any = cur?.widget;
          if (!cur || w?.kind !== "vibe-pane" || Number(w?.payload?.linked) === to) return cur;
          return { ...cur, widget: { ...w, payload: { ...w.payload, linked: to, settings: { ...(w.payload?.settings ?? {}), target_pane: to } } } };
        });
        return;
      }
      // EACH AGENT HAS ITS OWN PREVIEW (operator 2026-09-28: "each agent should have its own active or deactive status
      // for preview", "i switched agents, and correctly switched the preview, but didn't re-boot on the new"). The
      // split slot is one per screen, so a pane that comes up says what ITS preview is: on → the slot shows this
      // pane's dev server and boots it; off → a preview left over from another agent is taken off the screen.
      if (d.verb === "preview-sync" && Number.isFinite(Number(d.pane))) {
        const to = Number(d.pane);
        if (d.on) {
          setChatSplit({ id: `cs-${Date.now().toString(36)}`, seq: Date.now(), t: Date.now(), title: widgetWord("vibe-pane"),
            widget: { kind: "vibe-pane", payload: { paneKind: "run", linked: to, title: typeof d.title === "string" ? d.title : "preview", settings: { target_pane: to, autoboot: true } } } } as any);
        } else {
          setChatSplit((cur) => { const w: any = cur?.widget; return cur && w?.kind === "vibe-pane" && w?.payload?.paneKind === "run" ? null : cur; });
        }
        return;
      }
      if (d.verb === "preview" && Number.isFinite(Number(d.pane))) {
        const linked = Number(d.pane);
        const existing = Object.entries(userDocked).find(([, w]: any) => w?.kind === "vibe-pane" && Number(w?.payload?.linked) === linked);
        if (d.on) persistOrLocal({ type: "widget", kind: "vibe-pane", payload: { paneKind: "run", linked, title: typeof d.title === "string" ? d.title : "preview", settings: { target_pane: linked, autoboot: true } } }, activeThread ? { thread: activeThread } : undefined, { split: true });
        if (!d.on) {
          if (existing) closeDockable(existing[0]);
          // ▶ preview off must also take the cell off the SCREEN (operator 2026-09-23: "i unclicked preview and it
          // didn't close the preview widget"). Undocking used to be the same thing as closing; since the widget
          // lives beside the chat in its own slot, that slot has to be cleared by hand.
          setChatSplit((cur) => (cur && Number((cur.widget as any)?.payload?.linked) === linked ? null : cur));
        }
      }
      if (d.verb === "dock" && d.uid) {
        const all = [...sessionLevelWidgets, ...localWidgets].map((x: any) => x.widget).filter(Boolean);
        const w = all.find((x: any) => widgetUid(x) === d.uid) ?? Object.values(userDocked).find((x: any) => widgetUid(x) === d.uid);
        if (w) dockWidget(d.side === "left" ? "left" : "right", w);
      }
      if (d.verb === "close_widget" && d.uid) {
        const entry = Object.entries(userDocked).find(([, w]) => widgetUid(w) === d.uid);
        if (entry) closeDockable(entry[0]); // destroys the slot; the fullscreen page closes via widget-host's own listener
      }
      if (d.verb === "dock_move" && d.uid) {
        const entry = Object.entries(userDocked).find(([, w]) => widgetUid(w) === d.uid);
        if (entry) moveDockTo(entry[0], Number(d.pos) || 1);
      }
      if (d.verb === "close_all_widgets") destroyAllWidgets();
    };
    window.addEventListener("antiloki:ui", h as any);
    return () => window.removeEventListener("antiloki:ui", h as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLevelWidgets, localWidgets, userDocked, activeThread]);

  const focusComposer = (prefill?: string) => {
    if (prefill != null) setComposing(prefill);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // rawText is the LIVE serialization from the composer (chips already inlined as #tw-<id>(Label)/@Label
  // tokens) — passed on Enter so a fast keystroke can never send a stale/empty string and lose the message.
  const onSend = async (rawText?: string) => {
    const content = (rawText ?? composing).trim();
    if (!content || sending) return;
    if (discuss) {
      setComposing("");
      await runDiscuss(discuss.slug, discuss.field, { question: content });
      return;
    }
    // Slash palette: a recognized "/widget" summons a local read panel instead
    // of sending an interviewer turn.
    const summoned = parseWidgetCommand(content);
    if (summoned) {
      setComposing("");
      // durable: a summoned read widget ("/queue", "/cost", …) is persisted onto the session too, so it
      // survives reload like any other generated widget (falls back to the thread rail if there's no turn).
      persistOrLocal({ type: "widget", kind: summoned.kind, payload: summoned.payload });
      return;
    }
    setComposing("");
    await sendText(content);
  };

  const ctxHandlers = {
    onConfirm: onConfirmTurn,
    onPickOption: sendText,
    onAsk: sendText,
    onWriteMyself: () => focusComposer(),
    onRephrase: () => focusComposer(),
    onRewrite,
    rewriteBusy,
    onPersistStudioResult: persistStudioResult,
    onSaveArtifact: saveArtifact,
    onDockWidget: dockWidget,
    chatSessionId: activeId,
    sessionBrief,
  };

  const isPage = variant === "page";
  const colMax = isPage ? 820 : "none";

  const header = (
    <div style={{
      height: 44, padding: "0 14px", display: "flex", alignItems: "center", gap: 10,
      borderBottom: `1px solid ${C.border}`,
      fontFamily: '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace', fontSize: 11,
      color: C.dim, flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: colMax, margin: isPage ? "0 auto" : undefined }}>
        <span style={{ color: C.fg }}>chat</span>
        <span>·</span>
        <span>{activeSlug?.slug ?? "—"}</span>
        {!isPage && sessions.length > 1 && (
          <select
            value={activeId ?? ""}
            onChange={(e) => { const v = e.target.value; if (!v) { newSession(); return; } selectSession(Number(v)); }}
            style={{ background: "transparent", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 6px", fontSize: 11 }}
          >
            {/* a fresh, unsaved session has no DB row yet (it's created on the first message) — show it now so
                the picker reflects "you're in a new chat" instead of looking like nothing's selected. */}
            {(pendingFresh || activeId == null) && <option value="">+ New chat (unsaved)</option>}
            {sessions.map((s: any) => (
              <option key={s.id} value={s.id}>{s.title ?? `session #${s.id}`}</option>
            ))}
          </select>
        )}
        <div style={{ flex: 1 }} />
        {/* export the WHOLE session — every turn, AI call, widget + its data, artefact — in order */}
        {activeId != null && turns.length > 0 && (
          <button
            onClick={() => downloadChatMarkdown(buildChatMarkdown({ sessionId: activeId, session: sessions.find((s: any) => s.id === activeId) ?? null, turns, sessionWidgets, refs, trayLabel }), activeId)}
            title="export the complete chat as Markdown — turns, AI calls, screening, dispatches, widgets with data, artefacts — the whole flow in order"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5 }}
          >⬇ md</button>
        )}
        {!isPage && (
          <button
            onClick={() => newSession()}
            disabled={sending}
            title="start a new chat session"
            style={{
              background: "transparent", border: `1px solid ${C.border}`,
              color: C.brand, borderRadius: 4, padding: "2px 8px",
              cursor: sending ? "wait" : "pointer", fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11, opacity: sending ? 0.6 : 1,
            }}
          >+ new</button>
        )}
        {onRequestClose && (
          <button
            onClick={onRequestClose}
            style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}
          >✕</button>
        )}
      </div>
    </div>
  );

  const body = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, flex: 1 }}>
      {/* Modes change the whole surface (operator): Terminal → a terminal, DeepSearch → a
          federated-search console. Agent = the normal thread. Page only; the drawer stays chat. */}
      {isPage && mode === "terminal" ? (
        <CockpitView mode={mode} setMode={setMode} />
      ) : isPage && mode === "search" ? (
        <NotebooksView mode={mode} setMode={setMode} />
      ) : (
        <>
      {/* On the full Chat page the header is dropped (operator: the chat name is in the sidebar);
          the drawer keeps it. This also removes the debug toggle from the page. */}
      {!isPage && header}

      {discuss && (
        <div style={{
          padding: "6px 14px", display: "flex", alignItems: "center", gap: 8,
          borderBottom: `1px solid ${C.border}`,
          background: C.panel,
          fontFamily: '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace', fontSize: 11,
          color: C.dim, flexShrink: 0,
        }}>
          <span>discussing</span>
          <strong style={{ color: C.fg }}>{discuss.slug}</strong>
          {discuss.field && <span>· field “{discuss.field}”</span>}
          <div style={{ flex: 1 }} />
          <button
            onClick={exitDiscuss}
            title="exit discuss mode"
            style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 13 }}
          >✕</button>
        </div>
      )}

      {discuss?.field && (
        <div style={{
          padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
          borderBottom: `1px solid ${C.border}`,
          fontFamily: '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace', fontSize: 11,
          color: C.dim, flexShrink: 0,
        }}>
          <span style={{ color: C.muted }}>rewrite:</span>
          {(["expand", "summarize", "simplify"] as DiscussOperation[]).map((op) => (
            <button
              key={op}
              disabled={sending}
              onClick={() => runDiscuss(discuss.slug, discuss.field, { operation: op })}
              title={`${op} this field's content (read-only — copy back yourself)`}
              style={{
                background: C.panel2, color: C.dim,
                border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px",
                cursor: sending ? "wait" : "pointer", fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11, opacity: sending ? 0.6 : 1,
              }}
            >{op}</button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ color: C.muted }}>display-only</span>
        </div>
      )}

      <div ref={scrollerRef} style={{ flex: 1, overflow: "auto", padding: 14, fontFamily: '-apple-system, system-ui, sans-serif', fontSize: 13, color: C.fg }}>
        <div style={{ width: "100%", maxWidth: colMax, margin: isPage ? "0 auto" : undefined }}>
          {!discuss && sessionTotals.n > 0 && (
            <div title="session totals — sum of every reply's cost + tokens"
              style={{ textAlign: "center", color: C.muted, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, padding: "0 0 10px", opacity: 0.85 }}>
              session · ${sessionTotals.cost.toFixed(4)} · {fmtTok(sessionTotals.tok)} tok · {sessionTotals.n} {sessionTotals.n === 1 ? "reply" : "replies"}
            </div>
          )}
          {/* THE JOURNAL (episodes, 2026-07-27) — mounted ABOVE the turns conditional: a freshly
              opened (empty) live episode must still show the stitched articles + the boundary
              divider. This was the "clicked and nothing opened" bug: the blocks lived inside the
              has-turns branch, and a 0-turn live episode rendered only the empty-state. */}
          {!discuss && (
            <>
              {episodeMeta?.reason && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 12px" }}>
                  <span style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9.5, color: C.brand, letterSpacing: 0.8, flexShrink: 0 }}>✦ episode opened — {String(episodeMeta.reason)}</span>
                  <span style={{ flex: 1, height: 1, background: C.border }} />
                </div>
              )}
            </>
          )}
          {discuss ? (
            discussThread.length === 0 ? (
              <Empty hint={discuss.field
                ? "Pick expand / summarize / simplify above, or type an instruction to rewrite this field’s content."
                : "Asking the AI…"} />
            ) : (
              discussThread.map((m, i) => (
                <Bubble
                  key={i}
                  text={m.text}
                  who={m.role === "you" ? "you" : `discuss${m.cost != null ? ` · $${m.cost.toFixed(4)}` : ""}`}
                  isHuman={m.role === "you"}
                />
              ))
            )
          ) : pendingFresh ? (
            pending ? null : <Empty hint="New session — type below to begin." />
          ) : sessionsQ.notWired ? (
            <EndpointStub endpoint="/api/v1/sessions" />
          ) : sessionsQ.loading && sessions.length === 0 ? (
            <Skeleton />
          ) : sessionsQ.error && sessions.length === 0 ? (
            // Without this branch an unreachable engine falls through to the welcome hero and reads
            // as "no sessions yet" — so the operator types a first message into a screen that then
            // fails. `error` is transient (the poll keeps retrying), unlike notWired.
            <Unreachable what="your chat sessions" onRetry={() => void sessionsQ.refetch()} />
          ) : sessions.length === 0 && turns.length === 0 ? (
            isPage ? <PageWelcome onPick={(s) => { setComposing(s); requestAnimationFrame(() => inputRef.current?.focus()); }} />
              : <Empty hint="No chat sessions yet. Type below to start one." />
          ) : turnsQ.notWired ? (
            <EndpointStub endpoint={`/api/v1/sessions/${activeId}/turns`} />
          ) : turnsQ.error && turns.length === 0 ? (
            <Unreachable what="this session's messages" onRetry={() => void turnsQ.refetch()} />
          ) : turns.length === 0 && localWidgets.length === 0 && sessionLevelWidgets.length === 0 ? (
            <Empty hint="No turns in this session yet." />
          ) : (
            <>
              {/* PERSISTED session-level widgets (generated before/without a message) + ephemeral pre-turn ones —
                  not in Threads (operator 2026-09-17): there the sidebar lists them and the timeline notes them */}
              {mode !== "threads" && sessionLevelWidgets.map(renderSessionWidget)}
              {mode !== "threads" && localWidgets.filter((w) => w.afterTurnId == null).map(renderLocalWidget)}
              {/* each turn, followed by the ephemeral widgets created right after it — so the timeline is
                  chronological (a widget made before a later message stays above that message). */}
              {visibleTurns.map((t: any, i: number) => (
                <React.Fragment key={t.id ?? i}>
                  <Turn
                    t={livePresenter[t.id] ? { ...t, ...livePresenter[t.id] } : t}
                    isLast={i === visibleTurns.length - 1}
                    confirming={confirmingTurnId === t.id}
                    error={confirmError && confirmError.turnId === t.id ? confirmError.msg : null}
                    ctxHandlers={ctxHandlers}
                    variant={variant}
                    debug={debug}
                    rewrite={rewrites[t.id] ?? null}
                    onToggleRewrite={() => toggleRewrite(t.id)}
                    used={usedByTurn[String(t.id)] ?? null}
                    ctxPrefs={ctxPrefs}
                    onContextPref={(ref: string, st: "pin" | "drop" | "off") => { const next = setContextPref(ctxPrefs, ref, st); setCtxPrefs(next); writeContextPrefs(activeId, next); }}
                  />
                  {mode !== "threads" && localWidgets.filter((w) => w.afterTurnId === t.id).map(renderLocalWidget)}
                </React.Fragment>
              ))}
            </>
          )}

          {/* Show the echo until the REAL turn (same user_text) lands with a reply (echoLanded). Until then the
              reply-less early turn is hidden (visibleTurns) so the message isn't duplicated; here the echo carries it. */}
          {!discuss && pending && !echoLanded && (
            <div style={{ marginBottom: 14 }}>
              <Bubble text={pending.text} who="you" isHuman />
              {/* the message bubble above is unconditional — it can NEVER vanish. The live trace is the thinking
                  indicator (it renders "⚙ thinking…" synchronously and streams the steps as they land). */}
              {pending.status === "sending"
                ? <TraceTrail live />
                : <Bubble text={`⚠ ${pending.error}`} who="error" />}
            </div>
          )}

          {/* orphans — an ephemeral widget whose anchor turn isn't currently in view (safety net) */}
          {mode !== "threads" && localWidgets.filter((w) => w.afterTurnId != null && !visibleTurns.some((t: any) => t.id === w.afterTurnId)).map(renderLocalWidget)}
        </div>
      </div>

      {/* the UI CONSENT GATE (operator 2026-07-26: "show a button for confirmation before do it") —
          the assistant's screen commands land HERE and run only on the ✓ click. All verbs are $0. */}
      {pendingUi && pendingUi.length > 0 && (
        <div style={{ margin: "0 10px 6px", maxWidth: colMax === "none" ? undefined : colMax, alignSelf: "center", width: colMax === "none" ? "calc(100% - 20px)" : "100%", border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, background: `color-mix(in oklab, ${C.brand} 7%, ${C.panel})`, borderRadius: 10, padding: "6px 11px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8, flexShrink: 0 }}>⚡ the assistant wants to</span>
          <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, flex: 1, minWidth: 140 }}>{pendingUi.map(describeUiCommand).join("   ·   ")}</span>
          <button onClick={() => { executeUiCommands(pendingUi); setPendingUi(null); }}
            style={{ background: C.brand, border: "none", color: C.bg, borderRadius: 7, padding: "3px 15px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700 }}>✓ do it</button>
          <button onClick={() => setPendingUi(null)}
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 7, padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>✕</button>
        </div>
      )}

      <Composer
        colMax={colMax}
        isPage={isPage}
        refs={refs}
        refKey={refKey}
        removeRef={removeRef}
        trayLabel={trayLabel}
        sessionRefables={sessionRefables}
        onOpenPicker={() => setPickerOpen(true)}
        uploading={uploading}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
        composing={composing}
        setComposing={setComposing}
        inputRef={inputRef}
        onSend={onSend}
        sending={sending}
        discuss={discuss}
        model={model}
        setModel={setModel}
        mode={mode}
        setMode={setMode}
      />

      {/* @ the context wizard — a window for assembling the turn's grounding (multi-add). */}
      {pickerOpen && (
        <ContextWizard
          refs={refs}
          refKey={refKey}
          trayLabel={trayLabel}
          addRef={addRef}
          removeRef={removeRef}
          uploading={uploading}
          onUploadClick={() => fileInputRef.current?.click()}
          onClose={closePicker}
          model={model}
          setModel={setModel}
        />
      )}

      {/* ⊞ the conversation-level Studio — on the page it mounts at stage level (the fab), so it
          survives the chat dock being collapsed; this in-body mount serves the drawer variant. */}
      {composerStudio && !isPage && (
        <StudioOverlay conv={lastConv} onClose={() => setComposerStudio(false)} onResult={onComposerStudioResult} onOpenVibe={() => { setComposerStudio(false); setMode("terminal"); }} />
      )}
        </>
      )}
    </div>
  );

  // EVERYTHING IS A WIDGET (operator 2026-07-25): on the full Chat page the layout is three DOCK
  // ZONES; every piece — sessions · context · the CHAT itself · widgets rail · artefacts rail · any
  // user-docked widget — is a dockable item (obligatory ones move/collapse, never close). The drawer
  // variant and vibe/search modes stay single-surface.
  const zoneItem = (id: string): ZoneItem => {
    if (id === "sessions") return { id, label: "timeline", category: "workspace", obligatory: true, fixed: 380, render: () => (
      <ChatHistorySidebar frameless hideContext sessions={sessions} activeId={activeId} liveTurnCount={turns.length} liveFlags={liveFlags} onNew={newSession} busy={sending}
        refs={refs} refKey={refKey} trayLabel={trayLabel} removeRef={removeRef} sessionRefables={sessionRefables} onOpenPicker={() => setPickerOpen(true)} />
    ) };
    // context is OPTIONAL now — closable; dock it back from the Studio ("◆ Context box").
    if (id === "context") return { id, label: "context", category: "workspace", fixed: 380, render: () => (
      <ContextBox refs={refs} refKey={refKey} trayLabel={trayLabel} removeRef={removeRef} onOpenPicker={() => setPickerOpen(true)} sessionRefables={sessionRefables} />
    ) };
    if (id === "chat") return { id, label: "chat", category: "chat", obligatory: true, bare: true, render: () => body };
    // INSTRUMENTS — the widgets + artefacts rails merged into ONE panel, divided inside. Lists EVERYTHING
    // the session owns: turn-anchored (via turns) + session-level persisted (the durable store — these
    // were missing: the rail showed empty for fresh-session widgets) + the ephemeral not-yet-saved ones.
    if (id === "instruments") return { id, label: "instruments", category: "workspace", obligatory: true, fixed: 380, render: () => (
      <WidgetsSidebar frameless turns={turns} localWidgets={[...sessionLevelWidgets, ...localWidgets]} onSaveArtifact={saveArtifact} chatSessionId={activeId} sessionBrief={sessionBrief} />
    ) };
    const w = userDocked[id];
    // pane widgets dock under the AGENT'S name (✦ Claude Code) — never a generic "vibe pane".
    const wLabel = !w ? id
      : (w.payload as any)?.title ? String((w.payload as any).title) // renamed by the operator (✎)
      : w.kind === "vibe-pane" ? paneDisplay(String((w.payload as any)?.paneKind ?? "")).name
      : w.kind === "design-view" ? (ATLAS_DESIGN.find((d) => d.kind === `design-view:${designTabOf((w.payload as any)?.tab)}`)?.label ?? "Design")
      : w.kind === "design-frames" ? "Frames"
      : String(w.kind).replace(/^atlas-|^vibe-/, "").replace(/-/g, " ");
    // THREADS categories: code agents → Agents; other panes → antiVibe; atlas widgets → antiIDE; the rest → widgets
    const pk = w?.kind === "vibe-pane" ? String((w.payload as any)?.paneKind ?? "") : "";
    // the category is the CATALOG's word for the kind (operator 2026-09-17: "shared diff opens under a
    // custom category" — it has no vibe-/atlas- prefix; membership, not prefixes, decides)
    const category = !w ? "widgets" : w.kind === "vibe-pane" ? (CLI_KINDS.has(pk) ? "agents" : "tools") : TOOL_KINDS.has(String(w.kind)) ? "tools" : DESIGN_KINDS.has(String(w.kind)) ? "design" : IDE_KINDS.has(String(w.kind)) || String(w.kind).startsWith("atlas-") ? "codebase" : "widgets";
    return {
      id, label: wLabel, uid: w ? widgetUid(w) : null, category, kind: w ? (w.kind === "vibe-pane" ? `vibe-pane:${pk}` : w.kind === "design-view" ? `design-view:${(w.payload as any)?.tab ?? "system"}` : String(w.kind)) : undefined,
      subagentsKey: category === "agents" && w?.payload?.sessionId != null && w?.payload?.paneId != null ? subagentKey(Number(w.payload.sessionId), Number(w.payload.paneId)) : undefined,
      closeTitle: "destroy — it leaves the dock; it remains in the instruments history",
      render: () => (w ? <WidgetHost widget={w} ctx={{ variant: "page", onSaveArtifact: saveArtifact, chatSessionId: activeId, sessionBrief }} /> : null),
    };
  };
  const threads = mode === "threads" || mode === "agent";
  // INSTRUMENTS AS TIMELINE NODES (operator 2026-09-17: "merge timeline and instruments"): every generated
  // widget / artefact of this session is a node on your lane; opening one docks it (a widget) or shows it
  const instrumentNodes = React.useMemo(() => {
    const out: { t: number; label: string; kind: string; open: () => void }[] = [];
    const tOf = (x: any, fallback: number) => { const v = Date.parse(String(x?.created_at ?? x?.ts ?? "").replace(" ", "T")); return Number.isFinite(v) ? v : fallback; };
    const labelOf = (w: any) => (w?.kind === "artifact" ? String(w?.payload?.item?.title ?? "artefact") : w?.kind === "vibe-pane" ? paneDisplay(String(w?.payload?.paneKind ?? "")).name : String(w?.kind ?? "widget").replace(/^atlas-|^vibe-/, ""));
    let seq = 0;
    for (const sw of [...sessionLevelWidgets, ...localWidgets] as any[]) { const w = sw?.widget ?? sw; if (!w?.kind) continue; out.push({ t: tOf(sw, Date.now() - 1000 * (++seq)), label: labelOf(w), kind: String(w.kind), open: () => { if (w.kind !== "artifact") dockWidget("right", w); else saveArtifact(w.payload?.item); } }); }
    for (const t of turns as any[]) for (const w of (Array.isArray(t?.studio_widgets) ? t.studio_widgets : [])) { let widget: any = null; try { widget = { kind: w.kind, payload: JSON.parse(w.payload_json ?? "{}") }; } catch { widget = null; } if (!widget?.kind) continue; out.push({ t: tOf(t, Date.now() - 1000 * (++seq)), label: labelOf(widget), kind: String(widget.kind), open: () => { if (widget.kind !== "artifact") dockWidget("right", widget); } }); }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLevelWidgets, localWidgets, turns]);
  // antiChat's sessions (episodes) for the Threads sidebar — newest first, the live one on top
  const hm = (s: any) => { const d = new Date(String(s ?? "").replace(" ", "T")); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""; };
  // THE CATALOG for the Threads sidebar — every kind, by category; + opens one (agents → the agent card)
  // A TOOL'S DATA OUTLIVES ITS WINDOW — see widget-ids.ts for why this is derived and not minted.
  const mint = (kind: string) => widgetIds(kind);
  // A ROLE OPENS ALREADY DECIDED. Its merge is whatever the benchmark measured on its domain for the objective —
  // never the wizard's placeholder, which is what produced agents labelled "Claude · the job's model × OpenCode ·
  // the job's model" and broke the roster's layout. With nothing measured the pair stays unset: the router then
  // binds per job, which is the honest answer, not an invented pair.
  const openRole = (r: RoleWithMerges, objective?: Objective) => {
    const measured = (o: string) => { const m = r.merges?.find((x) => x.objective === o); return m && (m.brain || m.hands) ? m : null; };
    const o = objective ?? (OBJECTIVES.find((x) => measured(x)) as Objective | undefined);
    const m = o ? measured(o) : null;
    const side = (k: string | null | undefined) => (k ? sideFromKey(k) : null);
    const brain = side(m?.brain), hands = side(m?.hands);
    setRecipeBrief(true);
    setRecipeWizard({
      ...blankRecipe(seats?.defaultKey),
      name: objective ? `${r.name} · ${objective}` : r.name,
      description: r.about, scope: [...r.globs], skills: [...r.skills], specialists: [...r.specialists], ask: "",
      // a side nobody measured is the other side - never a fixed Claude or the Zen gateway (review 2026-10-01)
      ...(brain || hands ? { provider: (brain ?? hands)!.engine, pair: { name: `${r.key}${o ? `-${o}` : ""}`, brain: (brain ?? hands)!, hands: (hands ?? brain)! } } : {}),
    });
  };

  // THE STUDIO CATALOG (2026-09-18): every kind with its description and sample; `add(target)` opens
  // an instance where the Studio asked — a new thread, or the active one.
  const paneMeta = (kind: string) => PANE_KINDS.find((k) => k.key === kind);
  // THE FULL EXAMPLE (operator 2026-09-18: "show the actual widget, full"): a populated demo for the
  // kinds that would spawn something (a PTY, an agent, a durable board); the REAL widget over the real
  // workspace for the kinds that only read. A stable preview key so React keeps one instance per pick.
  const previewFor = (catalogKind: string, widget: { kind: string; payload: any }) =>
    demoFor(catalogKind) ?? <WidgetHost widget={{ ...widget, kind: widget.kind as WidgetKind, key: `studio-preview:${catalogKind}` }} ctx={{ variant: "page", chatSessionId: activeId, sessionBrief }} />;
  // TOOLS preview as the REAL widget (operator 2026-09-18: "the tools samples aren't the real use of
  // them"): one stable scratch (session, pane) key per kind, so the preview is a live board / pane that
  // is reused every time the kind is picked — never a new instance per look.
  const previewIds = (kind: string) => ({ sessionId: 7, paneId: 900_000 + Array.from(kind).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 90_000, 7) });
  const catalog = [
    // THE AGENTS ARE NOT A CATALOGUE CATEGORY (operator 2026-09-23: "take out completely on the sidebar right the
    // models tab" · "add a plus button on top of sidebar left, this will add agents, and roles will be there to
    // choose on adding"). Base models, roles and merged winners used to be tiles here, beside the tools — which put
    // "what you open" and "who you hire" in one list. Hiring is the ＋ on the agents sidebar now (add-agent.tsx),
    // and the roles it offers are the same ones the serve measures.
    { category: "tools", kinds: [
      ...VIBE_PANES.filter((w) => w.kind !== "design").map((w) => ({ kind: `vibe-pane:${w.kind}`, label: w.label.split(" · ")[0], glyph: paneDisplay(w.kind).glyph, description: paneMeta(w.kind)?.desc ?? STUDIO_DESC[w.kind], sample: paneMeta(w.kind)?.sample ?? sampleFor(w.kind), preview: previewFor(`vibe-pane:${w.kind}`, { kind: "vibe-pane", payload: { paneKind: w.kind, ...previewIds(w.kind) } }), add: (target?: AddTarget, o?: { split?: boolean }) => persistOrLocal({ type: "widget", kind: "vibe-pane", payload: { paneKind: w.kind, ...mint(`vibe-pane:${w.kind}`) } }, target, o) })),
      ...ATLAS_VIBE.map((w) => ({ kind: w.kind, label: w.label, description: STUDIO_DESC[w.kind], sample: sampleFor(w.kind), preview: previewFor(w.kind, { kind: w.kind, payload: previewIds(w.kind) }), add: (target?: AddTarget, o?: { split?: boolean }) => persistOrLocal({ type: "widget", kind: w.kind, payload: mint(w.kind) }, target, o) })),
      // THE DESIGN AND CODEBASE WIDGETS ARE TOOLS TOO (operator 2026-10-11: "place it at the tools, drop design division category and codebase, just the different colours show they are different"): one list; each tile keeps the
      // colour of where it comes from (`category` = the colour group), and there are no section headings between them.
      // THE DESIGN CANVAS BELONGS WITH THE DESIGN WIDGETS (operator 2026-10-11: "canvas widget should be yellow and together with frames on its side"): the design colour, and listed right before Frames.
      ...VIBE_PANES.filter((w) => w.kind === "design").map((w) => ({ category: "design", kind: `vibe-pane:${w.kind}`, label: w.label.split(" · ")[0], glyph: paneDisplay(w.kind).glyph, description: paneMeta(w.kind)?.desc ?? STUDIO_DESC[w.kind], sample: paneMeta(w.kind)?.sample ?? sampleFor(w.kind), preview: previewFor(`vibe-pane:${w.kind}`, { kind: "vibe-pane", payload: { paneKind: w.kind, ...previewIds(w.kind) } }), add: (target?: AddTarget, o?: { split?: boolean }) => persistOrLocal({ type: "widget", kind: "vibe-pane", payload: { paneKind: w.kind, ...mint(`vibe-pane:${w.kind}`) } }, target, o) })),
      ...ATLAS_DESIGN.map((w) => ({ category: "design", kind: w.kind, label: w.label, description: STUDIO_DESC[w.kind.split(":")[0]], sample: sampleFor(w.kind.split(":")[0]), preview: previewFor(w.kind, { kind: w.kind.split(":")[0], payload: { ...(w.payload ?? {}) } }), add: (target?: AddTarget, o?: { split?: boolean }) => persistOrLocal({ type: "widget", kind: w.kind.split(":")[0], payload: { ...(w.payload ?? {}), ...mint(w.kind) } }, target, o) })),
      ...ATLAS_IDE.map((w) => ({ category: "codebase", kind: w.kind, label: w.label, description: STUDIO_DESC[w.kind], sample: sampleFor(w.kind), preview: previewFor(w.kind, { kind: w.kind, payload: {} }), add: (target?: AddTarget, o?: { split?: boolean }) => persistOrLocal({ type: "widget", kind: w.kind, payload: {} }, target, o) })),
    ] },
  ];
  return isPage ? (
    (mode ?? "agent") === "agent" || threads ? (
      <>
        {/* ONE DOCK (operator 2026-07-26): the whole screen is a single docking area — the same
            strips/open-panel dock widget as before, one queue instead of three zones. ⠿ reorders
            along it; every generated widget docks at the end; ✕ on a user widget destroys its slot.
            THREADS (2026-09-16): the same queue as a list — the chat is one thread among them. */}
        <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
          <DockZone zone="center" layout={threads ? "threads" : "dock"}
            items={(threads ? [...(sideTab === "chats" ? [] : ["chat"]), ...Object.keys(userDocked)] : dock.items.filter((id) => id !== "chat")).map(zoneItem)} collapsed={dock.collapsed}
            sideTab={threads ? sideTab : "threads"} onSideTab={setSideTab}
            chatsSide={chatsTab.side}
            chatsAvatars={chatsTab.avatars}
            // THE EPISODES COLUMN (operator 2026-09-27) — the agent's own consolidations down the left, which is what
            // this surface has to list now that the roster is one role-switching agent.
            chatsEpisodes={<EpisodesSidebar agent={chatsTab.agents.find((a) => a.slug === chatsTab.selected) ?? chatsTab.agents[0] ?? null} episodes={chatsTab.tabEpisodes} selected={readEpisode} onSelect={setReadEpisode} />}
            chatsCount={chatsTab.agents.length}
            chatsBody={(() => {
              // READING AN EPISODE REPLACES THE STAGE, it does not float over it. A closed episode is a different
              // conversation from the live one, and showing them at once invites answering into the wrong chapter —
              // which is the mistake the episode boundary exists to prevent. ✕ back returns to the live thread.
              const a = chatsTab.agents.find((x) => x.slug === chatsTab.selected) ?? chatsTab.agents[0] ?? null;
              return readEpisode != null && a?.pane_id
                ? <EpisodeReader paneId={a.pane_id} n={readEpisode} theme={a.theme} onClose={() => setReadEpisode(null)} />
                : chatsTab.stage;
            })()}
            chatsSplit={sideTab === "chats" && chatSplit ? <SplitPane w={chatSplit} onClose={() => setChatSplit(null)} chatSessionId={activeId} /> : undefined}
            onToggle={toggleDock} onCloseItem={closeDockable} onReorderItem={reorderDock}
            selected={threads ? (threadList.find((x) => x.id === activeThread)?.items ?? []) : undefined}
            onRenameItem={threads ? aliasInThread : undefined}
            catalog={threads ? catalog : undefined}
            threads={threadList} activeThread={activeThread} onSelectThread={setActiveThread} onNewThread={(items) => { newThread(items ?? []); }} onRenameThread={renameThread} onDeleteThread={deleteThread} onSetThreadItems={setThreadItemsOrDrop} onSetThreadCollapsed={setThreadCollapsed} />
          {/* THREADS: timeline (every agent's audit trace) and instruments float on the right, discreet, like the mini fuel */}

      {closingAgent && (
        <AgentCloseDialog kind={String((closingAgent.widget.payload as any)?.paneKind ?? "")} payload={closingAgent.widget.payload} chatSessionId={activeId}
          onDone={() => { destroySlot(closingAgent.id); setClosingAgent(null); }} onCancel={() => setClosingAgent(null)} />
      )}
        </div>
        {/* the CHAT'S OWN DOCK — the antiIDE strategy copied: translucent overlay glass on one of
            the four edges, ghost when ignored, resizable, collapsible to a pill. The widget zones
            underneath keep their full size and behavior (operator: "don't affect the widget dock"). */}
        {!threads && <ChatOverlayDock onSend={(t) => void sendText(t)}>{body}</ChatOverlayDock>}
        {/* ⊞ STUDIO moved out of the composer (operator 2026-07-26): a translucent floating button,
            bottom-right, wearing the circulating ember border. Stage-level, so it works even with
            the chat collapsed. */}
        {/* Threads carries the whole catalog in its sidebar — no Studio button there (operator 2026-09-17) */}
        {!threads && <StudioFab onClick={() => { setStudioFocus(null); setComposerStudio(true); }} />}
        {agentCard && (
          <AgentCard engine={agentCard.engine} base={agentCard.base} initialAsk={agentCard.ask} initialScope={agentCard.scope} fixed={agentCard.fixed} onClose={() => setAgentCard(null)}
            onStart={({ engine, scope, ask, title, pack, base }) => { const rc = agentCard.recipe; setAgentCard(null); const target = agentTargetRef.current; agentTargetRef.current = undefined;
              // a base agent with a model (DeepSeek · Kimi · Qwen): the pane is an OpenCode pane dressed in its theme, started on that model
              const preset = !rc && base?.model ? { slug: "", name: base.label, icon: paneDisplay(engine).glyph, theme: base.theme, specialists: [], skills: [], model: base.model } : null;
              persistOrLocal({ type: "widget", kind: "vibe-pane", payload: { paneKind: engine, sessionId: Date.now(), paneId: Math.floor(Math.random() * 1e9), scope, ask, title: rc && (!ask.trim()) ? `${badgeOf(rc.icon) ? `${rc.icon} ` : ""}${rc.name}` : title, ...(pack ? { pack } : {}), ...(rc ? { recipe: { slug: rc.slug, name: rc.name, icon: rc.icon, theme: rc.theme, specialists: rc.specialists, skills: rc.skills } } : preset ? { recipe: preset } : {}) } }, target); }} />
        )}
        {recipeWizard && (
          <AgentRecipeWizard initial={recipeWizard === "new" ? null : recipeWizard} brief={recipeBrief} onClose={() => setRecipeWizard(false)}
            onCreated={(rc) => { setRecipeWizard(false); setRecipes((rs) => [...rs.filter((x) => x.slug !== rc.slug), rc]); }} />
        )}
        {/* THE VIEW SWITCH (operator 2026-09-17): antiDesk's two views, floating top-center */}
        {/* THE SCREEN SWITCH (2026-09-18): antiDesk · ◌ ⏲ · antiIDE, floating top-center — the instruments
            between the words (hover drops their preview, click opens the window); Blocks is gone. */}
        <ScreenSwitch instruments={instrumentNodes} chatSessionId={activeId} />
        {/* NO wrapper here: StudioOverlay portals to document.body — a fixed wrapper would sit
            empty over the whole screen eating every click (the 2026-07-26 "screen blocked" bug).
            The mac window-zoom lives INSIDE the overlay, on the window element itself. */}
        {composerStudio && (
          <StudioOverlay conv={lastConv} focus={studioFocus} onClose={() => setComposerStudio(false)} onResult={onComposerStudioResult} onOpenVibe={() => { setComposerStudio(false); setMode("terminal"); }} />
        )}
      </>
    ) : <div style={{ display: "flex", height: "100%", minHeight: 0 }}>{body}</div>
  ) : body;
}

// ── the chat's own dock (operator 2026-07-26 v2: "mirror, don't duplicate") — PURE REUSE of the
// shell dock: the SAME DockGhostField (field · ⠿ drag · ▾ pill) and the SAME DockShell glass, on
// the SAME dockStore — so the chat's position follows you between antiChat and every other screen.
// The only difference is the mouth: Enter sends into THIS thread, and the panel carries it whole.
function ChatOverlayDock({ children, onSend }: { children: React.ReactNode; onSend: (t: string) => void }) {
  const { side, collapsed } = useDock();
  return (
    <>
      <DockGhostField onSend={onSend} />
      {side && !collapsed && (
        <DockShell>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
        </DockShell>
      )}
    </>
  );
}

function Turn({ t, isLast, confirming, error, ctxHandlers, variant, debug, rewrite, onToggleRewrite, used, ctxPrefs, onContextPref }: any) {
  const human = t.user_text ?? t.content ?? "";
  const reply = t.interviewer_response_md ?? t.content_md ?? t.presentation_md ?? "";
  // ♪ narrate this reply (operator 2026-07-27): compile the shown text to nir-1 ($0) and hand it
  // to the global dock (bottom-right) — same player, same replay cache, nothing chat-specific.
  const [narrBusy, setNarrBusy] = useState(false);
  const narrate = async (text: string) => {
    if (!text || narrBusy) return;
    setNarrBusy(true);
    try {
      const r: any = await apiPost("/api/v1/narration/manage", {
        op: "compile", source_kind: "text", source_key: `chat-turn-${t.id}`,
        title: `chat · ${text.replace(/[#*_`>[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 46)}`,
        text,
      }, { timeoutMs: 30000 });
      const d = r?.result?.result ?? r?.result ?? r;
      if (d?.ok) void startNarrationJob(d.narration_id, `chat · turn ${t.id}`, { kind: "chat-reply" });
    } finally { setNarrBusy(false); }
  };
  const widgets = deriveWidgets(t, !!isLast);
  // ✂/⤢ in-place rewrite: show the rewritten text in THIS bubble (display-only), with ↩ original.
  const rewriteShown = !!(rewrite?.md && !rewrite.showOriginal);
  const shownReply = rewriteShown ? rewrite.md : reply;
  const ctx = { turnId: t.id, isLast, confirming, error, variant, collapsible: true, shownReply, ...ctxHandlers };
  // COCKPIT Wave 3: which model answered, shown subtly in the reply footer (null = no AI
  // call, e.g. greeting/destructive floors → plain "interviewer").
  const ml = modelLabel(t.model_id);
  // Surface the auto-routed tier (the per-turn complexity classifier's score) on every reply, not just
  // in the debug chip — so the chosen complexity is visible per message. null tier = no AI call (greeting).
  const tier = t.ai_tier as string | undefined;
  // Cost + tokens sit right beside the model name in the reply's meta line (below the response):
  // "interviewer · mid · qwen3.6-max · $0.0179 · 6.7k→1.8k tok". NULL on AI-less turns (greetings).
  const costStr = t.ai_cost_usd != null ? `$${Number(t.ai_cost_usd).toFixed(4)}` : null;
  const tokStr = (t.ai_tokens_in != null || t.ai_tokens_out != null)
    ? `${fmtTok(Number(t.ai_tokens_in) || 0)}→${fmtTok(Number(t.ai_tokens_out) || 0)} tok`
    : null;
  // #AI calls for this turn (chat triage + inline capabilities + presenter), from the persisted telemetry.
  let aiCalls: number | null = null;
  try { const a = JSON.parse(String((t as any).ai_telemetry_json ?? "")); if (Array.isArray(a)) aiCalls = a.length; } catch { /* none */ }
  const callsStr = aiCalls && aiCalls > 1 ? `${aiCalls} calls` : null;
  const rewriteTag = rewriteShown ? `${rewrite.op === "simplify" ? "✂ simplified" : "⤢ expanded"}${rewrite.cost != null ? ` · $${Number(rewrite.cost).toFixed(4)}` : ""}` : null;
  const replyWho = ["interviewer", tier, ml, costStr, tokStr, callsStr, rewriteTag].filter(Boolean).join(" · ");
  return (
    <div style={{ marginBottom: 14 }}>
      {human && <Bubble text={human} who="you" ts={t.ts} isHuman />}
      {/* the reasoning lens — collapsed "how I got here" at the answer header (RAG · skills · the AI call). */}
      {(reply || t.ai_call_id != null) && <TraceTrail turnId={t.id} turn={t} />}
      {reply
        ? <Bubble text={shownReply} who={replyWho} ts={t.ts} />
        : t.ai_call_id != null
          ? <Bubble text="_(no written reply — the model classified this as an action/read intent (or left `content` empty) instead of explaining. Conversational turns need a general **instruct** model, not a coder or reasoning model — set this tier in the Cost screen. Open the badge below to inspect the raw output.)_" who={replyWho} ts={t.ts} />
          : null}
      {/* rewrite chrome: flip between the rewrite and the original; surface a failed rewrite plainly. */}
      {rewrite?.md && (
        <button
          onClick={onToggleRewrite}
          title={rewrite.showOriginal ? "show the rewritten version" : "show the original reply"}
          style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, padding: "0 0 4px", textDecoration: "underline", textUnderlineOffset: 2 }}
        >{rewrite.showOriginal ? `↪ show ${rewrite.op === "simplify" ? "simplified" : "expanded"}` : "↩ original"}</button>
      )}
      {rewrite?.error && (
        <div style={{ color: C.bad, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, marginBottom: 4 }}>⚠ {rewrite.error}</div>
      )}
      {!!reply && used?.length ? <UsedChips used={used} prefs={ctxPrefs ?? { pins: [], drops: [] }} onPref={(ref, st) => onContextPref?.(ref, st)} /> : null}
      {/* Per-reply badge: tier · model · cost · latency (click → full call inspector) + the AI's own
          confidence in its read of the turn ("how sure"). Shown on every AI reply. */}
      {(reply || t.ai_call_id != null || t.classification_confidence != null) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-start", marginTop: 2, marginBottom: 4, flexWrap: "wrap" }}>
          {!!reply && (
            <button onClick={() => { armAudio(); void narrate(String(shownReply || reply)); }} disabled={narrBusy}
              title="♪ narrate this reply — local voice, $0; the player docks bottom-right (1h replay cache)"
              style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, padding: 0 }}>
              {narrBusy ? "⏳" : "♪"}
            </button>
          )}
          {t.ai_call_id != null && (
            <AICallChip
              id={t.ai_call_id}
              tier={(t.ai_tier as "low" | "mid" | "high") || "low"}
              model={t.model_id}
              cost={t.ai_cost_usd ?? undefined}
              durationMs={t.ai_duration_ms ?? undefined}
            />
          )}
          {t.classification_confidence != null && (
            <span title="how confident the AI was in its read of this turn"
              style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: C.muted }}>
              {Math.round(Number(t.classification_confidence) * 100)}% sure
            </span>
          )}
        </div>
      )}
      {widgets.map((w) => <WidgetHost key={w.key} widget={w} ctx={ctx} />)}
    </div>
  );
}

// a tiny hover popover for the NARROW composer — the trigger stays; the hidden controls appear in a
// floating window above it on hover (150ms grace to move the pointer in).
function HoverPop({ trigger, align, children, title }: { trigger: React.ReactNode; align: "left" | "right"; children: React.ReactNode; title?: string }) {
  const [open, setOpen] = React.useState(false);
  const t = React.useRef<any>(null);
  const enter = () => { clearTimeout(t.current); setOpen(true); };
  const leave = () => { clearTimeout(t.current); t.current = setTimeout(() => setOpen(false), 150); };
  return (
    <span onMouseEnter={enter} onMouseLeave={leave} style={{ position: "relative", display: "inline-flex", alignItems: "center" }} title={title}>
      {trigger}
      {open && (
        <div style={{ position: "absolute", bottom: "100%", [align]: 0, marginBottom: 6, zIndex: 60, display: "flex", alignItems: "center", gap: 6, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 8px", boxShadow: "0 10px 30px rgba(0,0,0,.4)", whiteSpace: "nowrap" } as React.CSSProperties}>
          {children}
        </div>
      )}
    </span>
  );
}

function Composer(p: any) {
  // Redesign 2026-06-21: the elegant Odysseus-style composer — one rounded card. The input is a
  // contentEditable MentionInput so @/# references render as INLINE chips (operator 2026-07-25).
  // NARROW ADAPTATION (operator 2026-07-25: a docked chat broke the field): when the card is tight,
  // the left buttons hide behind the LOGO (hover reveals) and the right trail shrinks to a ＋ that
  // reveals the mode switch + rebuild on hover.
  const ghost: React.CSSProperties = { background: "transparent", border: "none", color: C.muted, cursor: "pointer", width: 28, height: 28, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 14 };
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => { const w = es[0]?.contentRect?.width ?? 9999; setNarrow(w < 430); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const leftButtons = (
    <>
      <button onClick={p.onOpenPicker} title="add context — a card / doc / row / code file (type @ in the message to reference one, # for a widget)" style={ghost}>@</button>
      <button onClick={() => p.fileInputRef.current?.click()} disabled={p.uploading} title="attach a file" style={{ ...ghost, opacity: p.uploading ? 0.5 : 1 }}>{p.uploading ? "…" : "⊕"}</button>
    </>
  );
  return (
    <div style={{ flexShrink: 0, padding: narrow ? "6px 8px 10px" : "6px 14px 14px" }}>
      <div ref={cardRef} onDragOver={(e) => { if (isContextDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
        onDrop={(e) => { const block = readContextDrop(e); if (block) { e.preventDefault(); p.setComposing(appendContext(p.composing ?? "", block)); } }}
        style={{
        position: "relative", width: "100%", maxWidth: p.colMax, margin: p.isPage ? "0 auto" : undefined,
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: "10px 12px 8px", display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <MentionInput
            value={p.composing}
            onChange={p.setComposing}
            onEnter={(text: string) => p.onSend(text)}
            editorRef={p.inputRef}
            refs={p.refs} refKey={p.refKey} trayLabel={p.trayLabel} sessionRefables={p.sessionRefables}
            placeholder={p.discuss ? `ask about ${p.discuss.field ? `“${p.discuss.field}”` : p.discuss.slug}…` : narrow ? "Message…" : "Message antiloki…  (@ context · # widget)"}
          />
          {!narrow && <ModelPicker model={p.model} setModel={p.setModel} up />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <input ref={p.fileInputRef} type="file" onChange={p.onFileChange} style={{ display: "none" }} />
          {/* the logo, the system menu and the rebuild moved to the threads sidebar's head (operator 2026-09-20:
              "take those out of antiChat's input field") — the composer keeps only its own controls */}
          {narrow ? (
            <HoverPop align="left" title="hover for context · attach"
              trigger={<button style={{ ...ghost, width: 24, height: 24, fontSize: 13 }}>@</button>}>
              {leftButtons}
            </HoverPop>
          ) : leftButtons}

          <div style={{ flex: 1 }} />

          {narrow ? (
            // the TRAIL, smaller — its options (mode switch · model) hide behind the ＋
            <HoverPop align="right" title="hover for mode · model"
              trigger={<button style={{ ...ghost, width: 24, height: 24, fontSize: 13, color: C.brand }}>＋</button>}>
              <ModeSwitch mode={p.mode} setMode={p.setMode} />
              <ModelPicker model={p.model} setModel={p.setModel} up />
            </HoverPop>
          ) : (
            <>
              <ModeSwitch mode={p.mode} setMode={p.setMode} />
            </>
          )}
        </div>

      </div>
    </div>
  );
}

function PageWelcome({ onPick }: { onPick: (s: string) => void }) {
  const starters = [
    "What needs my attention right now?",
    "Show me the board",
    "Propose a card to …",
    "/queue",
  ];
  return (
    <div style={{ padding: "60px 16px", textAlign: "center", color: C.dim }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: C.fg, marginBottom: 8 }}>
        Chat with the interviewer
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 22 }}>
        Ask anything — propose a card, inspect the board, check the driver. Type “/” to summon a widget.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {starters.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            style={{
              background: C.panel2, color: C.fg,
              border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px",
              cursor: "pointer", fontFamily: '-apple-system, system-ui, sans-serif', fontSize: 13,
            }}
          >{s}</button>
        ))}
      </div>
      <div style={{ marginTop: 26, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: C.muted }}>
        widgets: {WIDGET_COMMANDS.map((w) => w.cmd).join("  ·  ")}
      </div>
    </div>
  );
}

/** The words of a message: typed text as typed, a reply as markdown. A LENS ANSWERS WITH A VERDICT (2026-09-24): a
 *  specialist's reply is a JSON object, and printing it verbatim was a wall of braces in the middle of the screen —
 *  rendered as what it is, with the raw object one click away; anything that is not a lens falls through to markdown.
 *  Shared by the bubble and the chat's flat blocks (cockpit/chat-flow.tsx) so the two cannot draw one reply differently. */
export function BubbleBody({ text, isHuman }: { text: string; isHuman?: boolean }) {
  if (isHuman) return <>{text}</>;
  const lens = parseLens(text);
  return lens
    ? <LensReply lens={lens} raw={text} colors={{ fg: C.fg, dim: C.dim, muted: C.muted, border: C.border, panel: C.panel, accent: C.brand, bad: C.bad, warn: C.warn, ok: C.ok, mono: '"JetBrains Mono", monospace', font: "inherit" }} />
    : <Markdown text={text} compact />;
}
export function Bubble({ text, who, ts, isHuman, pulse }: { text: string; who: string; ts?: string; isHuman?: boolean; pulse?: boolean }) {
  // the thinking bubble pulses; a freshly-arrived reply fades in + settles down from the top.
  const animation = pulse
    ? "antilokiPulse 1.3s ease-in-out infinite"
    : (!isHuman ? "antilokiFadeInDown 0.45s ease both" : undefined);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isHuman ? "flex-end" : "flex-start", marginBottom: 6 }}>
      <div style={{
        maxWidth: "80%",
        background: isHuman ? `color-mix(in oklab, ${C.brand} 20%, ${C.panel})` : C.panel,
        padding: "8px 12px", borderRadius: 8,
        wordBreak: "break-word",
        animation,
        // human messages are plain typed text (pre-wrap); the interviewer reply is markdown → render it.
        ...(isHuman ? { whiteSpace: "pre-wrap" } : {}),
      }}><BubbleBody text={text} isHuman={isHuman} /></div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 2, fontFamily: '"JetBrains Mono", monospace' }}>
        {who}{ts ? ` · ${ts}` : ""}
      </div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div style={{ color: C.muted, textAlign: "center", padding: 24, fontSize: 12 }}>{hint}</div>;
}

// "Cannot reach the engine" is a DIFFERENT statement from "there is nothing here", and the screen
// has to make that distinction out loud — an empty state on a dead backend invites the operator to
// start work that cannot be saved.
function Unreachable({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div style={{ color: C.muted, textAlign: "center", padding: 24, fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ color: C.bad, fontFamily: mono, fontSize: 11 }}>can't reach the engine — {what} could not be loaded</div>
      <div style={{ marginTop: 6 }}>Is the BE running? This keeps retrying on its own.</div>
      <button onClick={onRetry}
        style={{ marginTop: 12, fontFamily: mono, fontSize: 11, padding: "4px 10px", borderRadius: 5, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.brand }}>
        retry now
      </button>
    </div>
  );
}

function Skeleton() {
  return <div style={{ color: C.muted, padding: 24, fontSize: 12 }}>Loading…</div>;
}



// ── ⊞ STUDIO fab (operator 2026-07-26: "translucid overlayed on the right corner at bottom, a
// beautiful button with a border moving effect") — the same circulating ember ring + reflex the
// widget pills wear, on a frosted fixed button. Self-contained CSS (own @property) so it glows
// even before any pill has injected the shared animation sheet.
const STUDIO_FAB_CSS_ID = "loki-studio-fab-css";
function ensureStudioFabCss() {
  if (typeof document === "undefined" || document.getElementById(STUDIO_FAB_CSS_ID)) return;
  const st = document.createElement("style");
  st.id = STUDIO_FAB_CSS_ID;
  st.textContent =
    `@property --lsf-a{syntax:"<angle>";initial-value:0deg;inherits:false}` +
    `@keyframes lsfSpin{to{--lsf-a:360deg}}` +
    `@keyframes lsfReflex{0%{transform:translateX(-140%)}55%,100%{transform:translateX(360%)}}` +
    `.loki-studio-fab{position:fixed;right:18px;bottom:18px;z-index:126;display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 18px;border:none;border-radius:12px;cursor:pointer;` +
    `background:color-mix(in oklab,${C.panel2} 58%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);` +
    `color:${C.fg};font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11.5px;letter-spacing:.4px;` +
    `box-shadow:0 10px 30px rgba(0,0,0,.32);overflow:hidden;transition:transform .15s,box-shadow .15s}` +
    `.loki-studio-fab:hover{transform:translateY(-1px);box-shadow:0 0 18px color-mix(in oklab,${C.brand} 32%,transparent),0 10px 30px rgba(0,0,0,.32)}` +
    `.loki-studio-fab::before{content:"";position:absolute;inset:0;border-radius:12px;padding:1.4px;z-index:4;pointer-events:none;` +
    `background:conic-gradient(from var(--lsf-a),${C.border} 0deg 264deg,color-mix(in oklab,${C.brand} 55%,${C.border}) 292deg,${C.brand} 322deg,color-mix(in oklab,${C.brand} 55%,${C.border}) 350deg,${C.border} 360deg);` +
    `-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:lsfSpin 4.5s linear infinite}` +
    `.loki-studio-fab::after{content:"";position:absolute;top:0;bottom:0;left:0;width:32%;transform:translateX(-140%);pointer-events:none;z-index:3;` +
    `background:linear-gradient(105deg,transparent,color-mix(in oklab,${C.fg} 9%,transparent),transparent);animation:lsfReflex 7s ease-in-out infinite}`;
  document.head.appendChild(st);
}
function StudioFab({ onClick }: { onClick: () => void }) {
  React.useEffect(() => { ensureStudioFabCss(); }, []);
  return (
    <button className="loki-studio-fab" onClick={onClick} title="Studio — generate a widget or artifact from this conversation">
      <span style={{ fontSize: 14, lineHeight: 1 }}>⊞</span> studio
    </button>
  );
}
