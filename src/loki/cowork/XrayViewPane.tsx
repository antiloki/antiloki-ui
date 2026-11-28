// ONE PART OF X-RAY, IN A PANE (operator 2026-11-10: "open a pane with exactly the part, if it is a visual one like the diagram, graphs"). It is X-ray's own widget (the same components the page draws) in a page of its own
// (`/embed/xray`), framed here: a Cowork pane may be about ANOTHER space than the one the screen has open, and the space a request is about is carried by the page that makes it, so a frame keeps it from leaking into
// this screen's own requests. The serve reads nothing here; the frame's page asks for what it draws.
import * as React from "react";
import { C } from "@/loki/theme";
import type { XrayView } from "./layout";

/** The address of the page that draws this view. Pure. */
export function embedUrl(x: XrayView, origin = ""): string {
  const q = new URLSearchParams({ view: x.view });
  for (const k of ["space", "path", "symbol", "source"] as const) if (x[k]) q.set(k, String(x[k]));
  if (x.depth) q.set("depth", String(x.depth));
  return `${origin}/embed/xray?${q.toString()}`;
}

export function XrayViewPane({ x }: { x: XrayView }) {
  return (
    <div data-testid="xray-view" data-view={x.view} data-space={x.space ?? ""} data-path={x.path ?? ""} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg }}>
      <iframe title={`X-ray ${x.view}`} data-testid="xray-view-frame" src={embedUrl(x)} style={{ flex: 1, minHeight: 0, width: "100%", border: "none", background: C.bg }} />
    </div>
  );
}
