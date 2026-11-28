// @vitest-environment jsdom
// THE OLD COCKPIT VIEW KNEW FOUR ENGINES (audit 2026-10-01): a Cursor / Gemini / Grok engine pane's header said "OpenCode · OpenRouter" and its boot button "opencode". It names the seat now.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@xterm/xterm", () => ({ Terminal: class { cols = 80; rows = 24; loadAddon() {} open() {} onData() {} write() {} focus() {} dispose() {} attachCustomKeyEventHandler() {} onResize() {} reset() {} clear() {} } }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("./pty-streams", () => ({ subscribePane: () => () => {} }));
vi.mock("@/loki/api/client", () => ({ apiGet: vi.fn(async () => null), apiPost: vi.fn(async () => null) }));
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
import { OpencodePane } from "./opencode-pane";

const header = (kind: string) => { const { container, unmount } = render(<OpencodePane p={{ id: 3, pane_kind: kind, worktree_path: "/w" }} />); const t = container.textContent ?? ""; const titles = [...container.querySelectorAll("[title]")].map((e) => e.getAttribute("title")).join(" | "); unmount(); return { t, titles }; };

describe("an engine pane's header names its own seat", () => {
  it.each([["cursor", "Cursor", "cursor-agent"], ["gemini", "Antigravity", "agy"], ["grok", "Grok", "grok"], ["codex", "Codex", "codex"], ["claude-code", "Claude Code", "claude"]])("%s", (kind, name, bin) => {
    const h = header(kind);
    expect(h.t).toContain(`${name} · sub`);
    expect(h.t).toContain(`▶ ${bin}`);
    expect(h.titles).toContain(`boot ${name} inside`);
    expect(h.titles).toContain("your subscription");
    expect(h.t).not.toContain("OpenRouter");
  });
  it("OpenCode keeps its own wording", () => {
    const h = header("opencode");
    expect(h.t).toContain("OpenCode · OpenRouter");
    expect(h.titles).toContain("boot OpenCode inside");
  });
});

describe("the add-pane gallery", () => {
  it("offers every seat as an engine pane, not only Claude Code, Codex and OpenCode", async () => {
    const { PANE_KINDS } = await import("./pane-gallery");
    const { ENGINE_KEYS } = await import("@/loki/api/engine");
    for (const k of ENGINE_KEYS) expect(PANE_KINDS.some((m) => m.key === k && m.group === "agents")).toBe(true);
  });
});
