// THE ENGINE (operator 2026-09-19: "use our local AI subscription"): one call to the coding CLI the
// operator pinned — or, when nothing is pinned, the one the serve picks — headless, READ-ONLY, in the workspace root. It
// can read and search the repository itself, which is what the X-ray's AI features need (an ultra
// review, more data stories, a component's dossier). OpenAI-shaped, via /api/v1/cli-llm/chat/completions
// on both the dev BE and antiloki-serve. Pure over the network: no state here.
import { apiPost } from "./client";

/** THE FIVE SEATS AND THE GATEWAY (the product's pivot, 2026-09-27) — the serve's `Engine::all()`. */
export const ENGINE_KEYS = ["claude-code", "codex", "gemini", "grok", "cursor", "opencode"] as const;
export type EngineKey = (typeof ENGINE_KEYS)[number];
/** THE ONE LIST OF ENGINES A PANE CAN BE (audit 2026-10-01): chats, the cockpit view and the pane body each kept their own copy, and the old cockpit view's copy knew four, so a Cursor / Gemini / Grok pane was drawn as no engine at all. */
export const CHAT_ENGINES = ENGINE_KEYS;
export type ChatEngine = EngineKey;
/** is this `pane_kind` a terminal engine pane (a box of its own): any seat, plus OpenCode wired to an OpenAI key. */
export const isEnginePaneKind = (k: unknown): boolean => typeof k === "string" && ((ENGINE_KEYS as readonly string[]).includes(k) || k === "opencode-direct" || /^x-[a-z0-9-]+$/.test(k));   // `x-…` is a provider the person added (RFC 0023)
/** a seat that runs its vendor's own CLI on the operator's login - no antiloki proxy (everything but the two OpenCode kinds). */
export const isSubscriptionPaneKind = (k: unknown): boolean => isEnginePaneKind(k) && k !== "opencode" && k !== "opencode-direct" && !String(k).startsWith("x-");
/** a call that names no seat asks for this, and the serve picks the one Heimdall plans on (`cli:auto`) */
export type AskEngine = EngineKey | "auto";
/** the operator's pin (the antiChat's engine picker), or `null` = NOTHING IS PINNED and the serve decides.
 *  It used to answer Claude Code, so a machine whose Claude subscription had ended asked a switched-off seat for everything
 *  (operator 2026-10-01, "Engine config also"). */
export function pinnedEngine(): EngineKey | null {
  try { const v = localStorage.getItem("antiloki:chat-engine"); const e = v?.replace(/^cli:/, ""); return (ENGINE_KEYS as readonly string[]).includes(e ?? "") ? (e as EngineKey) : null; } catch { return null; }
}
export type AskOpts = { system?: string; json?: boolean; engine?: AskEngine; timeoutMs?: number; maxTurns?: number; tier?: "low" | "mid" | "high" };
/** A prompt-catalog call (2026-09-19): the serve holds the text (Settings › Prompts edits it), the FE sends the base + vars. */
export type TemplateAsk = { template: string; vars: Record<string, unknown> };
export type AskResult = { ok: true; text: string; json: any | null; engine: AskEngine; ms: number } | { ok: false; error: string; engine: AskEngine; ms: number };

/** the JSON inside a reply — a bare object/array, or the first ```json fence; null when there is none. Pure. */
export function extractJson(text: string): any | null {
  const t = (text ?? "").trim();
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };
  const direct = tryParse(t); if (direct !== undefined) return direct;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) { const v = tryParse(fence[1].trim()); if (v !== undefined) return v; }
  const a = t.indexOf("["), o = t.indexOf("{");
  const start = a === -1 ? o : o === -1 ? a : Math.min(a, o);
  if (start >= 0) { const end = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}")); if (end > start) { const v = tryParse(t.slice(start, end + 1)); if (v !== undefined) return v; } }
  return null;
}

export async function askEngine(prompt: string | TemplateAsk, opts: AskOpts = {}): Promise<AskResult> {
  const engine: AskEngine = opts.engine ?? pinnedEngine() ?? "auto";
  const t0 = Date.now();
  const tpl = typeof prompt === "string" ? null : prompt;
  const messages = [...(opts.system ? [{ role: "system", content: opts.system }] : []), ...(tpl ? [] : [{ role: "user", content: prompt as string }])];
  const r: any = await apiPost(`/api/v1/cli-llm/chat/completions`, { model: `cli:${engine}`, messages, ...(tpl ? { template: tpl.template, vars: tpl.vars } : {}), ...(opts.tier ? { tier: opts.tier } : {}), ...(opts.json ? { response_format: { type: "json_object" } } : {}), ...(opts.maxTurns ? { max_turns: opts.maxTurns } : {}) }, { timeoutMs: opts.timeoutMs ?? 600_000 });
  const ms = Date.now() - t0;
  const d = r?.result ?? r;
  const text: string | undefined = d?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: String(d?.error?.message ?? "the engine returned no text"), engine, ms };
  return { ok: true, text, json: opts.json ? extractJson(text) : null, engine, ms };
}
