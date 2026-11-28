// LINEAR, READ INSIDE ANTILOKI: the shapes Linear's MCP answers (list_teams, list_issues, get_issue, list_projects, list_cycles, list_comments), read defensively, and the rules for grouping and filtering. Pure; the pane draws it.
export type LTeam = { id: string; key: string; name: string };
export type LIssue = { id: string; title: string; status: string; statusType: string; priority: number; priorityName: string; assignee: string; labels: string[]; project: string; updatedAt: string; url: string; team: string; description: string };
export type LProject = { id: string; name: string; summary: string; status: string; statusType: string; priority: string; targetDate: string; url: string; color: string };
export type LComment = { id: string; author: string; body: string; createdAt: string };
export type LStatus = { id: string; name: string; type: string };
export type LUser = { id: string; name: string; displayName: string };
export type LLabel = { id: string; name: string; color: string };
export type LNotification = { id: string; text: string; sub: string; createdAt: string; unread: boolean; url: string; /** the line under the title (what Linear says it is) and its kind, for the detail page */ subtitle: string; kind: string; /** the issue it is about (DAN-12), when it is about one: the pane opens it in place */ issueId: string };
export type LDocument = { id: string; title: string; updatedAt: string; project: string; url: string; content: string };
export type LView = { id: string; name: string; description: string };
export type LCycle = { id: string; number: number; name: string; startsAt: string; endsAt: string };

const s = (v: unknown, n = 400) => (typeof v === "string" ? v.slice(0, n) : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const nameOf = (v: any): string => (typeof v === "string" ? v : v && typeof v === "object" ? s(v.name ?? v.displayName) : "");

export const parseTeams = (d: any): LTeam[] => arr(d?.teams).filter((t) => t && typeof t.id === "string").map((t) => ({ id: s(t.id, 80), key: s(t.key, 12), name: s(t.displayName ?? t.name, 80) }));
export const parseIssue = (i: any): LIssue | null => (i && typeof i.id === "string" ? { id: s(i.id, 40), title: s(i.title, 300), status: s(i.status, 60), statusType: s(i.statusType, 20), priority: typeof i.priority?.value === "number" ? i.priority.value : 0, priorityName: s(i.priority?.name, 20), assignee: nameOf(i.assignee), labels: arr(i.labels).map(nameOf).filter(Boolean), project: nameOf(i.project), updatedAt: s(i.updatedAt, 40), url: s(i.url, 300), team: nameOf(i.team), description: s(i.description, 20000) } : null);
export const parseIssues = (d: any): { issues: LIssue[]; cursor: string | null } => ({ issues: arr(d?.issues).map(parseIssue).filter((x): x is LIssue => !!x), cursor: d?.hasNextPage === true && typeof d?.cursor === "string" ? d.cursor : null });
export const parseProjects = (d: any): LProject[] => arr(Array.isArray(d) ? d : d?.projects).filter((p) => p && typeof p.id === "string").map((p) => ({ id: s(p.id, 40), name: s(p.name, 200), summary: s(p.summary, 400), status: s(p.status?.name, 40), statusType: s(p.status?.type, 20), priority: s(p.priority?.name, 20), targetDate: s(p.targetDate, 20), url: s(p.url, 300), color: s(p.color, 12) }));
export const parseComments = (d: any): LComment[] => arr(d?.comments).filter((c) => c && c.id != null).map((c) => ({ id: s(c.id, 80), author: nameOf(c.user ?? c.author) || s(c.userName ?? c.authorName, 80), body: s(c.body, 8000), createdAt: s(c.createdAt, 40) }));
export const parseCycles = (d: any): LCycle[] => arr(Array.isArray(d) ? d : d?.cycles).filter((c) => c && c.id != null).map((c) => ({ id: s(c.id, 80), number: typeof c.number === "number" ? c.number : 0, name: s(c.name, 80), startsAt: s(c.startsAt, 40), endsAt: s(c.endsAt, 40) }));

/** The order Linear lists work in: what is being done first, then to do, then the backlog, then what is over. */
export const STATUS_ORDER = ["triage", "started", "unstarted", "backlog", "completed", "canceled"];
export function groupByStatus(issues: readonly LIssue[]): { type: string; status: string; issues: LIssue[] }[] {
  const by = new Map<string, { type: string; status: string; issues: LIssue[] }>();
  for (const i of issues) { const k = `${i.statusType}|${i.status}`; const g = by.get(k) ?? { type: i.statusType, status: i.status, issues: [] }; g.issues.push(i); by.set(k, g); }
  const rank = (t: string) => { const n = STATUS_ORDER.indexOf(t); return n < 0 ? STATUS_ORDER.length : n; };
  return [...by.values()].sort((a, b) => rank(a.type) - rank(b.type) || a.status.localeCompare(b.status));
}
export const PRIORITY_GLYPH = ["···", "!", "▲▲▲", "▲▲", "▲"]; // none, urgent, high, medium, low
export const priorityGlyph = (p: number) => PRIORITY_GLYPH[p] ?? "···";
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return ""; const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 48) return `${h}h`; const d = Math.round(h / 24); return d < 60 ? `${d}d` : `${Math.round(d / 30)}mo`;
}

export const parseStatuses = (d: any): LStatus[] => arr(Array.isArray(d) ? d : d?.statuses).filter((x) => x && typeof x.id === "string" && typeof x.name === "string").map((x) => ({ id: s(x.id, 80), name: s(x.name, 60), type: s(x.type, 20) }));
export const parseUsers = (d: any): LUser[] => arr(d?.users).filter((u) => u && typeof u.id === "string" && u.isActive !== false).map((u) => ({ id: s(u.id, 80), name: s(u.name, 80), displayName: s(u.displayName, 60) })).filter((u) => u.displayName !== "linear");
export const parseLabels = (d: any): LLabel[] => arr(d?.labels).filter((l) => l && typeof l.id === "string" && !l.archivedAt).map((l) => ({ id: s(l.id, 80), name: s(l.name, 60), color: s(l.color, 12) }));

/** The write a change on an issue comes to, as the exact arguments of Linear's `save_issue` (only what changed is sent). Pure. */
export type IssueChange = { state?: string; priority?: number; assignee?: string | null; addLabel?: string; removeLabel?: string; title?: string; description?: string };
export function saveIssueArgs(id: string, c: IssueChange): Record<string, unknown> {
  const a: Record<string, unknown> = { id };
  if (c.state !== undefined) a.state = c.state; if (c.priority !== undefined) a.priority = c.priority; if (c.assignee !== undefined) a.assignee = c.assignee;
  if (c.addLabel) a.addLabels = [c.addLabel]; if (c.removeLabel) a.removeLabels = [c.removeLabel]; if (c.title !== undefined) a.title = c.title; if (c.description !== undefined) a.description = c.description; return a;
}
/** The arguments that make a new issue: a title and a team are required; empty choices are left out. Pure. */
export function newIssueArgs(team: string, f: { title: string; description?: string; state?: string; priority?: number; assignee?: string }): Record<string, unknown> | null {
  const title = f.title.trim(); if (!title || !team) return null;
  const a: Record<string, unknown> = { team, title }; if (f.description?.trim()) a.description = f.description.trim(); if (f.state) a.state = f.state; if (f.priority) a.priority = f.priority; if (f.assignee) a.assignee = f.assignee; return a;
}
export const PRIORITIES: { value: number; name: string }[] = [{ value: 0, name: "No priority" }, { value: 1, name: "Urgent" }, { value: 2, name: "High" }, { value: 3, name: "Medium" }, { value: 4, name: "Low" }];

/** Notifications as the inbox draws them. Read defensively: what Linear sends varies with the kind (comment, assignment, status). */
export const parseNotifications = (d: any): LNotification[] => arr(d?.notifications ?? (Array.isArray(d) ? d : [])).filter((n) => n && n.id != null).map((n) => {
  const issue = n.issue ?? {}; const who = nameOf(n.actor) || nameOf(n.user); const kind = s(n.type, 60).replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return { id: s(n.id, 80), text: s(n.title ?? n.text ?? (issue.identifier ? `${issue.identifier} ${s(issue.title, 140)}` : kind), 220), sub: [who, kind].filter(Boolean).join(" · "), createdAt: s(n.createdAt, 40), unread: !n.readAt, url: s(n.url ?? issue.url, 300), subtitle: s(n.subtitle, 400), kind: s(n.type, 60), issueId: s(issue.identifier ?? n.issueIdentifier ?? "", 40) };
});
export const parseDocuments = (d: any): LDocument[] => arr(d?.documents).filter((x) => x && x.id != null).map((x) => ({ id: s(x.id, 80), title: s(x.title, 200), updatedAt: s(x.updatedAt, 40), project: nameOf(x.project), url: s(x.url, 300), content: s(x.content, 40000) }));
export const parseDocument = (d: any): LDocument | null => (d && d.id != null ? { id: s(d.id, 80), title: s(d.title, 200), updatedAt: s(d.updatedAt, 40), project: nameOf(d.project), url: s(d.url, 300), content: s(d.content ?? d.description, 80000) } : null);
export const parseViews = (d: any): LView[] => arr(d?.customViews ?? d?.views).filter((v) => v && v.id != null).map((v) => ({ id: s(v.id, 80), name: s(v.name, 100), description: s(v.description, 300) }));
/** Does an error say the key cannot do this, so the person must connect with Linear's own sign-in? Pure. */
export const needsOauth = (error: string): boolean => /api key authentication not allowed|oauth/i.test(error);

/** A description, a comment or a document as the pieces it is made of: text, and the pictures and videos Linear embeds in it (`<linear-image>{json}</linear-image>`, `<linear-embed node-type="video">{json}</linear-embed>`, and markdown `![alt](url)`). Pure. */
export type RichBlock = { kind: "md"; text: string } | { kind: "image" | "video" | "file"; src: string; title: string; w: number; h: number };
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|$)/i; const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i;
export function splitRich(text: string): RichBlock[] {
  const out: RichBlock[] = []; const re = /<linear-image>\s*(\{[\s\S]*?\})\s*<\/linear-image>|<linear-embed\b([^>]*)>\s*(\{[\s\S]*?\})\s*<\/linear-embed>|!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0; let m: RegExpExecArray | null; const push = (t: string) => { if (t.trim()) out.push({ kind: "md", text: t }); };
  while ((m = re.exec(text))) {
    let block: RichBlock | null = null;
    try {
      if (m[1]) { const j = JSON.parse(m[1]); const a = j.attrs ?? j; if (typeof a.src === "string") block = { kind: "image", src: a.src, title: s(a.title, 200), w: Number(a.width) || 0, h: Number(a.height) || 0 }; }
      else if (m[3]) { const a = JSON.parse(m[3]); const type = /node-type="([^"]+)"/.exec(m[2] ?? "")?.[1] ?? ""; const title = s(a.title, 200); if (typeof a.src === "string") block = { kind: type === "video" || VIDEO_EXT.test(title) ? "video" : IMAGE_EXT.test(title) ? "image" : "file", src: a.src, title, w: Number(a.width) || 0, h: Number(a.height) || 0 }; }
      else if (m[5]) block = { kind: "image", src: m[5], title: s(m[4], 200), w: 0, h: 0 };
    } catch { block = null; }
    if (!block) continue;   // a tag that is not what it says stays in the text
    push(text.slice(last, m.index)); out.push(block); last = m.index + m[0].length;
  }
  push(text.slice(last)); return out;
}
/** Where the browser gets an upload from: Linear's own upload host needs the person's connection, so it goes through the serve (which fetches it with that and streams it back); any other address is used as it is. Pure. */
export function assetUrl(src: string, beUrl: string): string {
  try { const u = new URL(src); if (u.protocol === "https:" && u.hostname === "uploads.linear.app") return `${beUrl}/api/v1/webapps/asset?app=linear&url=${encodeURIComponent(src)}`; } catch { /* not an address */ }
  return src;
}
