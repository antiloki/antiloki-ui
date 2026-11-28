import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("./api", () => ({ checkFrame: async (u: string) => ({ frameable: !u.includes("google"), why: "" }), launchAppWindow: async () => ({ ok: true }), runningPorts: async () => [{ port: 5173, url: "http://localhost:5173/", web: true, title: "antiloki" }, { port: 41931, url: "http://localhost:41931/", web: false, title: null }] }));
import { BrowserPane } from "./BrowserPane";

describe("the browser pane", () => {
  it("lists what is running, opens one in the frame on a click, and goes back to the list", async () => {
    render(<BrowserPane />); await waitFor(() => expect(screen.getByTestId("running-5173")).toBeTruthy());
    expect(screen.getByTestId("running-5173").textContent).toContain("antiloki"); expect(screen.getByTestId("running-41931").textContent).toContain("not a web page");
    fireEvent.click(screen.getByTestId("running-5173")); await waitFor(() => expect(screen.getByTestId("browser-frame")).toBeTruthy()); expect(screen.getByTestId("browser-frame").getAttribute("src")).toBe("http://localhost:5173/"); expect((screen.getByTestId("browser-address") as HTMLInputElement).value).toBe("http://localhost:5173/");
    fireEvent.click(screen.getByTestId("browser-home")); expect(screen.queryByTestId("browser-frame")).toBeNull(); expect(screen.getByTestId("browser-list")).toBeTruthy();
  });
  it("takes a bare port or an address in the bar", async () => {
    render(<BrowserPane />); const a = screen.getByTestId("browser-address"); fireEvent.change(a, { target: { value: "3000" } }); fireEvent.submit(a.closest("form")!); await waitFor(() => expect(screen.getByTestId("browser-frame").getAttribute("src")).toBe("http://localhost:3000/"));
  });
});

import { resolve } from "./BrowserPane";
describe("the bar is a search box", () => {
  it("reads a port, an address or a search, with the engine the icon picked", () => {
    expect(resolve("5173", "google")).toBe("http://localhost:5173/"); expect(resolve("localhost:3000/x", "bing")).toBe("http://localhost:3000/x"); expect(resolve("example.com", "google")).toBe("https://example.com");
    expect(resolve("cats in hats", "duckduckgo")).toBe("https://duckduckgo.com/?q=cats%20in%20hats"); expect(resolve("cats", "bing")).toContain("bing.com/search?q=cats"); expect(resolve("  ", "google")).toBe("");
  });
  it("shows a coloured dot for running, swaps the engine from the icon, and opens a site that refuses framing in a window", async () => {
    render(<BrowserPane />); await waitFor(() => expect(screen.getByTestId("browser-dot").getAttribute("data-running")).toBe("1"));
    fireEvent.click(screen.getByTestId("browser-engine")); fireEvent.click(screen.getByTestId("engine-bing")); expect((screen.getByTestId("browser-address") as HTMLInputElement).placeholder).toContain("Bing");
    const a = screen.getByTestId("browser-address"); fireEvent.change(a, { target: { value: "google.com" } }); fireEvent.submit(a.closest("form")!);
    await waitFor(() => expect(screen.getByTestId("browser-refused")).toBeTruthy()); fireEvent.click(screen.getByTestId("browser-open-window")); await waitFor(() => expect(screen.getByTestId("browser-note").textContent).toContain("window"));
  });
});
