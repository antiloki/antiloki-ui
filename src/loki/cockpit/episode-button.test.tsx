// @vitest-environment jsdom
// CLOSE EPISODE -> OPEN A PULL REQUEST ON A LOCAL-ONLY REPO (operator 2026-09-30: the PR button "didnt create it"; audit 2026-10-01: the repo-creation step could fail and the flow went on to
// open a pull request on a repo with no remote, because the real client answers a refusal with null and publishRepo read null as success).
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const posts: { path: string; body: any }[] = [];
let preflight: any; let publishAnswer: "ok" | "null"; let preflightGate: Promise<void> | null; let preflightReads = 0;
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async (path: string) => { if (path.includes("/deliver/preflight")) { preflightReads++; if (preflightGate) await preflightGate; return preflight; } return null; }),
  apiPost: vi.fn(async (path: string, body: any) => {
    posts.push({ path, body });
    if (path.endsWith("/deliver/publish")) return publishAnswer === "ok" ? { ok: true, url: "https://github.com/me/r" } : null;      // null = the real client's answer to a refusal / timeout
    if (path.endsWith("/chat/episode")) return { ok: true, delivered: { ok: true, kind: "github", url: "https://github.com/me/r/pull/7", sealed: { files: ["a.ts"] } } };
    return null;
  }),
  isNotWired: () => false,
}));
import { EpisodeButton, episodeNote } from "./agent-chat-pane";

const LOCAL_ONLY = { publish_nonce: "0123456789abcdef0123456789abcdef", publish_nonce_ttl_s: 600, ok: true, local_only: true, publish_available: true, why: "this repo is local only", root_name: "demo" };
beforeEach(() => { posts.length = 0; preflight = LOCAL_ONLY; publishAnswer = "ok"; preflightGate = null; preflightReads = 0; vi.spyOn(window, "open").mockImplementation(() => null); });

async function openPrRow() {
  render(<EpisodeButton paneId={7} />);
  fireEvent.click(screen.getByTestId("episode-close"));
  const row = await screen.findByTestId("episode-deliver-pr");
  await waitFor(() => expect(screen.getByTestId("episode-deliver-pr").getAttribute("data-action")).toBe("publish"));
  return row;
}

describe("creating the online repo before the pull request", () => {
  it("the first click only asks to be confirmed - it posts nothing", async () => {
    const row = await openPrRow();
    fireEvent.click(row);
    expect(screen.getByTestId("episode-deliver-pr").textContent).toContain("yes - create the private repo and open the PR");
    expect(posts).toEqual([]);
  });

  it("the second click creates the repo (confirm: true) and only then opens the pull request", async () => {
    const row = await openPrRow();
    fireEvent.click(row); fireEvent.click(screen.getByTestId("episode-deliver-pr"));
    await waitFor(() => expect(posts.map((p) => p.path)).toEqual(["/api/v1/cockpit/deliver/publish", "/api/v1/cockpit/chat/episode"]));
    expect(posts[0].body).toEqual({ pane_id: 7, confirm: true, nonce: "0123456789abcdef0123456789abcdef", name: "demo" });   // the preflight's one-time nonce travels with the confirming click (core b295a75)
    expect(posts[1].body).toEqual({ pane_id: 7, deliver: "pr" });
    await waitFor(() => expect(screen.getByTestId("episode-close-note").textContent).toContain("pull request opened"));
  });

  it("a repo the serve could not create stops there: no pull request is attempted, the error is shown, and the operator stays on the confirming step", async () => {
    publishAnswer = "null";
    const row = await openPrRow();
    fireEvent.click(row); fireEvent.click(screen.getByTestId("episode-deliver-pr"));
    await waitFor(() => expect(screen.getByTestId("episode-close-note").textContent).toContain("could not create the repo"));
    expect(posts.map((p) => p.path)).toEqual(["/api/v1/cockpit/deliver/publish"]);              // closeEpisode(..., 'pr') never ran
    expect(screen.getByTestId("episode-deliver-pr").textContent).toContain("yes - create the private repo");   // same step, menu still open
    expect((screen.getByTestId("episode-close") as HTMLButtonElement).disabled).toBe(false);
  });

  it("the preflight is forgotten when the menu closes - a reopened menu never reads the previous answer", async () => {
    const row = await openPrRow();
    fireEvent.click(row);                                                                         // confirming
    fireEvent.click(screen.getByTestId("episode-close"));                                         // close the menu
    await waitFor(() => expect(screen.queryByTestId("episode-deliver")).toBeNull());
    let release!: () => void; preflightGate = new Promise<void>((r) => { release = r; });
    fireEvent.click(screen.getByTestId("episode-close"));                                         // reopen: the new preflight is still in flight
    await waitFor(() => expect(preflightReads).toBe(2));
    const pr = screen.getByTestId("episode-deliver-pr");
    expect(pr.getAttribute("data-action")).toBe("pr");                                            // the neutral row, not the stale "create a private repo"
    expect(pr.textContent).not.toContain("yes - create");
    release();
    await waitFor(() => expect(screen.getByTestId("episode-deliver-pr").getAttribute("data-action")).toBe("publish"));
  });
});

describe("what closing says per choice", () => {
  const fell = { ok: true, delivered: { ok: true, kind: "patch", path: "/r/out.patch", sealed: { files: [] }, why: "this workspace's remote is not a forge antiloki can file against" } };
  it("a pull request that became a patch says no PR was opened", () => {
    expect(episodeNote(fell, "pr")).toContain("no pull request was opened");
    expect(episodeNote(fell)).toContain("no pull request was opened");                           // callers that do not say keep the old reading
  });
  it("'write a patch' never claims a pull request was not opened - nobody asked for one", () => {
    const n = episodeNote(fell, "patch");
    expect(n).not.toContain("pull request");
    expect(n).toContain("patch written to /r/out.patch");
  });
});

// Grokbot QA round 2, item 30: "Esc doesn't close the close-episode menu"
describe("the close-episode menu and the keyboard", () => {
  it("Escape closes it", async () => {
    render(<EpisodeButton paneId={7} />);
    fireEvent.click(screen.getByTestId("episode-close"));
    await screen.findByTestId("episode-deliver-pr");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("episode-deliver-pr")).toBeNull());
  });
});
