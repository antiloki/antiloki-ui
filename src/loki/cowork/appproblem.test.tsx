// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as React from "react";
import { classify } from "./app-problem";
import { AppProblem } from "./AppProblem";

describe("what an app's refusal means", () => {
  it("an expired or wrong token says so and links to where a new one is made", () => {
    for (const t of ["needs sign-in: the app answered 401 (the token is missing, wrong or expired)", "Bad credentials", "401 Unauthorized"]) { const p = classify("github", t)!; expect(p.kind).toBe("expired"); expect(p.title).toContain("GitHub"); expect(p.links.map((l) => l.href)).toContain("https://github.com/settings/personal-access-tokens"); }
  });
  it("a missing permission names what to give, per app, with the link", () => {
    const p = classify("github", "forbidden: the app answered 403: Resource not accessible by personal access token")!; expect(p.kind).toBe("permission"); expect(p.fix).toContain("Pull requests"); expect(p.links.length).toBe(2);
    expect(classify("notion", "the app said (-32000): insufficient permissions")!.fix).toContain("Connections"); expect(classify("linear", "403 forbidden")!.links[0].href).toContain("linear.app");
  });
  it("tells an organisation's SSO approval, a rate limit and a missing install apart, and leaves ordinary errors alone", () => {
    expect(classify("github", "Resource protected by organization SAML enforcement")!.kind).toBe("sso"); expect(classify("github", "Search.q (invalid): Access to the requested organization (antiloki) is blocked by a conditional access policy.")!.kind).toBe("sso"); expect(classify("github", "403 rate limit exceeded")!.kind).toBe("rate"); expect(classify("linear", "Linear is not installed")!.kind).toBe("install");
    expect(classify("github", "something odd happened")).toBeNull(); expect(classify("github", "")).toBeNull(); expect(classify("unknownapp", "401")!.title).toContain("unknownapp");
  });
  it("draws the title, the fix and the links, and keeps what the app said below them", () => {
    render(<AppProblem app="github" text="forbidden: the app answered 403: Resource not accessible" color="red" />); expect(screen.getByTestId("app-problem").getAttribute("data-kind")).toBe("permission"); expect(screen.getAllByTestId("app-problem-link").length).toBe(2); expect((screen.getAllByTestId("app-problem-link")[0] as HTMLAnchorElement).target).toBe("_blank"); expect(screen.getByTestId("app-problem-raw").textContent).toContain("Resource not accessible"); cleanup();
    render(<AppProblem app="github" text="plain trouble" color="red" />); expect(screen.getByTestId("app-problem").textContent).toBe("plain trouble");
  });
});
