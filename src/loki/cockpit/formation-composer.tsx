// FORMATION COMPOSER (operator 2026-07-16: "create our own personalized
// collection … organize and shape the inputs and outputs from each node").
// Build a custom formation node by node: pick agents (vibe personas) and tools,
// order the steps, and WIRE each node's inputs (mission · shared · digest ·
// upstream step outputs). Saves into the SAME user-formations store the gallery
// + collection spawner already read — so it spawns exactly like a stock
// collection, and the orchestrator's 🗺 flow can auto-run it (agent steps fire,
// tool steps pause). The live preview IS the wiring diagram.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { VIBE_AGENTS, KIND_IDENT } from "./pane-gallery";
import { CanvasBoard, type BoardCard, type BoardEdge } from "./canvas-board";

type Step = { id: string; label: string; kind: string; agent?: string; reads: string[] };
const uid = () => Math.random().toString(36).slice(2, 8);
const TOOLS: Array<[string, string]> = [["ultraplan", "🧩 shape"], ["judgment", "⚖ judge"], ["kanban", "▤ kanban"], ["review", "◨ review"], ["run", "🖥 run"], ["gate", "✓ gate"], ["notebook", "📓 notebook"], ["radar", "🚨 radar"]];
const BASE_READS: Array<[string, string]> = [["mission", "🎯 mission"], ["shared", "🧠 shared"], ["digest", "▣ digest"]];

export function FormationComposer({ onSave, onClose }: { onSave: (key: string, tpl: any) => void; onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [steps, setSteps] = React.useState<Step[]>([]);
  const [err, setErr] = React.useState("");
  const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);

  const addAgent = (vKey: string) => {
    const v = VIBE_AGENTS.find((x) => x.key === vKey); if (!v) return;
    setSteps((ss) => [...ss, { id: uid(), label: v.name.toLowerCase(), kind: "agent", agent: v.key, reads: ss.length ? [`step:${ss[ss.length - 1].label}`] : ["mission", "shared"] }]);
  };
  const addTool = (kind: string, label: string) => setSteps((ss) => [...ss, { id: uid(), label: label.replace(/^\S+\s/, ""), kind, reads: ss.length ? [`step:${ss[ss.length - 1].label}`] : ["mission"] }]);
  const move = (i: number, d: number) => setSteps((ss) => { const n = [...ss]; const j = i + d; if (j < 0 || j >= n.length) return ss; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const patch = (id: string, p: Partial<Step>) => setSteps((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const toggleRead = (id: string, ch: string) => setSteps((ss) => ss.map((s) => (s.id === id ? { ...s, reads: s.reads.includes(ch) ? s.reads.filter((r) => r !== ch) : [...s.reads, ch] } : s)));

  const save = () => {
    const nm = name.trim();
    if (!nm) { setErr("name the automation"); return; }
    if (steps.length < 2) { setErr("an automation needs at least 2 steps"); return; }
    const key = slug(nm) || `formation-${uid()}`;
    const tpl = {
      title: nm,
      cols: Math.max(1, Math.min(steps.length, 4)), rows: 1 + Math.ceil(steps.length / 4),
      slots: [
        // every formation gets its 🧭 CONDUCTOR (like the stock templates' ORCH
        // slot) — it hosts the 🗺 flow + the ▶ run; never a step itself
        { kind: "orchestrator", role: "orchestrator", label: "conductor", col: 0, row: 0 },
        ...steps.map((s, i) => ({
          kind: s.kind, agent: s.agent, role: s.label, label: s.label,
          col: i % 4, row: 1 + Math.floor(i / 4),
          step: i, reads: s.reads, emit: `step:${s.label}`,
        })),
      ],
    };
    onSave(key, tpl);
  };

  // the live preview IS the wiring diagram — same board, read-only-ish
  const cards: BoardCard[] = steps.map((s, i) => {
    const ident = (KIND_IDENT as any)[s.kind] ?? { glyph: s.kind === "agent" ? "🤖" : "▦", color: s.kind === "agent" ? C.brand : C.dim };
    return {
      id: `s:${s.id}`, label: `step ${i + 1} · ${s.label}`, w: 190, x: 16 + i * 236, y: 46 + (i % 2) * 120,
      node: (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 12 }}>{ident.glyph}</span>
            <span style={{ fontFamily: mono, fontSize: 8, color: ident.color, border: `1px solid ${ident.color}`, borderRadius: 8, padding: "0 6px", textTransform: "uppercase" }}>{s.kind}</span>
          </div>
          <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>reads: {s.reads.join(" · ") || "—"}</span>
          <span style={{ fontFamily: mono, fontSize: 7.5, color: C.ok }}>emits: step:{s.label}</span>
        </div>
      ),
    };
  });
  const byLabel = new Map(steps.map((s) => [`step:${s.label}`, `s:${s.id}`]));
  const edges: BoardEdge[] = steps.flatMap((s) => s.reads.filter((r) => byLabel.has(r) && byLabel.get(r) !== `s:${s.id}`).map((r) => ({ from: byLabel.get(r)!, to: `s:${s.id}`, tone: C.brand, label: r.slice(5) })));

  const pill = (on: boolean, tone: string): React.CSSProperties => ({ fontFamily: mono, fontSize: 8, padding: "1px 8px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? tone : C.border}`, background: on ? `color-mix(in oklab, ${tone} 12%, transparent)` : "transparent", color: on ? tone : C.dim });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 420, background: `color-mix(in oklab, ${C.bg} 78%, transparent)`, backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 18 }}>
      <div style={{ width: "min(940px, 96vw)", maxHeight: "92vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 800, color: C.fg }}>🧪 compose an automation</span>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>your own automation — nodes wired by inputs/outputs · agent steps auto-run, tool steps pause for you</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "2px 10px", borderRadius: 7 }}>✕</button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="automation name — e.g. research → draft → judge…" style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontFamily: nav, fontSize: 12, outline: "none" }} />
        {/* add nodes */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", width: 52 }}>＋ agent</span>
          {VIBE_AGENTS.map((v) => <button key={v.key} onClick={() => addAgent(v.key)} title={v.tagline} style={pill(false, C.brand)}>{v.avatar} {v.name}</button>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", width: 52 }}>＋ tool</span>
          {TOOLS.map(([k, label]) => <button key={k} onClick={() => addTool(k, label)} style={pill(false, C.muted)}>{label}</button>)}
          <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>· tools pause the run for the operator (manual gates)</span>
        </div>
        {/* the steps + their wiring */}
        {steps.map((s, i) => (
          <div key={s.id} style={{ borderLeft: `2.5px solid ${s.kind === "agent" ? C.brand : C.dim}`, paddingLeft: 9, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 800, color: C.muted }}>step {i + 1}</span>
              <input value={s.label} onChange={(e) => patch(s.id, { label: slug(e.target.value) || s.label })} style={{ background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "2px 8px", fontFamily: mono, fontSize: 10, width: 150, outline: "none" }} />
              <span style={{ fontFamily: mono, fontSize: 8, color: s.kind === "agent" ? C.brand : C.dim, textTransform: "uppercase" }}>{s.kind}{s.agent ? ` · ${s.agent}` : ""}</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 11 }}>↑</button>
              <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 11 }}>↓</button>
              <button onClick={() => setSteps((ss) => ss.filter((x) => x.id !== s.id))} style={{ background: "transparent", border: "none", color: C.bad, cursor: "pointer", fontSize: 10 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
              <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim, textTransform: "uppercase" }}>reads</span>
              {BASE_READS.map(([k, label]) => <button key={k} onClick={() => toggleRead(s.id, k)} style={pill(s.reads.includes(k), C.ok)}>{label}</button>)}
              {steps.slice(0, i).map((up) => { const ch = `step:${up.label}`; return <button key={up.id} onClick={() => toggleRead(s.id, ch)} style={pill(s.reads.includes(ch), C.brand)}>⤷ {up.label}</button>; })}
              <span style={{ fontFamily: mono, fontSize: 7.5, color: C.ok, marginLeft: 4 }}>→ emits step:{s.label}</span>
            </div>
          </div>
        ))}
        {!steps.length && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, fontStyle: "italic", padding: "8px 0" }}>add nodes above — each becomes a pane; the order is the run order; the reads are the wires.</span>}
        {/* the wiring diagram, live */}
        {steps.length > 0 && (
          <div style={{ height: 300, display: "flex", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <CanvasBoard boardKey={`composer:${steps.map((s) => s.id).join(",")}`} cards={cards} edges={edges} />
          </div>
        )}
        {err && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>{err}</span>}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={save} disabled={!name.trim() || steps.length < 2}
            style={{ background: name.trim() && steps.length >= 2 ? `linear-gradient(120deg, ${C.brand}, color-mix(in oklab, ${C.brand} 60%, ${C.ok}))` : "transparent", border: name.trim() && steps.length >= 2 ? "none" : `1px solid ${C.border}`, color: name.trim() && steps.length >= 2 ? C.bg : C.dim, cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 800, padding: "5px 16px", borderRadius: 9 }}>▧ save automation</button>
          <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>the 🧭 conductor pane is added automatically · joins the gallery under Automations · spawn, then ▶ run from its 🗺 flow</span>
        </div>
      </div>
    </div>
  );
}
