// THE AGENT CARD (operator 2026-09-16: "one thread = one agent, and the thread starts with the ask").
// One card instead of Studio → Agents → engine → scope gate: pick the engine, tick the folders it may
// write, say what it should do → Start. The ask becomes the thread's title and its first prompt;
// the scope skips the gate and bakes the pack. Everything it hands back rides on the widget payload.
import React from "react";
import { C, mono } from "@/loki/theme";
import { FileTree } from "@/loki/cockpit/cockpit-view";
import { useAtlasEntries, filesInScope, tokensInScope, fmtTok, PackChips } from "./scope-picker";
import { paneDisplay } from "./types";
import { fetchSources, toggleItem, itemLabel, DEFAULT_RULE, type ContextPack, type PackItem, type PackSource } from "./context-pack";
import { BASE_AGENTS, baseAgent, type BaseAgent } from "./base-agents";
import { faceColor } from "@/loki/cockpit/agent-themes";
import { ChibiFace } from "@/loki/chat/chibi-face";
import { ENGINE_KEYS, type EngineKey } from "@/loki/api/engine";
import { useSeats, offered } from "@/loki/api/seats";

// EVERY SEAT, NOT THREE (review 2026-10-01 of "Engine config also": the ultra review's hand-off sent Gemini, Cursor or Grok, and this list - three engines - turned each into a card on
// Claude Code, whose subscription had ended). The card takes any seat the product has; what it OPENS ON when the caller names none is the serve's own pick (useSeats().defaultKey).
export const AGENT_ENGINES = ENGINE_KEYS;
export type AgentEngine = EngineKey;
/** The seat a widget asked the card for (`antiloki:agent-card` {engine}): any of the product's seats, else nothing - and nothing means the serve's own pick, never Claude. Pure - tested. */
export function agentCardEngine(v: unknown): AgentEngine | undefined { return typeof v === "string" && (AGENT_ENGINES as readonly string[]).includes(v) ? (v as AgentEngine) : undefined; }
/** `base`: the Studio tile it came from — for DeepSeek · Kimi · Qwen the model the pane starts on and its theme (base-agents.ts) */
export type AgentStart = { engine: AgentEngine; scope: string[]; ask: string; title: string; pack?: ContextPack; base?: BaseAgent };

/** The thread title from the ask: first line, no markdown noise, ≤ 48 chars. Pure — tested. */
export function titleFromAsk(ask: string, engine: string): string {
  const line = ask.split("\n").map((l) => l.replace(/^[#>*\-\s]+/, "").trim()).find(Boolean) ?? "";
  if (!line) return paneDisplay(engine).name;
  return line.length > 48 ? `${line.slice(0, 47).trimEnd()}…` : line;
}

/** `fixed`: the card was opened FROM an engine's own tile (operator 2026-09-20: "if I clicked on Claude
 *  Code those options don't make sense") — the engine is settled, the chooser is not shown; the ask is
 *  optional then (the terminal takes it), only the scope gates start. */
export function AgentCard({ engine: initial, base: initialBase, initialAsk = "", initialScope = [], fixed = false, onStart, onClose }: { engine?: AgentEngine; /** the base agent the card was opened from (the Studio's DeepSeek · Kimi · Qwen tiles carry a model) */ base?: BaseAgent; initialAsk?: string; initialScope?: string[]; fixed?: boolean; onStart: (s: AgentStart) => void; onClose: () => void }) {
  // the chooser picks a BASE AGENT (2026-09-23: Claude Code · Codex · DeepSeek · Kimi · Qwen) — the engine follows it
  const [base, setBase] = React.useState<BaseAgent | undefined>(initialBase ?? baseAgent(initial));
  // a seat with no Studio tile of its own (Gemini · Grok · Cursor) is picked as a bare engine
  const [seat, setSeat] = React.useState<AgentEngine | undefined>(undefined);
  const seats = useSeats();
  // no engine named and none picked: the seat the serve plans on - never a fixed Claude (it may be switched off). Undefined until the seats are read.
  const engine: AgentEngine | undefined = base?.engine ?? seat ?? initial ?? seats?.defaultKey ?? undefined;
  const on = offered(seats, engine);
  const baseTiles = BASE_AGENTS.filter((b) => on.includes(b.engine));
  const seatTiles = on.filter((k) => !BASE_AGENTS.some((b) => b.engine === k));
  // the tile lit: the picked base agent, or - nothing picked - the plain tile of the seat the card opened on
  const tileOn = (b: BaseAgent) => base ? base.id === b.id : b.engine === engine && !b.model;
  const shown = base ? { glyph: paneDisplay(base.engine).glyph, name: base.label } : paneDisplay(engine ?? "");
  const [scope, setScope] = React.useState<string[]>(initialScope);
  // PREFILLED (2026-09-18): a widget (Design › Frames) hands the card its ask — the operator still picks the scope and presses start
  const [ask, setAsk] = React.useState(initialAsk);
  const { entries, loading, tokens } = useAtlasEntries();
  const files = React.useMemo(() => filesInScope(entries, scope).length, [entries, scope]);
  const tok = React.useMemo(() => tokensInScope(entries, scope, tokens), [entries, scope, tokens]);
  // WHAT IT READS FIRST (operator 2026-09-17: "where are the extra-context chips from antiIDE?"): the
  // context pack. Default = derived from the scope (the rule); ticking a chip makes it a custom pack.
  const [sources, setSources] = React.useState<PackSource[]>([]);
  const [packItems, setPackItems] = React.useState<PackItem[] | null>(null); // null = from scope
  React.useEffect(() => { void fetchSources(0).then(setSources); }, []);
  const togglePack = (it: PackItem) => setPackItems((cur) => toggleItem(cur ?? [], it));
  const pack: ContextPack | undefined = packItems && packItems.length ? { preset: "custom", items: packItems, live: true, budget_chars: 200_000 } : undefined;
  const ready = !!engine && scope.length > 0 && (fixed || ask.trim().length > 0);
  const start = () => { if (ready && engine) onStart({ engine, scope, ask: ask.trim(), title: titleFromAsk(ask, base?.label ?? engine ?? ""), ...(pack ? { pack } : {}), ...(base ? { base } : {}) }); };
  const chip = (on: boolean): React.CSSProperties => ({ background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.brand : C.muted, borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontFamily: mono, fontSize: 11 });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 310, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="agent-card" onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(); }}
        style={{ width: "min(720px, 94vw)", maxHeight: "90vh", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: mono, fontSize: 12.5, color: C.fg, fontWeight: 700 }}>{fixed ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><ChibiFace slug={`base-${base?.id ?? engine ?? "agent"}`} mood="live" size={22} color={faceColor(base?.theme, engine, base?.model)} />{shown.glyph} {shown.name}</span> : "new agent"}</span>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{fixed ? "what it may write · what it should do (optional)" : "engine · what it may write · what it should do"}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {!fixed && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {baseTiles.map((b) => <button key={b.id} data-testid={`engine-${b.id}`} onClick={() => { setBase(b); setSeat(undefined); }} title={b.desc} style={{ ...chip(tileOn(b)), display: "inline-flex", alignItems: "center", gap: 6 }}><ChibiFace slug={`base-${b.id}`} mood={tileOn(b) ? "live" : "idle"} size={16} color={faceColor(b.theme, b.engine, b.model)} />{b.label}</button>)}
            {seatTiles.map((k) => <button key={k} data-testid={`engine-${k}`} onClick={() => { setBase(undefined); setSeat(k); }} style={{ ...chip(!base && engine === k), display: "inline-flex", alignItems: "center", gap: 6 }}><ChibiFace slug={`base-${k}`} mood={!base && engine === k ? "live" : "idle"} size={16} color={faceColor(undefined, k)} />{paneDisplay(k).name}</button>)}
          </div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>what should it do</span>
            <textarea autoFocus value={ask} onChange={(e) => setAsk(e.target.value)} data-testid="agent-ask" rows={3} spellCheck={false}
              placeholder="fix the flaky playground tests — keep the public API stable, add a regression test"
              style={{ background: C.panel, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", fontFamily: mono, fontSize: 11, lineHeight: 1.5, resize: "vertical", outline: "none" }} />
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{fixed ? "optional — becomes the thread's name and its first prompt; leave it empty and type in the terminal · ⌘⏎ starts" : "becomes the thread's name and its first prompt · ⌘⏎ starts"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>what it may write</span>
            {loading && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>loading the file tree…</span>}
            {!loading && entries.length === 0 && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>no atlas for this workspace yet — rebuild the codebase in antiIDE, or type globs below</span>}
            <FileTree value={scope.join(", ")} onChange={(v) => setScope(v.split(",").map((s) => s.trim()).filter(Boolean))} entries={entries} tokens={tokens} />
            <span style={{ fontFamily: mono, fontSize: 9, color: scope.length ? C.ok : C.muted }}>{scope.length ? `${scope.length} glob${scope.length === 1 ? "" : "s"} · ${files} file${files === 1 ? "" : "s"} writable${tok ? ` · ≈${fmtTok(tok)} tokens of source` : ""} · reads everything, writes only here` : "tick at least one folder or file — a write outside it is refused"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>what it reads first · antiIDE context</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{packItems?.length ? `custom pack · ${packItems.length} item${packItems.length === 1 ? "" : "s"}: ${packItems.slice(0, 4).map(itemLabel).join(", ")}${packItems.length > 4 ? "…" : ""}` : `from the scope — ${DEFAULT_RULE}`}{packItems?.length ? <button onClick={() => setPackItems(null)} style={{ marginLeft: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 5, padding: "0 6px", cursor: "pointer", fontFamily: mono, fontSize: 8.5 }}>back to the rule</button> : null}</span>
            <PackChips items={packItems ?? []} onToggle={togglePack} sources={sources} scope={scope} entries={entries} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{ready ? `“${titleFromAsk(ask, base?.label ?? engine ?? "")}”` : fixed ? "a scope is required" : "the ask and a scope are both required"}</span>
          <span style={{ flex: 1 }} />
          <button data-testid="agent-start" disabled={!ready} onClick={start}
            style={{ background: ready ? C.brand : "transparent", border: `1px solid ${ready ? C.brand : C.border}`, color: ready ? C.bg : C.muted, borderRadius: 6, padding: "5px 16px", cursor: ready ? "pointer" : "not-allowed", fontFamily: mono, fontSize: 11, fontWeight: 700 }}>▶ start</button>
        </div>
      </div>
    </div>
  );
}
