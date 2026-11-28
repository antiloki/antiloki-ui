// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { followBottom } from "./follow-bottom";

const tick = () => new Promise((r) => setTimeout(r, 0));
const makeList = () => {
  const el = document.createElement("div"); let top = 0;
  Object.defineProperty(el, "scrollHeight", { get: () => 1000 + el.children.length * 100 });
  Object.defineProperty(el, "scrollTop", { get: () => top, set: (v) => { top = v; } });
  return el;
};

describe("a thread that follows its bottom", () => {
  it("scrolls to the new bottom when content is added, while the reader is at the bottom", async () => {
    const el = makeList(); const stop = followBottom(el, () => true);
    el.appendChild(document.createElement("div")); await tick();
    expect(el.scrollTop).toBe(1100);
    const card = document.createElement("div"); el.appendChild(card); card.appendChild(document.createElement("span")); await tick();   // a card drawn after the turn, taller than before
    expect(el.scrollTop).toBe(1200);
    stop();
  });
  it("leaves the view alone once the reader has scrolled up", async () => {
    const el = makeList(); let stick = false; const stop = followBottom(el, () => stick);
    el.scrollTop = 50; el.appendChild(document.createElement("div")); await tick();
    expect(el.scrollTop).toBe(50);
    stick = true; el.appendChild(document.createElement("div")); await tick();
    expect(el.scrollTop).toBe(1200);                                      // back at the bottom: it follows again
    stop();
  });
  it("stops observing when told to", async () => {
    const el = makeList(); const stop = followBottom(el, () => true); stop();
    el.appendChild(document.createElement("div")); await tick();
    expect(el.scrollTop).toBe(0);
  });
});
