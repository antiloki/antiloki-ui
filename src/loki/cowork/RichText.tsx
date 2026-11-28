// A DESCRIPTION, A COMMENT OR A DOCUMENT OF LINEAR, WITH ITS PICTURES AND VIDEOS (the operator 2026-11-20: "linear videos and images are not shown on our pane"): the text as a document, each embedded picture or video drawn where it stands.
// Uploads come through the serve (assetUrl), which holds the person's connection; a click on a picture opens it in the glass window.
import * as React from "react";
import { C } from "@/loki/theme";
import { BE_URL } from "@/loki/api/client";
import { Markdown } from "@/loki/components/Markdown";
import { GlassView } from "@/loki/team/GlassView";
import { assetUrl, splitRich, type RichBlock } from "./linear";

function Picture({ b }: { b: { src: string; title: string } }) {
  const [big, setBig] = React.useState(false); const [bad, setBad] = React.useState(false); const src = assetUrl(b.src, BE_URL);
  if (bad) return <div data-testid="rich-image-failed" style={{ color: C.muted, fontSize: 12 }}>picture could not be loaded{b.title ? `: ${b.title}` : ""}</div>;
  return (<>
    <img data-testid="rich-image" alt={b.title || "image"} src={src} loading="lazy" onError={() => setBad(true)} onClick={() => setBig(true)} style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 8, cursor: "zoom-in", alignSelf: "flex-start", background: "rgba(255,255,255,.04)" }} />
    {big && <GlassView title={b.title || "Image"} onClose={() => setBig(false)}><img alt={b.title || "image"} src={src} style={{ margin: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></GlassView>}
  </>);
}
export function RichText({ text, compact = false }: { text: string; compact?: boolean }) {
  const blocks = React.useMemo(() => splitRich(text), [text]);
  return (
    <div data-testid="rich-text" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      {blocks.map((b, i) => b.kind === "md" ? <Markdown key={i} text={b.text} compact={compact} />
        : b.kind === "image" ? <Picture key={i} b={b} />
        : b.kind === "video" ? <figure key={i} style={{ margin: 0 }}><video data-testid="rich-video" controls preload="metadata" playsInline src={assetUrl(b.src, BE_URL)} style={{ maxWidth: "100%", maxHeight: 460, borderRadius: 8, background: "#000" }} />{b.title && <figcaption style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{b.title}</figcaption>}</figure>
        : <a key={i} data-testid="rich-file" href={assetUrl(b.src, BE_URL)} target="_blank" rel="noreferrer" style={{ color: C.fg, fontSize: 13, textDecoration: "underline" }}>{b.title || "attachment"}</a>)}
    </div>
  );
}
