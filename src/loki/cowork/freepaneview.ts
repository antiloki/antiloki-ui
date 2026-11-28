// FREE PANES BY MEANING (RFC 0016 M5): a page inside a sandbox cannot be read like the rest of the screen, so it SAYS what it shows (`antiloki.describe`) and which controls it lets an agent use (`antiloki.onAct`). What an agent reads with antiloki_pane_view is that description; what it does with antiloki_pane_act is routed to the page's own handler, which uses the same bridge as a person's click, so a write still asks the person.
import type { Snapshot } from "./pane-driver";
export type DescControl = { ref: string; label: string; kind: "button" | "field" | "choice"; value?: string; options?: string[] };
export type PaneDescription = { title: string; text: string; controls: DescControl[] };
export type ActOutcome = { ok: boolean; detail: string };
export type LiveFreePane = { description: () => PaneDescription | null; act: (ref: string, value: string | undefined, action: string) => Promise<ActOutcome> };

const live = new Map<string, LiveFreePane>();
/** The open free panes by their pane id on the screen (the layout's id), so a command from the serve finds the right frame. */
export function registerFreePane(key: string, p: LiveFreePane): () => void { live.set(key, p); return () => { if (live.get(key) === p) live.delete(key); }; }
export function liveFreePane(key: string): LiveFreePane | undefined { return live.get(key); }

const MAX_TEXT = 6000, MAX_CONTROLS = 60, MAX_LABEL = 120, MAX_VALUE = 400;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
/** What a page said about itself, cleaned to the limits: text only, at most 60 controls, each with a short plain ref. A bad shape is refused in words, never half-kept. Pure. */
export function cleanDescription(tree: unknown): PaneDescription | string {
  if (!tree || typeof tree !== "object" || Array.isArray(tree)) return "describe takes an object {title, text, controls}";
  const t = tree as Record<string, unknown>; const raw = Array.isArray(t.controls) ? t.controls : []; if (raw.length > MAX_CONTROLS) return `describe lists at most ${MAX_CONTROLS} controls`;
  const controls: DescControl[] = []; const seen = new Set<string>();
  for (const c of raw) {
    if (!c || typeof c !== "object") return "each control is an object {ref, label, kind}"; const o = c as Record<string, unknown>;
    const ref = str(o.ref, 40); if (!/^[a-z0-9][a-z0-9._-]*$/.test(ref)) return `a control's ref is lower case letters, digits, dots and dashes (not "${ref}")`; if (seen.has(ref)) return `two controls have the ref "${ref}"`; seen.add(ref);
    const kind = o.kind === "field" || o.kind === "choice" ? o.kind : "button";
    controls.push({ ref, label: str(o.label, MAX_LABEL) || ref, kind, ...(typeof o.value === "string" ? { value: o.value.slice(0, MAX_VALUE) } : {}), ...(Array.isArray(o.options) ? { options: o.options.filter((x) => typeof x === "string").slice(0, 30).map((x: string) => x.slice(0, 60)) } : {}) });
  }
  return { title: str(t.title, 120), text: str(t.text, MAX_TEXT), controls };
}
/** The description in the shape the rest of the screen's panes are read in (the serve draws it the same way), so an agent uses the same words everywhere. Pure. */
export function asSnapshot(d: PaneDescription): Snapshot {
  return { text: d.text, truncated: false, frames: [], elements: d.controls.map((c, i) => ({ ref: c.ref, role: c.kind === "button" ? "button" : c.kind === "field" ? "textbox" : "combobox", name: c.label, ...(c.value != null ? { value: c.value } : {}), ...(c.options ? { options: c.options } : {}) })) };
}
/** What an agent asked for (`click`, `type`, `select` on a control by its ref) as the page's handler needs it, or why it cannot be done. Pure. */
export function routeAct(d: PaneDescription | null, req: { action: string; ref?: string; value?: string }): { ref: string; value?: string } | string {
  if (!d) return "this page has not said what it shows yet: look again in a moment";
  if (!req.ref) return "name the control by its ref (read the pane first)"; const c = d.controls.find((x) => x.ref === req.ref); if (!c) return `no control "${req.ref}" in this pane: read it again`;
  if (c.kind === "button" && !["click", "focus", "hover"].includes(req.action)) return `"${c.label}" is a button: click it`;
  if (c.kind !== "button" && !["type", "select", "focus", "click"].includes(req.action)) return `"${c.label}" takes ${c.kind === "field" ? "type" : "select"}`;
  if (c.kind !== "button" && ["type", "select"].includes(req.action) && typeof req.value !== "string") return `"${c.label}" needs a value`;
  return { ref: c.ref, ...(typeof req.value === "string" ? { value: req.value.slice(0, 2000) } : {}) };
}
