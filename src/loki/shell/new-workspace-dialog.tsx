// THE NEW-WORKSPACE WINDOW (operator 2026-09-30: "when i try to create a new workspace, on clicking to select the folder the dropdown menu collapses and i have to try again from start. On click to
// create a new workspace a window appears on the center of the screen with all config options for this workspace").
//
// The form used to live INSIDE the workspace dropdown. That dropdown is hover-driven (it closes ~180 ms after the pointer leaves it), and choosing a folder opens a native dialog - so the pointer left,
// the dropdown closed, the form unmounted and everything typed was gone. A form like this belongs in a window of its own, and its state belongs to something that is not a menu: this module keeps it in a
// small store and `NewWorkspaceDialogHost` (mounted once at the app root) draws it, centered, over everything. Closing the dropdown, opening a native dialog or moving the pointer cannot touch it.
import React from "react";
import { createPortal } from "react-dom";
import { C, mono } from "@/loki/theme";
import { activateWorkspace, addWorkspace, pickWorkspaceFolder } from "@/loki/api/dispatch";
import { WORKSPACES_CHANGED } from "@/loki/api/hooks";
import { FolderBrowser } from "./folder-browser";
import { SWITCHING, CHANGED, FAILED } from "./workspace-veil";

export type NewWorkspaceForm = { name: string; path: string; switchNow: boolean; nameTouched: boolean };
const blank = (): NewWorkspaceForm => ({ name: "", path: "", switchNow: true, nameTouched: false });

let open = false;
let form: NewWorkspaceForm = blank();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach((l) => l()); };
export function openNewWorkspace(): void { open = true; form = blank(); emit(); }
export function closeNewWorkspace(): void { open = false; emit(); }
export function isNewWorkspaceOpen(): boolean { return open; }
export function newWorkspaceForm(): NewWorkspaceForm { return form; }
function patch(p: Partial<NewWorkspaceForm>) { form = { ...form, ...p }; emit(); }

/** a workspace name from a folder: its last segment, lower-cased, every run of characters the slug rule rejects turned into a dash. "C:\\dev\\My Project" -> "my-project". Pure - tested. */
export function suggestName(path: string): string {
  const seg = path.trim().replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  return seg.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "").replace(/-+$/g, "").slice(0, 60);
}
/** what is wrong with the form, in a sentence, or null. Pure - tested. */
export function formProblem(name: string, path: string): string | null {
  if (!path.trim()) return "choose the project folder (or paste its absolute path)";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name.trim())) return "the name is a slug: letters, digits, . _ - and no spaces";
  return null;
}

function useStore(): void { React.useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version, () => version); }

const field: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.fg, fontFamily: mono, fontSize: 12, outline: "none", boxSizing: "border-box" };
const label: React.CSSProperties = { fontFamily: mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: C.muted, marginBottom: 4 };

export function NewWorkspaceDialogHost({ onCreated }: { onCreated?: () => void } = {}) {
  useStore();
  const [picking, setPicking] = React.useState(false);
  const [browsing, setBrowsing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { if (!open) { setBrowsing(false); setErr(null); setBusy(false); setPicking(false); } }, [version]);   // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!open) return;
    // Escape closes the innermost thing: the folder browser if it is open, the window only when it is not (audit 2026-10-01: it closed both, and the half-chosen folder with them)
    const esc = (e: KeyboardEvent) => { if (e.key !== "Escape" || busy || picking) return; if (browsing) setBrowsing(false); else closeNewWorkspace(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, busy, picking, browsing]);
  if (!open || typeof document === "undefined") return null;

  const setPath = (p: string) => { patch({ path: p, ...(form.nameTouched ? {} : { name: suggestName(p) }) }); setErr(null); };
  async function chooseFolder() {
    setPicking(true); setErr(null);
    const { path, supported } = await pickWorkspaceFolder();
    setPicking(false);
    if (path) setPath(path);
    else if (!supported) setBrowsing(true);
  }
  async function create() {
    const problem = formProblem(form.name, form.path);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    const r = await addWorkspace(form.name.trim(), form.path.trim());
    if (!r.ok) { setBusy(false); setErr(r.error || "could not add the workspace"); return; }
    const name = form.name.trim();
    window.dispatchEvent(new Event(WORKSPACES_CHANGED));
    if (form.switchNow) {
      // the same veil the dropdown raises: the whole screen belongs to a workspace
      window.dispatchEvent(new CustomEvent(SWITCHING, { detail: { name } }));
      const a = await activateWorkspace(name);
      if (a.ok) window.dispatchEvent(new CustomEvent(CHANGED, { detail: { name } }));
      else { window.dispatchEvent(new CustomEvent(FAILED, { detail: { name, error: a.error } })); setBusy(false); setErr(`added, but could not switch to it: ${a.error ?? "unknown error"}`); onCreated?.(); return; }
    }
    setBusy(false); closeNewWorkspace(); onCreated?.();
  }

  return createPortal(
    <div data-testid="new-workspace-overlay" style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy && !picking) closeNewWorkspace(); }}>
      <div role="dialog" aria-modal="true" aria-label="new workspace" data-testid="new-workspace-dialog"
        style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px", boxShadow: "0 24px 70px rgba(0,0,0,.6)", fontFamily: mono }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 14, color: C.fg, fontWeight: 700 }}>New workspace</span>
          <span style={{ flex: 1 }} />
          <button data-testid="new-workspace-close" onClick={closeNewWorkspace} disabled={busy || picking} title="close" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 14 }}>✕</button>
        </div>

        <div style={label}>project folder</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input data-testid="new-workspace-path" value={form.path} onChange={(e) => setPath(e.target.value)} placeholder="/home/you/projects/my-app   (or choose…)" spellCheck={false} style={{ ...field, flex: 1 }} />
          <button data-testid="new-workspace-choose" onClick={() => void chooseFolder()} disabled={picking || busy}
            style={{ ...field, width: "auto", cursor: "pointer", color: C.fg, whiteSpace: "nowrap" }}>{picking ? "waiting for the dialog…" : "⌖ choose folder…"}</button>
          <button data-testid="new-workspace-browse" onClick={() => setBrowsing((b) => !b)} disabled={busy} title="look through this machine's folders here" style={{ ...field, width: "auto", cursor: "pointer", color: C.muted }}>browse</button>
        </div>
        {browsing && <FolderBrowser start={form.path.trim() || undefined} onPick={(p) => setPath(p)} onClose={() => setBrowsing(false)} />}

        <div style={{ ...label, marginTop: 12 }}>name</div>
        <input data-testid="new-workspace-name" value={form.name} onChange={(e) => patch({ name: e.target.value, nameTouched: true })} placeholder="a short slug - filled in from the folder" spellCheck={false} style={field} />
        <div style={{ fontSize: 10, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>letters, digits, . _ - · it is how antiloki lists and switches to this project</div>

        <div style={{ ...label, marginTop: 14 }}>when it is created</div>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 11.5, color: C.fg, lineHeight: 1.5 }}>
          <input data-testid="new-workspace-switch" type="checkbox" checked={form.switchNow} onChange={(e) => patch({ switchNow: e.target.checked })} style={{ marginTop: 3 }} />
          <span>switch to it now<span style={{ display: "block", fontSize: 10, color: C.dim }}>the whole screen moves to the new project, and antiloki starts reading its code in the background (no AI calls, nothing leaves this machine)</span></span>
        </label>

        {err && <div data-testid="new-workspace-error" style={{ marginTop: 12, color: C.bad, fontSize: 11, lineHeight: 1.5 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button data-testid="new-workspace-cancel" onClick={closeNewWorkspace} disabled={busy || picking} style={{ ...field, width: "auto", cursor: "pointer", color: C.muted }}>cancel</button>
          <button data-testid="new-workspace-create" onClick={() => void create()} disabled={busy || picking}
            style={{ ...field, width: "auto", cursor: busy ? "default" : "pointer", color: C.bg, background: C.brand, border: "none", fontWeight: 700 }}>{busy ? "provisioning…" : "create workspace"}</button>
        </div>
      </div>
    </div>, document.body);
}
