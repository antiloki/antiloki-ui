// WHICH AGENT OPENS WHEN THE PERSON DID NOT CHOOSE ONE (the new-team leader, the default-agent shortcut). It used to be Claude Code whatever the machine had:
// a friend whose only seat was Cursor got a Claude pane that could never run (2026-11-25). Now: an agent that is installed, signed in and switched on, in this order; else one that is at least installed.
import type { Engine } from "./api";

const ORDER = ["claude-code", "codex", "cursor", "antigravity", "opencode", "grok", "gemini"];
const rank = (e: Engine) => { const i = ORDER.indexOf(e.key); return i < 0 ? ORDER.length : i; };
const first = (l: Engine[]) => [...l].sort((a, b) => rank(a) - rank(b))[0] ?? null;

export function pickDefaultEngine(list: Engine[]): Engine | null {
  const ok = (e: Engine) => e.installed && !e.off && !e.broken;
  return first(list.filter((e) => ok(e) && e.seat)) ?? first(list.filter(ok));
}
export const NO_AGENT = "no agent is installed and signed in yet: install one (Claude Code, Codex, Cursor...) and sign in to it once, then try again";
