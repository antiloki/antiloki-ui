// EPIC-CODEBASE-ATLAS: the brownfield code map, rendered. Reads the atlas graph
// (POST /api/v1/codebase/get) and lays it out by FILE — each type='file' node is
// a group whose child defs (functions/classes/components/hooks) list under it
// with their signatures, alongside that file's outgoing `imports` (→ target
// files) and its `calls`-edge count. The killer feature is the blast-radius box:
// pick a node (click a def, or type an id) → POST /api/v1/codebase/blast → the
// reverse-dependency closure ("changing X breaks: …") plus the affected tests.
// A rebuild button re-indexes the active workspace's OWN codebase (POST .../onboard/start).
//
// MVC-clean, scannable; theme/style mirror swarm-blueprint.tsx + the waterfall
// modules (C / mono, panel cards, uppercase section labels). The optional inline
// node-link of files+imports is a small SVG bonus, not a physics graph.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { fmtTokens } from "@/loki/util/tokens";
import {
  getAtlas,
  blastRadius,
  scopeGet,
  scopeSet,
  refreshCodebase,
  entryPointsGet,
  type EntryPointsResult,
  runReport,
  latestReport,
  insightsReview,
  regenerateBlock,
  regenerateStage,
  regenerateMerge,
  depsAudit,
  parseHealth,
  type ParseHealth,
  lintRun,
  typecheckRun,
  type TypecheckFinding,
  type CodeNode,
  type CodeEdge,
  type AtlasResponse,
  type BlastResponse,
  type ProjectReport,
  type Smell,
  type Vuln,
  type DepsAudit,
  onboardStart,
} from "@/loki/api/codebase";
import { Markdown } from "@/loki/components/Markdown";
import { AtlasGraphOverlay, AtlasGraphMini, extColor, extOf } from "./atlas-graph";
import { FilesIDE } from "./atlas-files-ide";
import { DigestView } from "./atlas-digest";
import { sectionLabel, chip, inputStyle, btn } from "./atlas-style";
import { RebuildPanel } from "./rebuild-panel";

// A def's type drives a hue so a file's contents read at a glance.
const TYPE_HUE: Record<string, string> = {
  file: C.fg, function: C.ok, method: C.ok, class: C.bad,
  component: C.brand, hook: "oklch(0.78 0.13 200)", const: C.warn, type: "oklch(0.74 0.16 300)",
};
const typeColor = (t: string | null | undefined) => (t && TYPE_HUE[t]) || C.dim;

// One file's projection: its file node, its child defs, and the edges leaving it.
type FileGroup = {
  path: string;
  fileNode: CodeNode | null;
  defs: CodeNode[];
  imports: string[];      // target file paths via outgoing `imports` edges
  callsOut: number;       // count of outgoing `calls` edges from this file's nodes
};

// Pure: fold the flat {nodes, edges} graph into per-file groups. Exported so the
// grouping can be unit-tested without rendering. Nodes whose path has no file
// node still surface as a group keyed by their path (resilient to partial atlases).
export function groupByFile(nodes: CodeNode[], edges: CodeEdge[]): FileGroup[] {
  const groups = new Map<string, FileGroup>();
  const ensure = (path: string): FileGroup => {
    let g = groups.get(path);
    if (!g) { g = { path, fileNode: null, defs: [], imports: [], callsOut: 0 }; groups.set(path, g); }
    return g;
  };
  // node id → its file path, so an edge endpoint can be attributed to a file.
  const fileOf = new Map<string, string>();
  for (const n of nodes) {
    const g = ensure(n.path);
    if (n.type === "file") g.fileNode = n;
    else g.defs.push(n);
    fileOf.set(n.id, n.path);
  }
  for (const e of edges) {
    const fromPath = fileOf.get(e.from_node);
    if (!fromPath) continue;
    const g = groups.get(fromPath);
    if (!g) continue;
    if (e.type === "imports") {
      const targetPath = fileOf.get(e.to_node) ?? e.to_node;
      if (!g.imports.includes(targetPath)) g.imports.push(targetPath);
    } else if (e.type === "calls") {
      g.callsOut += 1;
    }
  }
  const out = [...groups.values()];
  out.sort((a, b) => a.path.localeCompare(b.path));
  for (const g of out) {
    g.defs.sort((a, b) => (a.type + (a.name ?? "")).localeCompare(b.type + (b.name ?? "")));
    g.imports.sort();
  }
  return out;
}

function baseName(p: string): string {
  const parts = String(p).split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || String(p);
}

// ── header: origin + counts + rebuild affordance ─────────────────────────────
function Header({
  atlas, loading, onRefresh,
}: { atlas: AtlasResponse | null; loading: boolean; onRefresh: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px",
    }}>
      <span style={{ fontWeight: 600, color: C.brand, fontFamily: mono, fontSize: 12 }}>⛁ Atlas</span>
      <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>
        origin <span style={{ color: C.fg }}>{atlas?.origin ?? "atlas"}</span>
      </span>
      {atlas && (
        <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>
          {atlas.node_count} nodes · {atlas.edge_count} edges
        </span>
      )}
      {atlas && atlas.total_tokens != null && (
        <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}
          title={`whole codebase ≈ ${atlas.total_tokens.toLocaleString()} tokens (estimate ~bytes/4) · ${atlas.file_count ?? 0} files`}>
          ~{fmtTokens(atlas.total_tokens)} tok
        </span>
      )}
      <span style={{ flex: 1, minWidth: 12 }} />
      <button style={btn()} onClick={onRefresh} disabled={loading} title="re-read the atlas graph">
        {loading ? "…" : "↻"}
      </button>
    </div>
  );
}

// ── blast-radius box: pick a node → reverse-dependency closure ────────────────
function BlastBox({ selected, onClear }: { selected: string | null; onClear: () => void }) {
  const [nodeId, setNodeId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<BlastResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // Clicking a def in the list fills the input + runs the query.
  React.useEffect(() => {
    if (selected) { setNodeId(selected); void run(selected); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function run(idArg?: string) {
    const id = (idArg ?? nodeId).trim();
    if (!id) { setErr("enter a node id"); return; }
    setBusy(true); setErr(null);
    const r = await blastRadius({ node_ids: [id] });
    setBusy(false);
    if (!r) { setErr("blast query failed (BE unreachable or not wired)"); setRes(null); return; }
    setRes(r);
  }

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.brand}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={sectionLabel}>blast radius — what breaks if I change this</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
          placeholder="node id (e.g. src/foo.ts or src/foo.ts:bar) — or click a def below"
          spellCheck={false}
          style={{ ...inputStyle, flex: 1, minWidth: 260 }}
        />
        <button style={btn(true)} onClick={() => void run()} disabled={busy}>
          {busy ? "computing…" : "blast"}
        </button>
        {(res || selected) && (
          <button style={btn()} onClick={() => { setRes(null); setNodeId(""); setErr(null); onClear(); }}>clear</button>
        )}
      </div>

      {err && <div style={{ marginTop: 8, fontFamily: mono, fontSize: 11, color: C.bad }}>{err}</div>}

      {res && (
        <div style={{ marginTop: 10, fontFamily: mono, fontSize: 11 }}>
          <div style={{ color: C.dim, marginBottom: 6 }}>
            changing <span style={{ color: C.fg }}>{res.seeds.join(", ")}</span> breaks{" "}
            <span style={{ color: res.count > 0 ? C.warn : C.ok }}>{res.count}</span> node{res.count === 1 ? "" : "s"}
            {res.affected_tests.length > 0 && <> · <span style={{ color: C.bad }}>{res.affected_tests.length}</span> test{res.affected_tests.length === 1 ? "" : "s"}</>}
          </div>
          {res.count === 0 ? (
            <div style={{ color: C.ok }}>nothing depends on it — safe to change.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 220, overflow: "auto" }}>
              {res.affected.map((id) => (
                <li key={id} style={{ color: C.fg, padding: "1px 0", borderLeft: `2px solid ${C.warn}`, paddingLeft: 8 }}>{id}</li>
              ))}
            </ul>
          )}
          {res.affected_tests.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={sectionLabel}>affected tests</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {res.affected_tests.map((p) => (
                  <li key={p} style={{ color: C.bad, padding: "1px 0", borderLeft: `2px solid ${C.bad}`, paddingLeft: 8 }}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── one file group: child defs (+ signatures), imports, calls count ───────────
function FileCard({ g, onPick }: { g: FileGroup; onPick: (id: string) => void }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <code
          onClick={() => g.fileNode && onPick(g.fileNode.id)}
          title={g.fileNode ? `blast ${g.fileNode.id}` : g.path}
          style={{ fontFamily: mono, fontSize: 12, color: C.brand, cursor: g.fileNode ? "pointer" : "default", fontWeight: 600 }}
        >{g.path}</code>
        <span style={chip}>{g.defs.length} def{g.defs.length === 1 ? "" : "s"}</span>
        {g.callsOut > 0 && <span style={{ ...chip, color: C.dim }}>{g.callsOut} call{g.callsOut === 1 ? "" : "s"}</span>}
      </div>

      {g.fileNode?.intent && (
        <div style={{ color: C.dim, fontSize: 11, marginBottom: 6 }}>{g.fileNode.intent}</div>
      )}

      {g.defs.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 6px", padding: 0 }}>
          {g.defs.map((d) => (
            <li
              key={d.id}
              onClick={() => onPick(d.id)}
              title={`blast ${d.id}`}
              style={{
                display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
                padding: "2px 0 2px 8px", borderLeft: `2px solid ${C.border}`, cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: mono, fontSize: 9, color: typeColor(d.type), textTransform: "uppercase", letterSpacing: 0.4, minWidth: 64 }}>{d.type}</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.fg }}>{d.name ?? baseName(d.id)}</span>
              {d.signature && <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted }}>{d.signature}</span>}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>
          imports {g.imports.length === 0 && "—"}
        </span>
        {g.imports.map((p) => (
          <code key={p} title={p} style={{ ...chip, color: C.warn }}>{baseName(p)}</code>
        ))}
      </div>
    </div>
  );
}

function ScopePanel() {
  const [exts, setExts] = React.useState<string[]>([]);
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [exclude, setExclude] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const s = await scopeGet();
      if (!alive || !s) return;
      setExts(s.supported_exts);
      // include empty ⇒ everything in scope (all checked); else only the exts named by an include glob.
      const inc = s.include ?? [];
      setChecked(new Set(inc.length === 0 ? s.supported_exts : s.supported_exts.filter((e) => inc.some((g) => g.endsWith(e)))));
      setExclude((s.exclude ?? []).join(", "));
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  function toggle(e: string) {
    setChecked((prev) => { const n = new Set(prev); if (n.has(e)) n.delete(e); else n.add(e); return n; });
  }
  const allOn = exts.length > 0 && checked.size === exts.length;

  async function save() {
    setMsg("saving…");
    const include = allOn ? [] : [...checked].map((e) => `**/*${e}`); // all-on ⇒ no restriction
    const exc = exclude.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    const r = await scopeSet({ include, exclude: exc });
    setMsg(r ? "saved — applies on the next rebuild" : "save failed (BE unreachable or not wired)");
  }

  if (!loaded) return null;

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.brand}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={sectionLabel}>scope — folders &amp; extensions the atlas indexes</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>
          {allOn ? "all extensions" : `${checked.size}/${exts.length} ext`}{exclude.trim() ? " · excludes" : ""}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, minWidth: 66 }}>extensions</span>
        <button style={btn()} onClick={() => setChecked(new Set(exts))}>all</button>
        <button style={btn()} onClick={() => setChecked(new Set())}>none</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {exts.map((e) => {
          const on = checked.has(e);
          return (
            <button key={e} onClick={() => toggle(e)} title={on ? "in scope — click to drop" : "out of scope — click to add"}
              style={{
                fontFamily: mono, fontSize: 10, padding: "2px 7px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${on ? C.brand : C.border}`, background: on ? `${C.brand}22` : "transparent",
                color: on ? C.fg : C.dim,
              }}>{e}</button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, minWidth: 66 }}>exclude</span>
        <input value={exclude} onChange={(e) => setExclude(e.target.value)} spellCheck={false}
          placeholder="folder globs, comma-separated (e.g. **/vendor/**, legacy, **/*.test.*)…"
          style={{ ...inputStyle, flex: 1, minWidth: 240 }} />
        <button style={btn(true)} onClick={() => void save()}>save scope</button>
      </div>
      <div style={{ marginTop: 8, fontFamily: mono, fontSize: 10, color: C.dim }}>
        built-in skips (node_modules, .git, dist, build, …) always apply. {msg && <span style={{ color: C.muted }}>· {msg}</span>}
      </div>
    </div>
  );
}

// ── entry points: the external surface (routes / db / ui), grouped 3-column with drift ──
function EntryPointsPanel({ version, onOpen }: { version: number; onOpen: (path: string, line: number | null) => void }) {
  const [data, setData] = React.useState<EntryPointsResult | null>(null);
  React.useEffect(() => {
    let alive = true;
    void (async () => { const r = await entryPointsGet({}); if (alive) setData(r); })();
    return () => { alive = false; };
  }, [version]);

  if (!data) return null;
  const added = data.latest_snapshot?.diff?.added?.length ?? 0;
  const removed = data.latest_snapshot?.diff?.removed?.length ?? 0;
  const KINDS = [
    { key: "route" as const, label: "ROUTES", hue: C.brand },
    { key: "ui" as const, label: "UI", hue: C.ok },
    { key: "data" as const, label: "DATA", hue: C.warn },
  ];

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={sectionLabel}>⊞ entry points — where users · the network · storage touch the code</span>
        <span style={{ flex: 1 }} />
        {(added > 0 || removed > 0) && (
          <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>
            ⟳ since last rebuild {added > 0 && <span style={{ color: C.ok }}>+{added}</span>} {removed > 0 && <span style={{ color: C.bad }}>−{removed}</span>}
          </span>
        )}
      </div>
      {data.total === 0 ? (
        <div style={{ color: C.dim, fontFamily: mono, fontSize: 10.5 }}>
          none detected yet — <span style={{ color: C.fg }}>↻ rebuild</span> to extract (routes · db · ui).
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {KINDS.map(({ key, label, hue }) => {
            const items = data.by_kind[key] ?? [];
            return (
              <div key={key} style={{ minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 10.5, color: hue, fontWeight: 600, marginBottom: 4 }}>{label} ({items.length})</div>
                <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
                  {items.length === 0 ? <span style={{ color: C.dim, fontSize: 10, fontFamily: mono }}>—</span> : items.map((e, i) => (
                    <button key={i} onClick={() => onOpen(e.path, e.line)} title={`${e.path}:${e.line ?? ""}${e.detail ? " · " + e.detail : ""} (${Math.round(e.confidence * 100)}%)`}
                      style={{ display: "flex", gap: 6, alignItems: "baseline", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "1px 2px", borderRadius: 3, color: C.fg, fontFamily: mono, fontSize: 10 }}>
                      {e.http_method && <span style={{ color: hue, flexShrink: 0, minWidth: 34 }}>{e.http_method}</span>}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{e.label}</span>
                      <span style={{ color: C.dim, flexShrink: 0 }}>{e.path.split("/").pop()}:{e.line}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── insights: the graded x-ray (score + smells + vulns) ──────────────────────
const severityHue = (s: string) => (s === "high" ? C.bad : s === "medium" ? C.warn : C.dim);
// vuln severity buckets (OSV): critical/high = bad, moderate = warn, low/unknown = dim.
const vulnHue = (s: string) => (s === "critical" || s === "high" ? C.bad : s === "moderate" ? C.warn : C.dim);
function countVulns(vulns: Vuln[]): DepsAudit["counts"] {
  const c = { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0, total: 0 };
  for (const v of vulns) { c[v.severity] = (c[v.severity] ?? 0) + 1; c.total += 1; }
  return c;
}

function ScoreBar({ label, value, hue }: { label: string; value: number; hue: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={sectionLabel}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: hue }}>{v}</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>/100</span>
      </div>
      <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 4 }}>
        <div style={{ width: `${v}%`, height: 4, background: hue, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// EPIC-TYPECHECK P2: the rebuild parse-health snapshot — files that SHOULD parse but didn't.
// Self-fetches, self-hides when the repo is clean. Independent of the analysis report.
function ParseHealthBlock() {
  const [ph, setPh] = React.useState<ParseHealth | null>(null);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { void (async () => { try { setPh(await parseHealth({})); } catch { /* not wired */ } })(); }, []);
  if (!ph || (ph.fail === 0 && ph.degraded === 0 && (ph.skipped ?? 0) === 0)) return null;
  const skipped = ph.skipped ?? 0;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={sectionLabel}>parse health</div>
      <div onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer", fontFamily: mono, fontSize: 11, display: "flex", gap: 10, alignItems: "baseline" }}>
        <span style={{ color: C.ok }}>{ph.clean} clean</span>
        {ph.fail > 0 && <span style={{ color: C.bad }}>{ph.fail} failed</span>}
        {ph.degraded > 0 && <span style={{ color: C.warn }}>{ph.degraded} degraded</span>}
        {skipped > 0 && <span style={{ color: C.muted }} title="unsupported syntax (Flow) — tracked but not parsed; not broken">{skipped} skipped</span>}
        <span style={{ color: C.muted }}>{open ? "▾ hide" : "▸ show"}</span>
      </div>
      {open && (
        <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
          {ph.files.map((f) => (
            <li key={f.path} title={f.detail} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0" }}>
              <span style={{ ...chip, color: f.status === "fail" ? C.bad : f.status === "degraded" ? C.warn : C.muted }}>{f.status}</span>
              <code style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{f.path}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// EPIC-TYPECHECK: on-demand typecheck + style-lint of the whole codebase, using the installed tools +
// the project's own config. Findings only show after you press run (the tools are opt-in via Settings).
function CodeChecksBlock() {
  const [res, setRes] = React.useState<{ findings: TypecheckFinding[]; ran: string[] } | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try {
      const [tc, lint] = await Promise.all([typecheckRun({ scope: "all" }), lintRun({ scope: "all" })]);
      const findings = [...(tc?.findings ?? []), ...(lint?.findings ?? [])];
      const ran = [...(tc?.by_checker ? Object.keys(tc.by_checker) : []), ...(lint?.ran ?? [])];
      setRes({ findings, ran });
    } catch { setRes({ findings: [], ran: [] }); } finally { setBusy(false); }
  }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={sectionLabel}>code checks (typecheck · lint)</div>
        <span style={{ flex: 1 }} />
        <button style={btn(true)} onClick={() => void run()} disabled={busy} title="run the installed typecheckers + linters over the whole codebase">
          {busy ? "checking…" : "run"}
        </button>
      </div>
      {res && res.ran.length === 0 && <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, marginTop: 6 }}>no checkers installed — add one in Settings → Code checks.</div>}
      {res && res.ran.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: res.findings.length ? C.bad : C.ok }}>
            {res.findings.length ? `${res.findings.length} issue${res.findings.length === 1 ? "" : "s"}` : "clean"} · ran {res.ran.join(", ")}
          </div>
          <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, maxHeight: 220, overflow: "auto" }}>
            {res.findings.slice(0, 100).map((f, i) => (
              <li key={i} title={f.message} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0" }}>
                <span style={{ ...chip, color: C.bad }}>{f.code}</span>
                <code style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{f.file}:{f.line}</code>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Every smell in PLAIN ENGLISH (operator 2026-07-23: "smells doesn't make sense, should be more
// descriptive"): what the graph proved + the exact move that clears it. `fix` = the kinds where a
// single-file micro-PR is an honest first step (others need a human move: delete / wire / add a test).
const SMELL_EXPLAIN: Record<string, { what: string; move: string; fix?: string }> = {
  "cycle": {
    what: "these files import each other in a circle — no clean build/test order, changes ripple round and round",
    move: "extract the piece they share into its own module so the arrows point one way",
    fix: "Break the circular dependency: re-point or remove the import line(s) in THIS file that close the loop (move any shared piece into a new small module if needed). Change ONLY what that requires; keep behavior.",
  },
  "orphan": {
    what: "no imports in or out — an isolated file, likely dead code or a forgotten experiment",
    move: "open it: delete it if it's dead, or wire it into the app if it should live",
  },
  "unreferenced-file": {
    what: "nothing imports this file, so its exports look unused",
    move: "confirm it isn't a real entry point (script/CLI), then delete it or import it where it belongs",
  },
  "test-gap": {
    what: "many files lean on this one, but no test touches it — a break here spreads silently",
    move: "add a test around its main export before the next change; it pays for itself immediately",
  },
  "god-file": {
    what: "heavily imported AND internally complex — every feature passes through here, so every change risks everything",
    move: "split it by responsibility into smaller modules, one seam at a time",
    fix: "This file is a god-file (high fan-in + high complexity). Extract the largest self-contained block into a well-named function in this same file and tighten the exported surface — the first honest step toward a split. Change ONLY what that requires; keep behavior.",
  },
};

// The riskiest-files WHY line: name the factors that actually drive the score (deterministic).
function riskWhy(f: { factors?: { fan_in: number; complexity: number; churn: number; uncovered: number } }): string {
  const x = f.factors; if (!x) return "";
  const parts: string[] = [];
  if (x.fan_in > 0) parts.push(`${x.fan_in} file${x.fan_in === 1 ? "" : "s"} depend on it`);
  if (x.complexity > 0) parts.push(`cyclomatic ${x.complexity}`);
  if (x.churn > 0) parts.push(`changed ×${x.churn} recently`);
  if (x.uncovered) parts.push("no test covers it");
  return parts.join(" · ");
}

export function InsightsPanel({ onPick }: { onPick: (id: string) => void }) {
  const [report, setReport] = React.useState<ProjectReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  // ⚡ smell → micro-PR (the SAME regenerate pipeline as the file review: AI proposes →
  // isolated worktree stage → gated merge; nothing touches the tree until you merge).
  const [fix, setFix] = React.useState<any | null>(null);
  const [deps, setDeps] = React.useState<DepsAudit | null>(null); // OSV dependency scan (folded into re-run)
  const [scanning, setScanning] = React.useState(false);
  const [brief, setBrief] = React.useState<string | null>(null); // the ONE on-demand AI brief (architecture + review, merged)
  const [explaining, setExplaining] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const r = await latestReport({});
    setLoading(false);
    setReport(r);
    // surface any vulns persisted on the latest snapshot (until a fresh scan replaces them)
    if (r?.vulns && r.vulns.length) setDeps({ vulns: r.vulns, scanned: r.vulns.length, sources: [], online: true, counts: countVulns(r.vulns) });
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function run() {
    setRunning(true);
    const r = await runReport({});
    if (r) setReport(r); else void load();
    await scanDeps(); // one trigger: analysis + the deterministic dependency/vuln scan together
    setRunning(false);
  }

  // Deterministic scan of the lockfile(s) for known-CVE dependencies via OSV (outbound; root
  // defaults to the active workspace server-side). Folded into re-run — no manual button.
  async function scanDeps() {
    setScanning(true);
    const r = await depsAudit({});
    setScanning(false);
    if (r) setDeps(r);
  }

  // The ONE AI step — on-demand only (rebuild stays deterministic, $0). A single brief that MERGES the
  // architecture read (the old "digest") and the health review, grounded in the spine + score + smells + vulns.
  async function explain() {
    setExplaining(true);
    try {
      const r = await insightsReview({ vulns: deps?.vulns });
      if (r?.review_md) setBrief(r.review_md);
    } finally {
      setExplaining(false);
    }
  }

  // ⚡ fix — start the micro-PR on the smell's file: whole-file range (the BE clamps to EOF),
  // kind-specific instruction. The proposal is editable; stage puts it in an isolated worktree;
  // merge is the only step that touches the tree.
  async function startFix(i: number, smell: Smell) {
    const path = String(smell.nodes[0] ?? "").replace(/^file:/, "");
    const instruction = SMELL_EXPLAIN[smell.kind]?.fix;
    if (!path || !instruction || fix?.loading) return;
    setFix({ i, path, kind: smell.kind, loading: true });
    try {
      const r: any = await regenerateBlock({ path, start_line: 1, end_line: 100000, instruction: `${instruction}\nContext: ${smell.detail}` });
      setFix((s: any) => (s && s.i === i ? { ...s, loading: false, ...(r?.ok ? { data: r } : { err: r?.error ?? "the AI could not propose a fix (provider / key)" }) } : s));
    } catch (e: any) { setFix((s: any) => (s && s.i === i ? { ...s, loading: false, err: String(e?.message ?? e).slice(0, 160) } : s)); }
  }
  async function stageFix() {
    if (!fix?.data) return;
    const session = fix.session ?? `smell-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    setFix((s: any) => ({ ...s, staging: true, session }));
    try {
      const st: any = await regenerateStage({ path: fix.path, start_line: fix.data.start_line ?? 1, end_line: fix.data.end_line ?? 1, proposed: fix.data.proposed, session_id: session });
      const res = (st?.result ?? st) || {};
      setFix((s: any) => ({ ...s, staging: false, stage: res?.ok != null ? res : { ok: false, error: st?.error ?? "stage failed" } }));
    } catch (e: any) { setFix((s: any) => ({ ...s, staging: false, stage: { ok: false, error: String(e?.message ?? e).slice(0, 160) } })); }
  }
  async function mergeFix() {
    if (!fix?.session) return;
    setFix((s: any) => ({ ...s, merging: true }));
    try {
      const m: any = await regenerateMerge({ session_id: fix.session, path: fix.path, summary: `micro-PR — ${fix.kind} smell in ${fix.path.split("/").pop()}` });
      setFix((s: any) => ({ ...s, merging: false, merged: (m?.result ?? m) || { ok: false } }));
    } catch (e: any) { setFix((s: any) => ({ ...s, merging: false, merged: { ok: false, applied: false, error: String(e?.message ?? e).slice(0, 160) } })); }
  }
  const closeFix = () => { if (fix?.session && !fix?.merged?.applied) void regenerateMerge({ session_id: fix.session, abandon: true }); setFix(null); };

  const topRisk = report?.scores?.top_risk ?? report?.top_risk ?? [];

  return (
    <div style={{ padding: "2px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={sectionLabel}>x-ray</div>
        <span style={{ flex: 1 }} />
        <button style={btn()} onClick={() => void explain()} disabled={explaining || loading} title="one on-demand AI brief — architecture + health, merged (rebuild itself stays deterministic)">
          {explaining ? "explaining…" : brief ? "re-explain" : "✧ Explain with AI"}
        </button>
        <button style={btn(true)} onClick={() => void run()} disabled={running} title="re-run the deterministic analysis + the dependency / vuln scan">
          {running ? "analyzing…" : report ? "re-run" : "run analysis"}
        </button>
      </div>

      {brief && (
        <div style={{ marginTop: 10, padding: "8px 11px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel }}>
          <div style={sectionLabel}>AI brief · architecture + health (on-demand)</div>
          <div style={{ maxHeight: 360, overflow: "auto" }}><Markdown text={brief} compact /></div>
        </div>
      )}

      <ParseHealthBlock />
      <CodeChecksBlock />

      {loading && <div style={{ color: C.muted, fontFamily: mono, fontSize: 11, marginTop: 8 }}>loading…</div>}
      {!loading && !report && <div style={{ color: C.muted, fontFamily: mono, fontSize: 11, marginTop: 8 }}>No report yet — run the analysis.</div>}

      {report && (
        <>
          <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
            <ScoreBar label="health" value={report.project.health} hue={C.ok} />
            <ScoreBar label="risk" value={report.project.risk} hue={C.bad} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginTop: 10, alignItems: "start" }}>
          {topRisk.length > 0 && (
            <div>
              <div style={sectionLabel}>riskiest files</div>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginBottom: 5, lineHeight: 1.5 }}>
                risk = how likely the NEXT change here breaks something: heavily depended-on + complex + changing often + untested, combined.
                The line under each file names its exact drivers. Click → open it in the reader.
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {topRisk.slice(0, 6).map((f) => (
                  <li key={f.path} onClick={() => onPick(f.path)} title={`open ${f.path} in the reader`}
                    style={{ padding: "2px 0", cursor: "pointer" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{ ...chip, color: f.risk > 60 ? C.bad : C.warn }}>{f.risk}</span>
                      <code style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{f.path}</code>
                    </div>
                    {riskWhy(f) && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, paddingLeft: 34 }}>{riskWhy(f)}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.smells && report.smells.length > 0 && (
            <div>
              <div style={sectionLabel}>smells ({report.smells.length})</div>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginBottom: 5, lineHeight: 1.5 }}>
                structural problems the import graph PROVES (deterministic, $0). Each says what it means and the move that clears it;
                ⚡ fix opens a micro-PR (AI proposes → isolated worktree → you merge). Click a row → open the file.
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 280, overflow: "auto" }}>
                {report.smells.slice(0, 40).map((s, i) => {
                  const ex = SMELL_EXPLAIN[s.kind];
                  return (
                  <li key={i} title={s.nodes.join(", ")} style={{ padding: "3px 0" }}>
                    <div onClick={() => s.nodes[0] && onPick(s.nodes[0])}
                      style={{ display: "flex", gap: 6, alignItems: "baseline", cursor: s.nodes[0] ? "pointer" : "default" }}>
                      <span style={{ ...chip, color: severityHue(s.severity) }}>{s.kind}</span>
                      <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, flex: 1 }}>{s.detail}</span>
                      {ex?.fix && (fix?.i === i
                        ? <code style={{ fontFamily: mono, fontSize: 9.5, color: C.brand }}>⚡ open below</code>
                        : <button style={{ ...btn(), padding: "0 6px", fontSize: 9.5, color: C.brand }} title="micro-PR: AI proposes a fix → isolated worktree → you merge"
                            onClick={(e) => { e.stopPropagation(); void startFix(i, s); }}>⚡ fix</button>)}
                    </div>
                    {ex && (
                      <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, paddingLeft: 6, lineHeight: 1.5 }}>
                        {ex.what} → <span style={{ color: C.muted }}>{ex.move}</span>
                      </div>
                    )}
                    {fix?.i === i && (
                      <div style={{ margin: "5px 0 3px", border: `1px solid color-mix(in oklab, ${C.brand} 40%, ${C.border})`, borderRadius: 5, padding: "6px 9px", background: C.bg }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontFamily: mono, fontSize: 8, color: C.brand, textTransform: "uppercase", letterSpacing: 0.8 }}>⚡ micro-PR · {fix.path.split("/").pop()}</span>
                          <span style={{ fontFamily: mono, fontSize: 7.5, color: C.dim }}>AI proposes → isolated worktree → you merge · nothing touches the tree until then</span>
                          <span style={{ flex: 1 }} />
                          <button onClick={closeFix} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
                        </div>
                        {fix.loading ? <div style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>◆ proposing the fix…</div>
                          : fix.err ? <div style={{ fontFamily: mono, fontSize: 9, color: C.bad }}>{fix.err}</div>
                          : fix.data ? (<>
                            {fix.data.rationale && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, marginBottom: 3 }}>{fix.data.rationale}</div>}
                            <textarea value={fix.data.proposed} spellCheck={false}
                              onChange={(e) => { const v = e.target.value; setFix((x: any) => ({ ...x, data: { ...x.data, proposed: v }, stage: null, merged: null })); }}
                              style={{ width: "100%", minHeight: 60, maxHeight: 200, fontFamily: mono, fontSize: 8.5, lineHeight: 1.45, color: C.ok, background: C.panel2, border: `1px solid color-mix(in oklab, ${C.ok} 40%, ${C.border})`, borderRadius: 3, padding: "2px 6px", resize: "vertical", boxSizing: "border-box", outline: "none" }} />
                            <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 4 }}>
                              {!fix.stage?.ok && <button style={{ ...btn(true), fontSize: 9.5 }} disabled={fix.staging} onClick={() => void stageFix()}>{fix.staging ? "staging…" : "stage in worktree"}</button>}
                              {fix.stage?.ok && !fix.merged?.applied && <button style={{ ...btn(true), fontSize: 9.5 }} disabled={fix.merging} onClick={() => void mergeFix()}>{fix.merging ? "merging…" : "✓ merge into the tree"}</button>}
                              {fix.stage && !fix.stage.ok && <span style={{ fontFamily: mono, fontSize: 9, color: C.bad }}>{fix.stage.error ?? "stage failed"}</span>}
                              {fix.merged?.applied && <span style={{ fontFamily: mono, fontSize: 9, color: C.ok }}>✓ merged</span>}
                              {fix.merged && !fix.merged.applied && fix.merged.error && <span style={{ fontFamily: mono, fontSize: 9, color: C.bad }}>{fix.merged.error}</span>}
                            </div>
                          </>) : null}
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
            </div>
          )}
          </div>
        </>
      )}

      {deps && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={sectionLabel}>dependencies{deps.vulns.length > 0 ? ` — ${deps.counts.total} vuln${deps.counts.total === 1 ? "" : "s"}` : ""}</div>
            <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>
              {deps.scanned} scanned{deps.sources.length ? ` · ${deps.sources.join(", ")}` : ""}{!deps.online ? " · offline" : ""}
            </span>
          </div>
          {deps.vulns.length === 0 ? (
            <div style={{ fontFamily: mono, fontSize: 11, color: deps.scanned > 0 ? C.ok : C.muted, marginTop: 4 }}>
              {deps.scanned > 0 ? "✓ no known vulnerabilities" : !deps.online ? "offline — OSV unreachable" : "no lockfile found to scan"}
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 200, overflow: "auto" }}>
              {deps.vulns.slice(0, 50).map((v, i) => (
                <li key={i} title={v.summary ?? v.cve}
                  style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "1px 0" }}>
                  <span style={{ ...chip, color: vulnHue(v.severity) }}>{v.severity}</span>
                  <code style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{v.package}@{v.version}</code>
                  <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{v.cve}</span>
                  <span style={{ flex: 1 }} />
                  {v.fixed_in && <code style={{ fontFamily: mono, fontSize: 9.5, color: C.ok }} title={`bump to ${v.fixed_in}`}>→ {v.fixed_in}</code>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Folded-in DETERMINISTIC digest — the full code-review snapshot (code_digests), $0, recomputed on
          each rebuild. Merged here so Insights is the ONE place: deterministic x-ray + digest, AI on demand. */}
      <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <DigestView origin="atlas" onOpen={onPick} />
      </div>

    </div>
  );
}

// ── the view ─────────────────────────────────────────────────────────────────
// ── the canvas: file BLOCKS + import BINDINGS as a clickable SVG graph ─────────
// Blocks are files (sized/shaded by fan-in = how depended-on); bindings are the
// `imports` edges between them. Click a block → blast it + open its detail (defs +
// signatures = the I/O + its in/out bindings). Capped to the most-central files so
// a large atlas stays legible; search/blast cover the long tail.
function NodeDetail({ atlas, path, pickedId, onPick }: { atlas: AtlasResponse; path: string; pickedId: string; onPick: (id: string) => void }) {
  const node = atlas.nodes.find((n) => n.id === pickedId);
  const group = React.useMemo(
    () => groupByFile(atlas.nodes, atlas.edges).find((g) => g.path === path),
    [atlas, path],
  );
  if (!group) return null;
  return (
    <div style={{ marginTop: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <code style={{ fontFamily: mono, fontSize: 11.5, color: C.brand, fontWeight: 600 }}>{path}</code>
        <span style={chip}>{group.defs.length} def{group.defs.length === 1 ? "" : "s"}</span>
      </div>
      {group.fileNode?.intent && <div style={{ color: C.dim, fontSize: 11, margin: "4px 0" }}>{group.fileNode.intent}</div>}
      {node && node.type !== "file" && node.signature && (
        <div style={{ marginTop: 6 }}>
          <div style={sectionLabel}>signature · inputs → output</div>
          <code style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{node.name}{node.signature}</code>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
        <div>
          <div style={sectionLabel}>defs (each: name + signature)</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 170, overflow: "auto" }}>
            {group.defs.map((d) => (
              <li key={d.id} onClick={() => onPick(d.id)} title={`blast ${d.id}`}
                style={{ cursor: "pointer", padding: "1px 0", display: "flex", gap: 6, alignItems: "baseline" }}>
                <span style={{ fontFamily: mono, fontSize: 8.5, color: typeColor(d.type), textTransform: "uppercase", minWidth: 50 }}>{d.type}</span>
                <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{d.name ?? baseName(d.id)}</span>
                {d.signature && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>{d.signature}</span>}
              </li>
            ))}
            {group.defs.length === 0 && <li style={{ color: C.muted, fontFamily: mono, fontSize: 10 }}>—</li>}
          </ul>
        </div>
        <div>
          <div style={sectionLabel}>outbound bindings (imports)</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 170, overflow: "auto" }}>
            {group.imports.map((p) => (
              <li key={p} style={{ padding: "1px 0" }}><code title={p} style={{ ...chip, color: C.warn }}>{baseName(p)}</code></li>
            ))}
            {group.imports.length === 0 && <li style={{ color: C.muted, fontFamily: mono, fontSize: 10 }}>— (no internal imports)</li>}
          </ul>
        </div>
      </div>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginTop: 6 }}>inbound bindings (what breaks if this changes) → the blast panel</div>
    </div>
  );
}

// ── drift bar: incremental "code changed → refresh the derived world" + the outside-edit banner ──
// A thin drift banner — surfaces only WHEN the code changed under the atlas (fs/git edits since the
// last index). No button: rebuild (above) is the single re-index action. In sync → renders nothing.
function DriftBar() {
  const [drift, setDrift] = React.useState<import("@/loki/api/codebase").CodebaseRefresh | null>(null);
  const check = React.useCallback(async () => { const r = await refreshCodebase({ detect_only: true }); if (r) setDrift(r); }, []);
  React.useEffect(() => { void check(); const t = setInterval(() => void check(), 20000); return () => clearInterval(t); }, [check]);

  const arr = (v: string[] | number | undefined) => (Array.isArray(v) ? v.length : 0);
  if (!(drift?.dirty ?? 0)) return null;
  const parts: string[] = [];
  if (arr(drift?.added)) parts.push(`${arr(drift?.added)} new`);
  if (arr(drift?.changed)) parts.push(`${arr(drift?.changed)} changed`);
  if (arr(drift?.deleted)) parts.push(`${arr(drift?.deleted)} gone`);
  return (
    <div style={{ fontFamily: mono, fontSize: 10.5, color: C.warn }}>
      ⚠ code drifted — {parts.join(" · ")} · rebuild to re-index
    </div>
  );
}

// a square icon button (graph / scope toolbar) — compact, replaces the old full-width action bars.
function IconBtn({ children, title, onClick, active }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button title={title} onClick={onClick} style={{
      fontFamily: mono, fontSize: 14, lineHeight: 1, width: 30, height: 30, borderRadius: 6, cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "transparent", border: "none", color: active ? C.brand : C.muted,
    }}>{children}</button>
  );
}

// A compact graph PREVIEW shown beside the insights — the inline graph, clipped + non-interactive,
// with an "open" button (and click-to-zoom) that expands the full force-graph overlay.
function GraphPreview({ atlas, onOpen, onPick }: { atlas: AtlasResponse; onOpen: () => void; onPick: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={btn(true)} onClick={onOpen} title="expand the full force graph">⛶ open</button>
      </div>
      <div onClick={onOpen} title="click a node → open its file · click empty space or ⛶ → expand" style={{ overflow: "hidden", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
        <AtlasGraphMini atlas={atlas} height={300} onPick={onPick} />
      </div>
    </div>
  );
}

/** `autoRebuild`: a workspace with no atlas is indexed at once (a rebuild is deterministic and costs nothing) instead of asking the person to press the button: a team's X-ray tab sets it. */
export function AtlasView({ autoRebuild = false, emptyNote, onEmpty }: { autoRebuild?: boolean; /** said under the empty state: what to do when there is nothing to index */ emptyNote?: React.ReactNode; /** called once when the workspace turns out to hold no code to index */ onEmpty?: () => void } = {}) {
  const [atlas, setAtlas] = React.useState<AtlasResponse | null>(null); const autoStarted = React.useRef(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const emptyTold = React.useRef(false); React.useEffect(() => { if (onEmpty && !emptyTold.current && !loading && atlas && atlas.node_count === 0) { emptyTold.current = true; onEmpty(); } }, [onEmpty, loading, atlas]);
  React.useEffect(() => { if (!autoRebuild || autoStarted.current || loading || !atlas || atlas.node_count !== 0) return; autoStarted.current = true; void onboardStart({}); }, [autoRebuild, loading, atlas]);   // the rebuild panel below adopts the job and shows its phases
  const refresh = React.useCallback(async () => {
    setLoading(true); setError(null);
    const r = await getAtlas({ with_tokens: true });
    setLoading(false);
    if (!r) { setError("codebase/get timed out or is unreachable — is the BE running? (a junk-bloated atlas can also cause this: rebuild it)"); return; }
    setAtlas(r);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const groups = React.useMemo(
    () => (atlas ? groupByFile(atlas.nodes, atlas.edges) : []),
    [atlas],
  );
  const [graphOpen, setGraphOpen] = React.useState(false);
  const [scopeOpen, setScopeOpen] = React.useState(false);
  const [ideFile, setIdeFile] = React.useState<{ path: string; fileNode: any } | null>(null);
  // a clicked node id OR raw path (insights / search / x-ray rows) resolves to its file and opens it
  // in the IDE editor. TOLERANT by design (operator 2026-07-23: "riskiest files shows paths I don't
  // see at the code reader, onclick is not opening them"): the atlas graph is CAPPED to the most
  // central files, but the reader streams any file from disk — so when the node isn't in the capped
  // atlas we synthesize a minimal file node instead of silently doing nothing.
  const pick = (id: string) => {
    if (!id || !atlas) return;
    const n = atlas.nodes.find((x) => x.id === id);
    const path = n?.path ?? id.replace(/^file:/, ""); // ids are paths (or file:path) for file rows
    const fileNode = atlas.nodes.find((x) => x.type === "file" && x.path === path)
      ?? n ?? { id: path, path, type: "file", name: path.split("/").pop() };
    setIdeFile({ path, fileNode });
  };
  // open a file in the IDE editor from a raw path (entry-point row → its source file).
  const openFromPath = (path: string) => {
    if (!path || !atlas) return;
    const fileNode = atlas.nodes.find((x) => x.type === "file" && x.path === path)
      ?? { id: path, path, type: "file", name: path.split("/").pop() }; // capped atlas → synthesized node; the reader reads from disk
    setIdeFile({ path, fileNode });
  };

  return (
    <div style={{ background: C.bg, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>

      {/* The error text tells the operator to rebuild, so the rebuild button has to be HERE: on this
          path `atlas` is null, which makes both of its other render sites unreachable — the screen
          asked for an action it then hid. Retry too, because "unreachable" is usually transient. */}
      {error && (
        <div style={{ background: C.panel, border: `1px solid ${C.bad}`, borderRadius: 8, padding: "10px 12px", color: C.bad, fontFamily: mono, fontSize: 11 }}>
          {error}
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => void refresh()} style={btn(true)}>retry</button>
            <RebuildPanel onDone={refresh} />
          </div>
        </div>
      )}

      {loading && !atlas && (
        <div style={{ color: C.muted, fontFamily: mono, fontSize: 11, padding: 14 }}>loading atlas…</div>
      )}

      {atlas && atlas.node_count === 0 && (
        <div style={{
          margin: 14, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "28px 14px", textAlign: "center", color: C.muted, fontSize: 12,
        }}>
          No atlas yet — rebuild to index this workspace's codebase.
          <div style={{ marginTop: 12, display: "inline-flex" }}><RebuildPanel onDone={refresh} /></div>
          {emptyNote && <div data-testid="atlas-empty-note" style={{ marginTop: 14, lineHeight: 1.55 }}>{emptyNote}</div>}
        </div>
      )}

      {/* the files IDE — full-bleed, fills the rest of the screen (no header, no padding) */}
      {atlas && atlas.node_count > 0 && (
        <FilesIDE groups={groups} atlas={atlas} selected={ideFile} onSelect={setIdeFile} onPick={pick}
          renderInsights={() => <InsightsPanel onPick={pick} />} onExpandGraph={() => setGraphOpen(true)}
          rebuild={<RebuildPanel onDone={refresh} />} scopeView={<ScopePanel />} />
      )}

      {graphOpen && atlas && <AtlasGraphOverlay atlas={atlas} onClose={() => setGraphOpen(false)} />}
    </div>
  );
}

// ── the files mosaic: Metro-style tiles, sized by content (defs + bindings) ────
function FileMosaic({ groups, onPick }: { groups: FileGroup[]; onPick: (id: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gridAutoRows: 82, gridAutoFlow: "dense", gap: 8 }}>
      {groups.map((g) => <FileTile key={g.path} g={g} onPick={onPick} />)}
    </div>
  );
}

function FileTile({ g, onPick }: { g: FileGroup; onPick: (id: string) => void }) {
  const defs = g.defs.length;
  const weight = defs * 2 + g.imports.length + Math.round(g.callsOut / 2);
  const size = weight >= 16 ? "lg" : weight >= 8 ? (defs >= 6 ? "tall" : "wide") : "sm";
  const span =
    size === "lg" ? { gridColumn: "span 2", gridRow: "span 2" } :
    size === "wide" ? { gridColumn: "span 2" } :
    size === "tall" ? { gridRow: "span 2" } : {};
  const big = size === "lg" || size === "tall";
  const accent = extColor(g.path);
  const ext = extOf(g.path);
  return (
    <div
      onClick={() => g.fileNode && onPick(g.fileNode.id)}
      title={g.fileNode ? `blast ${g.path}` : g.path}
      style={{
        ...span, cursor: g.fileNode ? "pointer" : "default", overflow: "hidden",
        background: `color-mix(in oklch, ${accent} 11%, ${C.panel})`,
        border: `1px solid color-mix(in oklch, ${accent} 26%, ${C.border})`,
        borderTop: `2px solid ${accent}`, borderRadius: 8, padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: 3,
      }}
    >
      <code style={{ fontFamily: mono, fontSize: 11, color: C.fg, fontWeight: 600, wordBreak: "break-all", lineHeight: 1.2 }}>{baseName(g.path)}</code>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: accent }}>{ext ? "." + ext : "·"}</span>
        <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>{defs} def{defs === 1 ? "" : "s"}</span>
        {g.imports.length > 0 && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>→ {g.imports.length}</span>}
      </div>
      {big && g.fileNode?.intent && (
        <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.fileNode.intent}</div>
      )}
      {big && defs > 0 && (
        <ul style={{ listStyle: "none", margin: "2px 0 0", padding: 0, overflow: "hidden", flex: 1 }}>
          {g.defs.slice(0, size === "lg" ? 9 : 4).map((d) => (
            <li key={d.id} onClick={(e) => { e.stopPropagation(); onPick(d.id); }} title={`blast ${d.id}`}
              style={{ display: "flex", gap: 5, alignItems: "baseline", padding: "0.5px 0", cursor: "pointer" }}>
              <span style={{ fontFamily: mono, fontSize: 7.5, color: typeColor(d.type), textTransform: "uppercase", minWidth: 34 }}>{d.type}</span>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name ?? baseName(d.id)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
