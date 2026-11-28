// A SKILL AS A SUPPORT NODE'S DETAIL (the operator 2026-11-18: "skills suggested are approved by the Leader by default, removable from the pane, shown as a support node"): what the skill is for, what it lets an agent do in plain words, its playbook; Remove takes it out of the team,
// and a skill that is still a draft (written before the Leader approved its own) is approved here by the person.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { approveSkill, deleteSkill } from "./api";
import { EFFECT_WORDS } from "./NodeDrawer";
import type { Skill } from "./types";

const btn: React.CSSProperties = { fontFamily: nav, fontSize: 12, background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 8, padding: "4px 12px", cursor: "pointer" };
export function SkillPanel({ team, skill, onClose, onChanged }: { team: string; skill: Skill; onClose: () => void; onChanged: () => void }) {
  const [msg, setMsg] = React.useState<string | null>(null); const draft = skill.status !== "approved";
  return (
    <div data-testid="skill-panel" style={{ margin: "10px 16px", border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", fontFamily: nav, color: C.fg, background: "var(--c-panel2, var(--c-panel))" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontFamily: mono, fontSize: 13 }}>{skill.name}</b><span style={{ fontSize: 11, border: `1px solid color-mix(in srgb, ${draft ? "#f5a524" : "#3ecf8e"} 45%, transparent)`, color: draft ? "#f5a524" : "#3ecf8e", borderRadius: 999, padding: "0 8px" }}>{draft ? "draft" : "approved by the Leader"}</span>
        <span style={{ flex: 1 }} />
        {draft && <button data-testid="skill-approve" style={btn} onClick={async () => { const r = await approveSkill(team, skill.name); setMsg(r.ok ? "approved" : r.error ?? "not approved"); onChanged(); }}>Approve</button>}
        <button data-testid="skill-remove" style={btn} onClick={async () => { await deleteSkill(team, skill.name); onChanged(); onClose(); }}>Remove</button>
        <button data-testid="skill-close" aria-label="close" style={{ ...btn, border: "none", color: C.muted }} onClick={onClose}>✕</button>
      </div>
      <div style={{ color: C.muted, fontSize: 12.5, margin: "6px 0" }}>{skill.purpose}</div>
      <div style={{ marginBottom: 6 }}>{(skill.effects.length ? skill.effects : ["read"]).map((e) => <div key={e} style={{ fontSize: 12.5, color: e === "outward" || e === "money" ? "#c9a34e" : C.fg }}>· it makes an agent do something that {EFFECT_WORDS[e] ?? e}</div>)}</div>
      <pre data-testid="skill-playbook" style={{ margin: 0, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontFamily: mono, fontSize: 11.5, whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto" }}>{skill.body}</pre>
      {msg && <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}
