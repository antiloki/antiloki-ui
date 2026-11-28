// THE USAGE WINDOW'S NUMBERS (approved mockup 2026-11-21): the fuel payload shaped into companies with their models, each with a value in the chosen measure, its share and OpenRouter's price. Pure, tested; the window only draws it.
import type { Fuel } from "./fuel-mini";
export type Measure = "cost" | "tokens" | "requests";
export type UModel = { model: string; house: string; value: number; share: number; tokens: number; calls: number; or_in: number | null; or_out: number | null; or_cost: number | null; priced: boolean };
export type UCompany = { house: string; label: string; value: number; models: UModel[] };
export const HOUSE_LABEL: Record<string, string> = { claude: "Anthropic", codex: "OpenAI", opencode: "OpenCode", gemini: "Google", cursor: "Cursor", grok: "xAI", teams: "Team runs", unknown: "Other" };
export const houseLabel = (h: string) => HOUSE_LABEL[h] ?? h.charAt(0).toUpperCase() + h.slice(1);
/** What one model's row is worth in the measure: cost = the same tokens at OpenRouter's price (a model without a price counts 0 and is marked); team runs carry what they spent. Pure. */
export function valueOf(m: Fuel["models"][number], measure: Measure): number {
  if (measure === "tokens") return m.tokens || 0; if (measure === "requests") return m.calls || 0;
  return typeof m.or_cost === "number" ? m.or_cost : m.house === "teams" ? m.cost || 0 : 0;
}
/** Companies, biggest first, each with its models biggest first and shares of the whole. Pure. */
export function companiesOf(f: Fuel | null, measure: Measure): { companies: UCompany[]; total: number; unpriced: number } {
  const rows = (f?.models ?? []).filter((m) => m.calls > 0 || m.tokens > 0 || m.cost > 0); const total = rows.reduce((a, m) => a + valueOf(m, measure), 0) || 0; const by = new Map<string, UCompany>(); let unpriced = 0;
  for (const m of rows) {
    const v = valueOf(m, measure); const priced = typeof m.or_cost === "number" || m.house === "teams"; if (!priced) unpriced += 1;
    const c = by.get(m.house) ?? { house: m.house, label: houseLabel(m.house), value: 0, models: [] }; c.value += v;
    c.models.push({ model: m.model, house: m.house, value: v, share: total > 0 ? v / total : 0, tokens: m.tokens || 0, calls: m.calls || 0, or_in: m.or_in ?? null, or_out: m.or_out ?? null, or_cost: typeof m.or_cost === "number" ? m.or_cost : null, priced });
    by.set(m.house, c);
  }
  const companies = [...by.values()].map((c) => ({ ...c, models: c.models.sort((a, b) => b.value - a.value) })).sort((a, b) => b.value - a.value);
  return { companies, total, unpriced };
}
export const fmtMeasure = (v: number, m: Measure): string => (m === "cost" ? (v > 0 && v < 0.01 ? "<$0.01" : `$${v < 10 ? v.toFixed(2) : v.toFixed(1)}`) : m === "tokens" ? (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${Math.round(v)}`) : Math.round(v).toLocaleString("en-US"));
export const fmtPrice = (n: number | null) => (n == null ? "—" : n >= 10 ? n.toFixed(0) : n.toString());
/** The cost figure that goes on the bottom bar: this week's tokens at OpenRouter's price, plus what the team runs spent. Pure. */
export function barCost(f: Fuel | null): number | null { if (!f) return null; return (f.models ?? []).reduce((a, m) => a + valueOf(m, "cost"), 0); }
