// A dispatcher over messy AI payloads: whichever shape the artefact turns out to have (quiz,
// mindmap, diagram, slides, timeline, table), it renders that — and anything it cannot parse falls
// back to HONEST PROSE rather than an empty box. The precedence between shapes matters (a payload
// can carry several) and the fallback must survive a payload that throws mid-parse.
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArtifactView, TimelineSketch, QAcard } from "./artifact-view";

const item = (over: any = {}) => ({ kind: "artifact", body_md: "just some prose", meta: {}, ...over });
const view = (over: any = {}) => render(<ArtifactView item={item(over)} />).container;

describe("the honest fallback", () => {
  it("renders prose when nothing structured is there", () => {
    const c = view({ body_md: "a paragraph\nand another" });
    expect(c.querySelector("pre")!.textContent).toBe("a paragraph\nand another");
  });

  it("renders an empty artefact without throwing", () => {
    expect(() => render(<ArtifactView item={{}} />)).not.toThrow();
    expect(() => render(<ArtifactView item={null} />)).not.toThrow();
  });

  it("falls back to prose when a structured payload throws mid-parse", () => {
    const hostile = { get length() { throw new Error("boom"); } };
    const c = render(<ArtifactView item={item({ body_md: "the prose", meta: { quiz: hostile } })} />).container;
    expect(c.querySelector("pre")!.textContent).toBe("the prose");
  });
});

describe("a quiz", () => {
  it("renders one card per question, capped at ten", () => {
    view({ meta: { quiz: Array.from({ length: 12 }, (_, i) => ({ q: `question ${i}`, a: `answer ${i}` })) } });
    expect(screen.getAllByRole("button")).toHaveLength(10);
  });

  it("hides the answer until the card is clicked", () => {
    view({ meta: { quiz: [{ q: "why?", a: "because" }] } });
    expect(screen.getByText("click to reveal")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("because")).toBeTruthy();
  });

  it("accepts both field spellings, and a bare string question", () => {
    view({ meta: { quiz: [{ question: "long form?", answer: "yes" }, "bare question"] } });
    expect(screen.getByText(/long form\?/)).toBeTruthy();
    expect(screen.getByText(/bare question/)).toBeTruthy();
  });

  it("shows no reveal affordance for a question with no answer", () => {
    view({ meta: { quiz: [{ q: "open question" }] } });
    expect(screen.queryByText("click to reveal")).toBeNull();
  });
});

describe("a mindmap", () => {
  it("draws the centre and one branch per child, capped at eight", () => {
    const c = view({ meta: { mindmap: { label: "the map", children: Array.from({ length: 10 }, (_, i) => ({ label: `branch ${i}` })) } } });
    expect(screen.getByText("the map")).toBeTruthy();
    expect(c.querySelectorAll("ellipse")).toHaveLength(9);   // 8 branches + the centre
  });

  it("counts a branch's own children rather than drawing them", () => {
    view({ meta: { mindmap: { label: "root", children: [{ label: "big", children: [1, 2, 3] }] } } });
    expect(screen.getByText("+3")).toBeTruthy();
  });

  it("names the centre even when the payload used a different field", () => {
    view({ meta: { mindmap: { name: "named root", children: [{ title: "kid" }] } } });
    expect(screen.getByText("named root")).toBeTruthy();
    expect(screen.getByText("kid")).toBeTruthy();
  });

  it("falls through to prose when the map has no branches", () => {
    const c = view({ body_md: "prose instead", meta: { mindmap: { label: "lonely", children: [] } } });
    expect(c.querySelector("pre")!.textContent).toBe("prose instead");
  });
});

describe("a diagram", () => {
  it("draws each node and only the edges whose ends exist", () => {
    const c = view({ meta: { diagrams: [{
      nodes: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }],
      edges: [{ from: "a", to: "b" }, { from: "a", to: "ghost" }],
    }] } });
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(c.querySelectorAll("rect")).toHaveLength(2);
    expect(c.querySelectorAll("path")).toHaveLength(1);
  });

  it("accepts source/target as well as from/to", () => {
    const c = view({ meta: { diagrams: [{ nodes: [{ id: "a" }, { id: "b" }], edges: [{ source: "a", target: "b" }] }] } });
    expect(c.querySelectorAll("path")).toHaveLength(1);
  });

  it("falls through when the diagram has no nodes", () => {
    const c = view({ body_md: "prose", meta: { diagrams: [{ nodes: [], edges: [] }] } });
    expect(c.querySelector("pre")).toBeTruthy();
  });
});

describe("slides", () => {
  it("splits on the slide rule, numbering each and taking its first line as the title", () => {
    view({ body_md: "# One\n- point a\n- point b\n---\n# Two\n- point c" });
    expect(screen.getByText("slide 1")).toBeTruthy();
    expect(screen.getByText("One")).toBeTruthy();
    expect(screen.getByText("– point a")).toBeTruthy();
    expect(screen.getByText("Two")).toBeTruthy();
  });

  it("needs more than one slide to be a deck", () => {
    const c = view({ kind: "slides", body_md: "# Only one" });
    expect(c.querySelector("pre")).toBeTruthy();
  });

  it("caps a runaway deck at ten slides", () => {
    view({ body_md: Array.from({ length: 14 }, (_, i) => `# S${i}`).join("\n---\n") });
    expect(screen.getAllByText(/^slide \d+$/)).toHaveLength(10);
  });
});

describe("a timeline", () => {
  it("parses dated bullets into events", () => {
    view({ kind: "timeline", body_md: "- May 2026 — the first thing\n- June 2026 — the second" });
    expect(screen.getByText("the first thing")).toBeTruthy();
    expect(screen.getByText("May 2026")).toBeTruthy();
    expect(screen.getByText("the second")).toBeTruthy();
  });

  it("splits a FULL ISO date at the second hyphen", () => {
    // Characterisation: the date group stops at the first `-` after the year, so "2026-05-01 — x"
    // reads as date "2026-05" and label "01 — x". Cosmetic (nothing is lost), but this is where a
    // stricter date pattern would be pinned if it ever matters.
    view({ kind: "timeline", body_md: "- 2026-05-01 — the thing" });
    expect(screen.getByText("2026-05")).toBeTruthy();
    expect(screen.getByText(/^01 — the thing$/)).toBeTruthy();
  });

  it("keeps an undated bullet as a label", () => {
    view({ kind: "timeline", body_md: "- just an event" });
    expect(screen.getByText("just an event")).toBeTruthy();
  });

  it("falls through to prose when there are no bullets to parse", () => {
    const c = view({ kind: "timeline", body_md: "no bullets here" });
    expect(c.querySelector("pre")).toBeTruthy();
  });
});

describe("a table", () => {
  it("renders the header and body, dropping the markdown separator row", () => {
    view({ body_md: "| axis | score |\n| --- | --- |\n| cohesion | 81 |\n| coupling | 40 |" });
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["axis", "score"]);
    expect(screen.getAllByRole("row")).toHaveLength(3);      // header + two body rows
  });

  it("needs at least a header and one row", () => {
    const c = view({ kind: "table", body_md: "| only a header |\n| --- |" });
    expect(c.querySelector("pre")).toBeTruthy();
  });

  it("lets it scroll rather than stretching the page", () => {
    const c = view({ body_md: "| a | b |\n| --- | --- |\n| 1 | 2 |" });
    expect((c.querySelector("table")!.parentElement as HTMLElement).style.overflowX).toBe("auto");
  });
});

describe("TimelineSketch, standalone", () => {
  it("renders nothing without events", () => {
    expect(render(<TimelineSketch events={[]} />).container).toBeEmptyDOMElement();
  });

  it("caps at nine events", () => {
    const { container } = render(<TimelineSketch events={Array.from({ length: 12 }, (_, i) => ({ label: `e${i}` }))} />);
    expect(container.querySelectorAll("circle")).toHaveLength(9);
  });

  it("truncates a long label rather than overrunning the sketch", () => {
    render(<TimelineSketch events={[{ label: "x".repeat(40) }]} />);
    expect(screen.getByText(/^x+$/).textContent!.length).toBe(22);
  });
});

describe("QAcard, standalone", () => {
  it("toggles the answer back and forth", () => {
    render(<QAcard q="q?" a="the answer" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("the answer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("click to reveal")).toBeTruthy();
  });
});
