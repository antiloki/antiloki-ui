import { describe, it, expect } from "vitest";
import { shortModel } from "./model-name";
describe("shortModel", () => { it("is the first letter and the version", () => { expect(shortModel("Haiku 5.5")).toBe("H5.5"); expect(shortModel("Opus 5-5")).toBe("O5.5"); expect(shortModel("")).toBe("model"); }); it("keeps a local model's own tag", () => { expect(shortModel("gemma4:e4b · local")).toBe("gemma4:e4b"); expect(shortModel("lfm3:1.7b")).toBe("lfm3:1.7b"); }); });
