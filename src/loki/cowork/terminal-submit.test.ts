import { describe, it, expect } from "vitest";
import { splitSubmit } from "./terminal-input";

describe("a batch of keystrokes ending in Enter", () => {
  it("is split: the text first, the Enter as its own write", () => {
    expect(splitSubmit("hi\r")).toEqual({ body: "hi", submit: true });
    expect(splitSubmit("/model sonnet\r")).toEqual({ body: "/model sonnet", submit: true });
  });
  it("a lone Enter or plain text is sent as it is", () => {
    expect(splitSubmit("\r")).toEqual({ body: "\r", submit: false });
    expect(splitSubmit("hello")).toEqual({ body: "hello", submit: false });
    expect(splitSubmit("")).toEqual({ body: "", submit: false });
  });
});
