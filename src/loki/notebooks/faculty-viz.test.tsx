// The pure exports of faculty-viz. md2html is the converter behind every pressed page and every
// .html artifact export, so it is BOTH a formatter and the escaping layer — the order of those two
// jobs is what the tests pin: escape first, then add markup, or the escaping is decorative.
import { describe, it, expect } from "vitest";
import { md2html, parseViz } from "./faculty-viz";

describe("parseViz — salvaging JSON out of a model's answer", () => {
  it("parses a bare JSON object", () => {
    expect(parseViz('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a fenced code block around it", () => {
    expect(parseViz('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseViz("```\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it("finds the object even when the model wrapped it in prose", () => {
    expect(parseViz('Here you go:\n{"a":1}\nHope that helps!')).toEqual({ a: 1 });
  });

  it("spans multiple lines", () => {
    expect(parseViz('{\n  "a": 1,\n  "b": [2,3]\n}')).toEqual({ a: 1, b: [2, 3] });
  });

  it("returns null — never throws — for prose, malformed JSON, empty and null", () => {
    // The caller renders "no instrument" on null; a throw would take the whole pane down.
    expect(parseViz("no json here")).toBeNull();
    expect(parseViz("{not valid json}")).toBeNull();
    expect(parseViz("")).toBeNull();
    expect(parseViz(null as any)).toBeNull();
    expect(parseViz(undefined as any)).toBeNull();
  });

  it("takes the outermost span when there are braces on both ends", () => {
    expect(parseViz('{"a":{"b":2}}')).toEqual({ a: { b: 2 } });
  });
});

describe("md2html — escaping", () => {
  it("escapes &, < and > in prose", () => {
    expect(md2html("a < b & c > d")).toBe("<p>a &lt; b &amp; c &gt; d</p>");
  });

  it("neutralises an injected script tag", () => {
    const html = md2html("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the ampersand FIRST, so an escaped entity is not double-mangled", () => {
    // &  →  &amp;  (not &amp;amp;) — running the < / > passes first would produce the latter.
    expect(md2html("&lt;")).toBe("<p>&amp;lt;</p>");
  });

  it("escapes inside headings, list items and table cells too", () => {
    expect(md2html("# a < b")).toBe("<h2>a &lt; b</h2>");
    expect(md2html("- a < b")).toBe("<ul><li>a &lt; b</li></ul>");
    expect(md2html("| a < b |\n| --- |\n| c |")).toContain("a &lt; b");
  });
});

describe("md2html — blocks", () => {
  it("maps # through #### one level down, so the page's own h1 stays unique", () => {
    expect(md2html("# t")).toBe("<h2>t</h2>");
    expect(md2html("## t")).toBe("<h3>t</h3>");
    expect(md2html("#### t")).toBe("<h5>t</h5>");
  });

  it("wraps a plain paragraph and keeps single newlines as <br/>", () => {
    expect(md2html("one\ntwo")).toBe("<p>one<br/>two</p>");
  });

  it("splits blocks on blank lines", () => {
    expect(md2html("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
  });

  it("drops empty blocks rather than emitting <p></p>", () => {
    expect(md2html("a\n\n\n\n\nb")).toBe("<p>a</p>\n<p>b</p>");
  });

  it("renders bullets with either marker as one list", () => {
    expect(md2html("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(md2html("* one\n* two")).toBe("<ul><li>one</li><li>two</li></ul>");
  });

  it("renders a table with a header row and drops the separator", () => {
    const html = md2html("| Name | Count |\n| --- | ---: |\n| auth | 12 |");
    expect(html).toBe("<table><tr><th>Name</th><th>Count</th></tr><tr><td>auth</td><td>12</td></tr></table>");
    expect(html).not.toContain("---");
  });

  it("renders inline bold and code inside paragraphs, lists and tables", () => {
    expect(md2html("a **b** c")).toBe("<p>a <b>b</b> c</p>");
    expect(md2html("a `x` c")).toBe("<p>a <code>x</code> c</p>");
    expect(md2html("- a **b**")).toBe("<ul><li>a <b>b</b></li></ul>");
    expect(md2html("| **h** |\n| --- |\n| `c` |")).toContain("<b>h</b>");
  });

  it("returns an empty string for empty, null and undefined input", () => {
    expect(md2html("")).toBe("");
    expect(md2html(null as any)).toBe("");
    expect(md2html(undefined as any)).toBe("");
  });

  it("never emits an unbalanced tag for the block types it supports", () => {
    const html = md2html("# h\n\npara\n\n- a\n- b\n\n| x |\n| --- |\n| y |");
    for (const tag of ["h2", "p", "ul", "table"]) {
      expect(html.match(new RegExp(`<${tag}>`, "g"))?.length, tag).toBe(html.match(new RegExp(`</${tag}>`, "g"))?.length);
    }
  });
});
