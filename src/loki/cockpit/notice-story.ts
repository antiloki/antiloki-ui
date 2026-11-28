// THE NOTIFICATIONS, MADE READABLE (operator 2026-09-24: "the notification window is completely confuse i dont
// understand anything there").
//
// It was confusing for reasons the data makes obvious the moment you look at it: the same message filed twice a
// second apart, raw crash text with a `[route-error]` prefix nobody outside the code would recognise, wall-clock
// strings instead of "ten minutes ago", and no order beyond newest-first — so a question waiting for an answer
// sat below a duplicate stack trace. Everything below is grouping, de-duplication and plain words. No row is
// hidden and no text is invented: the original message is always one click away.
export type RawNotice = { id?: number | string; ts?: string; kind?: string; severity?: string; message_md?: string; title?: string; message?: string; payload_json?: string | null; card_slug?: string | null; contract_slug?: string | null; dismissed_at?: string | null };

export type Notice = {
  id: string; tone: "bad" | "warn" | "info"; group: "you" | "antiloki" | "work" | "plumbing";
  text: string; raw: string; ts: string; ago: string; count: number;
};
export type NoticeGroup = { key: Notice["group"]; heading: string; blurb: string; fold?: boolean; items: Notice[] };

/** `2026-09-23 23:52:41` → ms. The serve writes local time with a space; Safari will not parse that, so it is
 *  taken apart by hand rather than handed to `new Date`. Pure — tested. */
export function parseTs(ts: string | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(ts ?? "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
}
/** "just now" · "8 min ago" · "3 h ago" · "yesterday" · "23 Sep". Pure — tested. */
export function timeAgo(ts: string | undefined, now = Date.now()): string {
  const t = parseTs(ts);
  if (t == null) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 22 * 3600) return `${Math.round(s / 3600)} h ago`;
  if (s < 48 * 3600) return "yesterday";
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** One row, read. `[route-error] X is not defined` is antiloki's own crash, and saying so is the whole point —
 *  an operator staring at a stack trace has no way to know it is not about their code. Pure — tested. */
export function readNotice(r: RawNotice, now = Date.now()): Notice {
  const raw = String(r.message_md ?? r.title ?? r.message ?? "").trim();
  const sev = String(r.severity ?? "").toLowerCase();
  const tone: Notice["tone"] = sev.startsWith("err") || sev === "critical" ? "bad" : sev.startsWith("warn") ? "warn" : "info";
  const route = /^\[route-error\]\s*/.exec(raw);
  if (route) {
    return { id: String(r.id ?? raw), tone, group: "antiloki", count: 1, raw, ts: String(r.ts ?? ""), ago: timeAgo(r.ts, now),
      text: `antiloki's own interface hit an error: ${raw.slice(route[0].length) || "no message"}` };
  }
  // PLUMBING IS NOT A NOTIFICATION (operator 2026-09-24: "notifications window is bizarre, ugly and has no
  // information at all of notifications"). On the operator's own box 50 of 50 rows were antiloki's internals —
  // six of them were an access log line for `GET /api/v1/events`. An HTTP request is not news. It is kept, under
  // its own heading, folded, because deleting somebody's log to make a screen look tidy is worse.
  const plumbing = /^\[(external_http_dispatch|dispatch|http|tick|driver)[\]_]/.exec(raw);
  if (plumbing) {
    return { id: String(r.id ?? raw), tone: "info", group: "plumbing", count: 1, raw, ts: String(r.ts ?? ""), ago: timeAgo(r.ts, now),
      text: raw.replace(/^\[[a-z_]+\]\s*/, "") || "(an internal event)" };
  }
  const asks = /\b(waiting for you|needs? your|approval|answer|question|confirm)\b/i.test(raw);
  return { id: String(r.id ?? raw), tone, count: 1, raw, ts: String(r.ts ?? ""), ago: timeAgo(r.ts, now),
    group: asks ? "you" : "work", text: raw || "(an empty notification)" };
}

const HEADS: Record<Notice["group"], { heading: string; blurb: string; fold?: boolean }> = {
  you: { heading: "waiting on you", blurb: "nothing moves on these until you answer" },
  work: { heading: "what happened", blurb: "your agents and their work — nothing to do unless you want to" },
  antiloki: { heading: "antiloki's own faults", blurb: "bugs in this interface, not in your code — worth reporting, never yours to fix", fold: true },
  plumbing: { heading: "antiloki's plumbing", blurb: "internal traffic antiloki files about itself — an HTTP request is not news", fold: true },
};

/** The window's content: de-duplicated, grouped, newest first inside each group, and the groups in the order a
 *  person needs them. An identical message filed more than once becomes one row with a count. Pure — tested. */
export function groupNotices(rows: RawNotice[], now = Date.now()): NoticeGroup[] {
  const seen = new Map<string, Notice>();
  for (const r of rows) {
    const n = readNotice(r, now);
    // the same text twice in the same minute is one event the serve filed twice, not two things that happened
    const key = `${n.group}|${n.text}|${Math.floor((parseTs(n.ts) ?? 0) / 60_000)}`;
    const prev = seen.get(key);
    if (prev) { prev.count += 1; if ((parseTs(n.ts) ?? 0) > (parseTs(prev.ts) ?? 0)) { prev.ts = n.ts; prev.ago = n.ago; } continue; }
    seen.set(key, n);
  }
  const all = [...seen.values()].sort((a, b) => (parseTs(b.ts) ?? 0) - (parseTs(a.ts) ?? 0));
  return (["you", "work", "antiloki", "plumbing"] as const)
    .map((key) => ({ key, ...HEADS[key], items: all.filter((n) => n.group === key) }))
    .filter((g) => g.items.length);
}

/** The agents, split by what they want from the operator — the same question the notifications answer. Pure. */
export function agentGroups<T extends { run?: { status: string } | null; busy?: boolean; running?: boolean }>(agents: T[]): { key: "ask" | "busy" | "quiet"; heading: string; items: T[] }[] {
  const asking = (a: T) => !!a.run && (a.run.status === "awaiting-answers" || a.run.status === "awaiting-approval");
  const working = (a: T) => !asking(a) && (!!a.busy || (!!a.run && (a.run.status === "running" || a.run.status === "planning" || a.run.status === "joining")));
  return [
    { key: "ask" as const, heading: "waiting on you", items: agents.filter(asking) },
    { key: "busy" as const, heading: "working now", items: agents.filter(working) },
    { key: "quiet" as const, heading: "idle", items: agents.filter((a) => !asking(a) && !working(a)) },
  ].filter((g) => g.items.length);
}
