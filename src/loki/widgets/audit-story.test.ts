// THE AUDIT IN WORDS (operator 2026-09-24: "the audit tab on settings is impossible to understand. You should
// keep the complete logs of audit for AI, but display a summary in human natural language also").
import { describe, it, expect } from "vitest";
import { auditStory, auditHeadline, whereItWorked, folderOf } from "./audit-story";
import type { PackAudit } from "./context-pack";

const file = (path: string, writes = 0, reads = 1) => ({ path, reads, writes, blocked: 0, first: "", last: "" });
const audit = (p: Partial<PackAudit> = {}): PackAudit => ({
  log: { sha256: "abcdef0123456789aaaa", lines: 412, first: "", last: "", file: ".antiloki/reads.jsonl" },
  counts: { reads: 30, writes: 4, blocked: 0, exec: 0, search: 0, tool: 0 },
  files: [file("src/orders/api.ts", 2), file("src/orders/totals.ts", 1), file("src/App.tsx", 1), file("src/read-only.ts")],
  git: { base: "main", changed: [] }, cross: { matched: [], git_only: [], hook_only: [] },
  events: [], event_total: 0, ...p,
});
const keys = (a: PackAudit) => auditStory(a).map((p) => p.key);
const para = (a: PackAudit, k: string) => auditStory(a).find((p) => p.key === k)!;

describe("where the work happened", () => {
  it("groups the CHANGED files by folder, busiest first, and names the root for what it is", () => {
    expect(folderOf("src/a/b.ts")).toBe("src/a");
    expect(folderOf("README.md")).toBe("");
    expect(whereItWorked([file("src/orders/a.ts", 1), file("src/orders/b.ts", 1), file("vite.config.ts", 1), file("src/never.ts", 0)]))
      .toEqual([{ folder: "src/orders", files: 2 }, { folder: "the project root", files: 1 }]);
    // a file it only READ is not where it worked
    expect(whereItWorked([file("src/x.ts", 0)])).toEqual([]);
  });
});

describe("the story", () => {
  it("leads with the one thing that cannot be accounted for", () => {
    const a = audit({ cross: { matched: [], git_only: ["dist/bundle.js", "src/gen.ts"], hook_only: [] } });
    expect(keys(a)[0]).toBe("git_only");
    expect(para(a, "git_only").text).toBe("2 files in the box changed without any tool writing to them.");
    expect(para(a, "git_only").detail).toContain("a shell redirect, a build step, a code generator");
    expect(para(a, "git_only").detail).toContain("dist/bundle.js");
    expect(auditHeadline(a)).toEqual({ tone: "warn", text: "Something changed here that this agent cannot account for." });
  });

  it("says a refusal is a refusal — nothing got out", () => {
    const a = audit({ counts: { ...audit().counts, blocked: 3 } });
    expect(para(a, "blocked").text).toBe("3 attempts to touch a file outside this agent's scope were refused.");
    expect(para(a, "blocked").detail).toContain("the file was not written");
    expect(para(a, "blocked").detail).toContain("widen the scope rather than turning the guard off");
    expect(auditHeadline(a).text).toBe("It stayed inside its scope — and it did try to leave.");
  });

  it("tells a plain run of work as work, with the folders it happened in", () => {
    const a = audit();
    expect(para(a, "work").text).toBe("It changed 3 files and read 1 other to do it.");
    expect(para(a, "work").detail).toBe("The work sits in src/orders (2), src (1).");
    expect(keys(a)).not.toContain("blocked");
    expect(auditHeadline(a).text).toBe("Every change in this box traces back to a tool call antiloki watched.");
  });

  it("a reader that changed nothing is not dressed up as a worker", () => {
    const a = audit({ counts: { reads: 12, writes: 0, blocked: 0, exec: 0, search: 2, tool: 1 }, files: [file("src/a.ts"), file("src/b.ts")] });
    expect(para(a, "work").text).toBe("It read 2 files and changed nothing.");
    expect(para(a, "looking").text).toBe("It also did 2 searches and 1 call to antiloki's own tools.");
    expect(auditHeadline(a).text).toBe("It has looked around and changed nothing.");
  });

  it("an agent that has done nothing at all says so, once", () => {
    const a = audit({ counts: { reads: 0, writes: 0, blocked: 0, exec: 0, search: 0, tool: 0 }, files: [] });
    expect(keys(a)).toEqual(["idle", "proof"]);
    expect(para(a, "idle").text).toBe("This agent has not read or changed anything yet.");
  });

  it("always closes on why the record itself can be believed", () => {
    const a = audit();
    const proof = para(a, "proof");
    expect(keys(a)[keys(a).length - 1]).toBe("proof");
    expect(proof.text).toBe("The record is 412 lines long and fingerprinted.");
    expect(proof.detail).toContain("as it happened, by the hook, not reconstructed afterwards");
    expect(proof.detail).toContain("sha abcdef012345…");
  });

  it("no audit is not an empty audit", () => {
    expect(auditStory(null)[0].text).toContain("no audit for this agent yet");
    expect(auditHeadline(undefined)).toEqual({ tone: "dim", text: "nothing watched yet" });
  });
});
