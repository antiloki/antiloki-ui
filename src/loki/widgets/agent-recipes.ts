// AGENT RECIPES (operator 2026-09-20: "an add button at agents so we can create new agents: choose a base
// provider, a default theme, an icon, default scope, then mix specialists and skills, and create").
// A recipe is a Studio agent tile of the operator's own making; a pane born from it carries the provider,
// the scope, the theme, the specialists and the skills. Persisted by the serve (agent_recipes).
import { apiGet, apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { apiPostStrict, reasonOf } from "@/loki/api/post-strict";
import type { AgentThemeKey } from "@/loki/cockpit/agent-themes";
import type { EngineKey } from "@/loki/api/engine";

/** WHAT AN AGENT CARRIES (operator 2026-09-23: "an agent carries role, skills, scope, specialists, avatar and its
 *  episodes"). The role is what a person hires; everything else is how it does the job. Every agent has one — the
 *  serve fills it from the purpose for anything made before the field existed. */
export type AgentRecipe = {
  /** A BOX OF ITS OWN (2026-09-24): "own" = its own worktree with a branch per episode; "" = the workspace */
  box?: "own" | "";
  slug: string; name: string; icon: string; provider: EngineKey; theme: AgentThemeKey | string; /** the merge the agent is made of — brain × hands (2026-09-23) */ pair?: RecipePair;
  /** the roles.rs key this agent was hired as */ role?: string;
  /** which of the three the merge was chosen for: cheaper · faster · best */ objective?: string;
  description: string; scope: string[]; specialists: string[]; skills: string[]; ask: string;
  created_at?: string; updated_at?: string;
};
/** THE THREE AN OPERATOR PICKS (2026-09-23: "add on the creation of agent: Cheaper, faster and Best"). The same
 *  measured rows, asked three different questions. `smarter` still exists in the API for stored rows. */
export const OBJECTIVES = [
  { key: "cheaper", label: "Cheaper", note: "the cheapest merge that keeps at least 80% of the best score" },
  { key: "faster", label: "Faster", note: "the quickest merge that keeps at least 80% of the best score" },
  { key: "best", label: "Best", note: "inside the 80% band: price first, then quality, then time" },
] as const;
export type ObjectiveKey = (typeof OBJECTIVES)[number]["key"];
/** THE MERGE MODELS (operator 2026-09-23: "take out the OpenCode option, add a model name — DeepSeek, Kimi and Qwen"):
 *  what an agent can be made of, by name. Claude and Codex are their CLIs; DeepSeek, Kimi and Qwen run through OpenCode
 *  (the pipe is not a choice). A recipe picks a BRAIN (plans, verifies, judges — the pane you type into) and HANDS
 *  (edits, looks up, reports); the provider is the brain's engine. */
export type RecipeSide = { engine: AgentRecipe["provider"]; model?: string };
export type RecipePair = { name: string; brain: RecipeSide; hands: RecipeSide };
export const MERGE_MODELS: { key: string; label: string; glyph: string; engine: AgentRecipe["provider"]; model?: string; /** a big lab's own subscription model — two of them never go in one merge (2026-09-23) */ frontier?: boolean; note: string }[] = [
  { key: "claude", label: "Claude", glyph: "✦", engine: "claude-code", frontier: true, note: "your Anthropic subscription · Sonnet by measurement, Opus for the QA gate" },
  { key: "codex", label: "Codex", glyph: "◇", engine: "codex", frontier: true, note: "your ChatGPT subscription · the reasoning effort is the tier" },
  { key: "gemini", label: "Antigravity", glyph: "✧", engine: "gemini", frontier: true, note: "your Google AI plan · Antigravity" },
  { key: "grok", label: "Grok", glyph: "✕", engine: "grok", frontier: true, note: "your xAI plan · the Grok CLI" },
  { key: "cursor", label: "Cursor", glyph: "▣", engine: "cursor", frontier: true, note: "your Cursor plan · Composer is its own pool" },
  { key: "deepseek", label: "DeepSeek", glyph: "◆", engine: "opencode", note: "v4 Pro plans and reads, v4 Flash writes — the measured 5× cheaper hands" },
  { key: "kimi", label: "Kimi", glyph: "◈", engine: "opencode", model: "opencode/kimi-k2.7-code", note: "K2.7 code — being measured; planned an L at 37/37 for four cents" },
  { key: "qwen", label: "Qwen", glyph: "◉", engine: "opencode", model: "opencode/qwen3.6-plus", note: "3.6 Plus — 5/5 on S raw at $0.011; the editor-S winner" },
];
/** THE RULE (operator 2026-09-23): "never mix frontier models — always a frontier + cheaper, or 2 cheapers." A merge
 *  exists to put cheap hands under a good brain; two frontier sides buy both prices and the slower of the two speeds.
 *  Returns why a pair is refused, or null. Pure — tested. */
export function isFrontierKey(key: string): boolean { return !!MERGE_MODELS.find((m) => m.key === key)?.frontier; }
export function pairProblem(brainKey: string, handsKey: string): string | null {
  if (!isFrontierKey(brainKey) || !isFrontierKey(handsKey)) return null;
  const l = (k: string) => MERGE_MODELS.find((m) => m.key === k)?.label ?? k;
  return `${l(brainKey)} and ${l(handsKey)} are both frontier models — pair a frontier brain with cheap hands (DeepSeek, Kimi, Qwen), or two cheap ones`;
}
// a side that is not there is no merge key (it used to read as Claude - "no component defaults to Claude", 2026-10-01); a seat's key is its engine's, Claude's is "claude"
export const mergeKeyOf = (side: RecipeSide | undefined): string => { if (!side) return ""; if (side.engine !== "opencode") return side.engine === "claude-code" ? "claude" : side.engine; return side.model?.includes("kimi") ? "kimi" : side.model?.includes("qwen") ? "qwen" : "deepseek"; };
export const mergeLabel = (p: RecipePair | undefined): string => { const l = (k: string) => MERGE_MODELS.find((m) => m.key === k)?.label ?? k; return p ? `${l(mergeKeyOf(p.brain))} × ${l(mergeKeyOf(p.hands))}` : "solo"; };
// A KEY THAT IS NOT A MERGE MODEL IS NEVER CLAUDE (audit 2026-10-01: the fallback was MERGE_MODELS[0]). A seat's own key means that seat; anything else is what the caller says (`fallback`, e.g. the seat the serve plans on),
// and with nothing said the OpenCode gateway - the same rule as widgets/engines.ts sideOf, which carries everything that is not one of the seats.
export const sideOf = (key: string, fallback: RecipeSide["engine"] = "opencode"): RecipeSide => {
  const m = MERGE_MODELS.find((x) => x.key === key);
  if (m) return m.model ? { engine: m.engine, model: m.model } : { engine: m.engine };
  const seat = RECIPE_PROVIDERS.find((x) => x.key === key);
  return { engine: seat ? seat.key : fallback };
};
export const RECIPE_PROVIDERS: { key: AgentRecipe["provider"]; label: string; glyph: string; note: string }[] = [
  { key: "claude-code", label: "Claude Code", glyph: "✦", note: "your Anthropic subscription · the chat session (or the terminal)" },
  { key: "codex", label: "Codex", glyph: "◇", note: "your ChatGPT subscription · the terminal" },
  { key: "gemini", label: "Antigravity", glyph: "✧", note: "your Google AI plan · Antigravity" },
  { key: "grok", label: "Grok", glyph: "✕", note: "your xAI plan · the Grok CLI" },
  { key: "cursor", label: "Cursor", glyph: "▣", note: "your Cursor plan · cursor-agent" },
  { key: "opencode", label: "OpenCode", glyph: "⌨", note: "your OpenCode login or a BYOK key · the terminal" },
];
export const RECIPE_ICONS = ["🤖", "🧠", "🛠️", "🧪", "📝", "🔍", "🎨", "🧭", "🛡️", "⚡", "🧹", "📦", "🗺️", "🔬", "🪄", "🏗️", "🧩", "📊", "🐛", "🚀", "🦉", "🐙", "🦊", "🐺"];

/** The empty recipe the wizard starts from. `seat`: the provider it opens on - the seat the serve plans on (useSeats().defaultKey), never a fixed Claude (review 2026-10-01).
 *  None known yet = no provider, which `recipeProblems` names, so nothing is saved on a guess. No pair: a new agent is solo until a merge is picked. Pure. */
export function blankRecipe(seat?: EngineKey | null): AgentRecipe { return { slug: "", name: "", icon: "face:egg:#7c5cf0", provider: (seat ?? "") as EngineKey, theme: "", description: "", scope: ["**"], specialists: [], skills: [], ask: "", box: "" }; }   // the whole project, until it is narrowed (operator 2026-10-11)
/** A merge side the caller has no measurement for: the seat the serve plans on - or nothing, and the caller leaves the pair out. Pure. */
/** What the wizard refuses to create without. Pure — tested. */
export function recipeProblems(r: AgentRecipe): string[] {
  const out: string[] = [];
  if (!r.name.trim()) out.push("a name");
  if (!RECIPE_PROVIDERS.some((p) => p.key === r.provider)) out.push("a provider");
  if (!r.scope.length) out.push("a default scope (the files it may edit)");
  return out;
}
/** The pane settings a recipe becomes: the availability lists and the theme, nothing else. Pure — tested. */
export function recipeSettings(r: AgentRecipe): Record<string, any> {
  // no theme (the default) = the engine's own look: the key is left out so the pane picks it, instead of pinning an empty or a retired one
  const out: Record<string, any> = { recipe: r.slug };
  if (r.theme) out.theme = r.theme;
  if (r.specialists.length) out.specialists = r.specialists;
  if (r.skills.length) out.skills = r.skills;
  return out;
}

export async function listRecipes(): Promise<AgentRecipe[]> {
  try { const r = unwrap(await apiGet(`/api/v1/cockpit/agents/recipes`, { timeoutMs: 10_000 })); return Array.isArray(r?.recipes) ? r.recipes : []; } catch { return []; }
}
export async function saveRecipe(r: AgentRecipe): Promise<{ ok: boolean; recipe?: AgentRecipe; error?: string }> {
  try { const d = unwrap(await apiPost(`/api/v1/cockpit/agents/recipes`, r, { timeoutMs: 15_000 })); return d?.ok ? { ok: true, recipe: d.recipe } : { ok: false, error: d?.error ?? "could not save" }; } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}
/** ARCHIVE (operator 2026-09-23: "add a button on settings of an agent to archive that agent"). It leaves the
 *  roster; it is NOT deleted, because its episodes, its runs and the money under its face are the record of work
 *  that happened. Pass `false` to bring it back with all of that intact. */
export async function archiveRecipe(slug: string, archived = true): Promise<{ ok: boolean; error?: string }> {
  try {
    // strict (audit 2026-10-01): a null answer (refusal, dead serve) read as `ok` here, so an agent that was never archived left the roster
    const r: any = await apiPostStrict(`/api/v1/cockpit/agents/recipes/archive`, { slug, archived }, { timeoutMs: 30_000 });
    const d = r?.result ?? r;
    return { ok: d?.ok !== false, error: d?.error };
  } catch (e) { return { ok: false, error: reasonOf(e) }; }
}
export async function deleteRecipe(slug: string): Promise<boolean> {
  try { const d = unwrap(await apiPost(`/api/v1/cockpit/agents/recipes/delete`, { slug }, { timeoutMs: 10_000 })); return !!d?.ok; } catch { return false; }
}
