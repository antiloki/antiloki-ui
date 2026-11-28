// @vitest-environment jsdom
// THE CONTEXT LIBRARY (2026-09-19): the AIs' memories read-only + antiloki's, chunks → a pack, packs
// listed and reopened.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const calls: any[] = [];
vi.mock("@/loki/api/client", async (orig) => ({ ...(await orig<any>()), apiPost: vi.fn(async (_u: string, body: any) => {
  calls.push(body);
  if (body.op === "sources") return { result: { ok: true, root: "/w", sources: [
    { key: "claude.memory", owner: "claude", label: "Claude's memory", note: "read-only", read_only: true, chunks: [{ source: "claude.memory", id: "p/a.md", title: "toolchain via mise", meta: "p · 2026-09-19", bytes: 1200, preview: "cargo needs mise x" }] },
    { key: "antiloki.papers", owner: "antiloki", label: "papers", note: "", read_only: true, chunks: [{ source: "antiloki.papers", id: "5", title: "The Compiler Owns Every Cycle", meta: "audit", bytes: 9000, preview: "all cycles" }] },
  ] } };
  if (body.op === "packs") return { result: { ok: true, packs: [{ id: 1, slug: "team-rules", name: "Team rules", notes_md: "", chunks: [{ source: "paste", id: "n1", title: "rule one" }], bytes: 400, created_at: "2026-09-19 10:00", updated_at: "2026-09-19 10:00" }] } };
  if (body.op === "read") return { result: { ok: true, body: "# toolchain\n\ncargo needs `mise x rust@stable`" } };
  if (body.op === "pack.save") return { result: { ok: true, pack: { slug: "my-pack" }, chars: 4000 } };
  if (body.op === "pack.get") return { result: { ok: true, pack: { id: 1, slug: "team-rules", name: "Team rules", notes_md: "", chunks: [], body_md: "# Context pack · Team rules\n\nrule one" } } };
  return { result: { ok: false } };
}), unwrapResult: (r: any) => r?.result ?? r }));
import { ContextLibraryWindow, addToDraft, moveInDraft, draftBytes, fmtTok } from "./context-library";

describe("the draft — pure", () => {
  it("dedupes, reorders within bounds, and sizes pasted bodies over listed bytes", () => {
    const a = { source: "s", id: "1", title: "a", meta: "", bytes: 100, preview: "" }; const b = { ...a, id: "2", body: "xxxxxxxxxx" };
    expect(addToDraft(addToDraft([], a), a).length).toBe(1);
    expect(moveInDraft([a, b], 0, 1).map((c) => c.id)).toEqual(["2", "1"]);
    expect(moveInDraft([a, b], 0, -1).map((c) => c.id)).toEqual(["1", "2"]);
    expect(draftBytes([a, b])).toBe(110);
    expect(fmtTok(8000)).toBe("2.0k tok");
  });
});

describe("ContextLibraryWindow", () => {
  it("lists the owners with counts, the chunks of a source, reads one, builds and saves a pack, opens a saved one", async () => {
    render(<ContextLibraryWindow onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("owner-claude").textContent).toContain("1"));
    expect(screen.getByTestId("owner-antiloki").textContent).toContain("1");
    fireEvent.click(screen.getByTestId("owner-claude"));
    await waitFor(() => expect(screen.getByTestId("source-claude.memory")).toBeTruthy());
    expect(screen.getByTestId("source-claude.memory").textContent).toContain("🔒");
    expect(screen.getAllByTestId("chunk").length).toBe(1);
    fireEvent.click(screen.getByText("toolchain via mise"));
    await waitFor(() => expect(screen.getByTestId("chunk-reader").textContent).toContain("mise x rust@stable"));
    fireEvent.click(screen.getByText("＋ add to the pack"));
    expect(screen.getAllByTestId("draft-chunk").length).toBe(1);
    fireEvent.change(screen.getByTestId("pack-name"), { target: { value: "My pack" } });
    fireEvent.click(screen.getByTestId("pack-save"));
    await waitFor(() => expect(calls.some((c) => c.op === "pack.save" && c.name === "My pack" && c.chunks[0].id === "p/a.md")).toBe(true));
    await waitFor(() => expect(screen.getByTestId("library-note").textContent).toContain("saved · my-pack"));
    // the saved packs
    expect(screen.getByTestId("pack-team-rules").textContent).toContain("pack:team-rules");
    fireEvent.click(screen.getByText("▸ read"));
    await waitFor(() => expect(screen.getByTestId("chunk-reader").textContent).toContain("Context pack · Team rules"));
  });
});
