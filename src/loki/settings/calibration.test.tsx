// @vitest-environment jsdom
// The point of this panel is that a claim can fail in public, so the tests are about the unflattering answers: an
// unused grade must not read as a measured zero, and a grade that predicts nothing — or runs backwards — must say so.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const apiGet = vi.fn();
vi.mock("@/loki/api/client", () => ({ apiGet: (...a: any[]) => apiGet(...a) }));
import { Calibration, verdictTone, bucketLine, barOf } from "./calibration";

const b = (confidence: string, n: number, quality: number) => ({ confidence, n, quality, measured: n > 0 });
beforeEach(() => apiGet.mockReset());

describe("verdictTone", () => {
  it("treats a backwards grade as a finding, decoration as a warning, separation as good news", () => {
    expect(verdictTone("THE GRADE IS BACKWARDS: `high` scores 0.40")).toBe("bad");
    expect(verdictTone("the grade is decoration so far")).toBe("warn");
    expect(verdictTone("the grade separates: `high` runs score 0.92")).toBe("ok");
    expect(verdictTone("no route has been graded yet")).toBe("dim");
  });
});

describe("bucketLine · barOf", () => {
  it("says a grade is unused rather than printing a zero that reads as failure", () => {
    expect(bucketLine(b("medium", 0, 0))).toBe("medium · not used yet");
    expect(barOf(b("medium", 0, 0))).toBe(0);
  });
  it("names the runs and the score once there are any", () => {
    expect(bucketLine(b("high", 12, 0.863))).toBe("high · 12 runs · 0.86");
    expect(bucketLine(b("low", 1, 0.4))).toBe("low · 1 run · 0.40");
    expect(barOf(b("high", 12, 0.86))).toBeCloseTo(0.86);
  });
  it("gives a measured zero a sliver of bar, so it is visibly measured rather than absent", () => {
    expect(barOf(b("low", 4, 0))).toBeGreaterThan(0);
  });
});

describe("the calibration panel", () => {
  it("prints the serve's verdict, in the tone it deserves", async () => {
    apiGet.mockResolvedValue({ ok: true, total: 12, verdict: "the grade is decoration so far: `high` 0.80 vs `low` 0.78 over 12 runs — it does not predict the outcome",
      buckets: [b("high", 6, 0.8), b("medium", 0, 0), b("low", 6, 0.78)] });
    render(<Calibration />);
    await waitFor(() => expect(screen.getByTestId("calibration-verdict")).toBeTruthy());
    expect(screen.getByTestId("calibration-verdict").textContent).toContain("decoration");
    expect(screen.getByTestId("calibration-high").textContent).toContain("6 runs · 0.80");
    expect(screen.getByTestId("calibration-medium").textContent).toContain("not used yet");
  });
  it("says so when the serve cannot answer, instead of drawing an empty curve", async () => {
    apiGet.mockResolvedValue({ ok: false, error: "no such route" });
    render(<Calibration />);
    await waitFor(() => expect(screen.getByText(/no such route/)).toBeTruthy());
    expect(screen.queryByTestId("calibration-high")).toBeNull();
  });
});
