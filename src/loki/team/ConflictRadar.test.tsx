import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as api from "./api";
import { ConflictRadar, byFile } from "./ConflictRadar";

describe("conflict radar", () => {
  it("groups the pairs by file, the lines-meeting ones first", () => {
    const r = byFile([{ a: "x", b: "y", path: "b.rs", same_lines: false }, { a: "x", b: "z", path: "a.rs", same_lines: true }, { a: "y", b: "z", path: "a.rs", same_lines: false }]);
    expect(r.map((x) => x.path)).toEqual(["a.rs", "b.rs"]); expect(r[0].trees.sort()).toEqual(["x", "y", "z"]); expect(r[0].same_lines).toBe(true);
  });
  it("says nothing when nothing overlaps, and lists the files when something does", async () => {
    vi.spyOn(api, "conflictsNow").mockResolvedValueOnce({ trees: [], conflicts: [] }); const a = render(<ConflictRadar pollMs={100000} />); await waitFor(() => expect(api.conflictsNow).toHaveBeenCalled()); expect(a.container.textContent).toBe(""); a.unmount();
    vi.spyOn(api, "conflictsNow").mockResolvedValue({ trees: ["a", "b"], conflicts: [{ a: "a", b: "b", path: "src/x.rs", same_lines: true }] }); render(<ConflictRadar pollMs={100000} />);
    expect((await screen.findByTestId("conflict-pill")).textContent).toContain("1 file changed in more than one tree · 1 on the same lines"); fireEvent.click(screen.getByTestId("conflict-pill")); expect(screen.getByTestId("conflict-list").textContent).toContain("src/x.rs");
  });
});
