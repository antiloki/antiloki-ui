// SHARED DIFF widget (operator 2026-07-25) — the cross-agent git view: files × agents matrix, overlaps,
// DETERMINISTIC conflict analysis (git merge-tree dry-run), an integration-order proposal, and the
// RESOLVER: one click spawns a merge agent (Claude/Codex/OpenCode — your pick) whose only mission is
// merging the conflicting worktrees; its result still goes through the normal merge gate.
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import { paneDisplay, type WidgetProps } from "./types";
import { CockpitPaneBody } from "./cockpit-pane-body";
import { sayToAgent, listAgents } from "./agent-interact";
import { useSeats, offered } from "@/loki/api/seats";
import { AgentChanges } from "./diff-changes";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
const chip: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9, color: C.muted };
const ST: Record<string, { c: string; t: string }> = {
  conflict: { c: C.bad, t: "⛔ real conflict" },
  "clean-merge": { c: C.ok, t: "✓ merges clean" },
  uncommitted: { c: C.warn, t: "◌ commit to analyze" },
};

export function SharedDiffWidget({ ctx }: WidgetProps) {
  const [d, setD] = React.useState<any>(null);
  // the resolver's seat: the one picked, else the seat the serve plans on - never a fixed Claude (review 2026-10-01)
  const seats = useSeats();
  const [picked, setEngine] = React.useState<string | null>(null);
  const engine = picked ?? seats?.defaultKey ?? "";
  const [resolver, setResolver] = React.useState<{ csId: number; paneId: number; kind: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    const r = unwrap(await apiPost(`/api/v1/shared-diff`, { chat_session_id: ctx?.chatSessionId ?? undefined, session_id: ctx?.cockpitSessionId ?? undefined }, { timeoutMs: 30_000 }));
    if (r?.ok) setD(r); else if (r?.error) setNote(`⚠ ${String(r.error).slice(0, 120)}`);
  }, [ctx?.chatSessionId, ctx?.cockpitSessionId]);
  React.useEffect(() => { void load(); const t = setInterval(() => void load(), 8_000); return () => clearInterval(t); }, [load]);

  const paneOf = (id: number) => d?.panes?.find((p: any) => p.pane_id === id);
  const spawnResolver = async (c: { a: number; b: number; files: string[] }) => {
    if (!d?.session_id || busy || !engine) return;
    setBusy(true); setNote(null);
    try {
      const A = paneOf(c.a), B = paneOf(c.b);
      const mission = [
        `MERGE MISSION — you exist ONLY to reconcile two sibling worktrees before integration. You change nothing else.`,
        `Branch A: ${A?.branch} (${paneDisplay(A?.kind ?? "").name}) · Branch B: ${B?.branch} (${paneDisplay(B?.kind ?? "").name})`,
        `Conflicting files: ${c.files.join(", ")}`,
        `Steps: 1) git merge ${A?.branch}  2) git merge ${B?.branch}  3) resolve each conflict PRESERVING BOTH INTENTS`,
        `4) run the build + relevant tests as PROOF  5) report what you kept from each side, file by file.`,
      ].join("\n");
      const added = unwrap(await apiPost(`/api/v1/cockpit/pane/add`, {
        session_id: d.session_id, subagent_name: `merge-resolver-${Date.now().toString(36)}`,
        pane_kind: engine, scope: c.files, extra_prompt_md: mission,
      }, { timeoutMs: 120_000 }));
      if (!added?.pane?.id) throw new Error(added?.error ?? "resolver provisioning failed");
      setResolver({ csId: d.session_id, paneId: added.pane.id, kind: engine });
      setNote(`◆ merge agent spawned — pane #${added.pane.id}, scoped to ${c.files.length} file${c.files.length === 1 ? "" : "s"}; its result still passes the merge gate.`);
    } catch (e: any) { setNote(`⚠ ${String(e?.message ?? "spawn failed").slice(0, 140)}`); }
    setBusy(false);
  };

  const panes: any[] = d?.panes ?? [];
  const overlaps: any[] = d?.overlaps ?? [];
  const conflicts: any[] = d?.conflicts ?? [];
  return (
    <div style={{ padding: "10px 12px", fontFamily: nav, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 8, minHeight: 200 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.brand, fontWeight: 700 }}>⇄ shared diff</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{panes.length} agent{panes.length === 1 ? "" : "s"} · {overlaps.length} overlap{overlaps.length === 1 ? "" : "s"} · {conflicts.length} conflict pair{conflicts.length === 1 ? "" : "s"} · live</span>
        <span style={{ flex: 1 }} />
        <button onClick={async () => { const as = await listAgents(ctx?.chatSessionId); for (const a of as) void sayToAgent(a.id, "Give a 3-line standup: done / now / blocked."); setNote(as.length ? `◆ standup pinged ${as.length} agent${as.length === 1 ? "" : "s"}` : "⚠ no agent panes"); }} style={chip} title="ping EVERY running agent for a standup">⏱ standup all</button>
        <button onClick={() => void load()} style={chip}>↻</button>
      </div>
      {note && <div style={{ fontFamily: mono, fontSize: 9.5, color: note.startsWith("⚠") ? C.warn : C.brand }}>{note}</div>}
      {!panes.length && <div style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>no agent worktrees in this session yet — open a Claude/Codex/OpenCode pane and let it work.</div>}

      {/* the matrix — each agent's changed files; shared files highlighted */}
      {panes.map((p: any) => (
        <div key={p.pane_id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 9px" }}>
          <div style={{ fontFamily: mono, fontSize: 10.5, color: C.fg, fontWeight: 700 }}>{paneDisplay(p.kind).glyph} {paneDisplay(p.kind).name} <span style={{ color: C.dim, fontWeight: 400 }}>· {p.branch} · {p.files.length} file{p.files.length === 1 ? "" : "s"}</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
            {p.files.slice(0, 24).map((f: string) => {
              const ov = overlaps.find((o) => o.path === f);
              return <span key={f} title={ov ? `${ST[ov.status]?.t} — also changed by ${ov.pane_ids.filter((x: number) => x !== p.pane_id).map((x: number) => paneDisplay(paneOf(x)?.kind ?? "").name).join(", ")}` : f}
                style={{ fontFamily: mono, fontSize: 8.5, border: `1px solid ${ov ? (ST[ov.status]?.c ?? C.border) : C.border}`, color: ov ? ST[ov.status]?.c : C.dim, borderRadius: 4, padding: "0 5px" }}>{f.split("/").pop()}</span>;
            })}
            {p.files.length > 24 && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted }}>+{p.files.length - 24}</span>}
          </div>
          <AgentChanges paneId={p.pane_id} refreshKey={`${p.files.join("|")}`} />
        </div>
      ))}

      {/* conflicts + the deterministic proposal + the resolver spawn */}
      {conflicts.map((c: any, i: number) => (
        <div key={i} style={{ border: `1px solid ${C.bad}`, borderRadius: 8, padding: "6px 9px", background: `color-mix(in oklab, ${C.bad} 7%, transparent)` }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.bad, fontWeight: 700 }}>⛔ {paneDisplay(paneOf(c.a)?.kind ?? "").name} × {paneDisplay(paneOf(c.b)?.kind ?? "").name} — {c.files.length} file{c.files.length === 1 ? "" : "s"} really conflict</div>
          <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, margin: "2px 0 5px" }}>{c.files.join(" · ")}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={engine} onChange={(e) => setEngine(e.target.value)} style={{ ...chip, cursor: "pointer" }}>
              {offered(seats, engine).map((k) => <option key={k} value={k}>{paneDisplay(k).glyph} {paneDisplay(k).name}</option>)}
            </select>
            <button disabled={busy} onClick={() => void spawnResolver(c)} style={{ ...chip, color: C.brand }} title="spawn an agent whose ONLY mission is merging these worktrees (scoped to the conflicting files; gate still applies)">{busy ? "spawning…" : "⚒ spawn merge agent"}</button>
          </div>
        </div>
      ))}
      {d?.proposal?.note && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>proposal: {d.proposal.note}{d.proposal.order?.length ? ` — order: ${d.proposal.order.map((id: number) => paneDisplay(paneOf(id)?.kind ?? "").name).join(" → ")}` : ""}</div>}

      {/* the embedded resolver terminal — attaches to the spawned pane */}
      {resolver && (
        <div style={{ border: `1px solid ${C.brand}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: C.brand, padding: "3px 9px", borderBottom: `1px solid ${C.border}` }}>⚒ merge agent · pane #{resolver.paneId} <button onClick={() => setResolver(null)} style={{ ...chip, float: "right", fontSize: 8 }}>hide</button></div>
          <div style={{ height: 380, display: "flex", flexDirection: "column" }}>
            <CockpitPaneBody kind={resolver.kind} sessionId={resolver.csId} paneId={resolver.paneId} attach={{ csId: resolver.csId, paneId: resolver.paneId }} chatSessionId={ctx?.chatSessionId} sessionBrief={ctx?.sessionBrief} />
          </div>
        </div>
      )}
    </div>
  );
}
