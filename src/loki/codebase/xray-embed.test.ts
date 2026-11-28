// The page an X-ray pane frames: what its address says, which space that names, and how a pane's view becomes an address and survives a reload.
import { describe, expect, it } from "vitest";
import { readEmbedQuery, spaceRoot } from "./xray-embed";
import { embedUrl } from "@/loki/cowork/XrayViewPane";
import { parseCommand } from "@/loki/cowork/commands";
import { parseLayout } from "@/loki/cowork/layout";

const list = [{ name: "alpha", root_path: "/p/alpha", is_active: 1 }, { name: "Beta", root_path: "/p/beta", is_active: 0 }];

describe("the embed page's address", () => {
  it("is read into a view, a space, a path inside it and the few options", () => {
    expect(readEmbedQuery("?view=ast&space=beta&path=%2Fsrc%2Fa.ts%2F&symbol=go&depth=3")).toEqual({ view: "ast", space: "beta", path: "src/a.ts", symbol: "go", depth: 3, source: "", bare: false });
    expect(readEmbedQuery("")).toEqual({ view: "", space: "", path: "", symbol: "", depth: 0, source: "", bare: false });
    expect(readEmbedQuery("?bare=1&view=docs").bare).toBe(true);   // framed by the Editor view: no X-ray chrome
    expect(readEmbedQuery("?path=a%5Cb%5Cc.ts").path).toBe("a/b/c.ts");
    expect(readEmbedQuery("?depth=-2").depth).toBe(0);
  });
  it("names the space whose requests it makes: none for the open one, the root for another, and says when there is no such space", () => {
    expect(spaceRoot(list, "")).toEqual({ root: null, found: true });
    expect(spaceRoot(list, "alpha")).toEqual({ root: null, found: true });          // the open one needs no header
    expect(spaceRoot(list, "beta")).toEqual({ root: "/p/beta", found: true });      // any case
    expect(spaceRoot(list, "/p/beta/")).toEqual({ root: "/p/beta", found: true });
    expect(spaceRoot(list, "ghost")).toEqual({ root: null, found: false });
  });
});

describe("an X-ray pane", () => {
  it("frames the address of its view", () => {
    expect(embedUrl({ view: "system-diagram", space: "beta", depth: 2 })).toBe("/embed/xray?view=system-diagram&space=beta&depth=2");
    expect(embedUrl({ view: "file", path: "src/a b.ts" })).toBe("/embed/xray?view=file&path=src%2Fa+b.ts");
  });
  it("is made from the serve's open command, only for the xray-view tool", () => {
    const c: any = parseCommand({ id: 7, op: "open", args: { kind: "studio", tool: "xray-view", view: "ast", space: "beta", path: "src/a.ts", symbol: "go", side: "below", title: "AST" } });
    expect(c).toMatchObject({ id: 7, op: "open", kind: "studio", tool: "xray-view", side: "below", xray: { view: "ast", space: "beta", path: "src/a.ts", symbol: "go" } });
    expect(parseCommand({ id: 8, op: "open", args: { kind: "studio", tool: "notes", view: "ast" } })).not.toHaveProperty("xray");
    expect(parseCommand({ id: 9, op: "open", args: { kind: "studio", tool: "xray-view" } })).not.toHaveProperty("xray");   // no view, nothing to show
  });
  it("survives a reload of the layout, and drops what is not a view", () => {
    const pane = { id: "xray-7", kind: "tool", tool: "xray-view", title: "AST", xray: { view: "ast", space: "beta", path: "src/a.ts", depth: 2, junk: 1 } };
    const l = parseLayout({ root: { type: "leaf", pane }, focus: "xray-7", zoom: null }) as any;
    expect(l.root.pane.xray).toEqual({ view: "ast", space: "beta", path: "src/a.ts", symbol: undefined, source: undefined, depth: 2 });
    const bad = parseLayout({ root: { type: "leaf", pane: { ...pane, xray: { path: "x" } } }, focus: null, zoom: null }) as any;
    expect(bad.root.pane.xray).toBeUndefined();
  });
});
