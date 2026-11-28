import React, { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useBypasses } from "@/loki/api/hooks";
import { EndpointStub } from "@/loki/components/EndpointStub";
import { C } from "@/loki/theme";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

const KIND_COLOR: Record<string, string> = {
  god_dispatch:  C.warn,
  unsafe_skill:  C.bad,
  no_verify:     C.warn,
  law_blocked:   C.bad,
};

export function BypassesLog() {
  const [kindFilter, setKindFilter] = useState<string>("");
  const bypassQ = useBypasses();
  const all = bypassQ.data ?? [];
  const items = useMemo(
    () => all.filter((b: any) => !kindFilter || b.kind === kindFilter),
    [all, kindFilter],
  );

  if (bypassQ.notWired) return <EndpointStub endpoint="/api/v1/bypasses/list" />;

  const blocked = all.filter((b: any) => b.outcome === "blocked").length;
  const sprintTotal = all.length;

  return (
    <div style={{ padding: "20px 24px", background: C.bg, color: C.fg, fontFamily: '-apple-system, system-ui, sans-serif', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>safety · bypasses</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 14 }}>Escapes &amp; overrides log</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        {[
          { k: "total", v: sprintTotal, color: C.brand },
          { k: "blocked", v: blocked, color: blocked > 0 ? C.bad : C.dim },
          { k: "allowed", v: sprintTotal - blocked, color: C.ok },
        ].map(s => (
          <div key={s.k} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{s.k}</div>
            <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 600, color: s.color, marginTop: 4 }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {["", "god_dispatch", "unsafe_skill", "no_verify", "law_blocked"].map(t => (
          <button key={t} onClick={() => setKindFilter(t)}
            style={{
              background: kindFilter === t ? C.brand : "transparent",
              color: kindFilter === t ? "oklch(0.18 0.005 250)" : C.dim,
              border: `1px solid ${kindFilter === t ? C.brand : C.border}`,
              borderRadius: 4, padding: "4px 10px",
              fontFamily: mono, fontSize: 10, cursor: "pointer", fontWeight: kindFilter === t ? 600 : 400,
            }}>{t || "all"}</button>
        ))}
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 80px 160px 1fr 1.2fr 90px", gap: 0, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, background: C.panel2 }}>
          <span>ts</span><span>actor</span><span>kind</span><span>action</span><span>reason</span><span>outcome</span>
        </div>
        {items.map((b: any) => (
          <div key={b.id} style={{
            display: "grid", gridTemplateColumns: "120px 80px 160px 1fr 1.2fr 90px",
            gap: 0, padding: "10px 12px", borderBottom: `1px solid ${C.border}`,
            fontFamily: mono, fontSize: 11, alignItems: "center",
          }}>
            <span style={{ color: C.muted, fontSize: 10 }}>{b.ts}</span>
            <span style={{ color: C.fg, fontWeight: 600, fontSize: 10 }}>{b.actor}</span>
            <span style={{ color: KIND_COLOR[b.kind] ?? C.dim, background: C.bg, padding: "2px 6px", borderRadius: 3, fontSize: 10, width: "fit-content", fontWeight: 600 }}>{b.kind}</span>
            <span style={{ color: C.fg, fontSize: 10 }}>{b.action_name ?? b.law_slug ?? "—"}</span>
            <span style={{ color: b.reason ? C.dim : C.bad, fontStyle: b.reason ? "normal" : "italic", fontSize: 10, lineHeight: 1.4 }}>
              {b.reason || "—"}
            </span>
            <span style={{ color: b.outcome === "blocked" ? C.bad : C.ok, textAlign: "right", fontWeight: 600 }}>{b.outcome}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: C.muted, fontFamily: mono, fontSize: 12 }}>
            {bypassQ.loading ? "loading…" : "no bypasses recorded"}
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, fontFamily: mono, fontSize: 10, color: C.muted }}>
        source · /api/v1/bypasses/list · append-only
      </div>
    </div>
  );
}
