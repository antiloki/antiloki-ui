// The shell context is the app's only cross-screen state: which card is active, which role the
// operator is in, and the one-shot seed that tells the chat drawer what to open with. The seed is
// the subtle one — "discuss this card" and "pre-fill the composer" are mutually exclusive, and
// setting the seed without opening the drawer means the click appears to do nothing.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SlugProvider, useShell, ACTIVE_SLUGS } from "./slug-context";

function Probe() {
  const s = useShell();
  return (
    <div>
      <span data-testid="slug">{s.activeSlug.slug}</span>
      <span data-testid="role">{s.role}</span>
      <span data-testid="open">{String(s.chatOpen)}</span>
      <span data-testid="seed">{JSON.stringify(s.chatSeed)}</span>
      <span data-testid="rail">{String(s.railCollapsed)}</span>
      <span data-testid="palette">{String(s.paletteOpen)}</span>
      <span data-testid="notif">{String(s.notifOpen)}</span>
      <span data-testid="ai">{String(s.aiCallId)}</span>
      <button onClick={() => s.setRole("builder")}>builder</button>
      <button onClick={() => s.setRole("observer")}>observer</button>
      <button onClick={() => s.setActiveSlug(ACTIVE_SLUGS[1])}>switch</button>
      <button onClick={() => s.openChatWith({ cardSlug: "FEAT-X", field: "why" })}>discuss</button>
      <button onClick={() => s.openChatWith({ compose: "propose a card that…" })}>compose</button>
      <button onClick={() => s.setChatSeed(null)}>consume</button>
      <button onClick={() => s.setRailCollapsed(true)}>collapse</button>
      <button onClick={() => s.setPaletteOpen(true)}>palette</button>
      <button onClick={() => s.setNotifOpen(true)}>notif</button>
      <button onClick={() => s.setAiCallId(42)}>ai</button>
    </div>
  );
}

const mount = () => render(<SlugProvider><Probe /></SlugProvider>);
const val = (id: string) => screen.getByTestId(id).textContent;
const click = (label: string) => fireEvent.click(screen.getByText(label));

beforeEach(() => { localStorage.clear(); });

describe("using the shell outside its provider", () => {
  it("fails loudly instead of rendering with silently-missing state", () => {
    const err = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/SlugProvider/);
    console.error = err;
  });
});

describe("defaults", () => {
  it("starts on the first active slug with everything closed", () => {
    mount();
    expect(val("slug")).toBe(ACTIVE_SLUGS[0].slug);
    expect(val("open")).toBe("false");
    expect(val("seed")).toBe("null");
    expect(val("rail")).toBe("false");
    expect(val("palette")).toBe("false");
    expect(val("notif")).toBe("false");
    expect(val("ai")).toBe("null");
  });

  it("defaults the role to operator", () => {
    mount();
    expect(val("role")).toBe("operator");
  });
});

describe("the role survives a reload", () => {
  it("is written to localStorage when changed", () => {
    mount();
    click("builder");
    expect(val("role")).toBe("builder");
    expect(localStorage.getItem("antiloki:role")).toBe("builder");
  });

  it("is read back on the next mount", () => {
    localStorage.setItem("antiloki:role", "observer");
    mount();
    expect(val("role")).toBe("observer");
  });

  it("ignores a stored value that is not a role — a corrupted key must not brick the shell", () => {
    localStorage.setItem("antiloki:role", "superuser");
    mount();
    expect(val("role")).toBe("operator");
  });
});

describe("the chat seed", () => {
  it("opens the drawer in the same action that sets the seed", () => {
    mount();
    click("discuss");
    expect(val("open")).toBe("true");
    expect(JSON.parse(val("seed")!)).toEqual({ cardSlug: "FEAT-X", field: "why" });
  });

  it("carries a composer starter instead, for the propose flow", () => {
    mount();
    click("compose");
    expect(val("open")).toBe("true");
    expect(JSON.parse(val("seed")!)).toEqual({ compose: "propose a card that…" });
  });

  it("is consumed once — clearing it leaves the drawer open", () => {
    mount();
    click("discuss");
    click("consume");
    expect(val("seed")).toBe("null");
    expect(val("open")).toBe("true");
  });

  it("a later seed replaces the earlier one rather than merging with it", () => {
    mount();
    click("discuss");
    click("compose");
    expect(JSON.parse(val("seed")!)).toEqual({ compose: "propose a card that…" });
  });
});

describe("the rest of the shell state is independently settable", () => {
  it("switches the active slug", () => {
    mount();
    click("switch");
    expect(val("slug")).toBe(ACTIVE_SLUGS[1].slug);
  });

  it("collapses the rail, opens the palette and the notifications drawer, and selects an AI call", () => {
    mount();
    act(() => { click("collapse"); click("palette"); click("notif"); click("ai"); });
    expect([val("rail"), val("palette"), val("notif"), val("ai")]).toEqual(["true", "true", "true", "42"]);
  });
});

describe("ACTIVE_SLUGS", () => {
  it("has unique slugs and only known statuses", () => {
    expect(new Set(ACTIVE_SLUGS.map((s) => s.slug)).size).toBe(ACTIVE_SLUGS.length);
    for (const s of ACTIVE_SLUGS) expect(["doing", "done", "blocked", "todo"]).toContain(s.status);
  });

  it("opens on a slug that is actually in flight", () => {
    expect(ACTIVE_SLUGS[0].status).toBe("doing");
  });
});
