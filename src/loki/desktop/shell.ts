// THE SHELL BRIDGE (operator 2026-09-17: "antiloki as a standalone file for mac, windows and linux").
// The desktop build exposes Tauri on `window.__TAURI__` (withGlobalTauri) — no npm package, so the
// same FE bundle runs in a browser tab against the dev BE and inside the shell. Everything here
// degrades to a no-op / window.open outside the shell.

type TauriGlobal = { core?: { invoke: (cmd: string, args?: any) => Promise<any> }; opener?: { openUrl: (url: string) => Promise<void> } };

export function tauri(): TauriGlobal | null {
  try { return ((globalThis as any).__TAURI__ as TauriGlobal) ?? null; } catch { return null; }
}

export function isDesktop(): boolean { return !!tauri()?.core; }

/** Open a URL in the SYSTEM browser (checkout, docs). Inside the shell a plain window.open would
 *  open a second webview with no address bar — the customer must see the store's real URL. */
export async function openExternal(url: string): Promise<void> {
  const t = tauri();
  if (t?.opener?.openUrl) { try { await t.opener.openUrl(url); return; } catch { /* fall through */ } }
  if (t?.core) { try { await t.core.invoke("plugin:opener|open_url", { url }); return; } catch { /* fall through */ } }
  try { window.open(url, "_blank", "noopener"); } catch { /* nothing to do */ }
}

/** THE DOCS (operator 2026-10-12: "point that button to the complete docs ... the same docs from the landing page").
 *  One page on the website holds the documentation; every menu's Docs row opens it in the system browser. */
export const DOCS_URL = "https://antiloki.com/docs.html";
export function openDocs(): Promise<void> { return openExternal(DOCS_URL); }

export type UpdateInfo = { available: boolean; current: string; version?: string | null; notes?: string | null; date?: string | null };

export async function appInfo(): Promise<{ name: string; version: string; os: string; arch: string; port: number } | null> {
  const t = tauri();
  if (!t?.core) return null;
  try { return await t.core.invoke("app_info"); } catch { return null; }
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const t = tauri();
  if (!t?.core) return null;
  try { return await t.core.invoke("update_check"); } catch (e) { console.warn("[desktop] update check failed", e); return null; }
}

export async function installUpdate(): Promise<string | null> {
  const t = tauri();
  if (!t?.core) return "not the desktop app";
  try { await t.core.invoke("update_install"); return null; } catch (e: any) { return String(e?.message ?? e); }
}

/** THE OS FOLDER DIALOG (operator 2026-09-24, from the installed build: "the binary has a bug on click open
 *  project doesnt open the file explorer to choose a folder").
 *
 *  Choosing a project folder went to the SERVE, whose picker is a PowerShell/COM dialog that returns None on
 *  anything but Windows — so on Linux and macOS the button reported success with no path and opened nothing.
 *  Inside the shell the dialog plugin does this on all three platforms, and `dialog:allow-open` is already in
 *  the capability set. `directory: true` is the whole difference from pickFile below. */
export async function pickFolder(title = "choose the project folder"): Promise<string | null> {
  try { return await pickFolderStrict(title); } catch (e) { console.warn("[desktop] folder dialog failed", e); return null; }
}
/** The same dialog, but a dialog that could not open THROWS, so a caller can tell "dismissed" (null) from "broken" (throw) and try another way. */
export async function pickFolderStrict(title = "choose the project folder"): Promise<string | null> {
  const t = tauri();
  if (!t?.core) return null;
  const r = await t.core.invoke("plugin:dialog|open", { options: { title, multiple: false, directory: true } });
  if (typeof r === "string" && r) return r;
  if (Array.isArray(r) && typeof r[0] === "string") return r[0];
  return null;
}

/** ⊕ THE OS FILE DIALOG (2026-09-21): the desktop shell's native picker — the absolute path of any file on the PC,
 *  or null when the user cancelled. Not a desktop build → null (the caller falls back to the browser's picker). */
export async function pickFile(title = "attach a file"): Promise<string | null> {
  const t = tauri();
  if (!t?.core) return null;
  try {
    const r = await t.core.invoke("plugin:dialog|open", { options: { title, multiple: false, directory: false } });
    if (typeof r === "string" && r) return r;
    if (Array.isArray(r) && typeof r[0] === "string") return r[0];
    return null;
  } catch (e) { console.warn("[desktop] file dialog failed", e); return null; }
}
