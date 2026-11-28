import type { Widget } from "./types";

// Parse a "/command args" composer entry into a summonable read widget. Returns
// null when the text isn't a recognized widget command, so the thread falls
// back to sending it as a normal interviewer turn. This is what makes the read
// widgets (queue/pipeline/cost/audit/memory) reachable today — the presenter's
// view_intent enum doesn't emit them, so the operator summons them directly.
export const WIDGET_COMMANDS: Array<{ cmd: string; hint: string }> = [
  { cmd: "/board", hint: "show the card board" },
  { cmd: "/card <slug>", hint: "inspect one card" },
  { cmd: "/queue", hint: "driver dispatch queue" },
  { cmd: "/pipeline [slug]", hint: "pipeline stages" },
  { cmd: "/cost", hint: "today's spend" },
  { cmd: "/audit [entity]", hint: "audit timeline" },
  { cmd: "/memory [query]", hint: "search memory" },
  // ANTIIDE-IN-CHAT — the atlas intelligence inline, deterministic + $0
  { cmd: "/review <path>", hint: "file review — health + findings" },
  { cmd: "/graph", hint: "the code graph (import map)" },
  { cmd: "/design [dir]", hint: "system design — the architecture diagram" },
  { cmd: "/authors", hint: "ownership: authors graph + profile" },
  { cmd: "/docs [path]", hint: "generated docs for a page" },
  { cmd: "/constitution [path]", hint: "the laws book" },
  { cmd: "/xray", hint: "riskiest files · smells · digest" },
  { cmd: "/code", hint: "the read-only mini-IDE" },
  { cmd: "/git", hint: "the codebase git graph" },
];

export function parseWidgetCommand(text: string): Widget | null {
  const m = text.trim().match(/^\/([\w-]+)\s*(.*)$/);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const arg = m[2].trim();
  const key = `palette-${cmd}-${Date.now()}`;
  switch (cmd) {
    case "board": return { kind: "board", key, payload: null };
    case "card": return arg ? { kind: "card-detail", key, payload: { slug: arg } } : null;
    case "queue":
    case "driver-queue": return { kind: "driver-queue", key, payload: {} };
    case "pipeline": return { kind: "pipeline", key, payload: arg ? { slug: arg } : {} };
    case "cost": return { kind: "cost", key, payload: {} };
    case "audit": return { kind: "audit-timeline", key, payload: arg ? { entity_id: arg } : {} };
    case "memory": return { kind: "memory-search", key, payload: arg ? { query: arg } : {} };
    // ANTIIDE-IN-CHAT — reuse the real antiIDE panels inline, deterministic + $0
    case "review": return arg ? { kind: "atlas-review", key, payload: { path: arg } } : null;
    case "graph": return { kind: "atlas-graph", key, payload: {} };
    case "design": return { kind: "atlas-diagram", key, payload: arg ? { dir: arg } : {} };
    case "authors": return { kind: "atlas-authors", key, payload: {} };
    case "docs": return { kind: "atlas-docs", key, payload: arg ? { path: arg } : {} };
    case "constitution": return { kind: "atlas-constitution", key, payload: arg ? { path: arg } : {} };
    case "xray": return { kind: "atlas-xray", key, payload: {} };
    case "code": return { kind: "atlas-code", key, payload: arg ? { path: arg } : {} };
    case "git": return { kind: "atlas-git", key, payload: {} };
    default: return null;
  }
}
