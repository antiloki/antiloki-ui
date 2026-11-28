// The message a refused app gets in ANY pane: what happened, what to do, and the links to do it (appproblem.ts). An ordinary error (not a refusal) shows as the plain text it was.
import * as React from "react";
import { classify } from "./app-problem";

export function AppProblem({ app, text, color, testid = "app-problem", style }: { app: string; text: string; color: string; testid?: string; style?: React.CSSProperties }) {
  const p = React.useMemo(() => classify(app, text), [app, text]); if (!text) return null;
  if (!p) return <div data-testid={testid} style={{ color, ...style }}>{text}</div>;
  return (
    <div data-testid={testid} data-kind={p.kind} role="alert" style={{ color, lineHeight: 1.5, ...style }}>
      <div style={{ fontWeight: 600 }}>{p.title}</div>
      <div style={{ opacity: 0.9 }}>{p.fix}</div>
      {p.links.length > 0 && <div style={{ marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>{p.links.map((l) => <a key={l.href} data-testid="app-problem-link" href={l.href} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{l.label} ↗</a>)}</div>}
      <div style={{ marginTop: 4, opacity: 0.6, fontSize: 12 }} data-testid={`${testid}-raw`}>{text}</div>
    </div>);
}
