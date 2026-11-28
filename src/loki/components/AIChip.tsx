/**
 * AIChip — small inline badge marking a field as AI-emitted, not a
 * canonical DB row value. Renders a colored "[AI]" tag with a hover
 * tooltip explaining the provenance.
 *
 * Use anywhere the FE shows text that came from an AI call (contract
 * goal_md, tl_evaluation_md, tl_briefing_md, microtask intent,
 * memory bodies, etc.) so the operator knows it's an AI claim and
 * not, e.g., the card's `status` column.
 *
 * Card: FEAT-FE-RENDERS-FROM-DB-AUDIT.
 */
import { C, mono } from "@/loki/theme";

const DEFAULT_TIP =
  "AI-emitted text. May not match the canonical DB row. Treat as an AI claim, not a verified fact.";

export function AIChip({
  source,
  title,
  variant = "inline",
}: {
  source?: string;        // e.g. "tl-contract-draft.goal_md @ v3"
  title?: string;         // optional override for the tooltip
  variant?: "inline" | "panel";
}) {
  const tip = title ?? (source ? `${DEFAULT_TIP}\n\nSource: ${source}` : DEFAULT_TIP);
  const inline = variant === "inline";
  return (
    <span
      title={tip}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: inline ? "0 5px" : "1px 6px",
        background: `color-mix(in oklab, ${C.brand} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${C.brand} 55%, transparent)`,
        borderRadius: 3,
        color: C.brand,
        fontFamily: mono,
        fontSize: inline ? 9 : 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        userSelect: "none",
        lineHeight: 1.2,
        verticalAlign: "middle",
      }}
    >
      AI
    </span>
  );
}
