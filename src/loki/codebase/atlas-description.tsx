// DescriptionView — a file's conceptual DESCRIPTION on the code-readonly screen (the 📖 split).
// Deterministic facts (gathered on rebuild) shown instantly; the LOW-AI narrative is generated
// on-demand + cached. A `stale` badge appears if the file changed since the facts were gathered.
import React from "react";
import { C, mono } from "@/loki/theme";
import { descriptionGet, describeFile, type FileDescription } from "@/loki/api/codebase";

function Msg({ text }: { text: string }) {
  return <div style={{ height: "100%", display: "grid", placeItems: "center", color: C.muted, fontFamily: mono, fontSize: 11 }}>{text}</div>;
}
function FactRow({ label, items, mono: asMono }: { label: string; items: string[]; mono?: boolean }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
      <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 84 }}>{label}</span>
      {items.map((it, i) => (
        <span key={i} style={{ fontFamily: asMono ? mono : "-apple-system, system-ui, sans-serif", fontSize: asMono ? 10 : 11, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "0 6px" }}>{it}</span>
      ))}
    </div>
  );
}

export function DescriptionView({ path, origin = "atlas" }: { path: string | null; origin?: string }) {
  const [desc, setDesc] = React.useState<FileDescription | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [gen, setGen] = React.useState(false);
  React.useEffect(() => {
    if (!path) { setDesc(null); return; }
    let live = true; setLoading(true); setDesc(null);
    descriptionGet({ path, origin }).then((d) => { if (live) setDesc(d); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [path, origin]);
  const generate = async () => {
    if (!path || gen) return;
    setGen(true);
    const r = await describeFile({ path, origin, force: !!desc?.stale });
    if (r) setDesc((d) => ({ ...(d as FileDescription), path, origin, summary_md: r.summary_md, has_essay: !!r.summary_md, stale: false, facts: r.facts ?? d?.facts ?? null }));
    setGen(false);
  };

  if (!path) return <Msg text="open a file in the tree to see its description" />;
  if (loading && !desc) return <Msg text="loading…" />;
  const facts = desc?.facts ?? null;
  const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 9px", cursor: gen ? "default" : "pointer", color: C.brand, fontFamily: mono, fontSize: 10, opacity: gen ? 0.6 : 1 };
  return (
    <div style={{ height: "100%", overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <code style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 600 }}>{path}</code>
        {facts?.role && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>{facts.role}</span>}
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>description</span>
          {desc?.stale && <span style={{ fontFamily: mono, fontSize: 9, color: C.warn ?? C.bad }}>stale — file changed</span>}
          <span style={{ flex: 1 }} />
          <button onClick={generate} disabled={gen} style={btn}>{gen ? "writing…" : (desc?.has_essay ? "regenerate" : "generate")}</button>
        </div>
        {desc?.summary_md
          ? <div style={{ fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 13, color: C.fg, lineHeight: 1.6 }}>{desc.summary_md}</div>
          : <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>No narrative yet — click <b>generate</b> for a low-cost AI description grounded in the facts below.</div>}
      </div>

      {facts && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>the facts it's grounded in</span>
          <FactRow label="defines" items={(facts.symbols ?? []).map((s) => `${s.name ?? "?"}${s.signature ?? ""}`)} mono />
          <FactRow label="imports" items={facts.imports ?? []} mono />
          <FactRow label="depended on by" items={facts.dependents ?? []} mono />
        </div>
      )}
      {!facts && <div style={{ fontSize: 11.5, color: C.muted }}>No facts gathered yet — rebuild the codebase to populate descriptions.</div>}
    </div>
  );
}
