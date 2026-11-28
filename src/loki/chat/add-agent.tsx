// HIRING AN AGENT (operator 2026-09-23: "add a plus button on top of sidebar left, this will add agents, and roles
// will be there to choose on adding. Create a new add agent window, rethink how it is. Should be dumb simple. Name,
// purpose, scope and role (preset template) that carries already the specialities and skills and model merge").
//
// The old way was a five-step wizard that walked you through the merge, the avatar, the specialists and the skills —
// four screens of decisions the benchmark has already made better than a person can. This asks the three things only
// the operator knows, and one that decides everything else:
//
//   name      what you will call it
//   purpose   what it is for, one line — it also picks the role when you have not
//   role      the TEMPLATE: its scope, its skills, its specialists and the merge measured on its domain
//   scope     the role's globs, yours to narrow
//
// and one dial with three positions — cheaper · faster · best — which is the same measured rows asked a different
// question. Everything else the agent carries comes from the role, and every one of them is editable afterwards in
// the agent's settings, which still open the full wizard.
import React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { ChibiFace } from "./chibi-face";
import { OBJECTIVES, OBJECTIVE_ABOUT, adapterLine, byFamily, fetchRoles, soloChoices, NO_PROVIDERS, type Objective, type Providers, type RoleWithMerges } from "./roles";
import { sideName } from "./jobs";
import { FileTree } from "@/loki/cockpit/cockpit-view";
import { useAtlasEntries, filesInScope } from "@/loki/widgets/scope-picker";

export const OBJ_TINT: Record<string, string> = { cheaper: "#3fb26f", faster: "#4aa6e0", best: "#e0a04a" };

/** the merge a role would use for an objective, in words, or null when its domain has nothing measured. Pure. */
export function mergeFor(role: RoleWithMerges | null, o: Objective, name: (k: string) => string): string | null {
  const m = role?.merges?.find((x) => x.objective === o);
  if (!m || (!m.brain && !m.hands)) return null;
  const brain = m.brain ? name(m.brain) : "the job's model";
  const hands = m.hands ? name(m.hands) : "the job's model";
  return `${brain} × ${hands}`;
}
/** what the form still needs before it can hire. Pure — tested. */
export function missing(draft: { name: string; role: string; scope: string[] }): string[] {
  const out: string[] = [];
  if (!draft.name.trim()) out.push("a name");
  if (!draft.role) out.push("a role");
  if (!draft.scope.length) out.push("a scope — the files it may write");
  return out;
}

export type AgentDraft = { name: string; purpose: string; role: string; scope: string[]; objective: Objective;
  /** set instead of an objective when the machine cannot merge, or when the operator wants one model */ solo?: string;
  /** A BOX OF ITS OWN (2026-09-24): "own" = a worktree of its own and a branch per episode; "" = the workspace */
  box?: "own" | "" };
export const STEPS = ["who", "scope"] as const;
export type Step = (typeof STEPS)[number];

/** Can this role be hired for this objective on this machine? An unmeasured merge is still hireable — the router
 *  binds per job — but one whose engines are not installed is not. Pure — tested. */
export function objectiveOpen(role: RoleWithMerges | null, o: Objective, p: Providers): boolean {
  const m = role?.merges?.find((x) => x.objective === o);
  if (!m || (!m.brain && !m.hands)) return p.can_merge;   // nothing measured: only if a merge could be bound at all
  return m.runnable !== false;
}

export function AddAgent({ onClose, onCreate, onNewRole, busy, error }: {
  onClose: () => void;
  onCreate: (d: AgentDraft, role: RoleWithMerges) => void;
  /** the second door: a role that does not exist yet */
  onNewRole?: () => void;
  busy?: boolean; error?: string | null;
}) {
  const [roles, setRoles] = React.useState<RoleWithMerges[]>([]);
  const [providers, setProviders] = React.useState<Providers>(NO_PROVIDERS);
  const [step, setStep] = React.useState<Step>("who");
  const [d, setD] = React.useState<AgentDraft>({ name: "", purpose: "", role: "", scope: [], objective: "best", box: "own" });
  const [scopeText, setScopeText] = React.useState("");
  const { entries, tokens, loading: scopeLoading } = useAtlasEntries();
  React.useEffect(() => { void fetchRoles().then((r) => { setRoles(r.roles); setProviders(r.providers); }); }, []);
  const role = roles.find((r) => r.key === d.role) ?? null;
  const solos = soloChoices(providers);
  const files = React.useMemo(() => (d.scope.length ? filesInScope(entries, d.scope).length : 0), [entries, d.scope]);

  // picking a role fills everything the role decides; the name follows only while the operator has not typed one
  const pick = (r: RoleWithMerges) => {
    setD((cur) => ({ ...cur, role: r.key, name: cur.name.trim() ? cur.name : r.name, scope: [...r.globs] }));
    setScopeText(r.globs.join(", "));
  };
  const setScope = (text: string) => { setScopeText(text); setD((cur) => ({ ...cur, scope: text.split(",").map((x) => x.trim()).filter(Boolean) })); };
  const gaps = missing(d);
  const label: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim };
  const field: React.CSSProperties = { fontFamily: mono, fontSize: 11.5, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 9px", width: "100%" };

  // the sidebar that opens this is inside an animated, transformed container, and a transformed ancestor becomes
  // the containing block for `position: fixed` — without the portal the window is "centred" on the sidebar
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="add-agent" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{ width: "min(720px, 94vw)", maxHeight: "90vh", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "13px 18px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: nav, fontSize: 14.5, color: C.fg, fontWeight: 700 }}>New agent</span>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>the role brings its skills, its specialists and its merge</span>
          <span style={{ flex: 1 }} />
          <button data-testid="add-agent-close" onClick={onClose} title="close (Esc)" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {step === "who" && (<>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={label}>name</span>
              <input data-testid="add-agent-name" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="what you will call it" style={field} />
            </span>
            <span style={{ flex: 2, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={label}>purpose</span>
              <input data-testid="add-agent-purpose" value={d.purpose} onChange={(e) => setD({ ...d, purpose: e.target.value })} placeholder="what it is for, in one line" style={field} />
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={label}>role — the template it is hired as</span>
              <span style={{ flex: 1 }} />
              {onNewRole && <button data-testid="add-agent-new-role" onClick={onNewRole} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.brand, borderRadius: 6, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>＋ new role</button>}
            </span>
            <div data-testid="add-agent-roles" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 5 }}>
              {byFamily(roles).flatMap(({ parent, under }) => [parent, ...under]).map((r) => { const on = d.role === r.key; return (
                <button key={r.key} data-testid={`add-agent-role-${r.key}`} data-on={on ? "1" : "0"} onClick={() => pick(r)} title={`${r.about} — ${adapterLine(r)}`}
                  style={{ display: "flex", alignItems: "center", gap: 7, textAlign: "left", minWidth: 0, background: on ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : C.border}`, borderRadius: 8, padding: "6px 8px", cursor: "pointer" }}>
                  <ChibiFace slug={`role-${r.key}`} mood={on ? "live" : "idle"} size={22} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: nav, fontSize: 11.5, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                    <span style={{ display: "block", fontFamily: mono, fontSize: 9, color: C.dim }}>{r.domain}</span>
                  </span>
                </button>
              ); })}
              {!roles.length && <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>reading the roles…</span>}
            </div>
          </div>

          {/* WHAT THE ROLE BRINGS — shown, not asked */}
          {role && (
            <div data-testid="add-agent-brings" style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
              <span style={label}>it also comes with</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>{adapterLine(role)}</span>
            </div>
          )}
          </>)}

          {step === "scope" && (<>
          {/* THE SCOPE, PROPERLY (operator 2026-09-23: "the scope on add agent should be the select scope box with
              all x-ray chips as we have in settings, should be a second step"). Typing globs is fine when you know
              them; picking folders out of the codebase is how you know them. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={label}>scope — the files it may write{role ? " · the role's, yours to narrow" : ""}</span>
            <FileTree value={scopeText} onChange={setScope} entries={entries} tokens={tokens} />
            <span data-testid="add-agent-scope-count" style={{ fontFamily: mono, fontSize: 9.5, color: d.scope.length ? C.ok : C.muted }}>
              {scopeLoading ? "reading the codebase…" : d.scope.length ? `${d.scope.length} glob${d.scope.length === 1 ? "" : "s"} · ${files} file${files === 1 ? "" : "s"} writable` : "pick folders above, or type globs like src/api/**"}
            </span>
            <input data-testid="add-agent-scope" value={scopeText} onChange={(e) => setScope(e.target.value)} placeholder="src/**, docs/**" style={{ ...field, fontSize: 10.5 }} />
          </div>

          {/* WHERE IT WORKS — NOT A QUESTION (operator 2026-09-25: "I thought we decide for one path not
              optionals paths. Worktree were suppose to be for agents. Each one with its worktrees. And episodes
              be branches on those worktrees. Whats the problem than? dont make a choice optional about this").
              This was two buttons, defaulting to writing straight into the workspace, and the reason given for
              that default was that the live preview only showed changes made where you are working. That was
              the tail wagging the dog: the preview resolves a pane_id to that pane's worktree and always could,
              so the agent's own ▶ preview boots its box. With the reason gone the choice is gone — every agent
              gets a worktree, every episode is a branch in it, and closing an episode merges it back. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={label}>where it works</span>
            <span data-testid="add-agent-box" style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>
              its own git worktree — a branch per episode, merged back when the episode closes. Its ▶ preview
              runs in that box, so you watch its work without it touching yours.
            </span>
          </div>

          {/* THE DIAL — the same measured rows, three questions, and only the ones this machine can bind */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>which merge — the benchmark decides, you choose what it optimises for</span>
            <div style={{ display: "flex", gap: 6 }}>
              {OBJECTIVES.map((o) => { const on = d.objective === o && !d.solo; const m = mergeFor(role, o, sideName); const open = objectiveOpen(role, o, providers); return (
                <button key={o} data-testid={`add-agent-objective-${o}`} data-on={on ? "1" : "0"} data-open={open ? "1" : "0"} disabled={!open}
                  onClick={() => setD({ ...d, objective: o, solo: undefined })} title={open ? OBJECTIVE_ABOUT[o] : providers.why || "the models this merge needs are not installed here"}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", opacity: open ? 1 : .45, cursor: open ? "pointer" : "not-allowed", background: on ? `color-mix(in oklab, ${OBJ_TINT[o]} 14%, transparent)` : "transparent", borderTop: `1px solid ${on ? OBJ_TINT[o] : C.border}`, borderRight: `1px solid ${on ? OBJ_TINT[o] : C.border}`, borderBottom: `1px solid ${on ? OBJ_TINT[o] : C.border}`, borderLeft: `2px solid ${OBJ_TINT[o]}`, borderRadius: 7, padding: "6px 9px" }}>
                  <span style={{ display: "block", fontFamily: mono, fontSize: 10, color: OBJ_TINT[o], textTransform: "uppercase", letterSpacing: .8 }}>{o}</span>
                  <span style={{ display: "block", fontFamily: mono, fontSize: 9.5, color: m ? C.fg : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{!open ? "not installed here" : m ?? "nothing measured — the router binds per job"}</span>
                </button>
              ); })}
            </div>
            {/* ONE MODEL, WHEN THAT IS WHAT THERE IS (2026-09-23: "any way we can use solo AIs too") */}
            {solos.length > 0 && (
              <div data-testid="add-agent-solos" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ ...label, minWidth: 0 }}>{providers.can_merge ? "or one model, doing both halves" : providers.why || "one model, doing both halves"}</span>
                {solos.map((sl) => { const on = d.solo === sl.key; return (
                  <button key={sl.key} data-testid={`add-agent-solo-${sl.key}`} data-on={on ? "1" : "0"} onClick={() => setD({ ...d, solo: on ? undefined : sl.key })}
                    title={`${sl.label} alone — no merge, no second model`}
                    style={{ background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.brand : C.muted, borderRadius: 999, padding: "1px 9px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>{sl.label}</button>
                ); })}
              </div>
            )}
          </div>
          </>)}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderTop: `1px solid ${C.border}` }}>
          {step === "scope" && <button data-testid="add-agent-back" onClick={() => setStep("who")} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 11px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>← back</button>}
          {error && <span data-testid="add-agent-error" style={{ fontFamily: mono, fontSize: 10, color: C.bad }}>{error}</span>}
          {!error && gaps.length > 0 && <span data-testid="add-agent-missing" style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>still needs {gaps.join(" · ")}</span>}
          <span style={{ flex: 1 }} />
          {step === "who"
            ? <button data-testid="add-agent-next" disabled={!role} onClick={() => setStep("scope")}
                style={{ background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 7, padding: "6px 16px", cursor: role ? "pointer" : "default", fontFamily: mono, fontSize: 11, fontWeight: 700, opacity: role ? 1 : .5 }}>scope →</button>
            : <button data-testid="add-agent-create" disabled={!!busy || gaps.length > 0 || !role} onClick={() => role && onCreate(d, role)}
                style={{ background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 7, padding: "6px 16px", cursor: gaps.length || busy ? "default" : "pointer", fontFamily: mono, fontSize: 11, fontWeight: 700, opacity: busy || gaps.length ? .5 : 1 }}>
                {busy ? "hiring…" : "✦ hire"}
              </button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
