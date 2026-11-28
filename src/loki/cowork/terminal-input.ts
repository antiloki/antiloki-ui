// WHAT A PERSON DOES AT AN AGENT'S TERMINAL THAT A PLAIN TERMINAL DOES NOT DO (operator 2026-11-11: "I cannot copy their text easily; Shift+Enter should jump a line; it is hard to show an image: paste it"). Pure parts, tested; the pane wires them.

/** A key event, as far as these rules look at it. */
export type KeyLike = { type: string; key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean };
/** Shift+Enter is a new line in the agent's input, not "send": the line feed (Ctrl+J) is the new line every agent CLI takes (Claude Code, Codex, Gemini, OpenCode). Only on the key going down. */
export const newlineFor = (e: KeyLike): string | null => (e.type === "keydown" && e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey ? "\n" : null);
/** Does a key event ask to copy? Ctrl+Shift+C (the terminal chord), Cmd+C on a Mac, or a plain Ctrl+C WHILE something is selected (with nothing selected it is the interrupt and goes to the program). */
export function copyChord(e: KeyLike, hasSelection: boolean): boolean {
  if (e.type !== "keydown" || e.altKey) return false; const k = e.key.toLowerCase(); if (k !== "c") return false;
  return (e.ctrlKey && e.shiftKey) || (e.metaKey && !e.ctrlKey) || (e.ctrlKey && !e.shiftKey && hasSelection);
}
/** How a file is named to an agent: `@path ` (the engines read a file or an image from it). Pure. */
export const fileRef = (relPath: string): string => `@${relPath.replace(/\s/g, "\\ ")} `;
/** The first file on a clipboard or a drop that an agent can be given (an image, a PDF or text). */
export function givableFile(files: ArrayLike<File> | null | undefined): File | null {
  for (const f of Array.from(files ?? [])) if (/^image\//.test(f.type) || f.type === "application/pdf" || f.type.startsWith("text/")) return f;
  return null;
}
/** A buffer as lines, the way a person copies it: trailing spaces cut, trailing empty lines dropped. `lineAt` reads a line of the terminal buffer. */
export function bufferLines(length: number, lineAt: (i: number) => string | undefined, from = 0, to = length): string {
  const out: string[] = []; for (let i = Math.max(0, from); i < Math.min(length, to); i++) out.push((lineAt(i) ?? "").replace(/\s+$/, ""));
  while (out.length && out[out.length - 1] === "") out.pop(); return out.join("\n");
}
export const COPY_ON_SELECT_KEY = "antiloki:copy-on-select";
export const copyOnSelect = (): boolean => { try { return localStorage.getItem(COPY_ON_SELECT_KEY) !== "0"; } catch { return true; } };
export const setCopyOnSelect = (on: boolean) => { try { localStorage.setItem(COPY_ON_SELECT_KEY, on ? "1" : "0"); } catch { /* private mode */ } };
export function fileToBase64(f: Blob): Promise<string> { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",").pop() ?? ""); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); }
export const FORCE_SELECT_KEY = "antiloki:select-in-mouse-programs";
export const forceSelectOn = (): boolean => { try { return localStorage.getItem(FORCE_SELECT_KEY) !== "0"; } catch { return true; } };
export const setForceSelectOn = (on: boolean) => { try { localStorage.setItem(FORCE_SELECT_KEY, on ? "1" : "0"); } catch { /* private mode */ } };

/** A batch of keystrokes ending in Enter (`\r`) is split: the text goes first and the Enter follows after a short pause, so an agent's composer reads the Enter as a submit, not as the end of a pasted block (found 2026-11-24: text and Enter in one batch stayed unsent). Pure. */
export const splitSubmit = (d: string): { body: string; submit: boolean } => (d.length > 1 && d.endsWith("\r") ? { body: d.slice(0, -1), submit: true } : { body: d, submit: false });
