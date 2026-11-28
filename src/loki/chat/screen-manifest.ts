// SCREEN MANIFEST (operator 2026-07-26: "the chat sees what I see") — deterministically, no vision:
// the app serializes its OWN state. Widgets/panes with live internals PUBLISH one-line snapshots
// here whenever they change; payload describers cover everything else; composeScreenManifest
// assembles the block that rides each interviewer turn as {{screen}} (hard-capped, stable order).
// LESS_COGNITION_MORE_DETERMINISTIC applied to context: exact, token-cheap, no OCR.
import type { Widget } from "@/loki/widgets/types";
import { paneDisplay } from "@/loki/widgets/types";

const live = new Map<string, string>();

// widgets/panes with live internals publish ONE line (null/empty clears it — call on unmount too)
export function reportScreenState(uid: string, line: string | null) {
  if (line == null || !line.trim()) live.delete(uid);
  else live.set(uid, line.replace(/\s*\n+\s*/g, " · ").slice(0, 240));
}
export const clearScreenState = (uid: string) => { live.delete(uid); pages.delete(uid); };

// SCREEN PAGES (operator 2026-09-19: "make the antiChat see the screen on the left and know every
// info of X-ray"): a screen with a lot of deterministic content publishes a markdown PAGE — the X-ray
// brief (verdict, hotspots, laws, movers, authors, activity), the open file's dossier, the folder
// paper. Pages ride the manifest after the one-liners; each is capped, the whole manifest is capped.
const pages = new Map<string, string>();
export const PAGE_CAP = 9000;
export const MANIFEST_CAP = 20000;
export function reportScreenPage(uid: string, md: string | null) {
  if (md == null || !md.trim()) pages.delete(uid);
  else pages.set(uid, md.trim().slice(0, PAGE_CAP));
}
export const screenPages = () => Array.from(pages.entries());

export function widgetUid(w: Widget): string {
  return String((w?.payload as any)?._uid ?? w?.key ?? w?.kind ?? "widget");
}

// one line per widget from its PAYLOAD alone — always available, no live reporting required
export function describeWidget(w: Widget): string {
  const p: any = w?.payload ?? {};
  const bits: string[] = [];
  if (w.kind === "vibe-pane") bits.push(`${paneDisplay(String(p.paneKind ?? "")).name} pane`);
  else bits.push(String(w.kind).replace(/^atlas-|^vibe-/, "").replace(/-/g, " "));
  if (p.path) bits.push(String(p.path));
  if (p.dir) bits.push(`${String(p.dir)}/`);
  if (p.slug) bits.push(String(p.slug));
  if (p.path) bits.push(String(p.path));
  if (p.item?.title) bits.push(`"${String(p.item.title).slice(0, 60)}"`);
  if (p.query) bits.push(`query "${String(p.query).slice(0, 40)}"`);
  return bits.join(" · ").slice(0, 200);
}

export function composeScreenManifest(parts: {
  zones?: { left: string[]; center: string[]; right: string[] };
  stage?: string[]; // the ONE-dock queue, in display order (antiDock 2026-07-26)
  docked?: { zone: string; w: Widget }[];
  instruments?: Widget[];
  extra?: string[];
}): string {
  const L: string[] = [];
  if (parts.stage) L.push(`layout — ONE dock, in order: [${parts.stage.join(" · ") || "—"}]`);
  if (parts.zones) L.push(`layout: left[${parts.zones.left.join(", ") || "—"}] · center[${parts.zones.center.join(", ") || "—"}] · right[${parts.zones.right.join(", ") || "—"}]`);
  const seen = new Set<string>();
  for (const d of parts.docked ?? []) {
    if (!d.w) continue;
    const uid = widgetUid(d.w); seen.add(uid);
    L.push(`docked(${d.zone}) #${uid} — ${live.get(uid) ?? describeWidget(d.w)}`);
  }
  const inst = parts.instruments ?? [];
  if (inst.length) {
    L.push(`instruments rail (${inst.length}):`);
    for (const w of inst.slice(0, 14)) { const uid = widgetUid(w); seen.add(uid); L.push(`  #${uid} — ${live.get(uid) ?? describeWidget(w)}`); }
    if (inst.length > 14) L.push(`  … +${inst.length - 14} more`);
  }
  // live lines not tied to a listed widget — agent panes, the fullscreen page, open tools
  for (const [uid, line] of live) if (!seen.has(uid)) L.push(`live · ${line}`);
  for (const x of parts.extra ?? []) L.push(String(x));
  for (const [uid, md] of pages) L.push(`\n## page · ${uid}\n${md}`);
  return L.join("\n").slice(0, MANIFEST_CAP);
}

// ── THE TWO-TIER HANDS (operator 2026-07-26): global verbs (navigate, open_ide_view) work on
// every screen; LOCAL verbs are valid only where the screen publishes them. Each screen ships its
// own deterministic action map — these lines ride the manifest so the AI knows what THIS screen
// can do, and the prompt forbids local verbs the manifest doesn't list.
export const STAGE_ACTIONS = [
  "local actions (antiDesk — the dock queue):",
  "  open_widget #uid — open that widget fullscreen",
  "  close_widget #uid — DESTROY its docked slot (it stays in the instruments history)",
  "  close_all_widgets — destroy every docked widget on the stage",
  "  dock #uid — dock an instruments widget at the END of the queue",
  "  dock_move #uid pos=N — reorder: move a docked widget to position N among the docked widgets",
  "  summon /graph /xray /design /review /docs /constitution /authors /code /git /board /cost /queue /memory — generate a read widget ($0)",
];
export function screenActionsFor(pathname: string): string[] {
  if (pathname.startsWith("/operations/atlas") || pathname.startsWith("/operations/design")) return [
    "local actions (antiIDE):",
    "  open_ide_view view=<graph|diagram|stories|gravity|history|review|diff|gitgraph|docs|describe|structure|snapshot|constitution|agents|books|insights|runner|coverage|telemetry|authors> — open that sidebar tab (books = the Import Technical Book control center)",
    "  open_ide_view path=<repo-relative file> — open that file on the atlas",
    "  open_ide_view view=review path=<file> — the FILE REVIEW window of that file",
  ];
  if (pathname === "/") return STAGE_ACTIONS;
  return ["local actions: none published for this screen yet — global tier only (navigate · open_ide_view)"];
}
