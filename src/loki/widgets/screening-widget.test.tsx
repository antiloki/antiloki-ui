// The screening widget is not a form — it's a bench of pieces you ASSEMBLE across questions into one
// thought. So multi-select must work cross-question, the operator must be able to mint a piece the
// options missed, and a superseded screen from an earlier turn must be inert (answering an old
// screen would send a thought about a question the interviewer has already moved past).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScreeningWidget } from "./screening-widget";

const onPickOption = vi.fn();
const payload = (over: any = {}) => ({
  q: {
    questions: [
      { question_md: "**What** is the scope?", options: [{ key: "a", label: "one file" }, { key: "b", label: "the whole module" }] },
      { question_md: "How urgent?", options: [{ key: "c", label: "now" }, { key: "d", label: "next sprint" }] },
    ],
  },
  ...over,
});
const mount = (p: any = payload(), ctx: any = {}) =>
  render(<ScreeningWidget payload={p} ctx={{ isLast: true, onPickOption, ...ctx }} />);

// Once a piece is selected its label also appears in the "your idea" line, so chips are queried by
// role and the idea line is read off the row that holds it.
const chip = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) });
const idea = () => screen.queryByText(/your idea:/)?.parentElement?.textContent ?? null;

beforeEach(() => onPickOption.mockReset());

describe("nothing to screen", () => {
  it("renders nothing when there are no questions", () => {
    expect(mount({ q: { questions: [] } }).container).toBeEmptyDOMElement();
    expect(mount({}).container).toBeEmptyDOMElement();
  });
});

describe("the bench of pieces", () => {
  it("shows each question as a faint label and its options as chips", () => {
    mount();
    expect(screen.getByText("What is the scope?")).toBeTruthy();   // markdown stripped
    expect(screen.getByText("one file")).toBeTruthy();
    expect(screen.getByText("next sprint")).toBeTruthy();
  });

  it("frames the task as assembling an idea, not answering a form", () => {
    mount();
    expect(screen.getByText(/pick the pieces that fit — mount your idea/)).toBeTruthy();
  });

  it("selects across questions at once — this is not one-answer-per-question", () => {
    mount();
    fireEvent.click(chip("one file"));
    fireEvent.click(chip("the whole module"));
    fireEvent.click(chip("now"));
    expect(idea()).toContain("one file · the whole module · now");
  });

  it("deselects on a second click", () => {
    mount();
    fireEvent.click(chip("one file"));
    fireEvent.click(chip("one file"));
    expect(idea()).toBeNull();
  });

  it("marks a selected chip apart from an unselected one", () => {
    mount();
    const c = chip("one file") as HTMLElement;
    const before = c.style.color;
    fireEvent.click(c);
    expect(c.style.color).not.toBe(before);
    expect(c.style.fontWeight).toBe("600");
  });
});

describe("minting your own piece", () => {
  it("adds a chip the options missed, and clears the field", () => {
    mount();
    const box = screen.getByPlaceholderText("+ add your own piece") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "  also the tests  " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(chip("also the tests")).toBeTruthy();
    expect(box.value).toBe("");
  });

  it("ignores an empty piece and refuses a duplicate", () => {
    mount();
    const box = screen.getByPlaceholderText("+ add your own piece");
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(idea()).toBeNull();

    fireEvent.change(box, { target: { value: "xyz" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "xyz" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getAllByRole("button", { name: /^xyz/ })).toHaveLength(1);
  });

  it("removes a minted piece on click", () => {
    mount();
    const box = screen.getByPlaceholderText("+ add your own piece");
    fireEvent.change(box, { target: { value: "mine" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.click(screen.getByTitle("remove"));
    expect(idea()).toBeNull();
  });
});

describe("mounting the thought", () => {
  it("stays disabled until something is picked", () => {
    mount();
    const go = screen.getByText("Mount it →") as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(go);
    expect(onPickOption).not.toHaveBeenCalled();
  });

  it("sends each question with the pieces chosen under it", () => {
    mount();
    fireEvent.click(chip("one file"));
    fireEvent.click(chip("now"));
    fireEvent.click(screen.getByText("Mount it →"));
    expect(onPickOption).toHaveBeenCalledWith("What is the scope? → one file\nHow urgent? → now");
  });

  it("appends the operator's own pieces under 'also'", () => {
    mount();
    fireEvent.click(chip("one file"));
    const box = screen.getByPlaceholderText("+ add your own piece");
    fireEvent.change(box, { target: { value: "and the docs" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.click(screen.getByText("Mount it →"));
    expect(onPickOption).toHaveBeenCalledWith("What is the scope? → one file\nalso: and the docs");
  });

  it("sends a bare list when only custom pieces were minted", () => {
    mount();
    const box = screen.getByPlaceholderText("+ add your own piece");
    fireEvent.change(box, { target: { value: "just this" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.click(screen.getByText("Mount it →"));
    expect(onPickOption).toHaveBeenCalledWith("also: just this");
  });

  it("locks immediately on send, so a slow refetch cannot let it be sent twice", () => {
    mount();
    fireEvent.click(chip("one file"));
    fireEvent.click(screen.getByText("Mount it →"));
    expect(screen.getByText("sent")).toBeTruthy();
    fireEvent.click(screen.getByText("sent"));
    expect(onPickOption).toHaveBeenCalledTimes(1);
  });

  it("refuses to change the selection once sent", () => {
    mount();
    fireEvent.click(chip("one file"));
    fireEvent.click(screen.getByText("Mount it →"));
    fireEvent.click(chip("now"));
    expect(idea()).not.toContain("now");
  });
});

describe("a superseded screen", () => {
  it("is inert, faded, and offers no way to answer", () => {
    const { container } = mount(payload(), { isLast: false });
    expect(screen.getByText(/screening · mounted/)).toBeTruthy();
    expect(screen.queryByText("Mount it →")).toBeNull();
    expect(screen.queryByPlaceholderText("+ add your own piece")).toBeNull();
    expect(parseFloat((container.firstChild as HTMLElement).style.opacity)).toBeLessThan(1);

    fireEvent.click(chip("one file"));
    expect(idea()).toBeNull();
  });

  it("is also inert while the turn is confirming", () => {
    mount(payload(), { confirming: true });
    fireEvent.click(chip("one file"));
    expect(idea()).toBeNull();
  });
});
