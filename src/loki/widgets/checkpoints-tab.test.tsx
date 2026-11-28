// @vitest-environment jsdom
// 2026-10-13: checkpoint tab confirm + redo — no window.confirm.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckpointsTab } from "./agent-wizard";

describe("CheckpointsTab", () => {
  const cps = [{ n: 2, rev: "abc1234", short: "abc1234", subject: "manual", when: "" }];
  let ops: string[];
  let onCheckpoint: (op: string, extra?: any) => Promise<any>;

  beforeEach(() => {
    ops = [];
    onCheckpoint = async (op: string) => {
      ops.push(op);
      if (op === "list") return { checkpoints: cps, redo: ops.includes("rewind") ? { tree: "t" } : null };
      return { ok: true };
    };
    vi.spyOn(window, "confirm");
  });

  it("never calls window.confirm; first rewind click posts nothing; yes posts rewind; redo posts redo", async () => {
    render(<CheckpointsTab cps={cps} onCheckpoint={onCheckpoint} say={() => {}} />);
    fireEvent.click(screen.getByText("⏪ rewind here"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
    expect(screen.getByText(/Rewind to checkpoint 2\?/)).toBeTruthy();
    fireEvent.click(screen.getByText("yes"));
    await waitFor(() => expect(ops).toEqual(["rewind", "list"]));
    const redoBtn = screen.getByText("↪ redo") as HTMLButtonElement;
    await waitFor(() => expect(redoBtn.disabled).toBe(false));
    fireEvent.click(redoBtn);
    await waitFor(() => expect(ops).toEqual(["rewind", "list", "redo", "list"]));
  });
});
