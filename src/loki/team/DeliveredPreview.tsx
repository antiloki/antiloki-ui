// WHAT A RUN DELIVERED, TO WATCH (the operator 2026-11-18: "the deliver node has no video and should show a preview of the new artefact video"): the deliver node shows the run's video, else the page a team drew as its video (a composition under `video/`, shown in a sandbox), else a picture;
// and when the run made none of them it says so, so an empty node is never a mystery.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { listMedia, mediaUrl, type Media } from "./api";

const RANK: Record<string, number> = { video: 0, page: 1, image: 2, audio: 3 };
/** The file to preview first: a video, then a composition page, then a picture, then a sound. Pure. */
export function previewOf(media: Media[]): Media | null { return [...media].filter((m) => m.kind in RANK).sort((a, b) => RANK[a.kind] - RANK[b.kind])[0] ?? null; }
export function DeliveredPreview({ run }: { run: string }) {
  const [media, setMedia] = React.useState<Media[] | null>(null);
  React.useEffect(() => { let stop = false; void listMedia(run).then((m) => { if (!stop) setMedia(m); }); return () => { stop = true; }; }, [run]);
  if (media === null) return <span style={{ color: C.muted, fontSize: 12.5 }}>looking for what the run made…</span>;
  const m = previewOf(media); if (!m) return <div data-testid="delivered-none" style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.5 }}>This run left no video, picture or page to watch. If the team was asked for a video, its director may have written a script or a page and never rendered a file.</div>;
  const u = mediaUrl(run, m.file);
  return (
    <div data-testid="delivered-preview" data-kind={m.kind} style={{ display: "grid", gap: 8, fontFamily: nav }}>
      {m.kind === "video" ? <video data-testid="delivered-video" controls preload="metadata" src={u} style={{ width: "100%", maxHeight: 320, background: "#000", borderRadius: 12 }} />
        : m.kind === "page" ? <iframe data-testid="delivered-page" title={m.name} sandbox="allow-scripts" src={u} style={{ width: "100%", aspectRatio: "16 / 9", border: `1px solid ${C.border}`, borderRadius: 12, background: "#000" }} />
        : m.kind === "audio" ? <audio data-testid="delivered-audio" controls src={u} style={{ width: "100%" }} />
        : <img data-testid="delivered-image" alt={m.name} src={u} style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 12 }} />}
      <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>{m.name} · {(m.bytes / 1024).toFixed(0)} KB{m.kind === "page" ? " · the team's video as a page: it was not rendered to a video file" : ""} · kept with the run</span>
    </div>
  );
}
