import * as React from "react";
import { C } from "@/loki/theme";
import { ChibiFace, hashOf, type Mood } from "@/loki/chat/chibi-face";
import type { Status } from "./model";

// EACH MODEL ITS OWN ICON (operator 2026-10-11: "show the avatars of the agents that did or failed the episodes and the specific models that did it, each model with its own icon").
// An icon is a small drawn glyph per model FAMILY (our own simple marks, not any company's logo), on a tile in the family's colour, plus a dot whose colour comes from the exact model's name - so
// `cursor · composer-2.5` and `cursor · composer-2` read as relatives and still differ. The agent is a face (the product's own chibi faces), whose mood says what happened: working, done, failed.

export type Family = "claude" | "codex" | "cursor" | "gemini" | "grok" | "opencode" | "deepseek" | "kimi" | "qwen" | "other";
export const FAMILY: Record<Family, { label: string; color: string }> = {
  claude: { label: "Claude", color: "#d97757" }, codex: { label: "Codex", color: "#19a974" }, cursor: { label: "Cursor", color: "#9aa0a6" }, gemini: { label: "Antigravity", color: "#6c8cff" },
  grok: { label: "Grok", color: "#c7c7cc" }, opencode: { label: "OpenCode", color: "#2bb8b0" }, deepseek: { label: "DeepSeek", color: "#4d6bfe" }, kimi: { label: "Kimi", color: "#a06bff" },
  qwen: { label: "Qwen", color: "#7c5cf0" }, other: { label: "model", color: "#7a7a82" },
};

/** `cursor:composer-2.5` -> its engine and model. Anything without a colon is an engine alone, or a name (an agent). Pure - tested. */
export function seatOf(s: string): { engine: string; model: string } {
  const i = s.indexOf(":");
  return i < 0 ? { engine: s, model: "" } : { engine: s.slice(0, i), model: s.slice(i + 1) };
}
/** The family of a seat: the engine's own, except that OpenCode hosts many - it is told apart by the model's name. Pure - tested. */
export function familyOf(engine: string, model = ""): Family {
  const e = engine.toLowerCase(), m = model.toLowerCase();
  if (e === "claude-code" || e === "claude") return "claude";
  if (e === "codex") return "codex";
  if (e === "cursor" || e === "cursor-agent") return "cursor";
  if (e === "gemini" || e === "agy" || e === "antigravity") return "gemini";
  if (e === "grok") return "grok";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("kimi") || m.includes("moonshot")) return "kimi";
  if (m.includes("qwen")) return "qwen";
  if (m.includes("claude") || m.includes("sonnet") || m.includes("opus") || m.includes("haiku")) return "claude";
  if (m.includes("gpt") || m.includes("codex")) return "codex";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("grok")) return "grok";
  if (e === "opencode" || e === "opencode-direct") return "opencode";
  return "other";
}
/** Is this string a seat (an engine we know), as opposed to an agent's or a person's name? Pure - tested. */
export function isSeat(s: string): boolean {
  const { engine, model } = seatOf(s);
  return model !== "" || familyOf(engine) !== "other" || engine === "opencode" || engine === "opencode-direct";
}
/** The model's short name for a label: the part after the last slash, without an @effort suffix. Pure - tested. */
export function modelLabel(model: string): string { return model.split("/").pop()!.split("@")[0]; }
/** A stable accent for the exact model, so two models of one family differ. Pure. */
export function accentOf(model: string): string { return `hsl(${hashOf(model || "-") % 360} 70% 62%)`; }

const GLYPH: Record<Family, React.ReactNode> = {
  claude: <path d="M8 2v12M2 8h12M3.8 3.8l8.4 8.4M12.2 3.8l-8.4 8.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  codex: <><path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="8" cy="8" r="1.7" fill="currentColor" /></>,
  cursor: <path d="M3.2 2.4l9.4 4.3-4 1.4-1.4 4z" fill="currentColor" />,
  gemini: <path d="M8 1.6C8.6 5.2 10.8 7.4 14.4 8 10.8 8.6 8.6 10.8 8 14.4 7.4 10.8 5.2 8.6 1.6 8 5.2 7.4 7.4 5.2 8 1.6z" fill="currentColor" />,
  grok: <><circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M4.6 11.4l6.8-6.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  opencode: <path d="M6 4.2L2.4 8 6 11.8M10 4.2L13.6 8 10 11.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  deepseek: <path d="M8 1.8c2.6 2.8 4 4.8 4 6.7a4 4 0 1 1-8 0c0-1.9 1.4-3.9 4-6.7z" fill="currentColor" />,
  kimi: <path d="M10.4 2.2a6 6 0 1 0 3.4 8.6A5 5 0 0 1 10.4 2.2z" fill="currentColor" />,
  qwen: <><circle cx="7.4" cy="7.4" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10.2 10.2l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  other: <rect x="3.4" y="3.4" width="9.2" height="9.2" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />,
};

/** One model's icon. `engine:model` (or an engine and a model) in; a tile out, with the exact model in its tooltip. */
export function ModelIcon({ seat, engine, model, size = 18 }: { seat?: string; engine?: string; model?: string; size?: number }) {
  const s = seat ? seatOf(seat) : { engine: engine ?? "", model: model ?? "" };
  const fam = familyOf(s.engine, s.model); const f = FAMILY[fam];
  return (
    <span data-testid={`model-icon-${fam}`} data-model={s.model} title={`${f.label}${s.model ? ` · ${modelLabel(s.model)}` : ""}`}
      style={{ position: "relative", display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: size * 0.28, flex: "0 0 auto",
        background: `color-mix(in oklab, ${f.color} 20%, transparent)`, color: f.color, border: `1px solid color-mix(in oklab, ${f.color} 45%, transparent)` }}>
      <svg viewBox="0 0 16 16" width={size * 0.72} height={size * 0.72} aria-hidden>{GLYPH[fam]}</svg>
      {s.model && <i style={{ position: "absolute", right: -2, bottom: -2, width: size * 0.34, height: size * 0.34, borderRadius: "50%", background: accentOf(s.model), border: `1.5px solid ${C.bg}` }} />}
    </span>
  );
}

/** What happened to an episode, as the agent's face moods say it: failed sags, working moves, done drifts, the rest rests. Pure - tested. */
export function moodOf(status: Status): Mood { return status === "failed" ? "failed" : status === "doing" ? "working" : status === "done" ? "live" : "idle"; }

/** WHO DID A EPISODE: the agent's face (a small red ✕ on its corner when it failed - no ring round it) and the exact model's icon. An episode nobody did yet shows an empty dashed mark. */
export function Who({ assignee, engine, model, status, size = 22, showName, icon = true }: { assignee: string; engine?: string; model?: string; status: Status; size?: number; showName?: boolean; /** draw the model's icon beside the face (not on the list, where the models have their own column) */ icon?: boolean }) {
  const seat = engine ? { engine, model: model ?? "" } : isSeat(assignee) ? seatOf(assignee) : null;
  const slug = assignee || (seat ? `${seat.engine}:${seat.model}` : "");
  if (!slug) return <span title="not assigned" style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", border: `1px dashed ${C.border}`, flex: "0 0 auto" }} />;
  const failed = status === "failed";
  return (
    <span data-testid="who" data-status={status} style={{ display: "inline-flex", alignItems: "center", gap: 5, flex: "0 0 auto" }}>
      <span title={`${assignee || slug}${failed ? " - failed" : ""}`} style={{ position: "relative", display: "inline-grid" }}>
        <ChibiFace slug={slug} mood={moodOf(status)} size={size} />
        {failed && <i data-testid="who-failed" aria-hidden style={{ position: "absolute", right: -3, top: -3, width: Math.max(8, size * 0.38), height: Math.max(8, size * 0.38), borderRadius: "50%", background: C.bad, border: `1.5px solid ${C.bg}`, display: "grid", placeItems: "center", color: "#fff", fontSize: Math.max(6, size * 0.26), fontStyle: "normal", lineHeight: 1 }}>✕</i>}
      </span>
      {seat && icon && <ModelIcon engine={seat.engine} model={seat.model} size={Math.round(size * 0.8)} />}
      {showName && <span style={{ fontSize: 12, color: C.dim }}>{assignee || slug}</span>}
    </span>
  );
}

/** The faces of the agents behind a saga, for its row in the list: up to `max`, then "+n". A face sags and wears the ✕ when that agent failed an episode, and says nothing else. Pure over the rollup. */
export function Faces({ agents, max = 3, size = 20 }: { agents?: Record<string, { n: number; failed: number }>; max?: number; size?: number }) {
  const all = Object.entries(agents ?? {}).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  if (!all.length) return null;
  return (
    <span data-testid="faces" style={{ display: "inline-flex", alignItems: "center", gap: 3, flex: "0 0 auto" }}>
      {all.slice(0, max).map(([name, v]) => <Who key={name} assignee={name} status={v.failed > 0 ? "failed" : "done"} size={size} icon={false} />)}
      {all.length > max && <span title={all.slice(max).map(([n]) => n).join(", ")} style={{ fontSize: 11, color: C.muted }}>+{all.length - max}</span>}
    </span>
  );
}
