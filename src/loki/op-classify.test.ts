// Classifier canaries for the git-manager.* rename of the dev.* operations.
// The driver renamed DEV → integrator (git-manager), so sacred_timeline ops now
// arrive as `git-manager.*`. The OP_TO_KIND rows were widened to /^(dev|git-manager)\./
// so both the new git-manager events AND pre-rename `dev.*` history classify onto
// the same rungs. These assertions break loudly if either side regresses.
import { describe, it, expect } from "vitest";
import { classifyOp, classifyOpV2 } from "./op-classify";

describe("op-classify git-manager.* classification", () => {
  it("classifies git-manager.implement.code as impl_start", () => {
    expect(classifyOp("git-manager.implement.code")).toBe("impl_start");
  });

  it("classifies git-manager.build.gate as build_gate", () => {
    expect(classifyOp("git-manager.build.gate")).toBe("build_gate");
  });

  it("classifies a git-manager.*done op as impl_done", () => {
    expect(classifyOp("git-manager.implement.done")).toBe("impl_done");
  });

  it("falls back to the generic dev kind for other git-manager ops", () => {
    expect(classifyOp("git-manager.something.else")).toBe("dev");
  });

  // History-safe: pre-rename dev.* ops must still classify identically so the
  // waterfall renders archived runs on the same ladder as live git-manager runs.
  it("keeps legacy dev.implement.code classifying as impl_start", () => {
    expect(classifyOp("dev.implement.code")).toBe("impl_start");
  });

  it("keeps legacy dev.build.gate classifying as build_gate", () => {
    expect(classifyOp("dev.build.gate")).toBe("build_gate");
  });
});

describe("op-classify PIPELINE-V2 (classifyOpV2)", () => {
  // The blueprint pipeline's ops/actions must light their OWN rungs — and the
  // blueprint seals must NOT fall into the generic /seal|close/ rung.
  it("classifies the v2 PLAN ops onto v2 rungs", () => {
    expect(classifyOpV2("pl.screening")).toBe("screening");
    expect(classifyOpV2("tl.contract.assemble")).toBe("v2_contract");
    expect(classifyOpV2("contract.assemble")).toBe("v2_contract"); // audit-op form
    expect(classifyOpV2("card.gate.pl.ratify")).toBe("pl_ratify");
    expect(classifyOpV2("pl.ratify.contract")).toBe("pl_ratify"); // the v2 action name (the rung was dark without it)
    expect(classifyOpV2("blueprint.design")).toBe("blueprint_design");
    expect(classifyOpV2("blueprint.lint.design")).toBe("lint_design"); // structural lint rung, NOT blueprint_design
    expect(classifyOpV2("blueprint.judge.design")).toBe("judge_design");
    expect(classifyOpV2("blueprint.plan.seal")).toBe("plan_seal"); // NOT generic seal
  });

  it("classifies the v2 BUILD/CLOSE ops onto v2 rungs", () => {
    expect(classifyOpV2("snippet.author")).toBe("snippet_author");
    expect(classifyOpV2("blueprint.lint.snippets")).toBe("lint_code"); // structural lint rung, NOT snippet_author
    expect(classifyOpV2("blueprint.judge.snippets")).toBe("judge_code");
    expect(classifyOpV2("blueprint.apply")).toBe("apply");
    expect(classifyOpV2("git-manager.build.gate")).toBe("build_gate");
    expect(classifyOpV2("qa.gate.contract.verify")).toBe("qa_pass");
    expect(classifyOpV2("blueprint.build.seal")).toBe("build_seal"); // NOT generic seal
    expect(classifyOpV2("keeper.card.consolidate")).toBe("keeper");
  });

  it("the generic close still resolves to seal as a fallback", () => {
    expect(classifyOpV2("board-keeper.card.status.change")).toBe("seal");
  });
});
