// X-ray across spaces: which space the page opens on, the chips it offers, and that the header only travels while another space than the serve's own is chosen.
import { describe, expect, it, beforeEach } from "vitest";
import { applySpace, pickSpace, spaceChips } from "./xray-space";
import { getRequestWorkspace, setRequestWorkspace } from "@/loki/api/client";
import { siteCacheKey } from "./docs-site";
import type { Workspace } from "@/loki/api/dispatch";

const ws = (name: string, active = 0, missing = false): Workspace => ({ id: 1, name, root_path: `/p/${name}`, vcs: "git", is_active: active, db_dir: null, created_at: "", missing });
const all = [ws("alpha", 1), ws("beta"), ws("gone", 0, true)];

describe("the space X-ray opens on", () => {
  it("is the last one chosen when it is still there, else the one the serve has open", () => {
    expect(pickSpace(all, "/p/beta")).toBe("/p/beta");
    expect(pickSpace(all, "/p/gone")).toBe("/p/alpha");      // a folder that is gone is not offered
    expect(pickSpace(all, "/p/nowhere")).toBe("/p/alpha");
    expect(pickSpace(all, null)).toBe("/p/alpha");
    expect(pickSpace([ws("only")], null)).toBe("/p/only");
    expect(pickSpace([], null)).toBeNull();
  });
  it("offers one chip per existing space and marks the one Cowork has open", () => {
    expect(spaceChips(all)).toEqual([{ root: "/p/alpha", name: "alpha", open: true }, { root: "/p/beta", name: "beta", open: false }]);
  });
});

describe("the request header", () => {
  beforeEach(() => setRequestWorkspace(null));
  it("names another space while it is chosen and is gone when the serve's own is", () => {
    applySpace("/p/beta", "/p/alpha"); expect(getRequestWorkspace()).toBe("/p/beta");
    applySpace("/p/alpha", "/p/alpha"); expect(getRequestWorkspace()).toBeNull();
    applySpace(null, "/p/alpha"); expect(getRequestWorkspace()).toBeNull();
  });
  it("keeps one space's cached docs from being served for another", () => {
    setRequestWorkspace("/p/beta"); const b = siteCacheKey("atlas");
    setRequestWorkspace(null); const a = siteCacheKey("atlas");
    expect(a).not.toBe(b); expect(siteCacheKey("atlas", "/p/beta")).toBe(b);
  });
});
