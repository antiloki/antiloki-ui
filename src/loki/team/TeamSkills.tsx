// THE TEAM'S SKILLS, FOR THE PERSON TO READ (RFC 0008 §4.16): the Leader writes the skills a custom agent needs as DRAFTS; a skill is a playbook an agent reads, never a program, and it never gives an agent more than its own effects.
// A run does not start while a skill it uses is a draft: here the person reads each one, with what it may make an agent do in plain words, and approves it. Only a person's click approves: the Leader has no tool for it.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { approveSkill, deleteSkill, listSkills } from "./api";
import { EFFECT_WORDS } from "./NodeDrawer";
import type { Skill } from "./types";

const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "3px 10px", cursor: "pointer" };
/** How many skills wait for the person. Pure. */
export const draftsOf = (skills: Skill[]) => skills.filter((s) => s.status !== "approved");

export function TeamSkills({ team, onChanged }: { team: string; onChanged?: () => void }) {
  const [skills, setSkills] = React.useState<Skill[] | null>(null); const [open, setOpen] = React.useState<string | null>(null); const [msg, setMsg] = React.useState<string | null>(null);
  const load = React.useCallback(async () => { setSkills(await listSkills(team)); }, [team]);
  React.useEffect(() => { let stop = false; const go = async () => { const l = await listSkills(team); if (!stop) setSkills(l); }; void go(); const t = setInterval(go, 4000); return () => { stop = true; clearInterval(t); }; }, [team]);
  if (!skills || !skills.length) return <div data-testid="team-skills-empty" style={{ padding: "10px 16px", fontSize: 12.5, color: C.muted, fontFamily: nav }}>No skills yet. When the Leader builds agents that need a playbook, it writes it here for you to read.</div>;
  const drafts = draftsOf(skills).length;
  return (
    <div data-testid="team-skills" style={{ fontFamily: nav, color: C.fg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", fontSize: 12.5 }}>
        <b style={{ fontWeight: 500 }}>Skills</b><span style={{ color: C.muted }}>{drafts ? `${drafts} wait${drafts === 1 ? "s" : ""} for you: a run does not start until you have read and approved them` : "all approved"}</span>
      </div>
      {skills.map((s) => {
        const shown = open === s.name; const risky = s.effects.some((e) => e === "outward" || e === "money");
        return <div key={s.name} data-testid={`skill-${s.name}`} style={{ borderTop: `1px solid ${C.border}`, padding: "9px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button aria-expanded={shown} onClick={() => setOpen(shown ? null : s.name)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", width: 14, padding: 0 }}>{shown ? "▾" : "▸"}</button>
            <span style={{ fontFamily: mono, fontSize: 12.5 }}>{s.name}</span>
            <span data-testid={`skill-status-${s.name}`} style={{ fontSize: 11, color: s.status === "approved" ? "var(--c-ok)" : "#c9a34e", border: `1px solid ${s.status === "approved" ? "#285a45" : "#7a6430"}`, borderRadius: 10, padding: "0 8px" }}>{s.status === "approved" ? "approved" : "draft"}</span>
            <span style={{ color: C.muted, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.purpose}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {s.status !== "approved" && <button data-testid={`skill-approve-${s.name}`} style={{ ...btn, borderColor: risky ? "#7a5f3a" : C.border }} onClick={async () => { const r = await approveSkill(team, s.name); setMsg(r.ok ? `${s.name} approved` : r.error ?? "not approved"); await load(); onChanged?.(); }}>Approve</button>}
              <button data-testid={`skill-delete-${s.name}`} style={{ ...btn, border: "none", color: C.muted }} onClick={async () => { await deleteSkill(team, s.name); await load(); onChanged?.(); }}>Remove</button>
            </span>
          </div>
          {shown && <div style={{ margin: "8px 0 2px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div>{(s.effects.length ? s.effects : ["read"]).map((e) => <div key={e} style={{ fontSize: 12.5, color: e === "outward" || e === "money" ? "#c9a34e" : C.fg }}>· it makes an agent do something that {EFFECT_WORDS[e] ?? e}</div>)}</div>
            <pre data-testid={`skill-body-${s.name}`} style={{ margin: 0, background: "var(--c-bg)", border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontFamily: mono, fontSize: 11.5, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>{s.body}</pre>
          </div>}
        </div>;
      })}
      {msg && <div style={{ padding: "6px 16px", fontSize: 12, color: C.muted }}>{msg}</div>}
    </div>
  );
}
