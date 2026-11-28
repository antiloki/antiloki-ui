// A GATE THAT ASKS BEFORE IT ACTS (idea from AffectUI's Approval Card; our own build). A human node stops a run; this card says WHO is asking and how risky it is, shows what will happen, and takes the answer by click or key
// (A approves, D declines, while no text field has the focus). Nothing is answered by a timer here: a gate waits for the person. The words per gate kind live in `gateInfo`, pure and tested.
import * as React from "react";
import { GlassView } from "./GlassView";
import { C, mono, nav } from "@/loki/theme";
import { Icon } from "./icons";
import { getArtifact } from "./api";
import { frameDoc } from "./frameDoc";

export type GateInfo = { risk: "low" | "medium" | "high"; badge: string; what: string; approve: string; deny: string };
/** What a gate is, in the words a person reads: its risk, what approving does, the label of each button. Pure. */
export function gateInfo(gate: string): GateInfo {
  if (gate === "merge") return { risk: "high", badge: "changes your branch", what: "Merge the pack into your workspace. Until you approve, none of it is on your branch, and only you can pass this: an agent cannot.", approve: "Approve the merge", deny: "Not now" };
  if (gate === "blocked") return { risk: "medium", badge: "team is stuck", what: "The team could not deliver within its limits. Accept what it has, or leave it as it is.", approve: "Accept what it has", deny: "Leave it" };
  if (gate === "permission") return { risk: "medium", badge: "asks first", what: "This step is set to ask before it starts. Allow it to run, or leave it.", approve: "Allow", deny: "Not now" };
  return { risk: "medium", badge: `gate: ${gate || "human"}`, what: `A human gate (${gate || "human"}): only you can pass it, and an agent cannot.`, approve: "Approve", deny: "Not now" };
}
const RISK: Record<GateInfo["risk"], string> = { low: "var(--c-ok)", medium: "#c9a34e", high: "var(--c-bad)" };
const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12.5, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer" };

/** The note of an approval with {ask} and {node.field} filled from the run. An unknown placeholder is left as it is, so the person sees what was not filled. Pure. */
export function fillNote(note: string, ask: string, values: Record<string, any>): string {
  return note.replace(/\{([^{}]+)\}/g, (m, k: string) => { if (k === "ask") return ask; const [n, f] = k.split("."); const v = f ? values?.[n]?.[f] : undefined; return v === undefined || v === null ? m : typeof v === "string" ? v : JSON.stringify(v); });
}

/** FRAMES: the page an approval asks you to judge (a design drawn by an agent), in a frame of its own with no scripts, before anything is built from it. */
export function ApprovalFrame({ run, name }: { run: string; name: string }) {
  const [html, setHtml] = React.useState<string | null | undefined>(undefined); const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    let stop = false;
    // an artifact is kept under its name and its format (`frames.html`): the node may say either
    const find = async () => { for (const n of /\.[a-z0-9]+$/i.test(name) ? [name] : [name, `${name}.html`, `${name}.svg`]) { const r: any = await getArtifact(run, n); if (r?.ok && typeof r.text === "string") return r.text as string; } return null; };
    void find().then((t) => { if (!stop) setHtml(t); }).catch(() => { if (!stop) setHtml(null); });
    return () => { stop = true; };
  }, [run, name]);
  if (html === undefined) return <div data-testid="approval-frame-wait" style={{ color: C.muted, fontSize: 12 }}>opening the design…</div>;
  if (html === null) return <div data-testid="approval-frame-missing" style={{ color: C.muted, fontSize: 12 }}>the design <span style={{ fontFamily: mono }}>{name}</span> is not written yet.</div>;
  const doc = frameDoc(html);
  const small = <iframe data-testid="approval-frame" title={`Design: ${name}`} sandbox="" srcDoc={doc} style={{ width: "100%", height: 300, border: `1px solid ${C.border}`, borderRadius: 12, background: "#fff", display: "block" }} />;
  // FULL SCREEN (the operator 2026-11-20): a glass window over the whole page, drawn on the page itself (a portal), so no card around it can hold it in
  const glass = full ? <GlassView title="Design" sub={name} onClose={() => setFull(false)}><iframe data-testid="approval-frame-big" title={`Design: ${name}`} sandbox="" srcDoc={doc} style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} /></GlassView> : null;
  return (
    <div data-testid="approval-frame-box" style={{ position: "relative" }}>
      <button data-testid="approval-frame-full" aria-label="full screen" title="Full screen" onClick={() => setFull(true)} style={{ position: "absolute", top: 8, right: 8, zIndex: 2, width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: "color-mix(in srgb, var(--c-panel2, #18181c) 85%, transparent)", color: C.fg, cursor: "pointer", fontSize: 14, lineHeight: "24px", padding: 0 }}>⤢</button>
      {small}{glass}
    </div>
  );
}
export function ApprovalCard({ gate, node, detail, approval, run, busy, error, workspace, onStash, onAnswer }: { gate: string; /** a merge gate: what in the person's workspace would stop the land, and the click that sets it aside */ workspace?: { dirty: string[]; stashed: boolean } | null; onStash?: () => void | Promise<void>; node: string; detail?: string; approval?: { risk?: string; note?: string; show?: string } | null; /** the run, so a frame (approval.show) can read its artifact */ run?: string; busy?: boolean; /** why the last answer did not go through, in the serve's words */ error?: string | null; onAnswer: (approve: boolean) => void | Promise<void> }) {
  const base = gateInfo(gate); const risk = (["low", "medium", "high"].includes(approval?.risk ?? "") ? approval!.risk : base.risk) as GateInfo["risk"]; const info: GateInfo = { ...base, risk, badge: approval?.risk ? `${approval.risk} risk` : base.badge, what: approval?.note?.trim() ? approval.note.trim() : base.what };
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return; if (e.metaKey || e.ctrlKey || e.altKey || busy) return;
      if (e.key === "a" || e.key === "A") { e.preventDefault(); void onAnswer(true); } else if (e.key === "d" || e.key === "D") { e.preventDefault(); void onAnswer(false); }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [busy, onAnswer]);
  // THE DECISION CARD (approved mockup, 2026-11-18, from AffectUI's Decision Tree; our own drawing): the question with its risk on the left, the answers as branches on the right, joined by curved lines. A number or A / D answers; nothing is answered by a timer.
  const options = [{ key: "1", hot: "A", id: "approve", approve: true, title: info.approve, sub: gate === "merge" ? "Lands on your branch now" : "The run goes on" }, { key: "2", hot: "D", id: "deny", approve: false, title: info.deny, sub: "Nothing changes; it stays parked" }];
  const box = React.useRef<HTMLDivElement>(null); const [wide, setWide] = React.useState(true);
  React.useEffect(() => { const el = box.current; if (!el || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(() => setWide(el.clientWidth >= 520)); ro.observe(el); return () => ro.disconnect(); }, []);
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return; if (e.metaKey || e.ctrlKey || e.altKey || busy) return;
      if (e.key === "1") { e.preventDefault(); void onAnswer(true); } else if (e.key === "2") { e.preventDefault(); void onAnswer(false); }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [busy, onAnswer]);
  const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  return (
    <div data-testid="needs-you" data-gate={gate} role="group" aria-label={`Approval needed at ${node}`} style={{ margin: "0 16px 10px", border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 16px", fontFamily: nav, fontSize: 13, display: "grid", gap: 12, background: tint(C.panel, 70) }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Icon name="graph" size={15} /><b style={{ fontWeight: 600 }}>Needs you</b><span style={{ color: C.muted }}>at <span style={{ fontFamily: mono }}>{node}</span></span>
      </div>
      {approval?.show && run && <ApprovalFrame run={run} name={approval.show} />}
      <div ref={box} style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 260px) 44px minmax(0, 1fr)" : "minmax(0, 1fr)", gap: wide ? 0 : 10, alignItems: "stretch" }}>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, alignSelf: "center", background: tint(C.panel2, 90) }}>
          <span data-testid="gate-risk" data-risk={info.risk} style={{ display: "inline-block", fontSize: 11, lineHeight: "20px", color: RISK[info.risk], border: `1px solid ${tint(RISK[info.risk], 45)}`, background: tint(RISK[info.risk], 10), borderRadius: 6, padding: "0 8px", marginBottom: 10 }}>{info.badge}</span>
          <div data-testid="gate-what" style={{ lineHeight: 1.45, fontWeight: 500, fontSize: 13.5 }}>{info.what}</div>
          {detail && <pre data-testid="gate-detail" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: mono, fontSize: 11.5, color: C.muted, background: tint("currentColor", 6), borderRadius: 8, padding: "6px 8px", maxHeight: 160, overflow: "auto" }}>{detail}</pre>}
        </div>
        {wide && <svg aria-hidden viewBox="0 0 44 100" preserveAspectRatio="none" style={{ width: 44, height: "100%", minHeight: 150, overflow: "visible" }}>{options.map((o, k) => { const y = ((k + 0.5) / options.length) * 100; return <path key={o.id} d={`M0 50 C22 50 22 ${y} 44 ${y}`} fill="none" stroke={C.border} strokeWidth={1} vectorEffect="non-scaling-stroke" />; })}</svg>}
        <div style={{ display: "grid", gap: 10, alignContent: "center" }}>
          {options.map((o) => (
            <button key={o.id} data-testid={o.id} disabled={busy} onClick={() => void onAnswer(o.approve)} style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr) auto", gap: 10, alignItems: "center", textAlign: "left", fontFamily: nav, color: C.fg, background: tint(C.panel2, 90), border: `1px solid ${o.approve ? RISK[info.risk] : C.border}`, borderRadius: 12, padding: "9px 12px", cursor: busy ? "default" : "pointer" }}>
              <span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 5, display: "grid", placeItems: "center", height: 18 }}>{o.key}</span>
              <span style={{ minWidth: 0 }}><span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{o.title}</span><span style={{ display: "block", fontSize: 11.5, color: C.muted }}>{o.sub}</span></span>
              <kbd style={{ fontFamily: mono, fontSize: 10.5, color: C.dim }}>{o.hot}</kbd>
            </button>
          ))}
        </div>
      </div>
      {gate === "merge" && workspace && (workspace.dirty.length > 0 || workspace.stashed) && <div data-testid="gate-workspace" style={{ display: "grid", gap: 6, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }}>
        {workspace.stashed && workspace.dirty.length === 0 ? <span style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--c-ok)" }}><Icon name="tick" size={13} />Your own changes are set aside. They come back by themselves once the merge has landed.</span>
          : <><span style={{ display: "flex", gap: 8, alignItems: "center", color: "#f5b942" }}><Icon name="hand" size={13} />Your workspace has {workspace.dirty.length} uncommitted file{workspace.dirty.length === 1 ? "" : "s"}, and the merge cannot land until they are set aside.</span>
            <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted, wordBreak: "break-all" }}>{workspace.dirty.slice(0, 6).join(", ")}{workspace.dirty.length > 6 ? `, and ${workspace.dirty.length - 6} more` : ""}</span>
            {onStash && <span><button data-testid="gate-stash" disabled={busy} onClick={() => void onStash()} style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="undo" size={12} />Set them aside for me</button> <span style={{ color: C.dim, fontSize: 11.5 }}>and put them back after the merge</span></span>}</>}
      </div>}
      {error && <div data-testid="gate-error" role="alert" style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--c-bad)", fontSize: 12.5, lineHeight: 1.45 }}><span style={{ display: "inline-flex", marginTop: 2 }}><Icon name="x" size={13} /></span><span>Not approved yet: {error}{/uncommitted/i.test(error) ? " Commit or stash the changes in your workspace, then press approve again." : ""}</span></div>}
    </div>
  );
}

/** THE ONE NOTICE FOR A DECISION (the operator 2026-11-22: "a lot of notifications stacked; should be one simple, approve or deny, and a click opens the complete notification with the node to evaluate"): a single slim card with the step's name and the two answers; the full card (risk, what happens, the design to judge) opens in a window on a click. While it is up, the other notices of the pane step aside. */
export function DecisionNotice({ title, ...card }: { title: string } & React.ComponentProps<typeof ApprovalCard>) {
  const [open, setOpen] = React.useState(false); const info = gateInfo(card.gate);
  return (
    <div className="tn-decision-chip" data-testid="decision-notice" role="group" aria-label={`Decision needed at ${title}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 30px 9px 12px", fontFamily: nav, fontSize: 12.5, color: C.fg }}>
      <button data-testid="decision-open" onClick={() => setOpen(true)} title="Open the full notification" style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Needs you · {title}</span>
        <span style={{ color: C.muted, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.badge}</span></button>
      <button data-testid="decision-approve" disabled={card.busy} onClick={() => void card.onAnswer(true)} style={{ ...btn, color: "var(--c-ok)", borderColor: "color-mix(in srgb, var(--c-ok) 50%, transparent)" }}>{info.approve}</button>
      <button data-testid="decision-deny" disabled={card.busy} onClick={() => void card.onAnswer(false)} style={btn}>{info.deny}</button>
      {open && <GlassView title="Needs you" sub={title} onClose={() => setOpen(false)}><div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "4px 0" }}><ApprovalCard {...card} /></div></GlassView>}
    </div>
  );
}
