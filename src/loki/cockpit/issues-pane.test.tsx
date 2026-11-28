// @vitest-environment jsdom
// THE ISSUES WIDGET (operator 2026-10-11): the todo and the kanban are one tracker, Linear-style - a list by status or a board, statuses and priorities.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within, configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 6000 });
vi.setConfig({ testTimeout: 30_000 });

const bb = vi.hoisted(() => ({ rows: [] as any[], next: 100, calls: [] as any[], knows: true }));
vi.mock("@/loki/api/client", () => ({
  unwrapResult: (r: any) => r,
  apiPost: vi.fn(async (path: string, body: any) => {
    bb.calls.push({ path, body });
    if (path.endsWith("/blackboard/read")) return { scratch: bb.rows.filter((r) => r.pane_id === body.pane_id).map((r) => ({ ...r })) };
    if (path.endsWith("/blackboard/post")) {
      if (body.op === "update") { const r = bb.rows.find((x) => x.id === body.id); if (r) r.body_md = body.body_md; return { ok: true }; }
      if (body.op === "delete") { bb.rows = bb.rows.filter((x) => x.id !== body.id); return { ok: true }; }
      // the real serve stores a kind it does not know as a plain 'note' (cockpit-blackboard-post.rs KINDS); the newer one knows the tools' kinds
      const known = ["claim", "note", "handoff", "scratch", "decision", "context", "todo", "kanban", "sketch", "plan", "swarmq", "shape", "baseplan", ...(bb.knows ? ["issue", "pref", "brainstorm", "brainstorm-chips"] : [])];
      bb.rows.push({ id: bb.next++, kind: known.includes(body.kind) ? body.kind : "note", body_md: body.body_md, pane_id: body.pane_id, created_at: "2026-10-11 10:00:00" }); return { ok: true };
    }
    return null;
  }),
}));
vi.mock("@/loki/widgets/agent-interact", () => ({ startBlockDrag: vi.fn() }));
import { isIssueRow, isPrefRow } from "./tool-rows";
import { IssuesPane, parseIssue, serializeIssue, fromLegacyTodo, fromLegacyKanban, nextNumber, uniqueNumbers, groupByStatus, ageLabel, issueCode, type Issue } from "./issues-pane";

const mine = () => bb.rows.filter((r) => r.pane_id === 5 && isIssueRow(r)).map((r) => JSON.parse(r.body_md));
beforeEach(() => { bb.rows = []; bb.next = 100; bb.calls = []; bb.knows = true; localStorage.clear(); });

describe("the model (pure)", () => {
  it("reads and writes an issue; what is not one is skipped", () => {
    const body = serializeIssue({ n: 3, title: "Ship it", status: "doing", priority: 2 });
    expect(parseIssue({ id: 9, body_md: body })).toEqual({ id: 9, n: 3, title: "Ship it", status: "doing", priority: 2, created_at: undefined });
    expect(parseIssue({ id: 1, body_md: "not json" })).toBeNull(); expect(parseIssue({ id: 1, body_md: JSON.stringify({ title: "  " }) })).toBeNull();
    expect(parseIssue({ id: 4, body_md: JSON.stringify({ title: "x", status: "nonsense", priority: 9 }) })).toMatchObject({ status: "todo", priority: 0, n: 4 });
  });
  it("turns what the old checklist and the old board held into issues", () => {
    expect(fromLegacyTodo("[x] ship it")).toEqual({ title: "ship it", status: "done" }); expect(fromLegacyTodo("[ ] write docs")).toEqual({ title: "write docs", status: "todo" });
    expect(fromLegacyKanban(JSON.stringify({ col: "doing", text: "fix bug" }))).toEqual({ title: "fix bug", status: "doing" });
    expect(fromLegacyKanban(JSON.stringify({ col: "done", text: "a" })).status).toBe("done"); expect(fromLegacyKanban("a bare string")).toEqual({ title: "a bare string", status: "todo" });
  });
  it("numbers the next issue, groups by status and orders urgent first, none last", () => {
    expect(nextNumber([])).toBe(1); expect(nextNumber([{ n: 4 }, { n: 2 }])).toBe(5); expect(issueCode(7)).toBe("ISS-7");
    const mk = (n: number, status: Issue["status"], priority: Issue["priority"]): Issue => ({ id: n, n, title: `t${n}`, status, priority });
    const g = groupByStatus([mk(1, "todo", 0), mk(2, "todo", 4), mk(3, "todo", 1), mk(4, "done", 0), mk(5, "todo", 2)]);
    expect(g.todo.map((i) => i.n)).toEqual([3, 5, 2, 1]); expect(g.done.map((i) => i.n)).toEqual([4]); expect(g.backlog).toEqual([]);
  });
  it("gives every issue its own number: the first one made keeps it, later ones take the next free numbers", () => {
    const mk = (id: number, n: number): Issue => ({ id, n, title: `t${id}`, status: "todo", priority: 0 });
    expect(uniqueNumbers([mk(1, 1), mk(2, 2), mk(3, 3)])).toEqual([]);
    expect(uniqueNumbers([mk(10, 1), mk(11, 1), mk(12, 2), mk(13, 1)])).toEqual([{ id: 11, n: 3 }, { id: 13, n: 4 }]);
    expect(uniqueNumbers([mk(7, 5), mk(3, 5)])).toEqual([{ id: 7, n: 6 }]);   // by when they were made (the lower row id), whatever order they arrive in
    expect(uniqueNumbers([])).toEqual([]);
  });
  it("says how old an issue is, tersely", () => {
    const now = Date.parse("2026-10-11T12:00:00Z");
    expect(ageLabel("2026-10-11 11:59:30", now)).toBe("now"); expect(ageLabel("2026-10-11 11:55:00", now)).toBe("5m"); expect(ageLabel("2026-10-11 09:00:00", now)).toBe("3h");
    expect(ageLabel("2026-10-09 12:00:00", now)).toBe("2d"); expect(ageLabel("2026-09-20 12:00:00", now)).toBe("3w"); expect(ageLabel(undefined, now)).toBe("");
  });
});

describe.each([true, false])("the widget (the serve knows the issue kind: %s)", (knows) => {
  beforeEach(() => { bb.knows = knows; });
  it("starts empty, adds an issue on Enter, and shows it in its status group with an id", async () => {
    render(<IssuesPane sessionId={1} paneId={5} />);
    await screen.findByTestId("issues-empty");
    const box = screen.getByTestId("issue-new") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Write the docs" } }); fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(within(screen.getByTestId("issues-group-todo")).getByText("Write the docs")).toBeTruthy());
    expect(mine()).toEqual([{ n: 1, title: "Write the docs", status: "todo", priority: 0 }]);
    expect(screen.getByText("ISS-1")).toBeTruthy(); expect(box.value).toBe("");
    expect(screen.getByTestId("issues-count").textContent).toContain("1 open");
  });
  it("numbers issues added in quick succession separately, and puts right a board that already shares a number", async () => {
    render(<IssuesPane sessionId={1} paneId={5} />);
    await screen.findByTestId("issues-empty");
    const box = screen.getByTestId("issue-new") as HTMLInputElement;
    for (const t of ["first", "second", "third"]) { fireEvent.change(box, { target: { value: t } }); fireEvent.keyDown(box, { key: "Enter" }); }   // no waiting between them
    await waitFor(() => expect(mine().length).toBe(3));
    expect(mine().map((i) => i.n).sort()).toEqual([1, 2, 3]); expect(new Set(mine().map((i) => i.n)).size).toBe(3);
    await waitFor(() => expect(screen.getAllByTestId("issue-row").length).toBe(3));
    expect(screen.getAllByText(/^ISS-\d+$/).map((e) => e.textContent).sort()).toEqual(["ISS-1", "ISS-2", "ISS-3"]);
  });
  it("an old board with two issues sharing one number is renumbered when it opens", async () => {
    bb.rows = [1, 2, 3].map((id) => ({ id, kind: "issue", pane_id: 5, body_md: serializeIssue({ n: 1, title: `same number ${id}`, status: "todo", priority: 0 }) }));
    render(<IssuesPane sessionId={1} paneId={5} />);
    await waitFor(() => expect(mine().map((i) => i.n).sort()).toEqual([1, 2, 3]));
    await waitFor(() => expect(screen.getAllByText(/^ISS-\d+$/).map((e) => e.textContent).sort()).toEqual(["ISS-1", "ISS-2", "ISS-3"]));
    expect(bb.rows.find((r) => r.id === 1)!.body_md).toContain('"n":1');   // the first one made kept its number
  });
  it("changes the status from the circle: the issue moves to its group and is saved", async () => {
    bb.rows = [{ id: 1, kind: "issue", pane_id: 5, body_md: serializeIssue({ n: 1, title: "Fix login", status: "todo", priority: 0 }) }];
    render(<IssuesPane sessionId={1} paneId={5} />);
    const row = await screen.findByTestId("issue-row");
    fireEvent.click(within(row).getByTestId("issue-status-1")); fireEvent.click(await screen.findByTestId("set-status-doing"));
    await waitFor(() => expect(within(screen.getByTestId("issues-group-doing")).getByText("Fix login")).toBeTruthy());
    expect(screen.queryByTestId("issues-group-todo")).toBeNull();
    await waitFor(() => expect(mine()[0].status).toBe("doing"));
  });
  it("sets a priority and puts the urgent one first", async () => {
    bb.rows = [{ id: 1, kind: "issue", pane_id: 5, body_md: serializeIssue({ n: 1, title: "first", status: "todo", priority: 0 }) }, { id: 2, kind: "issue", pane_id: 5, body_md: serializeIssue({ n: 2, title: "second", status: "todo", priority: 0 }) }];
    render(<IssuesPane sessionId={1} paneId={5} />);
    await screen.findAllByTestId("issue-row");
    fireEvent.click(screen.getByTestId("issue-priority-2")); fireEvent.click(await screen.findByTestId("set-priority-1"));
    await waitFor(() => expect(screen.getAllByTestId("issue-title").map((e) => e.textContent)).toEqual(["second", "first"]));
    await waitFor(() => expect(JSON.parse(bb.rows.find((r) => r.id === 2)!.body_md).priority).toBe(1));
    expect(mine().length).toBe(2);
  });
  it("renames on click and Enter, and deletes", async () => {
    bb.rows = [{ id: 1, kind: "issue", pane_id: 5, body_md: serializeIssue({ n: 1, title: "old name", status: "todo", priority: 0 }) }];
    render(<IssuesPane sessionId={1} paneId={5} />);
    fireEvent.click(await screen.findByText("old name"));
    const input = await screen.findByTestId("issue-title-input"); fireEvent.change(input, { target: { value: "new name" } }); fireEvent.blur(input);
    await waitFor(() => expect(mine()[0].title).toBe("new name")); expect(await screen.findByText("new name")).toBeTruthy();
    fireEvent.click(screen.getByTestId("issue-delete"));
    await waitFor(() => expect(mine()).toEqual([])); await screen.findByTestId("issues-empty");
  });
  it("shows the same issues as a board, and dragging a card to another column changes its status", async () => {
    bb.rows = [{ id: 1, kind: "issue", pane_id: 5, body_md: serializeIssue({ n: 1, title: "card one", status: "todo", priority: 0 }) }];
    render(<IssuesPane sessionId={1} paneId={5} />);
    await screen.findByTestId("issue-row");
    fireEvent.click(screen.getByTestId("issues-view-board"));
    const card = await screen.findByTestId("issue-card");
    expect(within(screen.getByTestId("issues-col-todo")).getByText("card one")).toBeTruthy();
    for (const col of ["backlog", "todo", "doing", "done"]) expect(screen.getByTestId(`issues-col-${col}`)).toBeTruthy();
    expect(screen.queryByTestId("issues-col-canceled")).toBeNull();   // an empty Canceled column is not drawn
    fireEvent.dragStart(card); fireEvent.dragOver(screen.getByTestId("issues-col-done")); fireEvent.drop(screen.getByTestId("issues-col-done"));
    await waitFor(() => expect(within(screen.getByTestId("issues-col-done")).getByText("card one")).toBeTruthy());
    await waitFor(() => expect(mine()[0].status).toBe("done"));
    // the view is remembered - in the database, with everything else the tool holds
    await waitFor(() => expect(bb.rows.filter(isPrefRow).map((r) => JSON.parse(r.body_md))).toEqual([{ view: "board" }]));
    expect(localStorage.getItem("antiloki:issues-view")).toBeNull();
    fireEvent.click(screen.getByTestId("issues-view-list"));
    await waitFor(() => expect(bb.rows.filter(isPrefRow).map((r) => JSON.parse(r.body_md))).toEqual([{ view: "list" }]));   // updated in place, not added to
  });
  it("moves the old checklist and board in as issues, once, and removes the old rows", async () => {
    bb.rows = [
      { id: 1, kind: "todo", pane_id: 11, body_md: "[x] ship it" }, { id: 2, kind: "todo", pane_id: 11, body_md: "[ ] write docs" },
      { id: 3, kind: "kanban", pane_id: 12, body_md: JSON.stringify({ col: "doing", text: "fix bug" }) }, { id: 4, kind: "note", pane_id: 11, body_md: "a note stays" },
    ];
    const { unmount } = render(<IssuesPane sessionId={1} paneId={5} legacyPaneIds={[11, 12]} />);
    await waitFor(() => expect(within(screen.getByTestId("issues-group-doing")).getByText("fix bug")).toBeTruthy());
    expect(within(screen.getByTestId("issues-group-done")).getByText("ship it")).toBeTruthy(); expect(within(screen.getByTestId("issues-group-todo")).getByText("write docs")).toBeTruthy();
    expect(bb.rows.filter((r) => r.kind === "todo" || r.kind === "kanban")).toEqual([]);
    expect(bb.rows.some((r) => r.kind === "note")).toBe(true);
    expect(mine().map((i) => i.n).sort()).toEqual([1, 2, 3]);
    unmount(); render(<IssuesPane sessionId={1} paneId={5} legacyPaneIds={[11, 12]} />);   // opening it again must not create them twice
    await screen.findAllByTestId("issue-row"); expect(mine().length).toBe(3);
  });
  it("an old Todo or Kanban widget opens the tracker on its own key and moves its own rows in", async () => {
    bb.rows = [{ id: 1, kind: "todo", pane_id: 5, body_md: "[ ] my old todo" }];
    render(<IssuesPane sessionId={1} paneId={5} />);
    await waitFor(() => expect(screen.getByText("my old todo")).toBeTruthy());
    expect(bb.rows.filter((r) => r.kind === "todo").length).toBe(0); expect(mine()[0]).toMatchObject({ title: "my old todo", status: "todo" });
  });
});
