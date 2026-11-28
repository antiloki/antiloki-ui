// ANTIVIBE-IN-CHAT: the antiVibe SESSION tools that stand alone — todo, kanban, notes, sketch. Unlike
// the agent/terminal/gate panes (which need a super-session with worktrees), these are personal boards
// that persist to the cockpit "blackboard" (a generic KV keyed by session_id + pane_id). We mint a STABLE
// pair at paste-time and carry it in the widget payload, so each inline tool has its own durable state
// that survives reload. Yours — never injected into the AI's prompts.
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import { SketchPane } from "@/loki/cockpit/cockpit-panes-tools";
import { IssuesPane } from "@/loki/cockpit/issues-pane";
import { widgetIds } from "@/loki/chat/widget-ids";
import { NotesPane } from "@/loki/cockpit/cockpit-panes-extra";
import { CockpitPaneBody } from "./cockpit-pane-body";
import { paneDisplay, type WidgetProps } from "./types";

const ids = (payload: any) => ({ sessionId: Number(payload?.sessionId) || 0, paneId: Number(payload?.paneId) || 0 });

// REAL SESSION FIX (operator 2026-07-25: "kanban doesn't add cards"): blackboard POST accepted minted
// session ids but READ validates the session row → writes landed, reads 404'd, the board looked dead.
// The tools now key their KV on the chat's REAL cockpit session (antichat#<chat id>, find-or-create,
// promise-cached against double-mount races); the minted paneId still isolates each widget instance.
const unwrapR = (r: any) => r?.result?.result ?? r?.result ?? r;
const csInflight = new Map<string, Promise<number | null>>();
function chatCockpitSession(chatSessionId: number | null | undefined): Promise<number | null> {
  const key = `cs-${chatSessionId ?? "solo"}`;
  const hit = csInflight.get(key);
  if (hit) return hit;
  const run = (async () => {
    try {
      const name = `antichat#${chatSessionId ?? "solo"}`;
      const list = unwrapR(await apiPost(`/api/v1/cockpit/session/get`, {}, { timeoutMs: 12_000 }));
      const cs = (Array.isArray(list?.sessions) ? list.sessions : []).filter((s: any) => s?.name === name && s?.status !== "closed").sort((a: any, b: any) => a.id - b.id)[0];
      if (cs?.id) return cs.id as number;
      const made = unwrapR(await apiPost(`/api/v1/cockpit/session/create`, { name, mission_md: `Inline panes for ${name}.` }, { timeoutMs: 30_000 }));
      return made?.session?.id ?? null;
    } catch { return null; }
  })();
  csInflight.set(key, run);
  run.then((v) => { if (v == null) csInflight.delete(key); }); // failures retry on next mount
  return run;
}
function useVibeSession(ctx: any, minted: number): number | null {
  const [sid, setSid] = React.useState<number | null>(null);
  React.useEffect(() => {
    let live = true;
    void chatCockpitSession(ctx?.chatSessionId).then((id) => { if (live) setSid(id ?? minted); });
    return () => { live = false; };
  }, [ctx?.chatSessionId, minted]);
  return sid;
}
function Connecting() {
  return <div style={{ padding: 12, fontFamily: mono, fontSize: 10, color: C.muted }}>connecting to the session's board…</div>;
}

function VibeFrame({ label, height, fill, glyph = "❯", children }: { label: string; height: number; fill?: boolean; glyph?: string; children: React.ReactNode }) {
  return (
    <div data-widget-frame style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg, overflow: "hidden", ...(fill ? { height: "100%", minHeight: height, display: "flex", flexDirection: "column", marginTop: 0 } : {}) }}>
      <div data-widget-frame-header style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: `1px solid ${C.border}`, background: C.panel2, flexShrink: 0 }}>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", color: C.dim }}>{glyph} {label}</span>
        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 8.5, color: C.muted }}>antiVibe · yours · not sent to the AI</span>
      </div>
      {/* a clean typographic baseline so the chat's prose/markdown CSS can't leak into the pane's fonts */}
      <div style={{ ...(fill ? { flex: 1, minHeight: 0 } : { height }), display: "flex", flexDirection: "column", fontFamily: nav, fontSize: 12.5, lineHeight: 1.45, letterSpacing: "normal", color: C.fg }}>{children}</div>
    </div>
  );
}

// ISSUES (operator 2026-10-11: "the todo and kanban should be one widget called issues"). One tracker replaces the checklist and the board. The two old kinds stay registered, because threads already hold them: they open the
// same Issues pane on their own (session, pane) key, which moves their old rows in on first open. The new kind also pulls in whatever the old Todo and Kanban boards held (their keys are derived from their kind, see widget-ids.ts).
export function VibeIssuesWidget({ payload, ctx }: WidgetProps) {
  const { sessionId, paneId } = ids(payload);
  const sid = useVibeSession(ctx, sessionId);
  const legacy = React.useMemo(() => [widgetIds("vibe-todo").paneId, widgetIds("vibe-kanban").paneId], []);
  return <VibeFrame label="issues" height={420}>{sid == null ? <Connecting /> : <IssuesPane sessionId={sid} paneId={paneId} legacyPaneIds={legacy} />}</VibeFrame>;
}
export function VibeTodoWidget({ payload, ctx }: WidgetProps) {
  const { sessionId, paneId } = ids(payload);
  const sid = useVibeSession(ctx, sessionId);
  return <VibeFrame label="issues" height={420}>{sid == null ? <Connecting /> : <IssuesPane sessionId={sid} paneId={paneId} />}</VibeFrame>;
}
export function VibeKanbanWidget({ payload, ctx }: WidgetProps) {
  const { sessionId, paneId } = ids(payload);
  const sid = useVibeSession(ctx, sessionId);
  return <VibeFrame label="issues" height={420}>{sid == null ? <Connecting /> : <IssuesPane sessionId={sid} paneId={paneId} />}</VibeFrame>;
}
export function VibeNotesWidget({ payload, ctx }: WidgetProps) {
  const { sessionId, paneId } = ids(payload);
  const sid = useVibeSession(ctx, sessionId);
  return <VibeFrame label="notes" height={300}>{sid == null ? <Connecting /> : <NotesPane sessionId={sid} paneId={paneId} onChanged={() => { /* local */ }} />}</VibeFrame>;
}
export function VibeSketchWidget({ payload, ctx }: WidgetProps) {
  const { sessionId, paneId } = ids(payload);
  const sid = useVibeSession(ctx, sessionId);
  return <VibeFrame label="sketch" height={400}>{sid == null ? <Connecting /> : <SketchPane sessionId={sid} paneId={paneId} />}</VibeFrame>;
}

// GENERIC cockpit pane inline — payload.paneKind picks the pane (shell/run/design/intent/shape/judgment/
// fuel/context/standup/diff/state/gate/timeline). One widget, any self-contained kind; durable via the
// minted (session, pane) key. Stored on the widgets rail like the rest.
export function VibePaneWidget({ payload, ctx }: WidgetProps) {
  const kind = String(payload?.paneKind ?? "");
  const { sessionId, paneId } = ids(payload);
  const d = paneDisplay(kind); // the AGENT'S name + logo glyph — never a generic "pane"
  // tool panes persist to the blackboard → they need the REAL cockpit session (same fix as kanban);
  // the CLI panes keep the MINTED sessionId in their ensure key (stability), threaded separately.
  const sid = useVibeSession(ctx, sessionId);
  const title = typeof payload?.title === "string" && payload.title.trim() ? String(payload.title) : d.name; // the agent card's ask, or a rename
  return <VibeFrame label={title} glyph={d.glyph} height={440} fill>
    {sid == null ? <Connecting /> : <CockpitPaneBody kind={kind} sessionId={sessionId} bbSessionId={sid} paneId={paneId} chatSessionId={ctx?.chatSessionId} sessionBrief={ctx?.sessionBrief}
      initialScope={Array.isArray(payload?.scope) ? payload.scope.map(String) : undefined} ask={typeof payload?.ask === "string" ? payload.ask : undefined} initialPack={payload?.pack && typeof payload.pack === "object" ? payload.pack : undefined} recipe={payload?.recipe && typeof payload.recipe === "object" ? payload.recipe : undefined} initialSettings={payload?.settings && typeof payload.settings === "object" ? payload.settings : undefined} />}
  </VibeFrame>;
}
