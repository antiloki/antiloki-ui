import { describe, expect, it } from "vitest";
import { cleanSagaWords } from "./saga-words";
describe("saga words", () => {
  it("drops the paste markup and keeps the words", () => {
    expect(cleanSagaWords('<pasted_content id="b667">')).toBe(""); expect(cleanSagaWords('<pasted_content id="a">fix the login</pasted_content> now')).toBe("fix the login now");
    expect(cleanSagaWords("[Pasted text #1 +12 lines] add dark mode")).toBe("add dark mode"); expect(cleanSagaWords("a < b")).toBe("a < b"); expect(cleanSagaWords(null)).toBe("");
  });
});
