// THE ROLE CARD (operator 2026-09-23: "under the role 3 options: Smarter, Cheaper and Best — each one is a winner in
// a circumstance"). A role is what a person hires, so its card shows what it IS rather than which stage of a run it
// covers: the domain it works in, the whole adapter it carries — skills, specialists, tools, packs — and the three
// merges measured on its kind of work, one per objective, with the samples behind each so the operator can see how
// much to trust it. Picking an objective is what creates the agent.
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { ChibiFace } from "./chibi-face";
import { sideName } from "./jobs";
import { adapterLine, mergeLine, type Objective, type RoleAdapter, type RoleMerge } from "./roles";

const PANE_NAME: Record<string, string> = {
  "design-frames": "Frames", "design-view:system": "Design system", "design-view:components": "Components",
  "atlas-graph": "Code graph", "atlas-xray": "X-ray", "atlas-constitution": "Constitution", "atlas-code": "Code",
  "atlas-diagram": "System design", "atlas-git": "Git graph", diff: "Diff / review", run: "Run", terminal: "Terminal",
  intent: "Brainstorm", context: "Context", design: "Design canvas", "vibe-todo": "Issues", "vibe-kanban": "Issues", "vibe-issues": "Issues",
};
export const paneName = (k: string) => PANE_NAME[k] ?? k.replace(/^(atlas|design|vibe)-/, "").replace(/-/g, " ");
/** a specialist id as a person reads it: `correctness:errors` → "correctness · errors". Pure. */
export const specialistName = (id: string) => id.replace(":", " · ");
/** a skill slug without the product prefix it all shares. Pure. */
export const skillName = (slug: string) => slug.replace(/^antiloki-/, "");

const OBJ_ORDER: Objective[] = ["cheaper", "faster", "best"];
const OBJ_TINT: Record<Objective, string> = { cheaper: "#3fb26f", faster: "#4aa6e0", best: "#e0a04a", smarter: "#7c5cf0" };

export function RoleCard({ role, onPick, busy }: {
  role: RoleAdapter & { merges?: RoleMerge[] };
  /** create the agent with this objective's merge */
  onPick?: (objective: Objective) => void;
  busy?: boolean;
}) {
  const merges = role.merges ?? [];
  const dt: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim };
  const chip = (text: string, title?: string) => (
    <span key={text} title={title} style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>{text}</span>
  );
  return (
    <div data-testid="role-card" data-role={role.key} style={{ display: "flex", flexDirection: "column", gap: 13, padding: "16px 18px", fontFamily: mono }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span aria-hidden style={{ width: 38, height: 38, flex: "0 0 38px" }}>
          <ChibiFace slug={`role-${role.key}`} mood="live" size={38} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontFamily: nav, fontSize: 15.5, color: C.fg, fontWeight: 700 }}>{role.name}</span>
            <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: .6, textTransform: "uppercase", color: C.muted }}>{role.domain}</span>
            {!role.general && role.under && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>under {role.under}</span>}
          </span>
          <span style={{ display: "block", fontFamily: mono, fontSize: 10, color: C.muted, marginTop: 2 }}>{role.about}</span>
        </span>
      </div>

      {/* THE THREE — the same role, three circumstances */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={dt}>three merges, measured on {role.domain} work — pick the circumstance</span>
        {OBJ_ORDER.map((o) => {
          const m = merges.find((x) => x.objective === o);
          const measured = !!(m && (m.brain || m.hands));
          return (
            <button key={o} data-testid={`role-objective-${o}`} disabled={busy || !measured} onClick={() => onPick?.(o)}
              title={measured ? `create ${role.name} with the ${o} merge` : "nothing measured for this role's domain yet — it falls back to the shared pool"}
              style={{ display: "flex", alignItems: "baseline", gap: 10, textAlign: "left", width: "100%",
                background: "transparent", border: `1px solid ${measured ? C.border : "transparent"}`, borderLeft: `2px solid ${OBJ_TINT[o]}`,
                borderRadius: 7, padding: "7px 10px", cursor: measured && !busy ? "pointer" : "default", opacity: measured ? 1 : .5 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: OBJ_TINT[o], textTransform: "uppercase", letterSpacing: .8, minWidth: 58 }}>{o}</span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: mono, fontSize: 10.5, color: C.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {mergeLine(m, sideName)}
              </span>
            </button>
          );
        })}
      </div>

      {/* THE ADAPTER — the operator's own point: it is not only the models */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
        <span style={dt}>the adapter — not only the models: what it knows, who it asks, what it drives</span>
        {[["skills", role.skills.map(skillName)], ["specialists", role.specialists.map(specialistName)],
          ["tools", role.panes.map(paneName)], ["reads", role.packs]].map(([label, xs]) => (
          <span key={label as string} style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ ...dt, minWidth: 66 }}>{label as string}</span>
            {(xs as string[]).length ? (xs as string[]).map((x) => chip(x)) : <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>—</span>}
          </span>
        ))}
        <span style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ ...dt, minWidth: 66 }}>writes</span>
          {role.globs.slice(0, 4).map((g) => chip(g))}
          {role.globs.length > 4 && chip(`+${role.globs.length - 4}`)}
        </span>
      </div>
      <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.5 }}>
        A role is not a job. Every job of a run still happens inside it — planning, editing, verifying, judging — and the
        merge above is the one that won them on {role.domain} work. {adapterLine(role)}.
      </span>
    </div>
  );
}
