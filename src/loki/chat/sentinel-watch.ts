// ⛨ THE SENTINEL'S LIVE WATCH — deterministic flags over the LIVE episode: $0, always on, printed
// thresholds. The close-time consolidator (episode-consolidate.mjs) mirrors these exact numbers,
// so what you saw live is what the record says. Flags render under the timeline's ● now beat AND
// ride the screen manifest, so the assistant sees them too.
export type SentinelFlag = { sev: "notice" | "warn"; text: string };

export function sentinelFlags(turns: any[]): SentinelFlag[] {
  const flags: SentinelFlag[] = [];
  const costs = (turns ?? []).map((t: any) => Number(t?.ai_cost_usd ?? 0) || 0);
  if (!costs.length) return flags;
  const total = costs.reduce((a, b) => a + b, 0);
  if (total >= 1) flags.push({ sev: "warn", text: `episode spend $${total.toFixed(2)} ≥ $1.00` });
  else if (total >= 0.25) flags.push({ sev: "notice", text: `episode spend $${total.toFixed(2)} ≥ $0.25` });
  if (costs.length >= 4) {
    const sorted = [...costs].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const last = costs[costs.length - 1] ?? 0;
    if (last >= Math.max(0.02, 3 * med)) flags.push({ sev: "notice", text: `cost spike — last turn $${last.toFixed(3)} ≥ 3× the episode median` });
  }
  if ((turns ?? []).length >= 45) flags.push({ sev: "notice", text: `${turns.length} turns — rotation lands at 60` });
  return flags;
}

// the sentinel's authored report lands AFTER rotation (background call) — this signal tells the
// timeline to re-read that one chapter. An event, not an import: no chat-thread ↔ sidebar cycle.
export const episodeReportLanded = (id: number) =>
  window.dispatchEvent(new CustomEvent("antiloki:episode-report", { detail: { id } }));
