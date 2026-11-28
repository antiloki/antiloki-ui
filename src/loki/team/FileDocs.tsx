// THE DOCUMENTATION OF A FILE, FROM THE FILE (the Editor view's docs icon): any kind of file (code, page, report, table, data, image), read by the book's own deterministic readers: no model, the same text for the same bytes.
// X-ray's docs site documents the symbols of an indexed code base; this is what you read when a file is not one of those, and it is never empty for a file that can be read.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { teamOp } from "./api";

type Row = { k: string; v: unknown; signature?: string };
type Doc = { ok: boolean; path: string; kind: string; title: string; summary: string; sections: { title: string; items: Row[] }[]; error?: string };
const show = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" ? v : String(v));

export function FileDocs({ run = "", dir = "", path, nonce = 0 }: { run?: string; /** a folder to read from instead of a run's (X-ray's docs page asks with its own space) */ dir?: string; path: string; /** bump to read the file again */ nonce?: number }) {
  const [doc, setDoc] = React.useState<Doc | null>(null); const [bad, setBad] = React.useState("");
  React.useEffect(() => { let stop = false; setDoc(null); setBad(""); void teamOp<Doc>("doc_of", { run, path, ...(dir ? { dir } : {}) }).then((r: any) => { if (stop) return; if (r?.ok) setDoc(r as Doc); else setBad(String(r?.error ?? "could not read this file")); }); return () => { stop = true; }; }, [run, dir, path, nonce]);
  if (bad) return <div data-testid="file-docs-error" style={{ padding: 16, color: "var(--c-bad)", fontFamily: nav, fontSize: 12.5 }}>{bad}</div>;
  if (!doc) return <div data-testid="file-docs-loading" style={{ padding: 18, display: "grid", gap: 10 }}>{[60, 40, 75, 30, 55].map((w, i) => <i key={i} style={{ height: 12, width: `${w}%`, borderRadius: 6, background: "color-mix(in srgb, var(--c-fg) 7%, transparent)", display: "block" }} />)}</div>;
  return (
    <div data-testid="file-docs" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "14px 22px 30px", fontFamily: nav, color: C.fg, fontSize: 13 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}><b style={{ fontSize: 17 }}>{doc.title}</b><span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{doc.kind}</span></div>
      {doc.summary && <p data-testid="file-docs-summary" style={{ color: C.muted, margin: "6px 0 14px", maxWidth: "76ch", lineHeight: 1.5 }}>{doc.summary}</p>}
      {doc.sections.map((s) => (
        <section key={s.title} data-testid={`file-docs-${s.title.toLowerCase().replace(/\W+/g, "-")}`} style={{ marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 6px", font: `600 10.5px ${nav}`, letterSpacing: ".08em", textTransform: "uppercase", color: C.dim }}>{s.title}</h4>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {s.items.map((r, i) => (
              <div key={`${r.k}-${i}`} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 32%) 1fr", gap: 12, padding: "5px 12px", borderTop: i ? `1px solid ${C.border}` : undefined, alignItems: "baseline" }}>
                <span style={{ fontFamily: mono, fontSize: 12, whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>{r.k}</span>
                <span style={{ color: C.muted, minWidth: 0, wordBreak: "break-word" }}>{show(r.v)}{r.signature ? <span style={{ display: "block", fontFamily: mono, fontSize: 11, color: C.dim }}>{r.signature}</span> : null}</span>
              </div>))}
          </div>
        </section>))}
    </div>);
}
