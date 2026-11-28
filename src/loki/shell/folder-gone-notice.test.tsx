import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { WorkspaceList, Workspace } from "@/loki/api/dispatch";

const state: { data: WorkspaceList | null } = { data: null };
vi.mock("@/loki/api/hooks", () => ({ useWorkspaces: () => ({ data: state.data }) }));
import { FolderGoneNotice, folderGoneNotice } from "./folder-gone-notice";

const ws = (id: number, name: string, extra: Partial<Workspace> = {}): Workspace => ({ id, name, root_path: `/p/${name}`, vcs: "git", is_active: 0, db_dir: null, created_at: "", ...extra });
const list = (active: Workspace | null, all: Workspace[]): WorkspaceList => ({ workspaces: all, active, count: all.length });

describe("folderGoneNotice (pure)", () => {
  const a = ws(1, "ws-gone"), b = ws(2, "ws-main");
  it("fires when the previously active workspace is now missing and another is active", () => {
    const n = folderGoneNotice(list(a, [a, b]), list(b, [{ ...a, missing: true }, b]));
    expect(n).toEqual({ gone: "ws-gone", path: "/p/ws-gone", now: "ws-main" });
  });
  it("fires with no workspace left active", () => {
    expect(folderGoneNotice(list(a, [a]), list(null, [{ ...a, missing: true }]))?.now).toBeNull();
  });
  it("stays quiet for a switch the person made, a removal, or no change", () => {
    expect(folderGoneNotice(list(a, [a, b]), list(b, [a, b]))).toBeNull();            // switched, folder intact
    expect(folderGoneNotice(list(a, [a, b]), list(b, [b]))).toBeNull();               // removed on purpose
    expect(folderGoneNotice(list(a, [a, b]), list(a, [{ ...a, missing: true }, b]))).toBeNull(); // still on it
    expect(folderGoneNotice(null, list(b, [b]))).toBeNull();
    expect(folderGoneNotice(list(a, [a]), null)).toBeNull();
  });
});

describe("<FolderGoneNotice/>", () => {
  beforeEach(() => { state.data = null; });
  const a = ws(1, "ws-gone"), b = ws(2, "ws-main");
  it("says so once, can be dismissed, and ignores the poll's empty moment", () => {
    state.data = list(a, [a, b]);
    const { rerender } = render(<FolderGoneNotice />);
    expect(screen.queryByTestId("folder-gone-notice")).toBeNull();
    state.data = null; rerender(<FolderGoneNotice />);                              // a switch drops the data for a moment
    expect(screen.queryByTestId("folder-gone-notice")).toBeNull();
    state.data = list(b, [{ ...a, missing: true }, b]); rerender(<FolderGoneNotice />);
    const n = screen.getByTestId("folder-gone-notice");
    expect(n.getAttribute("role")).toBe("alert");
    expect(n.textContent).toContain("ws-gone"); expect(n.textContent).toContain("switched to"); expect(n.textContent).toContain("ws-main"); expect(n.textContent).toContain("Nothing was deleted");
    fireEvent.click(screen.getByTestId("folder-gone-dismiss"));
    expect(screen.queryByTestId("folder-gone-notice")).toBeNull();
  });
});
