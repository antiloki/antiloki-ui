// Shared sacred_timeline.operation → pipeline-phase classifier.
// Was copy-pasted (byte-identical) in waterfall-live.tsx and workflow-tab.tsx;
// extracted so a new operation name classifies the same on every screen.
// NOTE: contract.tsx keeps its own coarser (role, kind) projection for the
// blueprint timeline — a different vocabulary, not a duplicate of this table.

export const OP_TO_KIND: Array<{ match: RegExp; kind: string }> = [
  { match: /seal|close/i,                   kind: "seal" },
  { match: /^keeper\.journey\.append/,      kind: "keeper" },
  { match: /^keeper\.card\.consolidate/,    kind: "keeper" },
  { match: /^man\.card\.review/,            kind: "man_review" },
  // FIX-PLAN-QA-SPLIT (2026-06-14): the deterministic plan-coverage gate is a
  // distinct stage that runs BEFORE the AI plan review — must precede the
  // qa.contract.review row so the coverage tick lights its own rung.
  { match: /^qa\.contract\.plan\.coverage/, kind: "plan_coverage" },
  { match: /^qa\.contract\.review/,         kind: "qa_contract" },
  { match: /^qa\.gate\.contract\.verify/,   kind: "qa_pass" },
  { match: /^qa\.run/,                      kind: "qa_pass" },
  { match: /^qa\.fail/,                     kind: "qa_fail" },
  { match: /^(dev|git-manager)\.build\.gate/,             kind: "build_gate" },
  { match: /^(dev|git-manager)\.implement\.code/,         kind: "impl_start" },
  { match: /^(dev|git-manager)\..*done|impl_done/,        kind: "impl_done" },
  { match: /^(dev|git-manager)\./,                        kind: "dev" },
  { match: /^tl\.sandbox/,                  kind: "sandbox" },
  { match: /^contract\.sandbox\.create/,    kind: "sandbox" },
  { match: /^man\.audit\.contract\.signed/, kind: "man_audit" },
  // EPIC-SWARM FOLD-IN (operator directive 2026-06-14): the swarm is the FAN-OUT
  // OF CALLS INSIDE the TL stages, not stages of its own. The nucleus design + its
  // deterministic lint are the calls of TL PLAN; the per-file author swarm + the
  // per-file adversarial review are the calls of TL SNIPPETS. So their events light
  // tl_plan / tl_author (the expandable checkpoints live in PHASE_TO_SWARM_ACTIONS).
  { match: /^swarm\.manifest\.(design|lint)/, kind: "tl_plan" },
  { match: /^swarm\.author\.blocks/,          kind: "tl_author" },
  { match: /^swarm\.review\.contract/,        kind: "tl_author" },
  { match: /^tl\.contract\.amend/,          kind: "tl_amend" },
  { match: /^tl\.contract\.redraft/,        kind: "tl_draft" },
  // TL-REFINE-STAGE-SPLIT (2026-06-11): plan + per-file authoring are
  // separate driver stages now. Legacy refine ops classify as the plan
  // stage so pre-split history renders sensibly on the new ladder.
  { match: /^tl\.plan\.contract/,           kind: "tl_plan" },
  { match: /^tl\.author\.snippets/,         kind: "tl_author" },
  { match: /^contract\.plan/,               kind: "tl_plan" },
  { match: /^contract\.author\.snippets/,   kind: "tl_author" },
  { match: /^tl\.refine\.microtasks/,       kind: "tl_plan" },
  { match: /^contract\.refine\.microtasks/, kind: "tl_plan" },
  { match: /^contract\.draft\.auto/,        kind: "tl_draft" },
  { match: /^contract\.gate\.tl\.sign/,     kind: "tl_sign" },
  { match: /^card\.gate\.pl\.ratify/,       kind: "pl_ratify" },
  { match: /^pl\.review\.contract/,         kind: "pl_review" },
  { match: /^pl\.session\..*approve/i,      kind: "approve" },
  { match: /^pl\.session\./,                kind: "pl_session" },
  { match: /^contract\.gate\.human/i,       kind: "approve" },
  // Both shapes light the rung: the audit operation is 'card.add', the
  // driver tick's decided_action is 'board-keeper.card.add' (canary-found
  // 2026-06-12 — the tick shape never lit the propose rung).
  { match: /^(board-keeper\.)?card\.add/,   kind: "propose" },
];

// Falls back to the raw op string, which deliberately matches no phase —
// callers treat unknown ops as "no stage" (see waterfall stage bucketing).
export function classifyOp(op: string): string {
  for (const r of OP_TO_KIND) if (r.match.test(op)) return r.kind;
  return op;
}

// PIPELINE-V2 classifier — the blueprint pipeline's operations/actions → its OWN
// stage kinds (the v2 ladder in shared.tsx PHASES_V2). Selected by waterfall-live
// when driver-status reports pipeline_v2. Specific rules FIRST so the blueprint
// seals don't fall into the generic /seal|close/ rung. Handles both the audit
// operation form (contract.assemble) and the tick decided_action form
// (tl.contract.assemble).
export const OP_TO_KIND_V2: Array<{ match: RegExp; kind: string }> = [
  { match: /^blueprint\.plan\.seal/,      kind: "plan_seal" },
  { match: /^blueprint\.build\.seal/,     kind: "build_seal" },
  { match: /^blueprint\.judge\.design/,   kind: "judge_design" },
  { match: /^blueprint\.judge\.snippets/, kind: "judge_code" },
  { match: /^blueprint\.lint\.design/,    kind: "lint_design" },
  { match: /^blueprint\.lint\.snippets/,  kind: "lint_code" },
  { match: /^blueprint\.design/,          kind: "blueprint_design" },
  { match: /^blueprint\.apply/,           kind: "apply" },
  { match: /^pl\.screening/,                   kind: "screening" },
  { match: /^(tl\.)?contract\.assemble/,       kind: "v2_contract" },
  { match: /^snippet\.author/,                 kind: "snippet_author" },
  { match: /^card\.gate\.pl\.ratify/,          kind: "pl_ratify" },
  // v2 fires pl.ratify.contract (the v1 name above kept for old audit rows) — without this the
  // PL-ratify rung never lit: no spinner while running, no pass after (operator report).
  { match: /^pl\.ratify\.contract/,            kind: "pl_ratify" },
  { match: /^(dev|git-manager)\.build\.gate/,  kind: "build_gate" },
  { match: /^(dev|git-manager)\.build\.baseline/, kind: "build_baseline" },
  { match: /^(dev|git-manager)\.test\.baseline/, kind: "test_baseline" },
  { match: /^(dev|git-manager)\.test\.gate/,   kind: "test_gate" },
  { match: /^(system\.)?bugfinder\.run/,       kind: "bugfinder" },
  { match: /^qa\.gate\.contract\.verify/,      kind: "qa_pass" },
  { match: /^qa\.run/,                         kind: "qa_pass" },
  { match: /^tl\.sandbox/,                     kind: "sandbox" },
  { match: /^contract\.sandbox\.create/,       kind: "sandbox" },
  { match: /^git-manager\.worktree\.create/,   kind: "sandbox" },
  { match: /^keeper\.journey\.append/,         kind: "keeper" },
  { match: /^keeper\.card\.consolidate/,       kind: "keeper" },
  // No 'propose' rung in v2 (the card already exists = proposed); card.add lights nothing.
  { match: /^(board-keeper\.)?card\.status\.change/, kind: "seal" },
  { match: /seal|close/i,                      kind: "seal" },
];

export function classifyOpV2(op: string): string {
  for (const r of OP_TO_KIND_V2) if (r.match.test(op)) return r.kind;
  return op;
}
