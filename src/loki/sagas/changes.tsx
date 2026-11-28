// THE SAGA'S CHANGES: the snapshots of what its agent changed in the code, newest first; one opens to the files and the real diff.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";
import { ago } from "./model";
import { changeLine, parsePatch, type Change, type FileDiff } from "./changes-model";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
export async function getChange(id: number, ws?: string): Promise<Change | null> {
  try { const d = unwrap(await apiGet(`/api/v1/sagas/change?id=${id}${ws ? `&workspace=${encodeURIComponent(ws)}` : ""}`)); return d?.change ?? null; } catch { return null; }
}
const tone = (k: string) => (k === "add" ? { bg: "color-mix(in srgb, #2ea043 16%, transparent)", fg: C.fg, mark: "+" } : k === "del" ? { bg: "color-mix(in srgb, #f85149 16%, transparent)", fg: C.fg, mark: "−" } : k === "hunk" ? { bg: "color-mix(in srgb, #6aa8ff 12%, transparent)", fg: C.muted, mark: "" } : { bg: "transparent", fg: k === "meta" ? C.dim : C.fg, mark: " " });

export function FileDiffView({ f }: { f: FileDiff }) {
  return (
    <div data-testid={`diff-file-${f.path}`} style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "5px 10px", fontFamily: mono, fontSize: 12, background: C.panel2, color: C.fg, display: "flex", gap: 8 }}><span>{f.path}</span><span style={{ color: C.muted }}>{f.status}</span></div>
      {f.binary ? <div style={{ padding: 10, color: C.muted, fontSize: 12 }}>a binary file: its bytes are in the patch, not drawn here</div> : (
        <div style={{ overflowX: "auto", fontFamily: mono, fontSize: 11.5, lineHeight: 1.5 }}>
          {f.lines.filter((l) => l.kind !== "meta" || false).map((l, i) => { const t = tone(l.kind); return <div key={i} data-kind={l.kind} style={{ display: "flex", background: t.bg, color: t.fg, whiteSpace: "pre", minWidth: "max-content" }}><span style={{ width: 18, flexShrink: 0, textAlign: "center", color: C.muted }}>{t.mark}</span><span>{l.text}</span></div>; })}
        </div>
      )}
    </div>
  );
}

export function Changes({ changes, workspace, episodeTitles }: { changes: Change[]; workspace?: string; episodeTitles?: Record<number, string> }) {
  const [open, setOpen] = React.useState<number | null>(null); const [one, setOne] = React.useState<Change | null>(null); const [failed, setFailed] = React.useState(false);
  const show = async (id: number) => { if (open === id) { setOpen(null); return; } setOpen(id); setOne(null); setFailed(false); const c = await getChange(id, workspace); if (c) setOne(c); else setFailed(true); };
  if (!changes.length) return <div data-testid="changes-empty" style={{ color: C.muted, fontSize: 13 }}>no code has changed in this saga (yet)</div>;
  return (
    <div data-testid="changes" style={{ display: "grid", gap: 8 }}>
      {changes.map((c, i) => (
        <div key={c.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel }}>
          <button data-testid={`change-${c.id}`} aria-expanded={open === c.id} onClick={() => void show(c.id)} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 10, alignItems: "baseline", padding: "9px 12px", width: "100%", boxSizing: "border-box", fontSize: 13, color: C.fg }}>
            <span style={{ color: C.muted }}>{open === c.id ? "▾" : "▸"}</span>
            <span style={{ fontFamily: mono, fontSize: 12 }}>{changeLine(c)}</span>
            <span style={{ flex: 1 }} />
            {i === 0 && <span style={{ color: C.ok, fontSize: 11 }}>latest</span>}
            <span style={{ color: C.muted, fontSize: 11.5 }}>{c.actor}{c.task_id && episodeTitles?.[c.task_id] ? ` · ${episodeTitles[c.task_id]}` : ""} · {ago(c.t_ms)}</span>
          </button>
          {open === c.id && (
            <div data-testid={`change-body-${c.id}`} style={{ display: "grid", gap: 8, padding: "0 12px 12px" }}>
              {!one && !failed && <div style={{ color: C.muted, fontSize: 12 }}>loading the diff…</div>}
              {failed && <div style={{ color: C.warn, fontSize: 12 }}>could not read this diff</div>}
              {one?.truncated && <div style={{ color: C.warn, fontSize: 12 }}>this patch was cut: it was too long to keep whole</div>}
              {one && parsePatch(one.patch ?? "").map((f) => <FileDiffView key={f.path} f={f} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
