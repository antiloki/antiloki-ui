// Drift canaries for the waterfall's stage vocabulary (operator directive
// 2026-06-12: "nothing changes without breaking some kind of test").
//
// The ladder (PHASES), the action mapping (PHASE_TO_ACTION), the coarse
// grouping fallback (STATIC_FE_GROUP via waterfall-live — mirrored here
// through fe-group coverage of PHASE_TO_ACTION), the rewind targets and
// the event classifier (op-classify) form ONE vocabulary spread across
// files. Any addition/rename that doesn't update every member breaks
// loudly here instead of rendering a silent half-truth on the waterfall.
import { describe, it, expect } from "vitest";
import { PHASES, PHASE_TO_ACTION, PHASE_TO_REWIND, PHASE_TO_SWARM_ACTIONS, SWARM_HIDDEN_KINDS } from "./shared";
import { classifyOp } from "../op-classify";

const kinds = PHASES.map((p) => p.kind);
const idx = (k: string) => kinds.indexOf(k);

describe("waterfall stage vocabulary canaries", () => {
  it("TL-REFINE-STAGE-SPLIT + FIX-PLAN-QA-SPLIT ladder order mirrors the SST (9 → 9.2 → 9.3 → 9.6 → 10 → 11 → 11.5)", () => {
    expect(idx("tl_plan")).toBeGreaterThan(idx("pl_ratify"));
    // FIX-PLAN-QA-SPLIT (2026-06-14): the deterministic coverage rung (9.2) sits
    // BETWEEN tl_plan and the advisory AI review (9.3) — coverage → review order.
    expect(idx("plan_coverage")).toBe(idx("tl_plan") + 1);
    expect(idx("plan_review")).toBe(idx("plan_coverage") + 1);
    expect(idx("tl_author")).toBe(idx("plan_review") + 1);
    expect(idx("tl_sign")).toBeGreaterThan(idx("tl_author"));
    expect(idx("pl_review")).toBeGreaterThan(idx("tl_sign"));
    expect(idx("qa_contract")).toBeGreaterThan(idx("pl_review"));
  });

  it("FIX-PLAN-QA-SPLIT: the deterministic coverage stage is a distinct rung with its own action + classifier", () => {
    // The rung exists and is ordered before the AI review.
    expect(idx("plan_coverage")).toBeGreaterThanOrEqual(0);
    expect(idx("plan_coverage")).toBeLessThan(idx("plan_review"));
    // Its action wiring + rewind target are present (else the rung renders empty
    // / the rewind button vanishes).
    expect(PHASE_TO_ACTION.plan_coverage).toBe("qa.contract.plan.coverage");
    expect(PHASE_TO_REWIND.plan_coverage).toBe("microtasks");
    // The coverage tick classifies to its OWN rung — NOT the AI-review rung. The
    // /^qa\.contract\.review/ pattern must not swallow .plan.coverage.
    expect(classifyOp("qa.contract.plan.coverage")).toBe("plan_coverage");
    expect(classifyOp("qa.contract.review")).toBe("qa_contract");
  });

  it("EPIC-SWARM FOLD-IN: the swarm has NO standalone rungs — its calls classify INTO tl_plan / tl_author", () => {
    // The swarm is the fan-out of calls INSIDE the TL stages, not stages of its
    // own (operator directive 2026-06-14). The old standalone rungs are gone.
    for (const gone of ["manifest_design", "manifest_lint", "swarm_author", "review_swarm"]) {
      expect(idx(gone)).toBe(-1);
    }
    // The nucleus design + its deterministic lint are TL PLAN's calls.
    expect(classifyOp("swarm.manifest.design")).toBe("tl_plan");
    expect(classifyOp("swarm.manifest.lint")).toBe("tl_plan");
    // The per-file author swarm + the per-file adversarial review are TL SNIPPETS' calls.
    expect(classifyOp("swarm.author.blocks")).toBe("tl_author");
    expect(classifyOp("swarm.review.contract")).toBe("tl_author");
  });

  it("EPIC-SWARM FOLD-IN: TL Plan / TL Snippets expand into their swarm actions; plan-path rungs hide for swarm", () => {
    // Expanding a swarm TL Plan / TL Snippets shows every one of these actions'
    // calls as checkpoints.
    expect(PHASE_TO_SWARM_ACTIONS.tl_plan).toEqual(["swarm.manifest.design", "swarm.manifest.lint"]);
    expect(PHASE_TO_SWARM_ACTIONS.tl_author).toEqual(["swarm.author.blocks", "swarm.review.contract"]);
    // The plan-path-only rungs the swarm replaces or skips are hidden on swarm cards.
    for (const hidden of ["plan_coverage", "plan_review", "pl_review", "qa_contract"]) {
      expect(SWARM_HIDDEN_KINDS.has(hidden)).toBe(true);
    }
  });

  it("every ladder kind is unique", () => {
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("every ladder kind has an action mapping (stage expansion would render empty otherwise)", () => {
    for (const k of kinds) {
      expect(PHASE_TO_ACTION[k], `PHASE_TO_ACTION missing '${k}'`).toBeTruthy();
    }
  });

  it("every ladder kind has a rewind target (the rewind button silently vanishes otherwise)", () => {
    for (const k of kinds) {
      expect(PHASE_TO_REWIND[k], `PHASE_TO_REWIND missing '${k}'`).toBeTruthy();
    }
  });

  it("classifyOp round-trips every stage action onto the ladder (with the two known mode-disambiguated exceptions)", () => {
    // Documented exceptions:
    //   plan_review — both QA review gates share one action name; the EVENT
    //     classifies to the late rung and runtime-state's review_mode moves
    //     plan-mode reviews to plan_review (waterfall-live FIX-QA1-TRUTH).
    //   impl_done — shares dev.implement.code with impl_start by design.
    //   seal — DELIBERATELY unclassified: card.status.change fires for every
    //     status, so classifying it would light the close rung on any change;
    //     the seal rung is derived from contract status 'done' instead.
    const EXPECTED_ALIAS: Record<string, string> = {
      plan_review: "qa_contract",
      impl_done: "impl_start",
      seal: PHASE_TO_ACTION.seal, // unclassified on purpose → raw passthrough
    };
    for (const k of kinds) {
      const action = PHASE_TO_ACTION[k];
      const got = classifyOp(action);
      const want = EXPECTED_ALIAS[k] ?? k;
      expect(got, `classifyOp('${action}') for ladder kind '${k}'`).toBe(want);
    }
  });

  it("plan-mode review events still classify to qa_contract (the runtime remap owns the disambiguation)", () => {
    expect(classifyOp("qa.contract.review")).toBe("qa_contract");
  });
});

// EPIC-AI-BEHAVIOR-STUDY: the FE failure-class chip vocabulary must mirror
// the engine's closed taxonomy — the single enum that migration 135's CHECK,
// the BRAIN_SCHEMA fold and the postmortem classifier all derive from.
// Direct import keeps the two ends physically inseparable.
import { FAILURE_CLASS_LABEL } from "./shared";
// Deliberate cross-package coupling — but DYNAMIC + guarded: the engine file
// exists only in the local side-by-side checkout. The FE repo's own CI has no
// engine to compare against, and the old static import failed the transform
// there (first Actions run, 2026-07-17). Locally the canary still bites.
const ENGINE_FAILURE_CLASSES = "../../../../antiloki-core/skills/ai/failure-classes.mjs";

describe("failure-class chip vocabulary canary", () => {
  it("FAILURE_CLASS_LABEL covers exactly the engine's FAILURE_CLASSES (when the engine checkout is present)", async () => {
    let FAILURE_CLASSES: string[];
    try {
      ({ FAILURE_CLASSES } = await import(/* @vite-ignore */ ENGINE_FAILURE_CLASSES));
    } catch {
      console.warn("[canary] engine failure-classes.mjs not present (FE-only checkout) — comparison skipped");
      return;
    }
    expect(Object.keys(FAILURE_CLASS_LABEL).sort()).toEqual([...FAILURE_CLASSES].sort());
  });
  it("every label is non-empty display text", () => {
    for (const [k, v] of Object.entries(FAILURE_CLASS_LABEL)) {
      expect(v, `label for ${k}`).toBeTruthy();
    }
  });
});

// EPIC-AI-BEHAVIOR-STUDY: pair-aware grouping — the single definition both
// waterfall-live and workflow-tab consume (each used to carry its own copy;
// the workflow copy silently dropped HIGH reason legs).
import { groupAiEventsByPrompt, resolveLatestAiPromptBase } from "./shared";
import type { ProcessEvent } from "@/loki/api/hooks";

const ai = (over: Partial<ProcessEvent>): ProcessEvent =>
  ({ source: "ai", id: `ai-${over.ai_call_id}`, ts: "2026-06-12 10:00:00", ...over }) as ProcessEvent;

describe("groupAiEventsByPrompt (pair-aware)", () => {
  it("places a linked generic reason leg into its format twin's bucket", () => {
    const events = [
      ai({ ai_call_id: 1, prompt_name: "ai.reason.generic.v1", phase: "reason", ts: "2026-06-12 10:00:01" }),
      ai({ ai_call_id: 2, prompt_name: "tl.refine.microtasks.v12", phase: "format", reason_call_id: 1, ts: "2026-06-12 10:00:02" }),
    ];
    const m = groupAiEventsByPrompt(events);
    const bucket = m.get("tl.refine.microtasks") ?? [];
    expect(bucket.map((e) => e.ai_call_id).sort()).toEqual([1, 2]);
    expect(m.has("ai.reason.generic")).toBe(false);
  });

  it("falls back to suffix-stripping for legacy unlinked .reason rows", () => {
    const events = [
      ai({ ai_call_id: 3, prompt_name: "two.phase.reason" }),
      ai({ ai_call_id: 4, prompt_name: "two.phase" }),
    ];
    const m = groupAiEventsByPrompt(events);
    expect((m.get("two.phase") ?? []).length).toBe(2);
  });

  it("single-phase events group exactly as before", () => {
    const m = groupAiEventsByPrompt([ai({ ai_call_id: 5, prompt_name: "qa.contract.plan.review.v2", phase: "single" })]);
    expect((m.get("qa.contract.plan.review") ?? []).length).toBe(1);
  });
});

describe("resolveLatestAiPromptBase (live frontier)", () => {
  it("a running generic reason leg lights its STAGE base via the pair link", () => {
    const events = [
      ai({ ai_call_id: 2, prompt_name: "tl.refine.microtasks.v12", phase: "format", reason_call_id: 1, ts: "2026-06-12 10:00:01" }),
      ai({ ai_call_id: 1, prompt_name: "ai.reason.generic.v1", phase: "reason", ts: "2026-06-12 10:00:09" }),
    ];
    expect(resolveLatestAiPromptBase(events)).toBe("tl.refine.microtasks");
  });

  it("an unlinked latest reason leg falls back to its own stripped base", () => {
    expect(resolveLatestAiPromptBase([ai({ ai_call_id: 7, prompt_name: "two.phase.reason" })])).toBe("two.phase");
  });
});
