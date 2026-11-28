// THE SKILLSHARE PANE'S MODEL. `skillshare` is its own CLI; the serve passes its JSON on as it comes (per scope: list, diff, mcp, plugins, hooks, and the update checks), and this turns it into
// the rows the pane draws. It is a port of the model of herdr's skillshare panel (its `model.js`: the same states, the same grouping, the same captions), read defensively: a field that is
// not there or not the shape expected is left out, never a crash. Pure.

export type Kind = "skills" | "agents" | "mcp" | "plugins" | "hooks";
export type Scope = "global" | "project";
export const KINDS: readonly { key: Kind; label: string }[] = [{ key: "skills", label: "Skills" }, { key: "agents", label: "Agents" }, { key: "mcp", label: "MCP" }, { key: "plugins", label: "Plugins" }, { key: "hooks", label: "Hooks" }];
/** ok: in sync · off: disabled · update: a newer version upstream · sync: a target still needs it · missing: not synced yet · unknown: the CLI could not say */
export type State = "ok" | "off" | "update" | "sync" | "missing" | "unknown";
export type Item = {
  key: string; kind: Kind; scope: Scope; name: string; label: string; rel: string; src: string; state: State; disabled: boolean; version: string | null; repo: string | null;
  behind: number; reason: string; targets: string[]; /** a hook: declared in the source, and where (a project root, or "" for the top level) */ declared: boolean; root: string;
  /** a status line about hooks, not a hook of its own */ notice: boolean; pending: boolean; blocker: boolean; diagnostic: boolean; lines: string[];
};
export type RawScope = { list?: unknown; diff?: unknown; mcp?: unknown; plugins?: unknown; hooks?: unknown; check?: unknown; checkAgents?: unknown; error?: string | null };
export type ScopeView = { scope: Scope; raw: RawScope; error: string | null };
export type SkillshareState =
  | { installed: false; hint: string }
  | { installed: true; version: string; source: string; targets: number; scopes: ScopeView[]; /** antiloki's own bank (not the external CLI): skills and agents only */ native: boolean; /** the tools it links into */ tools: { key: string; label: string }[] };

type J = Record<string, any>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const noMd = (n: string) => n.replace(/\.md$/, "");

/** What the serve answered, as the pane holds it. Anything unreadable is "not installed" with the reason, never a throw. */
export function parseSkillshare(raw: unknown): SkillshareState {
  const r = obj(raw);
  if (r.installed !== true) return { installed: false, hint: str(r.hint, 600) || "skillshare is not installed on this machine." };
  const scopes: ScopeView[] = [];
  for (const scope of ["global", "project"] as const) {
    const s = obj(obj(r.scopes)[scope]); if (!Object.keys(s).length) continue;
    scopes.push({ scope, raw: s as RawScope, error: str(s.error, 300) || null });
  }
  return { installed: true, version: str(r.version, 40), source: str(r.source, 300), targets: typeof r.targets === "number" ? r.targets : 0, scopes, native: r.native === true, tools: arr(r.tools).filter((t) => typeof t?.key === "string").map((t) => ({ key: String(t.key), label: str(t.label, 40) || String(t.key) })) };
}

/** What each target still needs, from `diff`: by `kind:name`. Things a sync would not touch (local-only in a target) are left out. */
export function driftFrom(diff: unknown): Map<string, { action: string; reason: string; targets: string[] }> {
  const out = new Map<string, { action: string; reason: string; targets: string[] }>();
  for (const t of arr(obj(diff).targets)) {
    for (const item of arr(t?.items)) {
      if (!item?.is_sync || typeof item.name !== "string") continue;
      const kind = item.kind === "agent" ? "agents" : "skills"; const key = `${kind}:${noMd(item.name)}`; const was = out.get(key);
      out.set(key, { action: was?.action === "modify" ? "modify" : str(item.action), reason: was?.reason ?? str(item.reason), targets: [...(was?.targets ?? []), str(t.name)] });
    }
  }
  return out;
}
const shortSource = (s: unknown) => str(s).replace(/^https?:\/\//, "").replace(/\.git(\/|$)/, "$1").replace(/\/$/, "");
const blank = (): Omit<Item, "key" | "kind" | "scope" | "name" | "label" | "rel" | "src" | "state"> => ({ disabled: false, version: null, repo: null, behind: 0, reason: "", targets: [], declared: false, root: "", notice: false, pending: false, blocker: false, diagnostic: false, lines: [] });

/** One scope's rows, every kind. `raw` holds each command's parsed JSON (a missing one is just absent). */
export function buildItems(scope: Scope, rawIn: RawScope): Item[] {
  const raw = obj(rawIn); const items: Item[] = []; const drift = driftFrom(raw.diff);
  const checks = new Map<string, J>();
  for (const s of arr(obj(raw.check).skills)) if (typeof s?.name === "string") checks.set(`skills:${s.name}`, s);
  for (const s of arr(raw.checkAgents)) if (typeof s?.name === "string") checks.set(`agents:${s.name}`, s);
  const behind = new Map<string, J>(arr(obj(raw.check).tracked_repos).filter((r) => typeof r?.name === "string").map((r) => [r.name as string, r as J]));

  for (const s of arr(raw.list)) {
    if (typeof s?.name !== "string" || !s.name.trim()) continue;
    const kind: Kind = s.kind === "agent" ? "agents" : "skills"; const flat = kind === "agents" ? noMd(s.name) : s.name;
    const rel = noMd(str(s.relPath) || s.name); const check = checks.get(`${kind}:${rel}`) ?? checks.get(`${kind}:${flat}`);
    const repo = s.repoName ? behind.get(String(s.repoName)) : undefined; const d = drift.get(`${kind}:${flat}`);
    const item: Item = { ...blank(), key: `${scope}:${kind}:${flat}`, kind, scope, name: flat, label: rel.split("/").pop() || flat, rel,
      src: shortSource(check?.source ?? s.source) || (s.repoName ? `tracked repo ${s.repoName}` : rel.includes("/") ? rel : "local"), disabled: Boolean(s.disabled), version: check?.version ? String(check.version) : null, state: "ok", repo: s.repoName ? String(s.repoName) : null };
    if (item.disabled) item.state = "off";
    else if (check?.status === "update_available" || repo?.status === "behind") { item.state = "update"; item.behind = Number(repo?.behind) || 0; }
    else if (d) { item.state = d.action === "add" ? "missing" : "sync"; item.reason = d.reason; item.targets = d.targets; }
    items.push(item);
  }

  const mcp = new Map<string, { targets: string[]; pending: string[] }>();
  for (const c of arr(obj(raw.mcp).changes)) {
    if (typeof c?.name !== "string") continue;
    const m = mcp.get(c.name) ?? { targets: [], pending: [] }; m.targets.push(str(c.target));
    if (c.action && c.action !== "unchanged") m.pending.push(`${str(c.target)}: ${str(c.action)}`); mcp.set(c.name, m);
  }
  // an MCP list with no `changes` still lists its servers (a plain list of names)
  for (const x of Array.isArray(raw.mcp) ? raw.mcp : []) { const n = typeof x === "string" ? x : str(x?.name); if (n && !mcp.has(n)) mcp.set(n, { targets: [], pending: [] }); }
  for (const [name, m] of mcp) items.push({ ...blank(), key: `${scope}:mcp:${name}`, kind: "mcp", scope, name, label: name, rel: name, src: "MCP server", state: m.pending.length ? "sync" : "ok", reason: m.pending.join(", "), targets: m.targets });

  for (const [name, p] of Object.entries(obj(obj(raw.plugins).packages))) {
    const bindings = obj(obj(p).bindings); const pending = Object.entries(bindings).filter(([, b]) => obj(b).pending || obj(b).sync === false).map(([t]) => t);
    const first = obj(Object.values(bindings)[0]);
    items.push({ ...blank(), key: `${scope}:plugins:${name}`, kind: "plugins", scope, name, label: name, rel: name, src: shortSource(obj(p).source ?? first.id) || "plugin", version: obj(p).version ?? first.version ? String(obj(p).version ?? first.version) : null,
      state: pending.length ? "sync" : Object.keys(bindings).length ? "ok" : "missing", reason: pending.length ? `pending in ${pending.join(", ")}` : "", targets: Object.keys(bindings) });
  }

  const hooks = new Map<string, Item>();
  const status = (id: string | number, root = ""): Item => { const it: Item = { ...blank(), key: `${scope}:hooks:status:${id}`, kind: "hooks", scope, root, name: "Hook status", label: "Hook status", rel: "", src: "", state: "ok", notice: true }; hooks.set(it.key, it); return it; };
  const hook = (root: string, name: string): Item => {
    const key = `${scope}:hooks:${root ? `${root}/` : ""}${name}`;
    if (!hooks.has(key)) hooks.set(key, { ...blank(), key, kind: "hooks", scope, root, name, label: name, rel: name, src: "", state: "ok" });
    return hooks.get(key)!;
  };
  const hr = obj(raw.hooks); const changesOf: Map<string, J[]> = new Map(); const addChange = (it: Item, c: J) => { const l = changesOf.get(it.key) ?? []; l.push(c); changesOf.set(it.key, l); };
  for (const [root, source] of [["", obj(hr.source)] as [string, J], ...Object.entries(obj(obj(hr.source).projects)).map(([r, v]) => [r, obj(v)] as [string, J])]) {
    for (const [name, entry] of Object.entries(obj(source.entries))) {
      const e = obj(entry); Object.assign(hook(root, name), { declared: true, disabled: e.enabled === false, targets: Object.keys(obj(e.bindings)), reason: "", lines: [], diagnostic: false });
      hook(root, name).src = str(e.description);
    }
  }
  const plan = obj(hr.plan); const planChanges = arr(plan.changes);
  planChanges.forEach((c, index) => {
    const it = c?.name ? hook(str(c.root), String(c.name)) : status(index, str(c?.root));
    if (c?.target && !it.targets.includes(String(c.target))) it.targets.push(String(c.target)); addChange(it, obj(c));
  });
  for (const c of planChanges) if (!c?.name && !c?.target && c?.action === "conflict") for (const row of hooks.values()) if (!row.notice && row.root === str(c.root)) addChange(row, obj(c));
  const error = str(hr.error) || str(hr.previewError);
  if (error && Array.isArray(raw.list)) status("error");
  arr(plan.warnings).forEach((w, i) => { status(`warning:${i}`).lines = [str(w)]; });
  const changeLine = (c: J) => [[c.target, c.action].filter(Boolean).join(": "), ...new Set([c.message, c.inactiveReason].filter(Boolean))].join(" · ");
  for (const it of hooks.values()) {
    const changes = changesOf.get(it.key) ?? []; it.src = it.targets.join(", ") || "no agents";
    const pending = changes.filter((c) => !["unchanged", "inactive"].includes(c.action));
    it.lines = error ? (it.notice ? [error] : []) : [...changes.map(changeLine), ...it.lines];
    it.diagnostic = changes.some((c) => c.action === "inactive" || c.inactiveReason);
    const summary = pending.length ? changes.filter((c) => c.action !== "unchanged" || c.inactiveReason) : changes;
    it.reason = it.notice ? it.lines.join("; ") : summary.map(changeLine).join("; ");
    if (it.notice) { it.pending = changes.some((c) => ["add", "update", "remove", "adopt", "release"].includes(c.action)); it.blocker = Boolean(error || changes.some((c) => c.action === "conflict")); }
    it.state = !Object.keys(plan).length ? "unknown" : pending.length ? "sync" : it.disabled ? "off" : "ok";
    items.push(it);
  }
  return items;
}

/** Every row of every scope the state holds. */
export const allItems = (st: Extract<SkillshareState, { installed: true }>): Item[] => st.scopes.flatMap((s) => buildItems(s.scope, s.raw));

/** The line under a row's name. */
export function rowSub(item: Item, showScope: boolean): string {
  const pre = showScope ? `${item.scope} · ` : "";
  if (item.kind === "hooks") {
    const disabled = item.disabled ? "disabled · " : "";
    if (!item.notice && item.state === "unknown") return `${pre}${disabled}sync status unknown`;
    if (item.state === "sync" || item.notice || item.diagnostic) return `${pre}${disabled}${item.reason}`;
  }
  if (item.state === "update") return `${pre}${item.version ? `${item.version.slice(0, 7)} → newer` : "update available"}${item.behind ? ` · ↓${item.behind}` : ""}`;
  if (item.state === "missing") return `${pre}not synced yet`;
  if (item.state === "sync") return `${pre}${(item.kind === "skills" || item.kind === "agents" || item.kind === "hooks") && item.reason ? item.reason : "changed since last sync"}`;
  if (item.state === "off") return `${pre}disabled`;
  return `${pre}${item.src}${item.version && item.kind === "plugins" ? ` · ${item.version}` : ""}`;
}

export type Filter = { scope: Scope | "all"; kind: Kind | null; query: string; hideDisabled?: boolean };
/** hideDisabled drops disabled rows that need nothing; a disabled hook with pending changes stays. */
export function filterItems(items: Item[], f: Filter): Item[] {
  const q = f.query.trim().toLowerCase();
  return items.filter((i) => (f.scope === "all" || i.scope === f.scope) && (!f.kind || i.kind === f.kind) && !(f.hideDisabled && i.state === "off")
    && (!q || i.name.toLowerCase().includes(q) || i.src.toLowerCase().includes(q) || (i.kind === "hooks" && `${i.root} ${i.reason}`.toLowerCase().includes(q))));
}
export function groupItems(items: Item[]): { update: Item[]; sync: Item[]; ok: Item[] } {
  const by = (s: State[]) => items.filter((i) => !i.notice && s.includes(i.state)).sort((a, b) => a.label.localeCompare(b.label));
  return { update: by(["update"]), sync: by(["sync", "missing"]), ok: by(["ok", "off"]) };
}
function sourceLabel(i: Item): { label: string; repo: boolean } {
  if (i.repo) return { label: i.repo, repo: true };
  const m = /^([^/\s]+\.[^/\s]+)\/([^/]+)\/([^/]+)/.exec(i.src); if (!m) return { label: i.src, repo: false };
  return { label: m[1] === "github.com" ? `${m[2]}/${m[3]}` : `${m[1]}/${m[2]}/${m[3]}`, repo: true };
}
/** Sources with two or more rows become groups; the rest stay plain rows. Both sorted by label. */
export function sourceGroups(items: Item[]): { groups: { key: string; label: string; repo: boolean; items: Item[] }[]; rows: Item[] } {
  const by = new Map<string, { repo: boolean; list: Item[] }>();
  for (const i of items) { const { label, repo } = sourceLabel(i); if (!by.has(label)) by.set(label, { repo, list: [] }); by.get(label)!.list.push(i); }
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  const groups: { key: string; label: string; repo: boolean; items: Item[] }[] = []; const rows: Item[] = [];
  for (const [label, { repo, list }] of by) { if (list.length > 1) groups.push({ key: `source:${label}`, label, repo, items: list.sort((a, b) => a.label.localeCompare(b.label)) }); else rows.push(list[0]); }
  return { groups: groups.sort(byLabel), rows: rows.sort(byLabel) };
}
export function counts(items: Item[]): Record<"all" | Scope | Kind, number> {
  const c = { all: 0, project: 0, global: 0, skills: 0, agents: 0, mcp: 0, plugins: 0, hooks: 0 };
  for (const i of items) if (!i.notice) { c.all++; c[i.scope]++; c[i.kind]++; }
  return c;
}
/** What the buttons on a row offer. A hook can be enabled or disabled (only a top-level declared one); anything installed from a source can be updated when it has an update, and removed. */
export function rowActions(i: Item): ("update" | "uninstall" | "enable" | "disable" | "remove")[] {   // a skill or an agent can also be switched off and on (its links go and come)
  if (i.notice) return [];
  if (i.kind === "hooks") return i.declared && !i.root ? [i.disabled ? "enable" : "disable", "remove"] : [];
  if (i.kind === "skills" || i.kind === "agents") return [...(i.state === "update" ? ["update" as const] : []), i.disabled ? "enable" as const : "disable" as const, "uninstall" as const];
  return [];
}
/** Whether what the person typed can be installed from: owner/repo or a git address. (The serve checks again.) */
export const installSourceOk = (s: string): boolean => { const t = s.trim(); return !!t && !/[\s"'`$;&|<>\\()*?{}]/.test(t) && !t.startsWith("-") && (/^(https?:\/\/|ssh:\/\/|git@)/.test(t) || /^[\w.-]+\/[\w.-]+(\/[\w.-]+)*$/.test(t)); };

export type RunResult = { ok: boolean; line: string };
/** What pressing a button came to, in a line. */
export function runLine(op: string, raw: unknown): RunResult {
  const r = obj(raw);
  if (r.ok !== true) return { ok: false, line: str(r.error, 300) || `${op} did not finish` };
  const j = obj(r.json); const n = (k: string) => (typeof j[k] === "number" ? (j[k] as number) : null);
  const skipped = arr(j.skipped).length; const bits = [n("synced") !== null && `synced ${n("synced")}`, skipped ? `${skipped} left alone (a tool has its own)` : "", arr(j.installed).length ? `installed ${arr(j.installed).join(", ")}` : "", typeof j.created === "string" ? `created ${j.created}` : "", arr(j.updated).length ? `updated ${arr(j.updated).join(", ")}` : n("updated") !== null ? `updated ${n("updated")}` : "", n("failed") ? `${n("failed")} failed` : ""].filter(Boolean);
  return { ok: true, line: bits.length ? `${op}: ${bits.join(", ")}` : `${op}: done` };
}
