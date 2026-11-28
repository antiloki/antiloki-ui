// THE PRE-CHECK, BEFORE THE TERMINAL (RFC 0007 §5.5). The composer is outside the terminal: the text is held here, a
// check runs, and only then does it go in. This is the whole state machine, pure, so every path is a test:
//   idle → checking → ready(send | ask | route | skipped) → sending → idle
// A check that cannot answer in time FAILS OPEN: the verdict becomes "skipped" with the reason said, and Send works.

export type Question = { id: string; text: string; options: string[] };
export type Verdict =
  | { verdict: "send"; notes: string[] }
  | { verdict: "ask"; notes: string[]; questions: Question[] }
  | { verdict: "route"; notes: string[]; route: { pane?: string; engine?: string; label?: string } }
  | { verdict: "skipped"; notes: string[]; reason: string };

export type State =
  | { phase: "idle" }
  | { phase: "checking"; text: string; startedAt: number }
  | { phase: "ready"; text: string; verdict: Verdict; answers: Record<string, string>; deferred: string[] }
  | { phase: "sending"; text: string; final: string };

export const BUDGET_MS = 2000;
export const idle = (): State => ({ phase: "idle" });

export type Action =
  | { type: "submit"; text: string; now: number }
  | { type: "result"; verdict: Verdict }
  | { type: "fail"; reason: string }
  | { type: "tick"; now: number }
  | { type: "answer"; id: string; option: string }
  | { type: "defer"; id: string }
  | { type: "sendNow" }
  | { type: "dismiss" }
  | { type: "sent" };

const skipped = (reason: string): Verdict => ({ verdict: "skipped", notes: [], reason });

export function reduce(s: State, a: Action): State {
  switch (a.type) {
    case "submit": {
      const text = a.text.trim();
      if (!text || s.phase !== "idle") return s; // nothing to check, or a check is already in hand
      return { phase: "checking", text, startedAt: a.now };
    }
    case "result":
      return s.phase === "checking" ? { phase: "ready", text: s.text, verdict: a.verdict, answers: {}, deferred: [] } : s;
    case "fail":
      return s.phase === "checking" ? { phase: "ready", text: s.text, verdict: skipped(a.reason), answers: {}, deferred: [] } : s;
    case "tick":
      return s.phase === "checking" && a.now - s.startedAt >= BUDGET_MS
        ? { phase: "ready", text: s.text, verdict: skipped(`the pre-check took longer than ${BUDGET_MS / 1000} s`), answers: {}, deferred: [] }
        : s;
    case "answer": {
      if (s.phase !== "ready" || s.verdict.verdict !== "ask") return s;
      const q = s.verdict.questions.find((x) => x.id === a.id);
      if (!q || !q.options.includes(a.option)) return s;
      return { ...s, answers: { ...s.answers, [a.id]: a.option }, deferred: s.deferred.filter((d) => d !== a.id) };
    }
    case "defer": {
      if (s.phase !== "ready" || s.verdict.verdict !== "ask") return s;
      if (!s.verdict.questions.some((x) => x.id === a.id) || s.deferred.includes(a.id)) return s;
      const { [a.id]: _gone, ...rest } = s.answers;
      return { ...s, answers: rest, deferred: [...s.deferred, a.id] };
    }
    case "sendNow":
      return canSend(s) ? { phase: "sending", text: s.phase === "ready" ? s.text : "", final: finalText(s) } : s;
    case "dismiss":
      return s.phase === "ready" || s.phase === "checking" ? idle() : s; // dismissing keeps nothing; the composer still holds the text
    case "sent":
      return s.phase === "sending" ? idle() : s;
  }
}

/** Every question is answered or deferred. A "send", "route" or "skipped" verdict is always sendable. */
export function canSend(s: State): boolean {
  if (s.phase !== "ready") return false;
  if (s.verdict.verdict !== "ask") return true;
  return s.verdict.questions.every((q) => q.id in s.answers || s.deferred.includes(q.id));
}
/** What will actually be typed: the text, then one visible line per answer, so the person sees exactly what goes in. */
export function finalText(s: State): string {
  if (s.phase !== "ready") return s.phase === "sending" ? s.final : "";
  if (s.verdict.verdict !== "ask") return s.text;
  const lines = s.verdict.questions.filter((q) => q.id in s.answers).map((q) => `(decided: ${q.text} → ${s.answers[q.id]})`);
  return lines.length ? `${s.text}\n\n${lines.join("\n")}` : s.text;
}
/** Questions still open, for the card's "n left". */
export function openQuestions(s: State): Question[] {
  if (s.phase !== "ready" || s.verdict.verdict !== "ask") return [];
  return s.verdict.questions.filter((q) => !(q.id in s.answers) && !s.deferred.includes(q.id));
}
/** Whether the floating card is up at all. A plain "send" verdict is a thin line, not a card the person has to deal with. */
export const needsCard = (s: State): boolean => s.phase === "ready" && (s.verdict.verdict === "ask" || s.verdict.verdict === "route" || s.verdict.verdict === "skipped");

/** Parse the serve's reply into a Verdict, never trusting it: anything unreadable becomes "skipped" with the reason. */
export function parseVerdict(raw: unknown): Verdict {
  const v: any = raw;
  if (!v || typeof v !== "object") return skipped("the pre-check gave no answer");
  const notes = Array.isArray(v.notes) ? v.notes.filter((n: unknown) => typeof n === "string").slice(0, 6) : [];
  if (v.verdict === "send") return { verdict: "send", notes };
  if (v.verdict === "ask") {
    const questions: Question[] = (Array.isArray(v.questions) ? v.questions : [])
      .map((q: any, i: number) => ({ id: typeof q?.id === "string" && q.id ? q.id : `q${i}`, text: typeof q?.text === "string" ? q.text : "", options: Array.isArray(q?.options) ? q.options.filter((o: unknown) => typeof o === "string" && o) : [] }))
      .filter((q: Question) => q.text && q.options.length >= 1).slice(0, 4);
    return questions.length ? { verdict: "ask", notes, questions } : { verdict: "send", notes };
  }
  if (v.verdict === "route") return { verdict: "route", notes, route: { pane: typeof v.route?.pane === "string" ? v.route.pane : undefined, engine: typeof v.route?.engine === "string" ? v.route.engine : undefined, label: typeof v.route?.label === "string" ? v.route.label : undefined } };
  if (v.verdict === "skipped") return { verdict: "skipped", notes, reason: typeof v.reason === "string" && v.reason ? v.reason : "the pre-check was skipped" };
  return skipped("the pre-check answered something this version does not understand");
}
