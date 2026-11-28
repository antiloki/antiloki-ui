// DEMO FIXTURES — the fake-but-plausible data the locked-tab preview renders.
// Shapes mirror the real endpoints (verified against the screens' unwrap sites).
// Coverage grows per screen; anything uncovered falls back to the demo-mode
// defaults (POST → {ok:true, demo:true}, GET → null → the screen's empty state).

const NB_ID = 9001;

const NOTEBOOKS_LIST = {
  ok: true,
  notebooks: [
    { id: NB_ID, title: "How does auth work end-to-end?", item_count: 4, pin_count: 1, scope: { paths: ["src/auth", "src/api"] } },
    { id: NB_ID + 1, title: "The payment pipeline, taught", item_count: 7, pin_count: 2, scope: { paths: ["src/checkout"] } },
  ],
};

const NOTEBOOK_GET = {
  ok: true,
  notebook: { id: NB_ID, title: "How does auth work end-to-end?", scope: { paths: ["src/auth", "src/api"] } },
  items: [
    { id: 1, kind: "ask", title: "How does a request get authorized?", pinned: 1,
      body_md: "Every request passes **auth/guard.ts** — the token is verified, then the dispatcher checks the agent's grants before any skill runs. Nothing reaches a mutation without both.",
      meta: { tier: "high", citations: [{ kind: "code", ref: "auth/guard.ts" }, { kind: "code", ref: "engine/dispatch.ts" }], cost_usd: 0.004, ai_call_id: 1 } },
    { id: 2, kind: "artifact", title: "Overview", pinned: 0,
      body_md: "## The auth scope\n\n- **guard.ts** — token verify + grant check, the one door\n- **dispatch.ts** — routes every action through it\n- **store.ts** — session persistence, httpOnly",
      meta: { artifact_kind: "overview", tier: "high" } },
  ],
};

const NOTEBOOK_SOURCES = {
  ok: true,
  sources: [
    { id: 1, kind: "code_paths", label: "Code in scope", enabled: 1, meta: {}, tokens: null },
    { id: 2, kind: "ast", label: "AST · signatures", enabled: 1, meta: {}, tokens: null },
    { id: 3, kind: "git", label: "Git history", enabled: 1, meta: {}, tokens: null },
    { id: 4, kind: "paper", ref: "paper-auth-audit", label: "📜 Auth audit", enabled: 1, meta: {}, tokens: 5200 },
  ],
};

const PAPERS_LIST = {
  ok: true,
  papers: [
    { id: 1, slug: "paper-auth-audit", title: "Auth audit — one guard, every door", label: "security",
      discovery: "one convenience became the security policy", agents: 5, files: 12, cost_usd: 0.31, created_at: "2026-07-18 14:02" },
  ],
};

// atlas graph for the Explorer — the FULL AtlasResponse contract: getAtlas
// unwraps on "node_count", the mosaic needs typed def nodes with parent_id,
// and the "→ n" badges need import edges.
const FILES = [
  ["engine/dispatch.ts", ["dispatchAction", "resolveGrant", "withAudit", "runSkill", "auditRow", "logDecision"], "routes every action through permission checks, audit and the law hooks"],
  ["auth/guard.ts", ["verifyToken", "requireGrant", "sessionFromCookie"], "the one door — token verify + grant check before any skill runs"],
  ["checkout.tsx", ["CheckoutPage", "CartSummary", "PayButton", "useIntent"], "the checkout flow — cart, payment intent, confirmation"],
  ["api/client.ts", ["apiGet", "apiPost"], null],
  ["api/routes.ts", ["registerRoutes", "loginRoute", "orderRoute"], null],
  ["db/schema.sql", ["users", "orders", "sessions"], null],
  ["db/orders.sql", ["insertOrder", "orderTotals"], null],
  ["theme.css", ["tokens"], null],
  ["session/store.ts", ["saveSession", "loadSession"], null],
  ["utils/money.ts", ["formatCents"], null],
] as const;
const IMPORTS: Array<[string, string]> = [
  ["auth/guard.ts", "engine/dispatch.ts"], ["api/routes.ts", "engine/dispatch.ts"], ["api/routes.ts", "auth/guard.ts"],
  ["checkout.tsx", "api/client.ts"], ["checkout.tsx", "utils/money.ts"], ["api/client.ts", "auth/guard.ts"],
  ["session/store.ts", "auth/guard.ts"], ["db/orders.sql", "db/schema.sql"], ["checkout.tsx", "session/store.ts"],
];
function atlasFixture() {
  const nodes: any[] = []; const edges: any[] = [];
  const fid = (p: string) => "file:" + p;
  FILES.forEach(([path, defs, intent]) => {
    nodes.push({ id: fid(path), origin: "atlas", path, type: "file", name: null, signature: null, intent: intent ?? null, parent_id: null, became: null, from_blueprint: null });
    (defs as readonly string[]).forEach((d, i) => nodes.push({
      id: path + "::" + d, origin: "atlas", path, type: path.endsWith(".tsx") && i === 0 ? "component" : path.endsWith(".sql") ? "table" : "function",
      name: d, signature: d + "(…)", intent: null, parent_id: fid(path), became: null, from_blueprint: null,
    }));
  });
  IMPORTS.forEach(([a, b]) => edges.push({ from_node: fid(a), to_node: fid(b), type: "imports" }));
  const file_tokens: Record<string, number> = { "engine/dispatch.ts": 4200, "auth/guard.ts": 1800, "checkout.tsx": 3100, "api/client.ts": 900,
    "api/routes.ts": 2100, "db/schema.sql": 1600, "db/orders.sql": 700, "theme.css": 2600, "session/store.ts": 1100, "utils/money.ts": 300 };
  return { origin: "atlas", nodes, edges, node_count: nodes.length, edge_count: edges.length, file_tokens,
    total_tokens: Object.values(file_tokens).reduce((a, b) => a + b, 0), file_count: FILES.length };
}
const CODEBASE_GET = atlasFixture();
const FILE_SOURCE = `// engine/dispatch.ts — every action passes through here.
// Permission first, audit always, laws enforced at the gate.
import { verifyToken, requireGrant } from "../auth/guard";
import { withAudit } from "./audit";

export async function dispatchAction(call: ActionCall, ctx: Ctx) {
  const agent = await verifyToken(ctx.token);
  requireGrant(agent, call.action);           // no grant, no run
  return withAudit(ctx, call, async () => {   // every mutation leaves a row
    const skill = resolveSkill(call.action);
    return skill(call.input, ctx);
  });
}

export function resolveGrant(agent: Agent, action: string) {
  return agent.grants.includes(action);
}
`;

const BLAST = {
  seeds: ["file:auth/guard.ts"],
  affected: ["file:engine/dispatch.ts", "file:api/routes.ts", "file:api/client.ts", "file:session/store.ts", "file:checkout.tsx"],
  affected_tests: ["auth/guard.test.ts", "api/routes.test.ts"],
  count: 5,
};

type Rule = { m: "GET" | "POST"; test: (path: string, body?: any) => boolean; give: (body?: any) => any };

const RULES: Record<string, Rule[]> = {
  hub: [
    { m: "POST", test: (p, b) => p.endsWith("/notebook/store") && b?.op === "list", give: () => NOTEBOOKS_LIST },
    { m: "POST", test: (p, b) => p.endsWith("/notebook/store") && b?.op === "get", give: () => NOTEBOOK_GET },
    { m: "POST", test: (p, b) => p.endsWith("/notebook/source") && b?.op === "list", give: () => NOTEBOOK_SOURCES },
    { m: "POST", test: (p) => p.endsWith("/notebook/corpus"), give: () => ({ ok: true, blocks: [], total_tokens: 41200 }) },
    { m: "POST", test: (p) => p.endsWith("/notebook/scope"), give: () => ({ ok: true, nodes: [], paths: ["src/auth", "src/api"], code_context_md: "" }) },
    { m: "POST", test: (p, b) => p.endsWith("/dispatch") && b?.action_name === "system.constitution.paper", give: (b) => (b?.input?.op === "get" ? { result: { result: { ok: true, paper: { ...PAPERS_LIST.papers[0], markdown: "# Auth audit\n\nThe study." } } } } : { result: { result: PAPERS_LIST } }) },
    { m: "POST", test: (p, b) => p.endsWith("/notebook/ask"), give: (b) => ({ ok: true, item: { id: 99, kind: "ask", title: String(b?.question ?? "your question"), body_md: "**Demo answer** — in the full Hub this is grounded in your code with citations to the exact files.", meta: { tier: "high", citations: [{ kind: "code", ref: "auth/guard.ts" }] } } }) },
  ],
  explorer: [
    { m: "POST", test: (p) => p.endsWith("/codebase/get"), give: () => CODEBASE_GET },
    { m: "POST", test: (p) => p.endsWith("/codebase/blast"), give: (b) => ({ ...BLAST, seeds: b?.node_ids ?? BLAST.seeds }) },
    { m: "POST", test: (p) => p.endsWith("/codebase/parse-health"), give: () => ({ ok: true, files: 10, parsed: 10, failed: 0 }) },
    { m: "POST", test: (p) => p.endsWith("/codebase/file/read"), give: (b) => ({ ok: true, path: b?.path ?? "engine/dispatch.ts", content: FILE_SOURCE, truncated: false, bytes: FILE_SOURCE.length }) },
  ],
  canvas: [
    { m: "POST", test: (p) => p.endsWith("/personas/dashboard"), give: () => ({ personas: [] }) },
    { m: "POST", test: (p) => p.endsWith("/cockpit/overview"), give: () => COCKPIT_OVERVIEW },
    { m: "POST", test: (p) => p.endsWith("/cockpit/session/get"), give: () => ({ ok: true, session: null }) },
    { m: "GET", test: (p) => p.endsWith("/cockpit/engines"), give: () => ({ engines: [{ id: "opencode", label: "OpenCode", ready: true }] }) },
    { m: "POST", test: (p) => p.endsWith("/codebase/get"), give: () => CODEBASE_GET },
  ],
  harness: [
    { m: "GET", test: (p) => p.startsWith("/api/v1/cards"), give: () => DEMO_CARDS },
    { m: "POST", test: (p) => p.endsWith("/cost/today"), give: () => ({ ok: true, total_usd: 1.84, by_tier: { low: 0.22, mid: 0.98, high: 0.64 } }) },
    { m: "POST", test: (p) => p.endsWith("/cockpit/pr/list"), give: () => ({ ok: true, prs: [] }) },
    { m: "POST", test: (p) => p.endsWith("/driver/snippet-gate"), give: () => ({ ok: true, mode: "pending", pending: [] }) },
  ],
};

// ── Canvas: the fleet overview (totals + per-session rows drive every chart) ──
const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) + " 10:0" + (n % 6) + ":00";
const COCKPIT_OVERVIEW = {
  ok: true,
  totals: { sessions: 4, active: 2, panes: 9, calls: 128, cost_usd: 3.1742 },
  sessions: [
    { id: 1, name: "ship the login screen", status: "active", panes: 3, calls: 46, cost_usd: 1.21, created_at: day(0) },
    { id: 2, name: "checkout revamp", status: "active", panes: 3, calls: 38, cost_usd: 0.94, created_at: day(1) },
    { id: 3, name: "migrate the mailer", status: "merged", panes: 2, calls: 29, cost_usd: 0.71, created_at: day(3) },
    { id: 4, name: "dark mode pass", status: "merged", panes: 1, calls: 15, cost_usd: 0.31, created_at: day(6) },
  ],
};

// ── Harness: a believable little board (CardSlim rows — never the real cards) ──
function card(slug: string, title: string, status: string, kind: string, n: number, extra: any = {}): any {
  return { id: n, slug, title, status, risk: 2, complexity: 3, priority: 2, score: null,
    accuracy_score: 92, accuracy_computed_at: day(1), parent_slug: null, driver_intent: kind,
    auto_merge: 0, created_at: day(9 - (n % 7)), updated_at: day(n % 4), last_failure_kind: null, last_failure_at: null, ...extra };
}
const DEMO_CARDS = [
  card("FEAT-LOGIN-FORM", "Login form — validation + a11y pass", "backlog", "execute", 101),
  card("FEAT-SESSION-STORE", "Session store: httpOnly cookie + refresh", "backlog", "execute", 102),
  card("EPIC-CHECKOUT", "Checkout revamp — cart to confirmation", "backlog", "decompose", 103),
  card("FEAT-RATE-LIMIT", "Rate-limit the auth endpoints", "doing", "execute", 104),
  card("FEAT-ORDER-EMAILS", "Order confirmation emails", "pr", "execute", 105),
  card("FEAT-GUARD-TESTS", "guard.ts — cover the 3 entry functions", "done", "execute", 106),
  card("FEAT-MONEY-UTILS", "Money formatting — one shared util", "done", "execute", 107),
  card("FIX-CART-ROUNDING", "Cart total rounding drift", "done", "execute", 108),
];

export function demoFixture(tab: string, method: "GET" | "POST", path: string, body?: any): any | undefined {
  for (const r of RULES[tab] ?? []) {
    if (r.m === method && r.test(path, body)) return r.give(body);
  }
  return undefined;
}
