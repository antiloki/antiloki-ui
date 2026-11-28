// Centralized glossary for AntiLoki vocabulary.

export type GlossaryEntry = {
  term: string;
  short: string;
  long: string;
  links?: { label: string; to: string }[];
};

export const GLOSSARY: Record<string, GlossaryEntry> = {
  drive: {
    term: "drive",
    short: "A unit of work in flight — backed by a contract row.",
    long: "Drives are how AntiLoki frames a piece of work. Each drive has a slug, a status, an intent, and a contract document.",
  },
  slug: {
    term: "slug",
    short: "Stable identifier (e.g. LOKI-COCKPIT-COST-DASHBOARD-001).",
    long: "Every unit of work has a slug — uppercase, hyphenated, ending in a numeric suffix. Immutable, travels with the work.",
  },
  contract: {
    term: "contract",
    short: "Immutable spec — the .md file that drives every phase.",
    long: "Contracts are append-only Markdown. Once sealed they're never edited; a new contract supersedes the old one.",
  },
  card: {
    term: "card",
    short: "A backlog item · may be an EPIC, story, or task.",
    long: "Cards live on the board and have a driver_intent (play/paused/stopped/auto). EPIC cards aggregate child cards.",
  },
  phase_event: {
    term: "phase event",
    short: "Append-only entry in sacred_timeline.",
    long: "Each phase emits a phase_event with role, ts, operation, payload. Immutable and replayable — how AntiLoki proves what happened.",
  },
  drift: {
    term: "drift",
    short: "Detector raised against a card · something diverged.",
    long: "Drift = an entry in focus.signals[slug].blocked_by, or a /reconcile finding. Must be resolved before progress.",
    links: [{ label: "open board", to: "/operations" }],
  },
  bypass: {
    term: "bypass",
    short: "Recorded escape from protocol (god-mode invocation).",
    long: "Always logged with reason and cost. Frequent bypasses on a slug are a trust signal.",
  },
  cognition: {
    term: "cognition",
    short: "Tier of compute used: script / narrow / broad.",
    long: "script = deterministic code (free, ms). narrow = small tuned model (cheap, sub-second). broad = frontier model (expensive, seconds).",
  },
  intent: {
    term: "intent",
    short: "Operator's wish: play / paused / stopped / auto.",
    long: "Set on a card to tell the driver what to do next. The driver picks up cards with intent='play'.",
  },
  signal: {
    term: "signal",
    short: "Computed status: green · yellow · red · idle.",
    long: "From focus.signals. Green = ready, yellow = transient block, red = blocked. Drives the board dots.",
  },
  blocker: {
    term: "blocker",
    short: "Why a card can't progress · has fix options.",
    long: "Each blocker has a kind, a reason_md, and fix_options buttons. Click a fix option to resolve inline.",
  },
  microtask: {
    term: "microtask",
    short: "Step inside a contract · checked off by DEV.",
    long: "Microtasks are the TL-decomposed steps. Live inside microtasks_json on the contract.",
  },
  epic: {
    term: "EPIC",
    short: "Card that groups children via parent_slug.",
    long: "EPICs roll up child status. Red descendant count surfaces on the EPIC card when children are blocked.",
  },
  impasse: {
    term: "impasse",
    short: "v2 · two roles disagree, harness pauses.",
    long: "Not yet implemented in v1. When MAX_ITER is reached, an impasse card will be auto-filed.",
  },
  auto_seal: {
    term: "auto-seal",
    short: "v2 · harness closes contract automatically.",
    long: "Not yet wired in v1.",
  },
  // legacy aliases kept for old call-sites
  supersedes: { term: "supersedes", short: "Link from a new contract to the one it replaces.", long: "Contracts never mutate." },
  role_cli: { term: "role-CLI", short: "Dispatchable action via /chat/dispatch.", long: "Typed actions addressed to a specific agent." },
};
