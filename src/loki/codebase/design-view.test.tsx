// @vitest-environment jsdom
// DESIGN, three tabs (2026-09-18): System (showcase + palette + drift) · Components (auto-harvested) ·
// Frames. The retired tabs (palette, consistency, ai, snapshots) must still resolve for saved widgets.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let harvest: any;
const calls: string[] = [];
vi.mock("@/loki/api/client", () => ({
  apiPost: vi.fn(async (url: string) => { calls.push(url); if (url.endsWith("/design/rebuild")) { harvest = full; return { ok: true }; } if (url.endsWith("/design/get")) return harvest; if (url.endsWith("/design/snapshots")) return { snapshots: [], css: "" }; return null; }),
  isNotWired: () => false, unwrapResult: (r: any) => r,
}));
vi.mock("./design-system-showcase", () => ({ DesignSystemShowcase: () => <div data-testid="showcase" /> }));
vi.mock("@/loki/design/frames", () => ({ DesignFrames: () => <div data-testid="frames" /> }));
let dossierReply: any;
vi.mock("@/loki/api/engine", () => ({ askEngine: vi.fn(async () => dossierReply) }));

const full = { palette: { color: { declared: [{ token: "--c", value: "#fff", usage_count: 3, sources: [] }], literals: [] } }, categories: ["color"], components: [{ name: "Button", path: "src/Button.tsx", line: 3, props: ["kind"], renders: [], tokens: [] }], audit: { findings: [{ kind: "near_duplicate", category: "color", severity: "warn", title: "near #fff", detail: "two whites", values: [], usage_count: 4, sources: [{ path: "a.css", line: 1 }] }], summary: {} }, summary: { tokens: 1, components: 1, drift: 1 } };
const empty = { palette: {}, categories: [], components: [], audit: { findings: [], summary: {} }, summary: { tokens: 0, components: 0, drift: 0 } };

import { DesignView, designTabOf } from "./design-view";
beforeEach(() => { calls.length = 0; harvest = full; });

describe("designTabOf — the retired tabs resolve", () => {
  it("keeps the three tabs; palette/consistency/ai → system; snapshots → frames; garbage → system", () => {
    expect(designTabOf("components")).toBe("components"); expect(designTabOf("frames")).toBe("frames"); expect(designTabOf("system")).toBe("system");
    expect(designTabOf("palette")).toBe("system"); expect(designTabOf("consistency")).toBe("system"); expect(designTabOf("ai")).toBe("system");
    expect(designTabOf("snapshots")).toBe("frames"); expect(designTabOf(undefined)).toBe("system"); expect(designTabOf(42)).toBe("system");
  });
});

describe("DesignView", () => {
  it("shows exactly System · Components · Frames; System stacks showcase, palette and the drift", async () => {
    render(<DesignView />);
    await waitFor(() => expect(screen.getByTestId("showcase")).toBeTruthy());
    expect(screen.getAllByTestId(/^design-tab-/).map((b) => b.textContent)).toEqual(["System · 1 drift", "Components (1)", "Frames"]);
    expect(screen.queryByText(/AI guide|Snapshots|Consistency/)).toBeNull();
    expect(screen.getByText(/the palette — declared tokens/)).toBeTruthy();
    expect(screen.getByText(/the drift — 1 place where the code disagrees/)).toBeTruthy();
    expect(screen.getByText("near #fff")).toBeTruthy();
  });

  it("Components lists the auto-harvested inventory; Frames mounts the frames editor; an old 'snapshots' widget lands on Frames", async () => {
    render(<DesignView initialTab="snapshots" />);
    await waitFor(() => expect(screen.getByTestId("frames")).toBeTruthy());
    fireEvent.click(screen.getByTestId("design-tab-components"));
    await waitFor(() => expect(screen.getByText("Button")).toBeTruthy());
    expect(screen.getByText(/auto-detected from the source/)).toBeTruthy();
  });

  it("an empty harvest AUTO-RUNS the rebuild once — nobody presses ↻ to see their components", async () => {
    harvest = empty;
    render(<DesignView />);
    await waitFor(() => expect(calls.filter((u) => u.endsWith("/design/rebuild")).length).toBe(1));
    await waitFor(() => expect(screen.getByTestId("showcase")).toBeTruthy());
  });

  // THE WIRE (2026-09-19): the engine's dossier sits on the card — code and picture explain each other
  it("◆ wire asks the engine for the component's dossier and keeps it per file; a failure is an error line", async () => {
    localStorage.clear();
    dossierReply = { ok: true, json: { purpose: "The primary action.", renders: "a rounded button with a label", props: [{ name: "kind", type: "'primary'|'ghost'", meaning: "the fill" }], variants: ["disabled"], used_by: ["src/App.tsx"], example: "<Button kind=\"primary\">Save</Button>", preview_html: "<button class=\"btn\" onclick=\"x()\">Save</button><script>alert(1)</script>" }, text: "", engine: "claude-code", ms: 1 };
    render(<DesignView initialTab="components" />);
    await waitFor(() => expect(screen.getByTestId("component-wire-0")).toBeTruthy());
    fireEvent.click(screen.getByTestId("component-wire-0"));
    await waitFor(() => expect(screen.getByTestId("dossier-purpose-0").textContent).toBe("The primary action."));
    expect(screen.getByTestId("dossier-0").textContent).toContain("kind: 'primary'|'ghost' — the fill");
    expect(screen.getByTestId("dossier-0").textContent).toContain("used by · App.tsx");
    // the engine's drawing becomes the card's preview when no captured screen has the component — scripts stripped
    const thumb = screen.getByTestId("component-thumb-0") as HTMLIFrameElement;
    expect(thumb.getAttribute("data-source")).toBe("drawn");
    expect(thumb.getAttribute("srcdoc")).toContain("<button class=\"btn\">Save</button>");
    expect(thumb.getAttribute("srcdoc")).not.toContain("script");
    expect(screen.getByTestId("dossier-0").parentElement!.textContent).toContain("preview drawn by the engine");
    expect(JSON.parse(localStorage.getItem("antiloki:component-dossier:src/Button.tsx")!).purpose).toBe("The primary action.");
    dossierReply = { ok: false, error: "no text", engine: "codex", ms: 1 };
    fireEvent.click(screen.getByTestId("component-wire-0"));
    await waitFor(() => expect(screen.getByTestId("components-wire-error").textContent).toContain("Button: no text"));
  });
});
