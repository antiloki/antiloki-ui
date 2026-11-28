// LawBuilder — the CUSTOM-LAW WIZARD (operator 2026-07-17: "a window wizard for
// law building… type of text, regex, number of lines, block of code, camel/
// pascal cases, if/loop rules, indentation… how the user builds his own logic
// assertion — or a text field and ask the AI to build it"). A detector composer:
// pick a check KIND, fill it in, watch it match on a sample, then create it. Or
// describe it in English and the AI builds the detector. Everything it emits is
// a real, scanning detector (regex/absent/path/import/metric) via op:add — the
// AI path can also emit ast. No new law shape; it rides the existing constitution.
import * as React from "react";
import { apiPost } from "@/loki/api/client";
import { C } from "@/loki/theme";
import { useShell } from "@/loki/shell/slug-context";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const SCOPES = ["project", "architecture", "community", "language", "framework", "business"] as const;
const SEVERITIES = ["info", "warn", "error", "critical"] as const;
const LANGS = [{ id: "ts", label: "TS" }, { id: "js", label: "JS" }, { id: "py", label: "Python" }] as const;
const METRICS = [{ id: "loc", label: "lines of code" }, { id: "complexity", label: "cyclomatic complexity" }, { id: "fan_in", label: "fan-in (importers)" }, { id: "fan_out", label: "fan-out (imports)" }] as const;
const REGEXY = new Set(["regex", "absent", "path", "import"]);

// naming presets — solid, language-scoped regexes; a MATCH is a naming violation.
const NAMING = [
  { id: "fn-camel", label: "Functions must be camelCase (flags Function/Under_score)", pattern: "function\\s+[A-Z_]\\w*\\s*\\(", langs: ["js", "ts"] },
  { id: "class-pascal", label: "Classes must be PascalCase (flags lowercase start)", pattern: "class\\s+[a-z]\\w*", langs: ["js", "ts", "py"] },
  { id: "no-snake-js", label: "No snake_case identifiers (JS/TS)", pattern: "\\b[a-z][a-z0-9]*_[a-z0-9_]+\\s*[=:(]", langs: ["js", "ts"] },
  { id: "const-scream", label: "Exported consts SCREAMING_SNAKE (flags lowercase)", pattern: "export\\s+const\\s+[a-z]\\w*\\s*=", langs: ["js", "ts"] },
];
// structure presets — reliable regexes; the AI path handles anything exotic (it can emit tree-sitter ast).
const STRUCTURE = [
  { id: "no-for", label: "No for-loops (prefer map/filter/reduce)", pattern: "\\bfor\\s*[(\\w]" },
  { id: "no-while", label: "No while-loops", pattern: "\\bwhile\\s*\\(" },
  { id: "no-empty-catch", label: "No empty catch blocks", pattern: "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}" },
  { id: "no-nested-ternary", label: "No nested ternaries", pattern: "\\?[^?:]*\\?[^?:]*:" },
  { id: "no-console", label: "No console.* calls", pattern: "console\\.\\w+\\s*\\(" },
  { id: "no-var", label: "No var (use let/const)", pattern: "\\bvar\\s+\\w" },
  { id: "no-debugger", label: "No debugger statements", pattern: "\\bdebugger\\b" },
];
const KINDS = [
  { id: "contains", label: "Forbidden text", hint: "flag a literal word or snippet" },
  { id: "regex", label: "Regex pattern", hint: "full control — a match is a violation" },
  { id: "required", label: "Required text", hint: "every file MUST contain it" },
  { id: "naming", label: "Naming convention", hint: "camelCase · PascalCase · snake" },
  { id: "metric", label: "Size / complexity limit", hint: "lines · complexity · coupling" },
  { id: "indent", label: "Indentation", hint: "tabs vs spaces" },
  { id: "structure", label: "Code structure", hint: "no for-loops · empty catch · console…" },
  { id: "path", label: "File path convention", hint: "where files may live" },
  { id: "import", label: "Import restriction", hint: "forbidden dependencies" },
] as const;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "custom-law";
async function dispatch(action: string, input: any, timeoutMs = 30000): Promise<any> {
  const r: any = await apiPost(`/api/v1/dispatch`, { action_name: action, input }, { timeoutMs });
  return r?.result?.result ?? r?.result ?? r;
}

type Built = { detector: string; config: any } | null;
const inp: React.CSSProperties = { background: C.bg, border: `1px solid ${C.border}`, color: C.fg, fontFamily: mono, fontSize: 11, padding: "5px 8px", borderRadius: 5, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.dim, marginBottom: 3, display: "block" };
const chip = (on: boolean, col: string = C.brand): React.CSSProperties => ({ background: on ? C.panel2 : "transparent", border: `1px solid ${on ? col : C.border}`, color: on ? col : C.dim, borderRadius: 5, padding: "3px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 });

// initial = a FORK: clone of an existing law to edit as a copy (the system law stays intact).
// Composable detectors open in their builder kind; the rest (ast/graph/layer/import…) pass
// through as an already-built detector the user can retitle/reweight and create.
const FORK_KIND: Record<string, string> = { regex: "regex", absent: "required", path: "path", metric: "metric" };

export function LawBuilder({ onClose, onCreated, initial }: { onClose: () => void; onCreated?: () => void; initial?: any }) {
  const { setAiCallId } = useShell();
  const init = initial ?? null;
  const composable = !!init && !!FORK_KIND[String(init.detector)];
  const [mode, setMode] = React.useState<"build" | "ai">(init && !composable ? "ai" : "build");
  const [kind, setKind] = React.useState<string>(composable ? FORK_KIND[init.detector] : "contains");
  // per-kind params (one bag)
  const [text, setText] = React.useState("");
  const [pattern, setPattern] = React.useState(init && (init.detector === "regex" || init.detector === "absent") ? String(init.config?.pattern ?? "") : "");
  const [flags, setFlags] = React.useState(init?.detector === "regex" ? String(init.config?.flags ?? "g") : "g");
  const [namingId, setNamingId] = React.useState(NAMING[0].id);
  const [metric, setMetric] = React.useState(init?.detector === "metric" ? String(init.config?.metric ?? "loc") : "loc");
  const [max, setMax] = React.useState(init?.detector === "metric" ? String(init.config?.max ?? 400) : "400");
  const [indent, setIndent] = React.useState<"tabs" | "spaces">("tabs");
  const [structureId, setStructureId] = React.useState(STRUCTURE[0].id);
  const [pathPattern, setPathPattern] = React.useState(init?.detector === "path" ? String(init.config?.pattern ?? "") : "");
  const [importFrom, setImportFrom] = React.useState("");
  // common fields
  const [title, setTitle] = React.useState(init ? `${init.title} (fork)` : "");
  const [statement, setStatement] = React.useState(init ? String(init.rule_md ?? "") : "");
  const [scope, setScope] = React.useState<string>(init?.scope && (SCOPES as readonly string[]).includes(init.scope) ? init.scope : "project");
  const [weight, setWeight] = React.useState(init ? Math.max(1, Math.min(10, Number(init.weight) || 4)) : 4);
  const [severity, setSeverity] = React.useState<string>(init?.severity && (SEVERITIES as readonly string[]).includes(init.severity) ? init.severity : "warn");
  const [langs, setLangs] = React.useState<string[]>(Array.isArray(init?.languages) ? init.languages.filter((x: string) => ["ts", "js", "py"].includes(x)) : []);
  // AI + tester + status
  const [aiText, setAiText] = React.useState("");
  const [aiBuilt, setAiBuilt] = React.useState<Built>(init && !composable ? { detector: String(init.detector), config: init.config ?? {} } : null);
  const [sample, setSample] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const built: Built = React.useMemo(() => {
    switch (kind) {
      case "contains": return text.trim() ? { detector: "regex", config: { pattern: esc(text.trim()) } } : null;
      case "regex": return pattern.trim() ? { detector: "regex", config: { pattern, ...(flags && flags !== "g" ? { flags } : {}) } } : null;
      case "required": return pattern.trim() ? { detector: "absent", config: { pattern } } : null;
      case "naming": { const n = NAMING.find((x) => x.id === namingId); return n ? { detector: "regex", config: { pattern: n.pattern } } : null; }
      case "metric": return Number(max) > 0 ? { detector: "metric", config: { metric, max: Number(max) } } : null;
      case "indent": return { detector: "regex", config: { pattern: indent === "tabs" ? "^\\t" : "^ +\\S", flags: "gm" } };
      case "structure": { const s = STRUCTURE.find((x) => x.id === structureId); return s ? { detector: "regex", config: { pattern: s.pattern } } : null; }
      case "path": return pathPattern.trim() ? { detector: "path", config: { pattern: pathPattern } } : null;
      case "import": return importFrom.trim() ? { detector: "import", config: { pattern: esc(importFrom.trim()) } } : null;
      default: return null;
    }
  }, [kind, text, pattern, flags, namingId, metric, max, indent, structureId, pathPattern, importFrom]);

  const active: Built = mode === "ai" ? aiBuilt : built;

  // live tester — for regex-family detectors, run it right here on the sample.
  const testInfo = React.useMemo(() => {
    if (!active) return null;
    const d = active.detector, pat = active.config?.pattern;
    if (d === "metric") return { note: `scans on rebuild — flags files where ${active.config.metric} > ${active.config.max}` };
    if (d === "ast") return { note: "structural (tree-sitter) — scans on the next rebuild" };
    if (!REGEXY.has(d)) return { note: `${d} — scans on the next rebuild` }; // graph/layer/linter/none forks: nothing to test locally
    if (!sample) return { note: d === "absent" ? "required pattern — a file WITHOUT it is flagged" : d === "path" ? "tested against a file path — paste one below" : "paste a code sample below to test the match" };
    try {
      const re = new RegExp(pat, active.config?.flags ?? (d === "absent" ? "m" : "g"));
      if (d === "absent") return re.test(sample) ? { ok: true, note: "present → clean" } : { hit: true, note: "MISSING → this file would be flagged" };
      const found: string[] = []; let m: RegExpExecArray | null; const g = new RegExp(pat, (active.config?.flags ?? "g").includes("g") ? (active.config?.flags ?? "g") : `${active.config?.flags ?? ""}g`);
      let guard = 0;
      while ((m = g.exec(d === "import" ? sample : sample)) && found.length < 8 && guard++ < 5000) { if (m.index === g.lastIndex) g.lastIndex++; found.push(m[0].slice(0, 40)); }
      return found.length ? { hit: true, note: `${found.length} match${found.length === 1 ? "" : "es"}: `, matches: found } : { ok: true, note: "no match → clean" };
    } catch (e: any) { return { err: true, note: `invalid regex: ${String(e?.message ?? e).slice(0, 60)}` }; }
  }, [active, sample]);

  const buildWithAI = async () => {
    if (!aiText.trim() || busy) return;
    setBusy(true); setNote(null);
    try {
      const r = await dispatch("system.constitution.law.build", { description: aiText.trim() }, 600000);
      if (r?.ai_call_id != null) setAiCallId(r.ai_call_id);
      if (r?.ok && r.law) {
        setAiBuilt({ detector: r.law.detector, config: r.law.config });
        if (!title.trim()) setTitle(r.law.title); if (!statement.trim()) setStatement(r.law.rule_md);
        setWeight(r.law.weight); setSeverity(r.law.severity); setLangs(r.law.languages ?? []);
        setNote(`◆ built a ${r.law.detector} law · $${Number(r.cost_usd ?? 0).toFixed(4)}`);
      } else setNote(`◆ ${r?.error ?? "could not build it"} — open the AI call to see why`);
    } catch (e: any) { setNote(String(e?.message ?? "failed").slice(0, 160)); }
    setBusy(false);
  };

  const create = async () => {
    if (!active || !title.trim() || busy) { setNote("give it a title and a valid check"); return; }
    setBusy(true); setNote(null);
    try {
      await dispatch("system.constitution.law", {
        op: "add", key: slug(title), scope, title: title.trim(), rule_md: statement.trim(),
        detector: active.detector, config: active.config, weight, severity,
        confidence: REGEXY.has(active.detector) ? 0.75 : 1.0,
        applies: langs.length ? { languages: langs } : {},
      });
      onCreated?.(); onClose();
    } catch (e: any) { setNote(String(e?.message ?? "failed").slice(0, 160)); setBusy(false); }
  };

  const toggleLang = (id: string) => setLangs((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(820px, 97vw)", maxHeight: "92vh", overflow: "auto", background: C.panel, border: `1px solid color-mix(in oklab, ${C.brand} 22%, ${C.border})`, borderRadius: 15, boxShadow: "0 24px 70px -12px rgba(0,0,0,.7)" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 700, color: C.fg }}>Build a custom law</span>
          <button onClick={() => setMode("build")} style={chip(mode === "build")}>⚙ build it</button>
          <button onClick={() => setMode("ai")} style={chip(mode === "ai")}>◆ describe it (AI)</button>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ ...chip(false), color: C.muted }}>✕ esc</button>
        </div>

        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "build" ? (
            <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 14 }}>
              {/* kind menu */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={lbl}>what to check</span>
                {KINDS.map((k) => (
                  <button key={k.id} onClick={() => setKind(k.id)} title={k.hint}
                    style={{ textAlign: "left", background: kind === k.id ? C.panel2 : "transparent", border: `1px solid ${kind === k.id ? C.brand : "transparent"}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer" }}>
                    <div style={{ fontFamily: mono, fontSize: 10.5, color: kind === k.id ? C.brand : C.fg }}>{k.label}</div>
                    <div style={{ fontFamily: mono, fontSize: 8, color: C.muted }}>{k.hint}</div>
                  </button>
                ))}
              </div>
              {/* per-kind form */}
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {kind === "contains" && (<div><span style={lbl}>forbidden text (literal) — a file containing it is flagged</span><input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. TODO(hack)" spellCheck={false} style={inp} /></div>)}
                {kind === "regex" && (<div style={{ display: "flex", gap: 8 }}><div style={{ flex: 1 }}><span style={lbl}>regex — a match is a violation</span><input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. \\.only\\s*\\(" spellCheck={false} style={{ ...inp, fontFamily: mono }} /></div><div style={{ width: 70 }}><span style={lbl}>flags</span><input value={flags} onChange={(e) => setFlags(e.target.value)} placeholder="g" spellCheck={false} style={inp} /></div></div>)}
                {kind === "required" && (<div><span style={lbl}>required pattern — a file MISSING it is flagged</span><input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. @license|Copyright" spellCheck={false} style={{ ...inp, fontFamily: mono }} /></div>)}
                {kind === "naming" && (<div><span style={lbl}>naming rule</span><select value={namingId} onChange={(e) => setNamingId(e.target.value)} style={{ ...inp, cursor: "pointer" }}>{NAMING.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select><div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, marginTop: 4 }}>regex-based (approximate) — scope it to the language below.</div></div>)}
                {kind === "metric" && (<div style={{ display: "flex", gap: 8 }}><div style={{ flex: 1 }}><span style={lbl}>metric</span><select value={metric} onChange={(e) => setMetric(e.target.value)} style={{ ...inp, cursor: "pointer" }}>{METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div><div style={{ width: 110 }}><span style={lbl}>max allowed</span><input type="number" value={max} onChange={(e) => setMax(e.target.value)} style={inp} /></div></div>)}
                {kind === "indent" && (<div><span style={lbl}>indentation must be</span><div style={{ display: "flex", gap: 6 }}><button onClick={() => setIndent("spaces")} style={chip(indent === "spaces")}>spaces (flag tabs)</button><button onClick={() => setIndent("tabs")} style={chip(indent === "tabs")}>tabs (flag spaces)</button></div></div>)}
                {kind === "structure" && (<div><span style={lbl}>code-structure rule</span><select value={structureId} onChange={(e) => setStructureId(e.target.value)} style={{ ...inp, cursor: "pointer" }}>{STRUCTURE.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select><div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, marginTop: 4 }}>need something deeper (an AST rule)? use ◆ describe it — the AI can emit a tree-sitter query.</div></div>)}
                {kind === "path" && (<div><span style={lbl}>path regex — a file whose PATH matches is flagged</span><input value={pathPattern} onChange={(e) => setPathPattern(e.target.value)} placeholder="e.g. src/.*\\.js$  (js under src)" spellCheck={false} style={{ ...inp, fontFamily: mono }} /></div>)}
                {kind === "import" && (<div><span style={lbl}>forbidden import source (literal)</span><input value={importFrom} onChange={(e) => setImportFrom(e.target.value)} placeholder="e.g. lodash  or  ../internal/" spellCheck={false} style={inp} /></div>)}

                {/* what it compiles to */}
                {active && (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, padding: "6px 9px" }}>
                    <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 }}>compiles to · {active.detector}</span>
                    <code style={{ display: "block", fontFamily: mono, fontSize: 9.5, color: C.brand, wordBreak: "break-all", marginTop: 2 }}>{JSON.stringify(active.config)}</code>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* AI mode */
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={lbl}>describe the rule in plain English — the AI builds a scanning detector</span>
              <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} rows={3} spellCheck={false}
                placeholder={"e.g. \"React components must be PascalCase\" · \"no direct process.env access outside config/\" · \"every API route must call requireAuth\""}
                style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => void buildWithAI()} disabled={busy || !aiText.trim()} style={{ ...chip(true), opacity: busy || !aiText.trim() ? 0.5 : 1 }}>{busy ? "◆ building…" : "◆ build with AI"}</button>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>opens the AI-call window · then review + tweak below before creating</span>
              </div>
              {aiBuilt && (
                <div style={{ border: `1px solid color-mix(in oklab, ${C.brand} 45%, ${C.border})`, borderRadius: 6, background: C.bg, padding: "7px 10px" }}>
                  <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 0.8 }}>built detector · {aiBuilt.detector}</span>
                  <code style={{ display: "block", fontFamily: mono, fontSize: 9.5, color: C.brand, wordBreak: "break-all", marginTop: 2 }}>{JSON.stringify(aiBuilt.config)}</code>
                </div>
              )}
            </div>
          )}

          {/* the live tester (regex-family) */}
          {active && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: C.panel2 }}>
              <span style={lbl}>test it {REGEXY.has(active.detector) && active.detector !== "metric" ? "— paste a sample, watch it match" : ""}</span>
              {(active.detector === "regex" || active.detector === "required" || active.detector === "import" || active.detector === "contains" || active.detector === "naming" || active.detector === "structure" || active.detector === "indent" || active.detector === "absent" || active.detector === "path") && (
                <textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={3} spellCheck={false}
                  placeholder={active.detector === "path" ? "paste a file path — e.g. src/utils/helpers.js" : "paste a code sample here…"}
                  style={{ ...inp, fontFamily: mono, fontSize: 10, resize: "vertical" }} />
              )}
              {testInfo && (
                <div style={{ marginTop: 5, fontFamily: mono, fontSize: 9.5, color: testInfo.err ? C.bad : testInfo.hit ? C.warn : testInfo.ok ? C.ok : C.muted, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{testInfo.hit ? "⚠" : testInfo.ok ? "✓" : testInfo.err ? "✕" : "•"}</span><span>{testInfo.note}</span>
                  {testInfo.matches?.map((m: string, i: number) => <code key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 4px", color: C.warn }}>{m}</code>)}
                </div>
              )}
            </div>
          )}

          {/* common fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><span style={lbl}>title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="short name — e.g. No focused tests" style={inp} /></div>
            <div><span style={lbl}>scope</span><select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...inp, cursor: "pointer" }}>{SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div><span style={lbl}>the statement — the rule + why (shown as the law's text)</span><input value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="e.g. A committed .only silently disables the rest of the suite." style={inp} /></div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div><span style={lbl}>weight {weight}</span><input type="range" min={1} max={10} value={weight} onChange={(e) => setWeight(Number(e.target.value))} style={{ width: 130 }} /></div>
            <div><span style={lbl}>severity</span><div style={{ display: "flex", gap: 4 }}>{SEVERITIES.map((s) => <button key={s} onClick={() => setSeverity(s)} style={chip(severity === s, s === "critical" || s === "error" ? C.bad : s === "warn" ? C.warn : C.dim)}>{s}</button>)}</div></div>
            <div><span style={lbl}>languages (blank = all)</span><div style={{ display: "flex", gap: 4 }}>{LANGS.map((l) => <button key={l.id} onClick={() => toggleLang(l.id)} style={chip(langs.includes(l.id))}>{l.label}</button>)}</div></div>
          </div>

          {note && <div style={{ fontFamily: mono, fontSize: 9.5, color: note.startsWith("◆") ? C.brand : C.bad }}>{note}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, flex: 1 }}>{active ? `creates a ratified ${active.detector} law — it scans on the next rebuild` : "pick a check and give it a title"}</span>
            <button onClick={onClose} style={chip(false)}>cancel</button>
            <button onClick={() => void create()} disabled={!active || !title.trim() || busy} style={{ ...chip(true, C.ok), opacity: !active || !title.trim() || busy ? 0.5 : 1, padding: "3px 14px" }}>✓ create law</button>
          </div>
        </div>
      </div>
    </div>
  );
}
