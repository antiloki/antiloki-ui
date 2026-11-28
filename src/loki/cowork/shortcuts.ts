// THE KEYBOARD OF THE COWORK SCREEN, BY A LEADER KEY (operator 2026-11-22: every modifier is taken by the desktop or the browser, so antiloki asks for ONE chord, the leader, and then a plain key: Ctrl+Space, then T for a terminal). Every action has a default
// key after the leader and the person may change, clear or restore any of them, and the leader itself; the choices are kept per browser. This is the pure part: the actions, how a key event becomes a chord, what a chord may be, and what happens
// when two actions want the same key.
//
// What the LEADER may be: a chord with Ctrl, Alt or Super (a bare key belongs to the terminal under it), not one the browser or the desktop keeps for itself. What a key AFTER the leader may be: any plain key or Shift + a key (never Ctrl, Alt or Super, never Escape or Enter: Escape leaves the leader and Enter goes).

export type ActionId =
  | "focus.left" | "focus.right" | "focus.up" | "focus.down" | "focus.next" | "focus.prev"
  | "move.left" | "move.right" | "move.up" | "move.down"
  | "thread.prev" | "thread.next" | "thread.remove" | "thread.1" | "thread.2" | "thread.3" | "thread.4" | "thread.5" | "thread.6" | "thread.7" | "thread.8" | "thread.9" | "thread.10" | "browser.light" | "pane.files" | "agent.specialist"
  | "thread.new" | "team.new" | "pane.new" | "pane.agent" | "pane.terminal" | "pane.split-right" | "pane.split-below" | "pane.close" | "pane.zoom" | "pane.rename" | "pane.flip"
  | "space.next" | "space.prev"
  | "view.sidebar" | "view.appearance" | "view.shortcuts"
  | "look.terminal-more" | "look.terminal-less" | "look.pane-more" | "look.pane-less";

export type ActionGroup = "Focus" | "Move" | "Panes" | "Threads" | "Workspaces" | "View" | "Look";
export type Action = { id: ActionId; label: string; group: ActionGroup; chord: string };

/** The actions, in the order the editor lists them, each with its default chord. Defaults avoid what a shell's line editor uses most (Alt+F/B word jumps are the one old exception: Alt+B has been the sidebar). */
export const ACTIONS: readonly Action[] = [
  { id: "pane.terminal", label: "new terminal", group: "Panes", chord: "T" },
  { id: "pane.agent", label: "choose an agent", group: "Panes", chord: "A" },
  { id: "agent.specialist", label: "choose a specialist", group: "Panes", chord: "S" },
  { id: "browser.light", label: "open the light browser", group: "Panes", chord: "B" },
  { id: "pane.files", label: "open the files pane", group: "Panes", chord: "F" },
  { id: "pane.new", label: "new pane (a terminal, connectors, your panes)", group: "Panes", chord: "O" },
  { id: "pane.close", label: "close this pane", group: "Panes", chord: "W" },
  { id: "pane.zoom", label: "zoom this pane", group: "Panes", chord: "Z" },
  { id: "pane.rename", label: "rename this pane", group: "Panes", chord: "R" },
  { id: "pane.split-right", label: "split to the right", group: "Panes", chord: "\\" },
  { id: "pane.split-below", label: "split below", group: "Panes", chord: "-" },
  { id: "pane.flip", label: "flip side by side / stacked", group: "Panes", chord: "Shift+\\" },
  { id: "thread.new", label: "new thread", group: "Threads", chord: "N" },
  { id: "team.new", label: "new team", group: "Threads", chord: "L" },
  { id: "thread.prev", label: "dial up: the thread above (then ↑ ↓, Enter goes, Esc stays)", group: "Threads", chord: "Up" },
  { id: "thread.next", label: "dial down: the thread below (then ↑ ↓, Enter goes, Esc stays)", group: "Threads", chord: "Down" },
  { id: "thread.remove", label: "remove this thread (asks first)", group: "Threads", chord: "Q" },
  ...Array.from({ length: 10 }, (_, i): Action => ({ id: `thread.${i + 1}` as ActionId, label: `go to thread or team ${i + 1}`, group: "Threads", chord: String((i + 1) % 10) })),
  { id: "focus.left", label: "focus the pane to the left", group: "Focus", chord: "H" },
  { id: "focus.down", label: "focus the pane below", group: "Focus", chord: "J" },
  { id: "focus.up", label: "focus the pane above", group: "Focus", chord: "K" },
  { id: "focus.right", label: "focus the pane to the right", group: "Focus", chord: "Right" },
  { id: "focus.next", label: "focus the next pane", group: "Focus", chord: "]" },
  { id: "focus.prev", label: "focus the previous pane", group: "Focus", chord: "[" },
  { id: "move.left", label: "move this pane left", group: "Move", chord: "Shift+H" },
  { id: "move.down", label: "move this pane down", group: "Move", chord: "Shift+J" },
  { id: "move.up", label: "move this pane up", group: "Move", chord: "Shift+K" },
  { id: "move.right", label: "move this pane right", group: "Move", chord: "Shift+L" },
  { id: "space.next", label: "next workspace", group: "Workspaces", chord: "Shift+]" },
  { id: "space.prev", label: "previous workspace", group: "Workspaces", chord: "Shift+[" },
  { id: "view.sidebar", label: "show or hide the sidebar", group: "View", chord: "Space" },
  { id: "view.appearance", label: "appearance: opacity, background, themes", group: "View", chord: "P" },
  { id: "view.shortcuts", label: "these shortcuts", group: "View", chord: "/" },
  { id: "look.terminal-more", label: "terminals more opaque", group: "Look", chord: "Shift+0" },
  { id: "look.terminal-less", label: "terminals more see-through", group: "Look", chord: "Shift+9" },
  { id: "look.pane-more", label: "panes more opaque", group: "Look", chord: "Shift+8" },
  { id: "look.pane-less", label: "panes more see-through", group: "Look", chord: "Shift+7" },
];
// THE LEADER (the operator 2026-11-22): one chord the person picks; every shortcut is that chord and then one key. Ctrl+Space by default (the browser, the desktop and Omarchy leave it alone).
export const LEADER_KEY = "antiloki.cowork.leader";
export const DEFAULT_LEADER = "Ctrl+Space";
let LEADER = DEFAULT_LEADER;
export const getLeader = (): string => LEADER;
export const setLeader = (c: string): void => { LEADER = c; };
/** Why a chord cannot be the leader, or `null`. */
export function leaderProblem(chord: string): string | null {
  const c = normalizeChord(chord); if (!c) return "that is not a key combination";
  const parts = c.split("+"); const key = parts[parts.length - 1]; const mods = new Set(parts.slice(0, -1));
  if (!(mods.has("Ctrl") || mods.has("Alt") || mods.has("Meta"))) return "the leader needs Ctrl, Alt or Super with it: a bare key belongs to the terminal";
  if (key === "Escape" || key === "Enter" || key === "Backspace" || key === "Tab") return `${key} cannot be the leader`;
  if (c === "Alt+Left" || c === "Alt+Right" || c === "Alt+F4" || c === "Alt+Home") return "the desktop or the browser keeps that one";
  if (/^Ctrl\+Shift\+[TNWQRIJ]$/.test(c) || c === "Ctrl+Alt+Delete" || /^Ctrl\+[TNWQ]$/.test(c) || /^Ctrl\+(Tab|PageUp|PageDown)$/.test(c)) return "the browser keeps that one";
  return null;
}
export const ACTION_IDS: readonly ActionId[] = ACTIONS.map((a) => a.id);
export const SHORTCUTS_KEY = "antiloki.cowork.shortcuts";
/** What one press of a look shortcut changes an opacity by. */
export const OPACITY_STEP = 0.1;

// ── chords ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const CODE_KEYS: Record<string, string> = {
  BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", Backquote: "`", Space: "Space",
  CapsLock: "CapsLock", ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down", Enter: "Enter", Tab: "Tab", Escape: "Escape", Backspace: "Backspace", Delete: "Delete", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
};
/** The key of an event as a chord names it: from the physical key, so an Alt that types a symbol on this layout (Alt+Z → Ω) still reads Z. */
export function keyName(e: { code?: string; key?: string }): string | null {
  const c = e.code ?? "";
  let m = /^Key([A-Z])$/.exec(c); if (m) return m[1];
  m = /^Digit([0-9])$/.exec(c); if (m) return m[1];
  m = /^F([0-9]{1,2})$/.exec(c); if (m) return `F${m[1]}`;
  if (CODE_KEYS[c]) return CODE_KEYS[c];
  const k = e.key ?? "";
  if (k.length === 1 && /\S/.test(k)) return k.toUpperCase();
  return null;
}
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS"]);
type KeyLike = { code?: string; key?: string; altKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean };
/** The chord an event is, in one spelling (`Ctrl+Alt+Shift+Meta+Key`), or `null` for a lone modifier or a key with no name. */
export function chordOf(e: KeyLike): string | null {
  if (e.key && MODIFIER_KEYS.has(e.key)) return null;
  const k = keyName(e); if (!k) return null;
  return [e.ctrlKey ? "Ctrl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : "", e.metaKey ? "Meta" : "", k].filter(Boolean).join("+");
}
/** Does a keystroke typed into a field belong to the leader (so the field must not swallow it)? True for the leader chord itself, and for the key right after it while the leader window is open. Pure. */
export const keyBelongsToLeader = (leaderOpen: boolean, isLeaderChord: boolean): boolean => leaderOpen || isLeaderChord;
const ORDER = ["Ctrl", "Alt", "Shift", "Meta"];
/** A chord as typed by hand, in the one spelling (`shift+alt+h` → `Alt+Shift+H`), or `null` if it is not a chord. */
export function normalizeChord(s: string): string | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const parts = s.split("+").map((x) => x.trim()); if (s.trim().endsWith("++")) parts.splice(parts.length - 2, 2, "+");
  const mods = new Set<string>(); let key: string | null = null;
  for (const p of parts) {
    const low = p.toLowerCase();
    const mod = low === "ctrl" || low === "control" ? "Ctrl" : low === "alt" || low === "option" ? "Alt" : low === "shift" ? "Shift" : low === "meta" || low === "super" || low === "cmd" ? "Meta" : null;
    if (mod) mods.add(mod); else if (key === null && p) key = p.length === 1 ? p.toUpperCase() : (Object.values(CODE_KEYS).find((v) => v.toLowerCase() === low) ?? (/^f([0-9]{1,2})$/i.test(p) ? p.toUpperCase() : null));
    else return null;
  }
  if (!key) return null;
  return [...ORDER.filter((m) => mods.has(m)), key].join("+");
}

/** Why a key cannot follow the leader, or `null` if it can: a plain key or Shift + a key; Escape (leaves) and Enter (goes) are kept. */
export function chordProblem(chord: string): string | null {
  const c = normalizeChord(chord); if (!c) return "that is not a key";
  const parts = c.split("+"); const key = parts[parts.length - 1]; const mods = parts.slice(0, -1);
  if (mods.some((m) => m !== "Shift")) return "after the leader, press a plain key (or Shift with it)";
  if (key === "Escape" || key === "Enter" || key === "Backspace") return `${key} cannot be a shortcut key here`;
  return null;
}

// ── bindings ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the person changed: an action → its chord, or `""` when they cleared it. An action not here has its default. */
export type Overrides = Partial<Record<ActionId, string>>;
export type Bindings = Record<ActionId, string>;

export const defaultOf = (id: ActionId): string => ACTIONS.find((a) => a.id === id)!.chord;
export const defaultBindings = (): Bindings => Object.fromEntries(ACTIONS.map((a) => [a.id, a.chord])) as Bindings;

/** The settings from storage, never trusted: only known actions, only chords that may be shortcuts, and no two actions on one chord (the earlier in the list keeps it). */
export function parseOverrides(raw: unknown): Overrides {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return {}; } }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Overrides = {};
  for (const id of ACTION_IDS) {
    const x = (v as Record<string, unknown>)[id]; if (typeof x !== "string") continue;
    if (x === "") { out[id] = ""; continue; }
    const n = normalizeChord(x); if (n && !chordProblem(n)) out[id] = n;
  }
  return out;
}
export function resolve(overrides: Overrides): Bindings {
  const b = defaultBindings();
  for (const id of ACTION_IDS) { const o = overrides[id]; if (o !== undefined) b[id] = o; }
  // two actions on one chord can only come from a hand-edited file: the earlier one keeps it, the other goes unbound
  const seen = new Set<string>();
  for (const id of ACTION_IDS) { const c = b[id]; if (!c) continue; if (seen.has(c)) b[id] = ""; else seen.add(c); }
  return b;
}
/** Who holds a chord now, or `null`. */
export function holder(b: Bindings, chord: string, except?: ActionId): ActionId | null {
  const c = normalizeChord(chord); if (!c) return null;
  return ACTION_IDS.find((id) => id !== except && b[id] === c) ?? null;
}
export type SetResult = { ok: true; overrides: Overrides; displaced: ActionId | null } | { ok: false; error: string; holder?: ActionId };
/** Give an action a chord. If another action holds it the answer is a refusal naming that action, unless `take` says to take it from them (they are left with none). */
export function setChord(overrides: Overrides, id: ActionId, chord: string, take = false): SetResult {
  const c = normalizeChord(chord); const bad = c ? chordProblem(c) : "that is not a key combination";
  if (!c || bad) return { ok: false, error: bad ?? "that is not a key combination" };
  const b = resolve(overrides); const other = holder(b, c, id);
  if (other && !take) return { ok: false, error: `${labelOf(other)} already uses ${c}`, holder: other };
  const next: Overrides = { ...overrides };
  if (other) next[other] = "";
  next[id] = c;
  return { ok: true, overrides: tidy(next), displaced: other };
}
export const clearChord = (overrides: Overrides, id: ActionId): Overrides => tidy({ ...overrides, [id]: "" });
export const resetChord = (overrides: Overrides, id: ActionId): Overrides => { const n = { ...overrides }; delete n[id]; return n; };
/** An override equal to the default is no override. */
function tidy(o: Overrides): Overrides {
  const out: Overrides = {};
  for (const id of ACTION_IDS) { const v = o[id]; if (v === undefined) continue; if (v !== defaultOf(id)) out[id] = v; }
  return out;
}
export const labelOf = (id: ActionId): string => ACTIONS.find((a) => a.id === id)?.label ?? id;

/** The action a key event runs, or `null`. */
export function actionFor(b: Bindings, e: KeyLike): ActionId | null {
  const c = chordOf(e); if (!c) return null;
  return ACTION_IDS.find((id) => b[id] === c) ?? null;
}
/** A chord for the eye: `Alt+Shift+H` stays as it is; the symbols read as words only where a key has no printable name. */
export const showChord = (c: string): string => (c ? c.replace(/\bMeta\b/, "Super").replace(/(^|\+)Left$/, "$1←").replace(/(^|\+)Right$/, "$1→").replace(/(^|\+)Up$/, "$1↑").replace(/(^|\+)Down$/, "$1↓") : "none");
