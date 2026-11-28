// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const apiGet = vi.fn(async () => ({ ok: true, paused: [{ pane_id: 7, by: "watcher", why: "RAM is 94 % used" }], mail: [{ id: 4, from: "copy", from_pane: 3, to: "boss", pane_id: 9, text: "done" }], browser_asks: [{ id: 2, host: "x.io", what: "let agents click and type on x.io" }], browser_control: [], long_local: [{ pane_id: 7, minutes: 22, model: "tiny:1b" }, { pane_id: 12, minutes: 31, model: "qwen" }] }));
const apiPost = vi.fn(async () => ({ ok: true }));
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: unknown[]) => (apiGet as any)(...a), apiPost: (...a: unknown[]) => (apiPost as any)(...a) }));
import { parsePaused, PausedBar, MailBar, BrowserCards, LongLocalBar } from "./pane-watch";

afterEach(() => cleanup());
describe("paused agents", () => {
  it("reads the serve's list and nothing from a bad answer", () => {
    expect(parsePaused({ ok: true, paused: [{ pane_id: 3, by: "person", why: "x" }, { pane_id: 0 }] })).toEqual([{ paneId: 3, by: "person", why: "x" }]);
    expect(parsePaused(null)).toEqual([]);
  });
  it("says why on the paused pane only, and Continue asks the serve", async () => {
    render(<><PausedBar paneId={7} /><PausedBar paneId={8} /></>);
    await waitFor(() => expect(screen.getByTestId("paused-bar-7").textContent).toContain("RAM is 94 % used"));
    expect(screen.queryByTestId("paused-bar-8")).toBeNull();
    fireEvent.click(screen.getByTestId("paused-continue-7"));
    expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/watch", { pane_id: 7, op: "resume" });
  });
});

describe("messages and the browser's questions", () => {
  it("a waiting message shows on its receiver's pane, and the card's Allow asks the serve", async () => {
    render(<><MailBar paneId={9} /><MailBar paneId={8} /><BrowserCards /></>);
    await waitFor(() => expect(screen.getByTestId("mail-bar-9").textContent).toContain("Message from copy"));
    expect(screen.queryByTestId("mail-bar-8")).toBeNull();
    fireEvent.click(screen.getByTestId("mail-deliver-4")); expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/mail", { id: 4, op: "deliver" });
    expect(screen.getByTestId("toast-browser").textContent).toContain("click and type on x.io");
    fireEvent.click(screen.getByTestId("toast-browser-allow")); expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/browser", { id: 2, op: "allow" });
  });
});

describe("a local model writing for long", () => {
  it("is said on a running pane, can be paused or left, and says nothing on a paused one", async () => {
    render(<><LongLocalBar paneId={12} /><LongLocalBar paneId={7} /></>);
    await waitFor(() => expect(screen.getByTestId("long-bar-12").textContent).toContain("31 minutes")); expect(screen.queryByTestId("long-bar-7")).toBeNull();
    fireEvent.click(screen.getByTestId("long-pause-12")); expect(apiPost).toHaveBeenCalledWith("/api/v1/cockpit/watch", { pane_id: 12, op: "pause" });
    fireEvent.click(screen.getByTestId("long-leave-12")); expect(screen.queryByTestId("long-bar-12")).toBeNull();
  });
});
