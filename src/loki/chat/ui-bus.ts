// UI COMMAND BUS (operator 2026-07-26: "an AI assistant that DOES things for you") — the
// interviewer returns whitelisted ui_json verbs grounded in the screen manifest; this executes
// them. navigate uses the app router; widget verbs travel as window events that any mounted
// component honors (open fullscreen, dock, summon via the slash palette). Whitelist-only, capped,
// one bad command never blocks the rest — the AI operates the UI, it never gets arbitrary eval.
export type UiCommand = { verb: string; to?: string; uid?: string; command?: string; side?: "left" | "right"; view?: string; path?: string; pos?: number };

const ALLOWED_NAV = new Set([
  "/", "/operations", "/operations/atlas", "/operations/design", "/operations/pulls", "/operations/tests",
  "/docs", "/features", "/knowledge", "/skills", "/reviews", "/kanban", "/ultra-review",
]);
const IDE_VIEWS = new Set(["graph", "diagram", "stories", "gravity", "history", "review", "diff", "gitgraph", "docs", "describe", "structure", "snapshot", "constitution", "agents", "insights", "runner", "coverage", "telemetry", "authors"]);
// antiIDE may not be mounted yet when a command targets it — the view request waits here.
let pendingIde: { view?: string; path?: string } | null = null;
export const consumePendingIdeView = () => { const p = pendingIde; pendingIde = null; return p; };

// one human-readable line per command — the CONFIRMATION button renders these.
export function describeUiCommand(c: UiCommand): string {
  if (c.verb === "navigate") return `go to ${c.to}`;
  if (c.verb === "open_widget") return `open #${String(c.uid).replace(/^#/, "")} fullscreen`;
  if (c.verb === "close_widget") return `close #${String(c.uid).replace(/^#/, "")}`;
  if (c.verb === "summon") return `generate ${c.command} ($0, deterministic)`;
  if (c.verb === "dock") return `dock #${String(c.uid).replace(/^#/, "")} at the end of the queue`;
  if (c.verb === "dock_move") return `move #${String(c.uid).replace(/^#/, "")} to position ${Number(c.pos) || 1}`;
  if (c.verb === "close_all_widgets") return "destroy ALL docked widgets (they stay in the instruments history)";
  if (c.verb === "open_ide_view") return `antiIDE → ${(c as any).view ?? "files"}${(c as any).path ? ` · ${(c as any).path}` : ""}`;
  return c.verb;
}

export function executeUiCommands(cmds: any): string[] {
  const done: string[] = [];
  const list = (Array.isArray(cmds) ? cmds : []).slice(0, 5) as UiCommand[];
  for (const c of list) {
    try {
      if (c.verb === "navigate" && typeof c.to === "string" && ALLOWED_NAV.has(c.to)) {
        const r = (window as any).__lokiRouter;
        if (r?.navigate) void r.navigate({ to: c.to }); else window.location.assign(c.to);
        done.push(`navigate ${c.to}`);
      } else if (c.verb === "open_widget" && c.uid) {
        window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "open_widget", uid: String(c.uid).replace(/^#/, "") } }));
        done.push(`open #${c.uid}`);
      } else if (c.verb === "dock" && c.uid) {
        window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "dock", uid: String(c.uid).replace(/^#/, ""), side: c.side === "left" ? "left" : "right" } }));
        done.push(`dock #${c.uid}`);
      } else if (c.verb === "summon" && typeof c.command === "string" && c.command.startsWith("/")) {
        window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "summon", command: c.command.slice(0, 120) } }));
        done.push(`summon ${c.command}`);
      } else if (c.verb === "close_widget" && c.uid) {
        window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "close_widget", uid: String(c.uid).replace(/^#/, "") } }));
        done.push(`close #${c.uid}`);
      } else if (c.verb === "dock_move" && c.uid) {
        const pos = Math.max(1, Math.min(40, Math.round(Number(c.pos) || 1)));
        window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "dock_move", uid: String(c.uid).replace(/^#/, ""), pos } }));
        done.push(`move #${c.uid} → pos ${pos}`);
      } else if (c.verb === "close_all_widgets") {
        window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "close_all_widgets" } }));
        done.push("destroy all docked widgets");
      } else if (c.verb === "open_ide_view") {
        const view = typeof c.view === "string" && IDE_VIEWS.has(c.view) ? c.view : undefined;
        pendingIde = { view, path: typeof c.path === "string" ? c.path.slice(0, 300) : undefined };
        window.dispatchEvent(new CustomEvent("antiloki:ui", { detail: { verb: "open_ide_view" } })); // mounted IDE consumes now
        const r = (window as any).__lokiRouter;
        if (r?.navigate) void r.navigate({ to: "/operations/atlas" }); else window.location.assign("/operations/atlas");
        done.push(`antiIDE → ${view ?? "files"}${pendingIde.path ? ` · ${pendingIde.path}` : ""}`);
      }
    } catch { /* whitelisted or nothing — and never cascade */ }
  }
  return done;
}
