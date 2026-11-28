// WHERE YOU WERE (the operator 2026-11-20: "on expanding the pane it lost the repo I was"): expanding or reopening a pane makes a new instance, so each web app pane keeps its place (what is open, which list) in this browser and starts there. Never in a project, never anything secret.
const PREFIX = "antiloki.place.";
export function keepPlace(app: string, place: unknown): void { try { localStorage.setItem(PREFIX + app, JSON.stringify(place)); } catch { /* a private window keeps nothing: the pane still works */ } }
export function keptPlace<T>(app: string, ok: (v: any) => v is T): T | null { try { const v = JSON.parse(localStorage.getItem(PREFIX + app) || "null"); return v && ok(v) ? v : null; } catch { return null; } }
export function forgetPlace(app: string): void { try { localStorage.removeItem(PREFIX + app); } catch { /* nothing to forget */ } }
