// THE STUDIO, AS PANES (operator 2026-11-10: "the studio options to add a pane still show only 3 widgets ... at least skillshare should be there"). The Studio's tools were a catalogue of widgets;
// the add-pane menu offered three of them. This is the whole catalogue as panes, in one place the menu, the renderer and an agent's `antiloki_pane_open {kind:"studio"}` all read.
//
// Three ways a pane can be backed:
//   own      Notes, Preview: panes of their own (cockpit panes with a terminal-like body), as before
//   session  Design canvas, Brainstorm, Diff / review: a cockpit pane of that kind, created on the session, shown by the Studio's own pane widget
//   widget   the rest: a Studio widget (the code graph, the x-ray ...) hosted as it is, reading the atlas the rebuild already computed
//   sagas    the workspace's sagas: the Sagas screen embedded, for the open workspace (the page shows every workspace's)
//   skillshare  the skillshare panel: skills, agents, MCP and hooks shared across the machine's AI tools (its own component)

export type StudioGroup = "Tools" | "Design" | "Codebase" | "Skills";
export type StudioPane = {
  key: string; label: string; glyph: string; group: StudioGroup; hint: string;
  /** offered in the add-pane menu. The others stay openable by name (an agent's `antiloki_pane_open`, a command) but are not clutter in the menu. */ menu?: boolean;
  via: "own" | "session" | "widget" | "skillshare" | "sagas" | "webapps";
  /** widget: the registry kind, and the payload it opens with */ widget?: string; payload?: Record<string, unknown>;
  /** session: the cockpit pane kind */ paneKind?: string;
};

export const STUDIO_PANE_LIST: readonly StudioPane[] = [
  { key: "sagas", label: "Sagas", glyph: "⊙", group: "Tools", hint: "this workspace's sagas: goals, tasks, agents' episodes", menu: true, via: "sagas" },
  { key: "issues", label: "Sagas", glyph: "⊙", group: "Tools", hint: "the old Issues pane, now the sagas", via: "sagas" },
  { key: "notes", label: "Notes", glyph: "✎", group: "Tools", hint: "a scratch pad that stays", menu: true, via: "own" },
  { key: "preview", label: "Preview", glyph: "▶", group: "Tools", hint: "run the agent's app beside it", menu: true, via: "own" },
  { key: "shared-diff", label: "Diff", glyph: "±", group: "Tools", hint: "a diff you and the agent read together", menu: true, via: "widget", widget: "shared-diff" },
  { key: "diff", label: "Review", glyph: "⇄", group: "Tools", hint: "review what the agent changed", via: "session", paneKind: "diff" },
  { key: "brainstorm", label: "Brainstorm", glyph: "✦", group: "Tools", hint: "RFC and judgment drawer", via: "session", paneKind: "intent" },
  { key: "design-canvas", label: "Design canvas", glyph: "◫", group: "Design", hint: "sketch a screen", via: "session", paneKind: "design" },
  { key: "frames", label: "Frames", glyph: "▢", group: "Design", hint: "the screens as editable frames", menu: true, via: "widget", widget: "design-frames" },
  { key: "design-system", label: "Design system", glyph: "◐", group: "Design", hint: "tokens, palette and components harvested from the UI", via: "widget", widget: "design-view", payload: { tab: "system" } },
  { key: "code-graph", label: "Code graph", glyph: "⬡", group: "Codebase", hint: "who imports whom; the hubs", via: "widget", widget: "atlas-graph" },
  { key: "system-design", label: "System design", glyph: "▤", group: "Codebase", hint: "the architecture as boxes and arrows", via: "widget", widget: "atlas-diagram" },
  { key: "xray", label: "X-ray", glyph: "◈", group: "Codebase", hint: "riskiest files, smells, health", via: "widget", widget: "atlas-xray" },
  { key: "authors", label: "Authors", glyph: "☺", group: "Codebase", hint: "who owns what; the bus factor", via: "widget", widget: "atlas-authors" },
  { key: "constitution", label: "Constitution", glyph: "§", group: "Codebase", hint: "the laws and how faithfully the code keeps them", via: "widget", widget: "atlas-constitution" },
  { key: "code", label: "Code", glyph: "{}", group: "Codebase", hint: "a read-only viewer of the tree", via: "widget", widget: "atlas-code" },
  { key: "git-graph", label: "Git graph", glyph: "⑂", group: "Codebase", hint: "branches and history as they are on disk", via: "widget", widget: "atlas-git" },
  { key: "skill-library", label: "Skill library", glyph: "✦", group: "Skills", hint: "teachable skills the agents load", via: "widget", widget: "skill-library" },
  { key: "webapps", label: "Web apps", glyph: "◎", group: "Tools", hint: "the store of official MCPs and your own apps; install one and it is in the new-pane menu", via: "webapps" },
  { key: "skillshare", label: "Skills", glyph: "✧", group: "Skills", hint: "skills, agents, MCP and hooks shared across your AI tools", menu: true, via: "skillshare" },
];
export const STUDIO_GROUPS: readonly StudioGroup[] = ["Tools", "Design", "Codebase", "Skills"];
export const studioPane = (key: string | undefined): StudioPane | null => STUDIO_PANE_LIST.find((p) => p.key === key) ?? null;
/** The keys an agent may open as `studio` panes: all of them. */
export const STUDIO_KEYS: readonly string[] = STUDIO_PANE_LIST.map((p) => p.key);
/** What the add-pane menu offers, in this order: Sagas, Notes, Preview, Diff, Skills, Frames. */
export const MENU_ORDER: readonly string[] = ["sagas", "notes", "preview", "shared-diff", "skillshare", "frames"];
export const STUDIO_MENU: readonly StudioPane[] = MENU_ORDER.map((k) => STUDIO_PANE_LIST.find((p) => p.key === k)!).filter(Boolean);
export const studioByGroup = (): { group: StudioGroup; panes: StudioPane[] }[] => STUDIO_GROUPS.map((group) => ({ group, panes: STUDIO_PANE_LIST.filter((p) => p.group === group) }));

/** THE X-RAY SUBMENU of the add-pane menu (operator 2026-11-10: "x-ray pane, but it is actually a submenu with all the widget panes from x-ray"): every whole-space view the X-ray page draws, each its own pane
 *  (an `xray-view` pane, framed from `/embed/xray`). The views that need a file or folder (file review, folder paper, AST, code) are opened from the X-ray page or by an agent with the path. */
export type XrayMenuItem = { view: string; label: string; glyph: string; hint: string };
export const XRAY_MENU: readonly XrayMenuItem[] = [
  { view: "overview", label: "Overview", glyph: "◈", hint: "health, riskiest files, what changed" },
  { view: "working-tree", label: "Working tree", glyph: "≋", hint: "what is changing right now" },
  { view: "system-diagram", label: "System diagram", glyph: "▤", hint: "the architecture as boxes and arrows" },
  { view: "import-graph", label: "Import graph", glyph: "⬡", hint: "who imports whom; the hubs" },
  { view: "git-graph", label: "Git graph", glyph: "⑂", hint: "branches and history as they are on disk" },
  { view: "data-stories", label: "Data stories", glyph: "✎", hint: "what the numbers say, in sentences" },
  { view: "rules", label: "Quality rules", glyph: "✓", hint: "the deterministic rules: edit, switch on or off" },
  { view: "constitution", label: "Constitution", glyph: "§", hint: "the laws and how faithfully the code keeps them" },
  { view: "coverage", label: "Coverage", glyph: "▥", hint: "which files tests reach" },
  { view: "health-over-time", label: "Health over time", glyph: "↗", hint: "the score through the history" },
  { view: "review-history", label: "Review history", glyph: "⟲", hint: "past file reviews" },
  { view: "authors", label: "Authors", glyph: "☺", hint: "who owns what; the bus factor" },
  { view: "design", label: "Design", glyph: "◐", hint: "tokens, palette and components harvested from the UI" },
  { view: "telemetry", label: "Telemetry", glyph: "∿", hint: "what the substrate measured" },
];
