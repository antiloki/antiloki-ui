// This strip decides what the build and test GATES actually execute — "the gates run EXACTLY these,
// no guessing". The provenance label per field is therefore load-bearing: an operator must be able
// to tell a value they recorded from one merely detected in package.json, because only the first is
// a promise. And when the endpoint is absent (pre-restart BE) the strip hides rather than showing
// an empty form that silently saves nowhere.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...a), apiPost: (...a: any[]) => apiPost(...a) }));

import { ScriptsRegistry } from "./scripts-registry";

const registry = (over: any = {}) => ({
  scripts: { build: "npm run build", dev: "npm run dev", test: "npm test", install: "npm ci", env: "" },
  source: { build: "recorded", dev: "detected", test: "none", install: "detected" },
  detected: { dev: "vite dev", install: "npm ci" },
  ...over,
});

const mount = async (body: any) => {
  apiGet.mockResolvedValue(body);
  const r = render(<ScriptsRegistry />);
  await waitFor(() => expect(screen.queryByText("scripts registry…")).toBeNull());
  return r;
};
const field = (label: string) => screen.getByTitle(new RegExp(label)).querySelector("input") as HTMLInputElement;

beforeEach(() => { apiGet.mockReset(); apiPost.mockReset().mockResolvedValue({ ok: true }); });

describe("when the endpoint is not there", () => {
  it("hides entirely rather than offering a form that saves nowhere", async () => {
    const { container } = await mount({});
    expect(container).toBeEmptyDOMElement();
  });

  it("hides on a thrown read too", async () => {
    apiGet.mockRejectedValue(new Error("404"));
    const { container } = render(<ScriptsRegistry />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("says it is loading first", () => {
    apiGet.mockReturnValue(new Promise(() => {}));
    render(<ScriptsRegistry />);
    expect(screen.getByText("scripts registry…")).toBeTruthy();
  });
});

describe("the four lifecycle commands", () => {
  it("offers one field per gate, each explaining what runs it", async () => {
    await mount(registry());
    expect(screen.getByTitle(/the build gate runs this after apply/)).toBeTruthy();
    expect(screen.getByTitle(/the preview \+ recovery ladder's dev-server/)).toBeTruthy();
    expect(screen.getByTitle(/the test gate runs this after a GREEN build/)).toBeTruthy();
    expect(screen.getByTitle(/deps install/)).toBeTruthy();
  });

  it("loads the recorded values into the form", async () => {
    await mount(registry());
    expect(field("the build gate").value).toBe("npm run build");
    expect(field("the test gate").value).toBe("npm test");
  });

  it("distinguishes recorded, detected and absent provenance — and shows what was detected", async () => {
    await mount(registry());
    const recorded = screen.getByText(/· recorded/) as HTMLElement;
    const detected = screen.getAllByText(/· detected/)[0] as HTMLElement;
    const none = screen.getByText(/· none/) as HTMLElement;
    expect(new Set([recorded.style.color, detected.style.color, none.style.color]).size).toBe(3);
    expect(detected.textContent).toContain("vite dev");
  });

  it("uses the detected command as the placeholder, and warns when a gate would skip", async () => {
    await mount(registry({ scripts: { build: "", dev: "", test: "", install: "", env: "" } }));
    expect(field("recovery ladder's dev-server").placeholder).toBe("vite dev");
    expect(field("the build gate").placeholder).toBe("(none — gate skips)");
  });

  it("carries an env block for the variables the preview and gates apply", async () => {
    await mount(registry({ scripts: { build: "", dev: "", test: "", install: "", env: "NODE_OPTIONS=--x" } }));
    const box = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(box.value).toBe("NODE_OPTIONS=--x");
    expect(screen.getByText(/KEY=VALUE per line/)).toBeTruthy();
  });
});

describe("saving", () => {
  it("writes every field, including the env block, then re-reads the registry", async () => {
    await mount(registry());
    fireEvent.change(field("the build gate"), { target: { value: "pnpm build" } });
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "CI=1" } });
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/api/v1/workspace/scripts",
      expect.objectContaining({ build: "pnpm build", test: "npm test", env: "CI=1" })));
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  });

  it("confirms the write only after it lands", async () => {
    await mount(registry());
    expect(screen.queryByText("✓ recorded")).toBeNull();
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(screen.getByText("✓ recorded")).toBeTruthy());
  });

  it("shows the write in progress and blocks a second click", async () => {
    await mount(registry());
    let release: (v: any) => void = () => {};
    apiPost.mockReturnValue(new Promise((r) => { release = r; }));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect((screen.getByText("saving…") as HTMLButtonElement).disabled).toBe(true));
    release({ ok: true });
  });

  it("does not claim success when the write fails", async () => {
    await mount(registry());
    apiPost.mockRejectedValue(new Error("denied"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(screen.getByText("save")).toBeTruthy());
    expect(screen.queryByText("✓ recorded")).toBeNull();
  });

  it("unwraps the dispatch envelope on read", async () => {
    await mount({ result: registry() });
    expect(field("the build gate").value).toBe("npm run build");
  });
});
