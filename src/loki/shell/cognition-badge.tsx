import React from "react";

export type CognitionKind = "script" | "narrow" | "broad";

const KIND_META: Record<CognitionKind, { color: string; label: string; tip: string }> = {
  script: { color: "oklch(0.78 0.16 145)", label: "script",     tip: "Deterministic script · zero LLM tokens · ~ms" },
  narrow: { color: "oklch(0.84 0.13 200)", label: "narrow-AI",  tip: "Small tuned model · cheap · single-purpose" },
  broad:  { color: "oklch(0.78 0.16 295)", label: "broad-AI",   tip: "Frontier model · generalist · expensive" },
};

export function CognitionBadge({
  kind, detail, cost, latency, compact = false,
}: {
  kind: CognitionKind;
  detail?: string;     // e.g. "warden-eval-ac" or "llama-3.2-3b"
  cost?: number;       // usd
  latency?: string;    // "0.002s" / "12s"
  compact?: boolean;
}) {
  const m = KIND_META[kind];
  const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
  return (
    <span
      title={`${m.tip}${detail ? ` · ${detail}` : ""}${cost != null ? ` · $${cost.toFixed(4)}` : ""}${latency ? ` · ${latency}` : ""}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontFamily: mono, fontSize: compact ? 9.5 : 10,
        padding: compact ? "1px 6px" : "2px 7px",
        borderRadius: 3,
        background: `color-mix(in oklab, ${m.color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${m.color} 40%, transparent)`,
        color: m.color, lineHeight: 1.4, whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 3, background: m.color }} />
      <span style={{ fontWeight: 600 }}>{m.label}</span>
      {detail && !compact && <span style={{ opacity: 0.75 }}>· {detail}</span>}
      {cost != null && !compact && <span style={{ opacity: 0.6 }}>· ${cost.toFixed(3)}</span>}
      {latency && !compact && <span style={{ opacity: 0.6 }}>· {latency}</span>}
    </span>
  );
}
