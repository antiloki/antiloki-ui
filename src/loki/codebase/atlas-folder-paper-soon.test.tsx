// @vitest-environment jsdom
// THE FOLDER PAPER'S FOUR MEDIA BUTTONS ARE NOT READY (operator 2026-10-11): hidden behind a "soon" blur in a shipped build, live in the dev build; the export buttons beside them stay.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { SoonInline } from "@/loki/components/soon-blur";

describe("SoonInline", () => {
  it("draws its buttons as they are when it is off (the dev build)", () => {
    render(<SoonInline on={false}><button>♪ play the paper</button></SoonInline>);
    expect(screen.queryByTestId("soon-inline")).toBeNull();
    expect((screen.getByText("♪ play the paper") as HTMLButtonElement).closest("[inert]")).toBeNull();
  });
  it("blurs them, takes them out of reach and says soon when it is on", () => {
    const onClick = vi.fn();
    render(<SoonInline on><button onClick={onClick}>⛶ podcast</button><button>🎬 video cast</button></SoonInline>);
    const wrap = screen.getByTestId("soon-inline");
    expect(wrap.textContent).toContain("soon");
    const hidden = screen.getByText("⛶ podcast").closest("[inert]") as HTMLElement;
    expect(hidden).toBeTruthy(); expect(hidden.getAttribute("aria-hidden")).toBe("true");
    expect(hidden.style.filter).toContain("blur"); expect(hidden.style.pointerEvents).toBe("none");
    expect(screen.getByTestId("soon-inline-tag").style.pointerEvents).toBe("none");   // the tag never eats a click meant for what is under it either
  });
});

describe("the real folder paper in a shipped build", () => {
  it("has the four media buttons under the blur and the export buttons outside it", async () => {
    vi.resetModules();
    vi.doMock("@/loki/dev-only", () => ({ devOnly: () => false }));
    vi.doMock("@/loki/api/client", () => ({ apiPost: vi.fn(async () => null), apiGet: vi.fn(async () => null), isNotWired: () => false, unwrapResult: (r: any) => r }));
    const { FolderStageBody } = await import("./atlas-decorators");
    const con: any = { found: true, path: "src", is_folder: true, files: 2, health: 90, members: [], axes: {}, violations: [] };
    render(<FolderStageBody con={con} onOpenFile={() => {}} />);
    const wrap = await screen.findByTestId("soon-inline");
    for (const label of [/play the paper/, /podcast/, /video cast/, /video class/]) {
      const b = screen.getByText(label).closest("button")!;
      expect(wrap.contains(b), String(label)).toBe(true);
      expect(b.closest("[inert]"), String(label)).toBeTruthy();
    }
    expect(wrap.textContent).toContain("soon");
    const exportBtn = document.querySelector("[data-testid^='export']") as HTMLElement | null;
    if (exportBtn) expect(wrap.contains(exportBtn)).toBe(false);
  });
});
