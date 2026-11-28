// This renderer exists instead of a 30KB CommonMark dep, which means its grammar is exactly as wide
// as the substrate's strings need — and no wider. The tests therefore pin the supported subset (so a
// refactor can't quietly drop a construct that contract goal_md relies on) and pin the degradation:
// anything unsupported must come out as readable text, never as a crash or a swallowed line.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

const md = (text: string) => render(<Markdown text={text} />).container;

describe("headings", () => {
  it("renders the three levels the substrate uses", () => {
    const c = md("# One\n## Two\n### Three");
    expect(c.querySelector("h1")!.textContent).toBe("One");
    expect(c.querySelector("h2")!.textContent).toBe("Two");
    expect(c.querySelector("h3")!.textContent).toBe("Three");
  });

  it("needs the space — '#tag' is a paragraph, not a heading", () => {
    const c = md("#nothashtag");
    expect(c.querySelector("h1")).toBeNull();
    expect(c.querySelector("p")!.textContent).toBe("#nothashtag");
  });

  it("renders a fourth level as a heading, hashes gone (2026-09-28: a worker's report showed \"#### File Paths\")", () => {
    const c = md("#### Four");
    expect(c.querySelector("h4")!.textContent).toBe("Four");
    expect(c.textContent).not.toContain("####");
  });
});

describe("paragraphs", () => {
  it("joins contiguous lines into one paragraph and splits on a blank line", () => {
    const c = md("one\ntwo\n\nsecond para");
    const ps = Array.from(c.querySelectorAll("p")).map((p) => p.textContent);
    expect(ps).toEqual(["one two", "second para"]);
  });

  it("stops a paragraph at the next block, so a following list is not absorbed", () => {
    const c = md("intro line\n- item");
    expect(c.querySelector("p")!.textContent).toBe("intro line");
    expect(c.querySelectorAll("li")).toHaveLength(1);
  });

  it("renders empty input as nothing at all", () => {
    expect(md("").textContent).toBe("");
    expect(md("\n\n\n").textContent).toBe("");
  });
});

describe("lists", () => {
  it("accepts both - and * bullets", () => {
    const c = md("- a\n* b");
    expect(Array.from(c.querySelectorAll("li")).map((l) => l.textContent)).toEqual(["a", "b"]);
    expect(c.querySelector("ul")).toBeTruthy();
  });

  it("renders a numbered list as an <ol> and drops the literal numbers", () => {
    const c = md("1. first\n2. second");
    expect(c.querySelector("ol")).toBeTruthy();
    expect(Array.from(c.querySelectorAll("li")).map((l) => l.textContent)).toEqual(["first", "second"]);
  });

  it("keeps two separated lists separate", () => {
    const c = md("- a\n\n- b");
    expect(c.querySelectorAll("ul")).toHaveLength(2);
  });

  it("formats inline markup inside list items", () => {
    const c = md("- an **important** point");
    expect(c.querySelector("li strong")!.textContent).toBe("important");
  });
});

describe("inline formatting", () => {
  it("renders bold, italic and inline code", () => {
    const c = md("a **bold** and *italic* and `code` here");
    expect(c.querySelector("strong")!.textContent).toBe("bold");
    expect(c.querySelector("em")!.textContent).toBe("italic");
    expect(c.querySelector("code")!.textContent).toBe("code");
    expect(c.textContent).toContain("here");   // trailing text after the last match survives
  });

  it("opens links in a new tab safely", () => {
    const c = md("see [the board](/operations) for more");
    const a = c.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("/operations");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noreferrer");
    expect(a.textContent).toBe("the board");
  });

  it("leaves an unmatched marker as literal text instead of eating the rest of the line", () => {
    expect(md("a ** dangling and the rest").textContent).toContain("a ** dangling and the rest");
    expect(md("`unclosed code").textContent).toContain("`unclosed code");
  });

  it("does not treat text inside inline code as markup", () => {
    const c = md("`**not bold**`");
    expect(c.querySelector("strong")).toBeNull();
    expect(c.querySelector("code")!.textContent).toBe("**not bold**");
  });
});

describe("fenced code blocks", () => {
  it("keeps the code verbatim, newlines and markdown characters included", () => {
    const c = md("```\nline 1\n# not a heading\n```");
    const pre = c.querySelector("pre")!;
    expect(pre.textContent).toBe("line 1\n# not a heading");
    expect(c.querySelector("h1")).toBeNull();
  });

  it("colours comments, strings, numbers and keywords differently", () => {
    const c = md('```js\nconst x = "s"; // note\nlet n = 42\n```');
    const colours = Array.from(c.querySelectorAll("pre span")).map((s) => (s as HTMLElement).style.color);
    expect(new Set(colours).size).toBeGreaterThanOrEqual(3);
  });

  it("greys # comments only for hash-comment languages, so a JS #private field stays plain", () => {
    const py = md("```python\n# a comment\n```");
    expect(py.querySelectorAll("pre span").length).toBeGreaterThan(0);
    const js = md("```js\n#privateField\n```");
    const greyed = Array.from(js.querySelectorAll("pre span")).map((s) => s.textContent);
    expect(greyed.join("")).not.toContain("#privateField");
  });

  it("renders an unterminated fence as a code block rather than losing the text", () => {
    expect(md("```\nstill code").querySelector("pre")!.textContent).toBe("still code");
  });

  it("keeps an empty fence from collapsing the layout", () => {
    expect(md("```\n```").querySelector("pre")).toBeTruthy();
  });
});

describe("GFM tables", () => {
  const TABLE = "| axis | score |\n| --- | ---: |\n| cohesion | 81 |\n| coupling | 40 |";

  it("renders header cells and body rows", () => {
    const c = md(TABLE);
    expect(Array.from(c.querySelectorAll("th")).map((t) => t.textContent)).toEqual(["axis", "score"]);
    expect(c.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(c.querySelectorAll("tbody tr")[0].textContent).toContain("cohesion");
  });

  it("formats inline markup inside cells", () => {
    const c = md("| a | b |\n| --- | --- |\n| **bold** | `code` |");
    expect(c.querySelector("td strong")!.textContent).toBe("bold");
    expect(c.querySelector("td code")!.textContent).toBe("code");
  });

  it("ends the table at the first non-table line", () => {
    const c = md(TABLE + "\n\nafter the table");
    expect(c.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(c.querySelector("p")!.textContent).toBe("after the table");
  });

  it("does not mistake a pipe in prose for a table", () => {
    const c = md("this | that\nand more");
    expect(c.querySelector("table")).toBeNull();
  });

  it("lets a wide table scroll instead of stretching the panel", () => {
    const c = md(TABLE);
    expect((c.querySelector("table")!.parentElement as HTMLElement).style.overflowX).toBe("auto");
  });
});

describe("rules and compact mode", () => {
  it("renders --- and ___ as a horizontal rule", () => {
    expect(md("a\n\n---\n\nb").querySelector("hr")).toBeTruthy();
    expect(md("a\n\n___\n\nb").querySelector("hr")).toBeTruthy();
  });

  it("compact mode shrinks the type without changing the content", () => {
    const normal = render(<Markdown text="# T\n\nbody" />).container;
    const compact = render(<Markdown text="# T\n\nbody" compact />).container;
    const size = (c: Element) => parseFloat((c.firstChild as HTMLElement).style.fontSize);
    expect(size(compact)).toBeLessThan(size(normal));
    expect(compact.textContent).toBe(normal.textContent);
  });
});

describe("a realistic substrate document", () => {
  it("renders every construct in one pass", () => {
    render(<Markdown text={[
      "# Code Review — a.ts",
      "",
      "**Health 72 / 100** · 1 finding",
      "",
      "## Health by axis",
      "",
      "| axis | score |",
      "| --- | ---: |",
      "| cohesion | 81 |",
      "",
      "### Findings",
      "",
      "- split `doThing()` — see [the law](/laws)",
      "",
      "```ts",
      "const after = 1;",
      "```",
      "",
      "---",
    ].join("\n")} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Code Review");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("listitem").textContent).toContain("split");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/laws");
    expect(screen.getByText("const", { exact: false })).toBeTruthy();
  });
});

describe("Markdown — headings deeper than three", () => {
  it("renders #### … ###### as a quiet h4 instead of literal hashes (a worker's report used #### File Paths)", () => {
    const c = md("#### File Paths\n\n`src/App.tsx`\n\n###### Deep\nbody");
    expect(c.querySelectorAll("h4").length).toBe(2);
    expect(c.textContent).not.toContain("####");
    expect(c.textContent).toContain("File Paths");
  });
});

