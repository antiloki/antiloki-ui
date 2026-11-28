// WEB APPS, THE STORE'S MODEL (operator 2026-11-10: "a store with all the official open MCPs of big apps, and a plus to add one more: two modalities, official MCP or generate MCP; the button is install, this puts the pane on the new pane list with the web app flag").
// The serve owns the list (`/api/v1/webapps`: the catalog, what is installed, install / uninstall / inspect); this reads what it sends defensively and turns it into the rows the pane draws.
export type StoreApp = { id: string; name: string; vendor: string; category: string; blurb: string; app_url: string; mcp_url: string; transport: string; auth: string; color: string; docs: string };
export type InstalledApp = { id: string; name: string; kind: "official" | "generated"; app_url: string; mcp_url: string; auth: string; color: string; tools: number; /** the maker's page that explains its MCP and how to sign in */ docs: string };
export type WebApps = { catalog: StoreApp[]; installed: InstalledApp[] };
export type Inspection = { specUrl: string | null; title: string; count: number; writes: number; note: string; tools: { name: string; risk: string; summary: string }[]; pageOk: boolean };

const str = (v: unknown, n = 400) => (typeof v === "string" ? v.slice(0, n) : "");
export function parseWebApps(raw: unknown): WebApps {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
  return {
    catalog: list(r.catalog).map((a) => ({ id: str(a.id, 60), name: str(a.name, 80), vendor: str(a.vendor, 80), category: str(a.category, 40), blurb: str(a.blurb, 300), app_url: str(a.app_url), mcp_url: str(a.mcp_url), transport: str(a.transport, 10), auth: str(a.auth, 12), color: str(a.color, 20), docs: str(a.docs) })).filter((a) => a.id && a.name),
    installed: list(r.installed).map((a) => ({ id: str(a.id, 60), name: str(a.name, 80), kind: a.kind === "official" ? "official" as const : "generated" as const, app_url: str(a.app_url), mcp_url: str(a.mcp_url), auth: str(a.auth, 12), color: str(a.color, 20), tools: Array.isArray(a.tools) ? a.tools.length : 0, docs: str(a.docs) })).filter((a) => a.id && a.name),
  };
}
export function parseInspection(raw: unknown): Inspection | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, any> | null; if (!r || r.ok !== true) return null;
  const tools = Array.isArray(r.tools) ? r.tools.filter((t: any) => t && typeof t === "object").map((t: any) => ({ name: str(t.name, 80), risk: str(t.risk, 12) || "read", summary: str(t.summary ?? t.description, 160) })) : [];
  return { specUrl: typeof r.spec_url === "string" ? r.spec_url : null, title: str(r.title, 120), count: typeof r.count === "number" ? r.count : tools.length, writes: typeof r.writes === "number" ? r.writes : tools.filter((t: any) => t.risk !== "read").length, note: str(r.note, 400), tools, pageOk: r.page?.ok === true };
}
/** The store's categories in the order they are first met, "All" first. */
export const categoriesOf = (catalog: readonly StoreApp[]): string[] => ["All", ...Array.from(new Set(catalog.map((a) => a.category)))];
export const isInstalled = (installed: readonly InstalledApp[], id: string) => installed.some((a) => a.id === id);
export function filterStore(catalog: readonly StoreApp[], category: string, query: string): StoreApp[] {
  const q = query.trim().toLowerCase();
  return catalog.filter((a) => (category === "All" || a.category === category) && (!q || `${a.name} ${a.vendor} ${a.blurb} ${a.category}`.toLowerCase().includes(q)));
}
/** What an install said, in a line: whether the app's MCP address answered (a sign-in wall counts as answering). */
export function installLine(name: string, r: { ok?: boolean; error?: string; mcp_reach?: { ok?: boolean; status?: number; error?: string } | null }): { ok: boolean; line: string } {
  if (!r.ok) return { ok: false, line: r.error || `could not install ${name}` };
  const m = r.mcp_reach; if (!m) return { ok: true, line: `${name} is installed` };
  return m.ok ? { ok: true, line: `${name} is installed: its MCP server answered${m.status === 401 || m.status === 403 ? " (it asks you to sign in: your agent's own CLI does that)" : ""}` } : { ok: true, line: `${name} is installed, but its MCP address did not answer (${m.error || "no reply"}): it may be down or need a network` };
}
