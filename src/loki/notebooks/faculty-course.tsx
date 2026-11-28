// FACULTY COURSE — the university's third pillar (expeditions v4, operator
// 2026-07-15 round 2: "the course is about the TECHNOLOGIES of the code — use
// the real live documentation… knowledge + training, that is more didactic").
// The course is PRESSED server-side (course-press v2: module 0 minted from
// the stack itself, then one AI call grounded in docs scraped live from each
// technology's own site/blog); this file PLAYS it — knowledge pages first,
// training games after, graded locally. PressModal (also exported here) is
// the AI-transparency window every press flows through: status, model,
// tokens, price — nothing hidden.
import * as React from "react";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { C, mono, nav } from "@/loki/theme";
import { AICallChip } from "@/loki/components/AICallChip";

const RED = "oklch(0.66 0.19 25)";
const serif = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
const dline: React.CSSProperties = { fontFamily: mono, fontSize: 8.5, color: C.dim, letterSpacing: 1.2, textTransform: "uppercase" };
const gbtn = (border: string, color: string): React.CSSProperties => ({
  background: "transparent", border: `1px solid ${border}`, color, cursor: "pointer",
  fontFamily: nav, fontSize: 12, padding: "8px 12px", borderRadius: 9, textAlign: "left",
});

// ═══ THE PRESS MODAL — AI transparency (operator: "loading status, AI call
// window on click, price, number of tokens, AI used. Nothing hided.") ════════
export function PressModal({ open, title, tint, phase, note, ai, onClose }: any) {
  if (!open) return null;
  const running = phase === "pressing";
  const money = (v: any) => (v == null ? "—" : `$${Number(v).toFixed(4)}`);
  const num = (v: any) => (v == null ? "—" : String(v));
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "4px 0", borderBottom: `1px dashed ${C.border}` }}>
      <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>{k}</span>
      <span style={{ fontFamily: mono, fontSize: 10.5, color: C.fg }}>{v}</span>
    </div>
  );
  return (
    <div onClick={running ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(420px, 92vw)", background: C.panel, border: `1px solid color-mix(in oklab, ${tint} 40%, ${C.border})`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: nav, fontSize: 13.5, fontWeight: 800, color: C.fg, flex: 1 }}>{title}</span>
          {!running && <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: "3px 10px", borderRadius: 8 }}>✕</button>}
        </div>
        {running ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "6px 0 4px" }}>
            <span style={{ fontFamily: mono, fontSize: 10, color: tint }}>⚡ one AI call in flight…</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>observing (cached) → grounding → the model writes → validated → archived</span>
            <div style={{ height: 3, borderRadius: 2, overflow: "hidden", background: `color-mix(in oklab, ${C.border} 60%, transparent)` }}>
              <div style={{ height: "100%", width: "40%", borderRadius: 2, background: tint, animation: "pressSlide 1.1s ease-in-out infinite alternate" }} />
            </div>
            <style>{`@keyframes pressSlide { from { margin-left: 0; } to { margin-left: 60%; } }`}</style>
          </div>
        ) : (
          <>
            {note && <span style={{ fontFamily: nav, fontSize: 11.5, color: phase === "failed" ? RED : C.muted, lineHeight: 1.5 }}>{note}</span>}
            {ai && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {row("model", <span>{ai.model_id ?? "—"}{ai.provider ? <span style={{ color: C.dim }}> · {ai.provider}</span> : null}</span>)}
                {row("tier", ai.tier ?? "—")}
                {row("tokens", `${num(ai.tokens_in)} in · ${num(ai.tokens_out)} out`)}
                {row("price", <span style={{ color: ai.cost_usd ? C.warn : C.ok }}>{ai.cached ? "cache replay · $0" : money(ai.cost_usd)}</span>)}
                {row("duration", ai.duration_ms != null ? `${(ai.duration_ms / 1000).toFixed(1)}s` : "—")}
                {ai.ai_call_id != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "6px 0 2px" }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>the full call</span>
                    <AICallChip id={ai.ai_call_id} tier={(ai.tier as any) ?? "mid"} model={ai.model_id ?? undefined} cost={ai.cost_usd ?? undefined} durationMs={ai.duration_ms ?? undefined} />
                  </div>
                )}
              </div>
            )}
            <span style={{ fontFamily: mono, fontSize: 8, color: C.dim }}>every press is exactly one metered ai-call · nothing hidden</span>
          </>
        )}
      </div>
    </div>
  );
}

// ═══ the training games (contracts fixed server-side; graded locally) ═══════
function QuizGame({ g, tint, onDone }: any) {
  const [sel, setSel] = React.useState<number | null>(null);
  const graded = sel != null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={{ fontFamily: nav, fontSize: 13.5, color: C.fg, lineHeight: 1.4 }}>{g.q}</span>
      {g.options.map((o: string, i: number) => {
        const right = i === g.answer;
        const border = graded ? (right ? C.ok : i === sel ? RED : C.border) : C.border;
        const color = graded && right ? C.ok : graded && i === sel ? RED : C.fg;
        return (
          <button key={i} disabled={graded} onClick={() => { setSel(i); onDone(i === g.answer); }}
            style={{ ...gbtn(border, color), opacity: graded && !right && i !== sel ? 0.55 : 1 }}>
            {graded && right ? "✓ " : graded && i === sel ? "✗ " : ""}{o}
          </button>
        );
      })}
    </div>
  );
}

function TriviaGame({ g, tint, onDone }: any) {
  const [sel, setSel] = React.useState<boolean | null>(null);
  const graded = sel != null;
  const opt = (v: boolean, label: string) => {
    const right = v === g.truth;
    const border = graded ? (right ? C.ok : sel === v ? RED : C.border) : C.border;
    return (
      <button disabled={graded} onClick={() => { setSel(v); onDone(v === g.truth); }}
        style={{ ...gbtn(border, graded ? (right ? C.ok : sel === v ? RED : C.muted) : tint), flex: 1, textAlign: "center", fontFamily: mono, fontWeight: 700 }}>
        {graded && right ? "✓ " : graded && sel === v ? "✗ " : ""}{label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontFamily: nav, fontSize: 13.5, color: C.fg, lineHeight: 1.45, fontStyle: "italic" }}>“{g.statement}”</span>
      <div style={{ display: "flex", gap: 8 }}>{opt(true, "TRUE")}{opt(false, "FALSE")}</div>
    </div>
  );
}

// drag a row onto another to reorder (↑/↓ buttons as the no-mouse fallback)
function OrderGame({ g, tint, onDone }: any) {
  const solution: string[] = g.items;
  const [rows, setRows] = React.useState<string[]>(() => {
    const arr = [...solution];
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    if (arr.every((v, i) => v === solution[i]) && arr.length > 1) arr.push(arr.shift() as string);
    return arr;
  });
  const [drag, setDrag] = React.useState<number | null>(null);
  const [graded, setGraded] = React.useState(false);
  const move = (from: number, to: number) => {
    if (graded || from === to || to < 0 || to >= rows.length) return;
    setRows((r) => { const n = [...r]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });
  };
  const check = () => { setGraded(true); onDone(rows.every((v, i) => v === solution[i])); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={{ fontFamily: nav, fontSize: 13.5, color: C.fg, lineHeight: 1.4 }}>{g.prompt}</span>
      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>drag the rows into order (or use ↑ ↓), then check</span>
      {rows.map((v, i) => {
        const right = graded && v === solution[i];
        const wrong = graded && v !== solution[i];
        return (
          <div key={v} draggable={!graded}
            onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (drag != null) move(drag, i); setDrag(null); }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, background: C.bg, cursor: graded ? "default" : "grab", border: `1px solid ${right ? C.ok : wrong ? RED : C.border}` }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: C.dim, flex: "none" }}>⋮⋮ {i + 1}</span>
            <span style={{ fontFamily: nav, fontSize: 12, color: right ? C.ok : wrong ? RED : C.fg, flex: 1 }}>{v}</span>
            {!graded && (
              <span style={{ display: "flex", gap: 3, flex: "none" }}>
                <button onClick={() => move(i, i - 1)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9, borderRadius: 6, padding: "1px 7px" }}>↑</button>
                <button onClick={() => move(i, i + 1)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9, borderRadius: 6, padding: "1px 7px" }}>↓</button>
              </span>
            )}
            {graded && <span style={{ fontFamily: mono, fontSize: 11, color: right ? C.ok : RED }}>{right ? "✓" : "✗"}</span>}
          </div>
        );
      })}
      {!graded && <button onClick={check} style={{ alignSelf: "flex-start", background: tint, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700, padding: "6px 16px", borderRadius: 8 }}>check the order</button>}
    </div>
  );
}

function MatchGame({ g, tint, onDone }: any) {
  const pairs: Array<{ a: string; b: string }> = g.pairs;
  const [rights] = React.useState<string[]>(() => {
    const arr = pairs.map((p) => p.b);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  });
  const [selA, setSelA] = React.useState<string | null>(null);
  const [links, setLinks] = React.useState<Record<string, string>>({});
  const [graded, setGraded] = React.useState(false);
  const linkedB = new Set(Object.values(links));
  const complete = Object.keys(links).length === pairs.length;
  const pick = (side: "a" | "b", v: string) => {
    if (graded) return;
    if (side === "a") { setSelA(selA === v ? null : v); return; }
    if (!selA || linkedB.has(v)) return;
    setLinks((l) => ({ ...l, [selA]: v }));
    setSelA(null);
  };
  const check = () => { setGraded(true); onDone(pairs.every((p) => links[p.a] === p.b)); };
  const col = (side: "a" | "b", vals: string[]) => (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {vals.map((v) => {
        const linked = side === "a" ? links[v] != null : linkedB.has(v);
        const right = graded && (side === "a" ? pairs.find((p) => p.a === v)?.b === links[v] : pairs.some((p) => p.b === v && links[p.a] === v));
        const border = graded ? (right ? C.ok : RED) : side === "a" && selA === v ? tint : linked ? `color-mix(in oklab, ${tint} 50%, ${C.border})` : C.border;
        return (
          <button key={v} onClick={() => pick(side, v)} disabled={graded}
            style={{ ...gbtn(border, C.fg), fontSize: 11.5, opacity: !graded && side === "b" && linked ? 0.6 : 1 }}>
            {v}{side === "a" && links[v] ? <span style={{ color: C.dim, fontFamily: mono, fontSize: 9 }}> → {links[v].slice(0, 26)}</span> : ""}
          </button>
        );
      })}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontFamily: nav, fontSize: 13.5, color: C.fg, lineHeight: 1.4 }}>{g.prompt}</span>
      <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>click a left card, then its partner on the right</span>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>{col("a", pairs.map((p) => p.a))}{col("b", rights)}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {!graded && complete && <button onClick={check} style={{ background: tint, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700, padding: "6px 16px", borderRadius: 8 }}>check the pairs</button>}
        {!graded && !!Object.keys(links).length && <button onClick={() => { setLinks({}); setSelA(null); }} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9.5, padding: "6px 12px", borderRadius: 8 }}>reset</button>}
      </div>
    </div>
  );
}

const Game = ({ g, tint, onDone }: any) =>
  g.kind === "quiz" ? <QuizGame g={g} tint={tint} onDone={onDone} />
    : g.kind === "trivia" ? <TriviaGame g={g} tint={tint} onDone={onDone} />
    : g.kind === "order" ? <OrderGame g={g} tint={tint} onDone={onDone} />
    : <MatchGame g={g} tint={tint} onDone={onDone} />;

// the knowledge page — a real LECTURE (operator: "more information, it is too
// small"): multi-paragraph serif reading with a drop cap on the lead
function LessonPage({ mod, tint }: any) {
  const paras = String(mod.lesson_md ?? "").split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean);
  const [first, ...rest] = paras;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 8, color: tint, border: `1px solid color-mix(in oklab, ${tint} 40%, transparent)`, borderRadius: 999, padding: "1px 8px", textTransform: "uppercase", letterSpacing: 1 }}>{mod.tech}</span>
        <span style={{ fontFamily: mono, fontSize: 8, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 8px" }}>{mod.minted === "substrate" ? "minted by the substrate · zero AI" : "grounded in the technology's live docs"}</span>
      </div>
      <div style={{ maxWidth: "68ch" }}>
        {first && (
          <p style={{ fontFamily: serif, fontSize: 14, color: C.fg, lineHeight: 1.8, margin: "0 0 10px" }}>
            <span style={{ float: "left", fontFamily: serif, fontSize: 44, lineHeight: 0.82, paddingRight: 9, paddingTop: 5, color: tint, fontWeight: 700 }}>{first.slice(0, 1)}</span>
            {first.slice(1)}
          </p>
        )}
        {rest.map((p: string, i: number) => (
          <p key={i} style={{ fontFamily: serif, fontSize: 13.5, color: C.fg, lineHeight: 1.8, margin: "0 0 10px" }}>{p}</p>
        ))}
      </div>
    </div>
  );
}

export function CourseOverlay({ f, feeds, rivals, docs, topics, onClose }: any) {
  const tint = f.tint;
  const [data, setData] = React.useState<any | null>(null);
  const [press, setPress] = React.useState<any | null>(null); // {phase, note, ai}
  const [step, setStep] = React.useState(0);
  const [scores, setScores] = React.useState<Record<number, boolean>>({});
  // per TOPIC (operator): "" = the whole stack; default = the first stack tech
  const [selTopic, setSelTopic] = React.useState<string | null>(null);
  const activeTopic = selTopic ?? ((topics ?? [])[0] ?? "");
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const load = async () => {
    const d = unwrap(await apiPost("/api/v1/research/course/get", { faculty: f.key, ...(activeTopic ? { topic: activeTopic } : {}) }).catch(() => null));
    if (d?.ok) {
      // a course only belongs under a chip when its topic MATCHES — guards
      // against a BE still running the pre-topic skill (which ignores the
      // filter and echoes the same course for every chip)
      const matches = !activeTopic || String(d.course?.topic ?? "") === activeTopic;
      setData(matches ? d : { ...d, course: null });
      setStep(0); setScores({});
    }
  };
  React.useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [f.key, activeTopic]);
  const doPress = async (force?: boolean) => {
    if (press?.phase === "pressing") return;
    setPress({ phase: "pressing" });
    const d = unwrap(await apiPost("/api/v1/research/course/press", { faculty: f.key, feeds, rivals, desk: docs, ...(activeTopic ? { topic: activeTopic } : {}), ...(force ? { force: true } : {}) }, { timeoutMs: 240000 }).catch(() => null));
    if (d?.ok) { setPress({ phase: "done", note: `course Nº${d.course?.course_no} pressed — ${d.course?.topic ?? "the stack"} · ${d.course?.modules?.length ?? 0} modules`, ai: d.ai ?? null }); setStep(0); setScores({}); await load(); }
    else if (d?.reason === "nothing-new") setPress({ phase: "refused", note: "nothing new to teach — the observation hasn't changed since the last course on this topic (force with ⚡)" });
    else setPress({ phase: "failed", note: `press failed${d?.error ? ` — ${d.error}` : " — did the BE answer?"}` });
  };
  const course = data?.course ?? null;
  const modules: any[] = course?.modules ?? [];
  // knowledge → training: each module contributes a lesson page then its games
  const steps = React.useMemo(() => modules.flatMap((m: any, mi: number) => [
    { t: "lesson" as const, m, mi },
    ...(m.games ?? []).map((g: any, gi: number) => ({ t: "game" as const, m, mi, g, gi })),
  ]), [modules]);
  const cur = steps[step];
  const done = !!course && step >= steps.length;
  const gamesTotal = steps.filter((s) => s.t === "game").length;
  const right = Object.values(scores).filter(Boolean).length;
  const answered = cur?.t !== "game" || scores[step] !== undefined;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 320, background: `radial-gradient(1100px 420px at 50% -100px, color-mix(in oklab, ${tint} 13%, transparent), transparent), ${C.bg}`, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "13px 20px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={{ fontFamily: serif, fontSize: 16, fontWeight: 700, letterSpacing: 0.5, color: C.fg }}>🎓 {f.title} — the course</span>
        {course && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.dim }}>Nº{course.course_no} · {course.topic ?? "the whole stack"} · pressed {String(course.pressed_at ?? "").slice(0, 10)} · taught from the live docs</span>}
        <span style={{ flex: 1 }} />
        {course && <button onClick={() => void doPress(true)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "4px 11px", borderRadius: 8 }}>⚡ press a fresh course</button>}
        <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "4px 11px", borderRadius: 8 }}>esc ✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", justifyContent: "center", padding: "26px 20px 44px" }}>
        <div style={{ width: "min(660px, 94vw)", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* topic chips — one course per technology (or the whole stack) */}
          {!!(topics ?? []).length && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
              {(topics ?? []).map((t: string) => (
                <button key={t} onClick={() => setSelTopic(t)}
                  style={{ fontFamily: mono, fontSize: 9, padding: "3px 11px", borderRadius: 999, cursor: "pointer", border: `1px solid ${activeTopic === t ? tint : C.border}`, background: activeTopic === t ? `color-mix(in oklab, ${tint} 13%, transparent)` : "transparent", color: activeTopic === t ? tint : C.muted }}>{t}</button>
              ))}
              <button onClick={() => setSelTopic("")}
                style={{ fontFamily: mono, fontSize: 9, padding: "3px 11px", borderRadius: 999, cursor: "pointer", border: `1px solid ${activeTopic === "" ? tint : C.border}`, background: activeTopic === "" ? `color-mix(in oklab, ${tint} 13%, transparent)` : "transparent", color: activeTopic === "" ? tint : C.dim }}>the whole stack</button>
            </div>
          )}
          {!course ? (
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
              <span style={{ fontSize: 30 }}>🎓</span>
              <span style={{ fontFamily: nav, fontSize: 13, color: C.muted, maxWidth: 440, lineHeight: 1.5 }}>No course on <b style={{ color: tint }}>{activeTopic || "the whole stack"}</b> yet. The faculty scrapes its live docs, readme and blog, mints a warm-up itself, then one AI call writes the lectures — knowledge first, training after.</span>
              <button onClick={() => void doPress()} style={{ background: `linear-gradient(120deg, ${tint}, color-mix(in oklab, ${tint} 60%, ${C.brand}))`, border: "none", color: C.bg, cursor: "pointer", fontFamily: mono, fontSize: 11, fontWeight: 700, padding: "9px 22px", borderRadius: 10 }}>⚡ press the {activeTopic || "stack"} course</button>
            </div>
          ) : done ? (
            <div style={{ border: `1px solid color-mix(in oklab, ${tint} 45%, ${C.border})`, borderRadius: 14, padding: "36px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 30 }}>{right === gamesTotal ? "🏅" : "🎓"}</span>
              <span style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, color: C.fg }}>{right}/{gamesTotal} training games right</span>
              <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>the {f.title} faculty certifies the attempt · course Nº{course.course_no}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setStep(0); setScores({}); }} style={{ background: "transparent", border: `1px solid ${tint}`, color: tint, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "6px 14px", borderRadius: 8 }}>replay</button>
                <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "6px 14px", borderRadius: 8 }}>back to the magazine</button>
              </div>
            </div>
          ) : cur ? (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 700, color: C.fg }}>{course.title}</div>
                <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 9, flexWrap: "wrap" }}>
                  {steps.map((s, i) => (
                    <span key={i} style={{
                      width: s.t === "lesson" ? 10 : 20, height: 5, borderRadius: 3,
                      marginLeft: s.t === "lesson" && i > 0 ? 8 : 0,
                      background: s.t === "lesson"
                        ? (i <= step ? tint : C.border)
                        : scores[i] === true ? C.ok : scores[i] === false ? RED : i === step ? tint : C.border,
                    }} />
                  ))}
                </div>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 13, background: C.panel, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ ...dline, color: tint }}>
                  module {cur.mi + (modules[0]?.minted === "substrate" ? 0 : 1)} · {cur.m.tech} · {cur.t === "lesson" ? "knowledge" : `training ${cur.gi + 1}/${cur.m.games.length} · ${cur.g.kind}`}
                </span>
                {cur.t === "lesson"
                  ? <LessonPage mod={cur.m} tint={tint} />
                  : <div key={`${course.course_no}-${step}`}><Game g={cur.g} tint={tint} onDone={(ok: boolean) => setScores((s) => ({ ...s, [step]: ok }))} /></div>}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
                  style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, padding: "6px 14px", borderRadius: 8, opacity: step === 0 ? 0.4 : 1 }}>← back</button>
                <button onClick={() => setStep((s) => s + 1)}
                  style={{ background: answered ? tint : "transparent", border: `1px solid ${answered ? tint : C.border}`, color: answered ? C.bg : C.muted, cursor: "pointer", fontFamily: mono, fontSize: 10, fontWeight: 700, padding: "6px 16px", borderRadius: 8 }}>
                  {step === steps.length - 1 ? "finish" : cur.t === "lesson" ? "begin the training →" : answered ? "continue →" : "skip →"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <PressModal open={!!press} title="🎓 pressing the course" tint={tint} phase={press?.phase} note={press?.note} ai={press?.ai} onClose={() => setPress(null)} />
    </div>
  );
}
