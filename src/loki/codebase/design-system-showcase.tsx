// DesignSystemShowcase — FEAT-DESIGN-SYSTEM "System" tab. The visual, DETERMINISTIC design-system page for
// the WORKSPACE PROJECT (the codebase the atlas is pointed at) — rendered from its HARVESTED tokens
// (design-system-get → code_design_tokens), NOT antiloki's own UI. Foundations only: Colors / Typography /
// Spacing / Radius read from the project's palette. (antiloki can't live-MOUNT another codebase's React
// components — those are files on disk in the workspace; for component/screen VISUALS use Playwright
// screenshots of the project's running app. The Components tab is the harvested catalog.)
//
// `C` here is antiloki's OWN theme — it styles THIS view's chrome (borders/labels); the CONTENT (swatches,
// scales) is the workspace project's tokens passed in via `palette`.
import * as React from "react";
import { C } from "@/loki/theme";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const label: React.CSSProperties = { fontFamily: mono, fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 };
const card: React.CSSProperties = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 };

type Tok = { token: string | null; value: string; usage_count: number };
type Cat = { declared: Tok[]; literals: Tok[] };

const isColorValue = (v: string) => /^(#|rgb|hsl|oklch|oklab)/i.test(String(v).trim());
const numOf = (v: string) => { const m = /-?\d*\.?\d+/.exec(String(v)); return m ? parseFloat(m[0]) : null; };
const uniqNum = (arr: number[]) => [...new Set(arr)].sort((a, b) => a - b);
const Empty = ({ note }: { note: string }) => <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, fontStyle: "italic" }}>{note}</div>;

export function DesignSystemShowcase({ palette }: { palette: Record<string, Cat> | null | undefined }) {
  if (!palette || Object.keys(palette).length === 0) {
    return <div style={{ fontFamily: mono, fontSize: 12, color: C.muted, fontStyle: "italic", padding: "16px 4px" }}>
      no design tokens for this workspace yet — press ↻ rebuild (or rebuild the atlas) to harvest THIS project's palette, then it renders here.
    </div>;
  }
  const cat = (k: string): Cat => palette[k] ?? { declared: [], literals: [] };
  const all = (k: string) => [...cat(k).declared, ...cat(k).literals];

  // colors: only the concrete values (oklch/#/rgb) render as swatches; CSS var-refs (var(--x)) can't resolve
  // here (the project's stylesheet isn't loaded), so they're skipped — extractCssVars harvests the resolved
  // values separately, which DO render.
  const seen = new Set<string>();
  const colors = all("color").filter((t) => isColorValue(t.value) && !seen.has(t.value) && seen.add(t.value));
  const fonts = all("font_family");
  const sizes = uniqNum(all("font_size").map((t) => numOf(t.value)).filter((n): n is number => n != null && n > 0 && n <= 96));
  const spacing = uniqNum(all("spacing").map((t) => numOf(t.value)).filter((n): n is number => n != null && n > 0 && n <= 80));
  const radii = uniqNum(all("radius").map((t) => numOf(t.value)).filter((n): n is number => n != null && n >= 0 && n <= 40));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={card}>
        <div style={label}>Colors · {colors.length} (this project's palette)</div>
        {colors.length === 0
          ? <Empty note="no concrete color values harvested (the project may use CSS variables not yet resolved — rebuild the atlas)" />
          : <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {colors.slice(0, 96).map((t, i) => (
                <div key={i} title={`${t.token ?? t.value} · ${t.usage_count}×`} style={{ width: 88 }}>
                  <span style={{ display: "block", height: 46, borderRadius: 6, background: t.value, border: `1px solid ${C.border}` }} />
                  <span style={{ display: "block", fontFamily: mono, fontSize: 10, color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>{t.token ?? t.value}</span>
                  <span style={{ display: "block", fontFamily: mono, fontSize: 9, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(t.value).slice(0, 22)}</span>
                </div>
              ))}
            </div>}
      </div>

      <div style={card}>
        <div style={label}>Typography</div>
        {fonts.length === 0 && sizes.length === 0
          ? <Empty note="no font tokens harvested" />
          : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {fonts.map((f, i) => (
                <div key={i}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginBottom: 3 }}>{f.token ?? "font"} — {f.value}</div>
                  <div style={{ fontFamily: f.value, fontSize: 22, color: C.fg }}>The quick brown fox — 0123456789</div>
                </div>
              ))}
              {sizes.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "baseline", marginTop: 4 }}>
                {sizes.map((s) => <span key={s} style={{ fontFamily: mono, fontSize: s, color: C.fg }} title={`${s}px`}>Aa{s}</span>)}
              </div>}
            </div>}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ ...card, flex: 1, minWidth: 280 }}>
          <div style={label}>Spacing scale · {spacing.length}</div>
          {spacing.length === 0 ? <Empty note="no spacing tokens" /> :
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
              {spacing.map((s) => (
                <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ width: s, height: s, background: C.brand, borderRadius: 2 }} />
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{s}</span>
                </div>
              ))}
            </div>}
        </div>
        <div style={{ ...card, flex: 1, minWidth: 280 }}>
          <div style={label}>Radius scale · {radii.length}</div>
          {radii.length === 0 ? <Empty note="no radius tokens" /> :
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {radii.map((r) => (
                <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 34, height: 34, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: r }} />
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{r}</span>
                </div>
              ))}
            </div>}
        </div>
      </div>

      <div style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>
        Rendered from THIS workspace project's harvested tokens. Component & screen VISUALS of another codebase
        can't be live-mounted here — see the Components tab for the catalog, or capture real screenshots via
        Playwright over the project's running app.
      </div>
    </div>
  );
}
