// THE EDIT TAB (RFC 0008 §4.3 to §4.5; mockup board 2): the palette of nodes (roles, control flow, useTool), the board with draggable chips and wires drawn from a pin, an inspector for the selected node (with the allow-list of a tool node), the
// validator, the condition editor, a simulation with stubbed outputs, and the file it writes. The Leader writes the same file through MCP: when it changes while you edit, you are shown what it changed and choose.
import { SeatField } from "./SeatField";
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { getTeam, loadCatalog, saveGraph, simulateTeam, teamOp, validateGraph } from "./api";
import { Board } from "./Board";
import { FlowEditor } from "./FlowEditor";
import { AutonomyDial } from "./AutonomyDial";
import { appSignIn } from "@/loki/cowork/api";
import { Icon, RoleBox } from "./icons";
import { diffLines, freshId, operandsOf, titleOf, withWire, withoutNode, money } from "./model";
import { TeamTriggers } from "./TeamTriggers";
import { BranchPanel } from "./BranchPanel";
import { WHY_KINDS } from "./types";
import type { AgentSpec, Catalog, CatalogItem, CheckRule, GNode, Graph, LlmSpec, MasterPage, Report, Sim } from "./types";

const card: React.CSSProperties = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" };
const hd: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: nav };
const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12.5, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "5px 12px", cursor: "pointer" };
const primary: React.CSSProperties = { ...btn, background: C.brand, borderColor: C.brand, color: "#fff" };
const field: React.CSSProperties = { width: "100%", background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", fontFamily: mono, fontSize: 12, boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontFamily: mono, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, margin: "10px 0 4px", display: "block" };
const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

function Palette({ catalog, onAdd }: { catalog: Catalog; onAdd: (item: CatalogItem) => void }) {
  const known: [string, CatalogItem["family"], string][] = [["Roles", "role", ""], ["Control flow", "control", ""], ["useTool · no model", "tool", ""]];
  // every other family the serve sends (transform, flow, gate…) gets its own group, so a new kind of node can always be added from here
  const extra = Array.from(new Set(catalog.nodes.map((n) => String(n.family)))).filter((f) => !known.some(([, k]) => k === f)).map((f): [string, CatalogItem["family"], string] => [FAMILY_LABEL[f] ?? f.charAt(0).toUpperCase() + f.slice(1), f, ""]);
  const groups = [...known, ...extra];
  // A BLANK NODE THAT CAN BE ANYTHING (operator 2026-11-21): an agent node with nothing written in it. Say in words what it does, or turn it into any other kind of node from the inspector.
  const agent = catalog.nodes.find((n) => (n.default as any).node === "role" && (n.default as any).role === "agent");
  const blank: CatalogItem | null = agent ? { ...agent, id: "blank", label: "Blank node", hint: "anything: describe what it should do, or turn it into any other kind of node", default: { ...(agent.default as any), agent: { ...((agent.default as any).agent ?? {}), title: "Blank node", responsibility: "", brief: "" } } } : null;
  return (
    <div data-testid="palette" style={{ ...card, height: "100%" }}>
      <div style={hd}><b>Nodes</b><span style={{ color: C.muted, fontSize: 11.5 }}>drag onto the board, or click</span></div>
      {blank && <div data-testid="palette-blank" onClick={() => onAdd(blank)} title={blank.hint} style={{ display: "flex", gap: 9, alignItems: "center", padding: "8px 14px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 28, height: 28, borderRadius: 7, border: `1px dashed ${C.muted}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 16 }}>+</span>
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 12.5, fontFamily: nav }}>Blank node</div><div style={{ fontSize: 11, color: C.muted, lineHeight: 1.25, fontFamily: nav }}>{blank.hint}</div></div></div>}
      {groups.map(([title, fam]) => <div key={fam}><div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, padding: "10px 14px 4px" }}>{title}</div>
        {catalog.nodes.filter((n) => n.family === fam && n.id !== "leader").map((n) => { const off = false; return (
          <div key={n.id} data-testid={`palette-${n.id}`} draggable={!off} onDragStart={(e) => e.dataTransfer.setData("text/team-node", n.id)} onClick={() => !off && onAdd(n)} title={n.hint} style={{ display: "flex", gap: 9, alignItems: "center", padding: "5px 12px", cursor: off ? "not-allowed" : "grab", opacity: off ? 0.45 : 1 }}>
            {n.default.node === "role" ? <RoleBox role={n.default.role} size={26} /> : <span style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: fam === "tool" ? "#6ee7d8" : C.fg, background: C.panel2, flex: "none" }}><Icon name={n.icon} size={16} /></span>}
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 12.5, fontFamily: nav }}>{n.label}</div><div style={{ fontSize: 11, color: C.muted, lineHeight: 1.25, fontFamily: nav }}>{n.hint}</div></div></div>); })}</div>)}
    </div>
  );
}

/** A JSON value edited as text: it is applied when it parses, and the last good value stays while it does not. */
function JsonBox({ label, value, onValid, testid }: { label: string; value: unknown; onValid: (v: any) => void; testid: string }) {
  const [text, setText] = React.useState(() => JSON.stringify(value, null, 1)); const [bad, setBad] = React.useState(false);
  return <><span style={lbl}>{label}</span><textarea data-testid={testid} spellCheck={false} rows={4} value={text} onChange={(e) => { setText(e.target.value); try { onValid(JSON.parse(e.target.value)); setBad(false); } catch { setBad(true); } }} style={{ ...field, resize: "vertical" }} />
    {bad && <div data-testid={`${testid}-bad`} style={{ fontSize: 11.5, color: "var(--c-bad)" }}>not valid JSON yet; the node keeps its last good value</div>}</>;
}

function CondField({ label, value, onChange, graph, testid }: { label: string; value: string; onChange: (v: string) => void; graph: Graph; testid: string }) {
  const ops = operandsOf(graph);
  return <div><span style={lbl}>{label}</span><input data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} style={{ ...field, background: "var(--c-bg)" }} />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>{ops.slice(0, 40).map((o) => <button key={o.name} title={`insert ${o.name}`} onClick={() => onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${o.name}`)} style={{ fontFamily: mono, fontSize: 10.5, border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 6px", color: C.muted, background: "transparent", cursor: "pointer" }}>{o.name} <i>{o.type}</i></button>)}</div>
    <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>No code, no functions, no model call. Needs judgement? An agent node returns an enum and a <b>switch</b> reads it.</div></div>;
}

/** A custom agent's own fields (RFC 0008 §4.16): one responsibility, a brief, what it reads, its skills, its MCP tools and what it may do in the world. Outward and money put a human node in front of it. */
function AgentFields({ a, onChange, effects }: { a: AgentSpec; onChange: (a: AgentSpec) => void; effects: string[] }) {
  const up = (p: Partial<AgentSpec>) => onChange({ ...a, ...p });
  return <div data-testid="agent-fields">
    <span style={lbl}>Title</span><input data-testid="ins-agent-title" value={a.title} onChange={(e) => up({ title: e.target.value })} style={field} />
    <span style={lbl}>Its one responsibility</span><input data-testid="ins-agent-resp" value={a.responsibility} onChange={(e) => up({ responsibility: e.target.value })} style={field} />
    <span style={lbl}>Brief</span><textarea data-testid="ins-agent-brief" rows={4} value={a.brief} onChange={(e) => up({ brief: e.target.value })} style={{ ...field, resize: "vertical" }} />
    <span style={lbl}>Reads first (files)</span><input data-testid="ins-agent-context" value={(a.context ?? []).join(", ")} onChange={(e) => up({ context: csv(e.target.value) })} style={field} />
    <span style={lbl}>Skills (the team's own)</span><input data-testid="ins-agent-skills" value={(a.skills ?? []).join(", ")} onChange={(e) => up({ skills: csv(e.target.value) })} style={field} />
    <span style={lbl}>MCP tools it may use</span><input data-testid="ins-agent-mcp" value={(a.mcp ?? []).join(", ")} onChange={(e) => up({ mcp: csv(e.target.value) })} style={field} />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{effects.map((f) => { const on = (a.effects ?? []).includes(f); return <label key={f} data-testid={`agent-effect-${f}`} style={{ fontFamily: mono, fontSize: 11, border: `1px solid ${on ? "#1f5a41" : C.border}`, borderRadius: 999, padding: "2px 9px", cursor: "pointer", color: on ? C.fg : C.muted }}><input type="checkbox" checked={on} onChange={() => up({ effects: on ? (a.effects ?? []).filter((x) => x !== f) : [...(a.effects ?? []), f] })} style={{ display: "none" }} />{f}</label>; })}</div>
    <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>⚑ outward (post, send, publish) and money always put a human node in front of this agent.</div>
  </div>;
}
/** The model node's fields (RFC 0010 §4.4): the seat, the prompt, the typed answer, and the safeguards that let a small seat do the step: free source check, a second seat that must agree, the ladder upwards. */
function LlmFields({ n, onChange }: { n: LlmSpec & { node: "llm" }; onChange: (p: Partial<LlmSpec>) => void }) {
  const [ans, setAns] = React.useState(() => JSON.stringify(n.answer, null, 1)); const [bad, setBad] = React.useState(false); const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  return <>
    <span style={lbl}>Seat</span><SeatField value={n.seat} onChange={(seat) => onChange({ seat })} style={field} />
    <span style={lbl}>Prompt ({"{ask}"}, {"{node.field}"}, {"{artifact:name.md}"})</span><textarea data-testid="ins-llm-prompt" value={n.prompt} onChange={(e) => onChange({ prompt: e.target.value })} style={{ ...field, minHeight: 80 }} />
    <span style={lbl}>Typed answer</span><textarea data-testid="ins-llm-answer" spellCheck={false} value={ans} onChange={(e) => { setAns(e.target.value); try { const v = JSON.parse(e.target.value); if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object"); setBad(false); onChange({ answer: v }); } catch { setBad(true); } }} style={{ ...field, minHeight: 80, fontFamily: mono, fontSize: 11.5, border: `1px solid ${bad ? "var(--c-bad)" : C.border}` }} />
    {bad && <div data-testid="ins-llm-bad" style={{ fontSize: 11.5, color: "var(--c-bad)" }}>not valid JSON yet; the node keeps its last good answer</div>}
    <span style={lbl}>If it fails, try (a stronger seat each, in order)</span><input data-testid="ins-llm-fallback" value={(n.fallback ?? []).join(", ")} onChange={(e) => onChange({ fallback: csv(e.target.value) })} style={field} />
    <span style={lbl}>Another seat must agree (cross-check)</span><input data-testid="ins-llm-agree" value={(n.agree_with ?? []).join(", ")} onChange={(e) => onChange({ agree_with: csv(e.target.value) })} style={field} />
    <span style={lbl}>Fields that must appear in the source text</span><input data-testid="ins-llm-insource" value={(n.verify?.in_source ?? []).join(", ")} onChange={(e) => onChange({ verify: { ...n.verify, in_source: csv(e.target.value) } })} style={field} />
    <span style={lbl}>…the source text</span><input data-testid="ins-llm-source" value={n.verify?.source ?? ""} placeholder="{ask}" onChange={(e) => onChange({ verify: { ...n.verify, source: e.target.value } })} style={field} />
    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>One call, no tools, no files. A small or local seat is safe for a step like this only with a safeguard: the free source check, a second seat that must agree, and a stronger seat to climb to (the ladder never goes down).</div>
  </>;
}
/** The check node's fields: what it checks, and its rules as JSON (a closed list of kinds: forbid, require, words, chars, lines, sections, json, html_clean, readability, file_exists, file_size). Applied as soon as it parses. */
function CheckFields({ on, rules, graph, onChange }: { on: string; rules: CheckRule[]; graph: Graph; onChange: (p: { on?: string; rules?: CheckRule[] }) => void }) {
  const [text, setText] = React.useState(() => JSON.stringify(rules, null, 2)); const [bad, setBad] = React.useState(false);
  const docs = Object.values(graph.nodes).flatMap((x) => (x.node === "artifact" ? [`artifact:${x.name}.${x.format}`] : []));
  return <>
    <span style={lbl}>Checks</span><input data-testid="ins-check-on" list="ins-check-sources" value={on} onChange={(e) => onChange({ on: e.target.value })} style={field} /><datalist id="ins-check-sources">{docs.map((d) => <option key={d} value={d} />)}</datalist>
    <span style={lbl}>Rules ({rules.length})</span>
    <textarea data-testid="ins-check-rules" spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); try { const v = JSON.parse(e.target.value); if (!Array.isArray(v)) throw new Error("not a list"); setBad(false); onChange({ rules: v }); } catch { setBad(true); } }} style={{ ...field, minHeight: 150, fontFamily: mono, fontSize: 11.5, border: `1px solid ${bad ? "var(--c-bad)" : C.border}` }} />
    {bad && <div data-testid="ins-check-bad" style={{ fontSize: 11.5, color: "var(--c-bad)" }}>that is not valid JSON yet; the check keeps its last good rules</div>}
    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>A check costs nothing and answers the same every time: no model. It leaves by <code>out</code> with <code>pass</code>; a loop or an if reads <code>{"{id}"}.pass</code>. What failed is told to the agent after it. Use a check wherever a reviewer's job was mechanical.</div>
  </>;
}
/** The master page node's fields: its title, and its sections as JSON (a closed list of widgets: hero, summary, markdown, kpis, table, checklist, timeline, cards, cost, links, callout, bar, embed). Applied as soon as it parses. */
function MasterPageFields({ page, onChange }: { page: MasterPage; onChange: (c: MasterPage) => void }) {
  const [text, setText] = React.useState(() => JSON.stringify(page.sections, null, 2)); const [bad, setBad] = React.useState(false);
  const types = page.sections.flatMap((s) => s.widgets.map((w) => String(w.type)));
  return <>
    <span style={lbl}>Page title</span><input data-testid="ins-page-title" value={page.title ?? ""} onChange={(e) => onChange({ ...page, title: e.target.value })} style={field} />
    <span style={lbl}>Sections ({page.sections.length} · {types.length} widgets)</span>
    <textarea data-testid="ins-page-sections" spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); try { const v = JSON.parse(e.target.value); if (!Array.isArray(v)) throw new Error("not a list"); setBad(false); onChange({ ...page, sections: v }); } catch { setBad(true); } }} style={{ ...field, minHeight: 160, fontFamily: mono, fontSize: 11.5, border: `1px solid ${bad ? "var(--c-bad)" : C.border}` }} />
    {bad && <div data-testid="ins-page-bad" style={{ fontSize: 11.5, color: "var(--c-bad)" }}>that is not valid JSON yet; the page keeps its last good sections</div>}
    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>The run builds ONE page from this, with no model: the person reads that page. Sources: <code>report:&lt;node&gt;</code>, <code>node:&lt;node&gt;.&lt;field&gt;</code>, <code>artifact:&lt;name&gt;.md</code>, <code>ask</code>, <code>run:cost</code>.</div>
  </>;
}
function Inspector({ id, node, graph, onPatch, onKind, onDelete, onUnwire }: { id: string; node: GNode; graph: Graph; onPatch: (p: Partial<GNode>) => void; onKind: (k: any) => void; onDelete: () => void; onUnwire: (key: string) => void }) {
  const n: any = node; const set = (k: string, v: unknown) => onKind({ ...n, [k]: v }); const out = graph.edges.filter((e) => e.from === id);
  const effects = ["read", "network", "write", "exec", "destructive", "money", "outward"]; const aEff = ["read", "document", "web", "write", "outward", "money"]; const allow = n.allow ?? {};
  const num = (v: string) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
  return (
    <div data-testid="inspector" data-node={id} style={{ ...card, height: "100%" }}>
      <div style={hd}><span style={{ color: "#6ee7d8", display: "inline-flex" }}><Icon name={n.node === "role" ? n.role : n.node === "use_tool" ? "wrench" : n.node === "if" ? "ifelse" : n.node === "for_each" ? "foreach" : n.node === "budget_gate" ? "gauge" : n.node === "human" ? "hand" : n.node === "retry" ? "fallback" : n.node} size={16} /></span><b>{titleOf(id, node)}</b><span style={{ marginLeft: "auto", color: C.muted, fontSize: 11.5 }}>{n.node === "use_tool" ? `useTool · ${n.tool.type}` : n.node}</span></div>
      <div style={{ padding: "4px 14px 14px", fontFamily: nav }}>
        <span style={lbl}>Name</span><input data-testid="ins-label" value={n.label ?? ""} placeholder={id} onChange={(e) => onPatch({ label: e.target.value || null })} style={field} />
        {["role", "check", "use_tool"].includes(n.node) && <>
          <span style={lbl}>Why it is here</span><select data-testid="ins-why" value={n.why?.kind ?? ""} onChange={(e) => onPatch({ why: e.target.value ? { kind: e.target.value, note: n.why?.note ?? "" } : null })} style={field}><option value="">no reason given</option>{WHY_KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select>
          {n.why && <input data-testid="ins-why-note" value={n.why.note ?? ""} placeholder="one sentence" onChange={(e) => onPatch({ why: { kind: n.why!.kind, note: e.target.value } })} style={{ ...field, marginTop: 4 }} />}
        </>}
        {n.node === "llm" && <LlmFields n={n} onChange={(p) => onPatch(p as Partial<GNode>)} />}
        {n.node === "llm" && <><JsonBox label="Preset (classify, extract, judge, summarize, rewrite, sentiment)" testid="ins-llm-preset" value={n.preset ?? null} onValid={(v) => set("preset", v)} />
          <JsonBox label="Router (candidates cheapest first, a safety floor); seat becomes router:name" testid="ins-llm-router" value={n.router ?? null} onValid={(v) => set("router", v)} />
          <JsonBox label="Examples from memory ({task_class, k})" testid="ins-llm-examples-from" value={n.examples_from ?? null} onValid={(v) => set("examples_from", v)} /></>}
        {n.node === "check" && <CheckFields on={n.on} rules={n.rules} graph={graph} onChange={(p) => onPatch(p as Partial<GNode>)} />}
        {n.node === "role" && <>
          <span style={lbl}>Tier</span><select data-testid="ins-tier" value={n.tier ?? ""} onChange={(e) => set("tier", e.target.value || null)} style={field}><option value="">default ({n.role === "planner" ? "mid" : "low"})</option><option value="low">low</option><option value="mid">mid</option><option value="high">high</option></select>
          <span style={lbl}>Model (or engine:model)</span><input data-testid="ins-model" value={n.model ?? ""} placeholder="the tier's own model" onChange={(e) => set("model", e.target.value || null)} style={field} />
          {n.role === "agent" && <AgentFields a={n.agent ?? { title: "", responsibility: "", brief: "" }} onChange={(a) => set("agent", a)} effects={aEff} />}
          {["worker", "debugger", "agent"].includes(n.role) && <><span style={lbl}>Owns (files it may write)</span><input data-testid="ins-owns" value={(n.owns ?? []).join(", ")} onChange={(e) => set("owns", csv(e.target.value))} style={field} /></>}
          {n.role === "worker" && <><span style={lbl}>In parallel</span><input data-testid="ins-parallel" inputMode="numeric" value={n.parallel ?? ""} onChange={(e) => set("parallel", num(e.target.value) || null)} style={{ ...field, width: 70 }} /></>}
          {!["worker", "debugger", "agent"].includes(n.role) && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>A {n.role} is read-only: it never edits.</div>}
        </>}
        {n.node === "artifact" && <>
          <span style={lbl}>Name</span><input data-testid="ins-art-name" value={n.name} onChange={(e) => set("name", e.target.value.replace(/[^A-Za-z0-9_-]/g, "-"))} style={field} />
          <span style={lbl}>Format</span><select data-testid="ins-art-format" value={n.format} onChange={(e) => set("format", e.target.value)} style={field}>{["md", "html", "txt", "json", "csv", "svg"].map((f) => <option key={f} value={f}>{f}</option>)}</select>
          {!n.compose && <><span style={lbl}>Made from the work of</span><select data-testid="ins-art-from" value={n.from ?? ""} onChange={(e) => set("from", e.target.value || null)} style={field}><option value="">choose a node</option>{Object.entries(graph.nodes).filter(([k, x]) => k !== id && (x.node === "role" || x.node === "use_tool")).map(([k, x]) => <option key={k} value={k}>{titleOf(k, x)}</option>)}</select></>}
          {n.compose && <MasterPageFields page={n.compose} onChange={(c) => set("compose", c)} />}
          <span style={lbl}>Title (optional)</span><input data-testid="ins-art-title" value={n.title ?? ""} onChange={(e) => set("title", e.target.value || null)} style={field} />
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>A document for the run, not code: it is kept with the run and never reaches your branch. It is the file that node wrote as .antiloki/artifacts/{n.name}.{n.format}, or else its report.</div>
        </>}
        {n.node === "code" && <><span style={lbl}>Program (Rhai: `input` in, a value out; no clock, files or network)</span><textarea data-testid="ins-code-source" spellCheck={false} rows={6} value={n.source} onChange={(e) => set("source", e.target.value)} style={{ ...field, resize: "vertical" }} />
          <JsonBox label="Examples that must pass ({input, output}[])" testid="ins-code-examples" value={n.examples ?? []} onValid={(v) => set("examples", v)} />
          <span style={lbl}>Input from (values:node.field)</span><input data-testid="ins-code-from" value={n.from ?? ""} onChange={(e) => set("from", e.target.value || null)} style={field} /></>}
        {n.node === "transform" && <><span style={lbl}>Mode</span><select data-testid="ins-transform-mode" value={n.mode} onChange={(e) => set("mode", e.target.value)} style={field}>{["edit_fields", "filter", "sort", "aggregate", "split", "limit", "dedupe", "template", "format_json", "sanitize"].map((m) => <option key={m} value={m}>{m}</option>)}</select>
          <JsonBox label="Settings of the mode" testid="ins-transform-config" value={n.config ?? {}} onValid={(v) => set("config", v)} />
          <span style={lbl}>Input from (values:node.field)</span><input data-testid="ins-transform-from" value={n.from ?? ""} onChange={(e) => set("from", e.target.value || null)} style={field} /></>}
        {n.node === "stop" && <><span style={lbl}>Message to the person</span><input data-testid="ins-stop-message" value={n.message} onChange={(e) => set("message", e.target.value)} style={field} /></>}
        {n.node === "sub_team" && <><span style={lbl}>Team to run</span><input data-testid="ins-subteam-team" value={n.team} onChange={(e) => set("team", e.target.value)} style={field} />
          <span style={lbl}>Ask it ({"{ask}"}, {"{node.field}"})</span><textarea data-testid="ins-subteam-ask" rows={3} value={n.ask ?? ""} onChange={(e) => set("ask", e.target.value)} style={{ ...field, resize: "vertical" }} />
          <span style={lbl}>Share of this node's budget (0 to 1)</span><input data-testid="ins-subteam-share" inputMode="decimal" value={n.budget_share ?? ""} placeholder="0.5" onChange={(e) => set("budget_share", e.target.value.trim() === "" ? null : num(e.target.value))} style={{ ...field, width: 90 }} />
          <JsonBox label="Outputs (name → node.field of the inner run)" testid="ins-subteam-outputs" value={n.outputs ?? {}} onValid={(v) => set("outputs", v)} /></>}
        {n.node === "if" && <CondField label="Condition" value={n.cond} onChange={(v) => set("cond", v)} graph={graph} testid="ins-cond" />}
        {n.node === "switch" && <CondField label="On" value={n.on} onChange={(v) => set("on", v)} graph={graph} testid="ins-on" />}
        {n.node === "loop" && <><span style={lbl}>Most passes</span><input data-testid="ins-max" inputMode="numeric" value={n.max_iterations} onChange={(e) => set("max_iterations", Math.max(0, Math.round(num(e.target.value))))} style={{ ...field, width: 80 }} /><CondField label="Until (optional)" value={n.until ?? ""} onChange={(v) => set("until", v || null)} graph={graph} testid="ins-until" /></>}
        {n.node === "for_each" && <><CondField label="Over (a list)" value={n.over} onChange={(v) => set("over", v)} graph={graph} testid="ins-over" />
          <span style={lbl}>Items per pass (batch)</span><input data-testid="ins-batch" inputMode="numeric" value={n.batch ?? ""} placeholder="1" onChange={(e) => set("batch", e.target.value.trim() === "" ? null : Math.max(1, Math.round(num(e.target.value))))} style={{ ...field, width: 80 }} />
          <span style={lbl}>When an item fails</span><select data-testid="ins-on-error" value={n.on_error ?? "stop"} onChange={(e) => set("on_error", e.target.value === "stop" ? null : e.target.value)} style={field}><option value="stop">stop: the failure goes its way</option><option value="collect">collect it and go on</option></select></>}
        {n.node === "retry" && <><span style={lbl}>Circuit breaker: open after (tries)</span><input data-testid="ins-open-after" inputMode="numeric" value={n.open_after ?? ""} placeholder="never" onChange={(e) => set("open_after", e.target.value.trim() === "" ? null : Math.max(1, Math.round(num(e.target.value))))} style={{ ...field, width: 80 }} /><span style={lbl}>Most tries</span><input data-testid="ins-retry-max" inputMode="numeric" value={n.max} onChange={(e) => set("max", Math.max(0, Math.round(num(e.target.value))))} style={{ ...field, width: 80 }} /><span style={lbl}>Backoff (seconds)</span><input inputMode="numeric" value={n.backoff_s ?? 0} onChange={(e) => set("backoff_s", Math.max(0, Math.round(num(e.target.value))))} style={{ ...field, width: 80 }} /></>}
        {n.node === "timer" && <><span style={lbl}>Mode</span><select value={n.mode} onChange={(e) => set("mode", e.target.value)} style={field}><option value="delay">delay</option><option value="timeout">timeout</option><option value="schedule">schedule</option></select>
          {n.mode !== "schedule" && <><span style={lbl}>Seconds</span><input inputMode="numeric" value={n.seconds ?? 0} onChange={(e) => set("seconds", Math.max(0, Math.round(num(e.target.value))))} style={{ ...field, width: 90 }} /></>}{n.mode === "timeout" && <><span style={lbl}>Wraps node</span><select value={n.wraps ?? ""} onChange={(e) => set("wraps", e.target.value || null)} style={field}><option value="">—</option>{Object.keys(graph.nodes).filter((k) => k !== id).map((k) => <option key={k} value={k}>{k}</option>)}</select></>}{n.mode === "schedule" && <><span style={lbl}>Cron</span><input value={n.cron ?? ""} onChange={(e) => set("cron", e.target.value || null)} style={field} /></>}</>}
        {n.node === "join" && <><span style={lbl}>Waits for</span><select value={n.policy} onChange={(e) => set("policy", e.target.value)} style={field}><option value="all">all</option><option value="any">the first</option><option value="quorum">a quorum</option><option value="consensus">all, and they must agree</option></select>{n.policy === "quorum" && <input inputMode="numeric" value={n.quorum ?? 1} onChange={(e) => set("quorum", Math.max(1, Math.round(num(e.target.value))))} style={{ ...field, width: 70, marginTop: 6 }} />}</>}
        {n.node === "budget_gate" && <><span style={lbl}>Stop at (share of budget)</span><input inputMode="decimal" value={n.stop_at} onChange={(e) => set("stop_at", num(e.target.value))} style={{ ...field, width: 80 }} /><span style={lbl}>Ask at</span><input inputMode="decimal" value={n.ask_at ?? ""} onChange={(e) => set("ask_at", num(e.target.value) || null)} style={{ ...field, width: 80 }} /></>}
        {["role", "llm", "use_tool", "code", "transform", "check", "sub_team"].includes(n.node) && <><span style={lbl}>Autonomy</span><AutonomyDial value={n.autonomy} onChange={(v) => set("autonomy", v === "auto" ? null : v)} /></>}
        {n.node === "human" && <><span style={lbl}>Gate</span><select data-testid="ins-gate" value={n.gate} onChange={(e) => set("gate", e.target.value)} style={field}><option value="merge">merge</option><option value="plan">plan</option><option value="spend">spend</option><option value="blocked">blocked</option></select><span style={lbl}>Risk of what comes next</span><select data-testid="ins-approval-risk" value={n.approval?.risk ?? ""} onChange={(e) => set("approval", { risk: e.target.value, note: n.approval?.note ?? "" })} style={field}><option value="">(by the gate)</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
          <span style={lbl}>What will happen, as the card says it ({"{ask}"} and {"{node.field}"} fill in)</span><textarea data-testid="ins-approval-note" rows={3} value={n.approval?.note ?? ""} onChange={(e) => set("approval", { risk: n.approval?.risk ?? "", note: e.target.value })} style={field} />
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Only you pass it. The Leader can ask; no agent, tool or hook can approve.</div></>}
        {n.node === "use_tool" && <>
          <span style={lbl}>Type</span><select data-testid="ins-tool-type" value={n.tool.type} onChange={(e) => set("tool", { ...n.tool, type: e.target.value })} style={field}><option value="skill">skill</option><option value="pane">pane</option><option value="mcp">mcp</option><option value="source">source</option><option value="web">web (search, read a page)</option><option value="webapp">web app (a tool of an installed app)</option><option value="db">database (sqlite, csv, bench)</option><option value="file">file (inside the run's folder)</option><option value="saga">saga (this workspace's)</option><option value="mcp_url">MCP server (by address)</option><option value="telegram">Telegram (send a message)</option><option value="git">git (the team's own branch and worktrees)</option><option value="api">http API (the name is the method)</option></select>
          {n.tool.type === "web" && <><span style={lbl}>{n.tool.name === "fetch" ? "Address to read" : n.tool.name === "docs" ? "Docs start page (its pages are saved as files)" : "What to search for"}</span><input data-testid="ins-web-arg" value={(n.tool.args ?? {})[n.tool.name === "fetch" || n.tool.name === "docs" ? "url" : "query"] ?? ""} placeholder="{ask} or {node.field} fill from the run" onChange={(e) => set("tool", { ...n.tool, args: { ...(n.tool.args ?? {}), [n.tool.name === "fetch" || n.tool.name === "docs" ? "url" : "query"]: e.target.value } })} style={field} /><div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Name this node "search" or "fetch" below. A search uses a Brave key if you have set one, else your seat's own web search (a few cents); a page is read with no model. What it finds goes to the nodes after it.</div></>}
          {n.tool.type === "telegram" && <div data-testid="ins-telegram" style={{ display: "grid", gap: 4, margin: "4px 0" }}>
            <span style={lbl}>Chat (-100… for a channel, or @name)</span><input data-testid="ins-tg-chat" value={(n.tool.args ?? {}).chat ?? ""} onChange={(e) => set("tool", { ...n.tool, name: "send", args: { ...(n.tool.args ?? {}), chat: e.target.value } })} style={field} />
            <span style={lbl}>Message ({"{ask}"} and {"{node.field}"} fill in; a summary and links, not documents)</span><textarea data-testid="ins-tg-text" rows={3} value={(n.tool.args ?? {}).text ?? ""} onChange={(e) => set("tool", { ...n.tool, name: "send", args: { ...(n.tool.args ?? {}), text: e.target.value } })} style={field} />
            <span style={lbl}>Name of the stored bot token</span><input data-testid="ins-tg-token" value={(n.tool.args ?? {}).token ?? ""} onChange={(e) => set("tool", { ...n.tool, name: "send", args: { ...(n.tool.args ?? {}), token: e.target.value } })} style={field} />
            <TgToken name={(n.tool.args ?? {}).token ?? ""} />
            <div style={{ fontSize: 11, color: C.muted }}>It tells someone else, so a person must approve before it in the flow, and the node lists network and outward.</div></div>}
          <span style={lbl}>Name (search, fetch or docs for a web tool)</span><input data-testid="ins-tool-name" value={n.tool.name} onChange={(e) => set("tool", { ...n.tool, name: e.target.value })} style={field} />
          {["db", "file", "saga", "webapp"].includes(n.tool.type) && <JsonBox label={n.tool.type === "db" ? "Call (kind, op, sql with ? and params)" : n.tool.type === "file" ? "Call (op: read or write, content or content_from)" : n.tool.type === "saga" ? "Call (op: read, write, run, sync, and its fields)" : "Call (tool, arguments)"} testid="ins-tool-args" value={n.tool.args ?? {}} onValid={(v) => set("tool", { ...n.tool, args: v })} />}
          <span style={lbl}>Allow-list (least privilege)</span>
          <input data-testid="ins-allow-paths" placeholder="paths: src/**, docs/**" value={(allow.paths ?? []).join(", ")} onChange={(e) => set("allow", { ...allow, paths: csv(e.target.value) })} style={field} />
          <input data-testid="ins-allow-skills" placeholder="skills: run-tests" value={(allow.skills ?? []).join(", ")} onChange={(e) => set("allow", { ...allow, skills: csv(e.target.value) })} style={{ ...field, marginTop: 5 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{effects.map((f) => { const on = (allow.effects ?? []).includes(f); return <label key={f} data-testid={`effect-${f}`} style={{ fontFamily: mono, fontSize: 11, border: `1px solid ${on ? "#1f5a41" : C.border}`, color: on ? "var(--c-ok)" : C.muted, borderRadius: 5, padding: "1px 7px", cursor: "pointer" }}><input type="checkbox" checked={on} onChange={() => set("allow", { ...allow, effects: on ? (allow.effects ?? []).filter((x: string) => x !== f) : [...(allow.effects ?? []), f] })} style={{ display: "none" }} />{on ? "✓ " : ""}{f}{f === "destructive" || f === "money" ? " ⚑" : ""}</label>; })}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>⚑ destructive and money always put a human node in front of the call; no agent can satisfy it.</div>
          <span style={lbl}>Typed outputs (name:type, …)</span><input data-testid="ins-outputs" value={Object.entries(n.outputs ?? {}).map(([k, v]) => `${k}:${v}`).join(", ")} onChange={(e) => set("outputs", Object.fromEntries(csv(e.target.value).map((p) => p.split(":")).filter((p) => p[0]).map((p) => [p[0].trim(), (p[1] ?? "string").trim()])))} style={field} />
        </>}
        <span style={lbl}>Cost cap ($)</span><input data-testid="ins-cap" inputMode="decimal" value={n.cap_usd ?? ""} onChange={(e) => onPatch({ cap_usd: num(e.target.value) || null })} style={{ ...field, width: 90 }} />
        <span style={lbl}>Time limit (seconds)</span><input data-testid="ins-timeout" inputMode="numeric" value={n.timeout_s ?? ""} onChange={(e) => onPatch({ timeout_s: Math.round(num(e.target.value)) || null })} style={{ ...field, width: 90 }} />
        <span style={lbl}>Wires out</span>
        {out.length ? out.map((e) => <div key={`${e.port}${e.to}`} style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: mono, fontSize: 11.5, padding: "2px 0" }}><span style={{ color: C.muted }}>{e.port}</span><span>→ {e.to}</span><button aria-label={`remove the wire ${e.port} to ${e.to}`} onClick={() => onUnwire(`${e.from}|${e.port}|${e.to}`)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.muted, cursor: "pointer" }}>✕</button></div>) : <div style={{ fontSize: 11.5, color: C.muted }}>none: drag from the pin on the right of the node</div>}
        {n.node !== "leader" && <button data-testid="ins-delete" onClick={onDelete} style={{ ...btn, marginTop: 14, color: "var(--c-bad)", borderColor: "var(--c-bad)" }}>Remove the node</button>}
      </div>
    </div>
  );
}

/** The names of the node groups the serve sends beyond the three known ones (RFC 0014: the support and specialist nodes of a local-model team). */
export const FAMILY_LABEL: Record<string, string> = { local: "Local-model support" };
export function TeamEdit({ team, graph: saved, onSaved, onBack }: { team: string; graph: Graph; onSaved: () => void; onBack: () => void }) {
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [base, setBase] = React.useState<Graph>(saved); const [draft, setDraft] = React.useState<Graph>(saved); const [past, setPast] = React.useState<Graph[]>([]);
  const [sel, setSel] = React.useState<string | null>(null); const [selWire, setSelWire] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<Report | null>(null); const [sim, setSim] = React.useState<Sim | null>(null); const [stubs, setStubs] = React.useState("{}"); const [msg, setMsg] = React.useState<{ text: string; bad?: boolean } | null>(null);
  const [theirs, setTheirs] = React.useState<Graph | null>(null); const [templates, setTemplates] = React.useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const [mode, setModeRaw] = React.useState<"flow" | "board">(() => { try { return localStorage.getItem("antiloki.team.edit.mode") === "board" ? "board" : "flow"; } catch { return "flow"; } });   // the flow is the default (approved mockup 2026-11-18); the board is one click away
  const setMode = (m: "flow" | "board") => { setModeRaw(m); try { localStorage.setItem("antiloki.team.edit.mode", m); } catch { /* private window */ } };
  React.useEffect(() => { void loadCatalog().then(setCatalog); }, []);
  // the Leader (or another window) may write the same file while this tab is open: a clean draft follows it, a dirty one is shown the difference
  React.useEffect(() => { const t = setInterval(() => void getTeam(team).then((r) => { if (!r) return; if (JSON.stringify(r.graph) === JSON.stringify(base)) return; if (!dirty) { setBase(r.graph); setDraft(r.graph); } else setTheirs(r.graph); }), 4000); return () => clearInterval(t); }, [team, base, dirty]);
  React.useEffect(() => { const t = setTimeout(() => void validateGraph(draft).then((r) => { if (r.ok) setReport(r.report); }), 350); return () => clearTimeout(t); }, [draft]);
  const change = (g: Graph) => { setPast((p) => [...p.slice(-49), draft]); setDraft(g); setSim(null); };
  const addNode = (item: CatalogItem, pos?: [number, number]) => { const id = freshId(draft, item.id); const node: GNode = { ...(item.default as any) }; if (pos) node.pos = pos; else { const xs = Object.values(draft.nodes).map((n) => n.pos?.[0] ?? 0); node.pos = [Math.max(40, ...xs) + 40, 40 + Object.keys(draft.nodes).length * 12]; } change({ ...draft, nodes: { ...draft.nodes, [id]: node } }); setSel(id); setSelWire(null); };
  const ports = (id: string): string[] => { const n: any = draft.nodes[id]; const item = catalog?.nodes.find((c) => (c.default as any).node === n.node && (n.node !== "role" || (c.default as any).role === n.role) && (n.node !== "use_tool" || c.family === "tool")); return item?.ports.length ? item.ports : ["out"]; };
  const patchNode = (id: string, p: Partial<GNode>) => change({ ...draft, nodes: { ...draft.nodes, [id]: { ...draft.nodes[id], ...p } as GNode } });
  const setKind = (id: string, k: GNode) => change({ ...draft, nodes: { ...draft.nodes, [id]: k } });
  const unwire = (key: string) => { change({ ...draft, edges: draft.edges.filter((e) => `${e.from}|${e.port}|${e.to}` !== key) }); setSelWire(null); };
  const remove = (id: string) => { change(withoutNode(draft, id)); setSel(null); };
  const undo = () => setPast((p) => { if (!p.length) return p; setDraft(p[p.length - 1]); return p.slice(0, -1); });
  const save = async () => { const r = await saveGraph(draft); if (r.ok) { setBase(r.graph); setDraft(r.graph); setMsg({ text: r.report && r.report.errors.length ? "saved as a draft: it cannot run until the errors are fixed" : "saved" }); onSaved(); } else setMsg({ text: r.error ?? "not saved", bad: true }); };
  const simulate = async () => { let stubObj: Record<string, unknown[]> = {}; try { const o = JSON.parse(stubs || "{}"); stubObj = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])); } catch { setMsg({ text: "the stubs are not JSON", bad: true }); return; } const r = await simulateTeam({ graph: draft, stubs: stubObj }); if (r.ok) { setSim(r.sim); setMsg(null); } else setMsg({ text: r.error ?? "could not simulate", bad: true }); };
  const startFromTemplate = async (key: string) => { const r = await teamOp<{ graph: Graph }>("template", { template: key, name: draft.team, budget_usd: draft.budget_usd }); if (r.ok && r.graph) { change(r.graph); setTemplates(false); setMsg({ text: `the ${key} template is in the editor: save to keep it` }); } else setMsg({ text: r.error ?? "no such template", bad: true }); };
  const onKey = (e: React.KeyboardEvent) => { const tag = (e.target as HTMLElement).tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; if ((e.key === "Delete" || e.key === "Backspace")) { if (selWire) unwire(selWire); else if (sel && draft.nodes[sel]?.node !== "leader") remove(sel); } };
  const errs = report?.errors ?? [], warns = report?.warnings ?? [];
  return (
    <div data-testid="team-edit" tabIndex={0} onKeyDown={onKey} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, fontFamily: nav, color: C.fg, outline: "none" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>Edit team · {draft.team}</b><span style={{ fontFamily: mono, fontSize: 11.5, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 9px", color: C.muted }} data-testid="edit-state">{dirty ? "draft · not saved" : "saved"}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, position: "relative" }}>
          <button data-testid="edit-undo" style={btn} disabled={!past.length} onClick={undo}>Undo</button>
          <button data-testid="edit-templates" style={btn} onClick={() => setTemplates((t) => !t)}>Templates ▾</button>
          {templates && <div data-testid="template-menu" style={{ position: "absolute", top: 34, right: 90, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 6, zIndex: 8, display: "flex", flexDirection: "column", gap: 4 }}>{(catalog?.templates ?? []).map((t) => <button key={t} data-testid={`template-${t}`} style={{ ...btn, textAlign: "left" }} onClick={() => void startFromTemplate(t)}>{t}</button>)}</div>}
          <button data-testid="edit-back" style={btn} onClick={onBack}>Back to the run</button>
          <button data-testid="edit-save" style={primary} disabled={!dirty} onClick={() => void save()}>Save</button>
        </span>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}><TeamTriggers team={team} onChanged={onSaved} /></div>
      {theirs && <div data-testid="leader-banner" style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", background: "var(--c-panel2)", border: `1px solid ${C.border}`, borderRadius: 10 }}><RoleBox role="leader" size={26} /><div style={{ flex: 1, fontSize: 12.5 }}><b>The Leader changed the design</b> while you were editing.<div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>{diffLines(base, theirs).slice(0, 6).join(" · ")}</div></div><button data-testid="take-theirs" style={primary} onClick={() => { setBase(theirs); setDraft(theirs); setPast([]); setTheirs(null); }}>Take theirs</button><button data-testid="keep-mine" style={btn} onClick={() => { setBase(theirs); setTheirs(null); }}>Keep mine</button></div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
        <div style={{ flex: "1 1 230px", maxWidth: 360 }}>{catalog ? <Palette catalog={catalog} onAdd={(i) => addNode(i)} /> : <div style={{ ...card, padding: 14, color: C.muted, fontSize: 12.5 }}>loading the nodes…</div>}
          <BranchPanel team={team} graph={draft} selected={sel} onGraph={(g) => { setBase(g); setDraft(g); }} /></div>
        <div style={{ ...card, flex: "3 1 520px", minWidth: 0 }}>
          <div style={hd}><b>{mode === "flow" ? "Flow" : "Board"}</b><span role="group" aria-label="editor view" style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>{(["flow", "board"] as const).map((m) => <button key={m} data-testid={`edit-mode-${m}`} aria-pressed={mode === m} onClick={() => setMode(m)} style={{ background: mode === m ? "var(--c-panel2)" : "transparent", color: mode === m ? C.fg : C.muted, border: 0, padding: "2px 10px", fontFamily: nav, fontSize: 11.5, cursor: "pointer" }}>{m === "flow" ? "Flow" : "Board"}</button>)}</span><span style={{ color: C.muted, fontSize: 11.5 }}>{mode === "flow" ? "the steps in order · + adds one on that line · select to inspect" : "drag chips · draw a wire from a pin · select to inspect · Delete removes"}</span><span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11.5, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 9px", color: C.muted }}>{Object.keys(draft.nodes).length} nodes · {draft.edges.length} wires</span></div>
          {mode === "flow" && catalog ? <FlowEditor graph={draft} items={catalog.nodes.map((c) => ({ id: c.id, label: c.label, family: c.family, default: c.default, ports: c.ports }))} selected={sel} issues={errs.map((x) => x.message)} onSelect={setSel} onChange={change} /> : <Board graph={draft} editable selected={sel} selectedWire={selWire} onSelect={setSel} onSelectWire={setSelWire} ports={ports} onMove={(id, pos) => patchNode(id, { pos })} onWire={(f, p, t) => change(withWire(draft, f, p, t))} onDropNode={(itemId, pos) => { const it = catalog?.nodes.find((c) => c.id === itemId); if (it) addNode(it, pos); }} />}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><b style={{ fontSize: 12.5 }}>Simulate</b><span style={{ fontFamily: mono, fontSize: 10.5, border: "1px solid #28504c", color: "#6ee7d8", borderRadius: 999, padding: "1px 8px" }}>stub outputs · no model · $0.00</span>
              <input data-testid="sim-stubs" value={stubs} onChange={(e) => setStubs(e.target.value)} placeholder='stubs: {"tests": [{"exit": 1}, {"exit": 0}]}' style={{ ...field, flex: 1 }} /><button data-testid="sim-run" style={primary} onClick={() => void simulate()} disabled={errs.length > 0} title={errs.length ? "fix the errors first" : ""}>▶ Simulate</button></div>
            {sim && <div data-testid="sim-result" style={{ marginTop: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>{sim.path.map((p, i) => <React.Fragment key={i}>{i > 0 && <span style={{ color: C.muted }}>›</span>}<span style={{ fontFamily: mono, fontSize: 11, border: "1px solid #1f5a41", color: "var(--c-ok)", borderRadius: 5, padding: "0 6px" }}>{p}</span></React.Fragment>)}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 8, fontFamily: mono, fontSize: 12, flexWrap: "wrap" }}><span data-testid="sim-outcome" style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 10px" }}>{sim.outcome}</span>{Object.entries(sim.passes).map(([k, v]) => <span key={k} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 10px" }}>{k}: {v} pass{v === 1 ? "" : "es"}</span>)}<span style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 10px", color: "#ffb547" }}>worst case {money(sim.worst_usd)}</span></div></div>}
          </div>
        </div>
        <div style={{ flex: "1 1 280px", maxWidth: 380 }}>{sel && draft.nodes[sel] && catalog && sel !== "leader" && <div style={{ ...card, padding: "8px 14px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, fontFamily: nav }}><span style={{ color: C.muted }}>Turn it into</span>
            <select data-testid="turn-into" aria-label="turn this node into another kind" value="" onChange={(e) => { const it = catalog.nodes.find((c) => c.id === e.target.value); if (it) { const cur = draft.nodes[sel] as any; setKind(sel, { ...(it.default as any), ...(cur.pos ? { pos: cur.pos } : {}), ...(cur.label ? { label: cur.label } : {}) }); } }} style={{ ...field, flex: 1 }}>
              <option value="">choose a kind…</option>{catalog.nodes.filter((c) => c.id !== "leader").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>}
          {sel && draft.nodes[sel] ? <Inspector id={sel} node={draft.nodes[sel]} graph={draft} onPatch={(p) => patchNode(sel, p)} onKind={(k) => setKind(sel, k)} onDelete={() => remove(sel)} onUnwire={unwire} /> : <div style={{ ...card, padding: 14, color: C.muted, fontSize: 12.5, height: "100%" }}>Select a node to inspect it: its model and tier, what it owns, its cap, and for a tool its allow-list and typed outputs.</div>}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <div data-testid="validation" style={card}><div style={hd}><b>Validation</b><span style={{ fontFamily: mono, fontSize: 10.5, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 8px", color: C.muted }}>pure · before any run</span></div>
          <div style={{ padding: "6px 0" }}>{errs.map((i, k) => <div key={`e${k}`} data-testid="issue-error" style={{ padding: "4px 14px", display: "flex", gap: 8, fontSize: 12.5 }}><span style={{ color: "var(--c-bad)" }}>✕</span><span>{i.message}</span></div>)}{warns.map((i, k) => <div key={`w${k}`} data-testid="issue-warning" style={{ padding: "4px 14px", display: "flex", gap: 8, fontSize: 12.5 }}><span style={{ color: "#ffb547" }}>▲</span><span>{i.message}</span></div>)}{report && !errs.length && !warns.length && <div style={{ padding: "4px 14px", fontSize: 12.5 }}><span style={{ color: "var(--c-ok)" }}>✓</span> nothing to fix</div>}{report && !errs.length && <div data-testid="issue-ok" style={{ padding: "4px 14px", fontSize: 12.5 }}><span style={{ color: "var(--c-ok)" }}>✓</span> every cycle passes through a bounded loop · every operand is written upstream</div>}</div>
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "center", fontSize: 12.5 }}>Worst case<b data-testid="worst" style={{ fontFamily: mono, color: "#ffb547" }}>{money(report?.worst_usd)}</b><span style={{ color: C.muted }}>of the {money(draft.budget_usd)} ceiling the person set</span></div></div>
        <div style={card}><div style={hd}><b>The file</b><span style={{ fontFamily: mono, fontSize: 11 }}>.antiloki/teams/{team}.json</span><span style={{ marginLeft: "auto", color: C.muted, fontSize: 11 }}>the Leader writes the same file</span></div><pre data-testid="edit-json" style={{ margin: 0, padding: 12, fontFamily: mono, fontSize: 11, maxHeight: 220, overflow: "auto", background: "var(--c-bg)" }}>{JSON.stringify(draft, null, 2)}</pre></div>
      </div>
      {msg && <div data-testid="edit-msg" style={{ fontSize: 12.5, color: msg.bad ? "var(--c-bad)" : "var(--c-ok)" }}>{msg.text}</div>}
    </div>
  );
}

/** Store a Telegram bot token under a name, once. The serve keeps it on this machine; it is never shown again and never written into the team. */
function TgToken({ name }: { name: string }) {
  const [tok, setTok] = React.useState(""); const [msg, setMsg] = React.useState("");
  return <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
    <input data-testid="ins-tg-token-value" type="password" autoComplete="off" placeholder="bot token (stored under that name)" value={tok} onChange={(e) => setTok(e.target.value)} style={{ background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px", fontFamily: mono, fontSize: 12, width: 230 }} />
    <button data-testid="ins-tg-token-save" disabled={!name.trim() || !tok.trim()} onClick={async () => { const r = await appSignIn(name.trim(), tok.trim()); setTok(""); setMsg(r.ok ? "stored" : r.error ?? "not stored"); }} style={{ fontFamily: nav, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "2px 10px", cursor: "pointer" }}>Store</button>
    {msg && <span data-testid="ins-tg-token-msg" style={{ fontSize: 11.5, color: C.muted }}>{msg}</span>}
  </div>;
}
