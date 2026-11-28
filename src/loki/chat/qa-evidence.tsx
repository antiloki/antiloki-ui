// WHAT THE QA LOOKED AT (visual QA, 2026-09-30). When a run changed something you can see, the QA gate had deterministic tools take screenshots of the app (and of the version
// before the change); this strip shows the same pictures to the operator, so "QA passed" can be checked with the eyes. Nothing here decides anything: it lists what the serve
// kept in the run's evidence folder (GET /api/v1/cockpit/goals/evidence) and renders nothing at all when the run has no pictures.
import React from "react";
import { useQaExpanded, latestQaRun } from "./qa-focus";
const isLatestNow = (run: number) => run === latestQaRun();
import { C, mono } from "@/loki/theme";
import { apiGet, BE_URL } from "@/loki/api/client";

export type EvidenceImage = { side: "after" | "before"; file: string; name: string };
const unwrap = (r: any) => r?.result?.result ?? r?.result ?? r;

/** the URL of one picture - pure, tested */
export const evidenceUrl = (runId: number, img: Pick<EvidenceImage, "side" | "file">): string =>
  `${BE_URL}/api/v1/cockpit/goals/evidence?id=${runId}&side=${img.side}&file=${encodeURIComponent(img.file)}`;

/** pair each "after" picture with the "before" one of the same name, so the strip reads left to right: before, after */
export function pairImages(images: EvidenceImage[]): { name: string; before?: EvidenceImage; after?: EvidenceImage }[] {
  const names: string[] = [];
  for (const i of images) if (!names.includes(i.name)) names.push(i.name);
  return names.map((name) => ({ name, before: images.find((i) => i.name === name && i.side === "before"), after: images.find((i) => i.name === name && i.side === "after") }));
}

export function EvidenceStrip({ run }: { run: number }) {
  const [images, setImages] = React.useState<EvidenceImage[] | null>(null);
  React.useEffect(() => {
    let alive = true;
    void apiGet<any>(`/api/v1/cockpit/goals/evidence?id=${run}`).then((r) => { if (alive) setImages((unwrap(r)?.images ?? []) as EvidenceImage[]); }).catch(() => { if (alive) setImages([]); });
    return () => { alive = false; };
  }, [run]);
  // THE SAME RULE AS THE FILM: only the newest QA is open, an older run's pictures are one line until clicked
  const { expanded, toggle } = useQaExpanded(run, !!images && images.length > 0);
  if (!images || images.length === 0) return null;
  if (!expanded) return (
    <button data-testid="story-evidence-collapsed" onClick={toggle} title="show what the QA looked at"
      style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", fontFamily: mono, fontSize: 9.5, color: C.muted, width: "fit-content" }}>
      <span>👁 what the QA looked at · {images.filter((i) => i.side === "after").length} picture(s)</span><span style={{ color: C.brand }}>▸ show</span>
    </button>
  );
  const pairs = pairImages(images);
  const thumb = (img: EvidenceImage, label: string) => (
    <a key={img.side + img.file} href={evidenceUrl(run, img)} target="_blank" rel="noreferrer" data-testid={`evidence-${img.side}`} title={`${label} - open full size`}
      style={{ display: "flex", flexDirection: "column", gap: 2, textDecoration: "none" }}>
      <img src={evidenceUrl(run, img)} alt={`${label}: ${img.name}`} loading="lazy" style={{ width: 168, height: 105, objectFit: "cover", objectPosition: "top left", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg }} />
      <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 0.8, textTransform: "uppercase", color: img.side === "before" ? C.dim : C.muted }}>{label}</span>
    </a>
  );
  return (
    <div data-testid="story-evidence" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: mono, fontSize: 9.5, color: C.muted, display: "flex", gap: 8 }}>👁 what the QA looked at - pictures taken by a tool, not by a model
        {!isLatestNow(run) && <button data-testid="story-evidence-collapse" onClick={toggle} style={{ fontFamily: mono, fontSize: 9, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", padding: "0 6px" }}>▾ collapse</button>}</span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {pairs.map((p) => (
          <div key={p.name} data-testid="evidence-pair" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            {p.before && thumb(p.before, `before · ${p.name}`)}
            {p.after && thumb(p.after, `${p.before ? "after" : "now"} · ${p.name}`)}
          </div>
        ))}
      </div>
    </div>
  );
}
