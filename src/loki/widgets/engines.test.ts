// A MERGE THE MACHINE CANNOT RUN IS NOT AN OPTION (operator 2026-09-24, from a Windows install: "it should also
// check if i have those AIs available"). The wizard used to offer every merge in the catalogue unconditionally,
// so a box with only Claude could pick "Kimi × DeepSeek" and get an agent that failed on its first turn.
import { describe, it, expect } from "vitest";
import { readiness, modelsOf, machineLine, installed, type EngineInfo } from "./engines";

const eng = (key: string, on: boolean, models: string[] = []): EngineInfo =>
  ({ key, label: key === "claude-code" ? "Claude Code" : key === "opencode" ? "OpenCode" : "Codex", bin: key, installed: on, path: on ? `/usr/bin/${key}` : null, models, install: `install ${key}` });

const claudeOnly = [eng("claude-code", true), eng("codex", false), eng("opencode", false)];
const all = [eng("claude-code", true), eng("codex", true), eng("opencode", true, ["opencode/deepseek-v4-flash", "opencode/kimi-k2.7-code"])];

describe("what this machine can run", () => {
  it("locks a merge whose engine is not installed, and names the engine to install", () => {
    const r = readiness({ brain: { engine: "opencode", model: "opencode/kimi-k2.7-code" }, hands: { engine: "opencode" } }, claudeOnly);
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(["opencode"]);
    expect(r.why).toContain("OpenCode");
    expect(r.why).toContain("install opencode");
  });

  it("a seat that is installed but switched off, or signed out, is not one the machine can run (2026-10-01)", () => {
    const claudeOff = [{ ...eng("claude-code", true), off: true }, eng("codex", true), eng("opencode", false)];
    const r = readiness({ brain: { engine: "claude-code", model: "sonnet" }, hands: { engine: "codex" } }, claudeOff);
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(["claude-code"]);
    expect(r.why).toContain("switched off");
    expect(r.why).not.toContain("not installed");
    expect(installed(claudeOff).map((e) => e.key)).toEqual(["codex"]);
    const signedOut = [{ ...eng("codex", true), seat: false }];
    expect(readiness({ brain: { engine: "codex" }, hands: { engine: "codex" } }, signedOut).why).toContain("not signed in");
    // an unknown login (Antigravity keeps it in the keyring) is not a signed-out seat
    expect(installed([{ ...eng("codex", true), seat: null }]).length).toBe(1);
  });

  it("names each missing engine once, however many sides want it", () => {
    const r = readiness({ brain: { engine: "opencode" }, hands: { engine: "opencode" } }, claudeOnly);
    expect(r.missing).toEqual(["opencode"]);  // one engine missing, said once
    const two = readiness({ brain: { engine: "codex" }, hands: { engine: "opencode" } }, claudeOnly);
    expect(two.missing).toEqual(["codex", "opencode"]);
    expect(two.why).toContain("Codex and OpenCode");
  });

  it("lets a merge through when both its engines are here", () => {
    expect(readiness({ brain: { engine: "claude-code" }, hands: { engine: "opencode" } }, all)).toEqual({ ready: true, missing: [], why: "" });
  });

  it("never locks on ignorance", () => {
    // AN UNKNOWN MODEL IS NOT PROOF OF ABSENCE: OpenCode's catalogue moves, and an empty listing means the probe
    // could not read it — not that the engine has no models. Blocking on either would lock every merge on a
    // machine that can run all of them, which is the worse failure.
    expect(readiness({ brain: { engine: "opencode", model: "opencode/a-model-we-never-heard-of" }, hands: { engine: "opencode" } }, all).ready).toBe(true);
    expect(readiness({ brain: { engine: "opencode" }, hands: { engine: "claude-code" } }, []).ready).toBe(true);  // nothing probed yet
  });

  it("reads back the machine for the header and the custom picker", () => {
    expect(modelsOf(all, "opencode")).toEqual(["opencode/deepseek-v4-flash", "opencode/kimi-k2.7-code"]);
    expect(modelsOf(all, "codex")).toEqual([]);
    expect(installed(claudeOnly).map((e) => e.key)).toEqual(["claude-code"]);
    expect(machineLine(claudeOnly)).toBe("Claude Code — found here");
    expect(machineLine([eng("claude-code", false)])).toBe("no agent CLI found on this machine");
    expect(machineLine([])).toBe("");  // nothing probed yet says nothing at all
  });
});
