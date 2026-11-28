// THE PROOF CARD (RFC 0010 Appendix D, B2): does this team beat one agent? Small and plain, in the Run tab. The verdict comes from the rules written before any run (the serve computes it from the pairs a bench
// run recorded); with no pairs it says so, and a team that changed since the proof shows it as stale. Never a green tick for a team nobody measured.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { teamProof } from "./api";
import type { ProofCardData } from "./types";

const TONE: Record<string, string> = { "earns its place": "var(--c-ok)", "earns it on cost": "var(--c-ok)", "earns it on time": "var(--c-ok)", "one agent was enough": "var(--c-bad)", withheld: "#c9a34e", inconclusive: "#c9a34e", none: "var(--c-dim, #888)" };
const pct = (x?: number | null) => (typeof x === "number" ? `${Math.round(x * 100)}%` : "–");
const SEEN = new Map<string, ProofCardData>();
export function ProofCard({ team }: { team: string }) {
  const [p, setP] = React.useState<ProofCardData | null>(() => SEEN.get(team) ?? null);
  React.useEffect(() => { let stop = false; void Promise.resolve(teamProof(team)).then((x) => { if (x) SEEN.set(team, x); if (!stop) setP(x ?? null); }); return () => { stop = true; }; }, [team]);
  if (!p) return null;
  return (
    <div data-testid="proof-card" data-verdict={p.verdict} style={{ fontFamily: nav, fontSize: 12.5, color: C.fg, padding: "6px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
      <b data-testid="proof-verdict" style={{ fontWeight: 500, color: TONE[p.verdict] ?? C.fg }}>{p.verdict === "none" ? "no proof yet" : p.verdict}</b>
      <span data-testid="proof-words" style={{ color: C.muted, flex: "1 1 280px", minWidth: 0 }}>{p.words}</span>
      {p.recorded && p.n > 0 && <span data-testid="proof-numbers" style={{ color: C.dim, fontSize: 11.5 }}>{p.n} pairs · {p.fixtures} fixtures{p.w !== undefined ? ` · wins ${pct(p.w)} (${pct(p.w_lo)}–${pct(p.w_hi)})` : ""}{p.rho_cost != null ? ` · cost ${p.rho_cost.toFixed(2)}x` : ""}{p.rho_time != null ? ` · time ${p.rho_time.toFixed(2)}x` : ""}</span>}
      {p.stale && <span data-testid="proof-stale" style={{ color: "#c9a34e", fontSize: 11.5 }}>stale</span>}
    </div>
  );
}
