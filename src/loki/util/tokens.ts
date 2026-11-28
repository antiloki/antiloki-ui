// tokens — the FE half of the shared token estimator (mirrors antiloki-core skills/system/tokens-count.mjs).
// Token counts are an ESTIMATE (~4 chars/token); BYOK means many tokenizers with no single exact count, so we
// approximate consistently and always render with a leading "~". Use for any text the FE already holds (chat
// sources, doc bodies); engine reads embed their own counts for data the FE doesn't carry (atlas files, etc.).

export const estimateTokens = (text: string | null | undefined): number => {
  const len = String(text ?? "").length;
  return len ? Math.ceil(len / 4) : 0;
};

// Compact display: 0–999 → "812", 1k+ → "1.2k", 10k+ → "34k". Prefix with "~" at the call site.
export const fmtTokens = (n: number): string => {
  const v = Math.max(0, Math.round(n || 0));
  if (v < 1000) return String(v);
  if (v < 10000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v / 1000)}k`;
};

// The canonical label, e.g. "~1.2k tok". One place so every surface reads identically.
export const tokenLabel = (text: string | null | undefined): string => `~${fmtTokens(estimateTokens(text))} tok`;
export const fmtTokenLabel = (n: number): string => `~${fmtTokens(n)} tok`;
