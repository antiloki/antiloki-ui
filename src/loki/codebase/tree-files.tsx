import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { fileRead } from "@/loki/api/codebase";
import { x2 } from "./xray-board";
import { Highlighted } from "./highlight";

const Msg = ({ text }: { text: string }) => <div style={{ padding: 16, fontFamily: mono, fontSize: 11.5, color: C.muted }}>{text}</div>;
/** THE FILES OF A SPACE, WITHOUT ANY INDEX (the operator 2026-11-19: "nothing changed on the x-ray tab"): when a space holds nothing X-ray's parsers read (a video made of one HTML page), the files are still the codebase: listed, readable, and a page can be seen working. */
export function TreeFiles({ space }: { space: string }) {
  const [files, setFiles] = React.useState<{ path: string; kb: number; kind: string }[] | null>(null); const [sel, setSel] = React.useState<string | null>(null); const [mode, setMode] = React.useState<"code" | "preview">("preview"); const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => { let on = true; void x2<any>(space, "tree_files").then((r) => { if (!on) return; const f = r.ok ? (r.files as any[]) : []; setFiles(f); setSel((s) => s ?? (f.find((x) => x.path.endsWith(".html"))?.path ?? f[0]?.path ?? null)); }); return () => { on = false; }; }, [space]);
  React.useEffect(() => { let on = true; setText(null); if (sel) void fileRead({ path: sel }).then((r) => { if (on) setText((r as any)?.content ?? ""); }); return () => { on = false; }; }, [sel]);
  if (files === null) return <Msg text="reading the files…" />;
  const isHtml = !!sel && /\.html?$/i.test(sel);
  return (
    <div data-testid="tree-files" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(180px, 280px) minmax(0, 1fr)", fontFamily: nav, color: C.fg, background: C.bg }}>
      <div style={{ borderRight: `1px solid ${C.border}`, overflow: "auto", padding: 10, display: "grid", gap: 2, alignContent: "start" }}>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, letterSpacing: ".07em", padding: "2px 8px 6px" }}>FILES · {files.length}</div>
        {files.map((f) => <button key={f.path} data-testid={`tree-file-${f.path}`} aria-pressed={sel === f.path} onClick={() => setSel(f.path)} style={{ display: "flex", gap: 8, alignItems: "baseline", textAlign: "left", background: sel === f.path ? C.panel : "transparent", color: sel === f.path ? C.fg : C.muted, border: "none", borderRadius: 9, padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span><span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>{f.kb} KB</span></button>)}
        {!files.length && <span style={{ color: C.muted, fontSize: 12.5, padding: "4px 8px" }}>This folder holds no files yet.</span>}
      </div>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        {sel && <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5 }}><span style={{ fontFamily: mono, fontSize: 11.5 }}>{sel}</span><span style={{ flex: 1 }} />
          {isHtml && <div role="tablist" style={{ display: "inline-flex", gap: 2, padding: 2, border: `1px solid ${C.border}`, borderRadius: 999 }}>{(["preview", "code"] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} data-testid={`tree-mode-${m}`} onClick={() => setMode(m)} style={{ fontFamily: "inherit", fontSize: 12, padding: "2px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: mode === m ? C.panel : "transparent", color: mode === m ? C.fg : C.muted }}>{m === "preview" ? "Preview" : "Code"}</button>)}</div>}</div>}
        {sel && text === null && <Msg text="reading the file…" />}
        {sel && text !== null && (isHtml && mode === "preview" ? <iframe data-testid="tree-preview" title={sel} sandbox="allow-scripts" srcDoc={text} style={{ flex: 1, minHeight: 0, border: 0, width: "100%", background: "#fff" }} /> : <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 10 }}><Highlighted code={text} /></div>)}
        {!sel && <Msg text="no file to show" />}
      </div>
    </div>
  );
}
