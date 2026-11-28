// WHERE A KEYSTROKE IS TEXT, NOT A COMMAND (Grokbot QA 2026-10-12, item 35: "after closing a dialog, focus is lost, and typed letters fire global hotkeys that jump to Drift, Agent activity...").
// The window-level shortcuts used to skip only INPUT, TEXTAREA and contenteditable, so any other focused thing (a select, a button, the page itself after a dialog closed) turned the letters a person
// was typing into navigation. Anything a person can type into is a typing target; so is anything inside a dialog.
const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .xterm, [role="dialog"], [role="textbox"], [role="combobox"]';

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el !== "object") return false;
  if ((el as any).isContentEditable) return true;
  try { return !!(el as any).closest?.(TYPING); } catch { return false; }
}

/** A letter shortcut fires only on an Alt chord, never on a bare letter and never while a person is typing; Escape is not a letter and is handled by its callers. */
export function isShortcutChord(e: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "repeat" | "isComposing" | "target">): boolean {
  return e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat && !e.isComposing && !isTypingTarget(e.target);
}
