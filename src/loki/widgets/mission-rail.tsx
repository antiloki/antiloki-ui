// mission-rail — the Ultra review's (né Paper Creator) context rail, FORKED from the chat Studio's
// (operator 2026-07-19: "if reuse is difficult, fork it"). Same anatomy — Priority
// · the code-scope checkbox tree with token weights · context chips — retargeted:
// the CHECKED FILES ARE THE MISSION SCOPE. The context chips are (a) the
// deterministic verdict slices every specialist call ALWAYS carries, (b) the
// Studio's own source categories (operator 2026-07-20: "we have many more, look at
// studio") — Code / Work / Knowledge — wired for real through the shared corpus
// gather(), and (c) the two run switches: 🌐 web research (a wizard lives in the
// body) and ✒ the editor (now OBLIGATORY — informational, no longer a toggle).
import { libraryCall } from "@/loki/widgets/context-library";
import * as React from "react";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { C } from "@/loki/theme";
import { fmtTokens } from "@/loki/util/tokens";
import { buildTree, topKids, buildTokenMap, TreeNode } from "@/loki/codebase/checkbox-tree";
import { SOURCE_GROUPS as STUDIO_SOURCE_GROUPS } from "@/loki/widgets/studio-overlay";

// THE ULTRA REVIEW'S CONTEXT SOURCES (operator 2026-09-19): the X-ray's own verdicts first — the
// file review of each case and the folder paper of its folder — then the Code sources the chat
// Studio knows. Work / Knowledge are gone from the scope ("don't exist anymore").
export const SOURCE_GROUPS: { group: string; items: [string, string][] }[] = [
  { group: "X-ray", items: [["file_review", "File review"], ["folder_paper", "Folder paper"]] },
  ...STUDIO_SOURCE_GROUPS.filter((g) => g.group === "Code"),
];

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

const tone = (h: number | null | undefined) => (h == null ? C.dim : h < 55 ? C.bad : h < 78 ? C.warn : C.ok);

export function MissionRail({ missionTitle, scope, onScope, candidates, research, onResearch, sources, onSources, layout = "rail" }: {
  missionTitle: string | null;
  scope: string[]; onScope: (paths: string[]) => void;
  candidates: { path: string; health?: number | null }[];
  research: boolean; onResearch: () => void;
  sources: string[]; onSources: (kinds: string[]) => void;
  /** "rail" = the narrow left column of the overlay; "box" (operator 2026-09-19: "we took the scope
   *  from the sidebar left, now we place in a box inside the mission the full scope edit") = a wide
   *  two-column block inside the armed mission — the cases left, the context + run switches right. */
  layout?: "rail" | "box";
}) {
  const [codePaths, setCodePaths] = React.useState<string[] | null>(null);
  const [fileTokens, setFileTokens] = React.useState<Record<string, number> | null>(null);
  const [filter, setFilter] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [candShow, setCandShow] = React.useState(10); // candidate chips shown; + expands by 10
  // the atlas load: a null reply is the serve busy (one writer connection, a page burst), not an empty
  // atlas — it retries once by itself and then offers ↻ (2026-09-19: "atlas empty" while the atlas had
  // 4,579 files).
  const [atlasErr, setAtlasErr] = React.useState<string | null>(null);
  const [atlasTry, setAtlasTry] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      setAtlasErr(null);
      try {
        const r = await apiPost("/api/v1/codebase/get", { origin: "atlas", limit: 6000, with_tokens: true, types: ["file"] }, { timeoutMs: 30000 });
        if (!alive) return;
        if (r == null) {
          if (atlasTry === 0) { setTimeout(() => { if (alive) setAtlasTry(1); }, 4000); return; }
          setAtlasErr("the atlas did not answer"); setCodePaths([]); return;
        }
        const d: any = unwrap(r);
        const ps = (d?.nodes || []).filter((n: any) => n.type === "file").map((n: any) => String(n.path)).filter(Boolean);
        setCodePaths([...new Set<string>(ps)].sort());
        setFileTokens(d?.file_tokens || null);
      } catch (e: any) { if (alive) { setAtlasErr(String(e?.message ?? "failed").slice(0, 80)); setCodePaths([]); } }
    })();
    return () => { alive = false; };
  }, [atlasTry]);
  const checked = React.useMemo(() => new Set(scope), [scope.join("|")]);
  const togglePath = (p: string) => { const n = new Set(checked); if (n.has(p)) n.delete(p); else n.add(p); onScope([...n].slice(0, 6)); };
  const toggleExp = (p: string) => setExpanded((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const tokMap = React.useMemo(() => buildTokenMap(fileTokens), [fileTokens]);
  const tok = React.useCallback((p: string) => tokMap?.[p] ?? null, [tokMap]);
  const shown = (codePaths || []).filter((p) => !filter || p.toLowerCase().includes(filter.toLowerCase()));
  const tree = React.useMemo(() => buildTree(shown.slice(0, 4000)), [shown.join("|")]);
  const scopeTok = scope.reduce((a, p) => a + (tok(p) ?? 0), 0);
  const srcOn = React.useMemo(() => new Set(sources), [sources.join("|")]);
  const [libPacks, setLibPacks] = React.useState<{ slug: string; name: string }[] | null>(null);
  React.useEffect(() => { let alive = true; void libraryCall({ op: "packs" }).then((d) => { if (alive) setLibPacks(d?.ok && Array.isArray(d.packs) ? d.packs : []); }); return () => { alive = false; }; }, []);
  const toggleSrc = (k: string) => { const n = new Set(srcOn); if (n.has(k)) n.delete(k); else n.add(k); onSources([...n]); };

  const head: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 };
  const staticChip = (label: string, title: string) => (
    <span key={label} title={title} style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 7px", borderRadius: 10, border: `1px solid color-mix(in oklab, ${C.brand} 35%, ${C.border})`, background: `color-mix(in oklab, ${C.brand} 8%, transparent)`, color: C.brand }}>✓ {label}</span>
  );
  const toggleChip = (k: string, label: string) => { const on = srcOn.has(k); return (
    <button key={k} onClick={() => toggleSrc(k)} title={on ? "enabled — rides the crew as background; click to drop" : "add this source to the crew's context"}
      style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 7px", borderRadius: 10, cursor: "pointer", border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", color: on ? C.brand : C.muted }}>{on ? "✓ " : ""}{label}</button>
  ); };

  const box = layout === "box";
  return (
    <div data-testid={box ? "scope-box" : undefined} style={box
      ? { display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: "4px 18px", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", background: C.panel, marginTop: 10 }
      : { borderRight: `1px solid ${C.border}`, overflow: "auto", padding: "12px 12px", width: 196, flexShrink: 0 }}>
      {!box && <div style={head}>Priority</div>}
      {!box && <div style={{ fontFamily: mono, fontSize: 10, color: C.brand, marginBottom: 11, lineHeight: 1.5 }} title="the armed mission leads every call">① {missionTitle ?? "no mission armed — pick one"}</div>}
      <div style={box ? { minWidth: 0 } : undefined}>
      <div style={head}>{box ? "Scope — the cases" : "② Scope — the cases"}</div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginBottom: 5, opacity: 0.7, display: "flex" }}>
          <span style={{ flex: 1 }}>Code &amp; docs</span>{checked.size > 0 && <span>{checked.size}/6 · ~{fmtTokens(scopeTok)}</span>}
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter files…"
          style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.fg, fontFamily: mono, fontSize: 9.5, padding: "3px 6px", marginBottom: 4 }} />
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, maxHeight: box ? 300 : 220, overflow: "auto", padding: "4px 5px" }}>
          {codePaths === null ? <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>loading atlas…</span>
            : atlasErr ? <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>{atlasErr} — <button onClick={() => { setCodePaths(null); setAtlasTry((n) => n + 1); }} style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: 0 }}>↻ retry</button></span>
            : !codePaths.length ? <span style={{ fontFamily: mono, fontSize: 9, color: C.warn }}>atlas empty — rebuild it in Code.</span>
            : topKids(tree).map((k: any) => <TreeNode key={k.path} node={k} depth={0} checked={checked} onToggle={togglePath} expanded={expanded} toggleExp={toggleExp} forceOpen={!!filter} ancestorChecked={false} token={tok} />)}
        </div>
        {/* best candidates (operator 2026-07-20: the wizard's worst-first files as
            one-click chips) — only the UNHEALTHY (red/yellow, health < 78), ≥10 shown */}
        {(() => {
          const all = candidates.filter((c) => !checked.has(c.path) && c.health != null && c.health < 78);
          const cands = all.slice(0, candShow);
          return all.length > 0 && (
          <div style={{ marginTop: 7 }}>
            <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginBottom: 4, opacity: 0.7 }}>best candidates — worst health first ({all.length})</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {cands.map((c) => (
                <button key={c.path} onClick={() => togglePath(c.path)} title={`add ${c.path} to scope`}
                  style={{ display: "inline-flex", gap: 4, alignItems: "center", fontFamily: mono, fontSize: 9.5, padding: "2px 7px", borderRadius: 10, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.muted, maxWidth: "100%" }}>
                  <b style={{ color: tone(c.health), fontVariantNumeric: "tabular-nums" }}>{c.health ?? "—"}</b>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.path.split("/").pop()}</span>
                </button>
              ))}
            </div>
            {all.length > cands.length && (
              <button onClick={() => setCandShow((n) => n + 10)} style={{ marginTop: 5, background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: 0 }}>+ show 10 more ({all.length - cands.length} left)</button>
            )}
          </div>
          );
        })()}
      </div>
      </div>
      <div style={box ? { minWidth: 0 } : undefined}>
      <div style={head}>{box ? "The verdict — every call carries" : "③ The verdict — every call carries"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
        {staticChip("verdict + axes", "the deterministic verdict — always rides")}
        {staticChip("laws + violations", "the lens's laws with recorded evidence — always rides")}
        {staticChip("the field", "the 1-ring neighborhood with the symbols each edge carries — always rides")}
        {staticChip("population", "the same laws counted across the whole snapshot — always rides")}
        {staticChip("source ≤5k", "the case's source, honestly truncated — always rides")}
      </div>
      <div style={head}>{box ? "Context — add sources" : "④ Context — add sources"}</div>
      {/* THE CONTEXT PACKS (2026-09-19): the library's packs as sources — `pack:<slug>`, the whole pack rides */}
      {(libPacks?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginBottom: 5, opacity: 0.7 }}>Context packs</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{(libPacks ?? []).map((p) => toggleChip(`pack:${p.slug}`, `◆ ${p.name}`))}</div>
        </div>
      )}
      {SOURCE_GROUPS.map((g) => (
        <div key={g.group} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: mono, fontSize: 8, color: C.dim, marginBottom: 5, opacity: 0.7 }}>{g.group}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {g.items.map(([k, label]) => toggleChip(k, label))}
          </div>
        </div>
      ))}
      <div style={head}>{box ? "The run" : "⑤ The run"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <button onClick={onResearch} title="deterministic pre-flight research — the wizard below the preview lets you paste URLs or let the AI pick; click to toggle"
          style={{ fontFamily: mono, fontSize: 9.5, padding: "2px 7px", borderRadius: 10, cursor: "pointer", border: `1px solid ${research ? C.brand : C.border}`, background: research ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", color: research ? C.brand : C.muted }}>{research ? "✓ " : ""}🌐 web research</button>
        {staticChip("✒ the editor", "the paper specialist is OBLIGATORY (operator 2026-07-20) — one high-tier call binds the study after the crew")}
      </div>
      </div>
    </div>
  );
}
