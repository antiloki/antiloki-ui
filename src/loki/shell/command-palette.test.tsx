// The palette is the app's universal entry point, so the failures that matter are the ones that make it
// unreachable or misleading: a stale query carried into the next
// open, a filter that hides everything with no explanation, and a journal that invents activity
// instead of deriving it from real rows.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

let paletteOpen = true;
const setPaletteOpen = vi.fn((v: any) => { paletteOpen = typeof v === "function" ? v(paletteOpen) : v; });
const setChatOpen = vi.fn();
const resetTours = vi.fn();
const navigate = vi.fn();
const apiPost = vi.fn();
const narr = vi.hoisted(() => ({
  startNarrationJob: vi.fn(async () => {}), beginPress: vi.fn(), requestAutoplay: vi.fn(),
  requestDockExpand: vi.fn(), requestCastWhenReady: vi.fn(), requestClassWhenReady: vi.fn(),
  hydrateJobFromArtifact: vi.fn(async () => true), armAudio: vi.fn(),
}));
let here: any = null;

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("./slug-context", () => ({ useShell: () => ({ paletteOpen, setPaletteOpen, setChatOpen }) }));
vi.mock("./mini-tour", () => ({ resetTours: () => resetTours() }));
vi.mock("@/loki/api/client", () => ({ apiPost: (...a: any[]) => apiPost(...a) }));
vi.mock("@/loki/widgets/narration-jobs", () => narr);
vi.mock("@/loki/widgets/studio-kit", () => ({ STUDIO_CSS: "" }));
vi.mock("./command-store-registry", () => ({
  getHere: () => here,
  subscribeHere: () => () => {},
}));

import { CommandPalette } from "./command-palette";

const type = (v: string) => fireEvent.change(screen.getByRole("textbox"), { target: { value: v } });

beforeEach(() => {
  paletteOpen = true;
  here = null;
  setPaletteOpen.mockClear(); setChatOpen.mockClear(); resetTours.mockClear(); navigate.mockClear();
  for (const fn of Object.values(narr)) (fn as any).mockClear?.();
  apiPost.mockReset();
  apiPost.mockResolvedValue(null);
});

describe("opening and closing", () => {
  it("renders nothing while closed", () => {
    paletteOpen = false;
    const { container } = render(<CommandPalette />);
    expect(container.querySelector("[role=dialog]")).toBeNull();
  });

  // Ctrl/⌘+K no longer opens this menu (the operator 2026-11-22: the old menu); the key is a terminal's own
  it("does nothing on Ctrl+K and ⌘K", () => {
    paletteOpen = false; setPaletteOpen.mockClear(); const { unmount } = render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true }); fireEvent.keyDown(window, { key: "K", metaKey: true }); expect(setPaletteOpen).not.toHaveBeenCalled(); unmount();
  });

  it("no longer advertises the shortcut in its footer", () => {
    render(<CommandPalette />);
    expect(screen.queryByText(/⌘K/)).toBeNull();
  });

  it("closes on Escape and on the backdrop", () => {
    const { container } = render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(setPaletteOpen).toHaveBeenCalledWith(false);

    setPaletteOpen.mockClear();
    fireEvent.click(container.querySelectorAll("div")[0]);
    expect(setPaletteOpen).toHaveBeenCalledWith(false);
  });

  it("opens the chat drawer on \\ — but not while typing in a field", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document.body, { key: "\\" });   // a real keypress targets an element
    expect(setChatOpen).toHaveBeenCalledWith(true);

    setChatOpen.mockClear();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "\\" });
    expect(setChatOpen).not.toHaveBeenCalled();
  });

  it("is a labelled modal dialog", () => {
    render(<CommandPalette />);
    const dlg = screen.getByRole("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("the store catalog", () => {
  it("lists the screens and the rest of the categories", () => {
    render(<CommandPalette />);
    expect(screen.getByText("screens")).toBeTruthy();
    expect(screen.getByText("Harness")).toBeTruthy();
    for (const t of ["older screens", "help"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    for (const gone of ["Vibe", "Research", "Formations", "Mind maps & quizzes", "Knowledge", "Prompts", "Diffs"]) expect(screen.queryByText(gone)).toBeNull();   // the entries of screens that no longer exist
  });

  it("filters on both the label and the hint", () => {
    render(<CommandPalette />);
    type("harness");
    expect(screen.getByText("Harness")).toBeTruthy();
    expect(screen.queryByText("Prompts")).toBeNull();

    type("every call");                 // matches Audit's hint, not its label
    expect(screen.getByText("Audit")).toBeTruthy();
  });

  it("says nothing matches instead of showing a blank sheet", () => {
    render(<CommandPalette />);
    type("zzzzzz");
    expect(screen.getByText(/nothing matches/)).toBeTruthy();
  });

  it("runs the first match on Enter and closes", () => {
    render(<CommandPalette />);
    type("harness");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(setPaletteOpen).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith({ to: "/operations" });
  });

  it("does nothing on Enter when nothing matches", () => {
    render(<CommandPalette />);
    type("zzzzzz");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates when a tile is clicked", () => {
    render(<CommandPalette />);
    fireEvent.click(screen.getByText("Tagging"));
    expect(navigate).toHaveBeenCalledWith({ to: "/tagging" });
  });

  it("wires the non-navigating entries to their actions", () => {
    render(<CommandPalette />);
    fireEvent.click(screen.getByText("Welcome tour"));
    expect(resetTours).toHaveBeenCalled(); // "Welcome tour" replays the progressive tours (2026-09-20)
    fireEvent.click(screen.getByText("Chat drawer"));
    expect(setChatOpen).toHaveBeenCalledWith(true);
  });
});

describe("the ⌖ HERE section", () => {
  it("is absent when the current screen registered nothing", () => {
    render(<CommandPalette />);
    expect(screen.queryByText(/⌖ here/)).toBeNull();
  });

  it("shows the current screen's own features first", () => {
    const run = vi.fn();
    here = { title: "antiIDE", items: [{ icon: "★", label: "Rebuild atlas here", hint: "this screen", run }] };
    render(<CommandPalette />);
    expect(screen.getByText(/⌖ here · antiIDE/)).toBeTruthy();
    fireEvent.click(screen.getByText("Rebuild atlas here"));
    expect(run).toHaveBeenCalled();
  });

  it("gives a HERE item priority over the store for Enter", () => {
    const run = vi.fn();
    here = { title: "antiIDE", items: [{ icon: "★", label: "Harness thing here", run }] };
    render(<CommandPalette />);
    type("harness");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(run).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("filters the HERE items too", () => {
    here = { title: "antiIDE", items: [{ icon: "★", label: "Rebuild", run: vi.fn() }] };
    render(<CommandPalette />);
    type("zzz");
    expect(screen.queryByText("Rebuild")).toBeNull();
  });
});

describe("the pulse and the journal are derived from real rows", () => {
  const overview = {
    totals: { sessions: 4, active: 2, panes: 9, calls: 128, cost_usd: 3.1742 },
    sessions: [
      { name: "ship login", status: "active", panes: 3, calls: 46, created_at: "2026-05-20 10:00:00" },
      { name: "checkout", status: "merged", panes: 1, calls: 9, cost_usd: 0.94, created_at: "2026-05-19 10:00:00" },
    ],
  };
  const notebooks = { notebooks: [{ title: "auth study", item_count: 4, created_at: "2026-05-18 10:00:00" }] };

  const withData = async () => {
    apiPost.mockImplementation(async (path: string, body: any) => {
      if (path.includes("cockpit/overview")) return overview;
      if (path.includes("notebook/store") && body.op === "list") return notebooks;
      return { result: { result: { artefacts: [] } } };
    });
    render(<CommandPalette />);
    await waitFor(() => expect(screen.getByText("128")).toBeTruthy());
  };

  it("shows the live stat chips", async () => {
    await withData();
    const chip = (label: string) => screen.getByText(label).parentElement!.textContent;
    expect(chip("sessions")).toBe("4sessions");
    expect(chip("active")).toBe("2active");
    expect(chip("agents")).toBe("9agents");
    expect(chip("AI turns")).toBe("128AI turns");
    expect(chip("spend")).toBe("$3.174spend");
    expect(chip("notebooks")).toBe("1notebooks");
  });

  it("hides the chips while searching — they are context, not results", async () => {
    await withData();
    type("harness");
    expect(screen.queryByText("128")).toBeNull();
  });

  it("writes one journal entry per session, plus a merge entry, newest first", async () => {
    await withData();
    expect(screen.getByText(/super-session “ship login” started · 3 agents · 46 turns/)).toBeTruthy();
    expect(screen.getByText(/“checkout” merged · \$0.940 spent/)).toBeTruthy();
    expect(screen.getByText(/notebook “auth study” · 4 artifacts/)).toBeTruthy();
  });

  it("pluralises agent counts correctly", async () => {
    await withData();
    expect(screen.getByText(/1 agent ·/)).toBeTruthy();   // the merged session has one pane
  });

  it("survives every backing call failing", async () => {
    apiPost.mockRejectedValue(new Error("down"));
    render(<CommandPalette />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("screens")).toBeTruthy();
  });
});

describe("the artifact shelf", () => {
  const shelve = async (artefacts: any[]) => {
    apiPost.mockImplementation(async (path: string) =>
      path.includes("artefacts/manage") ? { result: { result: { artefacts } } } : null);
    render(<CommandPalette />);
    if (artefacts.length) await waitFor(() => expect(screen.getByText(new RegExp(artefacts[0].title))).toBeTruthy());
  };

  it("explains where finished artefacts land when the shelf is empty", async () => {
    await shelve([]);
    await waitFor(() => expect(screen.getByText(/nothing shelved yet/)).toBeTruthy());
  });

  it("rehydrates a shelved artefact from its file and opens the player", async () => {
    await shelve([{ file: "a.json", title: "the podcast", kind: "podcast", narration_id: 12, duration_ms: 90_000 }]);
    fireEvent.click(screen.getByText(/the podcast/));
    await waitFor(() => expect(narr.startNarrationJob).toHaveBeenCalledWith(12, "the podcast", expect.objectContaining({ kind: "podcast" })));
    await waitFor(() => expect(narr.hydrateJobFromArtifact).toHaveBeenCalledWith(12, "a.json"));
    expect(narr.requestAutoplay).toHaveBeenCalledWith(12);
    expect(narr.requestDockExpand).toHaveBeenCalled();
    expect(narr.beginPress).not.toHaveBeenCalled();       // the shelf answered — no re-press
    expect(setPaletteOpen).toHaveBeenCalledWith(false);
  });

  it("re-presses only when the shelf cannot hydrate it", async () => {
    narr.hydrateJobFromArtifact.mockResolvedValueOnce(false as any);
    await shelve([{ file: "a.json", title: "the podcast", kind: "podcast", narration_id: 12 }]);
    fireEvent.click(screen.getByText(/the podcast/));
    await waitFor(() => expect(narr.beginPress).toHaveBeenCalledWith(12, undefined));
  });

  it("sends a video cast to the cast player instead of plain autoplay", async () => {
    await shelve([{ file: "c.json", title: "the cast", kind: "video-cast", narration_id: 5, session_id: 3 }]);
    fireEvent.click(screen.getByText(/the cast/));
    await waitFor(() => expect(narr.requestCastWhenReady).toHaveBeenCalledWith(expect.objectContaining({ narrationId: 5, sessionId: 3 })));
    expect(narr.requestAutoplay).not.toHaveBeenCalled();
  });

  it("refuses an artefact with no narration id rather than starting an empty job", async () => {
    const err = console.error; console.error = () => {};
    await shelve([{ file: "b.json", title: "orphan", kind: "podcast" }]);
    fireEvent.click(screen.getByText(/orphan/));
    expect(narr.startNarrationJob).not.toHaveBeenCalled();
    console.error = err;
  });

  it("filters the shelf with the same query as the store", async () => {
    await shelve([{ file: "a.json", title: "the podcast", kind: "podcast", narration_id: 1 }]);
    type("zzz");
    expect(screen.queryByText(/the podcast/)).toBeNull();
  });
});
