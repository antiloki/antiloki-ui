import React from "react";
import { C, mono, nav } from "@/loki/theme";

// THE STUDIO PREVIEW (operator 2026-09-18: "should show fuuuuull examples, with intro info in a
// sidebar on the right"). Two halves:
//   · the EXAMPLE — the widget at full size. Every tool, design and codebase kind renders the REAL
//     widget (tools on a stable scratch key — see previewIds in chat-thread); only the chat and the
//     CLI agents, which would boot a conversation or a PTY agent, render a populated demo — `demoFor`.
//   · the INTRO — what it is, what it does, how to use it, what it costs — `INTRO`.

export type Intro = { does: string[]; how: string[]; cost: string };
export const INTRO: Record<string, Intro> = {
  // agents
  chat: { does: ["The conversation with antiloki — ask, plan, generate; @ pulls context in, # summons a widget", "Its sessions (episodes) live in its own history sidebar; each turn can save an artefact", "One instance: the same chat in two threads is the same conversation"], how: ["Type; @ for context, # for a widget", "Switch the model or the mode (agent · terminal · search) from the composer", "Open the history sidebar for the episodes"], cost: "per turn · the model you pick" },
  "claude-code": { does: ["Runs Claude Code on your subscription in a real terminal, inside a scoped worktree", "Ships with the session's context pack — the brief, the files it may write, the live tools", "Its usage rides the fuel gauge; the timeline records what it reads, writes, runs and refuses"], how: ["Pick the engine → the agent card asks for scope + the ask", "Type in the terminal as you would in a shell", "Two threads can hold the same agent — it is one live pane"], cost: "your Claude subscription · metered per token" },
  codex: { does: ["The OpenAI Codex CLI on your subscription, in a terminal", "Same scope gate, worktree and context pack as every agent", "Standup, diff and shared-diff read its work like any other pane"], how: ["Pick the engine → scope + ask on the agent card", "Work in the terminal; the pane's diff is one click away"], cost: "your OpenAI subscription" },
  opencode: { does: ["The OpenCode CLI in a terminal, model traffic proxied through your BYOK key", "Per-token metering + a kill switch on the proxy", "Edit whitelist = the pane's scope"], how: ["Pick the engine → scope + ask", "Switch the model from the pane header"], cost: "BYOK · metered per token" },
  // tools · panes
  terminal: { does: ["A real PTY in the workspace (or a worktree you choose)", "Shell, run and scripts in one seat — the run recipes are one keystroke away", "Output stays durable with the pane"], how: ["Choose the worktree from the pane header", "Type; ↑ recalls; the ▶ menu runs a registered script"], cost: "$0" },
  design: { does: ["The running app as a canvas — inspect, measure, annotate the real DOM", "Captures become frames you can edit and hand to an agent"], how: ["Boot the preview, then point at any element", "Save a capture → it lands under Design › Frames"], cost: "$0" },
  intent: { does: ["Captures the ask before any code: the intent, the constraints, the acceptance", "Step ① of the RFC: what shape opens it, what judgment closes it"], how: ["Write the intent in plain words", "Press ▸ RFC to grow it into a plan tree"], cost: "one model call per RFC press" },
  context: { does: ["The session's shared memory — the docs every agent reads on boot", "Pin a file, a note, a decision; every pane gets it in its pack"], how: ["+ adds a doc; ✎ edits inline", "Order matters — the top of the list is what agents see first"], cost: "$0" },
  standup: { does: ["Every turn-capable pane reports done / now / blocked in one place", "One click, every agent — read it like a standup"], how: ["Press ▶ standup; answers stream per lane", "Click a lane to jump to that pane"], cost: "one short turn per agent" },
  diff: { does: ["Every pane's diff in one reviewer's seat", "Stage, comment, send back — per hunk"], how: ["Pick a pane on the left; hunks on the right", "⏎ on a hunk sends the comment to that agent"], cost: "$0" },
  // tools · boards
  "vibe-issues": { does: ["One tracker for the session, Linear-style — a list grouped by status, or a board", "Backlog · Todo · In Progress · Done · Canceled, with a priority; yours, durable, never sent to the AI"], how: ["Type a title + ⏎ adds an issue", "Click the status circle or the priority bars to change them; click a title to rename", "Board view: drag a card to another column"], cost: "$0" },
  "vibe-todo": { does: ["A checkable session todolist — yours, inline, never sent to the AI", "Survives reloads; lives with the session"], how: ["Type + ⏎ adds; click the box checks; ✕ clears the done ones"], cost: "$0" },
  "vibe-kanban": { does: ["Your Trello for the session — To do / Doing / Done", "Drag cards across columns; edit in place; durable"], how: ["+ card (Enter) under a column", "Drag a card to move it; double-click to edit"], cost: "$0" },
  "vibe-notes": { does: ["A private annotation pad — decisions, reminders, the thing you'd otherwise forget", "Markdown-ish; durable; yours"], how: ["Just type — it saves as you go"], cost: "$0" },
  "vibe-sketch": { does: ["A quick sketch pad — boxes, arrows, freehand", "Export as an artefact into the session"], how: ["Draw; ⌫ deletes the selection; ⤓ saves it as an artefact"], cost: "$0" },
  "shared-diff": { does: ["The cross-agent git view: files × agents matrix, conflicts by merge-tree", "The integration order, deterministic"], how: ["Red cells are two agents on one file — click for the conflict", "▶ integrate applies the computed order"], cost: "$0" },
  "automation": { does: ["antiFlow: the driver's queue and the cards moving through PL → TL → DEV → QA → MAN → GIT", "Live — the same screen as Operations › Pipeline, inside your thread"], how: ["The queue says the next card and why the others wait", "Each column is a phase; a card moves as the driver ticks; click a card for its detail"], cost: "$0 to watch · the driver's own runs cost what they cost" },
  // design
  "design-frames": { does: ["Every captured screen as an editable frame — Figma over your real DOM", "Diff a frame against its capture; hand the edit to an agent"], how: ["Pick a frame on the left; edit on the canvas", "▶ implement sends the delta to the agent of your choice"], cost: "$0 to edit" },
  "design-view:system": { does: ["The design system as the codebase actually uses it — tokens, type, spacing", "Deterministic: read from the source, not described"], how: ["Browse; click a token to see where it is used"], cost: "$0" },
  "design-view:components": { does: ["The component inventory — props, usage count, where"], how: ["Search; click to open the source"], cost: "$0" },
  // codebase
  "atlas-graph": { does: ["The whole import graph — every file, every edge", "Clusters, cycles, the hub files"], how: ["Scroll to zoom; click a node to focus its neighborhood"], cost: "$0" },
  "atlas-diagram": { does: ["The system design diagram — boxes and labeled arrows, folder by folder"], how: ["Click a box to drill in; ← to come back"], cost: "$0" },
  "atlas-authors": { does: ["Ownership: who touched what, co-dependency, bus factor"], how: ["Click an author for their profile; a file for its authors"], cost: "$0" },
  "atlas-xray": { does: ["The riskiest files, the smells, the repo digest — ranked"], how: ["Click a file to open it in Code; hand a smell to an agent"], cost: "$0" },
  "atlas-constitution": { does: ["The laws book — every rule the repo enforces, with its evidence"], how: ["Scope it to a file to see the rules that apply there"], cost: "$0" },
  "skill-library": { does: ["Teachable agent skills — when-to-use, method, runnable assets", "Materializes into an agent's worktree on boot"], how: ["+ writes a skill; import pastes one; toggle to arm it"], cost: "$0" },
  "atlas-code": { does: ["The read-only mini-IDE — the tree and the viewer, inline"], how: ["Browse; ⌘P jumps to a file"], cost: "$0" },
  "atlas-git": { does: ["The codebase's git graph — branches, history, the base lane"], how: ["Click a commit for its diff"], cost: "$0" },
};
export const introFor = (kind: string): Intro | undefined => {
  const bare = kind.startsWith("vibe-pane:") ? kind.slice("vibe-pane:".length) : kind;
  return INTRO[bare] ?? INTRO[bare.split(":")[0]];
};

// ——— the demo kit: the same frame the real widgets wear, filled with a believable session ———
function Frame({ label, glyph = "❯", note = "antiVibe · yours · not sent to the AI", children }: { label: string; glyph?: string; note?: string; children: React.ReactNode }) {
  return (
    <div data-testid="studio-demo" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: `1px solid ${C.border}`, background: C.panel2, flexShrink: 0 }}>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", color: C.dim }}>{glyph} {label}</span>
        <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 8.5, color: C.muted }}>{note}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", fontFamily: nav, fontSize: 12.5, lineHeight: 1.45, color: C.fg, overflow: "auto" }}>{children}</div>
    </div>
  );
}
const Term = ({ lines, title, note }: { lines: [string, string?][]; title: string; note?: string }) => (
  <Frame label={title} glyph="❯" note={note ?? "PTY · workspace"}>
    <pre style={{ margin: 0, padding: "12px 14px", fontFamily: mono, fontSize: 11.5, lineHeight: 1.6, color: C.fg, whiteSpace: "pre-wrap" }}>
      {lines.map(([t, tone], i) => <div key={i} style={{ color: tone === "dim" ? C.dim : tone === "ok" ? C.ok : tone === "warn" ? C.warn : tone === "brand" ? C.brand : tone === "muted" ? C.muted : C.fg }}>{t}</div>)}
      <span style={{ display: "inline-block", width: 7, height: 13, background: C.brand, verticalAlign: "text-bottom", marginLeft: 2 }} />
    </pre>
  </Frame>
);
const agentTerm = (name: string, cmd: string, model: string) => (
  <Term title={name} note="agent · worktree wt/auth-refresh · scope src/auth/**" lines={[
    ["$ " + cmd, "muted"], ["", ""],
    [`▌ ${name} · ${model}`, "brand"],
    ["context pack: brief.md · 3 files pinned · 5 live tools", "dim"], ["", ""],
    ["> make the session token refresh itself before it expires", ""], ["", ""],
    ["● read src/auth/session.ts", "dim"], ["● read src/auth/refresh.spec.ts", "dim"],
    ["● edit src/auth/session.ts  +18 −4", "ok"], ["● run  npm test -- refresh   ✓ 12 passed", "ok"],
    ["", ""],
    ["The token now refreshes 60s before expiry; the retry is idempotent and covered by", ""],
    ["refresh.spec.ts. One thing to decide: should a failed refresh log the user out or", ""],
    ["retry once more? I left it at one retry.", ""], ["", ""],
    [">", "brand"],
  ]} />
);
const DEMO: Record<string, () => React.ReactNode> = {
  chat: () => (
    <Frame label="antiChat" glyph="◆" note="episode #4 · claude-opus-5">
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "150px 1fr", minHeight: 0 }}>
        <div style={{ borderRight: `1px solid ${C.border}`, padding: "10px 0", fontFamily: mono, fontSize: 10 }}>
          {[["episode #4", "3 turns", true], ["episode #3", "12 turns", false], ["episode #2", "7 turns", false], ["episode #1", "21 turns", false]].map(([n, k, on]) => <div key={String(n)} style={{ display: "flex", gap: 6, padding: "4px 12px", color: on ? C.fg : C.muted, background: on ? C.panel2 : "transparent" }}><span style={{ color: on ? C.brand : C.dim }}>{on ? "●" : "○"}</span><span style={{ flex: 1 }}>{n}</span><span style={{ color: C.dim }}>{k}</span></div>)}
          <div style={{ padding: "6px 12px", color: C.dim }}>+ new session</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, overflow: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12, fontSize: 12.5 }}>
            <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px" }}>why does the session token expire mid-work? <span style={{ color: C.brand }}>@src/auth/session.ts</span></div>
            <div style={{ maxWidth: "88%", lineHeight: 1.55 }}>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginBottom: 4 }}>◆ antiloki · read 2 files</div>
              The token is minted with a 15-minute TTL and nothing refreshes it — <code style={{ fontFamily: mono, fontSize: 11, color: C.brand }}>ensureFresh</code> is only called on boot. Two ways out: refresh 60s before expiry on every request, or make the BE extend it on activity. The first keeps the BE stateless.
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>{["▸ refresh before expiry", "▸ extend on activity", "# diff"].map((b) => <span key={b} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 9px", fontFamily: mono, fontSize: 10, color: C.muted }}>{b}</span>)}</div>
            </div>
            <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px" }}>refresh before expiry — hand it to Claude Code in a new thread</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>◆ opening ✦ Claude Code · scope src/auth/** · thread “auth refresh”</div>
          </div>
          <div style={{ margin: 12, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, color: C.dim, fontSize: 13 }}><span style={{ flex: 1 }}>Message antiloki… (@ context · # widget)</span><span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>○ Claude ▾</span><span style={{ color: C.brand }}>⇄</span></div>
        </div>
      </div>
    </Frame>
  ),
  "claude-code": () => agentTerm("Claude Code", "claude --continue", "claude-opus-5"),
  codex: () => agentTerm("Codex", "codex", "gpt-5-codex"),
  opencode: () => agentTerm("OpenCode", "opencode", "kimi-k2 · BYOK"),
};
/** A populated demo for the chat and the CLI agents (a live one would boot a conversation / an agent); null → render the real widget. */
export function demoFor(kind: string): React.ReactNode | null {
  const bare = kind.startsWith("vibe-pane:") ? kind.slice("vibe-pane:".length) : kind;
  const d = DEMO[bare];
  return d ? d() : null;
}
