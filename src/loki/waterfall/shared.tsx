// Shared blocks, utils and constants for the waterfall view modules.
// Extracted verbatim from waterfall-live.tsx (refactor split, 2026-06-09).
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { toLocalHMS } from "@/loki/utils/time";
import { AIChip } from "@/loki/components/AIChip";
import type { RewindTarget } from "@/loki/api/dispatch";
import type { ProcessEvent } from "@/loki/api/hooks";

// Real driver state machine (matches state-machine-rules.mjs).
// Order MIRRORS the executor (state-machine-rules.mjs) as projected into the
// SST agent_stages.pipeline_order: the contract is DRAFTED (tl_draft) before
// PL RATIFIES it (pl_ratify), so pl_ratify sits AFTER tl_draft. This matters
// for currentKind ("deepest reached") — with the rows inverted, a redraft
// rewind (tl_draft → pl_ratify) left the spinner stuck on tl_draft instead of
// advancing to pl_ratify. SST verification: pl.contract draft=6/7, ratify=8.
export const PHASES = [
  { kind: "propose",    label: "propose" },
  { kind: "pl_session", label: "PL session" },
  { kind: "tl_draft",   label: "TL draft" },
  { kind: "pl_ratify",  label: "PL ratify" },
  // EPIC-SWARM FOLD-IN (operator directive 2026-06-14): the blueprint swarm is NOT
  // its own set of stages — it is the FAN-OUT OF CALLS INSIDE TL Plan + TL Snippets
  // ("swarm because many calls, one per microtask / one per snippet"). So the
  // nucleus design + lint live UNDER tl_plan and the per-file author + per-file
  // review live UNDER tl_author (see PHASE_TO_SWARM_ACTIONS + op-classify). The old
  // standalone manifest_design/manifest_lint/swarm_author/review_swarm rungs are
  // gone; their actions now classify into tl_plan / tl_author.
  // TL-REFINE-STAGE-SPLIT (2026-06-11): the monolithic refine stage split
  // into plan (high-tier thinking, file specs, no code) and per-file
  // snippet authoring (N low-tier calls), with a QA plan review between.
  { kind: "tl_plan",    label: "TL plan" },
  // FIX-PLAN-QA-SPLIT (2026-06-14): the plan QA is TWO rungs in order — a
  // DETERMINISTIC coverage gate (file-exists + grep) FIRST, then the advisory
  // AI review. pipeline_order 9.2 < 9.3 matches this coverage→review order.
  { kind: "plan_coverage", label: "QA plan coverage" },
  // FIX-QA1-TRUTH: the plan-mode QA review is its own rung BETWEEN plan and
  // author — without it, tonight's plan-review event classified into the
  // late qa_contract row and the ladder painted progress through TL author/
  // sign/PL review stages that never ran.
  { kind: "plan_review", label: "QA plan review" },
  { kind: "tl_author",  label: "TL author snippets" },
  { kind: "tl_sign",    label: "TL sign" },
  { kind: "pl_review",  label: "PL review" },
  { kind: "qa_contract", label: "QA contract review" },
  { kind: "man_audit",  label: "MAN phase 1" },
  { kind: "sandbox",    label: "sandbox" },
  { kind: "impl_start", label: "git-manager impl" },
  { kind: "impl_done",  label: "git-manager done" },
  { kind: "build_gate", label: "build check" },
  { kind: "qa_pass",    label: "QA verify" },
  { kind: "tl_amend",   label: "TL amend (retry)" },
  { kind: "man_review", label: "MAN review" },
  { kind: "keeper",     label: "Keeper consolidate" },
  { kind: "seal",       label: "close" },
];

// PIPELINE-V2 ladder (ANTILOKI_PIPELINE_V2). The blueprint pipeline's OWN rungs —
// selected by waterfall-live when driver-status reports pipeline_v2, so the
// waterfall reflects the live pipeline instead of the v1 stages. Same {kind,label}
// shape as PHASES; the kinds are classified by classifyOpV2 + grouped into the 3
// columns by STATIC_FE_GROUP_V2 (waterfall-live).
export const PHASES_V2 = [
  // No 'propose' rung: the card already existing IS the proposal (the interviewer
  // created it via card-add before the driver picks it up) — the driver never runs a
  // propose step, so screening is the first real v2 stage.
  { kind: "screening",       label: "PL screening" },
  { kind: "v2_contract",     label: "TL contract" },
  { kind: "pl_ratify",       label: "PL ratify" },
  { kind: "blueprint_design", label: "TL blueprint design" },
  { kind: "lint_design",     label: "lint design" },
  { kind: "judge_design",    label: "QA judge design" },
  { kind: "plan_seal",       label: "MAN plan seal" },
  { kind: "sandbox",         label: "build env" },
  { kind: "build_baseline",  label: "build · baseline" },
  { kind: "test_baseline",   label: "tests · baseline" },
  { kind: "snippet_author",  label: "DEV snippets" },
  { kind: "lint_code",       label: "lint snippets" },
  { kind: "judge_code",      label: "QA judge code" },
  { kind: "apply",           label: "DEV apply" },
  { kind: "build_gate",      label: "build check" },
  { kind: "test_gate",       label: "test run" },
  { kind: "bugfinder",       label: "bug finder" },
  { kind: "qa_pass",         label: "QA verify" },
  { kind: "build_seal",      label: "MAN build seal" },
  { kind: "keeper",          label: "Keeper consolidate" },
  { kind: "seal",            label: "close" },
];

// v2 kind → its happy-path action (parallel to PHASE_TO_ACTION). v2 actions are
// not in the BE SST stages, so the FE falls back to STATIC_FE_GROUP_V2 for grouping.
export const PHASE_TO_ACTION_V2: Record<string, string> = {
  screening: "pl.screening",
  v2_contract: "tl.contract.assemble",
  pl_ratify: "pl.ratify.contract", // the v2 action (card.gate.pl.ratify is v1 — mapping it here left the rung dark)
  blueprint_design: "blueprint.design",
  lint_design: "blueprint.lint.design", // deterministic lint gate (NOT the AI design action)
  judge_design: "blueprint.judge.design",
  plan_seal: "blueprint.plan.seal",
  sandbox: "git-manager.worktree.create", // v2 build env is the git worktree, not the COW sandbox
  build_baseline: "git-manager.build.baseline", // pristine-env build health, before any code
  test_baseline: "git-manager.test.baseline",   // pristine-env test health, before any code
  snippet_author: "snippet.author",
  lint_code: "blueprint.lint.snippets", // deterministic lint gate (NOT the AI author action)
  judge_code: "blueprint.judge.snippets",
  apply: "blueprint.apply",
  build_gate: "git-manager.build.gate",
  test_gate: "git-manager.test.gate", // AFTER-phase test run, right after the post-apply build check
  bugfinder: "system.bugfinder.run", // ADVISORY 3-wave defect gate — records findings, never blocks
  qa_pass: "qa.gate.contract.verify",
  build_seal: "blueprint.build.seal",
  keeper: "keeper.card.consolidate",
  seal: "board-keeper.card.status.change",
};

// STAGE_DOES — a plain-language decomposition of what each GATE actually does, shown as a trail
// under its title (operator 2026-07-09: "decompose the skills… I'm lost of this gate's importance").
// `why` = the one-line reason the gate exists; `steps` = the real skills it composes + what each
// checks. Keyed by phase kind (shared across v1/v2). Only the non-obvious gates are described —
// obvious rungs (propose/close) get nothing, keeping the ladder quiet.
export type StageStep = { key: string; text: string };
export const STAGE_DOES: Record<string, { why: string; steps: StageStep[] }> = {
  qa_pass: {
    why: "the deterministic ACCEPTANCE gate — mechanically proves the built code meets the contract (not by opinion). This is what makes 'done' true, not just judged good.",
    steps: [
      { key: "scope", text: "qa-scope-check — the diff stayed inside the files the contract declared; a rogue edit outside scope fails here" },
      { key: "acceptance", text: "qa-acceptance-run → dev-acceptance-run — runs EVERY acceptance criterion for real: file-exists · test (runs the cmd) · grep · diff-in-paths · sql · no-law-violation" },
      { key: "verdict", text: "verdict — all pass → the sandbox is merge-ready (handed to the PR gate); any fail → back to TL to re-author against the real output" },
    ],
  },
  build_gate: {
    why: "does the applied code actually COMPILE? catches patches that apply cleanly but don't build — before QA wastes a full acceptance cycle.",
    steps: [
      { key: "build", text: "git-manager.build.gate — runs the workspace build/compile in the sandbox (or worktree)" },
      { key: "route", text: "green → QA verify · red → TL re-authors against the REAL compiler errors (bounded, then escalate)" },
    ],
  },
  test_gate: {
    why: "runs the workspace test suite on the applied code — a green build can still fail its tests.",
    steps: [
      { key: "test", text: "git-manager.test.gate — runs the test cmd; SKIPS if the baseline was already broken or the gate is toggled off (never blames the card for pre-existing red)" },
      { key: "route", text: "live terminal streams the run; red → back to TL" },
    ],
  },
  bugfinder: {
    why: "the ADVISORY defect gate the pipeline never had — 'is this code defective?' A compiling, spec-satisfying bug passes every other gate; this one hunts it, then QA proceeds regardless (findings inform, never block).",
    steps: [
      { key: "wave1", text: "determinism ($0) — lint · typecheck · hallucinated import/symbol existence vs disk+atlas · structural smells ∩ scope" },
      { key: "wave2", text: "narrow low-tier shards, one bug species each (checking · algorithm · timing · interface · security · test-oracle); every lead needs a VERBATIM quote or is void" },
      { key: "wave3", text: "ONE mid-tier sweep for anything outside the covered categories — told what was already hunted, so it never re-buys a covered defect" },
      { key: "route", text: "fires ONCE per green test gate; findings land in the Bug Finder screen's ledger — QA follows next tick no matter what" },
    ],
  },
  lint_code: {
    why: "the cheap DETERMINISTIC structural gate before the AI court — checks the court shouldn't burn tokens on.",
    steps: [
      { key: "lint", text: "blueprint.lint.snippets — does it parse? · declared-N× (no duplicate symbols) · missing/unfilled · degenerate TODO-stub" },
      { key: "route", text: "RED short-circuits the court with a synthetic fail — the court never judges unparseable code" },
    ],
  },
  judge_code: {
    why: "the AI COURT on the authored code — is it CORRECT against the goal, not merely parseable?",
    steps: [{ key: "judge", text: "blueprint.judge.snippets — prosecutor argues defects, defender argues sufficiency; a single upheld defect blocks" }],
  },
  judge_design: {
    why: "the AI court on the BLUEPRINT, before any code — is the decomposition sound?",
    steps: [{ key: "judge", text: "blueprint.judge.design — prosecutor/defender over the design manifest; RED re-designs (bounded)" }],
  },
  lint_design: {
    why: "deterministic checks on the blueprint manifest (structure · bindings · type agreement) before authoring.",
    steps: [{ key: "lint", text: "blueprint.lint.design — RED re-designs (bounded), else proceeds to authoring" }],
  },
  plan_coverage: {
    why: "deterministic proof every acceptance criterion is covered by the plan — drives a reliable re-plan loop with no AI cost.",
    steps: [{ key: "coverage", text: "qa.contract.plan.coverage — file-exists + grep each acceptance against the plan; RED → TL re-plans the exact uncovered items" }],
  },
  build_baseline: {
    why: "is the build GREEN before any code lands? separates 'the card broke it' from 'it was already broken'.",
    steps: [{ key: "build", text: "git-manager.build.baseline — pristine-env build health; a broken baseline makes the later build gate skip instead of blaming the card" }],
  },
  test_baseline: {
    why: "are the tests GREEN before any code lands? the baseline that makes the test gate fair.",
    steps: [{ key: "test", text: "git-manager.test.baseline — pristine-env test health, recorded so the test gate can skip a pre-existing failure" }],
  },
  man_audit: {
    why: "MAN Phase-1 — deterministic contract sanity BEFORE sandbox/DEV (files_touched non-empty · acceptance present · core laws covered).",
    steps: [{ key: "audit", text: "man.audit.contract.signed — a malformed contract stops here, before any build cost is spent" }],
  },
  qa_contract: {
    why: "QA #1 — the THINKING review of the contract + code patches BEFORE DEV; bounces weak/out-of-scope work early.",
    steps: [{ key: "review", text: "qa.contract.review — a CONTRACT-level defect escalates (re-authoring can't fix it); a code-level defect → TL re-authors the snippets" }],
  },

  // ── producers (not gates, but decomposed too so the whole pipeline is legible) ──
  propose: {
    why: "the card itself IS the proposal — the interviewer created it before the driver picked it up.",
    steps: [{ key: "propose", text: "board-keeper.card.add — the card exists in backlog; the driver starts here" }],
  },
  screening: {
    why: "PL screens the card FIRST — is it clear, correctly sized, and worth starting? (too-big cards route back to decomposition).",
    steps: [{ key: "screen", text: "pl.screening — clarity + size estimate + a machine-readable screening record" }],
  },
  pl_session: {
    why: "the PL planning session for bigger work — clarify with the human, research, decompose, finalize.",
    steps: [{ key: "session", text: "pl.session.* — clarifying → researching → deciding_split → tuning → done (pauses for your answers)" }],
  },
  tl_draft: {
    why: "TL drafts the first contract from the plan.",
    steps: [{ key: "draft", text: "contract.draft.auto — assembles files_touched + acceptance + scope from the plan" }],
  },
  v2_contract: {
    why: "TL assembles the machine-checkable CONTRACT — the spec everything downstream is held to.",
    steps: [{ key: "assemble", text: "tl.contract.assemble — files_touched · acceptance criteria · out-of-scope · must-obey laws · base_sha" }],
  },
  pl_ratify: {
    why: "PL ratifies the contract INTENT — does the spec actually match what the card asked for?",
    steps: [{ key: "ratify", text: "pl.ratify.contract — a mismatch bounces back to TL to redraft (bounded), else advances" }],
  },
  blueprint_design: {
    why: "TL designs the BLUEPRINT — the typed dataflow manifest: which files/blocks exist, how they bind, what each exports.",
    steps: [{ key: "design", text: "blueprint.design — the skeleton the author swarm fills; feeds the deterministic lint + AI court next" }],
  },
  plan_seal: {
    why: "MAN seals the approved blueprint into the audit chain before any build env is created.",
    steps: [{ key: "seal", text: "blueprint.plan.seal — records the design + digital-print into the sacred timeline" }],
  },
  sandbox: {
    why: "creates the isolated BUILD ENV so DEV never writes the live tree — a COW sandbox (touched files only) or a full git worktree.",
    steps: [{ key: "env", text: "git-manager.worktree.create / tl.sandbox.create — the pristine tree the baselines + gates run against" }],
  },
  tl_plan: {
    why: "for M/L cards, TL plans the decomposition — file specs and defs, no code yet.",
    steps: [{ key: "plan", text: "tl.plan.contract — the microtask defs the coverage gate then checks against acceptance" }],
  },
  plan_review: {
    why: "QA reviews the decomposition (advisory) for open-ended quality after coverage is green.",
    steps: [{ key: "review", text: "qa.contract.review (mode=plan) — a contract-level impossibility escalates; microtask nits are advisory" }],
  },
  tl_author: {
    why: "TL authors the per-file snippets — the actual code, one unit per file.",
    steps: [{ key: "author", text: "tl.author.snippets — feeds the lint gate then the court; re-runs here on a build/QA RED" }],
  },
  snippet_author: {
    why: "the AUTHOR SWARM writes each file — cohesive files authored whole (one call), never per-function fragments concatenated.",
    steps: [{ key: "author", text: "snippet.author — the fix for the r40 class; truncation-retry rotates the model rather than dead-ending" }],
  },
  tl_sign: {
    why: "TL signs the contract — the final gate before MAN Phase 1.",
    steps: [{ key: "sign", text: "contract.gate.tl.sign — XS/S sign directly; M/L only once every file carries code" }],
  },
  pl_review: {
    why: "PL reviews TL's signed contract — the handshake before MAN.",
    steps: [{ key: "review", text: "pl.review.contract — pushback sets the contract rejected → TL redrafts (bounded)" }],
  },
  impl_start: {
    why: "DEV starts implementing — deterministically applying the authored code into the build env.",
    steps: [{ key: "impl", text: "git-manager.implement.code — a pure applier (no AI); a replay reproduces the same bytes" }],
  },
  impl_done: {
    why: "DEV finished applying — the build env now holds the candidate code, ready for the build gate.",
    steps: [{ key: "impl", text: "git-manager.implement.code — status → impl; the deterministic build gate runs next" }],
  },
  apply: {
    why: "DEV applies the composed blueprint into the build env — deterministic, no AI.",
    steps: [{ key: "apply", text: "blueprint.apply — writes the whole-file composition; the build gate verifies it compiles next" }],
  },
  tl_amend: {
    why: "TL amends the contract SCOPE — only when QA emitted a widen-files-touched microtask (DEV can't touch scope).",
    steps: [{ key: "amend", text: "tl.contract.amend — applies the scope change before DEV retries; capped, then escalate" }],
  },
  build_seal: {
    why: "MAN seals the built + verified code into the audit chain before the PR.",
    steps: [{ key: "seal", text: "blueprint.build.seal — records the passing build + QA + digital-print into the sacred timeline" }],
  },
  man_review: {
    why: "MAN's post-QA review + seal of the finished card (v1).",
    steps: [{ key: "review", text: "man.* — composes the digital print and closes the audit for this card" }],
  },
  keeper: {
    why: "Keeper consolidates what the session LEARNED — memories, the card's journey, prompt/model signals.",
    steps: [{ key: "consolidate", text: "keeper.card.consolidate — turns the run into durable memory + heimdall evidence" }],
  },
  seal: {
    why: "the card status flips to done — the board mirrors reality (a claim of done with no status change is a board lie).",
    steps: [{ key: "close", text: "board-keeper.card.status.change — the audited transition to done" }],
  },
};

// which decomposition step FAILED — maps the failure evidence the ladder already has onto a
// step key, so the error can name the exact sub-step (operator 2026-07-09). qa_pass distinguishes
// scope from acceptance via acceptance_fail; the other gates have one meaningful failing step.
export function failedStepKey(kind: string, ctx: { qaRun?: any } = {}): string | null {
  const def = STAGE_DOES[kind];
  if (!def) return null;
  if (kind === "qa_pass") {
    const q = ctx.qaRun;
    if (!q || q.all_passed) return null;
    return (q.acceptance_fail ?? 0) > 0 ? "acceptance" : "scope"; // acceptance criterion vs scope
  }
  // general: the failing step is the primary CHECK — skip steps that only describe the outcome/routing
  const primary = def.steps.find((s) => !["route", "verdict"].includes(s.key)) ?? def.steps[0];
  return primary?.key ?? null;
}

export const PL_COLOR  = "oklch(0.78 0.16 295)";
export const DEV_COLOR = "oklch(0.80 0.15 145)";
export const QA_COLOR  = "oklch(0.72 0.18 25)";
export const AI_COLOR  = "oklch(0.78 0.13 200)";

// FEAT-CARD-REWIND-TO-STAGE: each LEFT-column phase maps to the rewind
// target that re-runs the process FROM that phase. Clicking "rewind to here"
// resets contract.status + downstream flags and GCs everything produced
// after the target (sandbox dir, qa runs, man reports, blueprints, pending
// diffs, post-QA events, journey). NOT a history revert. Phases that share a
// re-entry point collapse to the same target.
// The pre-decomposition phases (propose → tl_draft) have NO target that
// re-runs FROM them: the only thing that re-authors the contract is
// `redraft` (TL writes a fresh v2). Mapping them to `microtasks` was wrong —
// that target sets status='pl_ratified', i.e. the state AFTER those phases,
// so clicking "rewind to TL draft" jumped the machine FORWARD to tl.sign →
// pl.review instead of redoing the draft. `redraft` restarts the contract
// lifecycle (new contract at 'proposed' → PL ratify → TL draft → …), which
// is what "rewind to here" means for these phases. tl_refine is the first
// phase a target can truly re-run (microtasks = re-decompose, keep contract).
export const PHASE_TO_REWIND: Record<string, RewindTarget> = {
  propose:    "redraft",
  pl_session: "redraft",
  pl_ratify:  "redraft",
  tl_draft:   "redraft",
  tl_plan:    "microtasks",
  plan_coverage: "microtasks",
  plan_review: "microtasks",
  tl_author:  "microtasks",
  tl_sign:    "man_audit",
  pl_review:  "man_audit",
  qa_contract: "microtasks",
  man_audit:  "man_audit",
  sandbox:    "sandbox",
  impl_start: "sandbox",
  impl_done:  "sandbox",
  build_gate: "sandbox",
  qa_pass:    "qa",
  tl_amend:   "qa",
  man_review: "post_qa",
  keeper:     "post_qa",
  seal:       "post_qa",
};

export const REWIND_BLURB: Record<RewindTarget, string> = {
  redraft:    "Reject the contract and redraft it from scratch (TL writes a v2).",
  microtasks: "Re-decompose: status → pl_ratified, then re-sign, re-audit, rebuild sandbox, re-implement, re-verify.",
  man_audit:  "Re-audit: status → tl_approved (keeps microtasks), then PL review, MAN phase 1, rebuild sandbox, re-implement, re-verify.",
  sandbox:    "Rebuild the sandbox: status → tl_approved (keeps MAN phase 1 + microtasks), wipe sandbox dir, re-implement, re-verify.",
  qa:         "Re-verify only: status → impl (keeps sandbox + code + microtasks), discard QA runs.",
  post_qa:    "Re-run the post-QA tail: MAN review → keeper → journey → blueprint → close (keeps status, sandbox, QA).",
  // v2 (blueprint pipeline)
  screening:  "Re-screen: supersede the contract + clear the screening, then re-run research → clarify → refine.",
  blueprint:  "Re-design the blueprint: supersede it, contract → pl_ratified (keeps the contract), re-run the per-block design.",
  build:      "Re-author: drop the snippets + rebuild the sandbox, contract → tl_approved (keeps the blueprint design).",
};

// v2 (blueprint pipeline) phase → rewind target. Separate from PHASE_TO_REWIND because v2
// reuses some v1 phase kinds (sandbox/qa_pass) that must NOT map to the v1 targets. Only the
// 3 stages with a clean re-run point carry a ⟲.
export const PHASE_TO_REWIND_V2: Record<string, RewindTarget> = {
  screening:       "screening",
  blueprint_design: "blueprint",
  snippet_author:  "build",
};

// FEAT-STAGE-DECOMPOSITION: each LEFT-column phase is driven by exactly one
// substrate action (the state machine's next_action for that contract status —
// see state-machine-rules.mjs). Expanding a phase shows that action's ordered
// skill steps (from actions.steps_json) so the operator can see WHICH specific
// skill a failure happened in. Names are the real registered action names the
// driver dispatches; the steps come from the live actions table via useActions,
// not a hardcoded list, so this never drifts from substrate truth.
export const PHASE_TO_ACTION: Record<string, string> = {
  propose:    "board-keeper.card.add",
  pl_session: "pl.session.start",
  pl_ratify:  "card.gate.pl.ratify",
  tl_draft:   "contract.draft.auto",
  tl_plan:    "tl.plan.contract",
  plan_coverage: "qa.contract.plan.coverage",
  plan_review: "qa.contract.review",
  tl_author:  "tl.author.snippets",
  tl_sign:    "contract.gate.tl.sign",
  pl_review:  "pl.review.contract",
  qa_contract: "qa.contract.review",
  man_audit:  "man.audit.contract.signed",
  sandbox:    "tl.sandbox.create",
  impl_start: "git-manager.implement.code",
  impl_done:  "git-manager.implement.code",
  build_gate: "git-manager.build.gate",
  qa_pass:    "qa.gate.contract.verify",
  tl_amend:   "tl.contract.amend",
  man_review: "man.card.review",
  keeper:     "keeper.card.consolidate",
  seal:       "board-keeper.card.status.change",
};

// EPIC-SWARM FOLD-IN: for a swarm contract, TL Plan and TL Snippets each run
// MULTIPLE actions (the swarm is the fan-out of calls inside the stage). When a
// stage is expanded on a swarm card, show every one of these actions' skills +
// AI calls as checkpoints — the nucleus design + its deterministic lint under
// TL Plan; the per-file author swarm + the per-file adversarial review under TL
// Snippets. Stages not listed keep their single PHASE_TO_ACTION action.
export const PHASE_TO_SWARM_ACTIONS: Record<string, string[]> = {
  tl_plan:   ["swarm.manifest.design", "swarm.manifest.lint"],
  tl_author: ["swarm.author.blocks", "swarm.review.contract"],
};

// EPIC-SWARM FOLD-IN: the plan-path-only rungs the swarm REPLACES or SKIPS. On a
// swarm card these never light (the swarm has no per-microtask coverage/plan
// review, and the operator dropped PL review + the separate QA contract review —
// the per-file review swarm under TL Snippets IS the pre-DEV code review). The
// waterfall hides them for swarm contracts so the ladder reads cleanly.
export const SWARM_HIDDEN_KINDS = new Set<string>([
  "plan_coverage", "plan_review", "pl_review", "qa_contract",
]);

export function clip(s: any, n: number): string {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n) + "…" : str;
}

// WS-3 tier badges (user directive): AI entries surface WHICH cognition tier
// served the call as distinct parts — AI HIGH / AI MID / AI LOW. Colors reuse
// the existing constants: high=PL_COLOR oklch(0.78 0.16 295), mid=AI_COLOR
// oklch(0.78 0.13 200), low=C.dim.
const TIER_BADGE_COLOR: Record<string, string> = {
  high: PL_COLOR,
  mid: AI_COLOR,
  low: C.dim,
};

export function TierBadge({ tier }: { tier?: string | null }) {
  // Every call site renders this for a KNOWN AI call, so a missing tier is
  // unrecorded metadata — not a deterministic step. Mark it ("AI ?", dim)
  // instead of vanishing, so absence is distinguishable from a non-AI step.
  const color = tier ? (TIER_BADGE_COLOR[tier] ?? C.dim) : C.dim;
  return (
    <span
      title={tier ? undefined : "AI call — tier not recorded"}
      style={{
        fontFamily: mono, fontSize: 9, letterSpacing: 0.6, lineHeight: 1.6,
        color, border: `1px solid ${color}`, borderRadius: 3,
        padding: "0 4px", textTransform: "uppercase", whiteSpace: "nowrap",
        opacity: tier ? 1 : 0.6,
      }}>AI {tier ?? "?"}</span>
  );
}

// EPIC-SUBAGENT: the sub-agent LEAF a call ran as (tl.dev.style, qa.lawyer, …),
// shown beside the tier badge so the waterfall attributes each call to its specialist.
export function SubagentChip({ subagent }: { subagent?: string | null }) {
  if (!subagent) return null;
  return (
    <span
      title="the sub-agent leaf that ran this call"
      style={{
        fontFamily: mono, fontSize: 9, letterSpacing: 0.4, lineHeight: 1.6,
        color: DEV_COLOR, border: `1px solid ${DEV_COLOR}`, borderRadius: 3,
        padding: "0 4px", whiteSpace: "nowrap",
      }}
    >{subagent}</span>
  );
}

// A `.reason` prompt-name suffix marks phase 1 of a two-phase call
// (phase_flow='reason_then_format') — labeled so the two ai_calls rows read
// as two distinct parts of one cognition pass. The generic AUTO_TWO_PHASE
// twin (ai.reason.generic.v1) carries no suffix; the payload's `phase`
// field (from the persisted pair link) is authoritative when present.
export function isReasonPhase(promptName?: string | null): boolean {
  return typeof promptName === "string"
    && (/\.reason$/.test(promptName) || promptName === "ai.reason.generic.v1");
}

// ── EPIC-AI-BEHAVIOR-STUDY: pair-aware AI-event grouping ──────────────
// ONE definition for both consumers (waterfall-live + workflow-tab —
// each used to carry its own copy, and the workflow drawer silently kept
// the old single-pass version that never showed HIGH reason legs).
//
// Two passes: format/single events bucket by base name (`.reason` suffix
// + version stripped) and index by their persisted reason_call_id; then
// each reason leg lands in its format twin's bucket via that link — the
// only way an ai.reason.generic.v1 HIGH leg can be attributed to a stage
// — with the suffix-stripped base as fallback for legacy unlinked rows.
export function aiPromptBaseOf(name: string): string {
  return name.replace(/\.reason$/, "").replace(/\.v\d+$/, "");
}

export function isReasonAiEvent(e: ProcessEvent): boolean {
  return e.phase === "reason"
    || /\.reason$/.test(e.prompt_name ?? "")
    || e.prompt_name === "ai.reason.generic.v1";
}

export function groupAiEventsByPrompt(events: ProcessEvent[]): Map<string, ProcessEvent[]> {
  const m = new Map<string, ProcessEvent[]>();
  const baseByReasonId = new Map<number, string>();
  for (const e of events) {
    if (e.source !== "ai" || !e.prompt_name || isReasonAiEvent(e)) continue;
    const base = aiPromptBaseOf(e.prompt_name);
    (m.get(base) ?? m.set(base, []).get(base)!).push(e);
    if (e.reason_call_id != null) baseByReasonId.set(e.reason_call_id, base);
  }
  for (const e of events) {
    if (e.source !== "ai" || !e.prompt_name || !isReasonAiEvent(e)) continue;
    const base = (e.ai_call_id != null && baseByReasonId.get(e.ai_call_id)) || aiPromptBaseOf(e.prompt_name);
    (m.get(base) ?? m.set(base, []).get(base)!).push(e);
  }
  for (const arr of m.values()) arr.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  return m;
}

// The live frontier: the most recent AI event's STAGE base. A reason leg
// resolves through the format twin referencing it when one exists —
// otherwise 'ai.reason.generic' would light no skill while phase 1 runs.
export function resolveLatestAiPromptBase(events: ProcessEvent[]): string | null {
  let latest: ProcessEvent | null = null;
  for (const e of events) {
    if (e.source !== "ai" || !e.prompt_name) continue;
    if (!latest || String(e.ts).localeCompare(String(latest.ts)) > 0) latest = e;
  }
  if (!latest?.prompt_name) return null;
  if (isReasonAiEvent(latest) && latest.ai_call_id != null) {
    const fmt = events.find((x) => x.source === "ai" && x.reason_call_id === latest.ai_call_id);
    if (fmt?.prompt_name) return fmt.prompt_name.replace(/\.v\d+$/, "");
  }
  return aiPromptBaseOf(latest.prompt_name);
}

// EPIC-AI-BEHAVIOR-STUDY: chip vocabulary for the closed postmortem
// failure taxonomy. MUST mirror FAILURE_CLASSES in
// .antiloki/skills/ai/failure-classes.mjs — canary in shared.test.ts.
export const FAILURE_CLASS_LABEL: Record<string, string> = {
  vague_spec: "VAGUE SPEC",
  dropped_reason_decisions: "DROPPED DECISIONS",
  invented_structure: "INVENTED STRUCTURE",
  format_noncompliance: "FORMAT BREAK",
  byte_drift: "BYTE DRIFT",
  truncation: "TRUNCATED",
  refusal_empty: "EMPTY/REFUSAL",
  feed_gap: "FEED GAP",
  provider_error: "PROVIDER ERROR",
  validation_other: "VALIDATION",
};

export function FailureClassChip({ failureClass, severity }: { failureClass?: string | null; severity?: string | null }) {
  if (!failureClass) return null;
  const color = severity === "error" ? C.bad : "oklch(0.75 0.15 85)";
  return (
    <span style={{
      fontFamily: mono, fontSize: 9, letterSpacing: 0.6, lineHeight: 1.6,
      color, border: `1px solid ${color}`, borderRadius: 3,
      padding: "0 4px", textTransform: "uppercase", whiteSpace: "nowrap",
    }}>{FAILURE_CLASS_LABEL[failureClass] ?? failureClass}</span>
  );
}

export function PhaseChip({ promptName, phase }: { promptName?: string | null; phase?: string | null }) {
  if (phase === "reason" || (phase == null && isReasonPhase(promptName))) {
    return (
      <span style={{
        fontFamily: mono, fontSize: 9, letterSpacing: 0.6, lineHeight: 1.6,
        color: PL_COLOR, border: `1px dashed ${PL_COLOR}`, borderRadius: 3,
        padding: "0 4px", whiteSpace: "nowrap",
      }}>PHASE 1 · diagnose</span>
    );
  }
  // FIX-QA1-TRUTH (cosmetic half): the plan template's low-tier format leg
  // emits the per-file md SPECS, not code — without this chip it read as a
  // failed snippet call. Snippet calls are tl.author.file.*.
  if (typeof promptName === "string" && /^tl\.refine\.microtasks\.v\d+$/.test(promptName)) {
    return (
      <span style={{
        fontFamily: mono, fontSize: 9, letterSpacing: 0.6, lineHeight: 1.6,
        color: AI_COLOR, border: `1px dashed ${AI_COLOR}`, borderRadius: 3,
        padding: "0 4px", whiteSpace: "nowrap",
      }}>PHASE 2 · plan defs</span>
    );
  }
  if (typeof promptName === "string" && /^tl\.author\.file\./.test(promptName)) {
    return (
      <span style={{
        fontFamily: mono, fontSize: 9, letterSpacing: 0.6, lineHeight: 1.6,
        color: DEV_COLOR, border: `1px dashed ${DEV_COLOR}`, borderRadius: 3,
        padding: "0 4px", whiteSpace: "nowrap",
      }}>snippet · per-file</span>
    );
  }
  return null;
}

// Self-injected so the "current stage" spinner animates regardless of any
// global stylesheet (the app's lokiPulse/pulse keyframes have no local def).
(function injectWfStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("wf-stage-styles")) return;
  const s = document.createElement("style");
  s.id = "wf-stage-styles";
  s.textContent = `@keyframes wfStageSpin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
})();

export function formatAgo(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.bg, color: C.fg, minHeight: "100%", fontFamily: '-apple-system, system-ui, sans-serif' }}>{children}</div>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
      {children}
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return <div style={{ color: C.muted, fontStyle: "italic", fontSize: 11, padding: 14 }}>{label}</div>;
}

export function Empty({ msg }: { msg: string }) {
  return <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", padding: 14, textAlign: "center" }}>{msg}</div>;
}

// HH:MM:SS in operator's local timezone. Substrate stores UTC; we
// convert via the time helper so events line up with the operator's
// wall clock instead of showing UTC labeled as if it were local.
export function tsTime(ts: string | undefined): string {
  return toLocalHMS(ts ?? null);
}

// aiSource: when set, the Panel's content is AI-emitted prose (contract
// goal_md, tl_evaluation_md, microtask intent, etc.) rather than a
// canonical DB row. We surface the [AI] chip in the section label so
// the operator never confuses AI claims with verified row state.
// FEAT-FE-RENDERS-FROM-DB-AUDIT.
export function Panel({ title, children, aiSource }: {
  title: string;
  children: React.ReactNode;
  aiSource?: string;
}) {
  return (
    <section style={{
      background: C.panel,
      border: aiSource
        ? `1px solid color-mix(in oklab, ${C.brand} 30%, ${C.border})`
        : `1px solid ${C.border}`,
      borderRadius: 8, padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <SectionLabel>{title}</SectionLabel>
        {aiSource && <AIChip source={aiSource} />}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontFamily: mono, fontSize: 12, color: color ?? C.fg }}>{value}</span>
      {hint && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, wordBreak: "break-all" }}>{hint}</span>}
    </div>
  );
}
