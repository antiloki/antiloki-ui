// THE MODEL BUTTON'S RULES (operator 2026-11-10: "an easy button to change the model of each agent - not the provider, the model, like Haiku, Sonnet"). Pure.
import type { ModelChoice } from "./api";

/** What the button says: the chosen model, else what the terminal reports it is running, else "model". A long id keeps its head and tail. */
export function modelLabel(chosen: string, running: string | undefined): string {
  const t = (chosen || running || "model").trim(); return t.length > 26 ? `${t.slice(0, 14)}…${t.slice(-9)}` : t;
}
/** The list under the button: what a person typed in the filter box narrows it; a typed id that is not in the list is offered as itself ("use <id>"). */
export function pickList(models: ModelChoice[], filter: string): { choices: ModelChoice[]; custom: string | null } {
  const q = filter.trim().toLowerCase(); const choices = q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)) : models;
  const custom = q && /^[A-Za-z0-9.\-_:/[\]=,]{1,80}$/.test(filter.trim()) && !models.some((m) => m.id.toLowerCase() === q) ? filter.trim() : null;
  return { choices, custom };
}
/** What happens after the pick, in a sentence the person reads under the button. */
export function appliedNote(applied: string | undefined, model: string): string {
  const what = model || "the engine's default";
  return applied === "live" ? `switched to ${what} (the conversation goes on)` : applied === "restart" ? `restarting this agent on ${what} (its conversation starts again)` : `${what} will be used the next time this agent starts`;
}

/** WHAT A MODEL IS LIKE, for the bars in the picker (approved mockup 2026-11-18, from the idea of AffectUI's Model Picker). Typical figures by family on a 0 to 100 scale (higher is faster / better / dearer), the first word in seconds and a rough price per minute of work;
 *  `measured` is only what antiloki itself measured on this machine (2026-11-17 team variants). A model it does not know gets no bars. Pure. */
export type Traits = { family: string; speed: number; quality: number; cost: number; first: string; price: string; measured?: string };
export function traitsOf(id: string): Traits | null {
  const m = id.toLowerCase();
  if (/haiku/.test(m)) return { family: "Claude Haiku", speed: 92, quality: 76, cost: 12, first: "0.5 s", price: "about $0.006/min", measured: "extract 3 of 3, review 4 of 4, classify 7 of 8" };
  if (/sonnet/.test(m)) return { family: "Claude Sonnet", speed: 62, quality: 90, cost: 55, first: "1.1 s", price: "about $0.03/min" };
  if (/opus/.test(m)) return { family: "Claude Opus", speed: 35, quality: 98, cost: 92, first: "1.9 s", price: "about $0.08/min" };
  if (/gpt|codex|o[0-9]/.test(m)) return { family: "OpenAI", speed: 70, quality: 92, cost: 60, first: "1.0 s", price: "about $0.06/min" };
  if (/gemini/.test(m)) return { family: "Gemini", speed: 75, quality: 86, cost: 30, first: "0.9 s", price: "about $0.02/min" };
  if (/composer|cursor|grok/.test(m)) return { family: "Cursor", speed: 60, quality: 85, cost: 45, first: "1.0 s", price: "Cursor's own pool", measured: "same result as Haiku on one task, 5 times the cost" };
  if (/qwen|llama|lfm|local|mistral|phi/.test(m)) return { family: "Local", speed: 48, quality: 62, cost: 0, first: "0.3 s", price: "free", measured: "classify 8 of 8, extract 3 of 3 (4b); 0.6b too weak" };
  return null;
}
