// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { changePrompt, changeRfc, describeChanges, diffFrame, frameDoc, layerName, nextName, readFrames, selectorFor, storeKey, toHex, upsertFrame, writeFrames, type Frame } from "./frames-store";

const f = (id: string, base = "Home", name = `${base} · v1`): Frame => ({ id, name, base, html: "<div/>", createdAt: 1, updatedAt: 1, width: 1280 });

describe("frames store", () => {
  beforeEach(() => localStorage.clear());
  it("is scoped per workspace and survives a reload", () => {
    writeFrames("miniStore", [f("a")]); writeFrames("other", [f("b")]);
    expect(readFrames("miniStore").map((x) => x.id)).toEqual(["a"]);
    expect(readFrames("other").map((x) => x.id)).toEqual(["b"]);
    expect(readFrames("nothing")).toEqual([]);
    expect(storeKey("")).toBe("antiloki:design-frames:default");
    localStorage.setItem(storeKey("broken"), "{not json");
    expect(readFrames("broken")).toEqual([]);
  });
  it("upsert replaces in place and prepends new ones; names count versions per base screen", () => {
    const one = upsertFrame([], f("a"));
    const two = upsertFrame(one, f("b", "Cart"));
    expect(two.map((x) => x.id)).toEqual(["b", "a"]);
    expect(upsertFrame(two, { ...f("a"), name: "renamed" }).find((x) => x.id === "a")!.name).toBe("renamed");
    expect(nextName("Home", two)).toBe("Home · v2");
    expect(nextName("Cart", two)).toBe("Cart · v2");
    expect(nextName("Checkout", two)).toBe("Checkout · v1");
  });
  it("frameDoc carries the project css, the base url and the hidden-layer rule", () => {
    const d = frameDoc("<p>hi</p>", ".x{color:red}", "http://localhost:5173");
    expect(d).toContain('<base href="http://localhost:5173/">');
    expect(d).toContain(".x{color:red}");
    expect(d).toContain("[data-lf-hidden]{display:none!important}");
    expect(d).toContain("<body><p>hi</p></body>");
    expect(frameDoc("", "")).not.toContain("<base");
  });
  it("colors and layer names read like the inspector", () => {
    expect(toHex("rgb(201, 124, 92)")).toBe("#c97c5c");
    expect(toHex("rgba(0, 0, 0, 0)")).toBe("#000000");
    expect(toHex("#abc")).toBe("#abc");
    expect(toHex("transparent")).toBe("#000000");
    expect(layerName({ tagName: "DIV", id: "root" })).toBe("div#root");
    expect(layerName({ tagName: "BUTTON", className: "add pulse" })).toBe("button.add");
    expect(layerName({ tagName: "SPAN", className: "css-1x2y3z4", textContent: "  Stoneware   mug " })).toBe("span “Stoneware mug”");
    expect(layerName({ tagName: "H1", textContent: "Fewer things, made well. Six objects." })).toBe("h1 “Fewer things, made…”");
    expect(layerName({ tagName: "IMG" })).toBe("img");
  });
});

describe("changes detected (2026-09-18): the delta between a snapshot and its code-based screen", () => {
  const base = `<header class="top"><h1 class="title">Hello</h1><button class="cta primary">Buy</button></header><main><p>intro</p><aside class="promo">ad</aside></main>`;
  const edited = `<header class="top"><h1 class="title" style="color: rgb(255, 0, 0); font-size: 32px">Hello</h1><button class="cta primary" style="border-radius: 12px">Buy now</button></header><main><p>intro</p><aside class="promo" data-lf-hidden="1">ad</aside></main>`;
  it("finds styled, retyped and hidden layers with greppable selectors, and nothing when the frame is untouched", () => {
    const ch = diffFrame(base, edited);
    expect(ch.map((c) => `${c.kind}:${c.selector}`)).toEqual([
      "style:header.top > h1.title",
      "style:header.top > button.cta.primary",
      "text:header.top > button.cta.primary",
      "hidden:main:nth-child(2) > aside.promo",
    ]);
    expect(ch[0].props).toEqual([{ key: "color", before: "(from the stylesheet)", after: "rgb(255, 0, 0)" }, { key: "font-size", before: "(from the stylesheet)", after: "32px" }]);
    expect(ch[2]).toMatchObject({ before: "Buy", after: "Buy now" });
    expect(diffFrame(base, base)).toEqual([]);
    const doc = new DOMParser().parseFromString("<body><div id=\"app\"><ul><li></li><li class=\"css-1x2y3z item\"></li></ul></div></body>", "text/html");
    expect(selectorFor(doc.querySelector("li.item")!)).toBe("div#app > ul:nth-child(1) > li.item");
  });
  it("the prompt and the RFC carry every change, the screen, the path and the acceptance", () => {
    const changes = diffFrame(base, edited);
    const lines = describeChanges(changes);
    expect(lines[0]).toContain("STYLE `header.top > h1.title`"); expect(lines[3]).toContain("HIDE `main:nth-child(2) > aside.promo`");
    const prompt = changePrompt({ screen: "Home", snapshot: "Home · v2", path: "src/routes/index.tsx", framework: "react", changes });
    expect(prompt).toContain("screen \"Home\" (route/file: src/routes/index.tsx) · react; snapshot \"Home · v2\"");
    expect(prompt).toContain("## The changes (4)"); expect(prompt).toContain("“Buy” → “Buy now”"); expect(prompt).toContain("design-system tokens"); expect(prompt).toContain("## Acceptance");
    expect(prompt).toContain("Commit on your branch");
    const rfc = changeRfc({ screen: "Home", snapshot: "Home · v2", changes, date: "2026-09-18", author: "dan" });
    expect(rfc.startsWith("# RFC · Home — design change (Home · v2)")).toBe(true);
    expect(rfc).toContain("**Date:** 2026-09-18"); expect(rfc).toContain("| `header.top > h1.title` | h1.title | color | (from the stylesheet) | rgb(255, 0, 0) |");
    expect(rfc).toContain("| `main:nth-child(2) > aside.promo` | aside.promo | hidden | visible | hidden |");
    expect(rfc).toContain("- [ ] the Home screen matches the snapshot \"Home · v2\"");
  });
});
