// A FREE PANE AN AGENT JUST WROTE IS A DRAFT UNTIL THE PERSON APPROVES IT (RFC 0016). The approval is a floating card at the bottom right (operator 2026-11-25: "more discreet: use the notification we already have"),
// with the pane's reach in words. A pane that reaches NO app is approved by itself after a few seconds unless the person rejects it; a pane that asks to read or change an app is never approved by the clock:
// that would give an agent-written page the person's access to Linear, GitHub or Notion without anyone looking.
export const AUTO_SECONDS = 10;
export type PaneApp = { app: string; read: string[]; write: string[] };
export type PaneDraft = { id: string; title: string; madeBy: string; notes: string; hash: string; apps: PaneApp[] };

const strs = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
/** The drafts in the serve's `list` answer: not approved, no problems (a pane with problems cannot run, so there is nothing to approve). */
export function parseDrafts(r: any): PaneDraft[] {
  const d = r?.result ?? r; if (!d || d.ok !== true || !Array.isArray(d.panes)) return [];
  return d.panes.filter((p: any) => p && typeof p.id === "string" && p.approved !== true && !(Array.isArray(p.problems) && p.problems.length) && typeof p.hash === "string").map((p: any) => ({
    id: p.id, title: typeof p.title === "string" && p.title ? p.title : p.id, madeBy: typeof p.made_by === "string" ? p.made_by : "", notes: typeof p.notes === "string" ? p.notes : "", hash: p.hash,
    apps: (Array.isArray(p.apps) ? p.apps : []).filter((a: any) => a && typeof a.app === "string").map((a: any) => ({ app: a.app, read: strs(a.read), write: strs(a.write) })),
  }));
}
/** Only a pane that reaches no app may be approved by the clock. */
export const autoApprovable = (d: PaneDraft) => d.apps.length === 0;
export const draftKey = (d: PaneDraft) => `${d.id}@${d.hash}`;
/** What approving it lets it do, in words. */
export function accessWords(d: PaneDraft): string {
  if (!d.apps.length) return "It reaches no app: it only shows its own page.";
  return d.apps.map((a) => { const parts: string[] = []; if (a.read.length) parts.push(`read ${a.app} (${a.read.slice(0, 3).join(", ")}${a.read.length > 3 ? "…" : ""})`); if (a.write.length) parts.push(`change ${a.app} (${a.write.slice(0, 3).join(", ")}${a.write.length > 3 ? "…" : ""}, each time you click)`); return parts.join(" and ") || `reach ${a.app}`; }).join("; ").replace(/^./, (c) => c.toUpperCase()) + ".";
}
