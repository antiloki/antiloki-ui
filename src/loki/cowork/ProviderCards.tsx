// AN AGENT PROPOSED A PROVIDER (RFC 0023). The card shows the exact commands and STAYS until the person confirms or rejects: nothing of the recipe has run. Confirm installs (when the recipe has a command)
// and antiloki tests it; only a provider that passed joins the pane menu. A failed test keeps the card, with the step that failed.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { apiGet, apiPost } from "@/loki/api/client";

export type ProviderProposal = { provider: string; title: string; status: "proposed" | "testing" | "failed"; report: string; proposedBy: string; commands: { label: string; line: string }[]; setup: string; link: string };

const strs = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
/** The proposals still waiting on the person (a ready one has left the cards). */
export function parseProposals(r: any): ProviderProposal[] {
  const d = r?.result ?? r; if (!d || d.ok !== true || !Array.isArray(d.providers)) return [];
  return d.providers.filter((p: any) => p && typeof p.provider === "string" && ["proposed", "testing", "failed"].includes(p.status)).map((p: any) => {
    const rc = p.recipe ?? {}; const cmd = String(rc.command ?? ""); const line = (a: string[]) => a.map((x) => (/\s/.test(x) ? JSON.stringify(x) : x)).join(" ");
    const commands = [
      ...(strs(rc.install).length ? [{ label: "install", line: line(strs(rc.install)) }] : []),
      { label: "check", line: line([cmd, ...strs(rc.detect)]) },
      { label: "test", line: line([cmd, ...strs(rc.smoke)]) },
      { label: "pane", line: line([cmd, ...strs(rc.args)]) },
    ];
    return { provider: p.provider, title: String(p.title ?? p.provider), status: p.status, report: String(p.report ?? ""), proposedBy: String(p.proposed_by ?? ""), commands, setup: String(rc.setup ?? ""), link: String(rc.link ?? "") };
  });
}

export function useProviderProposals(everyMs: number): { proposals: ProviderProposal[]; act: (provider: string, op: "confirm" | "reject") => Promise<void> } {
  const [proposals, setProposals] = React.useState<ProviderProposal[]>([]);
  const alive = React.useRef(true);
  const read = React.useCallback(async () => { try { const r = parseProposals(await apiGet("/api/v1/providers")); if (alive.current) setProposals(r); } catch { /* the serve is restarting: the cards stay as they are */ } }, []);
  React.useEffect(() => { alive.current = true; void read(); const t = setInterval(() => { if (!(typeof document !== "undefined" && document.hidden)) void read(); }, everyMs); return () => { alive.current = false; clearInterval(t); }; }, [everyMs, read]);
  const act = React.useCallback(async (provider: string, op: "confirm" | "reject") => { try { await apiPost("/api/v1/providers", { op, provider }); } finally { await read(); } }, [read]);
  return { proposals, act };
}

const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12, borderRadius: 8, padding: "4px 12px", cursor: "pointer" };

export function ProviderCard({ p, act }: { p: ProviderProposal; act: (provider: string, op: "confirm" | "reject") => Promise<void> }) {
  const testing = p.status === "testing";
  return (
    <div data-testid="toast-provider" role="alertdialog" aria-label={`${p.title} wants to be added`} style={{ background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 92%, transparent)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", fontFamily: nav }}>
      <div style={{ fontSize: 13, color: C.fg, fontWeight: 600 }}>Add the agent “{p.title}”?</div>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{p.proposedBy ? `Proposed by ${p.proposedBy}. ` : ""}Confirm runs these commands on this machine:</div>
      <div data-testid="toast-provider-commands" style={{ marginTop: 6, maxHeight: 120, overflow: "auto", fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: C.fg }}>
        {p.commands.map((c) => <div key={c.label} style={{ wordBreak: "break-all" }}><span style={{ color: C.muted }}>{c.label}: </span>{c.line}</div>)}
      </div>
      {p.setup && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Your step first: {p.setup}{p.link ? ` (${p.link})` : ""}</div>}
      {p.status === "failed" && <div data-testid="toast-provider-failed" style={{ fontSize: 12, color: C.warn, marginTop: 6, wordBreak: "break-word" }}>{p.report}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button data-testid="toast-provider-confirm" disabled={testing} onClick={() => void act(p.provider, "confirm")} style={{ ...btn, background: "color-mix(in srgb, #3ecf8e 16%, transparent)", color: "#3ecf8e", border: "1px solid #3ecf8e55" }}>{testing ? "testing…" : p.status === "failed" ? "Try again" : "Confirm"}</button>
        <button data-testid="toast-provider-reject" disabled={testing} onClick={() => void act(p.provider, "reject")} style={{ ...btn, background: "transparent", color: C.fg, border: `1px solid ${C.border}` }}>Reject</button>
      </div>
    </div>
  );
}
