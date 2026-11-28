// @vitest-environment jsdom
// THE FORGE TOKEN, FROM SETTINGS (operator 2026-09-30): pasted, checked, kept, and never shown again.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const posts: any[] = [];
let hosts: any[]; let failWith: "refused" | "old-serve" | null;
vi.mock("@/loki/api/client", () => ({
  apiGet: vi.fn(async () => ({ ok: true, hosts, gh: { installed: true, account: "acme" } })),
  apiPost: vi.fn(async (_u: string, b: any) => {
    posts.push(b);
    // the REAL client never throws here: a refused token, a timeout and a dead serve all resolve null; an old serve's 404 resolves the not-wired sentinel
    if (failWith === "refused") return null;
    if (failWith === "old-serve") return { __not_wired: true, path: _u };
    if (b.remove) { hosts = hosts.map((h) => h.host === b.host ? { ...h, stored: false, active_from: null } : h); return { ok: true }; }
    hosts = hosts.map((h) => h.host === b.host ? { ...h, stored: true, active_from: "~/.antiloki/tokens/github.com" } : h);
    return { ok: true, login: "acme" };
  }),
}));
import { ForgeTokens } from "./ai-engines";

beforeEach(() => { posts.length = 0; failWith = null; hosts = [{ host: "github.com", kind: "github", active_from: null, stored: false }, { host: "gitlab.com", kind: "gitlab", active_from: null, stored: false }]; });

describe("the forge token in Settings", () => {
  it("saves the pasted token, says who GitHub says it is, empties the field, and shows where the token comes from - never the token", async () => {
    render(<ForgeTokens />);
    await screen.findByTestId("forge-github.com");
    expect(screen.getByTestId("forge-github.com").textContent).toContain("no token");
    expect(screen.getByText(/already signed in as/i).textContent).toContain("acme");     // gh counts: the operator is told they may not need a token at all
    const input = screen.getByTestId("forge-token") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "ghp_aSecretTokenValue123" } });
    fireEvent.click(screen.getByTestId("forge-save"));
    await waitFor(() => expect(posts).toEqual([{ host: "github.com", token: "ghp_aSecretTokenValue123" }]));
    await waitFor(() => expect(screen.getByTestId("forge-msg").textContent).toContain("acme"));
    expect((screen.getByTestId("forge-token") as HTMLInputElement).value).toBe("");                 // the secret left the screen
    await waitFor(() => expect(screen.getByTestId("forge-github.com").textContent).toContain("~/.antiloki/tokens/github.com"));
    expect(document.body.textContent).not.toContain("ghp_aSecretTokenValue123");                   // (an input's value is not textContent: the emptied field is asserted above)
  });
  it("a token the serve did not keep says so and STAYS in the field (the real client resolves null on a refusal or timeout)", async () => {
    failWith = "refused";
    render(<ForgeTokens />);
    await screen.findByTestId("forge-github.com");
    const input = screen.getByTestId("forge-token") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ghp_aWrongTokenValue1234" } });
    fireEvent.click(screen.getByTestId("forge-save"));
    await waitFor(() => expect(screen.getByTestId("forge-msg").textContent).toContain("could not save the token"));
    expect(screen.getByTestId("forge-msg").textContent).not.toContain("saved");
    expect(input.value).toBe("ghp_aWrongTokenValue1234");                                        // not emptied: nothing was kept
    expect(screen.getByTestId("forge-github.com").textContent).toContain("no token");
  });
  it("an older serve without the route (404 sentinel) is not 'saved' either", async () => {
    failWith = "old-serve";
    render(<ForgeTokens />);
    await screen.findByTestId("forge-github.com");
    fireEvent.change(screen.getByTestId("forge-token"), { target: { value: "ghp_aTokenValue" } });
    fireEvent.click(screen.getByTestId("forge-save"));
    await waitFor(() => expect(screen.getByTestId("forge-msg").textContent).toContain("restart it"));
    expect((screen.getByTestId("forge-token") as HTMLInputElement).value).toBe("ghp_aTokenValue");
  });
  it("a removal the serve did not do does not say the token is gone", async () => {
    failWith = "refused";
    hosts[0] = { ...hosts[0], stored: true, active_from: "~/.antiloki/tokens/github.com" };
    render(<ForgeTokens />);
    fireEvent.click(await screen.findByTestId("forge-remove-github.com"));
    await waitFor(() => expect(screen.getByTestId("forge-msg").textContent).toContain("could not remove it"));
    expect(screen.getByTestId("forge-msg").textContent).not.toContain("is gone");
  });
  it("the token field does not invite the browser's password manager to remember it", async () => {
    render(<ForgeTokens />);
    expect((await screen.findByTestId("forge-token")).getAttribute("autocomplete")).toBe("new-password");
  });
  it("removes a stored token", async () => {
    hosts[0] = { ...hosts[0], stored: true, active_from: "~/.antiloki/tokens/github.com" };
    render(<ForgeTokens />);
    fireEvent.click(await screen.findByTestId("forge-remove-github.com"));
    await waitFor(() => expect(posts).toEqual([{ host: "github.com", remove: true }]));
    await waitFor(() => expect(screen.getByTestId("forge-github.com").textContent).toContain("no token"));
  });
  it("does not let an empty token be sent", async () => {
    render(<ForgeTokens />);
    await screen.findByTestId("forge-github.com");
    expect((screen.getByTestId("forge-save") as HTMLButtonElement).disabled).toBe(true);
  });
});
