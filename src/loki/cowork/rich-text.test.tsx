// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as React from "react";
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be" }));
import { assetUrl, splitRich } from "./linear";
import { RichText } from "./RichText";

const VIDEO = '<linear-embed node-type="video">{"uploadState":"finished","uploadId":"upload-1","src":"https://uploads.linear.app/fe63/a044/98d7","title":"LinearH264Version_1.mp4","size":75734656,"controls":true,"height":2160,"width":3840,"metadataId":null,"mimetype":null}</linear-embed>';
const IMAGE = '<linear-image>{"type":"image","attrs":{"src":"https://uploads.linear.app/fe63/c2ea/c92d","title":"connect-your-tools.png","width":2880,"height":1768,"displayWidth":534}}</linear-image>';
describe("pictures and videos in Linear's text", () => {
  afterEach(() => cleanup());
  it("splits the text from the embedded video, picture and markdown image, in their order", () => {
    const b = splitRich(`Intro\n\n${IMAGE}\n\nMiddle\n\n${VIDEO}\n\n![shot](https://example.com/a.png)\n\nEnd`);
    expect(b.map((x) => x.kind)).toEqual(["md", "image", "md", "video", "image", "md"]);
    expect(b[1]).toMatchObject({ src: "https://uploads.linear.app/fe63/c2ea/c92d", title: "connect-your-tools.png", w: 2880, h: 1768 }); expect(b[3]).toMatchObject({ title: "LinearH264Version_1.mp4", w: 3840, h: 2160 });
    expect(splitRich("<linear-embed node-type=\"video\">{not json}</linear-embed> plain")).toEqual([{ kind: "md", text: "<linear-embed node-type=\"video\">{not json}</linear-embed> plain" }]);
    expect(splitRich(`<linear-embed node-type="file">{"src":"https://uploads.linear.app/x/y","title":"spec.pdf"}</linear-embed>`)[0]).toMatchObject({ kind: "file", title: "spec.pdf" }); expect(splitRich("")).toEqual([]);
  });
  it("sends Linear's uploads through the serve and leaves other addresses alone", () => {
    expect(assetUrl("https://uploads.linear.app/a/b", "http://be")).toBe("http://be/api/v1/webapps/asset?app=linear&url=https%3A%2F%2Fuploads.linear.app%2Fa%2Fb"); expect(assetUrl("https://example.com/a.png", "http://be")).toBe("https://example.com/a.png"); expect(assetUrl("nonsense", "http://be")).toBe("nonsense");
  });
  it("draws the video with controls and the picture, both from the serve, and opens a picture in the glass window", () => {
    render(<RichText text={`Hello\n\n${IMAGE}\n\n${VIDEO}`} />);
    const v = screen.getByTestId("rich-video") as HTMLVideoElement; expect(v.getAttribute("src")).toContain("http://be/api/v1/webapps/asset?app=linear&url="); expect(v.hasAttribute("controls")).toBe(true); expect(screen.getByText("LinearH264Version_1.mp4")).toBeTruthy();
    const img = screen.getByTestId("rich-image") as HTMLImageElement; expect(img.getAttribute("src")).toContain("/api/v1/webapps/asset?app=linear"); fireEvent.click(img); expect(screen.getByTestId("glass-view")).toBeTruthy();
    fireEvent.error(img); expect(screen.getByTestId("rich-image-failed")).toBeTruthy();
  });
});
