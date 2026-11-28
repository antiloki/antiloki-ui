// Drop-zone geometry. These two functions decide where a dragged panel lands, and they are pure
// arithmetic over the viewport width — which makes the BOUNDARIES the whole test: one pixel either
// side of an edge is the difference between docking and not.
import { describe, it, expect, afterEach, vi } from "vitest";
import { CATEGORY_TINT } from "@/loki/widgets/studio-icons";
import { widgetSideAt, zoneAt } from "./widget-dock";

const EDGE = 110; // mirrors the module's constant

function width(w: number) {
  Object.defineProperty(window, "innerWidth", { value: w, writable: true, configurable: true });
}
afterEach(() => width(1024));

describe("widgetSideAt — cards dock to the sides only", () => {
  it("returns left inside the left edge band", () => {
    width(1000);
    expect(widgetSideAt(0)).toBe("left");
    expect(widgetSideAt(EDGE - 1)).toBe("left");
  });

  it("returns null exactly AT the edge threshold — the band is exclusive", () => {
    width(1000);
    expect(widgetSideAt(EDGE)).toBeNull();
    expect(widgetSideAt(1000 - EDGE)).toBeNull();
  });

  it("returns right inside the right edge band", () => {
    width(1000);
    expect(widgetSideAt(1000 - EDGE + 1)).toBe("right");
    expect(widgetSideAt(1000)).toBe("right");
  });

  it("returns null across the whole middle", () => {
    width(1000);
    for (const x of [200, 500, 800]) expect(widgetSideAt(x), String(x)).toBeNull();
  });

  it("tracks the viewport width rather than assuming one", () => {
    width(400);
    expect(widgetSideAt(350)).toBe("right");
    width(2000);
    expect(widgetSideAt(350)).toBeNull();
  });

  it("clamps sensibly on a viewport narrower than two edge bands", () => {
    // Both bands overlap; left is checked first, so the left half wins. It must never crash or
    // return something outside the union.
    width(150);
    expect(["left", "right", null]).toContain(widgetSideAt(75));
  });
});

describe("zoneAt — panels can also target the centre", () => {
  it("matches widgetSideAt at both edges", () => {
    width(1000);
    expect(zoneAt(50)).toBe("left");
    expect(zoneAt(950)).toBe("right");
  });

  it("returns center only inside the middle band (36%–64%)", () => {
    width(1000);
    expect(zoneAt(500)).toBe("center");
    expect(zoneAt(361)).toBe("center");
    expect(zoneAt(639)).toBe("center");
  });

  it("returns null in the dead bands between an edge and the centre", () => {
    // These gaps exist so a sloppy drag does nothing rather than docking somewhere unintended.
    width(1000);
    expect(zoneAt(200)).toBeNull();
    expect(zoneAt(800)).toBeNull();
  });

  it("excludes the exact centre-band boundaries", () => {
    width(1000);
    expect(zoneAt(360)).toBeNull();
    expect(zoneAt(640)).toBeNull();
  });

  it("scales the centre band with the viewport", () => {
    width(2000);
    expect(zoneAt(1000)).toBe("center");
    expect(zoneAt(500)).toBeNull();   // 25% — outside the band at this width
  });

  it("gives edges priority over the centre on a narrow viewport", () => {
    // At 300px the edge bands reach 110 and 190, and the centre band is 108–192 — they overlap.
    // Edge must win, or a drag near the edge of a small window would dock centre.
    width(300);
    expect(zoneAt(50)).toBe("left");
    expect(zoneAt(250)).toBe("right");
  });

  it("only ever returns one of the three zones or null", () => {
    width(1000);
    for (let x = 0; x <= 1000; x += 7) expect(["left", "center", "right", null]).toContain(zoneAt(x));
  });
});

// ── rows + the stable host node (operator 2026-09-16) ─────────────────────────────────────────
import React from "react";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { DockZone, dockRows, ROW_MAX } from "./widget-dock";

describe("dockRows — the antiDesk stage wraps every ROW_MAX panes onto a new line", () => {
  it("chunks in order, last row short", () => {
    const ids = Array.from({ length: 23 }, (_, i) => `w${i}`);
    const rows = dockRows(ids);
    expect(ROW_MAX).toBe(10);
    expect(rows.map((r) => r.length)).toEqual([10, 10, 3]);
    expect(rows[2]).toEqual(["w20", "w21", "w22"]);
    expect(dockRows([])).toEqual([]);
  });
});

function Counter({ label }: { label: string }) {
  const [n, setN] = React.useState(0);
  return <button data-testid={`ctr-${label}`} onClick={() => setN((x) => x + 1)}>{label}:{n}</button>;
}

describe("DockZone fullscreen keeps the pane's React state (same subtree, re-parented)", () => {
  it("⛶ then ← back: the counter clicked before expanding is still there", () => {
    const items = [{ id: "a", label: "standup", render: () => <Counter label="a" /> }];
    render(<DockZone zone="center" items={items} collapsed={[]} onToggle={() => {}} onCloseItem={() => {}} />);
    fireEvent.click(screen.getByTestId("ctr-a"));
    fireEvent.click(screen.getByTestId("ctr-a"));
    expect(screen.getByTestId("ctr-a").textContent).toBe("a:2");
    fireEvent.click(screen.getByTitle(/fullscreen/));
    // the fullscreen page shows THE SAME node, state intact
    expect(screen.getByTestId("ctr-a").textContent).toBe("a:2");
    expect(screen.getByTitle("back (Esc)")).toBeTruthy();
    fireEvent.click(screen.getByTitle("back (Esc)"));
    expect(screen.getByTestId("ctr-a").textContent).toBe("a:2");
  });
  it("lays 12 items out as two rows on the center stage", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, label: `w${i}`, render: () => <span>{i}</span> }));
    const { container } = render(<DockZone zone="center" items={items} collapsed={[]} onToggle={() => {}} onCloseItem={() => {}} />);
    expect(container.querySelectorAll("[data-dock-row]").length).toBe(2);
    expect(container.querySelectorAll("[data-dock-row='1'] [data-dock-id]").length).toBe(2);
  });
});


// THREADS HARNESS (2026-09-18): threads are controlled by the page; this mirrors chat-thread's wiring
function ThreadsHarness({ items, catalog, initial, onAdd, sideTab }: { items: any[]; catalog?: any[]; initial?: { id: string; name: string; items: string[] }[]; onAdd?: (kind: string, t: any) => void; sideTab?: "chats" | "threads" }) {
  const [threads, setThreads] = React.useState<{ id: string; name: string; items: string[]; aliases?: Record<string, string> }[]>(initial ?? [{ id: "t1", name: "thread 1", items: [] }]);
  const [active, setActive] = React.useState<string | null>(initial?.[0]?.id ?? "t1");
  const seq = React.useRef(10);
  const cat = catalog?.map((c) => ({ ...c, kinds: c.kinds.map((k: any) => ({ ...k, add: (tg: any) => { onAdd?.(k.kind, tg); k.add?.(tg); } })) }));
  return <DockZone zone="center" layout="threads" sideTab={sideTab} items={items} collapsed={[]} onToggle={() => {}} onCloseItem={() => {}} catalog={cat}
    selected={threads.find((x) => x.id === active)?.items ?? []}
    onRenameItem={(id, v) => setThreads((ts) => ts.map((x) => (x.id === active ? { ...x, aliases: { ...(x.aliases ?? {}), [id]: v } } : x)))}
    threads={threads} activeThread={active} onSelectThread={setActive}
    onNewThread={(its) => { const id = `t${++seq.current}`; setThreads((ts) => [...ts, { id, name: `thread ${ts.length + 1}`, items: its ?? [] }]); setActive(id); }}
    onRenameThread={(id, name) => setThreads((ts) => ts.map((x) => (x.id === id ? { ...x, name } : x)))}
    onDeleteThread={(id) => { setThreads((ts) => ts.filter((x) => x.id !== id)); setActive((a) => (a === id ? null : a)); }}
    onSetThreadItems={(id, its) => setThreads((ts) => ts.map((x) => (x.id === id ? { ...x, items: its } : x)))}
    onSetThreadCollapsed={(id, collapsed) => setThreads((ts) => ts.map((x) => (x.id === id ? { ...x, collapsed } : x)))} />;
}

// an instance-backed catalog: the Studio kind stands for an already-open item (the way antiChat does)
const instKinds = (category: string, ids: string[]) => ({ category, kinds: ids.map((id) => ({ kind: id, label: id, instance: id, add: vi.fn() })) });

describe("the Threads sidebar folds to a rail (2026-09-18: the full-screen feeling at will)", () => {
  it("◂ folds it to a 26px rail naming the active thread; ▸ unfolds; the split keeps its cells", () => {
    const items = [{ id: "a", label: "a", category: "tools", render: () => <span>a</span> }];
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "auth refresh", items: ["a"] }]} />);
    fireEvent.click(screen.getByTestId("threads-sidebar-fold"));
    expect(screen.queryByTestId("threads-sidebar")).toBeNull();
    expect(screen.getByTestId("threads-sidebar-folded").textContent).toContain("auth refresh");
    expect(container.querySelectorAll("[data-thread-cell]").length).toBe(1);
    fireEvent.click(screen.getByTestId("threads-sidebar-unfold"));
    expect(screen.getByTestId("threads-sidebar")).toBeTruthy();
    localStorage.removeItem("antiloki:threads-sidebar");
  });

  // operator 2026-09-24: "when i collapse the sidebar left is called thread 2, rename for Agents"
  it("the agents surface has NO sidebar — not a roster, not a rail", () => {
    // THE WHOLE COLUMN IS GONE (operator 2026-09-26: "No sidebar left just the switcher agent dropdown … We only
    // have one agent that switch roles based on heimdall"). This assertion used to check that the folded rail
    // named the surface; there is no rail to name it. One agent that switches roles has nothing to list, and the
    // role switcher lives in the agent's own header instead.
    render(<ThreadsHarness sideTab="chats" items={[]} initial={[{ id: "t1", name: "thread 2", items: [] }]} />);
    expect(screen.queryByTestId("threads-sidebar")).toBeNull();
    expect(screen.queryByTestId("threads-sidebar-folded")).toBeNull();
    expect(screen.queryByTestId("threads-sidebar-fold")).toBeNull();
    // …and the stage is still there: removing the column must not remove the conversation
    expect(screen.getByTestId("chats-body")).toBeTruthy();
    localStorage.removeItem("antiloki:threads-sidebar");
  });
});

describe("focus inside a thread (2026-09-18): click a member row to view it alone, more rows to view several", () => {
  it("one click → solo; a second row joins; clicking a focused row takes it out; the thread row shows everything; members are untouched", () => {
    const items = ["a", "b", "c"].map((id) => ({ id, label: id, category: "tools", render: () => <span>{id}</span> }));
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "t", items: ["a", "b", "c"] }]} />);
    const cells = () => Array.from(container.querySelectorAll("[data-thread-cell]")).map((e) => e.getAttribute("data-thread-cell"));
    const row = (id: string) => container.querySelector(`[data-in-thread='t1'][data-thread-id='${id}']`)!;
    expect(cells()).toEqual(["a", "b", "c"]);
    fireEvent.click(row("b"));
    expect(cells()).toEqual(["b"]);
    expect(row("a").getAttribute("data-focused")).toBe("off"); expect(row("b").getAttribute("data-focused")).toBe("on");
    fireEvent.click(row("c"));
    expect(cells()).toEqual(["b", "c"]);
    fireEvent.click(row("b"));
    expect(cells()).toEqual(["c"]);
    fireEvent.click(row("c")); // the last one leaving → everything
    expect(cells()).toEqual(["a", "b", "c"]);
    fireEvent.click(row("a"));
    fireEvent.click(container.querySelector("[data-thread-row='t1'] > div")!); // the active thread's own row → everything
    expect(cells()).toEqual(["a", "b", "c"]);
    expect(container.querySelectorAll("[data-in-thread='t1']").length).toBe(3); // the members never changed
  });
});

describe("a thread pane collapses to an edge strip (2026-09-18) — horizontally to the right rail, vertically to the bottom bar", () => {
  it("⊣ parks the pane as a vertical strip, ⊥ as a bottom bar; the grid follows the open ones; clicking a strip reopens it; the body stays mounted", () => {
    const items = ["a", "b", "c"].map((id) => ({ id, label: id, category: "tools", render: () => <Counter label={id} /> }));
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "t", items: ["a", "b", "c"] }]} />);
    const cells = () => container.querySelectorAll("[data-thread-cell]").length;
    const split = () => container.querySelector("[data-testid='threads-split']")!;
    fireEvent.click(screen.getByTestId("ctr-b"));
    expect(cells()).toBe(3);
    fireEvent.click(screen.getByTestId("cell-strip-v-b"));
    expect(cells()).toBe(2);
    expect(container.querySelector("[data-thread-strip='b'][data-strip='v']")).toBeTruthy();
    expect(split().getAttribute("data-cols")).toBe("2"); expect(split().getAttribute("data-rows")).toBe("1");
    fireEvent.click(screen.getByTestId("cell-strip-h-a"));
    expect(cells()).toBe(1);
    expect(container.querySelector("[data-thread-strip='a'][data-strip='h']")).toBeTruthy();
    fireEvent.click(container.querySelector("[data-thread-strip='b'] > div")!); // the strip reopens it
    expect(cells()).toBe(2);
    expect(screen.getByTestId("ctr-b").textContent).toBe("b:1"); // still the same mounted body
    fireEvent.click(container.querySelector("[data-thread-strip='a']")!);
    expect(cells()).toBe(3);
  });
});

describe("threads layout — list left, one body right, every body kept mounted", () => {
  it("the active thread's members are the split; switching threads swaps; a hidden body keeps its state", () => {
    const items = [
      { id: "chat", label: "chat", category: "chat", obligatory: true, bare: true, render: () => <Counter label="chat" /> },
      { id: "w1", label: "atlas graph", category: "codebase", render: () => <span>graph</span> },
      { id: "w2", label: "Claude Code", category: "agents", render: () => <Counter label="claude" /> },
    ];
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "fix tests", items: ["w2"] }, { id: "t2", name: "reading", items: ["chat", "w1"] }]} />);
    // the sidebar: chat · threads (active one open with its members) · studio
    expect(Array.from(container.querySelectorAll("[data-thread-cat]")).map((el) => el.getAttribute("data-thread-cat"))).toEqual(["threads", "studio"]);
    expect(Array.from(container.querySelectorAll("[data-in-thread='t1']")).map((el) => el.getAttribute("data-thread-id"))).toEqual(["w2"]);
    expect(screen.getByTestId("ctr-claude")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ctr-claude"));
    expect(screen.getByTestId("ctr-claude").textContent).toBe("claude:1");
    fireEvent.click(container.querySelector("[data-thread-row='t2'] > div")!); // switch thread
    expect(Array.from(container.querySelectorAll("[data-thread-cell]")).map((el) => el.getAttribute("data-thread-cell"))).toEqual(["chat", "w1"]);
    expect(screen.queryByTestId("ctr-claude")).toBeNull();
    fireEvent.click(container.querySelector("[data-thread-row='t1'] > div")!);
    expect(screen.getByTestId("ctr-claude").textContent).toBe("claude:1"); // state survived
  });
});

describe("dock ⇄ threads switch keeps every body mounted", () => {
  it("a counter clicked in the dock layout is intact after switching to threads and back", () => {
    const items = [
      { id: "chat", label: "chat", category: "workspace", obligatory: true, bare: true, render: () => <span>chat</span> },
      { id: "w2", label: "Claude Code", category: "agents", render: () => <Counter label="w2" /> },
    ];
    const { rerender, container } = render(<DockZone zone="center" layout="dock" items={items} collapsed={[]} onToggle={() => {}} onCloseItem={() => {}} />);
    fireEvent.click(screen.getByTestId("ctr-w2"));
    rerender(<DockZone zone="center" layout="threads" items={items} collapsed={[]} onToggle={() => {}} onCloseItem={() => {}} selected={["w2"]} threads={[{ id: "t1", name: "t", items: ["w2"] }]} activeThread="t1" />);
    expect(container.querySelector("[data-thread-cell='w2']")).toBeTruthy();
    expect(screen.getByTestId("ctr-w2").textContent).toBe("w2:1");
    rerender(<DockZone zone="center" layout="dock" items={items} collapsed={[]} onToggle={() => {}} onCloseItem={() => {}} />);
    expect(screen.getByTestId("ctr-w2").textContent).toBe("w2:1");
  });
});

describe("threads split — ⊞ divides the right side into a grid", () => {
  it("threadGrid tiles like antiVibe: 2 side by side, 4 in 2×2, 6 in 3×2", async () => {
    const { threadGrid } = await import("./widget-dock");
    const dims = (n: number) => { const g = threadGrid(n); return [g.cols, g.rows]; };
    const spans = (n: number) => threadGrid(n).cells.map((c) => `${c.colSpan}x${c.rowSpan}`);
    expect(dims(1)).toEqual([1, 1]);
    expect(dims(2)).toEqual([2, 1]);
    expect(dims(4)).toEqual([2, 2]);
    expect(dims(6)).toEqual([3, 2]);
    expect(dims(9)).toEqual([3, 3]);
    // no empty quarter: 3 → one full-height column + two stacked; 5 → one tall + a 2×2
    expect(dims(3)).toEqual([2, 2]);
    expect(spans(3)).toEqual(["1x2", "1x1", "1x1"]);
    expect(spans(5)).toEqual(["1x2", "1x1", "1x1", "1x1", "1x1"]);
    // three-row grids: the last pane widens over the spare cells
    expect(spans(7)).toEqual(["1x1", "1x1", "1x1", "1x1", "1x1", "1x1", "3x1"]);
    expect(spans(8)[7]).toBe("2x1");
    // more than the screen holds (operator 2026-09-17): never a 4th column — new rows instead
    expect(dims(10)).toEqual([3, 4]);
    expect(dims(16)).toEqual([3, 6]);
    expect(spans(10)[9]).toBe("3x1");
  });
  it("an open widget joins the thread from the Studio (an instance-backed kind); ⊟ on its row leaves; the grid follows", () => {
    const items = ["chat", "a", "b", "c"].map((id) => ({ id, label: id, category: id === "chat" ? "chat" : "tools", obligatory: id === "chat", render: () => <span>{id}</span> }));
    // the chat is a Studio kind under agents that stands for the one open instance (2026-09-18)
    const chatCatalog = [{ category: "agents", kinds: [{ kind: "chat", label: "antiChat", instance: "chat", add: vi.fn() }] }, instKinds("tools", ["b", "c"])];
    const { container } = render(<ThreadsHarness items={items} catalog={chatCatalog} initial={[{ id: "t1", name: "t", items: ["a"] }]} />);
    const split = () => container.querySelector("[data-testid='threads-split']")!;
    expect(container.querySelectorAll("[data-thread-cell]").length).toBe(1);
    // one list, no tabs (2026-09-23: "take out completely on the sidebar right the models tab")
    for (const id of ["b", "c"]) { fireEvent.click(screen.getByTestId(`studio-kind-${id}`)); fireEvent.click(screen.getByTestId("preview-add")); }
    fireEvent.click(screen.getByTestId("studio-kind-chat")); fireEvent.click(screen.getByTestId("preview-add")); // the chat, from the Studio like any widget
    fireEvent.click(screen.getByTestId("studio-kind-chat")); expect(screen.getByTestId("preview-in-thread")).toBeTruthy(); // once in, the Studio says so
    fireEvent.click(screen.getByTestId("preview-close")); // ✕ returns to the split
    expect(container.querySelectorAll("[data-thread-cell]").length).toBe(4);
    expect(split().getAttribute("data-cols")).toBe("2");
    expect(split().getAttribute("data-rows")).toBe("2");
    fireEvent.click(screen.getByTestId("thread-split-c")); // ⊟ on the member row
    expect(container.querySelectorAll("[data-thread-cell]").length).toBe(3);
    expect(Array.from(container.querySelectorAll("[data-thread-cell]")).map((el) => el.getAttribute("data-span"))).toEqual(["1x2", "1x1", "1x1"]);
    fireEvent.click(screen.getByTestId("studio-kind-c")); expect(screen.getByTestId("preview-add")).toBeTruthy(); // out of the thread → addable again
  });

  it("more widgets than the screen holds → new rows below the fold, the split scrolls (2026-09-17)", () => {
    const ids = ["chat", "a", "b", "c", "d", "e", "f", "g"];
    const items = ids.map((id) => ({ id, label: id, category: id === "chat" ? "chat" : "tools", obligatory: id === "chat", render: () => <span>{id}</span> }));
    const { container } = render(<ThreadsHarness items={items} catalog={[instKinds("tools", ["g"])]} initial={[{ id: "t1", name: "t", items: ["a", "b", "c", "d", "e", "f"] }]} />); // 6 → 3×2, all on screen
    const split = () => container.querySelector("[data-testid='threads-split']") as HTMLElement;
    const scroll = () => container.querySelector("[data-testid='threads-split-scroll']") as HTMLElement;
    expect(split().getAttribute("data-cols")).toBe("3");
    expect(split().getAttribute("data-rows")).toBe("2");
    expect(split().style.height).toBe("100%");
    expect(scroll().style.overflowY).toBe("hidden");
    fireEvent.click(screen.getByTestId("studio-kind-g")); fireEvent.click(screen.getByTestId("preview-add")); // 7th → a third row, half a screen tall, below the fold
    expect(split().getAttribute("data-cols")).toBe("3");
    expect(split().getAttribute("data-rows")).toBe("3");
    expect(split().style.height).toBe("150%");
    expect(scroll().style.overflowY).toBe("auto");
  });
});

describe("threads — named compositions; the Studio previews a kind and opens it into a thread (2026-09-18)", () => {
  const mk = (id: string, category: string, extra: any = {}) => ({ id, label: id, category, render: () => <span>{id}</span>, ...extra });
  const items = [mk("chat", "chat", { obligatory: true }), mk("a", "tools"), mk("z", "codebase")];
  const catalog = [
    { category: "tools", kinds: [{ kind: "vibe-kanban", label: "Kanban", glyph: "◇", description: "Your Trello for the session.", sample: <b data-testid="kanban-sample">sample</b>, add: vi.fn() }] },
    { category: "codebase", kinds: [{ kind: "atlas-xray", label: "X-ray", add: vi.fn() }] },
  ];
  it("+ opens a new thread; double-click renames it; ✕ deletes it; a member's alias lives in the thread only", () => {
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "first", items: ["a"] }]} />);
    fireEvent.click(screen.getByTestId("thread-new"));
    expect(container.querySelectorAll("[data-thread-row]").length).toBe(2);
    expect(container.querySelector("[data-thread-row='t11'] > div")!.textContent).toContain("thread 2");
    const name = container.querySelector("[data-thread-row='t11'] span[title*='rename']") as HTMLElement;
    fireEvent.doubleClick(name);
    const input = container.querySelector("[data-thread-row='t11'] input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "migrate v3" } }); fireEvent.keyDown(input, { key: "Enter" });
    expect(container.querySelector("[data-thread-row='t11'] > div")!.textContent).toContain("migrate v3");
    // back to the first thread: alias its member
    fireEvent.click(container.querySelector("[data-thread-row='t1'] > div")!);
    fireEvent.doubleClick(container.querySelector("[data-in-thread='t1'][data-thread-id='a'] span[title*='rename']")!);
    const alias = container.querySelector("[data-in-thread='t1'] input") as HTMLInputElement;
    fireEvent.change(alias, { target: { value: "the shell" } }); fireEvent.keyDown(alias, { key: "Enter" });
    expect(container.querySelector("[data-thread-cell='a']")!.textContent).toContain("the shell"); // the cell header shows the alias
    expect(container.querySelector("[data-in-thread='t1'][data-thread-id='a']")!.textContent).toContain("the shell"); // the alias lives in the thread's row too
    fireEvent.click(screen.getByTestId("thread-delete-t11"));
    expect(container.querySelectorAll("[data-thread-row]").length).toBe(1);
  });
  it("one list of tools: design and codebase tiles sit in the same section with no heading of their own, each in its own colour", () => {
    const one = [{ category: "tools", kinds: [
      { kind: "vibe-issues", label: "Issues", add: vi.fn() },
      { kind: "design-frames", label: "Frames", category: "design", add: vi.fn() },
      { kind: "atlas-xray", label: "X-ray", category: "codebase", add: vi.fn() },
    ] }];
    const { container } = render(<ThreadsHarness items={items} catalog={one} initial={[{ id: "t1", name: "first", items: ["a"] }]} />);
    expect(container.querySelectorAll("[data-studio-cat]").length).toBe(1);
    expect(container.querySelector("[data-studio-cat='tools'] [data-thread-catalog='design-frames']")).toBeTruthy();
    expect(container.querySelector("[data-studio-cat='tools'] [data-thread-catalog='atlas-xray']")).toBeTruthy();
    expect(screen.queryByTestId("studio-section-design")).toBeNull(); expect(screen.queryByTestId("studio-section-codebase")).toBeNull();
    expect(screen.queryByTestId("studio-section-tools")).toBeNull();   // and the lone list has no name: it is all the Studio
    const stroke = (k: string) => container.querySelector(`[data-thread-catalog='${k}'] svg`)!.getAttribute("stroke");
    expect(stroke("vibe-issues")).toBe(CATEGORY_TINT.tools); expect(stroke("design-frames")).toBe(CATEGORY_TINT.design); expect(stroke("atlas-xray")).toBe(CATEGORY_TINT.codebase);
    expect(new Set([stroke("vibe-issues"), stroke("design-frames"), stroke("atlas-xray")]).size).toBe(3);   // the colours are what tell them apart
  });
  it("the Studio grid shows every kind by category; a pick previews it with its description and sample; the two buttons carry the target", () => {
    const onAdd = vi.fn();
    const { container } = render(<ThreadsHarness items={items} catalog={catalog} initial={[{ id: "t1", name: "first", items: ["a"] }]} onAdd={onAdd} />);
    // STUDIO | MODELS (2026-09-23): the studio tab shows EVERY non-agent category as a headed section, no tabs below
    // (here the catalog has no agents, so the models tab has nothing and the studio shows)
    expect(container.querySelector("[data-studio-cat='tools'] [data-thread-catalog='vibe-kanban']")).toBeTruthy();
    expect(container.querySelector("[data-studio-cat='codebase'] [data-thread-catalog='atlas-xray']")).toBeTruthy();
    expect(screen.getByTestId("studio-section-tools").textContent).toBe("tools");
    expect(screen.getByTestId("studio-section-codebase").textContent).toBe("codebase");
    expect(screen.queryByTestId("studio-tab-tools")).toBeNull();
    localStorage.removeItem("antiloki:studio-tab");
    expect(screen.queryByTestId("studio-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("studio-kind-vibe-kanban"));
    const pv = screen.getByTestId("studio-preview");
    expect(pv.textContent).toContain("Kanban");
    expect(pv.textContent).toContain("Your Trello for the session.");
    expect(screen.getByTestId("kanban-sample")).toBeTruthy();
    expect(container.querySelector("[data-testid='threads-split']")).toBeNull(); // the preview replaces the split
    fireEvent.click(screen.getByTestId("preview-add"));
    expect(onAdd).toHaveBeenLastCalledWith("vibe-kanban", { thread: "t1" });
    fireEvent.click(screen.getByTestId("studio-kind-atlas-xray"));
    fireEvent.click(screen.getByTestId("preview-new-thread"));
    expect(onAdd).toHaveBeenLastCalledWith("atlas-xray", { thread: "new" });
    expect(screen.queryByTestId("studio-preview")).toBeNull(); // back to the thread after the pick
  });
  it("an instance-backed kind can start a new thread of its own", () => {
    const { container } = render(<ThreadsHarness items={items} catalog={[instKinds("tools", ["z"])]} initial={[{ id: "t1", name: "first", items: ["a"] }]} />);
    fireEvent.click(screen.getByTestId("studio-kind-z"));
    expect(screen.getByTestId("studio-preview").textContent).toContain("z");
    fireEvent.click(screen.getByTestId("preview-new-thread"));
    expect(container.querySelectorAll("[data-thread-row]").length).toBe(2);
    expect(Array.from(container.querySelectorAll("[data-thread-cell]")).map((el) => el.getAttribute("data-thread-cell"))).toEqual(["z"]);
  });
});

describe("threads split — reorder + resize helpers", () => {
  it("moveBefore shifts the dragged cell into the hovered slot", async () => {
    const { moveBefore, resizeWeights } = await import("./widget-dock");
    expect(moveBefore(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveBefore(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveBefore(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    // a seam moves size between its two neighbours, never below 15% of their pair
    expect(resizeWeights([1, 1], 1, 0.5)).toEqual([1.5, 0.5]);
    expect(resizeWeights([1, 1, 1], 2, -0.2)).toEqual([1, 0.8, 1.2]);
    expect(resizeWeights([1, 1], 1, 5).map((x) => Number(x.toFixed(3)))).toEqual([1.7, 0.3]);
  });
  it("the grid template follows the seams and the cells carry grips", () => {
    const items = ["chat", "a", "b"].map((id) => ({ id, label: id, category: "tools", obligatory: id === "chat", render: () => <span>{id}</span> }));
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "t", items: ["chat", "a", "b"] }]} />);
    const split = container.querySelector("[data-testid='threads-split']") as HTMLElement;
    expect(split.style.gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    expect(container.querySelectorAll("[data-testid^='seam-col-']").length).toBe(1);
    expect(container.querySelectorAll("[data-testid^='seam-row-']").length).toBe(1);
    expect(screen.getByTestId("cell-grip-a")).toBeTruthy();
  });
});

describe("threads split — dragging a cell's ⠿ over another cell swaps their slots", () => {
  it("pointer down on the grip, move over the other cell, up → order changes", () => {
    const items = ["chat", "a", "b"].map((id) => ({ id, label: id, category: "tools", obligatory: id === "chat", render: () => <span>{id}</span> }));
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "t", items: ["a", "b"] }]} />);
    const order = () => Array.from(container.querySelectorAll("[data-thread-cell]")).map((el) => el.getAttribute("data-thread-cell"));
    expect(order()).toEqual(["a", "b"]);
    // jsdom has no layout: give the two cells real-looking rects
    const rect = (l: number) => ({ left: l, right: l + 500, top: 0, bottom: 600, width: 500, height: 600, x: l, y: 0, toJSON: () => ({}) }) as DOMRect;
    for (const el of Array.from(container.querySelectorAll<HTMLElement>("[data-thread-cell]"))) {
      el.getBoundingClientRect = () => rect(el.getAttribute("data-thread-cell") === "a" ? 0 : 500);
    }
    fireEvent.pointerDown(screen.getByTestId("cell-grip-a"), { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 750, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 750, clientY: 300 });
    expect(order()).toEqual(["b", "a"]);
  });
});

describe("threads — an agent's temporary subagents list under it", () => {
  it("draws the running jobs from the store beneath the agent row", async () => {
    const { publishSubagents } = await import("@/loki/widgets/subagents");
    const items = [
      { id: "chat", label: "chat", category: "workspace", obligatory: true, render: () => <span>chat</span> },
      { id: "ag", label: "fix tests", category: "agents", subagentsKey: "1-2", render: () => <span>agent</span> },
    ];
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "t", items: ["ag"] }]} />);
    expect(container.querySelector("[data-testid='thread-subagents-ag']")).toBeNull();
    act(() => { publishSubagents("1-2", [
      { id: 1, parent: "1-2", goal: "g", title: "grep env reads", prompt: "", engine: "claude-code", cwd: "/w", write: false, status: "running", created: 0, started: Date.now(), ended: null, result: null, error: null, delivered: false },
      { id: 2, parent: "1-2", goal: "g", title: "list defaults", prompt: "", engine: "claude-code", cwd: "/w", write: false, status: "queued", created: 0, started: null, ended: null, result: null, error: null, delivered: false },
    ] as any); });
    const rows = container.querySelector("[data-testid='thread-subagents-ag']")!;
    expect(rows.textContent).toContain("grep env reads");
    expect(rows.textContent).toContain("list defaults");
    expect(rows.textContent).toContain("queued");
  });
});

describe("threads — a live goal run lists its tasks by wave under the agent", () => {
  it("shows the run line and its tasks", async () => {
    const { publishGoalRuns } = await import("@/loki/widgets/subagents");
    const items = [
      { id: "chat", label: "chat", category: "workspace", obligatory: true, render: () => <span>chat</span> },
      { id: "ag", label: "fix tests", category: "agents", subagentsKey: "7-7", render: () => <span>agent</span> },
    ];
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "t", items: ["ag"] }]} />);
    act(() => { publishGoalRuns("7-7", [{ id: 4, parent: "7-7", goal: "audit env", engine: "claude-code", cwd: "/w", write: false, concurrency: 3, status: "running", created: 0, started: 0, ended: null, blackboard: [], events: [], report: null, delivered: false, error: null,
      tasks: [
        { id: "t1", title: "inventory", prompt: "", owns: [], needs: [], acceptance: [], status: "done", wave: 0, attempts: 1, started: 1, ended: 2, report: "ok", verdict: null, error: null, trace: null, changed: [] },
        { id: "t2", title: "write-up", prompt: "", owns: [], needs: ["t1"], acceptance: [], status: "running", wave: 1, attempts: 1, started: Date.now(), ended: null, report: null, verdict: null, error: null, trace: null, changed: [] },
      ] }] as any); });
    const rows = container.querySelector("[data-testid='thread-goal-4']")!;
    expect(rows.textContent).toContain("goal #4 · audit env");
    expect(rows.textContent).toContain("w1inventory");
    expect(rows.textContent).toContain("w2write-up");
    expect(rows.textContent).toMatch(/running \d+s/);
  });
});

describe("threads — the Studio shelf and folding", () => {
  const items = [
    { id: "chat", label: "chat", category: "chat", obligatory: true, render: () => <span>chat</span> },
    { id: "ag", label: "fix tests", category: "agents", kind: "vibe-pane:claude-code", render: () => <span>agent</span> },
  ];
  const catalog = [
    { category: "agents", kinds: [{ kind: "vibe-pane:claude-code", label: "Claude Code", add: vi.fn() }, { kind: "vibe-pane:codex", label: "Codex", add: vi.fn() }] },
    { category: "codebase", kinds: [{ kind: "atlas-xray", label: "X-ray", add: vi.fn() }] },
  ];
  it("every kind stays in the grid even with an instance open; there is no 'open elsewhere' shelf (2026-09-18)", () => {
    localStorage.removeItem("antiloki:studio-tab"); // models (the agents) is the default tab (2026-09-23)
    const { container } = render(<ThreadsHarness items={items} catalog={catalog} initial={[{ id: "t1", name: "t", items: [] }]} />);
    expect(container.querySelector("[data-thread-catalog='vibe-pane:claude-code']")).toBeTruthy();
    expect(container.querySelector("[data-thread-catalog='vibe-pane:codex']")).toBeTruthy();
    expect(screen.queryByTestId("studio-open-ag")).toBeNull();
  });
  it("folds a section (rows stay mounted, height animates via grid rows) and remembers it", () => {
    const { container } = render(<ThreadsHarness items={items} catalog={catalog} initial={[{ id: "t1", name: "t", items: ["ag"] }]} />);
    const fold = () => (container.querySelector("[data-thread-cat='threads'] > [data-loki-slide='threads'] > div") as HTMLElement).style.gridTemplateRows;
    expect(fold()).toBe("1fr");
    fireEvent.click(screen.getByTestId("thread-fold-threads"));
    expect(fold()).toBe("0fr");
    expect(container.querySelector("[data-thread-id='ag']")).toBeTruthy(); // still mounted, just folded
    // STUDIO IS FOLDED FROM THE START (operator 2026-09-26: "the studio can be collapsed by default"), so a fresh
    // install that then folds `threads` has both. The operator's own stored list is still obeyed exactly — the
    // default only applies when there is nothing stored yet.
    expect(JSON.parse(localStorage.getItem("antiloki:threads-collapsed") ?? "[]").sort()).toEqual(["studio", "threads"]);
    fireEvent.click(screen.getByTestId("thread-fold-threads"));
    expect(fold()).toBe("1fr");
  });
});

describe("the thread row shows what is inside (2026-09-20): one pictogram per member", () => {
  it("draws an icon per widget with the members' names as the tooltip, and +n past six", () => {
    const items = [{ id: "a", label: "claude", category: "agents", kind: "vibe-pane:claude-code", render: () => <span>a</span> }, { id: "b", label: "kanban", category: "tools", kind: "kanban", render: () => <span>b</span> }, ...["c", "d", "e", "f", "g", "h"].map((id) => ({ id, label: id, category: "tools", kind: "notes", render: () => <span>{id}</span> }))];
    const { container } = render(<ThreadsHarness items={items} initial={[{ id: "t1", name: "t", items: ["a", "b"] }, { id: "t2", name: "big", items: ["a", "b", "c", "d", "e", "f", "g", "h"] }]} />);
    const strip = container.querySelector("[data-testid='thread-icons-t1']")!;
    expect(Array.from(strip.querySelectorAll("[data-studio-icon]")).map((e) => e.getAttribute("data-studio-icon"))).toEqual(["vibe-pane:claude-code", "kanban"]);
    expect(strip.getAttribute("title")).toBe("claude · kanban");
    const big = container.querySelector("[data-testid='thread-icons-t2']")!;
    expect(big.querySelectorAll("[data-studio-icon]").length).toBe(6);
    expect(big.textContent).toContain("+2");
  });
});

describe("the cell floor (2026-09-21)", () => {
  it("resizeWeights keeps either side above the pixel floor given in weight units, and splits evenly when both cannot fit", async () => {
    const { resizeWeights, MIN_CELL_PX } = await import("./widget-dock");
    expect(MIN_CELL_PX).toBe(380);
    // two columns of weight 1 in a 1000px split: the floor is 0.76 weight → dragging the seam far left stops at 0.76
    expect(resizeWeights([1, 1], 1, -0.9, 0.76)).toEqual([0.76, 1.24]);
    expect(resizeWeights([1, 1], 1, 0.9, 0.76)).toEqual([1.24, 0.76]);
    // no floor given: the old 15% rule
    expect(resizeWeights([1, 1], 1, -0.9)).toEqual([0.3, 1.7]);
    // a split too narrow for two floors: the pair stays even (each gets half)
    expect(resizeWeights([1, 1], 1, -0.9, 3)).toEqual([1, 1]);
  });
});
