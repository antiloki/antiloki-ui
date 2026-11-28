import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import * as React from "react";

const calls: any[] = [];
const PACKS = [{ id: "marketing-copy", name: "Marketing", description: "tone", axes: [], kinds: ["markdown"], paths: ["copy/**"], origin: "shipped", laws: [
  { key: "copy-no-hype", title: "No hype", domain: "copy", axis: "Honesty", detector: "pattern", severity: "warn", weight: 5, status: "candidate", version: 1, kinds: [], rule: "no adjectives", fix: "use a number", examples: { pass: 1, fail: 1 }, created_by: "leader" },
  { key: "copy-no-proof", title: "Needs examples", domain: "copy", axis: "Honesty", detector: "pattern", severity: "error", weight: 5, status: "candidate", version: 1, kinds: [], rule: "", fix: "", examples: { pass: 1, fail: 0 }, created_by: "leader" },
  { key: "copy-ok", title: "Already ratified", domain: "copy", axis: "Tone", detector: "count", severity: "warn", weight: 5, status: "ratified", version: 2, kinds: [], rule: "", fix: "", examples: { pass: 2, fail: 2 }, created_by: "seed" }] }];
vi.mock("./api", () => ({ teamOp: vi.fn(async (op: string, b: any) => { calls.push([op, b]); if (op === "book_list") return { ok: true, packs: PACKS, problems: ["broken.yaml: not a pack"] }; if (op === "book_test") return { ok: true, passed: b.key === "copy-no-hype", compiles: true, why: "", examples: [{ name: "fail-0", passed: b.key === "copy-no-hype", hits: 0, expect: "hits", error: "" }] }; if (op === "book_ratify" || op === "book_suspend") return { ok: true }; return { ok: true }; }) }));
import { BookView, FindingsPanel } from "./BookView";

describe("the book", () => {
  it("lists packs and laws with status and examples; a law without a failing example cannot be ratified, and says why", async () => {
    render(<BookView />); await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.queryByRole("tab")).toBeNull();   // one section, no tabs
    const order = Array.from(document.querySelectorAll('[data-testid^="book-law-"]')).map((e) => e.getAttribute("data-testid")); expect(order[0]).toBe("book-law-copy-no-hype"); expect(order[order.length - 1]).toBe("book-law-copy-ok");   // the Leader's candidates first, the ratified after
    expect(screen.getByTestId("book-status-copy-no-hype").textContent).toBe("candidate"); expect(screen.getByText(/broken.yaml/)).toBeTruthy();
    const no = screen.getByTestId("book-ratify-copy-no-proof") as HTMLButtonElement; expect(no.disabled).toBe(true); expect(no.title).toMatch(/passing and a failing example/);
    expect(screen.queryByTestId("book-ratify-copy-ok")).toBeNull();
  });
  it("tests a law against its own examples and shows the result; ratifying is a person's click that calls the engine", async () => {
    render(<BookView />); await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { fireEvent.click(screen.getByTestId("book-law-copy-no-hype").querySelectorAll("button")[1]); await Promise.resolve(); });
    expect(calls.some(([o, b]) => o === "book_test" && b.key === "copy-no-hype")).toBe(true); expect(screen.getByTestId("book-tested-copy-no-hype").textContent).toMatch(/all examples agree/);
    await act(async () => { fireEvent.click(screen.getByTestId("book-ratify-copy-no-hype")); await Promise.resolve(); await Promise.resolve(); });
    expect(calls.some(([o, b]) => o === "book_ratify" && b.pack === "marketing-copy" && b.key === "copy-no-hype")).toBe(true);
  });
});
describe("the findings panel", () => {
  const rep: any = { gate: { passed: false, skipped: false, failing: 1, fail_on: "error" }, score: 88, axes: { Honesty: 80 }, counts: {}, artifacts: [], laws_run: 3, digest: "abcdef012345", findings: [{ law: "copy-no-hype", severity: "warn", path: "copy/a.md", line: 3, message: "found `best`", fix: "use a number", pack: "marketing-copy" }, { law: "x", severity: "info", advisory: true, path: "copy/b.md", line: 1, message: "advice", fix: "", pack: "p" }] };
  it("shows the verdict, the axes, and a finding per row (advice excluded) that opens the file", () => {
    const open = vi.fn(); render(<FindingsPanel report={rep} onOpen={open} />);
    expect(screen.getByTestId("ev-gate").textContent).toMatch(/gate fails/); expect(screen.getAllByTestId("ev-finding")).toHaveLength(1); fireEvent.click(screen.getByTestId("ev-finding")); expect(open).toHaveBeenCalledWith("copy/a.md");
  });
  it("says 'no law applies' for a skipped gate, never 'passes'", () => { render(<FindingsPanel report={{ ...rep, gate: { passed: false, skipped: true, failing: 0, fail_on: "error" }, findings: [] }} onOpen={() => {}} />); expect(screen.getByTestId("ev-gate").textContent).toBe("no law applies"); });
});
