// The two clipboard texts of a FILE REVIEW (operator 2026-09-29): "copy feedback" (just what is
// needed to fix the issues — file, line, what to change) and "copy plan" (the whole fix plan).
// Pure functions + one clipboard helper with a textarea fallback; no React here.

export type FeedbackTarget = { file?: string; line?: number | null; code?: string; note?: string };
export type FeedbackLaw = {
  title?: string; key?: string; severity?: string; fix?: string; rule_md?: string;
  insts?: { line?: number | null; evidence?: string; code?: string; path?: string }[];
};
export type FeedbackAxis = { ax: string; score?: number; detail?: string; targets?: FeedbackTarget[] };
export type FeedbackInput = { path?: string | null; health?: number | null; laws?: FeedbackLaw[]; axes?: FeedbackAxis[] };

export type PlanStep = { label: string; detail?: string; gain?: number; targets?: FeedbackTarget[] };
export type PlanInput = { path?: string | null; health?: number | null; steps: PlanStep[]; projected?: number | null };

const oneLine = (s: string | undefined | null, max = 160): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const where = (path: string | null | undefined, t: FeedbackTarget): string => {
  const f = t.file || path || "";
  return t.line != null ? `${f}:${t.line}` : f || "—";
};

/** One target bullet: `- path:line — code → note`. */
function targetLine(path: string | null | undefined, t: FeedbackTarget): string {
  const code = oneLine(t.code, 120);
  const note = oneLine(t.note, 200);
  return `- ${where(path, t)}${code ? ` — \`${code}\`` : ""}${note ? ` → ${note}` : ""}`;
}

/** The feedback needed to fix a file's issues: each law violation (where + what to change) and each
 *  actionable weak axis. Compact markdown; "" when there is nothing to fix. */
export function feedbackText(inp: FeedbackInput): string {
  const path = inp.path ?? "";
  const laws = inp.laws ?? [];
  const axes = inp.axes ?? [];
  if (!laws.length && !axes.length) return "";
  const out: string[] = [`Fix the review findings in ${path || "this file"}${inp.health != null ? ` (health ${inp.health}/100)` : ""}:`];
  laws.forEach((l, i) => {
    const insts = l.insts ?? [];
    const head = `${i + 1}. ${l.title || l.key || "violation"}${l.severity ? ` [${l.severity}]` : ""}`;
    const lines: string[] = [head];
    const change = oneLine(l.fix) || oneLine(l.rule_md, 240);
    if (change) lines.push(`   Change: ${change}`);
    for (const it of insts) {
      const code = oneLine(it.code ?? it.evidence, 120);
      const f = it.path || path;
      lines.push(`   - ${f}${it.line != null ? `:${it.line}` : ""}${code ? ` — \`${code}\`` : ""}`);
    }
    out.push(lines.join("\n"));
  });
  axes.forEach((a, i) => {
    const n = laws.length + i + 1;
    const lines: string[] = [`${n}. Raise ${a.ax}${a.score != null ? ` (${a.score}/100)` : ""}`];
    if (a.detail) lines.push(`   Change: ${oneLine(a.detail, 300)}`);
    for (const t of (a.targets ?? []).slice(0, 6)) lines.push(`   ${targetLine(path, t)}`);
    out.push(lines.join("\n"));
  });
  return out.join("\n\n");
}

/** The whole fix plan as markdown: title, health projection, then every step with where + what. */
export function planText(inp: PlanInput): string {
  const steps = inp.steps ?? [];
  if (!steps.length) return "";
  const path = inp.path ?? "";
  const proj = inp.projected ?? (inp.health != null ? Math.min(100, inp.health + steps.reduce((a, s) => a + (s.gain ?? 0), 0)) : null);
  const out: string[] = [
    `## Fix plan — ${path || "file"}`,
    `${inp.health != null && proj != null ? `health ${inp.health} → ≈ ${proj} · ` : ""}${steps.length} step${steps.length === 1 ? "" : "s"}`,
  ];
  steps.forEach((s, i) => {
    const parts = [`### ${i + 1}. ${s.label}${s.gain != null ? ` · ≈ +${s.gain} health` : ""}`];
    if (s.detail) parts.push(oneLine(s.detail, 600));
    const ts = s.targets ?? [];
    if (ts.length) parts.push(`Exactly where:\n${ts.slice(0, 8).map((t) => targetLine(path, t)).join("\n")}`);
    out.push(parts.join("\n\n"));
  });
  return out.join("\n\n");
}

/** navigator.clipboard when available; otherwise a hidden textarea + execCommand('copy'). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the textarea */ }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
