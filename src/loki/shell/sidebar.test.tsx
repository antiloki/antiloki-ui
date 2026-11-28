// Switching workspaces re-points the driver at a DIFFERENT project, so the destructive edges here
// are real: removing a workspace un-wires it, "archive all" un-wires every one of them, and both
// must be confirmed first. The self-hosting row (antiloki's own substrate) must never be removable
// at all — there is no dialog that makes that safe.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let workspaces: any = null;
const refetch = vi.fn();
const activateWorkspace = vi.fn();
const addWorkspace = vi.fn();
const removeWorkspace = vi.fn();
const pickWorkspaceFolder = vi.fn();
let role = "operator";
let pathname = "/";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useLocation: () => ({ pathname }),
}));
vi.mock("./slug-context", () => ({ useShell: () => ({ role }) }));
vi.mock("@/loki/api/hooks", () => ({ useWorkspaces: () => ({ data: workspaces, refetch }) }));
vi.mock("@/loki/api/dispatch", () => ({
  activateWorkspace: (...a: any[]) => activateWorkspace(...a),
  addWorkspace: (...a: any[]) => addWorkspace(...a),
  removeWorkspace: (...a: any[]) => removeWorkspace(...a),
  pickWorkspaceFolder: (...a: any[]) => pickWorkspaceFolder(...a),
}));

import { WorkspaceSwitcher, AppSidebar } from "./sidebar";

const ws = (over: any = {}) => ({ id: 1, name: "proj", root_path: "/p", db_dir: "/db", is_active: 0, ...over });
const SELF = ws({ id: 0, name: "antiloki", db_dir: null, is_active: 1 });

const openSwitcher = () => {
  render(<WorkspaceSwitcher />);
  fireEvent.click(screen.getByText(workspaces?.active?.name ?? "—"));
};

const confirmWith = (answer: boolean) => vi.spyOn(window, "confirm").mockReturnValue(answer);

beforeEach(() => {
  workspaces = { active: SELF, workspaces: [SELF, ws({ id: 2, name: "proj-a" })] };
  role = "operator"; pathname = "/";
  refetch.mockClear();
  activateWorkspace.mockReset().mockResolvedValue({ ok: true });
  addWorkspace.mockReset().mockResolvedValue({ ok: true });
  removeWorkspace.mockReset().mockResolvedValue({ ok: true });
  pickWorkspaceFolder.mockReset().mockResolvedValue({ path: "/chosen/path", supported: true });
  vi.restoreAllMocks();
});

describe("the collapsed switcher", () => {
  it("names the active workspace and marks self-hosting with its own glyph", () => {
    render(<WorkspaceSwitcher />);
    expect(screen.getByText("antiloki")).toBeTruthy();
    expect(screen.getByText("⌂")).toBeTruthy();
  });

  it("uses the external glyph when the active workspace is another project", () => {
    workspaces = { active: ws({ name: "proj-a", is_active: 1 }), workspaces: [] };
    render(<WorkspaceSwitcher />);
    expect(screen.getByText("▣")).toBeTruthy();
  });

  it("shows a dash rather than a blank when nothing is active yet", () => {
    workspaces = null;
    render(<WorkspaceSwitcher />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("lists the workspaces only once opened", () => {
    render(<WorkspaceSwitcher />);
    expect(screen.queryByText("proj-a")).toBeNull();
    fireEvent.click(screen.getByText("antiloki"));
    expect(screen.getByText("proj-a")).toBeTruthy();
  });
});

describe("switching", () => {
  it("activates the chosen workspace and confirms it mounted live", async () => {
    openSwitcher();
    fireEvent.click(screen.getByText("proj-a"));
    await waitFor(() => expect(activateWorkspace).toHaveBeenCalledWith("proj-a"));
    await waitFor(() => expect(screen.getByText(/mounted live, no restart/)).toBeTruthy());
    expect(refetch).toHaveBeenCalled();
  });

  it("does nothing but close when the active workspace is re-picked", async () => {
    openSwitcher();
    fireEvent.click(screen.getAllByText("antiloki")[1]);   // the row, not the trigger
    expect(activateWorkspace).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("proj-a")).toBeNull());
  });

  it("stays put when activation fails — no false 'switched' claim", async () => {
    activateWorkspace.mockResolvedValue({ ok: false, error: "locked" });
    openSwitcher();
    fireEvent.click(screen.getByText("proj-a"));
    await waitFor(() => expect(activateWorkspace).toHaveBeenCalled());
    expect(screen.queryByText(/mounted live/)).toBeNull();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("marks the active row and offers no remove button for the self-hosting one", () => {
    openSwitcher();
    expect(screen.getByText("self")).toBeTruthy();
    expect(screen.getAllByTitle(/remove/)).toHaveLength(1);   // only proj-a
  });
});

// OPERATOR 2026-10-01: "ministore-2" was moved to the Trash and the switcher still offered it; picking it failed far from the cause.
describe("a workspace whose folder is gone", () => {
  beforeEach(() => { workspaces = { active: SELF, workspaces: [SELF, ws({ id: 2, name: "proj-a" }), ws({ id: 3, name: "ministore-2", root_path: "/trash/ministore-2", missing: true })] }; });
  it("is dimmed, says 'folder missing', and picking it does nothing", () => {
    openSwitcher();
    const row = screen.getByTestId("workspace-missing-ministore-2");
    expect(row.textContent).toContain("folder missing");
    expect(row.style.opacity).toBe("0.5");
    const pickBtn = screen.getByTitle("folder missing: /trash/ministore-2") as HTMLButtonElement;
    expect(pickBtn.disabled).toBe(true);
    fireEvent.click(pickBtn);
    expect(activateWorkspace).not.toHaveBeenCalled();
  });
  it("is removed with the existing remove action, after the confirmation", async () => {
    openSwitcher();
    const spy = confirmWith(true);
    fireEvent.click(screen.getByText("remove ✕"));
    await waitFor(() => expect(removeWorkspace).toHaveBeenCalledWith("ministore-2"));
    expect(spy).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
  });
  it("leaves a workspace whose folder is there openable", async () => {
    openSwitcher();
    fireEvent.click(screen.getByText("proj-a"));
    await waitFor(() => expect(activateWorkspace).toHaveBeenCalledWith("proj-a"));
  });
});

describe("removing a workspace", () => {
  it("asks first and explains that the DB files survive", () => {
    const confirm = confirmWith(false);
    openSwitcher();
    fireEvent.click(screen.getByTitle(/remove "proj-a"/));
    expect(confirm.mock.calls[0][0]).toContain("DB files stay on disk");
    expect(removeWorkspace).not.toHaveBeenCalled();
  });

  it("removes and refetches once confirmed", async () => {
    confirmWith(true);
    openSwitcher();
    fireEvent.click(screen.getByTitle(/remove "proj-a"/));
    await waitFor(() => expect(removeWorkspace).toHaveBeenCalledWith("proj-a"));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it("surfaces a failed removal instead of silently doing nothing", async () => {
    confirmWith(true);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    removeWorkspace.mockResolvedValue({ ok: false, error: "in use" });
    openSwitcher();
    fireEvent.click(screen.getByTitle(/remove "proj-a"/));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("in use"));
  });
});

describe("archive all", () => {
  it("is offered only when there is an external workspace to archive", () => {
    const { unmount } = render(<WorkspaceSwitcher />);
    fireEvent.click(screen.getByText("antiloki"));
    expect(screen.getByText(/archive all/)).toBeTruthy();
    unmount();

    workspaces = { active: SELF, workspaces: [SELF] };
    render(<WorkspaceSwitcher />);
    fireEvent.click(screen.getByText("antiloki"));
    expect(screen.queryByText(/archive all/)).toBeNull();
  });

  it("asks first, naming how many will be un-wired", () => {
    const confirm = confirmWith(false);
    openSwitcher();
    fireEvent.click(screen.getByText(/archive all/));
    expect(confirm.mock.calls[0][0]).toContain("Archive all 1 workspace");
    expect(removeWorkspace).not.toHaveBeenCalled();
  });

  it("un-wires every EXTERNAL workspace, never the self-hosting one", async () => {
    confirmWith(true);
    workspaces = { active: SELF, workspaces: [SELF, ws({ id: 2, name: "a" }), ws({ id: 3, name: "b" })] };
    openSwitcher();
    fireEvent.click(screen.getByText(/archive all/));
    await waitFor(() => expect(removeWorkspace).toHaveBeenCalledTimes(2));
    expect(removeWorkspace.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("keeps going when one removal throws", async () => {
    confirmWith(true);
    workspaces = { active: SELF, workspaces: [SELF, ws({ id: 2, name: "a" }), ws({ id: 3, name: "b" })] };
    removeWorkspace.mockRejectedValueOnce(new Error("boom"));
    openSwitcher();
    fireEvent.click(screen.getByText(/archive all/));
    await waitFor(() => expect(removeWorkspace).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });
});

describe("adding a workspace", () => {
  // THE FORM IS A WINDOW OF ITS OWN NOW (operator 2026-09-30): the dropdown only opens it. The form's tests live in new-workspace-dialog.test.tsx.
  it("opens the new-workspace window and closes itself, instead of growing a form inside a menu that closes when the pointer leaves", async () => {
    const { isNewWorkspaceOpen, closeNewWorkspace } = await import("./new-workspace-dialog");
    openSwitcher();
    fireEvent.click(screen.getByTestId("new-workspace-open"));
    expect(isNewWorkspaceOpen()).toBe(true);
    expect(screen.queryByTestId("new-workspace-open")).toBeNull();          // the dropdown folded
    expect(screen.queryByPlaceholderText("name (slug)")).toBeNull();        // …and no form was left inside it
    closeNewWorkspace();
  });
});

describe("hovering the menu", () => {
  // the rows answer the pointer (the coverage ratchet caught these handlers unvisited when the new-workspace entry joined them, 2026-10-01)
  it("lights the row, the new-workspace entry, the remove button and archive-all under the pointer, and puts each back when it leaves", () => {
    openSwitcher();
    const row = screen.getByText("proj-a").closest("button")!.parentElement as HTMLElement;
    fireEvent.mouseEnter(row);  expect(row.style.background).not.toBe("transparent");
    fireEvent.mouseLeave(row);  expect(row.style.background).toBe("transparent");
    const add = screen.getByTestId("new-workspace-open");
    fireEvent.mouseEnter(add);  expect(add.style.background).not.toBe("transparent");
    fireEvent.mouseLeave(add);  expect(add.style.background).toBe("transparent");
    const remove = screen.getByTitle(/remove "proj-a"/);
    const before = remove.style.color;
    fireEvent.mouseEnter(remove); const hot = remove.style.color; fireEvent.mouseLeave(remove);
    expect(hot).not.toBe(before);                                           // red under the pointer
    expect(remove.style.color).toBe(before);
    const archive = screen.getByText(/archive all/).closest("button")!;
    const was = archive.style.color;
    fireEvent.mouseEnter(archive); const lit = archive.style.color; fireEvent.mouseLeave(archive);
    expect(lit).not.toBe(was);
    expect(archive.style.color).toBe(was);
  });
  it("the active row does not light (it already is)", () => {
    openSwitcher();
    const active = screen.getAllByText("antiloki")[1].closest("button")!.parentElement as HTMLElement;
    const before = active.style.background;
    fireEvent.mouseEnter(active); expect(active.style.background).toBe(before);
  });
});

describe("AppSidebar", () => {
  it("groups the destinations and routes each one", () => {
    render(<AppSidebar collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByText("Operations").closest("a")!.getAttribute("href")).toBe("/operations");
    expect(screen.getByText("Atlas").closest("a")!.getAttribute("href")).toBe("/operations/atlas");
  });

  it("shows only what the current role may see", () => {
    role = "observer";
    const { unmount } = render(<AppSidebar collapsed={false} onToggle={vi.fn()} />);
    expect(screen.queryByText("Operations")).toBeNull();   // operator/builder only
    expect(screen.getByText("Atlas")).toBeTruthy();
    unmount();

    role = "builder";
    render(<AppSidebar collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByText("Prompts")).toBeTruthy();      // builder-only
  });

  it("narrows when collapsed", () => {
    const wide = render(<AppSidebar collapsed={false} onToggle={vi.fn()} />);
    const w = parseFloat((wide.container.firstChild as HTMLElement).style.width);
    wide.unmount();
    const narrow = render(<AppSidebar collapsed onToggle={vi.fn()} />);
    expect(parseFloat((narrow.container.firstChild as HTMLElement).style.width)).toBeLessThan(w);
  });
});
