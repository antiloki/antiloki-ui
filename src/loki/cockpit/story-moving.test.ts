import { describe, it, expect } from "vitest";
import { storyIsMoving } from "./agent-chat-pane";

describe("a story keeps being read while QA is still judging", () => {
  it("is moving until the run is over AND QA is not pending", () => {
    expect(storyIsMoving(null)).toBe(true);                                                  // nothing read yet
    expect(storyIsMoving({ status: "running" })).toBe(true);
    expect(storyIsMoving({ status: "done", qa: { pending: true } })).toBe(true);             // the work is done, QA is not: the card said "QA judging" for ever
    expect(storyIsMoving({ status: "done", qa: { pending: false } })).toBe(false);
    expect(storyIsMoving({ status: "done" })).toBe(false);                                   // an older serve without a qa block
    expect(storyIsMoving({ status: "failed", qa: null })).toBe(false);
    expect(storyIsMoving({ status: "cancelled", qa: { pending: false } })).toBe(false);
  });
});
