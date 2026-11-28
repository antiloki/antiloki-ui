import { describe, it, expect, beforeAll } from "vitest";
import { bloom, installBloom, originFor, rememberClick, BLOOM_MS } from "./bloom";

describe("every window blooms", () => {
  it("grows from the last click when it was a moment ago, else from its own middle", () => {
    const box = { left: 400, top: 200, width: 200, height: 100 };
    expect(originFor({ x: 50, y: 60, t: 1000 }, 1200, box)).toEqual({ x: -450, y: -190 }); expect(originFor({ x: 50, y: 60, t: 1000 }, 5000, box)).toEqual({ x: 0, y: 0 });
  });
  it("is given to a dialog that appears, once, and not to one that animates itself", async () => {
    installBloom(); rememberClick(10, 10);
    const a = document.createElement("div"); a.setAttribute("role", "dialog"); document.body.appendChild(a); await new Promise((r) => setTimeout(r, 20));
    expect(a.dataset.bloomed).toBe("1"); expect(a.style.animation).toContain("antiloki-bloom"); expect(a.style.animation).toContain(`${BLOOM_MS}ms`); const first = a.style.animation; bloom(a); expect(a.style.animation).toBe(first);
    const b = document.createElement("div"); b.setAttribute("role", "dialog"); b.setAttribute("data-no-bloom", ""); document.body.appendChild(b); await new Promise((r) => setTimeout(r, 20)); expect(b.dataset.bloomed).toBeUndefined();
    const wrap = document.createElement("div"); wrap.innerHTML = '<section><div role="dialog" id="deep"></div></section>'; document.body.appendChild(wrap); await new Promise((r) => setTimeout(r, 20)); expect((document.getElementById("deep") as HTMLElement).dataset.bloomed).toBe("1");
  });
});
