import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let path = "/";
const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({ ...(await orig<any>()), useLocation: () => ({ pathname: path }), useNavigate: () => navigate }));
vi.mock("@/loki/api/hooks", () => ({ useWorkspaces: () => ({ data: { active: { root_path: "/x" } } }) }));
const job = { job_id: "j1", root: "/x", status: "running", phase: "ingest", detail: { current: { stage: "map", family_index: 2, families_total: 9, files_done: 10, files_total: 40 } }, error: null };
const onboardLatest = vi.fn(async () => ({ job_id: "j1", status: "running", phase: "ingest" }));
const onboardStatus = vi.fn(async () => job);
const onboardStart = vi.fn(async () => ({ job_id: "j1" }));
vi.mock("@/loki/api/codebase", async (orig) => ({ ...(await orig<any>()), onboardLatest: (...a: any[]) => (onboardLatest as any)(...a), onboardStatus: (...a: any[]) => (onboardStatus as any)(...a), onboardStart: (...a: any[]) => (onboardStart as any)(...a), onboardPause: vi.fn() }));

import { RebuildPanel, RebuildMini, wizardAllowedHere } from "./rebuild-panel";

describe("where the rebuild window may appear", () => {
  beforeEach(() => { navigate.mockClear(); localStorage.clear(); path = "/"; });

  it("the full window belongs to X-ray only", () => {
    expect(wizardAllowedHere("/operations/atlas")).toBe(true);
    expect(wizardAllowedHere("/operations/atlas/files")).toBe(true);
    for (const p of ["/", "/cockpit", "/operations/design", "/operations/atlasx", "/settings"]) expect(wizardAllowedHere(p)).toBe(false);
  });

  it("the dropdown's rebuild button starts the rebuild but draws no window off X-ray", async () => {
    onboardLatest.mockResolvedValueOnce(null as any);
    render(<RebuildPanel onDone={() => {}} wizard={false} onOpenWizard={() => navigate("x-ray")} />);
    fireEvent.click(screen.getByTestId("rebuild-button"));
    await waitFor(() => expect(onboardStart).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("rebuild-button").textContent).toContain("rebuilding"));
    expect(document.body.textContent).not.toContain("close");          // no overlay, no wizard
    expect(screen.queryByTestId("rebuild-mini")).toBeNull();           // and no mini inside the dropdown either: the shell draws that
    fireEvent.click(screen.getByTestId("rebuild-button"));             // "view" while running takes you to X-ray
    expect(navigate).toHaveBeenCalledWith("x-ray");
  });

  it("the shell's mini preview shows a live rebuild on every screen but X-ray, and clicking it opens X-ray", async () => {
    path = "/cockpit";
    render(<RebuildMini />);
    const mini = await screen.findByTestId("rebuild-mini");
    expect(mini.textContent).toContain("family 2/9");
    fireEvent.click(mini);
    expect(navigate).toHaveBeenCalledWith({ to: "/operations/atlas" });
  });

  it("…and draws nothing on X-ray (the wizard is there) or when nothing is rebuilding", async () => {
    path = "/operations/atlas";
    const { unmount } = render(<RebuildMini />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("rebuild-mini")).toBeNull();
    unmount();
    path = "/cockpit"; onboardLatest.mockResolvedValueOnce({ job_id: "j0", status: "done", phase: "done" } as any);
    render(<RebuildMini />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("rebuild-mini")).toBeNull();
  });
});
