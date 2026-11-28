// THE ROLES the operator hires (2026-09-23: "does someone would open an agent for a single job? … what I'd choose
// would be super jobs — Backender, Frontender, Designer, Product Owner"). A job is a stage inside a run; a ROLE is a
// domain of the codebase, and inside it every job still happens. The serve owns the list (serve/src/roles.rs) — this
// is the client's view of it, plus the pure bits the Studio needs before the fetch lands.
import { apiGet } from "@/loki/api/client";

/** THE THREE AN OPERATOR PICKS (2026-09-23: "add on the creation of agent: Cheaper, faster and Best"). `smarter` is
 *  a fourth the serve still answers to, for rows stored before this — it is not one of the three offered, because
 *  "all quality at any price" is a research setting rather than a hire. */
export type Objective = "cheaper" | "faster" | "best" | "smarter";
export const OBJECTIVES: Objective[] = ["cheaper", "faster", "best"];
/** what each objective is asked for — the same words the effort bar uses */
export const OBJECTIVE_ABOUT: Record<Objective, string> = {
  cheaper: "the cheapest merge that keeps at least 80% of the best score",
  faster: "the quickest merge that keeps at least 80% of the best score",
  best: "inside the 80% band: price first, then quality, then time — the table's own weight",
  smarter: "the best score there is, whatever it costs",
};

export type RoleAdapter = {
  key: string; name: string; about: string; domain: string; general: boolean; under: string | null;
  globs: string[];
  /** the rest of the adapter: what it knows, who it consults, what it may drive, what it boots with */
  skills: string[]; specialists: string[]; panes: string[]; packs: string[];
};
export type RoleMerge = { objective: Objective; brain: string | null; hands: string | null; samples: number;
  /** both of its engines are installed on this machine — an unbound side is no obstacle (the router picks) */ runnable?: boolean };
/** WHAT THIS MACHINE CAN RUN (2026-09-23: "you should also check the available AIs on the machine to make the merged
 *  agents available"). A merge is never two frontier models, so the cheap half always comes through OpenCode: no
 *  OpenCode, no merges at all, however many subscriptions the person has. `solo` is what is left, and is offered. */
export type Providers = { "claude-code": boolean; codex: boolean; opencode: boolean;
  frontier: string[]; cheap: string[]; solo: string[]; can_merge: boolean; why: string };
export const NO_PROVIDERS: Providers = { "claude-code": false, codex: false, opencode: false, frontier: [], cheap: [], solo: [], can_merge: false, why: "" };
export type RoleProposal = { role: RoleAdapter; merges: RoleMerge[]; why: string };
/** a role as the serve sends it — its adapter and the three winners measured on its domain */
export type RoleWithMerges = RoleAdapter & { merges?: RoleMerge[] };

export async function fetchRoles(purpose?: string, size = "l"): Promise<{ roles: RoleWithMerges[]; proposal: RoleProposal | null; providers: Providers }> {
  const q = new URLSearchParams({ size, ...(purpose?.trim() ? { purpose: purpose.trim() } : {}) });
  try {
    const r = await apiGet<{ roles?: RoleWithMerges[]; proposal?: RoleProposal | null; providers?: Providers }>(`/api/v1/settings/roles?${q}`, { timeoutMs: 15_000 });
    return { roles: Array.isArray(r?.roles) ? r.roles : [], proposal: r?.proposal ?? null, providers: r?.providers ?? NO_PROVIDERS };
  } catch { return { roles: [], proposal: null, providers: NO_PROVIDERS }; }
}
/** THE SOLO MODELS a machine can run, as choices (2026-09-23: "any way we can use solo AIs too, so add to the roles
 *  the solo AIs available too"). One model doing both halves — what is left when a merge cannot be bound, and a
 *  perfectly good answer for anyone who wants one. Pure. */
export const SOLO_LABEL: Record<string, string> = {
  "claude-code": "Claude", codex: "Codex", deepseek: "DeepSeek", kimi: "Kimi", qwen: "Qwen",
};
export function soloChoices(p: Providers): { key: string; label: string }[] {
  return (p.solo ?? []).map((k) => ({ key: k, label: SOLO_LABEL[k] ?? k }));
}

/** the general roles first, then each one's specialisations under it — the order the Studio lists them in. Pure. */
export function byFamily<T extends RoleAdapter>(roles: T[]): { parent: T; under: T[] }[] {
  return roles.filter((r) => r.general).map((parent) => ({ parent, under: roles.filter((r) => r.under === parent.key) }));
}
/** a one-line summary of what a role's adapter holds, for the tile's subtitle. Pure. */
export function adapterLine(r: RoleAdapter): string {
  const bits = [
    `${r.skills.length} skill${r.skills.length === 1 ? "" : "s"}`,
    `${r.specialists.length} specialist${r.specialists.length === 1 ? "" : "s"}`,
    r.panes.length ? `${r.panes.length} tool${r.panes.length === 1 ? "" : "s"}` : "",
    r.packs.length ? `${r.packs.join(" · ")}` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}
/** the merge a role runs for an objective, as a sentence — "—" when nothing has been measured for it yet. Pure. */
export function mergeLine(m: RoleMerge | undefined, name: (k: string) => string): string {
  if (!m || (!m.brain && !m.hands)) return "not measured yet";
  const b = m.brain ? name(m.brain) : "—", h = m.hands ? name(m.hands) : "—";
  return `${b} decides · ${h} produces${m.samples ? ` · ${m.samples} sample${m.samples === 1 ? "" : "s"}` : ""}`;
}
