// A TEAM'S WEB APPS, BEFORE IT RUNS: one line per app the team uses (an agent's `app-<id>` or a web-app node): connected, needs sign-in, not installed, not answering. A team with no app shows nothing.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import type { AppsPreflight } from "./api";

const LABEL: Record<string, [string, string]> = { answers: ["connected", C.ok], needs_signin: ["needs sign-in", C.warn ?? C.bad], not_installed: ["not installed", C.bad], unreachable: ["not answering", C.bad], server_error: ["not answering", C.bad] };

export function AppConnections({ pre }: { pre: AppsPreflight | null }) {
  if (!pre || pre.used === 0) return null;
  return (
    <div data-testid="app-connections" style={{ margin: "10px 16px 0", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: nav, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ color: C.muted, fontFamily: mono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>web apps</span>
        {pre.items.map((i) => { const [t, c] = LABEL[i.state] ?? LABEL.unreachable; return <span key={i.app} data-testid={`app-state-${i.app}`} data-state={i.state} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: c }} />{i.name} <span style={{ color: c }}>{t}</span></span>; })}
      </div>
      {!pre.ready && pre.human.map((h, k) => <div key={k} data-testid="app-need" style={{ color: C.muted, lineHeight: 1.45 }}>{h}</div>)}
    </div>
  );
}
