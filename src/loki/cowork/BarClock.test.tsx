import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
vi.mock("@/loki/api/client", async (orig) => ({ ...(await orig<any>()), apiGet: async () => ({ ok: true, tokens: 18_400_000 }) }));
import { BarClock, monthGrid } from "./BarClock";

describe("the clock on the bottom bar", () => {
  it("lays a month out in weeks of seven, Monday first", () => {
    const g = monthGrid(2026, 10);   // November 2026 starts on a Sunday
    expect(g[0]).toEqual([null, null, null, null, null, null, 1]); expect(g.flat().filter((d) => d !== null).length).toBe(30); expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it("shows the date, the time and every token ever; a click opens the calendar", async () => {
    render(<BarClock />); expect(screen.getByTestId("bar-clock").textContent).toMatch(/\d/); await waitFor(() => expect(screen.getByTestId("bar-tokens").textContent).toContain("18.40M"));
    fireEvent.click(screen.getByTestId("bar-clock")); expect(screen.getByTestId("calendar")).toBeTruthy(); expect(screen.getByTestId("calendar-time").textContent).toMatch(/\d/);
    const before = screen.getByText(/20\d\d/, { selector: "b" }).textContent; fireEvent.click(screen.getByTestId("cal-next")); expect(screen.getByText(/20\d\d/, { selector: "b" }).textContent).not.toBe(before);
  });
});
