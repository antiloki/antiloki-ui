// Grokbot QA 2026-10-12, item 10: "the field re-parses on every keystroke, so typing `client/src/**, server/src/**` drops characters and commas".
// The parent stores the PARSED list and hands back the joined string, as every caller does - which is what stripped a trailing comma as it was typed.
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileTree } from "./cockpit-view";

function Host() {
  const [globs, setGlobs] = React.useState<string[]>(["**"]);
  return <FileTree value={globs.join(", ")} onChange={(v) => setGlobs(v.split(",").map((x) => x.trim()).filter(Boolean))} entries={[{ path: "client", dir: true }, { path: "server", dir: true }]} />;
}

describe("the scope text box", () => {
  it("keeps every character while a person types, commas and spaces included", () => {
    render(<Host />);
    const box = screen.getByPlaceholderText(/scope globs/) as HTMLInputElement;
    const target = "client/src/**, server/src/**";
    let typed = "";
    fireEvent.change(box, { target: { value: "" } });
    for (const ch of target) { typed += ch; fireEvent.change(box, { target: { value: typed } }); expect((screen.getByPlaceholderText(/scope globs/) as HTMLInputElement).value).toBe(typed); }
    expect((screen.getByPlaceholderText(/scope globs/) as HTMLInputElement).value).toBe(target);
  });
});
