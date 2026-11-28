// THE NEW-PANE DIALOG (RFC 0017 §2, §4): four kinds of pane; this file is its pure part: which apps already have a pane of their own, the id of a widget from its title, the declaration a person builds, and the sources a search finds.
export type Source = { key: string; label: string; description: string; args: { name: string; about: string }[] };
/** No web app has a hand-written pane any more (operator 2026-11-25): every app is a pane made as a YAML folder, bound to this machine or exported. */
export const hasNativePane = (_id: string): boolean => false;
/** A widget id from its title: lowercase letters, digits and dashes, at most 48 (the serve's rule). Pure. */
export function idOf(title: string): string { const s = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, ""); return s || "widget"; }
/** The declaration of a deterministic widget (RFC 0015-xray-v2): a source, typed arguments and a fixed renderer; never code. Empty arguments are left out. Pure. */
export function widgetOf(f: { title: string; source: string; args: Record<string, string>; view: string }): Record<string, unknown> {
  const args: Record<string, string> = {}; for (const [k, v] of Object.entries(f.args)) if (v.trim()) args[k] = v.trim();
  return { id: idOf(f.title), title: f.title.trim(), source: f.source, args, view: f.view, options: {}, refresh: "manual" };
}
/** The sources a search finds (key, label or description), in the catalogue's own order. Pure. */
export function findSources(all: Source[], q: string): Source[] { const t = q.trim().toLowerCase(); return t ? all.filter((s) => `${s.key} ${s.label} ${s.description}`.toLowerCase().includes(t)) : all; }
export function parseSources(d: unknown): { sources: Source[]; renderers: string[] } {
  const o = (d ?? {}) as any; const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const sources = (Array.isArray(o.sources) ? o.sources : []).map((s: any): Source | null => { const key = str(s?.key, 60); if (!key) return null; return { key, label: str(s.label, 120), description: str(s.description, 300), args: (Array.isArray(s.args) ? s.args : []).map((a: any) => ({ name: str(a?.name, 40), about: str(a?.about, 120) })).filter((a: { name: string }) => a.name) }; }).filter((s: Source | null): s is Source => s !== null);
  return { sources, renderers: (Array.isArray(o.renderers) ? o.renderers : []).filter((r: unknown): r is string => typeof r === "string").filter((r: string) => r !== "component") };
}
