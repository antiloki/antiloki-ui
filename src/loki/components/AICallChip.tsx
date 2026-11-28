import React from "react";
import { useShell } from "@/loki/shell/slug-context";
import { CognitionBadge, type CognitionKind } from "@/loki/shell/cognition-badge";

const TIER_MAP: Record<string, CognitionKind> = { low: "script", mid: "narrow", high: "broad" };

export function AICallChip({ id, tier, model, cost, durationMs }: {
  id: number;
  tier: "low" | "mid" | "high";
  model?: string;
  cost?: number;
  durationMs?: number;
}) {
  const { setAiCallId } = useShell();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setAiCallId(id); }}
      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      title={`View AI call #${id}`}
    >
      <CognitionBadge
        kind={TIER_MAP[tier] || "narrow"}
        detail={model}
        cost={cost}
        latency={durationMs != null ? `${(durationMs / 1000).toFixed(2)}s` : undefined}
        compact
      />
    </button>
  );
}
