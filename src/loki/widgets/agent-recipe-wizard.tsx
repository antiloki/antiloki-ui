// THE NEW-AGENT WIZARD (operator 2026-09-20: "on click add agent we will see a window wizard with all that
// to create a new agent"). Five steps in one window: who (name · icon · provider) → how it looks (theme) →
// what it may write (scope) → what it knows (specialists · skills) → create. The result is a recipe tile
// in the Studio's agents section; adding it to a thread births a pane with all of that set.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiPost } from "@/loki/api/client";
import { FileTree } from "@/loki/cockpit/cockpit-view";
import { useAtlasEntries, filesInScope } from "./scope-picker";
import { AGENT_THEMES, faceColor, type AgentThemeKey } from "@/loki/cockpit/agent-themes";
import { ChibiFace, SHAPES, PALETTE, faceIcon, parseFaceIcon, badgeOf, type Shape } from "@/loki/chat/chibi-face";
import { useSeats, offered } from "@/loki/api/seats";
import { RECIPE_PROVIDERS, MERGE_MODELS, pairProblem, isFrontierKey, mergeKeyOf, mergeLabel, sideOf, blankRecipe, recipeProblems, saveRecipe, archiveRecipe, type AgentRecipe } from "./agent-recipes";

type Specialist = { id: string; title: string; category: string; description: string; ready: boolean };
type Skill = { slug: string; name: string; description: string; enabled: number };
const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;
const STEPS = ["who", "look", "scope", "knows", "create"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = { who: "who it is", look: "how it looks", scope: "what it may write", knows: "what it knows", create: "create" };

const label: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim };
const chip = (on: boolean, color?: string): React.CSSProperties => ({ background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : color ?? C.border}`, color: on ? C.brand : color ?? C.muted, borderRadius: 7, padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 });
const input: React.CSSProperties = { background: C.panel, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontFamily: mono, fontSize: 11, outline: "none" };

/** the colours an avatar can wear: the faces' palette, then each model theme's accent — so an agent can match its models */
const FACE_COLOURS: [string, string][] = [...PALETTE.map((c) => [c, "palette"] as [string, string]), ...(["claude", "codex", "opencode", "deepseek", "kimi", "qwen"] as const).map((k) => [AGENT_THEMES[k].accent, AGENT_THEMES[k].label] as [string, string])];
/** `brief`: the three questions only (operator 2026-09-23: "let's simplify the creation of the role agents — if i
 *  click i only choose the name, purpose and scope; the rest is already configured and i can change on settings").
 *  A role arrives with its merge, its theme, its skills and its specialists already chosen by the benchmark, so
 *  walking the operator through five screens to confirm them is ceremony. The hidden steps are not removed — the
 *  agent's settings open the same wizard in full. */
export function AgentRecipeWizard({ initial, brief = false, onClose, onCreated, onArchived }: { initial?: AgentRecipe | null; brief?: boolean; onClose: () => void; onCreated: (r: AgentRecipe) => void; /** the agent left the roster — the caller refreshes and picks another */ onArchived?: (slug: string) => void }) {
  const seats = useSeats();
  const [r, setR] = React.useState<AgentRecipe>(initial ?? blankRecipe(seats?.defaultKey));
  // a new agent opens on the seat the serve plans on; the seats arrive after the first paint
  React.useEffect(() => { if (!initial && seats?.defaultKey) setR((cur) => cur.provider ? cur : { ...cur, provider: seats.defaultKey! }); }, [initial, seats?.defaultKey]);
  const seatsOn = offered(seats, r.provider);
  // the avatar in the icon (`face:<shape>:<colour>`); an emoji icon from before keeps showing as a badge
  const face: { shape: Shape; color: string } = parseFaceIcon(r.icon) ?? { shape: "egg", color: PALETTE[0] };
  const steps: readonly Step[] = brief ? (["who", "scope", "create"] as const) : STEPS;
  const [step, setStep] = React.useState<Step>("who");
  const [reg, setReg] = React.useState<Specialist[] | null>(null);
  const [lib, setLib] = React.useState<Skill[] | null>(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // ARCHIVE (operator 2026-09-23): only for an agent that exists — there is nothing to archive while creating one.
  // Two clicks, because it takes the agent off the roster and the second click is where the operator reads that it
  // is not a delete.
  const [arming, setArming] = React.useState(false);
  const archive = async () => {
    if (!initial?.slug) return;
    setBusy(true); setErr(null);
    const r = await archiveRecipe(initial.slug, true);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "could not archive it"); return; }
    onArchived?.(initial.slug);
    onClose();
  };
  const { entries, loading, tokens } = useAtlasEntries();
  const files = React.useMemo(() => filesInScope(entries, r.scope).length, [entries, r.scope]);
  React.useEffect(() => {
    let live = true;
    void apiPost(`/api/v1/dispatch`, { action_name: "system.constitution.agents", input: {} }).then((x: any) => { const d = unwrap(x); if (live) setReg(Array.isArray(d?.agents) ? d.agents.filter((a: Specialist) => a.ready) : []); }).catch(() => { if (live) setReg([]); });
    void apiPost(`/api/v1/skilllib/manage`, { op: "list" }, { timeoutMs: 15_000 }).then((x: any) => { const d = unwrap(x); if (live) setLib(Array.isArray(d?.skills) ? d.skills : []); }).catch(() => { if (live) setLib([]); });
    return () => { live = false; };
  }, []);
  const set = (patch: Partial<AgentRecipe>) => setR((cur) => ({ ...cur, ...patch }));
  const toggle = (key: "specialists" | "skills", id: string) => setR((cur) => ({ ...cur, [key]: cur[key].includes(id) ? cur[key].filter((x) => x !== id) : [...cur[key], id] }));
  const problems = recipeProblems(r);
  const idx = steps.indexOf(step);
  const create = async () => {
    if (problems.length || busy) return;
    setBusy(true); setErr(null);
    const out = await saveRecipe(r);
    setBusy(false);
    if (!out.ok || !out.recipe) { setErr(out.error ?? "could not save"); return; }
    onCreated(out.recipe);
  };
  const ql = q.trim().toLowerCase();
  const cats = ["axis", "core", "specialist", "language", "framework", "book"];
  const groups = cats.map((c) => ({ c, members: (reg ?? []).filter((a) => (a.category ?? "specialist") === c && (!ql || `${a.title} ${a.description}`.toLowerCase().includes(ql))) })).filter((g) => g.members.length);
  const provider = RECIPE_PROVIDERS.find((p) => p.key === r.provider);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="recipe-wizard" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{ width: "min(860px, 96vw)", height: "min(640px, 92vh)", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* the head: the agent as it takes shape */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: C.panel, border: `1px solid ${C.border}`, display: "grid", placeItems: "center", fontSize: 22 }}>{parseFaceIcon(r.icon) ? <ChibiFace slug={r.slug || r.name || "new"} shape={face.shape} color={face.color} mood="live" size={30} /> : r.icon}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: mono, fontSize: 13, color: C.fg, fontWeight: 700 }}>{initial ? "edit agent" : "new agent"}{r.name.trim() ? ` · ${r.name.trim()}` : ""}</div>
            <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{mergeLabel(r.pair)} · {AGENT_THEMES[r.theme as AgentThemeKey]?.label ?? r.theme} · {r.scope.length ? `${r.scope.length} glob${r.scope.length === 1 ? "" : "s"}` : "no scope yet"} · {r.specialists.length ? `${r.specialists.length} specialists` : "all specialists"} · {r.skills.length ? `${r.skills.length} skills` : "all skills"}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕</button>
        </div>
        {/* the steps */}
        <div style={{ display: "flex", gap: 4, padding: "8px 16px", borderBottom: `1px solid ${C.border}` }}>
          {steps.map((s2, i) => <button key={s2} data-testid={`recipe-step-${s2}`} onClick={() => setStep(s2)} style={{ ...chip(step === s2), display: "flex", gap: 6, alignItems: "center" }}><span style={{ opacity: 0.6 }}>{i + 1}</span>{STEP_LABEL[s2]}</button>)}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* in brief mode the rest is already decided — say so rather than leaving the operator to wonder */}
          {brief && step === "who" && (
            <div data-testid="recipe-brief-note" style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.6, border: `1px dashed ${C.border}`, borderRadius: 7, padding: "7px 10px" }}>
              the merge, the theme, the skills and the specialists come from this role's benchmark — change any of
              them later in the agent's settings
            </div>
          )}
          {step === "who" && (<>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={label}>name</span>
              <input data-testid="recipe-name" autoFocus value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Docs writer · Test fixer · Reviewer" style={input} />
              <span style={label}>what it is for (optional)</span>
              <input data-testid="recipe-description" value={r.description} onChange={(e) => set({ description: e.target.value })} placeholder="one line — shows on the tile" style={input} />
            </div>
            {/* the avatar and the merge are part of what the role already decided — hidden in brief mode, both still
                here when the agent's settings open this wizard in full */}
            {!brief && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={label}>avatar — a face and a colour to combine (operator 2026-09-23: the icons are the avatars)</span>
              <div data-testid="recipe-faces" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {SHAPES.map((sh) => { const on = face.shape === sh; return <button key={sh} data-testid={`recipe-face-${sh}`} onClick={() => set({ icon: faceIcon(sh, face.color) })} title={sh} style={{ width: 40, height: 40, display: "grid", placeItems: "center", background: on ? `color-mix(in oklab, ${C.brand} 16%, transparent)` : C.panel, border: `1px solid ${on ? C.brand : C.border}`, borderRadius: 8, cursor: "pointer" }}><ChibiFace slug={r.slug || r.name || "new"} shape={sh} color={face.color} mood={on ? "live" : "idle"} size={26} /></button>; })}
              </div>
              <div data-testid="recipe-colours" style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                {FACE_COLOURS.map(([c, name]) => { const on = face.color.toLowerCase() === c.toLowerCase(); return <button key={c} data-testid={`recipe-colour-${c.slice(1)}`} onClick={() => set({ icon: faceIcon(face.shape, c) })} title={name} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: `2px solid ${on ? C.fg : "transparent"}`, outline: on ? `1px solid ${C.brand}` : "none", cursor: "pointer" }} />; })}
                <input value={face.color} onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) set({ icon: faceIcon(face.shape, v) }); }} title="or any hex colour" style={{ ...input, width: 74, fontSize: 10.5, padding: "3px 6px" }} />
              </div>
            </div>}
            {!brief && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={label}>the merge — brain × hands</span>
              {/* THE MERGE (operator 2026-09-23): an agent is two models. The BRAIN plans, verifies and judges — it is the
                  pane you type into, so the provider follows it. The HANDS edit, look up and report. Named models, not
                  pipes: DeepSeek, Kimi and Qwen run through OpenCode, which is not a choice here. */}
              {(["brain", "hands"] as const).map((side) => { const sideOfPair = (k: "brain" | "hands") => r.pair?.[k] ?? (r.provider ? { engine: r.provider } : undefined); const cur = mergeKeyOf(sideOfPair(side)); const other = mergeKeyOf(sideOfPair(side === "brain" ? "hands" : "brain")); return (
                <div key={side} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, width: 44 }}>{side}</span>
                  {MERGE_MODELS.filter((m) => seatsOn.includes(m.engine) || cur === m.key).map((m) => { const on = cur === m.key; const barred = !on && !!pairProblem(side === "brain" ? m.key : other, side === "brain" ? other : m.key); return (
                    <button key={m.key} data-testid={`recipe-${side}-${m.key}`} data-on={on ? "1" : "0"} data-barred={barred ? "1" : undefined} disabled={barred}
                      title={barred ? `${m.label} cannot pair with ${MERGE_MODELS.find((x) => x.key === other)?.label} — two frontier models. A merge puts cheap hands under a good brain.` : m.note}
                      onClick={() => { const next = { name: "custom", brain: sideOfPair("brain") ?? sideOf(m.key), hands: sideOfPair("hands") ?? sideOf(m.key), [side]: sideOf(m.key) }; const provider = next.brain.engine; set({ pair: next, provider, theme: r.theme === "antiloki" || AGENT_THEMES[r.theme as AgentThemeKey] ? r.theme : "antiloki" }); }}
                      style={{ fontFamily: mono, fontSize: 11, padding: "4px 9px", borderRadius: 8, cursor: barred ? "not-allowed" : "pointer", opacity: barred ? .38 : 1, background: on ? `color-mix(in oklab, ${C.brand} 14%, transparent)` : "transparent", border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.brand : C.fg }}>{m.glyph} {m.label}{isFrontierKey(m.key) ? " ★" : ""}</button>
                  ); })}
                </div>
              ); })}
              <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>★ = a frontier model. Never two of them in one merge: a merge puts cheap hands under a good brain, or pairs two cheap ones.</span>
              <span data-testid="recipe-merge-label" style={{ fontFamily: mono, fontSize: 10, color: C.brand }}>{r.pair ? <>{mergeLabel(r.pair)} — {MERGE_MODELS.find((m) => m.key === mergeKeyOf(r.pair?.brain))?.label} decides, {MERGE_MODELS.find((m) => m.key === mergeKeyOf(r.pair?.hands))?.label} produces</> : "solo — no merge: the provider does both halves"}</span>
            </div>}
          </>)}
          {/* THE THEME STEP IS GONE (operator 2026-09-27: "the theme button is not required on the agent anymore, we
              will use the theme of antiloki settings"). A per-agent personality earned its place when the sidebar
              held a roster and a glance had to tell six agents apart; with one agent it only made the app disagree
              with itself. The step keeps its slot for the face, which still identifies a FORK at a glance. */}
          {step === "look" && (<>
            <span style={label}>its face — how this agent shows up in the roster and on its own pane</span>
          </>)}
          {step === "scope" && (<>
            <span style={label}>default scope — the files a pane of this agent may write (the hook refuses the rest)</span>
            {loading && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>loading the file tree…</span>}
            {!loading && entries.length === 0 && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.warn }}>no atlas for this workspace yet — type globs below</span>}
            <FileTree value={r.scope.join(", ")} onChange={(v: string) => set({ scope: v.split(",").map((x) => x.trim()).filter(Boolean) })} entries={entries} tokens={tokens} />
            <span style={{ fontFamily: mono, fontSize: 9.5, color: r.scope.length ? C.ok : C.muted }}>{r.scope.length ? `${r.scope.length} glob${r.scope.length === 1 ? "" : "s"} · ${files} file${files === 1 ? "" : "s"} writable` : "pick folders above, or type globs like packages/scheduler/**"}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={label}>first ask (optional) — typed in when a thread starts with this agent</span>
              <textarea data-testid="recipe-ask" value={r.ask} onChange={(e) => set({ ask: e.target.value })} rows={2} placeholder="e.g. Read your brief and the context pack, then list the three riskiest files in your scope." style={{ ...input, resize: "vertical" }} />
            </div>
          </>)}
          {step === "knows" && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={label}>specialists — the review lenses it may call (none ticked = all)</span>
              <span style={{ flex: 1 }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…" style={{ ...input, padding: "3px 8px", fontSize: 10, width: 160 }} />
              {r.specialists.length > 0 && <button onClick={() => set({ specialists: [] })} style={chip(false)}>all</button>}
            </div>
            {reg === null && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>loading the registry…</span>}
            {groups.map((g) => (
              <div key={g.c} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{g.c} · {g.members.length}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {g.members.map((a) => <button key={a.id} data-testid={`recipe-spec-${a.id}`} onClick={() => toggle("specialists", a.id)} title={a.description} style={chip(r.specialists.includes(a.id))}>{a.title}</button>)}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={label}>skills — materialised into its box (none ticked = the library's enabled ones)</span>
              <span style={{ flex: 1 }} />
              {r.skills.length > 0 && <button onClick={() => set({ skills: [] })} style={chip(false)}>all</button>}
            </div>
            {lib === null && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>loading the library…</span>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(lib ?? []).map((sk) => <button key={sk.slug} data-testid={`recipe-skill-${sk.slug}`} onClick={() => toggle("skills", sk.slug)} title={sk.description} style={chip(r.skills.includes(sk.slug), sk.enabled ? undefined : C.dim)}>{sk.name || sk.slug}</button>)}
              {lib && !lib.length && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>the skill library is empty — add skills in Studio › Skill library.</span>}
            </div>
          </>)}
          {step === "create" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><ChibiFace slug={r.slug || r.name || "new"} mood="live" size={44} shape={parseFaceIcon(r.icon)?.shape} color={parseFaceIcon(r.icon)?.color ?? faceColor(r.theme, r.pair?.brain.engine ?? r.provider, r.pair?.brain.model)} />{badgeOf(r.icon) && <span style={{ fontSize: 28 }}>{r.icon}</span>}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: mono, fontSize: 11, color: C.fg }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name.trim() || "—"}</span>
                  {r.description && <span style={{ color: C.muted }}>{r.description}</span>}
                  <span style={{ color: C.muted }}>{mergeLabel(r.pair)} · theme {AGENT_THEMES[r.theme as AgentThemeKey]?.label ?? r.theme}</span>
                  <span style={{ color: C.muted }}>writes: {r.scope.join(", ") || "—"}</span>
                  <span style={{ color: C.muted }}>specialists: {r.specialists.length ? r.specialists.join(", ") : "all"} · skills: {r.skills.length ? r.skills.join(", ") : "all enabled"}</span>
                  {r.ask && <span style={{ color: C.dim }}>first ask: “{r.ask.slice(0, 100)}”</span>}
                </div>
              </div>
              {problems.length > 0 && <span data-testid="recipe-problems" style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>still missing: {problems.join(" · ")}</span>}
              {err && <span style={{ fontFamily: mono, fontSize: 10, color: C.bad }}>✗ {err}</span>}
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>The agent becomes a tile in the Studio's agents. Adding it to a thread opens a pane with this provider, scope, theme, specialists and skills — every pane of it starts the same way.</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
          <button disabled={idx === 0} onClick={() => setStep(steps[idx - 1])} style={{ ...chip(false), opacity: idx === 0 ? 0.4 : 1 }}>← back</button>
          {initial?.slug && (arming
            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>off the roster — its episodes and its money stay</span>
                <button data-testid="recipe-archive-confirm" disabled={busy} onClick={() => void archive()} style={{ background: "transparent", border: `1px solid ${C.warn}`, color: C.warn, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>archive it</button>
                <button data-testid="recipe-archive-cancel" onClick={() => setArming(false)} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10 }}>keep</button>
              </span>
            : <button data-testid="recipe-archive" onClick={() => setArming(true)} title="archive this agent: it leaves the roster, and nothing it did is deleted"
                style={{ marginLeft: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>⌸ archive</button>)}
          <span style={{ flex: 1 }} />
          {step !== "create"
            ? <button data-testid="recipe-next" onClick={() => setStep(steps[idx + 1])} style={{ background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 7, padding: "5px 14px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700 }}>next →</button>
            : <button data-testid="recipe-create" disabled={busy || problems.length > 0} onClick={() => void create()} style={{ background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 7, padding: "5px 14px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700, opacity: busy || problems.length ? 0.5 : 1 }}>{busy ? "creating…" : initial ? "save agent" : "✦ create agent"}</button>}
        </div>
      </div>
    </div>
  );
}
