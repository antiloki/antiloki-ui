// WHAT AN AGENT'S BOX CHANGED, AS GIT SAYS IT (the Diff pane, operator 2026-11-10: "deterministic, git-based, no AI"): the files with their +/- counts and a patch viewer. Read from `/api/v1/diff` and `/api/v1/diff/patch`.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import { parseDiffSummary, parsePatch, STATUS_WORD, totals, type DiffSummary, type PatchLine } from "./diff-model";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
const tone = (k: PatchLine["kind"]) => (k === "add" ? { bg: `color-mix(in srgb, ${C.ok} 13%, transparent)`, fg: C.fg, sign: "+" } : k === "del" ? { bg: `color-mix(in srgb, ${C.bad} 13%, transparent)`, fg: C.fg, sign: "−" } : k === "hunk" ? { bg: `color-mix(in srgb, ${C.brand} 10%, transparent)`, fg: C.brand, sign: "" } : k === "meta" ? { bg: "transparent", fg: C.muted, sign: "" } : { bg: "transparent", fg: C.muted, sign: " " });

export function AgentChanges({ paneId, refreshKey }: { paneId: number; refreshKey: unknown }) {
  const [sum, setSum] = React.useState<DiffSummary | null | undefined>(undefined); const [err, setErr] = React.useState(""); const [open, setOpen] = React.useState<string | null>(null);
  const [patch, setPatch] = React.useState<{ file: string; lines: PatchLine[] | null; note?: string } | null>(null);
  React.useEffect(() => { let stop = false; const load = () => void (async () => { try { const r = unwrap(await apiGet(`/api/v1/diff?pane_id=${paneId}`)); if (stop) return; const s = parseDiffSummary(r); if (s) { setSum(s); setErr(""); } else { setSum(null); setErr(typeof r?.error === "string" ? r.error : "could not read the changes"); } } catch { if (!stop) { setSum(null); setErr("the serve could not be reached"); } } })();
    load(); const t = setInterval(load, 6000); return () => { stop = true; clearInterval(t); };   // git is the truth and an agent keeps writing: read it again every few seconds
  }, [paneId, refreshKey]);
  const show = async (file: string) => {
    if (open === file) { setOpen(null); setPatch(null); return; }
    setOpen(file); setPatch({ file, lines: null });
    try { const r = unwrap(await apiGet(`/api/v1/diff/patch?pane_id=${paneId}&file=${encodeURIComponent(file)}`)); setPatch({ file, lines: r?.ok === true && typeof r.patch === "string" ? parsePatch(r.patch) : [], note: r?.ok === true ? (r.patch ? "" : "no textual change (binary, or a mode change)") : String(r?.error ?? "could not read the patch") }); } catch { setPatch({ file, lines: [], note: "the serve could not be reached" }); }
  };
  if (sum === undefined) return <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, marginTop: 4 }}>reading the changes…</div>;
  if (!sum) return <div data-testid={`changes-error-${paneId}`} style={{ fontFamily: mono, fontSize: 9, color: C.warn, marginTop: 4 }}>{err}</div>;
  const t = totals(sum.files);
  return (
    <div data-testid={`changes-${paneId}`} style={{ marginTop: 5, borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, display: "flex", gap: 8, alignItems: "baseline" }}>
        <span data-testid={`changes-total-${paneId}`}>{t.files} file{t.files === 1 ? "" : "s"} · <span style={{ color: C.ok }}>+{t.add}</span> <span style={{ color: C.bad }}>−{t.del}</span></span>
        <span style={{ color: C.muted }}>against {sum.base}{sum.ahead ? ` · ${sum.ahead} commit${sum.ahead === 1 ? "" : "s"} ahead` : " · nothing committed"}</span>
        {sum.hidden > 0 && <span style={{ color: C.muted }} title="files antiloki writes into every box (its context pack, the engines' settings, the MCP config)">+{sum.hidden} generated, not listed</span>}
      </div>
      {sum.files.length === 0 && <div data-testid={`changes-none-${paneId}`} style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, marginTop: 3 }}>no changes yet</div>}
      {sum.files.map((f) => (
        <div key={f.path}>
          <button data-testid={`change-file-${paneId}-${f.path}`} aria-expanded={open === f.path} onClick={() => void show(f.path)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: open === f.path ? C.panel2 : "transparent", border: "none", cursor: "pointer", padding: "2px 4px", fontFamily: mono, fontSize: 10, color: C.fg }}>
            <span title={STATUS_WORD[f.status] ?? f.status} style={{ width: 12, color: f.status === "D" ? C.bad : f.status === "M" ? C.warn : C.ok, fontWeight: 700 }}>{f.status}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
            {f.binary ? <span style={{ color: C.muted }}>binary</span> : <><span style={{ color: C.ok }}>+{f.add}</span><span style={{ color: C.bad }}>−{f.del}</span></>}
          </button>
          {open === f.path && (
            <div data-testid={`patch-${paneId}`} style={{ border: `1px solid ${C.border}`, borderRadius: 5, margin: "2px 0 6px", maxHeight: 360, overflow: "auto", background: C.bg }}>
              {patch?.lines === null && <div style={{ padding: 6, fontFamily: mono, fontSize: 9.5, color: C.muted }}>reading the patch…</div>}
              {patch?.note && <div style={{ padding: 6, fontFamily: mono, fontSize: 9.5, color: C.muted }}>{patch.note}</div>}
              {(patch?.lines ?? []).map((l, i) => { const x = tone(l.kind); return (
                <div key={i} data-kind={l.kind} style={{ display: "flex", background: x.bg, fontFamily: mono, fontSize: 10, lineHeight: 1.45, color: x.fg, whiteSpace: "pre" }}>
                  <span style={{ width: 34, textAlign: "right", color: C.muted, flexShrink: 0, paddingRight: 4, userSelect: "none" }}>{l.old ?? ""}</span><span style={{ width: 34, textAlign: "right", color: C.muted, flexShrink: 0, paddingRight: 6, userSelect: "none" }}>{l.now ?? ""}</span>
                  <span style={{ width: 12, flexShrink: 0, color: l.kind === "add" ? C.ok : l.kind === "del" ? C.bad : C.muted }}>{x.sign}</span><span>{l.text}</span>
                </div>); })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
