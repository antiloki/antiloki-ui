// THE BRAINSTORM PANE (operator 2026-10-11: "intent should be called brainstorm and the design of the intent tab widget is ugly, make it better. Drop sources at the intent tab widget, drop also choosing between ultra and
// quick, make automatic. The new design should be like a simple ChatGPT-like pane, and all those options of intent will be a well designed balloon of chips to select. The contour will be of a brain, and the chips inside.
// Not a balloon, a brain draw.").
// It is the same step as the Intent pane was - say what you want, and the plan lands on the shape pane - as a conversation: a composer at the bottom, your message and the answer above it, and the options (what · where · how bold ·
// what it must respect) as chips. (A brain was drawn behind them for a while and was dropped: "drop the brain draw, leave the chips where they are".) The sources line is gone (the judge falls back to its own defaults, as it always did when none were picked), and so is the Ultra / Quick choice: the size of the ask decides.
import * as React from "react";
import type { Pane } from "@/loki/api/types";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { C, nav } from "@/loki/theme";
import { isBrainstormMsgRow, isBrainstormChipsRow } from "./tool-rows";
import { BrainstormWizard, writeSessionBasePlan, useAtlas, atlasDirs, sibling, wizMem, clearWizMem } from "./cockpit-panes-tools";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

// ── the options (the same dimensions the intent had) ──────────────────────────────────────────────────────────
export const KINDS: ReadonlyArray<[string, string]> = [["feature", "✨ feature"], ["fix", "🩹 fix"], ["refactor", "🔷 refactor"], ["design", "🎨 design"], ["perf", "⚡ perf"], ["tests", "🧪 tests"], ["docs", "📚 docs"]];
export const BOLD: ReadonlyArray<[string, string, string]> = [["surgical", "🎯 surgical", "the smallest possible change"], ["balanced", "⚖ balanced", "right-sized slices"], ["ambitious", "🚀 ambitious", "go further, propose more"]];
export const MUSTS: ReadonlyArray<[string, string]> = [["tests", "🧪 must add tests"], ["design", "📐 design-system strict"], ["nodeps", "🔒 no new deps"]];

/** the options as the lines the planner reads, after the goal. Pure - tested. */
export function intentText(kind: string, areas: ReadonlySet<string>, bold: string, musts: ReadonlySet<string>): string {
  const kindLabel = KINDS.find(([k]) => k === kind)?.[1] ?? kind;
  return [`KIND: ${kindLabel}`, `AREAS: ${areas.size ? [...areas].join(", ") : "whole app"}`, `BOLDNESS: ${bold}`,
    musts.size ? `CONSTRAINTS: ${[...musts].map((q) => MUSTS.find(([k]) => k === q)?.[1] ?? q).join("; ")}` : ""].filter(Boolean).join("\n");
}
/** the one line that stands for the chosen options when the brain is folded away. Pure - tested. */
export function chipsSummary(kind: string, areas: ReadonlySet<string>, bold: string, musts: ReadonlySet<string>): string {
  const bits = [KINDS.find(([k]) => k === kind)?.[1]?.replace(/^\S+\s/, "") ?? kind, areas.size ? [...areas].map((a) => `${a}/`).join(" ") : "whole app", bold];
  if (musts.size) bits.push(`${musts.size} must${musts.size === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

/** THE SIZE OF THE ASK DECIDES (it used to be two buttons): the deep planner for a big or bold ask, the quick slicer for a small or surgical one. A bold line the person chose wins over the size; otherwise it is the length of the ask,
 *  how much of the app it touches, and whether it is a kind of work that spreads (a feature, a refactor, a redesign). Pure - tested. */
export function autoMode(goal: string, kind: string, areaCount: number, bold: string): "ultra" | "breakdown" {
  const text = goal.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (bold === "ambitious") return "ultra";
  const long = words > 40 || text.length > 280 || (text.match(/\n/g) ?? []).length >= 2;
  const spreads = ["feature", "refactor", "design"].includes(kind);
  // words that say it reaches across the app, whatever its length
  const broad = /\b(whole|entire|every|everywhere|across|all of|overhaul|redesign|rewrite|from scratch|migrate)\b/i.test(text);
  const wide = areaCount >= 3 || broad || (areaCount === 0 && spreads && words > 14);
  if (bold === "surgical") return long ? "ultra" : "breakdown";
  return long || wide ? "ultra" : "breakdown";
}

// ── the chat ──────────────────────────────────────────────────────────────────────────────────────────────────
type Msg = { role: "you" | "brain"; text: string; tone?: "ok" | "warn" | "busy"; chips?: string };
// EVERYTHING THE TOOLS HOLD LIVES IN THE WORKSPACE DATABASE (operator 2026-10-11: "all the data used in the tools, written or edited, should be stored on the db sqlite of the studio"). The conversation is one row per
// message (kind 'brainstorm') and the chosen options are one row updated in place (kind 'brainstorm-chips'), in the same table the other tools use (`cockpit_blackboard`, in `.antiloki/db/state.sqlite`), so closing the tab, the window or
// the app loses nothing.
const POST = "/api/v1/cockpit/blackboard/post", READ = "/api/v1/cockpit/blackboard/read";
export type Chips = { kind: string; areas: string[]; bold: string; musts: string[] };
/** a stored message row -> a message; anything unreadable is skipped. Pure - tested. */
export function parseMsg(row: { body_md?: string }): Msg | null {
  try { const j = JSON.parse(String(row.body_md ?? "")); if ((j?.role !== "you" && j?.role !== "brain") || typeof j?.text !== "string") return null; return { role: j.role, text: j.text, tone: j.tone === "ok" || j.tone === "warn" ? j.tone : undefined, chips: typeof j.chips === "string" ? j.chips : undefined }; } catch { return null; }
}
/** the stored options row -> the options, with what is not recognised left at its default. Pure - tested. */
export function parseChips(row: { body_md?: string } | undefined): Chips | null {
  if (!row) return null;
  try {
    const j = JSON.parse(String(row.body_md ?? ""));
    const kind = KINDS.some(([k]) => k === j?.kind) ? j.kind : "feature", bold = BOLD.some(([k]) => k === j?.bold) ? j.bold : "balanced";
    return { kind, bold, areas: Array.isArray(j?.areas) ? j.areas.map(String) : [], musts: (Array.isArray(j?.musts) ? j.musts.map(String) : []).filter((m: string) => MUSTS.some(([k]) => k === m)) };
  } catch { return null; }
}

export function BrainstormPane({ p, panes, sessionId, onChanged }: { p: Pane; panes: Pane[]; sessionId: number; onChanged: () => void }) {
  const key = `${sessionId}:${p.id}`;
  const shape = sibling(panes, p, ["ultraplan", "breakdown"]);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [goal, setGoal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState("feature");
  const [areas, setAreas] = React.useState<Set<string>>(new Set());
  const [bold, setBold] = React.useState("balanced");
  const [musts, setMusts] = React.useState<Set<string>>(new Set());
  const [brainOpen, setBrainOpen] = React.useState(true);
  const [wizOpen, setWizOpen] = React.useState(() => wizMem(sessionId, p.id).open);
  const [atlas] = useAtlas();
  const dirs = React.useMemo(() => atlasDirs(atlas).filter((d) => d.split("/").length === 1).slice(0, 10), [atlas]);
  const endRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { wizMem(sessionId, p.id).open = wizOpen; }, [wizOpen, sessionId, p.id]);
  React.useEffect(() => { endRef.current?.scrollIntoView?.({ block: "end" }); }, [msgs]);

  // the saved conversation and options come back from the database
  const chipsRow = React.useRef<number | null>(null);
  const chain = React.useRef<Promise<void>>(Promise.resolve());
  const queue = (fn: () => Promise<unknown>) => { chain.current = chain.current.then(async () => { try { await fn(); } catch { /* the next change tries again */ } }); return chain.current; };
  const read = React.useCallback(async (): Promise<any[]> => { const d: any = unwrap(await apiPost(READ, { session_id: sessionId, pane_id: p.id }, { timeoutMs: 20000 })); return (d?.scratch ?? []) as any[]; }, [sessionId, p.id]);
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      let rows: any[] = []; try { rows = await read(); } catch { /* start empty */ }
      if (!alive) return;
      const saved = rows.filter(isBrainstormMsgRow).sort((a, b) => a.id - b.id).map(parseMsg).filter((m): m is Msg => !!m);
      const row = rows.filter(isBrainstormChipsRow).pop(); chipsRow.current = row?.id ?? null;
      const c = parseChips(row);
      if (c) { setKind(c.kind); setBold(c.bold); setAreas(new Set(c.areas)); setMusts(new Set(c.musts)); }
      setMsgs(saved); setBrainOpen(saved.length === 0); setLoaded(true);
    })();
    return () => { alive = false; };
  }, [read]);
  const remember = (m: Msg) => { if (m.tone === "busy") return; void queue(() => apiPost(POST, { session_id: sessionId, pane_id: p.id, kind: "brainstorm", body_md: JSON.stringify(m) }, { timeoutMs: 20000 })); };
  // the options are saved as they are chosen (one row, updated in place)
  React.useEffect(() => {
    if (!loaded) return;
    const body = JSON.stringify({ kind, areas: [...areas], bold, musts: [...musts] });
    void queue(async () => {
      if (chipsRow.current != null) await apiPost(POST, { op: "update", id: chipsRow.current, body_md: body }, { timeoutMs: 20000 });
      else { await apiPost(POST, { session_id: sessionId, pane_id: p.id, kind: "brainstorm-chips", body_md: body }, { timeoutMs: 20000 }); const r = (await read()).filter(isBrainstormChipsRow).pop(); chipsRow.current = r?.id ?? null; }
    });
  }, [kind, areas, bold, musts, loaded]);   // eslint-disable-line react-hooks/exhaustive-deps
  /** start a fresh conversation: every saved message is removed (the chosen options stay) */
  const newChat = () => queue(async () => {
    for (const r of (await read()).filter(isBrainstormMsgRow)) await apiPost(POST, { op: "delete", id: r.id }, { timeoutMs: 20000 });
  }).then(() => { setMsgs([]); setBrainOpen(true); });

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) => set((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const send = async () => {
    const text = goal.trim(); if (!text || busy) return;
    const mode = autoMode(text, kind, areas.size, bold);
    setGoal(""); setBrainOpen(false);
    const chips = chipsSummary(kind, areas, bold, musts);
    const mine: Msg = { role: "you", text, chips };
    if (!shape) {
      const warn: Msg = { role: "brain", tone: "warn", text: "There is no shape pane on this board to land the plan on. Add a 🧩 Shape pane (or open the Ultra Plan collection) and ask again." };
      setMsgs((m) => [...m, mine, warn]); remember(mine); remember(warn); return;
    }
    setMsgs((m) => [...m, mine, { role: "brain", tone: "busy", text: "thinking…" }]); remember(mine);
    setBusy(true);
    let reply: Msg;
    try {
      const d: any = unwrap(await apiPost("/api/v1/cockpit/plan/generate", { session_id: sessionId, pane_id: shape.id, ambition: text + "\n" + intentText(kind, areas, bold, musts), mode }, { timeoutMs: 300000 }));
      if (d?.ok === false) reply = { role: "brain", tone: "warn", text: String(d?.error ?? "The plan did not come out. Try again.") };
      else {
        const items = d?.items ?? d?.plan?.items ?? d?.tasks; const n = Array.isArray(items) ? items.length : 0;
        reply = { role: "brain", tone: "ok", text: `${mode === "ultra" ? "I planned it in depth" : "I sliced it quickly"}${n ? `: ${n} slice${n === 1 ? "" : "s"}` : ""}. It is on the shape pane (#${shape.idx + 1}).` };
        onChanged();
      }
    } catch (e: any) { reply = { role: "brain", tone: "warn", text: e?.message ?? "Could not reach the planner. Restart antiloki and try again." }; }
    setMsgs((m) => [...m.slice(0, -1), reply]); remember(reply);
    setBusy(false);
  };

  const onForged = async (r: { base_plan_md: string; cards: any[] }) => {
    const md = r.base_plan_md || goal.trim();
    await writeSessionBasePlan(sessionId, md);
    const shapePane = panes.find((x: any) => x.pane_kind === "ultraplan" || x.pane_kind === "breakdown");
    if (shapePane) {
      window.dispatchEvent(new CustomEvent("antiloki:baseplan", { detail: { sessionId, artifact: md } }));
      (window as any).antilokiFocusPane?.(shapePane.id);
      const ok: Msg = { role: "brain", tone: "ok", text: "I forged the base plan. The shape tree is growing on the shape pane." }; setMsgs((m) => [...m, ok]); remember(ok);
    } else { const warn: Msg = { role: "brain", tone: "warn", text: "I forged the base plan, but there is no shape pane to grow it on. Add a 🧩 Shape pane." }; setMsgs((m) => [...m, warn]); remember(warn); }
    onChanged();
  };

  const chip = (on: boolean, tone: string): React.CSSProperties => ({
    fontFamily: mono, fontSize: 9.5, padding: "2px 9px", borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${on ? tone : C.border}`, background: on ? `color-mix(in oklab, ${tone} 16%, ${C.bg})` : C.bg, color: on ? tone : C.muted,
  });
  const row = (label: string, children: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>{children}</div>
    </div>
  );

  // THE OPTIONS AS CHIPS, IN FULL (operator 2026-10-11: "drop the brain draw, leave the chips where they are, drop the scroll, display the chips completely"): no drawing behind them and no box with its own scrollbar, so the block is as tall as
  // its chips are and the pane's own page scrolls if the window is short.
  const brain = (
    <div data-testid="chips" style={{ width: "min(100%, 520px)", margin: "0 auto", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {row("what", KINDS.map(([k, label]) => <button key={k} data-testid={`chip-kind-${k}`} aria-pressed={kind === k} onClick={() => setKind(k)} style={chip(kind === k, C.brand)}>{label}</button>))}
        {row("where", <>
          <button data-testid="chip-area-all" aria-pressed={areas.size === 0} onClick={() => setAreas(new Set())} style={chip(areas.size === 0, C.ok)}>🌐 whole app</button>
          {dirs.map((d) => <button key={d} data-testid={`chip-area-${d}`} aria-pressed={areas.has(d)} onClick={() => toggle(setAreas, d)} style={chip(areas.has(d), C.ok)}>{d}/</button>)}
        </>)}
        {row("how bold", BOLD.map(([k, label, tip]) => <button key={k} data-testid={`chip-bold-${k}`} aria-pressed={bold === k} onClick={() => setBold(k)} title={tip} style={chip(bold === k, C.warn)}>{label}</button>))}
        {row("must", MUSTS.map(([k, label]) => <button key={k} data-testid={`chip-must-${k}`} aria-pressed={musts.has(k)} onClick={() => toggle(setMusts, k)} style={chip(musts.has(k), C.bad)}>{label}</button>))}
    </div>
  );

  return (
    <div data-testid="brainstorm-pane" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg, color: C.fg, fontFamily: nav }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>🧠 Brainstorm</span>
        <span style={{ flex: 1 }} />
        {msgs.length > 0 && <button type="button" data-testid="brainstorm-new" onClick={() => void newChat()} title="start a new conversation (the options stay)" style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: "1px 8px" }}>new</button>}
        <span style={{ fontFamily: mono, fontSize: 9, color: shape ? C.ok : C.warn }} title={shape ? `the plan lands on #${shape.idx + 1} ${shape.subagent_name ?? "shape"}` : "no shape pane found"}>{shape ? `→ #${shape.idx + 1} shape` : "no shape pane"}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* AT THE CENTRE OF THE PANE while the conversation is empty (operator 2026-10-11: "make the chips at the center of the brainstorm pane, not at the top"). Auto margins centre the block and let it start at the top when the window is too short for it. */}
        {msgs.length === 0 ? (
          <div data-testid="brainstorm-center" style={{ margin: "auto 0", display: "flex", flexDirection: "column", gap: 16 }}>
            {brain}
            <div data-testid="brainstorm-empty" style={{ textAlign: "center", color: C.dim, fontSize: 12.5, lineHeight: 1.6 }}>Pick the options, then say it in a line below.</div>
          </div>
        ) : brainOpen ? brain : (
          <button data-testid="chips-summary" onClick={() => setBrainOpen(true)} title="open the options: what, where, how bold and the musts"
            style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 7, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 12px", cursor: "pointer", color: C.muted, fontFamily: mono, fontSize: 10 }}>
            <span>🧠</span><span>{chipsSummary(kind, areas, bold, musts)}</span><span style={{ color: C.dim }}>▾</span>
          </button>
        )}
        {msgs.map((m, i) => m.role === "you" ? (
          <div key={i} data-testid="msg-you" style={{ alignSelf: "flex-end", maxWidth: "86%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: "14px 14px 4px 14px", padding: "8px 12px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
            {m.chips && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{m.chips}</span>}
          </div>
        ) : (
          <div key={i} data-testid="msg-brain" data-tone={m.tone} style={{ alignSelf: "flex-start", maxWidth: "90%", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span aria-hidden style={{ fontSize: 15, lineHeight: "20px" }}>🧠</span>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: m.tone === "warn" ? C.warn : m.tone === "busy" ? C.dim : C.fg, fontStyle: m.tone === "busy" ? "italic" : "normal", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
          </div>
        ))}
        {wizOpen && <BrainstormWizard sessionId={sessionId} paneId={p.id}
          initialSeed={(goal.trim() ? goal.trim() + "\n" : "") + intentText(kind, areas, bold, musts)}
          sources={["mission", "shared", "digest"]}
          onForged={onForged} onClose={() => { clearWizMem(sessionId, p.id); setWizOpen(false); }} />}
        <div ref={endRef} />
      </div>

      <div style={{ padding: "8px 12px 12px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 8px 6px 12px" }}>
          <textarea data-testid="brainstorm-input" value={goal} rows={1} onChange={(e) => setGoal(e.target.value)} placeholder="What do you want to build or change?"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            style={{ flex: 1, minWidth: 0, maxHeight: 120, resize: "none", background: "transparent", border: "none", outline: "none", color: C.fg, fontFamily: nav, fontSize: 13, lineHeight: 1.5, padding: "4px 0", fieldSizing: "content" as any }} />
          <button type="button" data-testid="brainstorm-explore" onClick={() => setWizOpen(true)} disabled={wizOpen} title="explore ideas across the dimensions first, then forge the base plan"
            style={{ background: "transparent", border: "none", color: wizOpen ? C.dim : C.warn, cursor: wizOpen ? "default" : "pointer", fontSize: 14, padding: "2px 4px" }}>✨</button>
          <button type="button" data-testid="brainstorm-send" onClick={() => void send()} disabled={!goal.trim() || busy} aria-label="send"
            style={{ width: 28, height: 28, borderRadius: 999, border: "none", cursor: !goal.trim() || busy ? "default" : "pointer", background: goal.trim() && !busy ? C.brand : C.border, color: C.bg, fontSize: 15, fontWeight: 700, lineHeight: 1 }}>↑</button>
        </div>
      </div>
    </div>
  );
}
