// A SPECIALIST'S WINDOW (the operator 2026-11-22): click its tag and everything it has opens in the middle of the screen, editable: who it is (name, purpose, persona, extra instructions, seat), its avatar, what it can use (tools, book packs, skills, MCP servers, assistants, context to read first, limits) and its memory (the notes it keeps, and a way to add one). Saving is the person's, so it is approved at once; the serve's own sentence shows when it refuses.
import * as React from "react";
import { apiGet } from "@/loki/api/client";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { pickDefaultEngine } from "./default-engine";
import { listEngines, localModels, specialistRetire, specialistFork, specialistGet, specialistNote, specialistSave, type Engine, type SpecialistDef, type SpecialistFull } from "./api";
import { AvatarPicker, SpecialistAvatar, mascotOf } from "./SpecialistAvatar";

/** Said when a specialist is removed, so the screen closes its open pane. */
export const SPECIALIST_REMOVED = "antiloki:specialist-removed";
const SEATS: [string, string][] = [["claude-code", "Claude Code"], ["codex", "Codex"], ["cursor", "Cursor"], ["gemini", "Antigravity"], ["opencode", "OpenCode"]];
/** The seats to choose from: the agents on this machine (every known one while the serve has not said), and whatever is chosen now so it never disappears. Pure. */
export function seatChoices(engines: Engine[], chosen: string): [string, string][] {
  const base: [string, string][] = engines.length ? engines.filter((e) => e.installed).map((e) => [e.key, e.seat === false ? `${e.label} (not signed in)` : e.label]) : SEATS;
  if (!chosen || base.some(([k]) => k === chosen)) return base;
  const known = SEATS.find(([k]) => k === chosen)?.[1] ?? chosen;
  return [...base, [chosen, engines.length ? `${known} (not on this machine)` : known]];
}
const lines = (v: string[] | undefined) => (v ?? []).join("\n");
const parse = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
const when = (ms: number) => { const d = new Date(ms); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };

/** The models a seat offers: its engine's own list (Claude's with Opus), the local ones on a Claude seat, and whatever is chosen now so it never disappears. Pure. */
export function modelsOf(seat: string, bySeat: Record<string, string[]>, locals: string[], chosen: string): string[] {
  const key = seat.split(":")[0]; const base = bySeat[key] ?? [];
  const list = key === "claude-code" ? [...(base.length ? base : ["haiku", "sonnet"]), "opus", ...locals] : base;
  return [...new Set([...list, ...(chosen ? [chosen] : [])])];
}
export function SpecialistEditor({ id, onClose, onLook, onFork }: { id: string; onClose: () => void; onLook?: (shape: string, color: string) => void; /** a fork was made: open it */ onFork?: (id: string) => void }) {
  const [full, setFull] = React.useState<SpecialistFull | null>(null); const [def, setDef] = React.useState<SpecialistDef | null>(null); const [tab, setTab] = React.useState<"profile" | "tools" | "memory">("profile");
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null); const [picker, setPicker] = React.useState(false); const [note, setNote] = React.useState(""); const [kind, setKind] = React.useState("note"); const [busy, setBusy] = React.useState(false);
  // THE MODELS OF EACH SEAT, from the serve's own engine list (operator 2026-11-26: a specialist has a model seat too, not only a provider seat)
  const [seatModels, setSeatModels] = React.useState<Record<string, string[]>>({}); React.useEffect(() => { void Promise.resolve().then(() => apiGet("/api/v1/engines")).then((r: any) => setSeatModels(Object.fromEntries(((r?.result ?? r)?.engines ?? []).map((e: any) => [String(e.key), Array.isArray(e.models) ? e.models.map(String) : []])))).catch(() => {}); }, []);
  const [engines, setEngines] = React.useState<Engine[]>([]); React.useEffect(() => { void listEngines().then(setEngines); }, []);
  const [locals, setLocals] = React.useState<string[]>([]); React.useEffect(() => { void localModels().then((r) => setLocals(r.reachable ? r.models.map((m) => `local:${m.tag}`) : [])); }, []);
  const load = React.useCallback(async () => { const f = await specialistGet(id); setFull(f); if (f) setDef((d) => d ?? f.specialist); else setMsg({ ok: false, text: "could not read this specialist" }); }, [id]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !picker) onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, picker]);
  const set = (p: Partial<SpecialistDef>) => setDef((d) => (d ? { ...d, ...p } : d));
  const save = async () => { if (!def) return; setBusy(true); const r = await specialistSave(def); setBusy(false); setMsg(r.ok ? { ok: true, text: "Saved. It is approved: you looked at it." } : { ok: false, text: r.error ?? "could not save" }); if (r.ok) { if (def.shape || def.color) { const m = mascotOf(def.id, def.shape, def.color); onLook?.(m.shape, m.color); } void load(); } };
  const fork = async () => { setBusy(true); const r = await specialistFork(id); setBusy(false); if (r.ok && r.id) { onFork?.(r.id); onClose(); } else setMsg({ ok: false, text: r.error ?? "could not fork" }); };
  const [sure, setSure] = React.useState(false);
  const remove = async () => { setBusy(true); const r = await specialistRetire(id); setBusy(false); if (r.ok) { window.dispatchEvent(new CustomEvent(SPECIALIST_REMOVED, { detail: { id } })); onClose(); } else { setSure(false); setMsg({ ok: false, text: r.error ?? "could not remove it" }); } };
  const addNote = async () => { if (!note.trim()) return; const r = await specialistNote(id, kind, note.trim(), "added by the person"); if (r.ok) { setNote(""); setMsg(null); void load(); } else setMsg({ ok: false, text: r.error ?? "could not add the note" }); };
  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", fontFamily: nav, fontSize: 13, outline: "none", resize: "vertical" };
  const label: React.CSSProperties = { display: "block", fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, padding: "12px 0 4px", fontFamily: mono };
  const tabBtn = (k: typeof tab, t: string) => <button key={k} data-testid={`spec-tab-${k}`} aria-pressed={tab === k} onClick={() => setTab(k)} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${tab === k ? C.brand : "transparent"}`, color: tab === k ? C.fg : C.muted, padding: "8px 12px", cursor: "pointer", fontFamily: nav, fontSize: 13 }}>{t}</button>;
  const m = def ? mascotOf(def.id, def.shape, def.color) : null;
  const body = (
    <>
      <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,.5)" }} />
      <div role="dialog" aria-modal="true" aria-label="specialist" data-testid="specialist-editor" style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 9991, width: "min(640px, calc(100vw - 32px))", maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column", borderRadius: 16, background: C.panel, color: C.fg, border: `1px solid ${C.border}`, boxShadow: "0 16px 48px rgba(0,0,0,.5)", fontFamily: nav }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px 6px" }}>
          {def && <button data-testid="spec-avatar" aria-label="choose the avatar" title="Choose another avatar" onClick={() => setPicker(true)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}><SpecialistAvatar id={def.id} size={44} shape={def.shape} color={def.color} /></button>}
          <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 600, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{def?.name ?? id}</div><div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>{def?.kind === "leader" ? `Leader of ${def.team}` : id} · {full?.usable ? "approved" : "draft"} · memory {def?.memory_scope ?? ""}</div></div>
          {def?.kind !== "leader" && <button data-testid="spec-fork" onClick={() => void fork()} disabled={busy} title="Make a new specialist from this one: same definition and notes, another avatar" style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.fg, cursor: "pointer", fontFamily: nav, fontSize: 12.5 }}>Fork</button>}
          <button data-testid="spec-close" aria-label="close" onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 2, padding: "0 12px", borderBottom: `1px solid ${C.border}` }}>{tabBtn("profile", "Profile")}{tabBtn("tools", "Tools and context")}{tabBtn("memory", `Memory${full ? ` (${full.notes.length})` : ""}`)}</div>
        <div style={{ overflowY: "auto", padding: "4px 18px 14px", flex: 1, minHeight: 0 }}>
          {!def && <div style={{ padding: 24, color: C.muted }}>{msg?.text ?? "loading…"}</div>}
          {def && (full?.warnings ?? []).length > 0 && <div data-testid="spec-warnings" role="note" style={{ margin: "10px 0 0", padding: "8px 12px", borderRadius: 10, border: `1px solid ${C.warn}`, color: C.fg, fontSize: 12, lineHeight: 1.5 }}><b style={{ color: C.warn }}>Thin: this is closer to a plain agent than to a specialist.</b>{(full?.warnings ?? []).slice(0, 6).map((w, i) => <div key={i} style={{ color: C.muted }}>· <span style={{ fontFamily: mono }}>{w.path}</span>: {w.message}</div>)}</div>}
          {def && tab === "profile" && <>
            <label style={label}>Name<input data-testid="spec-name" value={def.name} onChange={(e) => set({ name: e.target.value })} style={field} /></label>
            <label style={label}>Purpose<textarea data-testid="spec-purpose" rows={2} value={def.purpose} onChange={(e) => set({ purpose: e.target.value })} style={field} /></label>
            <label style={label}>Persona<textarea data-testid="spec-persona" rows={4} value={def.persona ?? ""} onChange={(e) => set({ persona: e.target.value })} placeholder="Who it is: tone, stance, how it works" style={field} /></label>
            <label style={label}>Extra instructions<textarea data-testid="spec-prompt" rows={4} value={def.prompt ?? ""} onChange={(e) => set({ prompt: e.target.value })} placeholder="Anything you always want it to follow" style={field} /></label>
            <label style={label}>Seat (which agent runs it)<select data-testid="spec-seat" value={def.seat} onChange={(e) => set({ seat: e.target.value, model: "" })} style={field}><option value="">your default agent{pickDefaultEngine(engines) ? ` (${pickDefaultEngine(engines)!.label})` : ""}</option>{seatChoices(engines, def.seat).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
            <label style={label}>First notes of its memory (one per line; used when it is created)<textarea data-testid="spec-seeds" rows={3} value={lines(def.seed_notes)} onChange={(ev) => set({ seed_notes: parse(ev.target.value) })} style={field} /></label>
            <label style={label}>Model (of the seat above)<select data-testid="spec-model" value={def.model ?? ""} onChange={(e) => set({ model: e.target.value })} style={field}><option value="">the seat's default</option>{modelsOf(def.seat || pickDefaultEngine(engines)?.key || "claude-code", seatModels, locals, def.model ?? "").map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
            <div style={label}>Avatar</div>
            <button onClick={() => setPicker(true)} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", color: C.fg, cursor: "pointer", fontFamily: nav, fontSize: 13 }}>{def && <SpecialistAvatar id={def.id} size={28} shape={def.shape} color={def.color} />}{m ? `${m.shape} · ${m.color}` : ""} <span style={{ color: C.muted }}>change</span></button>
          </>}
          {def && tab === "tools" && <>
            <div style={label}>{def.kind === "leader" ? "A Leader keeps every team tool; these do not limit it" : "Tools (read-only, deterministic)"}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{(full?.allowed.tools ?? []).map((t) => { const on = def.tools.includes(t); return <label key={t} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontFamily: mono, fontSize: 11.5, padding: "3px 9px", borderRadius: 14, border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.fg : C.muted, cursor: "pointer" }}><input data-testid={`spec-tool-${t}`} type="checkbox" checked={on} onChange={() => set({ tools: on ? def.tools.filter((x) => x !== t) : [...def.tools, t] })} />{t}</label>; })}</div>
            <label style={label}>Book packs (one per line)<textarea data-testid="spec-packs" rows={2} value={lines(def.packs)} onChange={(e) => set({ packs: parse(e.target.value) })} style={field} /></label>
            <label style={label}>Skills (one per line)<textarea data-testid="spec-skills" rows={2} value={lines(def.skills)} onChange={(e) => set({ skills: parse(e.target.value) })} style={field} /></label>
            <label style={label}>MCP servers (one per line; connected through Apps)<textarea data-testid="spec-mcps" rows={2} value={lines(def.mcps)} onChange={(e) => set({ mcps: parse(e.target.value) })} style={field} /></label>
            <label style={label}>Assistants (other specialists it may ask, one per line)<textarea data-testid="spec-assistants" rows={2} value={lines(def.assistants)} onChange={(e) => set({ assistants: parse(e.target.value) })} style={field} /></label>
            <label style={label}>Read first (project paths, one per line)<textarea data-testid="spec-context" rows={3} value={lines(def.context)} onChange={(e) => set({ context: parse(e.target.value) })} style={field} /></label>
            <div style={label}>Skills (one prompt per kind of task)</div>
            {(def.skill_docs ?? []).map((k, i) => <div key={i} data-testid="spec-skill" style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}><input aria-label="skill name" value={k.name} onChange={(ev) => set({ skill_docs: (def.skill_docs ?? []).map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)) })} placeholder="name" style={{ ...field, flex: "0 0 150px" }} /><input aria-label="when to use it" value={k.when} onChange={(ev) => set({ skill_docs: (def.skill_docs ?? []).map((x, j) => (j === i ? { ...x, when: ev.target.value } : x)) })} placeholder="when: the kind of task" style={field} /><button aria-label="remove the skill" onClick={() => set({ skill_docs: (def.skill_docs ?? []).filter((_, j) => j !== i) })} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer" }}>✕</button></div>
              <textarea aria-label="the prompt" rows={3} value={k.prompt} onChange={(ev) => set({ skill_docs: (def.skill_docs ?? []).map((x, j) => (j === i ? { ...x, prompt: ev.target.value } : x)) })} placeholder="the steps and the standard for this kind of work" style={field} /></div>)}
            <button data-testid="spec-skill-add" onClick={() => set({ skill_docs: [...(def.skill_docs ?? []), { name: "", when: "", prompt: "" }] })} style={{ background: "transparent", border: `1px dashed ${C.border}`, color: C.muted, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}>+ skill</button>
            <div style={label}>Tools of its own (code: rhai, `input` is the argument, the last expression is the answer; it can read the project and nothing else)</div>
            {(def.own_tools ?? []).map((t, i) => <div key={i} data-testid="spec-owntool" style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}><input aria-label="tool name" value={t.name} onChange={(ev) => set({ own_tools: (def.own_tools ?? []).map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)) })} placeholder="name" style={{ ...field, flex: "0 0 150px" }} /><input aria-label="what it takes and answers" value={t.description} onChange={(ev) => set({ own_tools: (def.own_tools ?? []).map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)) })} placeholder="what it takes and what it answers" style={field} /><button aria-label="remove the tool" onClick={() => set({ own_tools: (def.own_tools ?? []).filter((_, j) => j !== i) })} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer" }}>✕</button></div>
              <textarea aria-label="the code" rows={4} value={t.code} onChange={(ev) => set({ own_tools: (def.own_tools ?? []).map((x, j) => (j === i ? { ...x, code: ev.target.value } : x)) })} placeholder="word_count(read_file(input))" style={{ ...field, fontFamily: mono, fontSize: 12 }} /></div>)}
            <button data-testid="spec-tool-add" onClick={() => set({ own_tools: [...(def.own_tools ?? []), { name: "", description: "", code: "" }] })} style={{ background: "transparent", border: `1px dashed ${C.border}`, color: C.muted, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}>+ tool</button>
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ ...label, flex: 1 }}>Budget per run ($, 0 = none)<input data-testid="spec-budget" type="number" min={0} max={50} step={0.1} value={def.limits.budget_usd} onChange={(e) => set({ limits: { ...def.limits, budget_usd: Number(e.target.value) || 0 } })} style={field} /></label>
              <label style={{ ...label, flex: 1 }}>Turns (0 = none)<input data-testid="spec-turns" type="number" min={0} max={200} value={def.limits.turns} onChange={(e) => set({ limits: { ...def.limits, turns: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })} style={field} /></label>
            </div>
          </>}
          {def && tab === "memory" && <>
            <div data-testid="spec-memory-health" style={{ marginTop: 12, padding: "8px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
              {full?.memory ? <>{full.memory.notes} note{full.memory.notes === 1 ? "" : "s"}{full.memory.last_note_ms ? ` · last ${when(full.memory.last_note_ms)}` : " · none yet"} · {full.memory.chunks} piece{full.memory.chunks === 1 ? "" : "s"} of conversation kept ({full.memory.tokens} tokens){full.memory.consolidation?.due ? " · consolidation is due" : ""}</> : "reading its memory…"}
              {full?.memory && full.memory.chunks === 0 ? <div style={{ color: C.warn }}>No conversation has been kept yet: it is kept from its open panes whenever its chat is shown or this window is opened.</div> : null}</div>
            <div style={{ ...label, paddingTop: 12 }}>Add a note to its memory</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select data-testid="spec-note-kind" value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...field, width: 110, resize: "none" }}>{["note", "lesson", "decision"].map((k) => <option key={k}>{k}</option>)}</select>
              <input data-testid="spec-note-text" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addNote(); }} placeholder="One thing it should remember" style={field} />
              <button data-testid="spec-note-add" onClick={() => void addNote()} disabled={!note.trim()} style={{ padding: "0 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.fg, cursor: note.trim() ? "pointer" : "default" }}>Add</button>
            </div>
            <div style={{ ...label }}>Notes (append-only: a note is never rewritten, add a new one to correct it)</div>
            {(full?.notes ?? []).length === 0 && <div style={{ color: C.muted, fontSize: 12.5 }}>Nothing yet.</div>}
            {[...(full?.notes ?? [])].reverse().map((n) => <div key={n.n} data-testid="spec-note" style={{ padding: "8px 0", borderTop: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.5 }}><div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>#{n.n} · {n.kind} · {when(n.t_ms)} · {n.by}</div><div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.text}</div>{n.reason && <div style={{ fontSize: 11.5, color: C.muted }}>why: {n.reason}</div>}</div>)}
          </>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px 14px", borderTop: `1px solid ${C.border}` }}>
          <span role="status" data-testid="spec-msg" style={{ flex: 1, fontSize: 12, color: msg ? (msg.ok ? C.ok : C.bad) : C.muted }}>{msg?.text ?? (!full || full.usable ? "" : "A draft: saving it here approves it.")}</span>
          {def && def.kind !== "leader" && (sure
            ? <><span data-testid="spec-remove-ask" style={{ fontSize: 12, color: C.fg }}>Remove it from antiloki? Its memory stays on disk.</span><button data-testid="spec-remove-yes" disabled={busy} onClick={() => void remove()} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.bad}`, background: "transparent", color: C.bad, cursor: "pointer" }}>Remove</button><button data-testid="spec-remove-no" onClick={() => setSure(false)} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.fg, cursor: "pointer" }}>Keep</button></>
            : <button data-testid="spec-remove" onClick={() => setSure(true)} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "transparent", color: C.muted, cursor: "pointer" }}>Remove…</button>)}
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.fg, cursor: "pointer" }}>Close</button>
          <button data-testid="spec-save" onClick={() => void save()} disabled={!def || busy} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: C.brand, color: "#fff", cursor: busy ? "default" : "pointer", fontWeight: 600 }}>{busy ? "Saving…" : "Save"}</button>
        </div>
        {picker && def && <AvatarPicker id={def.id} shape={def.shape} color={def.color} onPick={(shape, color) => set({ shape, color })} onClose={() => setPicker(false)} />}
      </div>
    </>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : body;
}
