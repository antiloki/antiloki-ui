// THE AGENT'S OWN MODES, SHOWN IN THE CHAT (operator 2026-11-26: "display the existent modes in a switcher, one icon, each mode a different icon, mouse over shows the legend"). Nothing is invented: the mode is
// read from the CLI's own screen and the switch is the key its screen names (Shift+Tab cycles). Pure. Screens seen live: Antigravity 1.5.18 and OpenCode 2.4.2; Claude Code's footer; Codex shows only "Plan mode".
export type ModeKind = "default" | "auto" | "plan" | "edits" | "bypass" | "ask" | "debug" | "build" | "other";
export type AgentMode = { kind: ModeKind; label: string };
export const NEXT_MODE_KEY = "\x1b[Z";

const m = (kind: ModeKind, label: string): AgentMode => ({ kind, label });
function kindOf(word: string): ModeKind {
  const w = word.toLowerCase();
  return w === "plan" || w === "ask" || w === "debug" || w === "build" || w === "auto" ? w : /edit/.test(w) ? "edits" : /bypass|yolo|full/.test(w) ? "bypass" : "other";
}
const title = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** The mode the screen shows now, or null when it cannot be read (then no switcher is drawn). */
export function parseMode(engine: string | undefined, rows: string[]): AgentMode | null {
  const e = (engine ?? "").toLowerCase();
  const tail = rows.map((r) => r.trimEnd()).filter((r) => r.trim()).slice(-8);
  const text = tail.join("\n");
  if (e.startsWith("claude")) {
    const foot = tail.slice(-4).join("\n");
    if (/plan mode on/i.test(foot)) return m("plan", "Plan");
    if (/accept edits on/i.test(foot)) return m("edits", "Accept edits");
    if (/auto mode on/i.test(foot)) return m("auto", "Auto");
    if (/bypass permissions on/i.test(foot)) return m("bypass", "Bypass permissions");
    if (/don.t ask on/i.test(foot)) return m("bypass", "Don't ask");
    return /manual mode on|\? for shortcuts/i.test(foot) ? m("default", "Ask before changes") : null;
  }
  if (e === "cursor") {   // 2026.11: "Plan (shift+tab to cycle)" under the box; no such line is Agent mode
    for (const r of tail) { const f = /^\s*(Plan|Debug|Ask)\s*\(shift\+tab to cycle\)/.exec(r); if (f) return m(kindOf(f[1]), f[1]); }
    return /→ (Plan, search, build anything|Add a follow-up)/.test(text) ? m("default", "Agent") : null;
  }
  if (e === "gemini") {
    for (let i = tail.length - 1; i >= 0; i--) {
      const f = /\? for shortcuts\s+(?:([a-z][a-z-]*) · )?\S/.exec(tail[i]);
      if (f) return f[1] ? m(kindOf(f[1]), title(f[1].replace(/-/g, " "))) : m("default", "Ask before changes");
    }
    return null;
  }
  if (e.startsWith("opencode")) {
    for (let i = tail.length - 1; i >= 0; i--) { const f = /^\s*[┃│]\s+([A-Z][A-Za-z-]{1,20}) · /.exec(tail[i]); if (f) return m(kindOf(f[1]), f[1]); }
    return null;
  }
  if (e.startsWith("codex")) {
    if (/Plan mode\b.*shift\s*\+\s*tab|\bPlan mode\s*$/m.test(text)) return m("plan", "Plan");
    return /context left|\? for shortcuts|Ask Codex/i.test(text) ? m("default", "Default") : null;
  }
  return null;
}
