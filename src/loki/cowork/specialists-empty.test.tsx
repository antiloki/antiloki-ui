// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
vi.mock("./api", () => ({ localModels: async () => [], panesOp: async () => ({ ok: true }), specialistsOpenable: async () => [], specialistDrafts: async () => [] }));
import { AddPaneMenu, NEW_SPECIALIST } from "./AddPaneMenu";

afterEach(() => cleanup());
describe("no specialist yet", () => {
  it("offers to make one with an agent instead of a dead end", async () => {
    const said = vi.fn(); window.addEventListener(NEW_SPECIALIST, said); const close = vi.fn();
    render(<AddPaneMenu engines={[]} anchor={{ left: 0, top: 0 }} mode="specialist" atLimit={null} onPick={() => {}} onClose={close} onSpecialist={() => {}} onDraft={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("specialists-make")).toBeTruthy()); fireEvent.click(screen.getByTestId("specialists-make")); expect(said).toHaveBeenCalled(); window.removeEventListener(NEW_SPECIALIST, said);
  });
});
