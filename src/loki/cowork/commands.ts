// WHAT AN AGENT'S MCP TOOLS ASK OF THE SCREEN (RFC 0007 §17.10): "open a terminal and run the tests", "close that pane". The serve parks the command, the screen takes it here, does it in the
// layout it owns, and reports what it made. This is the pure part: a command read defensively (the screen trusts nothing the serve sends), and the report.
import type { Side, XrayView } from "./layout";
import type { Dir } from "./geometry";
import type { ActRequest } from "./pane-driver";
import { STUDIO_KEYS } from "./studio-panes";

export type OpenCommand = { id: number; op: "open"; kind: "terminal" | "agent" | "studio"; title: string; /** opened as this specialist (and the mascot its definition names) */ specialist?: string; specialistShape?: string; specialistColor?: string; /** the model the new agent runs on (`local:<tag>` for a local one) */ model?: string; side: Side; engine: string; tool: string; /** a QA pane: the run it shows */ run: number; /** the Frames pane: the mockup to show (an agent put it there) */ frame?: string; /** an X-ray pane: the one part of X-ray it shows */ xray?: XrayView; /** a free pane: the folder it shows */ free?: string };
export type CloseCommand = { id: number; op: "close"; paneId: string };
export type FocusCommand = { id: number; op: "focus"; paneId: string };
/** Reorganising the layout: move a pane one place in a direction (it trades with its neighbour) or next to another pane on a side (which also turns the split), swap two, flip its split's direction, zoom, focus, rename, resize. */
export type ArrangeAction = "move" | "swap" | "flip" | "zoom" | "focus" | "rename" | "resize";
export type ArrangeCommand = { id: number; op: "arrange"; action: ArrangeAction; paneId: string; dir: Dir | ""; to: string; side: Side | ""; with: string; title: string; share: number | null; on: boolean | null };
/** How the screen looks: a patch of the appearance (an empty patch only reads it). */
export type LookPatch = { termOpacity?: number; paneOpacity?: number; dim?: number; themeId?: string | null; wallpaper?: string | null; follow?: boolean };
export type LookCommand = { id: number; op: "look"; patch: LookPatch };
/** The screen around the panes: the sidebar, and which workspace is open (an empty command only reads them). */
export type ScreenCommand = { id: number; op: "screen"; sidebar: "show" | "hide" | ""; workspace: string };
/** Looking inside a Studio pane (its text and its controls), and doing something in it: what lets an agent use any pane as a person does. */
export type PaneViewCommand = { id: number; op: "pane_view"; paneId: string; chars: number };
export type PaneActCommand = { id: number; op: "pane_act"; paneId: string; act: ActRequest; /** answer with the pane as it is after */ view: boolean };
/** An agent asks the screen to show a draft specialist's editor, for the person to read and approve (the operator 2026-11-22). */
export type SpecialistEditCommand = { id: number; op: "specialist_edit"; specialist: string };
/** An agent proposed a connector: the Connectors pane opens (or comes forward) on its connection screen, for the person to finish (the operator 2026-11-25). */
export type ConnectorOpenCommand = { id: number; op: "connector_open"; slug: string };
export type Command = OpenCommand | CloseCommand | FocusCommand | ArrangeCommand | LookCommand | ScreenCommand | PaneViewCommand | PaneActCommand | SpecialistEditCommand | ConnectorOpenCommand;
/** What the screen says a command came to. `pane` is the layout id of the pane it made or touched (never `id`: that is the command's own). */
export type Report = { ok: true; pane?: string; pane_id?: number; /** what a read-back returns (the appearance, the workspaces) */ data?: unknown } | { ok: false; error: string };

const SIDES: readonly Side[] = ["right", "below", "left", "above"];
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** One command from the serve, or `null` when it is not one the screen knows how to do (it is then simply not done, and the serve's wait times out). */
export function parseCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>; const a = (r.args && typeof r.args === "object" ? r.args : {}) as Record<string, unknown>;
  const id = typeof r.id === "number" && Number.isInteger(r.id) && r.id > 0 ? r.id : 0; if (!id) return null;
  if (r.op === "open") {
    const kind = a.kind === "agent" || a.kind === "studio" ? a.kind : a.kind === "terminal" || a.kind === undefined ? "terminal" : null; if (!kind) return null;
    const side = SIDES.includes(a.side as Side) ? (a.side as Side) : "right";
    const xray: XrayView | undefined = str(a.tool, 40) === "xray-view" && str(a.view, 40) ? { view: str(a.view, 40), space: str(a.space, 300) || undefined, path: str(a.path, 500) || undefined, symbol: str(a.symbol, 200) || undefined, source: str(a.source, 60) || undefined, depth: typeof a.depth === "number" && Number.isFinite(a.depth) ? a.depth : undefined } : undefined;
    return { id, op: "open", kind, title: str(a.title, 80), ...(str(a.specialist, 48) ? { specialist: str(a.specialist, 48), ...(str(a.shape, 16) ? { specialistShape: str(a.shape, 16) } : {}), ...(str(a.color, 16) ? { specialistColor: str(a.color, 16) } : {}) } : {}), ...(/^[A-Za-z0-9._:/[\]=,-]{1,80}$/.test(str(a.model, 80)) ? { model: str(a.model, 80) } : {}), side, engine: str(a.engine, 40), tool: str(a.tool, 40), run: typeof a.run === "number" && Number.isFinite(a.run) && a.run > 0 ? a.run : 0, ...(str(a.frame, 40) ? { frame: str(a.frame, 40) } : {}), ...(xray ? { xray } : {}), ...(str(a.tool, 40) === "free-pane" && /^[a-z0-9-]{1,60}$/.test(str(a.free, 60)) ? { free: str(a.free, 60) } : {}) };
  }
  if (r.op === "connector_open") return { id, op: "connector_open", slug: str(a.slug, 48) };   // no slug: just the pane
  if (r.op === "specialist_edit") { const sid = str(a.id, 48); return sid ? { id, op: "specialist_edit", specialist: sid } : null; }
  if (r.op === "arrange") {
    const action = ["move", "swap", "flip", "zoom", "focus", "rename", "resize"].includes(String(a.action)) ? (a.action as ArrangeAction) : null; const paneId = str(a.id, 80); if (!action || !paneId) return null;
    const dir = (["left", "right", "up", "down"] as const).includes(a.dir as Dir) ? (a.dir as Dir) : ""; const side = SIDES.includes(a.side as Side) ? (a.side as Side) : "";
    return { id, op: "arrange", action, paneId, dir, to: str(a.to, 80), side, with: str(a.with, 80), title: str(a.title, 80), share: typeof a.share === "number" && Number.isFinite(a.share) ? a.share : null, on: typeof a.on === "boolean" ? a.on : null };
  }
  if (r.op === "pane_view") { const paneId = str(a.id, 80); if (!paneId) return null; return { id, op: "pane_view", paneId, chars: typeof a.text_chars === "number" && a.text_chars > 0 ? Math.min(20_000, Math.floor(a.text_chars)) : 6000 }; }
  if (r.op === "pane_act") {
    const paneId = str(a.id, 80); const action = ["click", "type", "select", "press", "scroll", "focus", "hover", "check", "uncheck"].includes(String(a.action)) ? (String(a.action) as ActRequest["action"]) : null; if (!paneId || !action) return null;
    const act: ActRequest = { action }; const t = (k: string, n = 400) => (typeof a[k] === "string" ? (a[k] as string).slice(0, n) : undefined);
    const ref = t("ref", 20); const testid = t("testid", 120); const text = t("text", 200); const value = t("value", 4000); const key = t("key", 20);
    if (ref) act.ref = ref; if (testid) act.testid = testid; if (text) act.text = text; if (value !== undefined) act.value = value; if (key) act.key = key; if (typeof a.dy === "number" && Number.isFinite(a.dy)) act.dy = a.dy; if (a.submit === true) act.submit = true; if (a.append === true) act.append = true;
    return { id, op: "pane_act", paneId, act, view: a.view !== false };
  }
  if (r.op === "look") {
    const p = (a.patch && typeof a.patch === "object" ? a.patch : {}) as Record<string, unknown>; const patch: LookPatch = {};
    if (typeof p.termOpacity === "number" && Number.isFinite(p.termOpacity)) patch.termOpacity = p.termOpacity;
    if (typeof p.paneOpacity === "number" && Number.isFinite(p.paneOpacity)) patch.paneOpacity = p.paneOpacity;
    if (typeof p.dim === "number" && Number.isFinite(p.dim)) patch.dim = p.dim;
    if (p.themeId === null || typeof p.themeId === "string") patch.themeId = p.themeId === null ? null : str(p.themeId, 61);
    if (p.wallpaper === null || typeof p.wallpaper === "string") patch.wallpaper = p.wallpaper === null ? null : str(p.wallpaper, 121);
    if (typeof p.follow === "boolean") patch.follow = p.follow;
    return { id, op: "look", patch };
  }
  if (r.op === "screen") return { id, op: "screen", sidebar: a.sidebar === "show" || a.sidebar === "hide" ? a.sidebar : "", workspace: str(a.workspace, 80) };
  if (r.op === "close" || r.op === "focus") { const paneId = str(a.id, 80); return paneId ? { id, op: r.op, paneId } as Command : null; }
  return null;
}
export const commandsOf = (raw: unknown): Command[] => (Array.isArray(raw) ? raw : []).map(parseCommand).filter((c): c is Command => c !== null);

/** A studio tool a pane can be opened as. Anything else is refused with the list. */
export const STUDIO_PANES: readonly string[] = STUDIO_KEYS;
export const studioProblem = (tool: string): string | null => (STUDIO_PANES.includes(tool) ? null : `studio tool \`${tool}\` is not one a pane can open as; it is one of: ${STUDIO_PANES.join(", ")}`);
