// SKILL LIBRARY widget (operator 2026-07-25) — teachable AGENT skills: an index line (when to use),
// the full method, and executable assets. REAL skills, not prompt injection: they materialize into a
// pane's worktree as .claude/skills/<slug>/SKILL.md (Claude Code loads them natively; Codex/OpenCode
// get an AGENTS.md index) and reach the interviewer as a progressive-disclosure index.
// Sources: authored here · imported (paste a SKILL.md) · minted from THIS chat session (one ai-call).
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import type { WidgetProps } from "./types";
import { GenCard } from "./studio-kit";
import { AgentActionButton } from "./agent-action-button";
import { sayToAgent, listAgents } from "./agent-interact";

const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
type Skill = { slug: string; name: string; description: string; body_md: string; enabled: number; provenance: string; version: number; verify_cmd?: string | null; assets?: Record<string, string> };

const inp: React.CSSProperties = { background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px", fontFamily: mono, fontSize: 10.5, outline: "none", width: "100%" };
const chip: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9, color: C.muted };

// paste-import: accept the open SKILL.md format (--- name/description frontmatter + body).
function parseSkillMd(text: string): { name: string; description: string; body_md: string } | null {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text.trim());
  if (!m) return null;
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) fm[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); }
  if (!fm.name || !fm.description) return null;
  return { name: fm.name, description: fm.description, body_md: m[2].trim() };
}

export function SkillLibraryWidget({ ctx }: WidgetProps) {
  const [skills, setSkills] = React.useState<Skill[]>([]);
  const [edit, setEdit] = React.useState<Partial<Skill> | null>(null); // create/edit form (slug set = edit)
  const [importing, setImporting] = React.useState(false);
  const [importText, setImportText] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const r = unwrap(await apiPost(`/api/v1/skilllib/manage`, { op: "list" }, { timeoutMs: 15_000 }));
    if (Array.isArray(r?.skills)) setSkills(r.skills);
    else if (r?.error) setNote(`⚠ ${String(r.error).slice(0, 120)}`);
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const act = async (k: string, fn: () => Promise<any>) => {
    if (busy) return; setBusy(k); setNote(null);
    try { await fn(); await load(); } catch (e: any) { setNote(`⚠ ${String(e?.message ?? "failed").slice(0, 120)}`); }
    setBusy(null);
  };
  const save = () => act("save", async () => {
    const isEdit = !!skills.find((s) => s.slug === edit?.slug);
    const r = unwrap(await apiPost(`/api/v1/skilllib/manage`, { op: isEdit ? "update" : "add", ...edit }, { timeoutMs: 20_000 }));
    if (!r?.ok) throw new Error(r?.error ?? "save failed");
    setEdit(null);
  });
  const mint = () => act("mint", async () => {
    if (ctx?.chatSessionId == null) throw new Error("no active chat session to mint from");
    const r = unwrap(await apiPost(`/api/v1/skilllib/mint`, { session_id: ctx.chatSessionId }, { timeoutMs: 180_000 }));
    if (!r?.ok) throw new Error(r?.error ?? "mint failed");
    setNote(`◆ minted "${r.skill?.name}" as a DISABLED draft${r.cost_usd ? ` · $${Number(r.cost_usd).toFixed(4)}` : ""} — review it, then enable.`);
  });
  const doImport = () => act("import", async () => {
    const parsed = parseSkillMd(importText);
    if (!parsed) throw new Error("not a SKILL.md — needs --- frontmatter with name + description");
    const r = unwrap(await apiPost(`/api/v1/skilllib/manage`, { op: "add", ...parsed, provenance: "imported" }, { timeoutMs: 20_000 }));
    if (!r?.ok) throw new Error(r?.error ?? "import failed");
    setImporting(false); setImportText("");
  });

  const PROV: Record<string, string> = { authored: C.dim, minted: C.brand, imported: C.ok, promoted: C.warn };
  return (
    <div style={{ padding: "10px 12px", fontFamily: nav, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 8, minHeight: 220 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.brand, fontWeight: 700 }}>⚒ skill library</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{skills.length} skill{skills.length === 1 ? "" : "s"} · real files, not prompt injection</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => { setEdit({ name: "", description: "", body_md: "" }); }} style={{ ...chip, color: C.brand }}>+ new</button>
        <button onClick={() => setImporting((v) => !v)} style={chip}>⇪ import SKILL.md</button>
        <button onClick={() => void mint()} disabled={busy === "mint"} title="distill THIS chat session into a skill draft (one AI call; arrives disabled for review)" style={{ ...chip, color: C.brand }}>{busy === "mint" ? "◆ minting…" : "◆ mint from this chat"}</button>
      </div>
      {note && <div style={{ fontFamily: mono, fontSize: 9.5, color: note.startsWith("⚠") ? C.warn : C.brand }}>{note}</div>}

      {importing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"paste a SKILL.md…\n---\nname: Fixing flaky tests\ndescription: WHEN a test fails intermittently…\n---\nthe method…"} style={{ ...inp, minHeight: 90, resize: "vertical" }} />
          <button onClick={() => void doImport()} style={{ ...chip, color: C.ok, alignSelf: "flex-start" }}>import</button>
        </div>
      )}

      {edit && (
        // the skill EDIT WINDOW — opened by a card's discrete ✎ (or + new)
        <div onClick={() => setEdit(null)} style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 94vw)", maxHeight: "88vh", overflowY: "auto", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", gap: 6, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 700 }}>{edit.slug ? "edit skill" : "new skill"}</span>
            {edit.provenance && <span style={{ fontFamily: mono, fontSize: 7.5, color: PROV[edit.provenance] ?? C.dim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 4px" }}>{edit.provenance}</span>}
            {edit.version != null && <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>v{edit.version}</span>}
            <span style={{ flex: 1 }} />
            {edit.slug && <button onClick={() => void act(`r-${edit.slug}`, async () => { await apiPost(`/api/v1/skilllib/manage`, { op: "remove", slug: edit.slug }, { timeoutMs: 15_000 }); setEdit(null); })} style={{ ...chip, color: C.bad }} title="remove this skill from the library">✕ remove</button>}
            <button onClick={() => setEdit(null)} style={{ ...chip }}>close</button>
          </div>
          <input value={edit.name ?? ""} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} placeholder="name — short, imperative (e.g. Fixing flaky tests)" style={inp} />
          <input value={edit.description ?? ""} onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))} placeholder="WHEN TO USE — the one-line trigger the agent matches against" style={inp} />
          <textarea value={edit.body_md ?? ""} onChange={(e) => setEdit((s) => ({ ...s, body_md: e.target.value }))} placeholder="the METHOD — steps, heuristics, pitfalls (markdown). This loads only when the task matches." style={{ ...inp, minHeight: 110, resize: "vertical" }} />
          <input value={edit.verify_cmd ?? ""} onChange={(e) => setEdit((s) => ({ ...s, verify_cmd: e.target.value }))} placeholder="verify command (optional) — proof the skill was applied, e.g. npm test -- --grep flaky" style={inp} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => void save()} style={{ ...chip, color: C.ok }}>{busy === "save" ? "…" : "save"}</button>
            <button onClick={() => setEdit(null)} style={chip}>cancel</button>
          </div>
        </div>
        </div>
      )}

      {/* THE LIBRARY — the Studio's pretty boxes, divided by CATEGORY; clicking a card toggles it and
          the selected border animates (same design language as ⊞ Studio). */}
      {(() => {
        const cats = new Map<string, Skill[]>();
        for (const s of skills) { const c = String((s as any).applies?.category ?? "general"); if (!cats.has(c)) cats.set(c, []); cats.get(c)!.push(s); }
        return [...cats.entries()].map(([cat, list]) => (
          <div key={cat}>
            <div style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, margin: "4px 0 6px" }}>⚒ {cat} · {list.length}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 8 }}>
              {list.map((s) => (
                <div key={s.slug} style={{ position: "relative" }}>
                  <GenCard k="skill-library" label={s.name} desc={s.description} busy={busy === `t-${s.slug}`} disabled={!!busy} selected={!!s.enabled}
                    onClick={() => void act(`t-${s.slug}`, async () => { await apiPost(`/api/v1/skilllib/manage`, { op: "toggle", slug: s.slug }, { timeoutMs: 15_000 }); })} />
                  {/* ➤ teach NOW — materialize just this skill into a running agent's box + tell it */}
                  <span style={{ position: "absolute", bottom: 5, right: 6, zIndex: 3 }} onClick={(e) => e.stopPropagation()}>
                    <AgentActionButton chatSessionId={ctx?.chatSessionId} label="➤" title="teach this skill to an agent now (materialize + announce)"
                      act={async (a) => {
                        const m = unwrap(await apiPost(`/api/v1/skilllib/materialize`, { pane_id: a.id, slugs: [s.slug] }, { timeoutMs: 30_000 }));
                        if (!m?.ok) return null;
                        await sayToAgent(a.id, `New skill installed: .agents/skills/${s.slug}/SKILL.md — read it now; it applies when: ${s.description}`);
                        return `taught → #${a.id}`;
                      }} />
                  </span>
                  {/* discrete ✎ — opens the skill's edit window; never toggles the card */}
                  <button onClick={(e) => { e.stopPropagation(); setEdit(s); }} title="edit this skill"
                    style={{ position: "absolute", top: 5, right: 6, zIndex: 3, background: `color-mix(in oklab, ${C.bg} 70%, transparent)`, border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "1px 4px", borderRadius: 4, opacity: 0.55 }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.55")}>✎</button>
                </div>
              ))}
            </div>
          </div>
        ));
      })()}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {skills.length === 0 && !edit && (
          <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
            empty — start with the <button onClick={() => void act("seed", async () => { const r = unwrap(await apiPost(`/api/v1/skilllib/manage`, { op: "seed" }, { timeoutMs: 20_000 })); setNote(`◆ seeded ${r?.seeded ?? 0} antiloki skills`); })} style={{ ...chip, color: C.brand }}>⚙ antiloki pack</button> (x-ray · file review · blast radius · constitution · docs · surgical diffs · verify · test), author one (+ new), ⇪ import, or ◆ mint from this chat.
          </div>
        )}
      </div>
      <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, lineHeight: 1.5 }}>enabled skills → every agent pane's worktree (.claude/skills/* — Claude Code native; AGENTS.md index for Codex/OpenCode) on its next provision/boot, and → the chat AI's skills index (full method loads on demand).</div>
    </div>
  );
}
