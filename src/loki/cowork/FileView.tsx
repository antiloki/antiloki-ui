// ONE FILE, OPEN IN THE PANE (operator 2026-11-26: "we should be able to open a file in the pane, if is text, audio, image or video"). Read only.
import * as React from "react";
import { BE_URL } from "@/loki/api/client";
import { C, mono } from "@/loki/theme";
import { lookAtFile, type FileLook } from "./api";
import { startFileDrag } from "./file-drag";

export type Media = "image" | "audio" | "video";
const KINDS: Record<Media, RegExp> = { image: /\.(png|jpe?g|gif|webp|bmp|avif)$/i, audio: /\.(mp3|wav|ogg|oga|opus|flac|m4a|aac)$/i, video: /\.(mp4|m4v|webm|mov)$/i };
/** What the path's ending says it is, or null for anything to be read as text. The same endings the serve sends as bytes. Pure. */
export const mediaOf = (path: string): Media | null => (Object.keys(KINDS) as Media[]).find((k) => KINDS[k].test(path)) ?? null;
export const rawUrl = (path: string): string => `${BE_URL}/api/v1/files/raw?path=${encodeURIComponent(path)}`;

export function FileView({ path, size, onBack }: { path: string; size: string; onBack: () => void }) {
  const media = mediaOf(path); const [look, setLook] = React.useState<FileLook | null>(null); const [broken, setBroken] = React.useState(false); const name = path.split(/[\\/]/).pop() ?? path;
  React.useEffect(() => { setBroken(false); setLook(null); if (media) return; let on = true; void lookAtFile(path).then((r) => { if (on) setLook(r ?? { ok: false, error: "the serve did not answer" }); }); return () => { on = false; }; }, [path, media]);
  const fit: React.CSSProperties = { maxWidth: "100%", maxHeight: "100%", borderRadius: 8 };
  return (
    <div data-testid="file-view" onKeyDown={(e) => { if (e.key === "Escape") onBack(); }} style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px" }}>
        <button data-testid="file-back" autoFocus aria-label="back to the folder" onClick={onBack} style={{ background: "transparent", border: "none", color: C.fg, cursor: "pointer", fontSize: 13, padding: "2px 8px" }}>← back</button>
        <span draggable data-testid="file-name" title={`${path} (drag it to an agent)`} onDragStart={(e) => startFileDrag(e.dataTransfer, path)} style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: mono, fontSize: 11.5, cursor: "grab" }}>{name}</span>
        <span style={{ color: C.dim, fontFamily: mono, fontSize: 10.5 }}>{size}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", alignItems: media ? "center" : "stretch", justifyContent: media ? "center" : "flex-start", padding: "4px 12px 12px" }}>
        {media && broken && <div data-testid="file-broken" style={{ color: C.muted }}>this one cannot be shown here (the format, or the serve is older than this screen)</div>}
        {media === "image" && !broken && <img alt={name} src={rawUrl(path)} onError={() => setBroken(true)} style={{ ...fit, objectFit: "contain", minHeight: 0 }} />}
        {media === "audio" && !broken && <audio data-testid="file-audio" controls src={rawUrl(path)} onError={() => setBroken(true)} style={{ width: "min(100%, 520px)" }} />}
        {media === "video" && !broken && <video data-testid="file-video" controls src={rawUrl(path)} onError={() => setBroken(true)} style={{ ...fit, minHeight: 0 }} />}
        {!media && !look && <div style={{ color: C.muted }}>reading…</div>}
        {look?.kind === "text" && <pre data-testid="file-text" style={{ margin: 0, fontFamily: mono, fontSize: 11.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", userSelect: "text" }}>{look.text}{look.truncated ? "\n… (only the first 256 KB are shown)" : ""}</pre>}
        {look && (look.kind === "binary" || look.kind === "big") && <div style={{ color: C.muted }}>{look.kind === "big" ? "too big to show" : "not a text, picture, sound or video file"}</div>}
        {look?.kind === "private" && <div style={{ color: C.warn }}>{look.note}</div>}
        {look && !look.ok && <div style={{ color: "var(--c-bad)" }}>{look.error}</div>}
      </div>
    </div>);
}
