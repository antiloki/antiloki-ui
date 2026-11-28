// THE AGENTS TAB (operator 2026-09-22: "transform the chats tab into agents tab — all custom agents created under
// Studio be on there, using the episode architecture we have on the chats, but under each agent has its episodes,
// same logic, same design, inside a custom agent"). The sidebar is a ROSTER: antiChat first (the chat pane exactly
// as it is), then one row per Studio recipe of this workspace — a face, a name, the pair it runs as, a status line
// from its runs ("needs a yes on …", "working — 3 of 8 on …"), what Heimdall saved under the name. Picking a row shows
// that agent's pane on the stage; an agent's pane is made on first open (POST cockpit/agents/open) in the workspace,
// and its episodes list under the row like a chat's. Nothing new below: the roster is chats-as-panes, one level down.
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiGet, apiPost, isNotWired } from "@/loki/api/client";
import { apiPostStrict, reasonOf } from "@/loki/api/post-strict";
import { usePoll } from "@/loki/api/hooks";
import { CockpitPaneBody } from "@/loki/widgets/cockpit-pane-body";
import { AgentCloseDialog } from "@/loki/widgets/agent-close";
import { Slide, Renamable } from "./widget-dock";
import { ago } from "./chats-tab";
import { devOnly } from "@/loki/dev-only";
import { AddAgent, type AgentDraft } from "./add-agent";
import { Bubble } from "./chat-thread";
import { agentTheme } from "@/loki/cockpit/agent-themes";
import { Markdown } from "@/loki/components/Markdown";
import type { RoleWithMerges } from "./roles";
import { ChibiFace, parseFaceIcon, badgeOf, agentColor, assignAgentColors, assignForkColors, type Mood } from "./chibi-face";
import { faceColor } from "@/loki/cockpit/agent-themes";
import { fetchSeats } from "@/loki/api/seats";
import { ENGINE_KEYS } from "@/loki/api/engine";
import { saveRecipe, listRecipes, blankRecipe, MERGE_MODELS, type AgentRecipe, type RecipePair, type RecipeSide } from "@/loki/widgets/agent-recipes";

export type AgentRow = { slug: string; name: string; icon: string; provider: string; theme?: string; description?: string;
  /** what it was hired as, and which of the three its merge was chosen for (2026-09-23) */ role?: string; objective?: string;
  /** the rest of what it carries — the sidebar shows the role, the settings show these */ skills?: string[]; specialists?: string[]; scope?: string[];
  /** THE MAIN AGENT (2026-09-24, bug 9): read-only, the whole workspace, nothing to configure */ main?: boolean; readonly?: boolean;
  pane_id: number; engine: string; pair: string; status: string; tone: "needs" | "working" | "live" | "idle"; saved: number; saved_est: number; episodes: { n: number; title: string; subtitle?: string; turns: number; last_t?: number }[]; live: boolean; runs: number };
export function useRoster(enabled = true) {
  return usePoll<{ agents: AgentRow[]; workspace: string }>(() => apiGet<{ agents: AgentRow[]; workspace: string }>("/api/v1/cockpit/agents/roster"), 5_000, enabled, { fetchKey: "agents-roster" });
}
/** A SOLO CHOICE AS A SIDE (2026-09-23): the provider key the serve reports as available — "claude-code", "codex",
 *  "deepseek", "kimi", "qwen" — becomes the engine and model that one model runs as. Pure — tested. */
export function soloSide(key: string): RecipeSide | null {
  if ((ENGINE_KEYS as readonly string[]).includes(key) && key !== "opencode") return { engine: key as RecipeSide["engine"] };   // every seat, not three (review 2026-10-01)
  const m = MERGE_MODELS.find((x) => x.key === key);
  return m ? { engine: m.engine, ...(m.model ? { model: m.model } : {}) } : null;
}

/** A ROLE KEY AS A PERSON READS IT: "backend-database" → "Backend database". Every agent has one — the serve fills
 *  it in from the purpose for anything made before the field existed. Pure — tested. */
/** The line under an agent's name. Main is not an agent with a missing role — it is the one that was never hired
 *  for a job, and "no role" reads as a configuration someone forgot. Pure — tested. */
export function subLine(a: { main?: boolean; readonly?: boolean; role?: string }): string {
  // MAIN IS NOT READ-ONLY (operator 2026-09-28: "first is not suppose to be read-only, we dont have this
  // anymore"). This returned "read-only · the whole workspace" for anything flagged `main`, whatever its actual
  // permission — so the one agent that can edit every file in the repo was labelled as the one that can edit
  // none. Read-only is now only what the pane actually says it is, and main's line says what main IS.
  if (a.readonly) return "read-only · the whole workspace";
  if (a.main) return "the whole workspace";
  return roleName(a.role);
}
export function roleName(key: string | null | undefined): string {
  const k = String(key ?? "").trim();
  if (!k) return "no role";
  const words = k.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
/** THE BASE MODELS OF A MERGE, discreetly (2026-09-23: "and the base agents of the merge discretely"): "Claude ×
 *  DeepSeek" from the row's pair label, with the per-side model names dropped — the row says what it is made of,
 *  not which checkpoint. Empty for a solo agent, which has nothing to say here. Pure — tested. */
export function baseModels(pair: string | null | undefined): string {
  const p = String(pair ?? "").trim();
  if (!p || p === "solo") return "";
  const sides = p.split("×").map((t) => t.split("·")[0].trim()).filter(Boolean);
  return sides.length === 2 && sides[0] !== sides[1] ? `${sides[0]} × ${sides[1]}` : sides[0] ?? "";
}

/** the money under the face: the arithmetic saving, or MIN's estimate with a tilde — never both added. Pure. */
export function savedTag(a: { saved: number; saved_est: number }): string {
  if (a.saved > 0) return `$${a.saved.toFixed(2)}`;
  if (a.saved_est > 0) return `~$${a.saved_est.toFixed(2)}`;
  return "";
}
const TONE: Record<AgentRow["tone"], string> = { needs: "#e0a04a", working: "#d08b5a", live: "#3fb26f", idle: "#8a8a90" };

/** JOB WINNERS (operator 2026-09-23: "a subcategory — winners for jobs: the first-place merge for each job, with the
 *  mini job name on the bottom right like a stamp"). From the Benchmarks table: per job, the best-weighted combination
 *  across sizes. A job nobody has measured still gets its row — dim, stamped, waiting for the bench. One click makes
 *  the winner an agent: a recipe with that pair, named after it. Pure selection — tested. */
import { JOB_ORDER, jobCode, mergeName, jobNote, compositionName, sideName } from "./jobs";
export { JOB_ORDER };
/** `domain` is the KIND OF WORK a row was measured on (roles::domain_of over the paths the runs touched: frontend ·
 *  backend · tests · infra · mixed · any) — the technology axis the plan asked to surface. It has always ridden on the
 *  wire from merges::table(); this type simply dropped it, which is why no surface could say where a number came from. */
export type MergeRowLite = { job: string; size: string; domain?: string; planner: string; worker: string; qa: string; n: number; audit: number | null; s: number; usd: number; weight: number; source: string };
export function sideFromKey(k: string): RecipeSide | null {
  if (!k || k === "-" || k === "raw") return null;
  const [engine, ...rest] = k.split(":"); const model = rest.join(":");
  // a Gemini, Grok or Cursor side of a measured merge used to read as no side at all (review 2026-10-01)
  if (!(ENGINE_KEYS as readonly string[]).includes(engine)) return null;
  const eng = engine as RecipeSide["engine"];
  return model && model !== "default" && !(eng === "claude-code" && ["haiku", "sonnet", "opus"].includes(model)) ? { engine: eng, model } : (eng === "claude-code" ? { engine: eng, model } : { engine: eng });
}
/** THE FIRST PLACE OF EACH JOB: the best sized row (s · l · xxl); a job the benches never sized falls back to its
 *  audited calls (size "call" — every use the serve audited, ok/failed · ms · $), so a winner has data behind it or
 *  says "no winner yet". Pure — tested. */
export function jobWinners(rows: MergeRowLite[]): { job: string; row: MergeRowLite | null }[] {
  const best = (rs: MergeRowLite[]) => { const m = [...rs]; m.sort((a, b) => b.weight - a.weight || b.n - a.n); return m[0] ?? null; };
  return JOB_ORDER.map((job) => {
    const sized = best(rows.filter((r) => r.job === job && r.size !== "call"));
    return { job, row: sized ?? best(rows.filter((r) => r.job === job && r.size === "call" && r.n >= 2)) };
  });
}
/** the size word of a winner row — "audited calls" for a call-sized one. Pure. */
export function sizeWord(size: string): string { return size === "call" ? "audited calls" : size; }
/** The composition of a measured row — the provider AND the model on each side (jobs.ts `sideName`). */
export function winnerLabel(r: MergeRowLite): string { return compositionName(r.planner, r.worker); }
/** THE JOB, IN WORDS, NOT ON THE FACE (operator 2026-09-23: "take out the stamps, they are ugly"). The winner's job
 *  belongs in the line under the name, where it can be read — the avatar stays a face. */
export function WinnerStamp({ job }: { job: string }) {
  return <span data-testid={`stamp-${job}`} title={job} style={{ fontFamily: mono, fontSize: 9, letterSpacing: .6, textTransform: "uppercase", color: "#e0a04a" }}>{jobCode(job)}</span>;
}
/** MAKE A WINNER AN AGENT: a recipe named "<merge> · <job>" with the winner's pair, ★ for its icon, the whole workspace as
 *  its scope. Throws when the winner is a raw session (nothing to merge). Shared by the roster and the Studio's Merged
 *  Winners category. */
export async function makeWinnerRecipe(job: string, r: MergeRowLite): Promise<AgentRecipe> {
  const brain = sideFromKey(r.planner) ?? sideFromKey(r.worker); const hands = sideFromKey(r.worker) ?? brain;
  if (!brain || !hands) throw new Error("this winner is a raw session — nothing to merge");
  const pair: RecipePair = { name: "winner", brain, hands };
  const label = winnerLabel(r);
  const res = await saveRecipe({ slug: "", name: mergeName(job, r.planner, r.worker), icon: "★", provider: brain.engine, theme: "", description: `The ${job} winner of the benchmarks: ${label} — ${r.audit != null ? `${Math.round(r.audit * 100)}% audit · ` : ""}${r.s} s · $${r.usd.toFixed(r.usd < 0.1 ? 3 : 2)} per run. Made from Agents › job winners.`, scope: ["**"], specialists: [], skills: [], ask: "", pair } as any);
  if (!res?.ok || !res.recipe?.slug) throw new Error(res?.error ?? "could not make the agent");
  return res.recipe as AgentRecipe;
}
/** The job a recipe won, when it was made from a job winner (★ and the description says so) — the Studio lists these under Merged Winners, not agents. Pure. */
export function winnerJobOf(rc: { icon: string; description?: string }): string | null {
  const m = /^The ([a-z-]+) winner of the benchmarks/.exec(rc.description ?? "");
  return rc.icon === "★" && m && (JOB_ORDER as readonly string[]).includes(m[1]) ? m[1] : null;
}
export function isWinnerRecipe(rc: { icon: string; description?: string }): boolean { return winnerJobOf(rc) !== null; }
/** The winner recipe of a job among the operator's recipes — the one Merged Winners opens instead of making another. Pure. */
export function winnerRecipeOf(job: string, recipes: readonly AgentRecipe[]): AgentRecipe | undefined { return recipes.find((rc) => winnerJobOf(rc) === job); }
export function JobWinners({ rows, onMade, busy }: { rows: MergeRowLite[]; onMade: (slug: string) => void; busy: boolean }) {
  const [making, setMaking] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const make = async (job: string, r: MergeRowLite) => {
    setMaking(job); setErr(null);
    try { onMade((await makeWinnerRecipe(job, r)).slug); }
    catch (e: any) { setErr(String(e?.message ?? e)); } finally { setMaking(null); }
  };
  return (
    <div data-testid="job-winners" style={{ padding: "8px 6px 0" }}>
      <div style={{ padding: "0 6px 6px", fontFamily: mono, fontSize: 9.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>job winners · first place, from the benchmarks</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {jobWinners(rows).map(({ job, row }) => (
          <div key={job} data-testid={`winner-${job}`} data-measured={row ? "1" : "0"} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderRadius: 9, opacity: row ? 1 : .55 }}>
            <span aria-hidden style={{ width: 32, height: 32, flex: "0 0 32px" }}>
              <ChibiFace slug={`winner-${job}`} mood={row ? "live" : "idle"} size={32} color={row ? faceColor(null, sideFromKey(row.planner)?.engine ?? sideFromKey(row.worker)?.engine, sideFromKey(row.planner)?.model ?? sideFromKey(row.worker)?.model) ?? "#e0a04a" : undefined} />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontFamily: nav, fontSize: 12, color: C.fg, fontWeight: row ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row ? mergeName(job, row.planner, row.worker) : "no winner yet"}</span>
              <span style={{ display: "block", fontFamily: mono, fontSize: 9.5, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {row ? `${jobCode(row.job)} · ${winnerLabel(row)} · ${sizeWord(row.size)} · ${row.audit != null ? `${Math.round(row.audit * 100)}% · ` : ""}${row.s} s · $${row.usd.toFixed(row.usd < 0.1 ? 3 : 2)} · weight ${row.weight.toFixed(2)} · n=${row.n}` : jobNote(job)}
              </span>
            </span>
            {row && sideFromKey(row.worker) && <button data-testid={`winner-${job}-make`} disabled={busy || !!making} onClick={() => void make(job, row)} title="make this winner an agent — a recipe with its pair" style={{ fontFamily: mono, fontSize: 9.5, background: "transparent", border: `1px solid ${C.border}`, color: C.brand, borderRadius: 6, padding: "1px 7px", cursor: "pointer", whiteSpace: "nowrap" }}>{making === job ? "…" : "＋ agent"}</button>}
          </div>
        ))}
      </div>
      {err && <div style={{ padding: "4px 12px", fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err}</div>}
    </div>
  );
}

/** THE ROSTER — the agents, and nothing else (operator 2026-09-23: "i told you to use the agents on the threads on
 *  the agents tab not the previous one that was just for readonly"). antiChat used to sit at the top of this list
 *  and was the default row, which is why the chat looked half-powered: it reads and never writes, so ▶ preview had
 *  no worktree to boot and the settings had nothing to act on. It is gone; every row here is a real agent pane. */
/** AN AGENT'S EPISODES, under its own row. Three at a time, the newest first, with the third fading out under a
 *  mask so the list reads as "there is more" without a scrollbar or a count to parse; the ⌄ shows the rest. The
 *  fade is drawn, not guessed — it only appears when episodes are actually hidden. */
export function Episodes({ agent }: { agent: AgentRow }) {
  const [all, setAll] = React.useState(false);
  React.useEffect(() => setAll(false), [agent.slug]);   // opening another agent starts folded again
  const eps = React.useMemo(() => [...agent.episodes].reverse(), [agent.episodes]);
  const shown = all ? eps : eps.slice(0, 3);
  const hidden = eps.length - shown.length;
  const fade = hidden > 0;
  return (
    <div data-testid="agent-episodes" data-count={eps.length} data-shown={shown.length}
      style={{ padding: "2px 10px 6px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
      <div title={agent.pair} style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>episodes · {agent.pair}</div>
      {!eps.length && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim }}>{agent.pane_id ? "nothing yet — give it an ask on the stage" : "not opened yet — it opens on the stage"}</div>}
      <div data-testid="agent-episodes-list" data-faded={fade ? "1" : undefined}
        style={{ display: "flex", flexDirection: "column", gap: 3,
          ...(fade ? { maskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)" } : {}) }}>
        {shown.map((e) => { const sum = episodeSummary(e as EpisodeLike); return (
          <div key={e.n} data-testid={`episode-${e.n}`} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontFamily: mono, fontSize: 10, color: C.fg }}>
            <span style={{ color: C.dim, flexShrink: 0, paddingTop: 1 }}>#{e.n}</span>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sum.head}</span>
              {/* the consolidation's own line — what this episode came to, which is the thing a list of
                  numbers and turn counts could never say */}
              {sum.body && <span style={{ color: C.muted, fontSize: 9.5, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{sum.body}</span>}
              {sum.meta && <span style={{ color: C.dim, fontSize: 8.5, letterSpacing: .3 }}>{sum.meta}</span>}
            </div>
          </div>
        ); })}
      </div>
      {(hidden > 0 || all) && (
        <button data-testid="agent-episodes-more" onClick={() => setAll((v) => !v)}
          title={all ? "show the last three only" : `show the other ${hidden}`}
          style={{ alignSelf: "flex-start", background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontFamily: mono, fontSize: 9, padding: "1px 0" }}>
          {all ? "⌃ fewer" : `⌄ ${hidden} more`}
        </button>
      )}
    </div>
  );
}

/** THE EPISODES SIDEBAR (operator 2026-09-27: "add back a sidebar left, but instead of agents, just the episodes,
 *  make the episode design back with the consolidation preview summary").
 *
 *  The left column was taken away on the agents surface because one agent that switches roles has nothing to
 *  roster. Its episodes are a different matter: they ARE the units of work, and a consolidation is the one thing
 *  worth carrying down the side of the screen — what each closed episode came to, not how many turns it took.
 *
 *  Same `episodeSummary` the nested list uses, so the two can never drift; flat, newest first, and it scrolls
 *  inside itself rather than pushing the stage around.
 */
export function EpisodesSidebar({ agent, episodes, selected = null, onSelect }: { agent: AgentRow | null; /** the ACTIVE tab's episodes, when that is a fork rather than the agent itself */ episodes?: EpisodeLike[] | null; selected?: number | null; onSelect?: (n: number | null) => void }) {
  // THE LIST FOLLOWS THE TAB, NOT THE AGENT (operator 2026-09-27: "still the current episode doesnt show on
  // episodes list"). It was bound to the roster's agent, so standing on a FORK's tab showed the parent's episodes
  // and the conversation you were actually in — the one you had just opened — appeared nowhere.
  const eps = React.useMemo(() => {
    const src = episodes ?? (agent ? agent.episodes : []);
    return [...(src ?? [])].reverse() as any[];
  }, [agent, episodes]);
  return (
    <div data-testid="episodes-sidebar" data-count={eps.length}
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden" }}>
      {!agent && <div style={{ padding: "4px 14px", fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>no agent open yet</div>}
      {agent && !eps.length && (
        <div style={{ padding: "4px 14px", fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>
          no closed episode yet — an episode consolidates when you rotate the chat
        </div>
      )}
      {/* CLICKABLE (operator 2026-09-27: "the episodes are clickable they carry the history of the conversation, we
          can see the conversation that happened on that episode onclick"). Clicking the open one closes the reader
          rather than opening it twice — the live conversation is already on the stage. */}
      {/* WHICH ONE IS NOW (operator 2026-09-27: "Episode 2 has nothing, and im guessing im on episode 3, but doesnt
          appear on the sidebar left"). The newest episode is the OPEN one — the conversation on the stage — and an
          open episode is empty until something is said in it, which read as a bug because nothing said so. It says
          so now, and an empty open episode explains itself rather than looking like a row that failed to load. */}
      {/* THE CHAT IS THE NEWEST EPISODE (operator 2026-09-27: "the chat is the most recent episode, when closing a new
          episode is created and that becomes the chat, and the other episodes history"). So the live row is the
          SELECTED one whenever no history is open, and picking it shows the chat — never an empty reader of itself.
          Closing an episode moves the highlight to the new live row by itself, because it is simply the newest. */}
      {eps.map((e, i) => { const sum = episodeSummary(e as EpisodeLike); const live = i === 0; const on = live ? selected == null || selected === e.n : selected === e.n;
        const pick = () => onSelect?.(live ? null : on ? null : e.n); return (
        <div key={e.n} data-testid={`side-episode-${e.n}`} title={live ? "the live conversation — on the stage now" : (sum.body || sum.head)} data-on={on ? "1" : undefined}
          role="button" tabIndex={0} onClick={pick}
          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } }}
          style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "6px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10, color: C.fg,
            cursor: "pointer", background: on ? C.panel2 : "transparent", borderLeft: `2px solid ${on ? C.brand : "transparent"}` }}>
          <span style={{ color: live ? C.brand : C.dim, flexShrink: 0, paddingTop: 1 }}>#{e.n}</span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{live && !e.turns ? "nothing said yet" : sum.head}</span>
              {live && <span data-testid="episode-live" style={{ fontFamily: mono, fontSize: 8, letterSpacing: .7, color: C.brand, flexShrink: 0 }}>NOW</span>}
              {/* CAME FROM OUTSIDE (operator 2026-09-27: "only on merge with the master they merge with master
                  episodes (but showing wich episodes came from outside)"). An episode opened in a fork carries the
                  pane it was forked from, and once it is in master's list that mark is the only thing separating
                  work this agent did from work it inherited. A timeline that quietly absorbs another agent's
                  episodes is one you cannot audit. */}
              {!live && (e as EpisodeLike).forked_from != null && (
                <span data-testid={`episode-forked-${e.n}`} title={`worked in a fork${(e as EpisodeLike).agent ? ` — ${(e as EpisodeLike).agent}` : ""}, merged in`}
                  style={{ fontFamily: mono, fontSize: 8, letterSpacing: .6, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "0 3px", flexShrink: 0 }}>⑂ FORK</span>
              )}
            </span>
            {/* the consolidation's own line — the reason this list exists rather than a column of numbers */}
            {sum.body && <span style={{ color: C.muted, fontSize: 9.5, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{sum.body}</span>}
            {sum.meta && <span style={{ color: C.dim, fontSize: 8.5, letterSpacing: .3 }}>{sum.meta}</span>}
          </div>
        </div>
      ); })}
    </div>
  );
}

/** ONE TURN OF AN EPISODE, WEARING THE AGENT'S OWN SKIN (operator 2026-09-28: "still onclick on an old episode the
 *  chat at the center is ugly, use the agent design").
 *
 *  The live chat has two skins: the default antiloki one (`Bubble`) and a THEMED one an agent can wear — its own
 *  font, radius, colours and whether replies sit in bubbles at all. History was rendering in neither: it had its own
 *  hardcoded layout and plain text, so an episode of a themed agent looked like a third thing, and every code fence
 *  came back as raw markdown source. Now it renders in whichever skin that agent actually uses. */
export function EpisodeTurn({ t, theme }: { t: any; theme?: string | null }) {
  const text = String(t.text ?? "");
  const human = t.role === "you";
  // no theme (an episode of an agent that never had one) → the plain chat bubble, which is the same component the live thread uses
  if (!theme) {
    return <Bubble text={text} who={String(t.role ?? "")} ts={t.at ? String(t.at) : undefined} isHuman={human} />;
  }
  const T = agentTheme(theme);
  const transcript = T.layout === "transcript";
  const style: React.CSSProperties = transcript
    ? { fontFamily: T.font, fontSize: T.size, color: human ? T.user.fg : T.reply.fg, background: human && T.user.band ? T.user.bg : "transparent",
        borderLeft: human && T.user.border ? `3px solid ${T.accent}` : undefined, padding: human && T.user.band ? "4px 8px" : "2px 0", lineHeight: 1.55 }
    : { fontFamily: T.font, fontSize: T.size, color: human ? T.user.fg : T.reply.fg, background: human ? T.user.bg : T.reply.bg,
        border: (human ? T.user.border : T.reply.border) ? `1px solid ${human ? T.user.border : T.reply.border}` : undefined,
        borderRadius: T.radius, padding: "8px 12px", maxWidth: "80%", lineHeight: 1.5 };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: transcript ? "stretch" : human ? "flex-end" : "flex-start", marginBottom: 6 }}>
      {/* the operator's own words are what they typed; the agent's are markdown, exactly as in the live pane */}
      <div style={style}>{human ? <span style={{ whiteSpace: "pre-wrap" }}>{text}</span> : <Markdown text={text} compact />}</div>
      <div style={{ fontFamily: T.font, fontSize: 9.5, color: T.dim, marginTop: 2 }}>{String(t.role ?? "")}{t.at ? ` · ${t.at}` : ""}</div>
    </div>
  );
}

/** ONE EPISODE, READ BACK. The turns that happened inside it, from `cockpit/agents/episode/turns` — which bounds
 *  them by the episode's own `seq` and the next one's, so what is shown is exactly what that episode contained.
 *
 *  Read-only by construction: there is no composer here. A closed episode is history; the place to say something is
 *  the live conversation, one click away on the same list.
 */
export function EpisodeReader({ paneId, n, onClose, theme }: { paneId: number; n: number; onClose: () => void; theme?: string | null }) {
  const [data, setData] = React.useState<any>(null);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true; setData(null); setErr(null);
    void (async () => {
      try { const r: any = await apiGet(`/api/v1/cockpit/agents/episode/turns?pane_id=${paneId}&n=${n}`, { timeoutMs: 20_000 } as any);
        if (live) { if (r?.ok) setData(r); else setErr(r?.error ?? "that episode could not be read"); } }
      catch (e: any) { if (live) setErr(String(e?.message ?? e)); }
    })();
    return () => { live = false; };
  }, [paneId, n]);
  const turns: any[] = data?.turns ?? [];
  return (
    <div data-testid="episode-reader" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, letterSpacing: 1, textTransform: "uppercase" }}>episode #{n}</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.fg, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data?.title || ""}</span>
        {data?.live && <span style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, letterSpacing: .6 }}>OPEN</span>}
        <button data-testid="episode-reader-close" onClick={onClose} title="back to the live conversation"
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "1px 7px", cursor: "pointer", fontFamily: mono, fontSize: 10 }}>✕ back</button>
      </div>
      {data?.subtitle && <div style={{ padding: "6px 14px 0", fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{data.subtitle}</div>}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {err && <div style={{ fontFamily: mono, fontSize: 10, color: C.warn }}>{err}</div>}
        {!err && !data && <div style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>reading the episode…</div>}
        {data && !turns.length && <div style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>nothing was said in this episode</div>}
        {/* HISTORY IS STILL THE CONVERSATION (operator 2026-09-28: "the design of the consolidated episodes is ugly,
            it should be the same as the agent is using. Design i mean, functionality is correct now, it is history").
            This re-implemented bubbles from scratch: hardcoded colours, a bare role label above each turn, the agent
            side with no bubble at all, and — the part that actually hurt — PLAIN TEXT, so every code fence, link and
            list the agent had written came back as raw markdown source. `Bubble` is the component the live chat uses
            for the same turns; reading an episode now looks like having had it. */}
        {turns.map((t, i) => (
          <div key={`${t.seq ?? i}`} data-testid={`episode-turn-${i}`}>
            <EpisodeTurn t={t} theme={theme} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** THE ROSTER AT 26 PIXELS (operator 2026-09-25: "collapses showing the mini avatars"). The same faces the
 *  roster draws, the same click, no names — what a folded sidebar can carry and still be useful. */
/** AN EPISODE IS A CONSOLIDATION, NOT A ROW (operator 2026-09-25: "the episodes under the agent now is a flat
 *  list, ok, but before the episodes had a better design and showed like summaries like a consolidation").
 *
 *  The serve has always sent the whole thing — title, subtitle, the engine's own `story`, the first ask, the
 *  reply count, which engine ran it — and the list rendered three fields of it: number, title, turns. Nothing
 *  needed fetching; it needed reading. Pure — tested.
 */
export type EpisodeLike = { n: number; title?: string; subtitle?: string; story?: string; first_ask?: string; turns?: number; replies?: number; engine?: string;
  /** WHERE IT HAPPENED (2026-09-27): the worktree, the agent that owned it, and the pane it was forked from. */
  box?: string; agent?: string; forked_from?: number | null };
export function episodeSummary(e: EpisodeLike): { head: string; body: string; meta: string } {
  // the title if it was named, else the ask it opened on — an episode called "episode" tells nobody anything
  const head = (e.title || "").trim() || (e.first_ask || "").trim().split("\n")[0].slice(0, 70) || "episode";
  // the subtitle is the consolidation's own line; the engine's story is the fallback, trimmed to one sentence
  const story = (e.story || "").trim().split(/(?<=[.!?])\s/)[0];
  const body = (e.subtitle || "").trim() || story || "";
  const bits: string[] = [];
  if (e.turns) bits.push(`${e.turns} turn${e.turns === 1 ? "" : "s"}`);
  if (e.replies) bits.push(`${e.replies} repl${e.replies === 1 ? "y" : "ies"}`);
  if (e.engine) bits.push(e.engine);
  return { head, body, meta: bits.join(" · ") };
}

export function RosterAvatars({ agents, selected, onSelect }: { agents: AgentRow[]; selected: string; onSelect: (slug: string) => void }) {
  assignAgentColors(agents.map((a) => a.slug));
  return (
    <>
      {agents.map((a) => {
        const face = parseFaceIcon(a.icon);
        return (
          <button key={a.slug} data-testid={`avatar-${a.slug}`} onClick={() => onSelect(a.slug)} title={`${a.name}${a.status ? ` · ${a.status}` : ""}`}
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", lineHeight: 0, opacity: selected === a.slug ? 1 : 0.72,
              outline: selected === a.slug ? `1px solid ${C.brand}` : "none", outlineOffset: 1, borderRadius: 6 }}>
            <ChibiFace slug={a.slug} mood={a.tone === "working" || a.tone === "live" ? "live" : a.tone === "needs" ? "needs" : "idle"} size={18} shape={face?.shape}
              color={face?.color ?? agentColor(a.slug)} />
          </button>
        );
      })}
    </>
  );
}

export function Roster({ agents, selected, onSelect, busy, loading = false, onAdd, onRename }: { /** the ＋ at the top: hire an agent */ onAdd?: () => void; /** double-click a created agent's name to rename it (operator 2026-09-23) */ onRename?: (slug: string, name: string) => void; agents: AgentRow[]; selected: string; onSelect: (slug: string) => void; busy: boolean; /** the first fetch has not landed — say nothing rather than "no agents yet" */ loading?: boolean }) {
  assignAgentColors(agents.map((a) => a.slug));
  const moodOf = (slug: string): Mood => { const a = agents.find((x) => x.slug === slug); const t = a?.tone; return t === "needs" || t === "working" || t === "live" ? t : a?.status.startsWith("failed") ? "failed" : "idle"; };
  // the face wears the agent's theme (2026-09-23: "each one has a theme") — the status colours the line under it
  const colorOf = (slug: string): string | undefined => { const a = agents.find((x) => x.slug === slug); return a ? agentColor(a.slug) : undefined; };
  // THE ROW (operator 2026-09-23: "the agents on the sidebar left should be avatar, name and role below. And the
  // base agents of the merge discretely"). Three readings, in the order a person asks them: who is this, what is it
  // for, and what is it made of. The merge is the quietest of the three because it is the answer to a question
  // nobody asks first.
  const row = (slug: string, icon: React.ReactNode, name: string, sub: React.ReactNode, right: React.ReactNode, tone: string, testId: string) => { const on = selected === slug; return (
    <button key={slug} data-testid={testId} data-on={on ? "1" : "0"} disabled={busy} onClick={() => onSelect(slug)}
      style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 9, cursor: "pointer", background: on ? `color-mix(in oklab, ${C.brand} 10%, transparent)` : "transparent", border: `1px solid ${on ? `color-mix(in oklab, ${C.brand} 40%, transparent)` : "transparent"}`, transition: "background .18s ease, border-color .18s ease" }}>
      <span aria-hidden style={{ position: "relative", width: 32, height: 32, flex: "0 0 32px" }}>
        <ChibiFace slug={slug} mood={moodOf(slug)} size={32} shape={parseFaceIcon(typeof icon === "string" ? icon : null)?.shape} color={parseFaceIcon(typeof icon === "string" ? icon : null)?.color ?? colorOf(slug)} />
        {typeof icon === "string" && icon !== "✦" && badgeOf(icon) && <span style={{ position: "absolute", right: -3, bottom: -3, fontSize: 10, lineHeight: 1 }}>{icon}</span>}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          {/* the name owns the row; the tag on the right is capped and clipped. A generated pair label can run to
              "Claude · the job's model × OpenCode · the job's model", and unbounded it pushed the name off the
              sidebar entirely (operator 2026-09-23: "the name and info broke the space on the left sidebar"). */}
          <Renamable label={name} canRename={!!onRename && slug !== "antichat"} onRename={(v) => onRename?.(slug, v)} style={{ fontFamily: nav, fontSize: 12.5, color: C.fg, fontWeight: on ? 700 : 500, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />
          <span title={typeof right === "string" ? right : undefined} style={{ marginLeft: "auto", fontFamily: mono, fontSize: 9.5, color: C.brand, whiteSpace: "nowrap", flexShrink: 0, maxWidth: 74, overflow: "hidden", textOverflow: "ellipsis" }}>{right}</span>
        </span>
        <span style={{ display: "block", fontFamily: mono, fontSize: 9.5, color: tone === TONE.idle ? C.dim : tone, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
        {(() => { const a = agents.find((x) => x.slug === slug); if (!a) return null; const base = baseModels(a.pair); return (
          <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
            <span data-testid={`agent-role-${slug}`} style={{ fontFamily: mono, fontSize: 9, letterSpacing: .4, textTransform: "uppercase", color: a.main ? C.brand : C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subLine(a)}</span>
            {base && <span data-testid={`agent-base-${slug}`} title={a.pair} style={{ fontFamily: mono, fontSize: 8.5, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: .8 }}>{base}</span>}
          </span>
        ); })()}
      </span>
    </button>
  ); };
  return (
    <div data-testid="agents-roster" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* ＋ HIRES (operator 2026-09-23: "add a plus button on top of sidebar left, this will add agents, and roles
          will be there to choose on adding"). Making an agent belongs where the agents are, not in a catalogue of
          tools on the other side of the screen. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 6px" }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>agents</span>
        <span style={{ flex: 1 }} />
        {onAdd && <button data-testid="agents-add" onClick={onAdd} title="hire an agent — pick a role and it brings its skills, its specialists and its merge"
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.brand, borderRadius: 6, width: 18, height: 18, lineHeight: "14px", padding: 0, cursor: "pointer", fontFamily: mono, fontSize: 12 }}>＋</button>}
      </div>
      {/* EPISODES BELONG TO THEIR AGENT (operator 2026-09-23: "episodes on the agents, place it below each agent
          collapsed, on click the agent it expands the last 3 episodes with blur and another expand button to expand
          the rest"). They used to be one block at the bottom of the roster, describing whichever row happened to be
          selected — so the list read as the sidebar's, not the agent's. Now each row carries its own, folded shut
          until you open the agent. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 6px", display: "flex", flexDirection: "column", gap: 2 }}>
        {agents.map((a) => (
          <React.Fragment key={a.slug}>
            {row(a.slug, a.icon || "🤖", a.name, a.status, savedTag(a) || (a.pair !== "solo" ? a.pair : ""), TONE[a.tone] ?? TONE.idle, `agent-row-${a.slug}`)}
            {selected === a.slug && <Episodes agent={a} />}
          </React.Fragment>
        ))}
        {/* "no agents yet" is a claim, and before the first fetch lands it is a false one — an empty roster that
            flashes on every reload reads as data loss. Say nothing until we know. */}
        {!agents.length && (loading
          ? <div style={{ padding: "6px 10px", fontFamily: mono, fontSize: 9.5, color: C.dim }}>…</div>
          : <div style={{ padding: "6px 10px", fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>no agents yet — pick one in the Studio (models, or a role) and it appears here with its own episodes</div>)}
        <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}` }} />
        {/* the job winners are NOT here (operator 2026-09-23: "take out on the left sidebar the job winners, we
            already have them on the right sidebar") — the Studio's models tab lists them as Merged Winners, which
            is where an agent is made. This side is the agents you already have. */}
        {/* TEAMS IS DEV-ONLY FOR NOW (operator 2026-09-23: "let's hide for now teams feature to the app and only
            show in dev mode") — the members share a brief but do not hand work to one another yet, so the shipped
            app would be promising a pipeline it does not run. See dev-only.ts. */}
        {devOnly() && (() => { const a = agents.find((x) => x.slug === selected); return a ? <Routines key={a.slug} agent={a} agents={agents} /> : null; })()}
      </div>
    </div>
  );
}

/** TEAMS (the moat, 2026-09-22: "name an agent, give it a brief, put it on a routine"; renamed 2026-09-23: "change
 *  routines name for teams, because it is teams of agents working on pipelines, make it like a group chat").
 *
 *  A team is several agents and one brief, on a cadence: the faces of its members, the brief as the thing they were
 *  last told, and the note each run leaves behind — a group chat with a standing message rather than a cron row.
 *  Renaming alone would have been a lie, so the store holds members now (routines.rs) and every one of them is sent
 *  the brief. What is NOT here: the members do not hand artefacts to one another — that is the meeting design
 *  (PLAN-THE-MEETING.md), unbuilt — so each is told plainly that the others work in parallel. */
export type Routine = { id: number; agent: string; members?: string; name: string; brief: string; every_min: number; enabled: number | boolean; last_run: number; next_run: number; last_note: string };
/** the members of a team, in order: the stored list, else the single agent it was made for. Pure. */
export const teamMembers = (r: { members?: string; agent: string }): string[] => {
  const listed = String(r.members ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return listed.length ? listed : r.agent ? [r.agent] : [];
};
export function Routines({ agent, agents = [] }: { agent: AgentRow; agents?: AgentRow[] }) {
  const [rows, setRows] = React.useState<Routine[]>([]);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<{ name: string; brief: string; every_min: number; members: string[] }>({ name: "", brief: "", every_min: 1440, members: [agent.slug] });
  React.useEffect(() => setDraft((d) => ({ ...d, members: [agent.slug] })), [agent.slug]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    try { const r: any = await apiGet("/api/v1/cockpit/agents/routines"); const d = r?.result ?? r; setRows((d?.routines ?? []).filter((x: Routine) => teamMembers(x).includes(agent.slug))); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  }, [agent.slug]);
  React.useEffect(() => { void load(); }, [load]);
  const call = async (label: string, path: string, body: any) => {
    setBusy(label); setErr(null);
    // strict (audit 2026-10-01): apiPost answers null for a refusal or a dead serve, and null fell through here as a success - the routine list reloaded as if the save had landed
    try { const r: any = await apiPostStrict(path, body, { timeoutMs: 60_000 }); const d = r?.result ?? r; if (d && d.ok === false) throw new Error(d.error ?? "failed"); await load(); return d; }
    catch (e) { setErr(reasonOf(e)); return null; }
    finally { setBusy(null); }
  };
  const every = (m: number) => m % 1440 === 0 ? `every ${m / 1440} day${m === 1440 ? "" : "s"}` : m % 60 === 0 ? `every ${m / 60} h` : `every ${m} min`;
  const when = (t: number) => t ? (t <= Date.now() ? "due now" : `next ${ago(t).replace(" ago", "")}`) : "";
  return (
    <div data-testid="agent-routines" style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>teams</span>
        <button data-testid="routine-new" onClick={() => setOpen((o) => !o)} style={{ marginLeft: "auto", fontFamily: mono, fontSize: 9.5, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "1px 7px", cursor: "pointer" }}>＋ team</button>
      </div>
      {open && (
        <div data-testid="routine-form" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0" }}>
          <input data-testid="routine-name" placeholder="team name (blank = the brief's first line)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ fontFamily: mono, fontSize: 10.5, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px" }} />
          <textarea data-testid="routine-brief" placeholder="the brief — what the team does each time" value={draft.brief} onChange={(e) => setDraft({ ...draft, brief: e.target.value })} rows={3} style={{ fontFamily: mono, fontSize: 10.5, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 6px", resize: "vertical" }} />
          {/* WHO IS IN IT — the agent whose row this is cannot be removed; the rest join with a tap, like adding
              people to a group chat. Everyone in the team gets the brief. */}
          <div data-testid="team-members" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(agents.length ? agents : [agent]).map((a) => { const inTeam = draft.members.includes(a.slug); const fixed = a.slug === agent.slug; return (
              <button key={a.slug} data-testid={`team-member-${a.slug}`} data-in={inTeam ? "1" : "0"} disabled={fixed}
                onClick={() => setDraft((d) => ({ ...d, members: inTeam ? d.members.filter((m) => m !== a.slug) : [...d.members, a.slug] }))}
                title={fixed ? `${a.name} — this team is on its row` : inTeam ? `take ${a.name} out of the team` : `add ${a.name} to the team`}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", cursor: fixed ? "default" : "pointer",
                  border: `1px solid ${inTeam ? C.brand : C.border}`, color: inTeam ? C.fg : C.dim, borderRadius: 999, padding: "1px 7px 1px 2px", fontFamily: mono, fontSize: 9.5, maxWidth: 130 }}>
                <ChibiFace slug={a.slug} mood="idle" size={14} shape={parseFaceIcon(a.icon)?.shape} color={parseFaceIcon(a.icon)?.color ?? agentColor(a.slug)} />
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
              </button>
            ); })}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: mono, fontSize: 10, color: C.dim }}>
            every <select data-testid="routine-every" value={draft.every_min} onChange={(e) => setDraft({ ...draft, every_min: Number(e.target.value) })} style={{ fontFamily: mono, fontSize: 10, background: "transparent", color: C.fg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 4px" }}>
              {[15, 30, 60, 180, 360, 720, 1440, 10080].map((m) => <option key={m} value={m}>{every(m).replace("every ", "")}</option>)}
            </select>
            <button data-testid="routine-save" disabled={!draft.brief.trim() || busy === "save"} onClick={() => void call("save", "/api/v1/cockpit/agents/routines", { agent: agent.slug, name: draft.name, brief: draft.brief, every_min: draft.every_min, members: draft.members }).then((d) => { if (d) { setOpen(false); setDraft({ name: "", brief: "", every_min: 1440, members: [agent.slug] }); } })}
              style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10, background: `color-mix(in oklab, ${C.brand} 14%, transparent)`, border: `1px solid ${C.brand}`, color: C.brand, borderRadius: 6, padding: "2px 9px", cursor: "pointer" }}>save — runs at once, then on schedule</button>
          </div>
        </div>
      )}
      {!rows.length && !open && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, lineHeight: 1.5 }}>none — a team is a brief a group of agents gets on a schedule</div>}
      {rows.map((r) => { const on = r.enabled === 1 || r.enabled === true; return (
        <div key={r.id} data-testid={`routine-${r.id}`} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0", borderTop: `1px dashed ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 10.5, minWidth: 0 }}>
            {/* the members' faces, overlapped like a group chat's avatars */}
            <span data-testid={`routine-${r.id}-members`} data-count={teamMembers(r).length} aria-hidden style={{ display: "inline-flex", flexShrink: 0 }}>
              {teamMembers(r).slice(0, 4).map((slug, i) => { const a = agents.find((x) => x.slug === slug); return (
                <span key={slug} style={{ marginLeft: i ? -5 : 0, display: "inline-flex", borderRadius: 999, boxShadow: `0 0 0 1.5px ${C.bg}` }}>
                  <ChibiFace slug={slug} mood="idle" size={15} shape={parseFaceIcon(a?.icon ?? null)?.shape} color={parseFaceIcon(a?.icon ?? null)?.color ?? agentColor(slug)} />
                </span>
              ); })}
            </span>
            <span style={{ color: on ? C.fg : C.dim, minWidth: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
            <span style={{ color: C.dim, fontSize: 9.5, whiteSpace: "nowrap", flexShrink: 0 }}>{every(r.every_min)}{on ? ` · ${when(r.next_run)}` : " · off"}</span>
          </div>
          {/* the standing message — what everyone in this team was told */}
          <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.brief}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: mono, fontSize: 9.5, color: C.dim }}>
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.last_note || "never run"}</span>
            <button data-testid={`routine-${r.id}-toggle`} disabled={!!busy} onClick={() => void call("toggle", "/api/v1/cockpit/agents/routines", { id: r.id, agent: r.agent, members: teamMembers(r), name: r.name, brief: r.brief, every_min: r.every_min, enabled: !on })} title={on ? "pause" : "resume"} style={{ background: "transparent", border: "none", color: on ? C.ok : C.dim, cursor: "pointer", fontSize: 10 }}>{on ? "◉ on" : "○ off"}</button>
            <button data-testid={`routine-${r.id}-run`} disabled={!!busy} onClick={() => void call("run", "/api/v1/cockpit/agents/routines/run", { id: r.id })} title="run it now" style={{ background: "transparent", border: "none", color: C.brand, cursor: "pointer", fontSize: 10 }}>▶ now</button>
            <button data-testid={`routine-${r.id}-delete`} disabled={!!busy} onClick={() => void call("delete", "/api/v1/cockpit/agents/routines/delete", { id: r.id })} title="delete" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 10 }}>✕</button>
          </div>
        </div>
      ); })}
      {err && <div style={{ fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err}</div>}
    </div>
  );
}

/** THE BOX BEING CUT (operator 2026-09-27: "a loading should show with real time info of creating the worktree and
 *  funny messages like claude does till the worktree is ready and safe to work on").
 *
 *  The tab opens before the worktree exists — that is deliberate, so ＋ never stalls with nothing on screen — which
 *  means there is a window where the pane is real and the box is NOT. Writing into a half-cut box is the thing this
 *  prevents: the stage shows this instead of the composer until `ready`.
 *
 *  The step is the truth and the line beside it is the product talking; both come from serve so the two can never
 *  disagree. The dots are the only decoration, because a progress bar over three steps of unknown length is a lie
 *  with a nicer shape.
 */
export function ForkPreparing({ paneId, name, onReady }: { paneId: number; name: string; onReady: () => void }) {
  const [st, setSt] = React.useState<{ step: string; line: string; ready: boolean; error?: string | null } | null>(null);
  const [dots, setDots] = React.useState(1);
  const FLOOR_MS = 1400;                       // long enough to read the steps, short enough not to be in the way
  const startedAt = React.useRef(Date.now());
  React.useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const r: any = await apiGet(`/api/v1/cockpit/pane/fork/status?pane_id=${paneId}`, { timeoutMs: 8_000 } as any);
        if (!live) return;
        // AN OLDER SERVE HAS NO SUCH ROUTE (audit 2026-09-28). A 404 comes back as the `__not_wired` sentinel,
        // which is neither `ready` nor an `error`, so the tab sat on "getting a box together…" for ever with no
        // composer and no explanation. The box is cut by then — the fork call that made this tab already
        // returned — so the honest move is to get out of the way.
        if (isNotWired(r)) { onReady(); return; }
        setSt(r);
        // A FLOOR, BECAUSE THE WORK IS REAL EVEN WHEN IT IS FAST (operator 2026-09-27: "should show a loading while
        // the worktree is created and just was instant, that is impossible").
        //
        // It is not impossible — `git worktree add` plus a node_modules SYMLINK plus the excludes takes ~70 ms on a
        // warm repo, so the box was genuinely ready before the first poll returned. But a step that flashes is a
        // step nobody can check, and the operator was right to distrust it: there was no way to tell a real cut from
        // a no-op. The floor holds the steps on screen long enough to read, and never shortens a slow cut.
        if (r?.ready) {
          const waited = Date.now() - startedAt.current;
          if (waited >= FLOOR_MS) onReady();
          else setTimeout(() => { if (live) onReady(); }, FLOOR_MS - waited);
        }
      } catch { /* a missed poll is not a failure — the next one answers */ }
      // …but a poll that never answers is. After ~40 s the tab opens anyway rather than trapping the operator
      // in a loading screen with no way forward.
      if (live && Date.now() - startedAt.current > 40_000) onReady();
    };
    void tick();
    const h = setInterval(tick, 300);
    const d = setInterval(() => setDots((n) => (n % 3) + 1), 450);
    return () => { live = false; clearInterval(h); clearInterval(d); };
  }, [paneId]); // eslint-disable-line react-hooks/exhaustive-deps
  const failed = !!st?.error;
  const STEPS = ["branch", "deps", "excludes"] as const;
  const at = STEPS.indexOf((st?.step ?? "") as any);
  return (
    <div data-testid="fork-preparing" data-step={st?.step ?? "start"}
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
      <span style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.dim }}>{name}</span>
      <span data-testid="fork-preparing-line" style={{ fontFamily: mono, fontSize: 12, color: failed ? C.bad : C.fg, textAlign: "center", maxWidth: 420, lineHeight: 1.6 }}>
        {failed ? `the box could not be cut — ${st?.error}` : `${st?.line ?? "getting a box together"}${".".repeat(dots)}`}
      </span>
      {!failed && (
        <span style={{ display: "flex", gap: 6 }}>
          {STEPS.map((s, i) => (
            <span key={s} title={s} style={{ width: 22, height: 2, borderRadius: 2, background: i <= at ? C.brand : C.border }} />
          ))}
        </span>
      )}
      {!failed && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>its own worktree — it cannot touch the files you are working on</span>}
    </div>
  );
}

/** THE TABS (operator 2026-09-27: "on the tabs concept make it look like tabs, like the windows new terminal that
 *  has tabs"). One strip above the stage: the agent, then each FORK of it, then ＋.
 *
 *  A fork is the same agent again — same pair, same scope, same skills — in its OWN worktree, with its own
 *  episodes. That is what makes tabs safe here: two tabs are two boxes, so they can work at the same time without
 *  touching each other's files, which is the thing a terminal's tabs cannot promise you.
 *
 *  Temporary by design: ✕ closes a fork and disposes of it. The parent tab has no ✕ — closing the agent you forked
 *  FROM is not a tab operation, and a strip you can empty is a strip that can lose you the way back.
 */
export function ForkTabs({ agent, forks, active, onPick, onFork, onClose, onRename, busy, blocked }: {
  /** double-click a tab's name (operator 2026-09-28): `key` is "main" or the fork's pane id */ onRename?: (key: string, name: string) => void;
  agent: AgentRow; forks: { pane_id: number; session_id: number; name: string }[];
  active: number | null; onPick: (paneId: number | null) => void;
  onFork: () => void; onClose: (paneId: number) => void; busy?: boolean;
  /** why ＋ is refusing, if it is — 16 tabs, or the machine running out of memory */ blocked?: string | null;
}) {
  const tab = (key: string, label: string, on: boolean, onClick: () => void, close?: () => void, face?: React.ReactNode) => (
    <div key={key} data-testid={`fork-tab-${key}`} data-on={on ? "1" : undefined} onClick={onClick}
      title={label}
      style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: 190, minWidth: 0, cursor: "pointer",
        padding: "5px 10px", borderRight: `1px solid ${C.border}`,
        // the active tab is the one joined to the stage below it: lit, and no line under it
        background: on ? C.panel2 : "transparent", borderBottom: `1px solid ${on ? "transparent" : C.border}`,
        borderTop: `2px solid ${on ? C.brand : "transparent"}` }}>
      {/* THE AVATAR LIVES ON THE TAB (operator 2026-09-27). It is the agent's identity, and a tab is where you pick
          which agent you are looking at — the header repeated it beside a line that no longer applies. It is the
          same ChibiFace the roster drew, so it keeps its mood: idle, working, needs, live. */}
      {face && <span style={{ flexShrink: 0, lineHeight: 0, opacity: on ? 1 : 0.65 }}>{face}</span>}
      <Renamable label={label} canRename={!!onRename} onRename={(v) => onRename?.(key, v)} style={{ fontFamily: mono, fontSize: 10.5, color: on ? C.fg : C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }} />
      {close && (
        <span role="button" aria-label={`close ${label}`} data-testid={`fork-close-${key}`}
          onClick={(e) => { e.stopPropagation(); close(); }}
          style={{ color: C.dim, fontSize: 11, lineHeight: 1, flexShrink: 0, padding: "0 1px" }}>✕</span>
      )}
    </div>
  );
  const forkColors = assignForkColors(parseFaceIcon(agent.icon)?.color ?? agentColor(agent.slug), forks.map((f) => f.pane_id));
  return (
    <div data-testid="fork-tabs" style={{ display: "flex", alignItems: "stretch", flexShrink: 0, borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
      {/* a tab renames on DOUBLE-CLICK only (operator 2026-09-28) — Renamable's pencil would sit on every tab */}
      <style>{`[data-testid="fork-tabs"] .loki-rename{display:none !important}`}</style>
      {tab("main", agent.name, active == null, () => onPick(null), undefined,
        <ChibiFace slug={agent.slug} mood={agent.tone === "needs" || agent.tone === "working" || agent.tone === "live" ? agent.tone : "idle"} size={16}
          shape={parseFaceIcon(agent.icon)?.shape} color={parseFaceIcon(agent.icon)?.color ?? agentColor(agent.slug)} />)}
      {forks.map((f) => tab(String(f.pane_id), f.name, active === f.pane_id, () => onPick(f.pane_id), () => onClose(f.pane_id),
        // a fork wears the parent's SHAPE - it IS the parent, twice - but its own colour (operator 2026-10-09: every new agent tab was the same colour), so the tabs can be told apart
        <ChibiFace slug={`fork-${f.pane_id}`} mood="idle" size={16}
          shape={parseFaceIcon(agent.icon)?.shape} color={forkColors[f.pane_id]} />))}
      <button data-testid="fork-add" onClick={onFork} disabled={busy || !!blocked}
        title={blocked ?? `fork ${agent.name} — the same agent again, its own worktree, its own episodes; close it when the work is done`}
        style={{ background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`, color: busy || blocked ? C.dim : C.muted, cursor: busy ? "wait" : blocked ? "not-allowed" : "pointer", fontFamily: mono, fontSize: 13, padding: "0 12px", flexShrink: 0 }}>{busy ? "…" : "＋"}</button>
      <span style={{ flex: 1, borderBottom: `1px solid ${C.border}` }} />
    </div>
  );
}

/** THE STAGE for an agent: its pane in the workspace — the full Heimdall menu, write allowed, its runs on the rail. */
export function AgentStage({ agent, pane, err }: { agent: AgentRow | null; pane: { id: number; session_id: number } | null; err: string | null }) {
  if (!agent) return null;
  return (
    <div data-testid="agent-stage" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* NO HEADER LINE (operator 2026-09-27: "remove the avatar and name line, it already appear on the tab").
          The avatar, the name and the status all live on the tab above; a second copy under it was a tile. */}
      {err && <div style={{ padding: "4px 16px", fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err}</div>}
      {pane ? (
        <Slide id={`agent:${pane.id}`} order={[]} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* THE AGENT ALREADY CHOSE ITS SCOPE (operator 2026-09-27: "eliminate the tile with the start button.
                Why start? is always started"). Without `initialScope` the body could not see the scope the agent
                DECLARES, so it fell to the ScopeGate — a tile asking the operator to tick folders and press
                "▶ start with this scope" for an agent already running with `**`. The gate is right when nothing
                has declared a scope; it is ceremony when the recipe has. Passing it settles the question the gate
                was there to ask, and an agent with no declared scope still gets asked. */}
            <CockpitPaneBody kind={agent.engine} sessionId={pane.session_id} paneId={pane.id} initialScope={agent.scope?.length ? agent.scope : undefined} attach={{ csId: pane.session_id, paneId: pane.id }} />
          </div>
        </Slide>
      ) : <div style={{ flex: 1, display: "grid", placeItems: "center", fontFamily: mono, fontSize: 10.5, color: C.dim }}>opening {agent.name}…</div>}
    </div>
  );
}

/** Both halves — what chat-thread mounts on the desk: the roster on the left, the selected agent's pane on the right. */
export function useMergesLite(enabled = true) {
  return usePoll<{ rows: MergeRowLite[] }>(() => apiGet<{ rows: MergeRowLite[] }>("/api/v1/settings/merges"), 30_000, enabled, { fetchKey: "merges-lite" });
}
export function useAgentsTab(enabled = true) {
  const q = useRoster(enabled);
  const mq = useMergesLite(enabled);
  const merges = Array.isArray(mq.data?.rows) ? mq.data!.rows : [];
  const agents = q.data?.agents ?? [];
  assignAgentColors(agents.map((a) => a.slug));
  const [selected, setSelected] = React.useState<string>(() => { try { return localStorage.getItem("antiloki:agents-tab:selected") || ""; } catch { return ""; } });
  const [panes, setPanes] = React.useState<Record<string, { id: number; session_id: number }>>({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const pick = (slug: string) => { setSelected(slug); try { localStorage.setItem("antiloki:agents-tab:selected", slug); } catch { /* fine */ } };
  // an agent's pane is made on first open — once per slug
  React.useEffect(() => {
    if (!enabled || !selected || panes[selected]) return;
    const a = agents.find((x) => x.slug === selected); if (!a) return;
    let live = true; setBusy(true); setErr(null);
    void (async () => {
      try { const r: any = await apiPost("/api/v1/cockpit/agents/open", { slug: selected }, { timeoutMs: 60_000 }); const d = r?.result ?? r; const p = d?.pane;
        if (!p?.id) throw new Error(d?.error ?? "open returned no pane");
        if (live) { setPanes((m) => ({ ...m, [selected]: { id: Number(p.id), session_id: Number(p.session_id) } })); q.refetch(); } }
      catch (e: any) { if (live) setErr(String(e?.message ?? e)); }
      finally { if (live) setBusy(false); }
    })();
    return () => { live = false; };
  }, [enabled, selected, agents.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // the first agent is the front door now that antiChat is not a row — a saved pick that no longer exists falls back
  // to it rather than leaving the desk blank
  // FORK STATE. Kept in the hook rather than the component so switching tabs survives a re-render of the stage.
  const [forks, setForks] = React.useState<{ pane_id: number; session_id: number; name: string; preparing?: boolean }[]>([]);
  // FORKS SURVIVE A RELOAD, BECAUSE THE WORKTREES DO (audited 2026-09-27). The strip was React state only: refresh
  // the page and the tabs vanished while the panes and their worktrees stayed on disk, invisible and un-closable.
  // Two orphans accumulated that way in one evening. A fork is discoverable — its pane carries `forked_from` — so
  // the strip is rebuilt from what actually exists rather than remembered.
  React.useEffect(() => {
    if (!enabled || !selected) return;
    let live = true;
    void (async () => {
      try {
        const r: any = await apiGet("/api/v1/cockpit/agents/live", { timeoutMs: 10_000 } as any);
        if (!live || !Array.isArray(r?.agents)) return;
        // A FORK BELONGS TO THE AGENT IT WAS CUT FROM (audit 2026-09-28). This took EVERY forked pane in the
        // workspace, so agent B's tab strip listed agent A's forks wearing B's avatar — and clicking one put A's
        // worktree on the stage under B's name. Anything typed there went to the wrong agent in the wrong box.
        // A fork's own key is `agent-<parent slug>-<name>`, which is how the roster names it and how the serve
        // titles the tab, so the parent is recoverable without another round trip.
        const mine = r.agents
          .filter((a: any) => Number(a?.forked_from) > 0 && String(a?.key ?? "").startsWith(`agent-${selected}-`))
          .map((a: any) => ({ pane_id: Number(a.pane_id), session_id: Number(a.session_id ?? 0), name: String(a.name || a.key || "fork"), preparing: false }));
        // MERGED, NOT REPLACED (audit 2026-09-28). `fs.length ? fs : mine` threw the persisted forks away if the
        // one-shot read resolved after the operator had already clicked ＋ — leaving exactly the invisible,
        // un-closable boxes this effect exists to recover.
        setForks((fs) => { const have = new Set(fs.map((f) => f.pane_id)); return [...fs, ...mine.filter((m: any) => !have.has(m.pane_id))]; });
        // THE TAB YOU WERE ON COMES BACK (2026-09-28: a reload always landed on Main). Only if it still exists, and
        // only if you have not already clicked somewhere while the roster was loading.
        try { const want = Number(localStorage.getItem(`antiloki:agents-tab:active:${selected}`)); if (want > 0 && mine.some((m: any) => m.pane_id === want)) setActive((a) => a ?? want); } catch { /* fine */ }
      } catch { /* the strip stays empty; ＋ still works */ }
    })();
    return () => { live = false; };
  }, [enabled, selected]);
  // …and the strip and the open tab are the SELECTED agent's, so switching agents never leaves another one's
  // fork on the stage (the same audit).
  React.useEffect(() => { setForks([]); setActive(null); }, [selected]);
  const [active, setActive] = React.useState<number | null>(null);
  // written on the operator's own picks only — an effect on `active` would erase the saved tab on mount, before the roster restores it
  const rememberActive = (id: number | null) => { try { const k = `antiloki:agents-tab:active:${selected}`; if (id == null) localStorage.removeItem(k); else localStorage.setItem(k, String(id)); } catch { /* fine */ } };
  const pickActive = (id: number | null) => { rememberActive(id); setActive(id); };
  const [forking, setForking] = React.useState(false);
  const [forkErr, setForkErr] = React.useState<string | null>(null);
  const forkable = true;

  // WHAT STOPS YOU OPENING ANOTHER (operator 2026-09-27: "the limit is the 16 or the ram < 500mb (a warnning
  // appears)"). Two ceilings, and they are different KINDS of limit.
  //
  // SIXTEEN is a choice: past it a tab strip is unreadable and you are managing tabs instead of work.
  // FIVE HUNDRED MEGABYTES is physics. Every fork is a worktree and a live CLI, and this machine has died of OOM
  // three times during benchmarking. A refusal here is cheaper than a machine that stops answering, and the number
  // comes from `agents/live`'s own `machine.available` rather than a guess.
  const MAX_TABS = 16;
  const MIN_FREE_MB = 500;
  const [freeMb, setFreeMb] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    const tick = async () => {
      try { const r: any = await apiGet("/api/v1/cockpit/agents/live", { timeoutMs: 8_000 } as any);
        const avail = Number(r?.machine?.available); if (live && Number.isFinite(avail)) setFreeMb(Math.round(avail / 1_048_576)); }
      catch { /* keep the last reading — a missed poll is not a low-memory signal */ }
    };
    void tick(); const h = setInterval(tick, 15_000);
    return () => { live = false; clearInterval(h); };
  }, [enabled]);
  // THE ACTIVE TAB'S OWN EPISODES. A fork has no recipe, so the roster cannot carry them; `cockpit/chats` lists
  // every agent pane with its episodes, which is where a fork's live.
  const [tabEpisodes, setTabEpisodes] = React.useState<any[] | null>(null);
  React.useEffect(() => {
    if (!enabled || active == null) { setTabEpisodes(null); return; }
    let live = true;
    const tick = async () => {
      try {
        const r: any = await apiGet("/api/v1/cockpit/chats", { timeoutMs: 10_000 } as any);
        const row = (r?.chats ?? []).find((c: any) => Number(c?.pane_id) === active);
        if (live) setTabEpisodes(row?.episodes ?? []);
      } catch { /* keep the last list rather than blanking the sidebar on one missed poll */ }
    };
    void tick(); const h = setInterval(tick, 6_000);
    return () => { live = false; clearInterval(h); };
  }, [enabled, active]);

  const tabsFull = forks.length + 1 >= MAX_TABS;
  const lowMemory = freeMb != null && freeMb < MIN_FREE_MB;
  const forkBlocked = tabsFull ? `${MAX_TABS} tabs is the limit — close one first` : lowMemory ? `only ${freeMb} MB free; a fork wants a worktree and a live CLI. Close a tab or something else first.` : null;

  const fork = async (paneId: number) => {
    if (forkBlocked) { setForkErr(forkBlocked); return; }
    setForking(true); setForkErr(null);
    try {
      const r: any = await apiPost("/api/v1/cockpit/pane/fork", { pane_id: paneId }, { timeoutMs: 60_000 } as any);
      const d = r?.result ?? r;
      const p = d?.pane;
      if (!p?.id) throw new Error(String(d?.error ?? "the fork came back without a pane"));
      setForks((fs) => [...fs, { pane_id: Number(p.id), session_id: Number(p.session_id ?? 0), name: String(d.name ?? `fork ${fs.length + 1}`), preparing: d.preparing !== false }]);
      pickActive(Number(p.id));   // a new tab opens focused, the way a terminal's does
    } catch (e: any) {
      // A BUTTON THAT DOES NOTHING IS THE WORST ANSWER (operator 2026-09-27: "I cilcked on the + to create a new
      // agent and nothing happened"). This used to swallow the error, so a 404 from a serve without the endpoint
      // looked identical to a click that missed.
      setForkErr(String(e?.message ?? e));
    }
    finally { setForking(false); }
  };
  // CLOSING A FORK ASKS WHERE THE WORK GOES (operator 2026-09-27: "the user can close the agent wich is like to
  // close the episode with merge and stuff but also kills the new agent").
  //
  // A fork has its own worktree, so closing one without asking would silently drop whatever it wrote — which is the
  // one thing a temporary agent must never do. `AgentCloseDialog` is the flow that already exists for this: it shows
  // what the box changed and offers merge / discard / keep, and the SEAL refuses a PR when QA failed. ✕ raises it
  // rather than removing the pane, so a fork closes the same way any other agent does.
  const [closing, setClosing] = React.useState<number | null>(null);
  const closeFork = (paneId: number) => setClosing(paneId);
  // THE DIALOG'S THIRD ANSWER IS "KEEP THE BOX", AND IT CALLS THE SAME `onDone`. Merge and discard dispose of the
  // pane; keep does not — so a strip that forgets the tab on `onDone` would lose the way back to an agent that is
  // still running, with its worktree and its episodes intact. The three answers are indistinguishable from here, so
  // this ASKS whether the pane survived rather than inferring it from which button was pressed.
  const forkClosed = async (paneId: number) => {
    setClosing(null);
    let gone = true;
    try {
      const r: any = await apiGet("/api/v1/cockpit/agents/live", { timeoutMs: 10_000 } as any);
      const live = Array.isArray(r?.agents) ? r.agents : [];
      gone = !live.some((a: any) => Number(a?.pane_id) === paneId);
    } catch { gone = false; }   // couldn't ask → keep the tab; a stray tab is recoverable, a lost agent is not
    if (gone) {
      setForks((fs) => fs.filter((f) => f.pane_id !== paneId));
      if (active === paneId) rememberActive(null);
      setActive((a) => (a === paneId ? null : a));
    }
  };
  const agent = agents.find((x) => x.slug === selected) ?? agents[0] ?? null;
  React.useEffect(() => { if (agent && agent.slug !== selected) pick(agent.slug); }, [agent?.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  // RENAME (operator 2026-09-23: "the created agents — I can rename, ok?"): the recipe's name, saved as it is
  const rename = async (slug: string, name: string) => { const rc = (await listRecipes()).find((r) => r.slug === slug); if (rc) { await saveRecipe({ ...rc, name }); q.refetch(); } };
  const loading = !q.data;   // the first roster fetch has not landed yet
  // HIRING (2026-09-23). The role carries the skills, the specialists and the measured merge; the operator carries
  // the name, the purpose and the scope. Nothing else is asked, and everything is editable afterwards in settings.
  const [adding, setAdding] = React.useState(false);
  const [hireErr, setHireErr] = React.useState<string | null>(null);
  const [hiring, setHiring] = React.useState(false);
  const hire = async (d: AgentDraft, role: RoleWithMerges) => {
    setHiring(true); setHireErr(null);
    try {
      // A SOLO PICK IS NOT A MERGE (2026-09-23: "any way we can use solo AIs too"): one model does both halves, so
      // there is no pair at all and the router binds that one model per job. Otherwise the role's measured merge.
      const m = d.solo ? null : role.merges?.find((x) => x.objective === d.objective);
      const solo = d.solo ? soloSide(d.solo) : null;
      const brain = solo ?? (m?.brain ? sideFromKey(m.brain) : null);
      const hands = solo ?? (m?.hands ? sideFromKey(m.hands) : null);
      // a side nobody measured is the other side, and with neither the seat the serve plans on - never a fixed Claude or the Zen gateway (review 2026-10-01)
      const seats = await fetchSeats();
      const rc = {
        ...blankRecipe(seats?.defaultKey),
        name: d.name.trim(), description: d.purpose.trim() || role.about,
        role: role.key, objective: d.solo ? "" : d.objective,
        scope: d.scope, skills: [...role.skills], specialists: [...role.specialists], ask: "",
        box: d.box ?? "",   // a box of its own, or the workspace (2026-09-24)
        ...(brain || hands ? { provider: (brain ?? hands)!.engine, pair: { name: d.solo ? `${role.key}-solo` : `${role.key}-${d.objective}`, brain: (brain ?? hands)!, hands: (hands ?? brain)! } } : {}),
      };
      const r = await saveRecipe(rc);
      if (!r.ok) throw new Error(r.error ?? "the agent was not saved");
      setAdding(false);
      q.refetch();
      if (r.recipe?.slug) pick(r.recipe.slug);
    } catch (e: any) { setHireErr(String(e?.message ?? e)); }
    finally { setHiring(false); }
  };
  const side = <>
    <Roster agents={agents} selected={agent?.slug ?? ""} onSelect={pick} busy={busy} loading={loading} onAdd={() => { setHireErr(null); setAdding(true); }} onRename={(slug, name) => void rename(slug, name)} />
    {adding && <AddAgent onClose={() => setAdding(false)} onCreate={(d, role) => void hire(d, role)} busy={hiring} error={hireErr} />}
  </>;
  // THE FORKS OF THIS AGENT, as tabs (operator 2026-09-27). `active === null` is the agent itself; a number is the
  // fork's pane. Forks live only as long as the session chooses to keep them — closing one disposes of it.
  // DOUBLE-CLICK A TAB TO RENAME IT (operator 2026-09-28). A fork's name is its pane's `settings.title` (the same field
  // `agents/live` reads), written through the chat rename route that merges into the settings; Main's is its pane's title too. Both show at once from `names`, and both survive a reload because the serve has them.
  const [names, setNames] = React.useState<Record<string, string>>({});
  const renameTab = async (key: string, raw: string) => {
    const name = raw.trim().slice(0, 40); if (!name || !agent) return;
    if (key === "main") {
      setNames((n) => ({ ...n, [`a:${agent.slug}`]: name }));
      // Main has no recipe the wizard can save; its name is its pane's title, which the roster reads back
      if (basePane?.id) { try { await apiPost("/api/v1/cockpit/chat/rename", { pane_id: basePane.id, title: name }, { timeoutMs: 15_000 }); } catch { /* the label stays for this session */ } }
      return;
    }
    const id = Number(key);
    setForks((fs) => fs.map((f) => (f.pane_id === id ? { ...f, name } : f)));
    try { await apiPost("/api/v1/cockpit/chat/rename", { pane_id: id, title: name }, { timeoutMs: 15_000 }); } catch { /* the tab keeps the name until a reload */ }
  };
  const basePane = agent ? (panes[agent.slug] ?? (agent.pane_id ? { id: agent.pane_id, session_id: 0 } : null)) : null;
  const shownPane = active != null ? (forks.find((f) => f.pane_id === active) ?? null) : basePane;
  const stage = agent
    ? <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {(forks.length > 0 || forkable) && (
          <ForkTabs agent={{ ...agent, name: names[`a:${agent.slug}`] ?? agent.name }} forks={forks} active={active} busy={forking}
            onPick={pickActive} onRename={(key, name) => void renameTab(key, name)}
            onFork={() => { if (basePane?.id) void fork(basePane.id); }}
            blocked={forkBlocked}
            onClose={(id) => closeFork(id)} />
        )}
        {forkErr && (
          <div data-testid="fork-error" onClick={() => setForkErr(null)} title="dismiss"
            style={{ flexShrink: 0, padding: "4px 12px", fontFamily: mono, fontSize: 9.5, color: C.warn, borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>⚠ {forkErr}</div>
        )}
        {closing != null && (
          <AgentCloseDialog kind={agent.engine} paneId={closing}
            onDone={() => void forkClosed(closing)} onCancel={() => setClosing(null)} />
        )}
        {(() => {
          const f = active != null ? forks.find((x) => x.pane_id === active) : null;
          // THE COMPOSER IS GATED ON THE BOX, not on the tab. A pane exists the moment ＋ returns; its worktree does
          // not, and an ask sent in that window goes into a half-cut box.
          if (f?.preparing) {
            return <ForkPreparing key={f.pane_id} paneId={f.pane_id} name={f.name}
              onReady={() => setForks((fs) => fs.map((x) => (x.pane_id === f.pane_id ? { ...x, preparing: false } : x)))} />;
          }
          return <AgentStage agent={agent} pane={active != null && shownPane ? { id: (shownPane as any).pane_id, session_id: (shownPane as any).session_id } : basePane} err={err} />;
        })()}
      </div>
    : loading ? <div style={{ flex: 1 }} />
    : <div data-testid="agents-empty" style={{ flex: 1, display: "grid", placeItems: "center", fontFamily: mono, fontSize: 10.5, color: C.dim, textAlign: "center", lineHeight: 1.7 }}>no agents yet<br />pick a model or a role in the Studio to make one</div>;
  // the folded sidebar's strip — the same rows, the same selection, drawn small (operator 2026-09-25)
  const avatars = <RosterAvatars agents={agents} selected={selected} onSelect={setSelected} />;
  return { side, stage, selected, agents, avatars, tabEpisodes };
}
