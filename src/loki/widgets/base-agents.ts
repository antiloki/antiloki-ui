// THE BASE AGENTS of the Studio (operator 2026-09-23: "take out opencode option from agents studio, add a
// model name. We have 3 now: DeepSeek, Kimi and Qwen"). A base agent is an engine plus, for the OpenCode
// ones, the model it starts on — the pane still runs the `opencode` engine, the preset model rides in its
// settings (`settings.model`, read by agent::start) and its theme dresses the pane. Pure data.
export type BaseAgent = {
  /** the tile's id — the face slug is `base-<id>` */
  id: "claude-code" | "codex" | "deepseek" | "kimi" | "qwen";
  /** the pane kind the serve runs */
  engine: "claude-code" | "codex" | "opencode";
  label: string;
  /** the model the session starts on (OpenCode ids are provider-qualified — cli::opencode_model_id) */
  model?: string;
  /** the theme the pane spawns dressed in (agent-themes.ts) */
  theme: "claude" | "codex" | "deepseek" | "kimi" | "qwen";
  desc: string;
};
export const BASE_AGENTS: readonly BaseAgent[] = [
  { id: "claude-code", engine: "claude-code", label: "Claude Code", theme: "claude", desc: "Claude Code on your subscription, in a scoped box — Heimdall routes its asks first." },
  { id: "codex", engine: "codex", label: "Codex", theme: "codex", desc: "OpenAI Codex CLI on your subscription, in a scoped box. Same rails as Claude Code — unmeasured while this box's ChatGPT Go allowance is spent (it reopens Oct 9th 2026)." },
  { id: "deepseek", engine: "opencode", label: "DeepSeek", model: "opencode/deepseek-v4-pro", theme: "deepseek", desc: "DeepSeek V4 Pro via OpenCode — the lookup and planner winner of the benchmarks; 10× cheaper than Sonnet on the same S tasks." },
  { id: "kimi", engine: "opencode", label: "Kimi", model: "opencode/kimi-k2.7-code", theme: "kimi", desc: "Kimi K2.7 via OpenCode — a planner that kept 37/37 tests over a DeepSeek worker on the L task." },
  { id: "qwen", engine: "opencode", label: "Qwen", model: "opencode/qwen3.6-plus", theme: "qwen", desc: "Qwen 3.6 Plus via OpenCode — the file-editor winner: 5/5 S tasks at $0.011 a run." },
];
export function baseAgent(id: string | null | undefined): BaseAgent | undefined { return BASE_AGENTS.find((b) => b.id === id); }
/** The base agent a pane is: its engine, and for OpenCode the model it runs. Pure. */
export function baseAgentOf(engine: string | null | undefined, model?: string | null): BaseAgent | undefined {
  const m = String(model ?? "").toLowerCase();
  if (engine === "opencode" || engine === "opencode-direct") return BASE_AGENTS.find((b) => b.engine === "opencode" && m.includes(b.id)) ?? undefined;
  return BASE_AGENTS.find((b) => b.engine === engine);
}
