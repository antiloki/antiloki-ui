// THE AUDIT, IN WORDS (operator 2026-09-24: "the audit tab on settings is impossible to understand. You should
// keep the complete logs of audit for AI, but display a summary in human natural language also").
//
// Nothing here is new evidence. The audit's tables are the record and they stay exactly as they are — this reads
// them out loud. The rule it follows throughout: say the number, then say what the number MEANS, and when a
// number means something is off, say that first and in the operator's language rather than the log's.
import type { PackAudit } from "./context-pack";

export type AuditPara = { key: string; tone: "ok" | "warn" | "bad" | "dim"; text: string; detail?: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const few = (xs: string[], n = 3) => xs.slice(0, n).join(", ") + (xs.length > n ? `, and ${xs.length - n} more` : "");
/** `src/orders/api.ts` → `src/orders`; a root file has no folder. Pure. */
export const folderOf = (p: string) => { const i = p.lastIndexOf("/"); return i <= 0 ? "" : p.slice(0, i); };

/** Where the work happened: the folders it wrote in, busiest first. Pure — tested. */
export function whereItWorked(files: { path: string; writes: number }[]): { folder: string; files: number }[] {
  const by = new Map<string, number>();
  for (const f of files) { if (!f.writes) continue; const k = folderOf(f.path) || "the project root"; by.set(k, (by.get(k) ?? 0) + 1); }
  return [...by.entries()].map(([folder, files]) => ({ folder, files })).sort((a, b) => b.files - a.files || a.folder.localeCompare(b.folder));
}

/** THE WHOLE AUDIT AS PARAGRAPHS, in the order a person wants them: what is wrong first, then what happened,
 *  then the proof that the record itself has not been edited. Pure — tested. */
export function auditStory(a: PackAudit | null | undefined): AuditPara[] {
  if (!a) return [{ key: "none", tone: "dim", text: "There is no audit for this agent yet — it has no box of its own to watch." }];
  const c = a.counts;
  const out: AuditPara[] = [];

  // ── what is wrong, if anything ────────────────────────────────────────────
  if (a.cross.git_only.length) {
    const n = a.cross.git_only.length;
    out.push({ key: "git_only", tone: "warn",
      text: `${plural(n, "file")} in the box changed without any tool writing to ${n === 1 ? "it" : "them"}.`,
      detail: `Something else produced ${n === 1 ? "it" : "them"} — a shell redirect, a build step, a code generator. That is not proof of anything bad, but it is the one kind of change this audit cannot account for, so it is worth a look: ${few(a.cross.git_only)}.` });
  }
  if (c.blocked) {
    out.push({ key: "blocked", tone: "warn",
      text: `${plural(c.blocked, "attempt")} to touch a file outside this agent's scope ${c.blocked === 1 ? "was" : "were"} refused.`,
      detail: "The agent asked, antiloki said no, and the file was not written. Nothing leaked out of the scope; if the agent genuinely needs one of those paths, widen the scope rather than turning the guard off." });
  }
  if (a.cross.hook_only.length) {
    out.push({ key: "hook_only", tone: "dim",
      text: `${plural(a.cross.hook_only.length, "file")} were written by a tool but show no change in git now.`,
      detail: `Written and then reverted, or written somewhere git ignores. Usually harmless: ${few(a.cross.hook_only)}.` });
  }

  // ── what it actually did ──────────────────────────────────────────────────
  const wrote = a.files.filter((f) => f.writes > 0);
  if (!c.reads && !c.writes && !c.exec) {
    out.push({ key: "idle", tone: "dim", text: "This agent has not read or changed anything yet." });
  } else {
    const where = whereItWorked(a.files);
    out.push({ key: "work", tone: "ok",
      text: wrote.length
        ? `It changed ${plural(wrote.length, "file")} and read ${plural(a.files.length - wrote.length, "other")} to do it.`
        : `It read ${plural(a.files.length, "file")} and changed nothing.`,
      detail: where.length
        ? `The work sits in ${where.slice(0, 3).map((w) => `${w.folder} (${w.files})`).join(", ")}${where.length > 3 ? `, and ${where.length - 3} other folders` : ""}.`
        : undefined });
  }
  if (c.exec) {
    out.push({ key: "exec", tone: "dim",
      text: `It ran ${plural(c.exec, "shell command")}.`,
      detail: "Every one of them is in the events tab with its exit code — that is where to look if a file changed that no tool wrote." });
  }
  if (c.search || c.tool) {
    const bits = [c.search ? plural(c.search, "search", "searches") : "", c.tool ? `${plural(c.tool, "call")} to antiloki's own tools` : ""].filter(Boolean);
    out.push({ key: "looking", tone: "dim", text: `It also did ${bits.join(" and ")}.` });
  }

  // ── and whether this record can be trusted ────────────────────────────────
  out.push({ key: "proof", tone: "ok",
    text: `The record is ${plural(a.log.lines, "line")} long and fingerprinted.`,
    detail: `Every line was written as it happened, by the hook, not reconstructed afterwards. Copy the JSON and its fingerprint (sha ${a.log.sha256.slice(0, 12)}…) still has to match this box — which is what makes it evidence rather than a summary.` });
  return out;
}

/** The one line at the top — the verdict in the operator's words, not the log's. Pure — tested. */
export function auditHeadline(a: PackAudit | null | undefined): { tone: "ok" | "warn" | "dim"; text: string } {
  if (!a) return { tone: "dim", text: "nothing watched yet" };
  if (a.cross.git_only.length) return { tone: "warn", text: "Something changed here that this agent cannot account for." };
  if (a.counts.blocked) return { tone: "warn", text: "It stayed inside its scope — and it did try to leave." };
  if (!a.counts.writes) return { tone: "ok", text: "It has looked around and changed nothing." };
  return { tone: "ok", text: "Every change in this box traces back to a tool call antiloki watched." };
}
