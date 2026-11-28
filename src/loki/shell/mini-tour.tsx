// THE PROGRESSIVE TOUR (operator 2026-09-20: "each new feature a new user accesses unlocks a mini tour
// of 3 steps — divide by sections and only when the user accesses"; né the mini tour of 2026-09-18,
// five steps per screen). The app is SECTIONS; each has three steps that name a benefit and point at
// the thing (`anchor` = a data-tour / data-testid selector: the element gets an outline, the card
// sits next to it; no anchor on the page → bottom-right). A section unlocks the FIRST time it is
// reached — a route for the screens (`tourFor`), a mount for the surfaces inside a screen
// (`useTourUnlock` / `unlockTour`: the Studio preview, a chat pane, a goal run, the rail's views…) —
// and never again (localStorage, per install: `antiloki:tour:<id>`). Never one upfront walkthrough:
// a tour shows only on the section it belongs to, one at a time, and leaving the screen mid-tour
// puts it back for the next access. No library, no overlay that eats clicks.
import React from "react";
import { useLocation } from "@tanstack/react-router";
import { C, mono, nav } from "@/loki/theme";

/** `avoid` = a selector for something the card must not cover (Grokbot QA 2026-10-12, item 34: on a saga the card landed on the Telemetry panel). */
export type TourStep = { title: string; text: string; anchor?: string; avoid?: string };
export type TourId = "sagas" | "ide" | "saga" | "chats" | "desk" | "hire" | "studio" | "agent" | "goal-run" | "heimdall" | "agents-float" | "context" | "pulls"  | "design" | "knowledge" | "newpane" | "newteam" | "usage" | "machine";
export const TOURS: Record<TourId, { label: string; steps: TourStep[] }> = {
  // SAGAS (operator 2026-10-11: "add also mini tours on sagas"): the screen's own three steps on arrival, then three on the first saga that is opened.
  sagas: { label: "Sagas", steps: [
    { title: "The work, in one list", text: "A saga is a goal and the episodes that get it done. Every ask you give an agent shows up here by itself as a saga planned by Heimdall, and the ones you write yourself sit beside them.", anchor: '[data-tour="sagas-list"]' },
    { title: "Start one yourself", text: "New saga takes a title: the work you want done. Add episodes under it, assign them to yourself or to an agent, and the agents can read the list before they start, so nothing is done twice.", anchor: '[data-testid="saga-new"]' },
    { title: "Who did it, and with what", text: "Each row shows how far it got, the models that did the work (each with its own icon) and what it cost. Open one to see every task and the agent that did it.", anchor: '[data-tour="sagas-list"]' },
  ] },
  saga: { label: "A saga", steps: [
    { title: "Episodes and steps", text: "The saga's episodes, with steps under them. Click a circle to move an episode on (todo, in progress, done); click the title to open it. Type under the list to add one.", anchor: '[data-tour="saga-episodes"]', avoid: '[data-tour="saga-telemetry"]' },
    { title: "Every step has a name on it", text: "The activity trail says who did each thing: you, Heimdall, or an agent with the exact model that ran. A task that failed shows its agent with a red ring.", anchor: '[data-tour="saga-activity"]', avoid: '[data-tour="saga-telemetry"]' },
    { title: "The numbers are the real ones", text: "Time, cost, tokens and the models used come from the runs themselves, rolled up from the episodes. A finished saga stays as a record: it can no longer be canceled or deleted.", anchor: '[data-tour="saga-telemetry"]' },
  ] },
  chats: { label: "Chats", steps: [
    { title: "A conversation with antiloki", text: "Each chat is a session, like ChatGPT — but it reads everything: the agent's episodes, the goal runs, the codebase intel. It answers; it never changes code. Changing code is what the agent beside it does, in its own worktree.", anchor: "[data-tour='chats-sidebar']" },
    { title: "The context finds itself", text: "Before each answer the retriever picks what the ask needs and shows it under the reply as chips. Pin one to make it always ride in this session, drop one to keep it out.", anchor: "[data-tour='chats-thread']" },
    { title: "The episodes beside it", text: "Under the same heading sit this agent's episodes — each one a closed unit of work, with the consolidation it came to rather than a count of turns. The newest is first; the one you are in is still open at the top of the chat.", anchor: "[data-testid='side-tab-chats']" },
  ] },
  desk: { label: "Cowork", steps: [
    // REWRITTEN 2026-11-22 (the operator: "the onboarding is all old"): the screen as it is today
    { title: "Spaces, threads, one agent", text: "Each project is a space; each space has threads, and a thread is a set of panes laid out the way you like. The logo at the right of the bottom bar opens the menu (spaces, threads, agents and their sagas). Ctrl+Space is the leader key: then T opens a terminal, A an agent, B a browser, F files, 1 to 0 a thread.", anchor: "[data-testid='cowork-sidebar']" },
    { title: "Panes of every kind", text: "+ opens the pane menu: a terminal or an agent, a specialist (one an agent made waits there under \"Waiting for your approval\"), a model on this machine, a light browser of your ports, a full browser, Files, your apps, Sagas and X-ray. A team's bar switches Chat, Graph, Editor and Sequence.", anchor: "[data-testid='add-pane']" },
    { title: "Money and limits, at the bottom", text: "The bottom bar shows the time and cost of the team you are in (click it for the waterfall), what your runs saved and each AI's 5-hour and weekly limits. When memory or CPU runs short, background runs pause by themselves and continue when there is room.", anchor: "[data-testid='instruments-inline']" },
  ] },
  newpane: { label: "A new pane", steps: [
    { title: "Every new pane is made by a team", text: "Each kind has a team template behind it. A web app: a team designs a pane from the app's own tools, you approve the design, and it writes the page as a draft. Recreated: the REA team studies the app and builds the pane. Deterministic: a team finds the right zero-AI X-ray source, previews it and saves a widget. A specialist, an agent with memory, is written down and not built yet.", anchor: "[data-testid='new-pane-kinds']" },
    { title: "Nothing runs behind your back", text: "A team studies an app only after you sign in once in a window, and you approve the design before any code. A page that a team, an agent or a person made starts as a draft: its card lists the apps and the exact tools it may read and write, and only your click approves it." },
    { title: "Writes ask every time", text: "Even an approved pane cannot change an app without your click: antiloki draws a card with every argument in words, outside the page, and a destructive tool needs a second tick. Export a pane as one file from its header, import it from the Your panes menu; an import is a draft again." },
  ] },
  newteam: { label: "A new team", steps: [
    { title: "Start from a team that was proven", text: "The library lists ready teams: recreate a web app, SEO audit, marketing campaign, lead capture, sales follow-ups and bug hunter. A verified badge means a real run of that team finished; a draft means it has not run yet, so treat its first run as a trial.", anchor: "[data-testid='new-team-templates']" },
    { title: "Every team has a ceiling and a gate", text: "You set the budget it may not pass, and the steps that matter stop for your approval. Nothing is sent, published or changed in your apps by a template team without that approval.", anchor: "[data-testid='new-team-goal']" },
    { title: "The Leader, and watching the code", text: "The Leader is the Chat view of the team: it is the first option of the bar that also has Graph, Editor and Sequence. Editor shows every agent as a coloured pointer typing its files, read-only while they work, and a preview node keeps the app running so you can see it before you approve. Evolve (the DNA icon) and Swarm (the bee) improve a team by experiment, and a team that works can be shared as a template." },
  ] },
  machine: { label: "Machine", steps: [
    { title: "Three rings, one machine", text: "CPU, RAM and VRAM, read every two seconds. A ring turns amber at 80% and red at 92%, the point where the machine starts to swap and agents stall. A dash means this machine cannot say, never a made-up zero." },
    { title: "Before it freezes", text: "Running a local model next to several agents is what fills VRAM and RAM. The line under the rings names the heaviest process and what to stop first, so you act before anything hangs." },
    { title: "Who is using it", text: "The list shows the processes that hold the most memory, marked as a local model, an agent, the serve or a dev tool, with their CPU and RAM. The bottom bar's three little bars show the same at a glance." },
  ] },
  usage: { label: "Usage", steps: [
    { title: "What was spent", text: "The figure on top is the last seven days: every call in the record plus what the team runs spent. The line under it counts calls and failures, so a zero here means nothing ran." },
    { title: "Seat by seat", text: "Each row is a seat, with its 5-hour and weekly window and what it cost; the thin line under the name is its share of the spend. A seat that is out of quota says so, and the router sends its work to one with room." },
    { title: "All the numbers", text: "The button opens the full window: every model, every window, the saving against running everything at the top tier." },
  ] },
  hire: { label: "Hiring an agent", steps: [
    { title: "+ hires one", text: "Give it a name, a role and the files it may write. The scope is enforced by the tool, not by a sentence in the prompt: a write outside it is refused before the file changes. Start narrow — widening it later is one click.", anchor: "[data-testid='agents-add']" },
    { title: "Its merge: two models, one agent", text: "The brain plans, verifies and judges; the hands edit and look things up. Heimdall sends each job to the side that should have it, so the expensive model is paid for thinking rather than for typing. Measured 2026-09-22: 8 modules for $0.25 against $1.28 raw, same 37/37 checks.", anchor: "[data-testid='merge-config']" },
    { title: "Only what this machine can run", text: "antiloki drives the agent CLIs you already signed into and bundles no model of its own, so a merge whose engine is missing here is shown locked with the one command that installs it — and what installing it would have saved on a real run.", anchor: "[data-testid='merge-unlock']" },
  ] },
  studio: { label: "Studio", steps: [
    { title: "A widget, previewed live", text: "This is the real widget on your real data, not a screenshot. Scroll it, click it — nothing here is saved until you add it.", anchor: "[data-testid='studio-preview']" },
    { title: "What it does, what it costs", text: "The intro names the job, the moves, and the price: which engine and tier it calls, how many tokens a run tends to spend. Free means free — most of the analysis widgets run with no AI at all.", anchor: "[data-testid='studio-intro']" },
    { title: "Open it, or add it here", text: "Opening it starts a fresh split with this widget alone; adding it here drops it beside what you are already looking at. Both keep whatever you changed in the preview, so the thing you tried is the thing you get.", anchor: "[data-testid='preview-new-thread']" },
  ] },
  agent: { label: "The agent", steps: [
    { title: "An agent in a box", text: "Claude, Codex, Gemini, Grok or Cursor as a conversation — its own worktree, its own scope. A write outside the files you allowed is refused by the tool before the file changes, not by a sentence in the prompt. Every tool call is a card; the cost sits on each turn.", anchor: "[data-testid='agent-turns']" },
    { title: "The composer", text: "Type @ to reference a card, a doc, a code file or a live source; # for a widget. /model switches the tier's model, /tier the router's tier. The context button opens the wizard — packs, scope, the AI's own memory, read-only." },
    { title: "Heimdall reads it first", text: "With the router on, every ask is graded before the engine sees it: one job at the cheapest tier that can do it, or a plan of tasks. The chip is the switch; the rail's ⚡ ? ⋔ views are its log, its questions and its plans.", anchor: "[data-testid='agent-heimdall-chip']" },
  ] },
  "goal-run": { label: "Goal runs", steps: [
    { title: "A plan, not a prompt", text: "The agent split the goal into tasks that own disjoint files, laid out in waves. One dot per task: a slow breath while it runs, a sweep while the verifier reads it, a pop when it passes, a shake when it is rejected and retried.", anchor: "[data-testid='goal-strip']" },
    { title: "Verify, then join", text: "Each task is judged against its own acceptance by a second call at a higher tier; a strict reject sends it back once. When the last wave settles, one joined report lands in the agent's chat — one change list, not six branches.", anchor: "[data-testid='goal-join']" },
    { title: "The gates and the savings", text: "Ask me first holds the plan for your approval; blocking questions park it for one answer round. Write runs end at a QA gate (the related tests) and can open a PR. The ledger prices every run against all-high — that is the saved money on the pill.", anchor: "[data-testid='goal-savings']" },
  ] },
  heimdall: { label: "Heimdall", steps: [
    { title: "⚡ The route", text: "Each ask's verdict: one job or a plan, the tier and model it went to, how sure the router was, and what the same turn would have cost raw. Open an ask to see its events.", anchor: "[data-testid='rail-heimdall']" },
    { title: "? The screen", text: "Before planning, Heimdall asks what it cannot assume — one round, defaults if you stay silent — and lists what it assumed on its own so a wrong guess is one click to correct.", anchor: "[data-testid='rail-screen']" },
    { title: "⋔ The plan", text: "The current plan by wave — approve it, watch the tasks settle, read the report — and the earlier ones. Heimdall, the router, explains each choice under the Route view.", anchor: "[data-testid='rail-plan']" },
  ] },
  "agents-float": { label: "Your agents, anywhere", steps: [
    { title: "They keep working", text: "Go anywhere — Sagas, another agent — and they stay in this corner: one card each, live memory beside it, a bar while it thinks or while its plan runs, and one line of what it is on right now.", anchor: "[data-testid='agents-float']" },
    { title: "Click to go there", text: "A card takes you straight to that agent's pane, wherever you were. The runs live on the serve, not in this tab, so nothing pauses when you navigate away or close the browser entirely.", anchor: "[data-testid='agents-float']" },
    { title: "Fold it", text: "The pill folds the stack to a count so the screen underneath stays clear; unfold it when a bar finishes. On the agents surface it starts folded, so the Studio's own buttons are never covered by it.", anchor: "[data-testid='agents-float-pill']" },
  ] },
  context: { label: "Context library", steps: [
    { title: "Who knows what", text: "Every owner of context and its sources: antiloki's own — reviews, docs, cards, code — and the AIs' memories on this machine (Claude, Codex, OpenCode), read-only. Pick a source to see its chunks.", anchor: "[data-testid='context-library']" },
    { title: "Chunks → a pack", text: "Search, preview, read a chunk, add it to the pack you are building. Paste your own notes as chunks too. A pack is an ordered set with a name and a note — the brief you would otherwise retype.", anchor: "[data-testid='chunk-search']" },
    { title: "A pack is reachable everywhere", text: "Saved, it is pack:<slug> in every scope picker, a context_pack in notebooks, and a pack in the agents' catalog — the same context for one pane, a whole roster or a mission. Nothing is ever written back to the AI stores.", anchor: "[data-testid='pack-save']" },
  ] },
  pulls: { label: "Pull requests", steps: [
    { title: "Each box, one proposal", text: "Every agent pane's branch against its base: the diff, mergeability, an AI summary and the blast radius. A goal run in write mode opens one of these with the goal as the title and the joined report as the body." },
    { title: "Review by file, readiness first", text: "The queue is ranked by readiness; the detail opens on the verdict. Read each changed file in its real worktree context, edit an in-scope line yourself or ask for a regenerated range — out-of-scope files stay read-only. Two live terminals run the build and the tests against the box." },
    { title: "Merge safely", text: "The merge is plumbing — no working-tree checkout, no surprise rebase. Close the box afterwards to release its scope claims so the next agent can take those files." },
  ] },
  ide: { label: "X-ray", steps: [
    { title: "Overview", text: "X-ray is the code analysis. Overview is the verdict: health and risk with their trend, the codebase as a map (every file a box — area is its mass, color its health, five lenses), hotspots, and the activity — commits, history, authors.", anchor: "[data-tour='ide-front-page']" },
    { title: "Code · Quality · Architecture · History", text: "The tree and every file judged, its review where the editor would be; the laws the code breaks and what the tests never reach; the system diagram and the import graph with its blast radius; the review over time, the git graph, who wrote what.", anchor: "[data-testid='dash-tab-code']" },
    { title: "Hand it to an agent", text: "Everything measured here is what the agents receive as context — a pack, a scope, a brief. Cowork, the other word on this pill, is where they work: one box each, and the X-ray findings already loaded.", anchor: "[data-testid='screen-switch']" },
  ] },
  design: { label: "Design", steps: [
    { title: "Your screens, captured", text: "Frames taken from the running app, pixel-perfect, one per route and state — the design as it is, not as the mockup said.", anchor: "[data-testid='dash-tab-design']" },
    { title: "The system and its drift", text: "The palette, the type scale and the spacing extracted from the code, the components auto-detected — and where a screen drifts from them, per token." },
    { title: "Edit a frame → a change", text: "Move, recolor or retype directly on the frame; 'changes detected' turns what you did into a prompt, an RFC, or an agent already scoped to the files those tokens live in." },
  ] },
  knowledge: { label: "Knowledge", steps: [
    { title: "What the system remembers", text: "Memories, decisions and insights with their provenance — who learned what, when, from which run — and how often each one was used since." },
    { title: "The graph and the sources", text: "Memories linked to cards, files and each other — follow a node to see what a decision touched. Sources are what the RAG reads: add one, read it, sweep it into the graph." },
    { title: "Feed it to the agents", text: "Memory RAG is part of every context bundle a pane or a mission receives; the personas carry it as their standing brief. What you correct here changes the next ask." },
  ] },
};

const KEY_PREFIX = "antiloki:tour:";
export const tourKey = (id: TourId) => `${KEY_PREFIX}${id}`;
export function tourSeen(id: TourId): boolean { try { return localStorage.getItem(tourKey(id)) === "seen"; } catch { return true; } }
export function markTourSeen(id: TourId) { try { localStorage.setItem(tourKey(id), "seen"); } catch { /* private mode */ } }
/** Forget every section (the palette's "Welcome tour"): the current screen's tour comes back at once, the others on their next access. */
export function resetTours() {
  try { for (const id of Object.keys(TOURS) as TourId[]) localStorage.removeItem(tourKey(id)); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(RESET_EVENT));
}

// ── unlocking ────────────────────────────────────────────────────────────────────────────────
const UNLOCK_EVENT = "antiloki:tour-unlock";
const RESET_EVENT = "antiloki:tour-reset";
/** A surface inside a screen was reached (the Studio preview opened, a chat pane mounted…). No-op once seen. */
export function unlockTour(id: TourId) {
  if (typeof window === "undefined" || tourSeen(id)) return;
  window.dispatchEvent(new CustomEvent(UNLOCK_EVENT, { detail: { id } }));
}
/** Mount-time unlock for a surface: `useTourUnlock("agent")`; `when` gates it (e.g. the floating bar has an agent). */
export function useTourUnlock(id: TourId, when = true) {
  React.useEffect(() => { if (when) unlockTour(id); }, [id, when]);
}

/** The screen-level section of a path, or null (its surfaces unlock their own). Pure — tested. */
export function tourFor(pathname: string): TourId | null {
  if (pathname === "/") return "desk";
  if (pathname.startsWith("/sagas")) return "sagas";
  if (pathname.startsWith("/operations/atlas")) return "ide";
  if (pathname.startsWith("/operations/design")) return "design";
  if (pathname.startsWith("/operations/pulls")) return "pulls";
  if (pathname.startsWith("/knowledge")) return "knowledge";
  return null;
}

type Rect = { left: number; top: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
/** Where the card goes for an anchor rect: right of it when there is room, else below, else left; bottom-right without one. With `avoid` (a rect the card must not cover) the first of those that does not
 *  cover it, then the two bottom corners, is taken; if every place covers it, the usual one. Pure — tested. */
export function placeCard(anchor: Rect | null, vw: number, vh: number, cw = 340, ch = 200, avoid: Rect | null = null): { left: number; top: number } {
  const corner = { left: Math.max(8, vw - cw - 18), top: Math.max(8, vh - ch - 18) };
  if (!anchor) return corner;
  const gap = 14;
  const clampTop = (t: number) => Math.min(Math.max(8, t), Math.max(8, vh - ch - 8));
  const cands: { left: number; top: number }[] = [];
  if (anchor.left + anchor.width + gap + cw <= vw) cands.push({ left: anchor.left + anchor.width + gap, top: clampTop(anchor.top) });
  if (anchor.top + anchor.height + gap + ch <= vh) cands.push({ left: Math.min(Math.max(8, anchor.left), Math.max(8, vw - cw - 8)), top: anchor.top + anchor.height + gap });
  if (anchor.left - gap - cw >= 0) cands.push({ left: anchor.left - gap - cw, top: clampTop(anchor.top) });
  cands.push(corner);
  if (!avoid) return cands[0];
  const clear = (p: { left: number; top: number }) => !overlaps({ left: p.left, top: p.top, width: cw, height: ch }, avoid);
  return cands.find(clear) ?? [{ left: 18, top: corner.top }].find(clear) ?? cands[0];
}

/** The next section to show: the first queued one not yet seen. Pure — tested. */
export function nextTour(queue: TourId[], seen: (id: TourId) => boolean): TourId | null {
  return queue.find((id) => !seen(id)) ?? null;
}

/** One section's three steps. `onDone(seen)` — true after "got it" / ✕ (remembered), false when the host closes it early (comes back). */
export function MiniTour({ id, onDone }: { id: TourId; onDone?: (seen: boolean) => void }) {
  const [step, setStep] = React.useState(0);
  const [rect, setRect] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [avoidRect, setAvoidRect] = React.useState<Rect | null>(null);
  const { label, steps } = TOURS[id];
  React.useEffect(() => { setStep(0); }, [id]);
  // find the step's anchor (the surface may still be rendering — retry briefly), and follow it on resize
  React.useEffect(() => {
    const sel = steps[step]?.anchor; const avoidSel = steps[step]?.avoid;
    let tries = 0; let timer: number | undefined;
    const measure = () => {
      const av = avoidSel ? (document.querySelector(avoidSel) as HTMLElement | null) : null;
      if (av) { const r = av.getBoundingClientRect(); setAvoidRect({ left: r.left, top: r.top, width: r.width, height: r.height }); } else setAvoidRect(null);
      const el = sel ? (document.querySelector(sel) as HTMLElement | null) : null;
      if (el) { const r = el.getBoundingClientRect(); setRect({ left: r.left, top: r.top, width: r.width, height: r.height }); }
      else { setRect(null); if (sel && tries++ < 10) timer = window.setTimeout(measure, 250); }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("resize", measure); if (timer) window.clearTimeout(timer); };
  }, [step, steps]);
  const last = step >= steps.length - 1;
  const done = () => { markTourSeen(id); onDone?.(true); };
  const s = steps[step];
  const pos = placeCard(rect, window.innerWidth, window.innerHeight, 340, 200, avoidRect);
  return (
    <>
      {rect && <div data-testid="tour-spot" aria-hidden style={{ position: "fixed", left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8, borderRadius: 10, outline: `2px solid ${C.brand}`, boxShadow: `0 0 0 6px color-mix(in oklab, ${C.brand} 18%, transparent), 0 0 0 9999px rgba(0,0,0,.28)`, pointerEvents: "none", zIndex: 219, transition: "left .25s ease, top .25s ease, width .25s ease, height .25s ease" }} />}
      <div data-testid={`tour-${id}`} role="dialog" aria-label={`${label} tour`}
        style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 1400, width: 340, borderRadius: 12, padding: "14px 16px 12px", background: `color-mix(in oklab, ${C.panel} 97%, transparent)`, border: `1px solid ${C.border}`, boxShadow: "0 18px 50px rgba(0,0,0,.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", fontFamily: nav, transition: "left .25s ease, top .25s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span data-testid="tour-label" style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: C.brand }}>{label} · {step + 1}/{steps.length}</span>
          <span style={{ flex: 1 }} />
          <button data-testid="tour-skip" onClick={done} title="skip this one" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: mono, fontSize: 11, padding: 0 }}>✕</button>
        </div>
        <div data-testid="tour-title" style={{ fontSize: 14, fontWeight: 700, color: C.fg, marginBottom: 4 }}>{s.title}</div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{s.text}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          {steps.map((_, i) => <span key={i} onClick={() => setStep(i)} style={{ width: 6, height: 6, borderRadius: 6, background: i === step ? C.brand : C.border, cursor: "pointer" }} />)}
          <span style={{ flex: 1 }} />
          {step > 0 && <button onClick={() => setStep((x) => x - 1)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: mono, fontSize: 10.5 }}>back</button>}
          <button data-testid="tour-next" onClick={() => (last ? done() : setStep((x) => x + 1))} style={{ background: C.brand, border: `1px solid ${C.brand}`, color: C.bg, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: mono, fontSize: 10.5, fontWeight: 700 }}>{last ? "got it" : "next"}</button>
        </div>
      </div>
    </>
  );
}

/** The host at the root: the screen's section on each route, the surfaces' sections as they unlock — one card at a time,
 *  the next one a beat after the current is done. Leaving the screen closes the open tour WITHOUT marking it (it comes back). */
export function ProgressiveTour() {
  const { pathname } = useLocation();
  const [queue, setQueue] = React.useState<TourId[]>([]);
  const [current, setCurrent] = React.useState<TourId | null>(null);
  const [, bump] = React.useReducer((x: number) => x + 1, 0);
  const enqueue = React.useCallback((id: TourId) => { if (!tourSeen(id)) setQueue((q) => (q.includes(id) ? q : [...q, id])); }, []);
  // the screen's own section on arrival; a change of screen drops what was open and what waited
  React.useEffect(() => {
    setCurrent(null); setQueue([]);
    const id = tourFor(pathname);
    if (id) enqueue(id);
  }, [pathname, enqueue]);
  React.useEffect(() => {
    const onUnlock = (e: Event) => { const id = (e as CustomEvent<{ id: TourId }>).detail?.id; if (id && TOURS[id]) enqueue(id); };
    const onReset = () => { setCurrent(null); setQueue([]); const id = tourFor(pathname); if (id) enqueue(id); bump(); };
    window.addEventListener(UNLOCK_EVENT, onUnlock); window.addEventListener(RESET_EVENT, onReset);
    return () => { window.removeEventListener(UNLOCK_EVENT, onUnlock); window.removeEventListener(RESET_EVENT, onReset); };
  }, [pathname, enqueue]);
  // promote the next unseen section when nothing is showing — a beat later so two never stack
  React.useEffect(() => {
    if (current) return;
    const id = nextTour(queue, tourSeen);
    if (!id) return;
    const t = window.setTimeout(() => { setCurrent(id); setQueue((q) => q.filter((x) => x !== id)); }, 600);
    return () => window.clearTimeout(t);
  }, [current, queue]);
  if (!current) return null;
  return <MiniTour key={current} id={current} onDone={() => setCurrent(null)} />;
}
