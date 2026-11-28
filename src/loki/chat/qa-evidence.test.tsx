// The evidence strip lists what the serve kept and renders NOTHING when there is nothing (a backend run shows no empty box).
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be.test", apiGet: vi.fn() }));
import { apiGet } from "@/loki/api/client";
import { EvidenceStrip, evidenceUrl, pairImages, type EvidenceImage } from "./qa-evidence";

const img = (side: "after" | "before", file: string, name: string): EvidenceImage => ({ side, file, name });

describe("the QA's pictures", () => {
  it("builds the URL of one picture from the run, the side and the file", () => {
    expect(evidenceUrl(7, img("after", "01-page.png", "page"))).toBe("http://be.test/api/v1/cockpit/goals/evidence?id=7&side=after&file=01-page.png");
    expect(evidenceUrl(7, img("before", "a b.png", "x"))).toContain("file=a%20b.png");
  });

  it("puts the picture from before the change next to the one after it, by name", () => {
    const p = pairImages([img("after", "01-home.png", "home"), img("after", "02-cart.png", "cart"), img("before", "01-home.png", "home")]);
    expect(p.map((x) => [x.name, !!x.before, !!x.after])).toEqual([["home", true, true], ["cart", false, true]]);
  });

  it("shows the pictures with what they are, and links each to its full size", async () => {
    (apiGet as any).mockResolvedValueOnce({ ok: true, images: [img("after", "01-home.png", "home"), img("before", "01-home.png", "home")] });
    render(<EvidenceStrip run={3} />);
    await waitFor(() => expect(screen.getByTestId("story-evidence")).toBeTruthy());
    expect(screen.getAllByTestId("evidence-pair")).toHaveLength(1);
    expect(screen.getByTestId("evidence-before").getAttribute("href")).toContain("side=before");
    expect(screen.getByTestId("evidence-after").getAttribute("href")).toContain("side=after");
    expect(screen.getByAltText("after · home: home")).toBeTruthy();
  });

  it("draws nothing for a run with no pictures, and nothing when the door fails - the strip that WAS there goes away (an empty container proves nothing: it is empty before the call too)", async () => {
    (apiGet as any).mockResolvedValueOnce({ ok: true, images: [img("after", "01-home.png", "home")] });
    const a = render(<EvidenceStrip run={3} />);
    await waitFor(() => expect(a.container.querySelector('[data-testid^="story-evidence"]')).not.toBeNull());
    (apiGet as any).mockResolvedValueOnce({ ok: true, images: [] });                       // run 4: the QA kept nothing
    a.rerender(<EvidenceStrip run={4} />);
    await waitFor(() => expect(a.container.querySelector('[data-testid^="story-evidence"]')).toBeNull());
    expect(a.container.innerHTML).toBe("");
    (apiGet as any).mockResolvedValueOnce({ ok: true, images: [img("after", "01-home.png", "home")] });
    a.rerender(<EvidenceStrip run={5} />);
    await waitFor(() => expect(a.container.querySelector('[data-testid^="story-evidence"]')).not.toBeNull());
    (apiGet as any).mockRejectedValueOnce(new Error("down"));                              // run 6: the door fails
    a.rerender(<EvidenceStrip run={6} />);
    await waitFor(() => expect(a.container.querySelector('[data-testid^="story-evidence"]')).toBeNull());
    expect(a.container.innerHTML).toBe("");
  });
});
