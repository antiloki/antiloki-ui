// THE FIRST SCREEN OF THE PRODUCT, and it is deterministic: read from the machine probe, never from a model, so
// it costs nothing and cannot be wrong about what is installed.
import { describe, it, expect } from "vitest";
import { welcome } from "./main-welcome";
import type { EngineInfo, Machine } from "@/loki/widgets/engines";

const eng = (key: string, label: string, on: boolean): EngineInfo => ({ key, label, bin: key, installed: on, path: on ? `/usr/bin/${key}` : null, models: [], install: `install ${key}` });
const m = (engines: EngineInfo[], can_merge: boolean, unlockWhy?: string): Machine => ({
  engines, merges: [], advice: { headline: "", can_merge, installed: engines.filter((e) => e.installed).length, unlock: unlockWhy ? [{ engine: "opencode", unlocks: "every merge", why: unlockWhy }] : [] },
});
const text = (bs: ReturnType<typeof welcome>) => bs.map((b) => `${b.text} ${b.sub ?? ""}`).join("\n");

describe("what Main says first", () => {
  it("leads with what it is — the one agent that writes nothing", () => {
    const b = welcome(m([eng("claude-code", "Claude Code", true)], false));
    expect(b[0].text).toBe("I read this workspace and change nothing.");
    expect(b[0].sub).toContain("no box and no scope");
  });

  it("names the engines actually found, and says antiloki brings no model of its own", () => {
    const b = welcome(m([eng("claude-code", "Claude Code", true), eng("opencode", "OpenCode", true), eng("codex", "Codex", false)], true));
    expect(b[1].text).toBe("Running on Claude Code · OpenCode.");
    expect(b[1].sub).toContain("bundles no model of its own");
    expect(b[1].text).not.toContain("Codex");  // not installed, not claimed
  });

  it("does not claim a seat that is switched off or signed out (Claude's subscription ended, 2026-10-01)", () => {
    const off = { ...eng("claude-code", "Claude Code", true), off: true };
    const signedOut = { ...eng("grok", "Grok", true), seat: false };
    const b = welcome(m([off, eng("codex", "Codex", true), signedOut, eng("cursor", "Cursor", true)], true));
    expect(b[1].text).toBe("Running on Codex · Cursor.");
    // and a machine whose only CLI is switched off has nothing to run on
    expect(welcome(m([off], false))[1].text).toBe("No agent CLI found on this machine yet.");
  });

  it("says so plainly when nothing is installed rather than pretending", () => {
    const b = welcome(m([eng("claude-code", "Claude Code", false)], false));
    expect(b[1].text).toBe("No agent CLI found on this machine yet.");
  });

  it("explains the merge with two measured rows, dated, including the one that is cheap and worse", () => {
    const t = text(welcome(m([eng("claude-code", "Claude Code", true), eng("opencode", "OpenCode", true)], true)));
    expect(t).toContain("The brain plans");
    expect(t).toContain("249 s, $0.25");
    expect(t).toContain("303 s, $1.28");      // the honest comparison, not just the win
    expect(t).toContain("2026-09-22");        // a date makes it checkable
    expect(t).toContain("missed a bug Opus caught");  // the cheapest row's weakness is not hidden
  });

  it("ends on the next move, and the move depends on what the machine can do", () => {
    const ready = welcome(m([eng("claude-code", "Claude Code", true), eng("opencode", "OpenCode", true)], true)).at(-1)!;
    expect(ready.text).toBe("Hire an agent and pick its merge.");
    expect(ready.sub).toContain("shown locked with what to install");

    const cannot = welcome(m([eng("claude-code", "Claude Code", true)], false, "measured 2026-09-22: $0.25 against $1.28")).at(-1)!;
    expect(cannot.text).toBe("Add one more engine to unlock merges.");
    expect(cannot.sub).toContain("$1.28");
  });
});
