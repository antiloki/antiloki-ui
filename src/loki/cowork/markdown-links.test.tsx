// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import * as React from "react";
import { Markdown, linkTarget } from "@/loki/components/Markdown";

describe("markdown links", () => {
  afterEach(() => cleanup());
  it("understands Linear's angle-bracket addresses, a title, and keeps in-app paths and refuses unsafe schemes", () => {
    expect(linkTarget("<https://linear.app/settings/integrations/github>")).toBe("https://linear.app/settings/integrations/github"); expect(linkTarget('https://x.io/a "the title"')).toBe("https://x.io/a"); expect(linkTarget("mailto:a@b.io")).toBe("mailto:a@b.io");
    expect(linkTarget("javascript:alert(1)")).toBeNull(); expect(linkTarget("/operations")).toBe("/operations"); expect(linkTarget("data:text/html,x")).toBeNull(); expect(linkTarget("<javascript:alert(1)>")).toBeNull();
  });
  it("draws the GitHub / GitLab line as two real links", () => {
    const { container } = render(<Markdown text={"[GitHub](<https://linear.app/settings/integrations/github>) / [GitLab](<https://linear.app/settings/integrations/gitlab>)\n\nSee <https://example.com/docs> or [bad](javascript:alert(1))."} />);
    const a = Array.from(container.querySelectorAll("a")); expect(a.map((x) => x.getAttribute("href"))).toEqual(["https://linear.app/settings/integrations/github", "https://linear.app/settings/integrations/gitlab", "https://example.com/docs"]);
    expect(a[0].textContent).toBe("GitHub"); expect(container.textContent).toContain("bad"); expect(container.textContent).not.toContain("javascript:"); expect(container.textContent).not.toContain("<https");
  });
});
