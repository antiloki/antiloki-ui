// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const get = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => get(...a), apiPost: vi.fn() }));
import { Changes } from "./changes";
import { parsePatch, changeLine } from "./changes-model";

const P = "diff --git a/src/a.ts b/src/a.ts\nindex 111..222 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n one\n-two\n+TWO\n+three\ndiff --git a/new.txt b/new.txt\nnew file mode 100644\nindex 0000000..333\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hello\ndiff --git a/img.png b/img.png\nindex 1..2 100644\nBinary files a/img.png and b/img.png differ\n";
const ch = (o: any = {}) => ({ id: 3, saga_id: 1, task_id: 10, t_ms: Date.now() - 5000, actor: "claude", files: [{ path: "src/a.ts", status: "modified", added: 2, removed: 1 }, { path: "new.txt", status: "added", added: 1, removed: 0 }, { path: "img.png", status: "modified", added: 0, removed: 0 }], added: 3, removed: 1, truncated: false, ...o });

describe("a saga's changes", () => {
  afterEach(() => cleanup());
  it("reads a patch into files with coloured lines, flags a binary file, keeps the hunk header", () => {
    const f = parsePatch(P); expect(f.map((x) => [x.path, x.status, x.binary])).toEqual([["src/a.ts", "modified", false], ["new.txt", "added", false], ["img.png", "modified", true]]);
    expect(f[0].lines.filter((l) => l.kind !== "meta").map((l) => `${l.kind}:${l.text}`)).toEqual(["hunk:@@ -1,2 +1,3 @@", "ctx:one", "del:two", "add:TWO", "add:three"]); expect(parsePatch("")).toEqual([]);
  });
  it("says in one line what a snapshot changed", () => { expect(changeLine(ch() as any)).toBe("3 files · +3 −1 · src/a.ts, new.txt and 1 more"); expect(changeLine({ files: [{ path: "a" }], added: 1, removed: 0 } as any)).toBe("1 file · +1 −0 · a"); });
  it("lists snapshots, opens one to its files and diff lines, and says when it cannot read it", async () => {
    get.mockResolvedValue({ ok: true, change: { ...ch(), patch: P } });
    render(<Changes changes={[ch()] as any} episodeTitles={{ 10: "Work · attempt 1" }} />);
    expect(screen.getByTestId("change-3").textContent).toContain("+3 −1"); expect(screen.getByTestId("change-3").textContent).toContain("Work · attempt 1"); expect(screen.getByTestId("change-3").textContent).toContain("latest");
    fireEvent.click(screen.getByTestId("change-3")); await waitFor(() => screen.getByTestId("diff-file-src/a.ts"));
    expect(screen.getByTestId("diff-file-src/a.ts").querySelectorAll('[data-kind="add"]')).toHaveLength(2); expect(screen.getByTestId("diff-file-src/a.ts").querySelectorAll('[data-kind="del"]')).toHaveLength(1);
    expect(screen.getByTestId("diff-file-img.png").textContent).toContain("binary file");
    fireEvent.click(screen.getByTestId("change-3")); expect(screen.queryByTestId("change-body-3")).toBeNull();
    get.mockResolvedValue(null); fireEvent.click(screen.getByTestId("change-3")); await waitFor(() => expect(screen.getByTestId("change-body-3").textContent).toContain("could not read this diff"));
  });
  it("says there are no changes when there are none", () => { render(<Changes changes={[]} />); expect(screen.getByTestId("changes-empty")).toBeTruthy(); });
});
