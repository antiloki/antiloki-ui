// WHY A SEAT IS NOT BEING USED must be legible (2026-09-27). The three states an operator confuses are "not
// installed", "installed but never signed in", and "switched off" — and they have three different fixes: install it,
// log in, flip the switch. A screen that renders all three as "unavailable" sends the operator to the wrong one.
import { describe, it, expect } from "vitest";
import { seatState, CLI_ENGINES } from "./ai-engines";

const row = (o: Partial<Parameters<typeof seatState>[0]>) => ({
  key: "gemini", name: "Gemini", binaries: ["agy", "gemini"], binary: "agy",
  installed: true, signed_in: true, usable: true, metered_gateway: false, blocked: null, ...o,
}) as Parameters<typeof seatState>[0];

describe("seatState", () => {
  it("names the binaries when nothing is installed, so the operator knows what to install", () => {
    const s = seatState(row({ installed: false, binary: null, usable: false, signed_in: false }));
    expect(s.tone).toBe("off");
    expect(s.text).toContain("agy");
    expect(s.text).toContain("gemini");
  });

  it("separates 'not signed in' from 'not installed' — different fixes", () => {
    const s = seatState(row({ signed_in: false, usable: false }));
    expect(s.tone).toBe("warn");
    expect(s.text).toBe("installed, not signed in");
  });

  it("says 'switched off' for a provider the switches refuse, not 'unavailable'", () => {
    const s = seatState(row({ key: "opencode", usable: false, metered_gateway: true, blocked: "OpenCode Zen is off" }));
    expect(s.text).toBe("switched off");
  });

  it("reports the binary actually in use when ready — agy, not the retired gemini CLI", () => {
    expect(seatState(row({})).text).toBe("ready · agy");
    expect(seatState(row({})).tone).toBe("ok");
  });
});

describe("a seat the operator switched off", () => {
  it("reads as switched off (not as a fault) and carries the operator's own switch", () => {
    const r = row({ key: "claude-code", name: "Claude", usable: false, blocked: "Claude is switched off (Settings › Seats).", on: false });
    expect(seatState(r)).toEqual({ text: "switched off", tone: "off" });
    expect(r.on).toBe(false);
  });
});

describe("CLI_ENGINES", () => {
  it("offers all five subscription seats plus the gateway", () => {
    const keys = CLI_ENGINES.map((e) => e.model_id);
    for (const k of ["claude-code", "codex", "gemini", "grok", "cursor", "opencode"]) expect(keys).toContain(k);
  });

  it("does not sell OpenCode as a free tier: every model it serves is on the metered Zen gateway", () => {
    const oc = CLI_ENGINES.find((e) => e.model_id === "opencode")!;
    expect(oc.note).not.toContain("free tier");
    expect(oc.note).toMatch(/metered/);
  });

  it("says Cursor is used for its own pool only", () => {
    expect(CLI_ENGINES.find((e) => e.model_id === "cursor")!.note).toMatch(/Composer|own pool/);
  });
});
