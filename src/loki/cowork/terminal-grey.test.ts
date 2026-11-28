// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
vi.mock("@xterm/xterm/css/xterm.css", () => ({})); vi.mock("@xterm/xterm", () => ({ Terminal: class {} })); vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} })); vi.mock("./api", () => ({})); vi.mock("@/loki/cockpit/pty-streams", () => ({ subscribePane: () => () => {} }));
import { isDark, TERMINAL_CONTRAST } from "./TerminalPane";

describe("the terminal's grey text on glass", () => {
  it("lifts the terminal's greys against a dark pane and leaves a light one alone", () => {
    expect(isDark([11, 15, 22])).toBe(true); expect(isDark([0, 0, 0])).toBe(true); expect(isDark([250, 250, 250])).toBe(false); expect(isDark([180, 190, 200])).toBe(false); expect(isDark(null)).toBe(true);   // not knowing: the dark default
    expect(TERMINAL_CONTRAST).toBeGreaterThanOrEqual(4.5);
  });
});
