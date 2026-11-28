// EndpointStub stands in for a screen whose BE route is not live yet. It has to blame the missing
// endpoint (not the screen), name the route when it can, and promise the screen recovers on its own —
// otherwise the operator restarts things that do not need restarting.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EndpointStub } from "./EndpointStub";

describe("EndpointStub", () => {
  it("blames the missing endpoint rather than the screen", () => {
    render(<EndpointStub />);
    expect(screen.getByText(/endpoint not yet wired/)).toBeTruthy();
    expect(screen.getByText("Waiting on backend")).toBeTruthy();
  });

  it("names the endpoint it is waiting for when the caller knows it", () => {
    render(<EndpointStub endpoint="/api/v1/knowledge/graph" />);
    expect(screen.getByText("/api/v1/knowledge/graph")).toBeTruthy();
    expect(screen.getByText(/expected:/)).toBeTruthy();
  });

  it("omits the expected-endpoint line when there is nothing to name", () => {
    render(<EndpointStub />);
    expect(screen.queryByText(/expected:/)).toBeNull();
  });

  it("promises the screen will light up on its own — no reload ritual implied", () => {
    render(<EndpointStub />);
    expect(screen.getByText(/light up automatically/)).toBeTruthy();
  });

  it("takes an override title and hint", () => {
    render(<EndpointStub title="Coverage" hint="needs lcov on the BE" />);
    expect(screen.getByText("Coverage")).toBeTruthy();
    expect(screen.getByText("needs lcov on the BE")).toBeTruthy();
  });
});
