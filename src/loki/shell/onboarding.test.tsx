// Onboarding is shown exactly once per browser, so the only thing that really matters is that EVERY
// exit path persists — finishing, skipping mid-tour, or dismissing the welcome card. A path that
// forgets to persist means the tour reappears on every reload, which is worse than never showing it.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingProvider, useOnboarding, TourOverlay } from "./onboarding";

const KEY = "antiloki:onboarded";

function Probe() {
  const o = useOnboarding();
  return (
    <div>
      <span data-testid="onboarded">{String(o.onboarded)}</span>
      <span data-testid="step">{o.tourStep}</span>
      <button onClick={o.startTour}>start</button>
      <button onClick={o.nextStep}>next</button>
      <button onClick={o.endTour}>end</button>
      <button onClick={o.skip}>skip</button>
    </div>
  );
}

const mount = () => render(<OnboardingProvider><Probe /><TourOverlay /></OnboardingProvider>);
const step = () => Number(screen.getByTestId("step").textContent);
const click = (label: string) => fireEvent.click(screen.getByText(label));

beforeEach(() => localStorage.clear());

describe("using the hook outside its provider", () => {
  it("throws rather than rendering a tour with no state", () => {
    const err = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/OnboardingProvider/);
    console.error = err;
  });
});

describe("first visit vs returning visit", () => {
  it("reports not-onboarded when nothing was stored", () => {
    mount();
    expect(screen.getByTestId("onboarded").textContent).toBe("false");
  });

  it("reports onboarded when the flag is present", () => {
    localStorage.setItem(KEY, "1");
    mount();
    expect(screen.getByTestId("onboarded").textContent).toBe("true");
  });
});

describe("the tour", () => {
  it("shows nothing until it is started", () => {
    mount();
    expect(step()).toBe(-1);
    expect(screen.queryByText(/tour · /)).toBeNull();
  });

  it("opens on the first step and counts up", () => {
    mount();
    click("start");
    expect(step()).toBe(0);
    expect(screen.getByText("tour · 1 of 4")).toBeTruthy();
    click("next");
    expect(screen.getByText("tour · 2 of 4")).toBeTruthy();
  });

  it("labels the last step done and the others next", () => {
    mount();
    click("start");
    expect(screen.getByText("next →")).toBeTruthy();
    click("next"); click("next"); click("next");
    expect(screen.getByText("tour · 4 of 4")).toBeTruthy();
    expect(screen.getByText("done")).toBeTruthy();
  });

  it("closes and persists after the final step", () => {
    mount();
    click("start");
    for (let i = 0; i < 4; i++) click("next");
    expect(step()).toBe(-1);
    expect(localStorage.getItem(KEY)).toBe("1");
    expect(screen.getByTestId("onboarded").textContent).toBe("true");
  });

  it("persists when skipped mid-tour — the tour must not come back tomorrow", () => {
    mount();
    click("start"); click("next");
    click("skip");
    expect(step()).toBe(-1);
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  it("persists when ended early", () => {
    mount();
    click("start");
    click("end");
    expect(step()).toBe(-1);
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  it("can be skipped from inside the overlay itself", () => {
    mount();
    click("start");
    fireEvent.click(screen.getByText("skip tour"));
    expect(step()).toBe(-1);
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  it("advances when the operator clicks the dimmed backdrop", () => {
    const { container } = mount();
    click("start");
    const backdrop = Array.from(container.parentElement!.querySelectorAll("div"))
      .find((d) => (d as HTMLElement).style.position === "fixed" && (d as HTMLElement).style.inset === "0px")!;
    fireEvent.click(backdrop);
    expect(step()).toBe(1);
  });

  it("fills the progress bar up to the current step", () => {
    const { baseElement } = mount();
    click("start"); click("next");
    const bars = Array.from(baseElement.querySelectorAll("div"))
      .filter((d) => (d as HTMLElement).style.height === "3px") as HTMLElement[];
    expect(bars).toHaveLength(4);
    const filled = new Set([bars[0].style.background, bars[1].style.background]);
    expect(filled.size).toBe(1);                       // steps 1 and 2 share the "done" colour
    expect(bars[3].style.background).not.toBe(bars[0].style.background);
  });

  it("gives every step real copy — an empty card would look broken", () => {
    mount();
    click("start");
    for (let i = 0; i < 4; i++) {
      expect(screen.getByRole("heading").textContent!.length, `step ${i}`).toBeGreaterThan(5);
      if (i < 3) click("next");
    }
  });
});
