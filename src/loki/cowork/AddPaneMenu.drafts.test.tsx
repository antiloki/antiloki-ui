// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import * as api from "./api";
import { AddPaneMenu } from "./AddPaneMenu";
import { parseCommand } from "./commands";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("a specialist an agent made is not lost", () => {
  it("the + menu lists the drafts under 'Waiting for your approval' and a click opens the editor", async () => {
    vi.spyOn(api, "specialistsOpenable").mockResolvedValue([]); vi.spyOn(api, "specialistDrafts").mockResolvedValue([{ id: "instagram-manager", name: "Instagram Manager" }]); vi.spyOn(api, "listEngines").mockResolvedValue([] as any);
    const onDraft = vi.fn(); const onClose = vi.fn(); render(<AddPaneMenu engines={[]} anchor={{ x: 10, y: 10 } as any} onPick={() => {}} onClose={onClose} onSpecialist={() => {}} onDraft={onDraft} atLimit={false as any} />);
    const row = await screen.findByTestId("pick-draft-instagram-manager"); expect(row.textContent).toContain("Instagram Manager"); expect(row.textContent).toContain("draft"); expect(screen.getByText("Waiting for your approval")).toBeTruthy();
    fireEvent.click(row); expect(onDraft).toHaveBeenCalledWith("instagram-manager"); await waitFor(() => expect(onClose).toHaveBeenCalled()); await waitFor(() => expect(api.specialistDrafts).toHaveBeenCalled());
  });
  it("an agent's 'open this specialist' on a draft reaches the screen as a command that opens its editor", () => {
    expect(parseCommand({ id: 7, op: "specialist_edit", args: { id: "instagram-manager" } })).toEqual({ id: 7, op: "specialist_edit", specialist: "instagram-manager" }); expect(parseCommand({ id: 7, op: "specialist_edit", args: {} })).toBeNull();
  });
});
