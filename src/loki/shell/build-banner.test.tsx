// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const get = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => get(...a) }));
import { BuildBanner, isStale, pageBuild } from "./build-banner";

const withScript = (src: string | null) => { document.head.innerHTML = src ? `<script type="module" src="${src}"></script>` : ""; };
afterEach(() => { cleanup(); document.head.innerHTML = ""; get.mockReset(); });
describe("the page and the serve are the same build", () => {
  it("reads the page's entry script, and is stale only when both are known and differ", () => {
    withScript("/assets/index-OLD123.js"); expect(pageBuild()).toBe("index-OLD123.js"); withScript("/assets/index-OLD123.js?v=2"); expect(pageBuild()).toBe("index-OLD123.js"); withScript(null); expect(pageBuild()).toBeNull();
    expect(isStale("a.js", "b.js")).toBe(true); expect(isStale("a.js", "a.js")).toBe(false); expect(isStale(null, "b.js")).toBe(false); expect(isStale("a.js", null)).toBe(false);
  });
  it("shows a banner naming both builds when the serve hands out another one, and nothing when they match or in dev", async () => {
    withScript("/assets/index-OLD123.js"); get.mockResolvedValue({ ok: true, fe_build: "index-NEW456.js" });
    render(<BuildBanner />); await waitFor(() => screen.getByTestId("build-banner")); expect(screen.getByTestId("build-ids").textContent).toContain("index-OLD123.js"); expect(screen.getByTestId("build-ids").textContent).toContain("index-NEW456.js"); expect(screen.getByTestId("build-reload")).toBeTruthy();
    cleanup(); get.mockResolvedValue({ fe_build: "index-OLD123.js" }); render(<BuildBanner />); await waitFor(() => expect(get).toHaveBeenCalled()); await new Promise((r) => setTimeout(r, 30)); expect(screen.queryByTestId("build-banner")).toBeNull();
    cleanup(); withScript(null); get.mockClear(); render(<BuildBanner />); await new Promise((r) => setTimeout(r, 30)); expect(get).not.toHaveBeenCalled(); expect(screen.queryByTestId("build-banner")).toBeNull();
  });
});
