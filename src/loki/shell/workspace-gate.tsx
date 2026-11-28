// WorkspaceGate — with no workspace active there is no start page (operator 2026-11-23): the same picture and layout
// as an empty Cowork thread (the dune wallpaper, dimmed, a line of text and one outlined button), and the button, "Start here", chooses a folder. Choosing it creates
// and opens the workspace; nothing else is asked. Once one is active the children (the real shell) render.
//
// A plain browser cannot read an absolute path, so the button tries the native dialog on the serve's host and, where
// there is none, opens the in-app folder browser instead.
import React, { useState } from "react";
import { C } from "@/loki/theme";
import { useWorkspaces } from "@/loki/api/hooks";
import { addWorkspace, activateWorkspace, removeWorkspace, pickWorkspaceFolder } from "@/loki/api/dispatch";
import { FolderBrowser } from "./folder-browser";
import { InstallMultiplex } from "@/loki/avatars/InstallMultiplex";
import startImage from "@/assets/start-sun.webp";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const nav = '-apple-system, system-ui, sans-serif';

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { data, loading, refetch } = useWorkspaces();
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  // Initial load: show a quiet splash (don't flash the shell, don't flash the gate).
  if (loading && !data) return <Splash />;
  const active = data?.active ?? null;
  // No setup wizard (operator 2026-11-23): a workspace opens straight into Cowork; the seats are detected.
  if (active) return <>{children}</>;
  return <WorkspaceOnboard data={data} refetch={refetch} />;
}

function Splash() {
  return (
    <div style={{ height: "100vh", width: "100vw", display: "grid", placeItems: "center", background: C.bg }}>
      <div style={{ fontFamily: mono, fontSize: 12, color: C.muted }}>connecting to the substrate…</div>
    </div>
  );
}

// Said only when NOTHING could show the machine's own folder window. It is never the end of the road: the in-app folder browser opens as the last resort.
export const NO_PICKER = "this machine has no folder window antiloki can open (zenity, kdialog and the desktop portal were all missing): pick the folder here, or install zenity";

/** Linux (not Android): our own folder window. Windows and macOS have a native dialog that is already friendly. */
export const prefersOwnPicker = (): boolean => typeof navigator !== "undefined" && /linux/i.test(navigator.platform ?? "") && !/android/i.test(navigator.userAgent ?? "");

const slugify = (s: string) => (s || "").split(/[\\/]/).filter(Boolean).pop()?.replace(/[^a-z0-9._-]/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "";

function WorkspaceOnboard({ data, refetch }: any) {
  const others = (data?.workspaces ?? []).filter((w: any) => w.db_dir != null && w.is_active !== 1 && w.missing !== true).slice(0, 4);
  const [picking, setPicking] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = async (path: string) => {
    const n = slugify(path);
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(n)) { setErr("that folder's name cannot be a workspace name; pick another folder"); return; }
    setBusy(true); setErr(null);
    const r = await addWorkspace(n, path.trim());
    if (!r.ok) { setBusy(false); setErr(r.error || "could not add the workspace"); return; }
    const a = await activateWorkspace(n);
    setBusy(false);
    if (!a.ok) { setErr("added, but activation failed — open it again from the list"); refetch(); return; }
    refetch(); // active is set → the gate lets the shell in
  };
  const choose = async () => {
    // On Linux the system's own dialogs differ from one desktop to the next (some start in a random folder, show hidden folders, lack "new folder"), so antiloki's own window is the one: the same everywhere, starting at home.
    if (prefersOwnPicker()) { setErr(null); setBrowsing(true); return; }
    setPicking(true); setErr(null);
    try {
      const { path: chosen, supported } = await pickWorkspaceFolder();
      if (chosen) await open(chosen); else if (!supported) { setErr(NO_PICKER); setBrowsing(true); }
    } catch { setBrowsing(true); } finally { setPicking(false); }
  };
  const activate = async (n: string) => {
    setBusy(true); setErr(null);
    const a = await activateWorkspace(n);
    setBusy(false);
    if (a.ok) refetch(); else setErr(a.error || "activate failed");
  };

  return (
    <div data-testid="gate" style={{ position: "relative", height: "100vh", width: "100vw", overflow: "hidden", background: `#0b0a09 url(${startImage}) center / cover no-repeat`, color: C.fg, fontFamily: nav }}>
      <style>{`@keyframes gateIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(10,9,8,.42)" }} />
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div data-testid="gate-card" style={{ textAlign: "center", color: "rgba(236,233,230,.78)", fontSize: 13, lineHeight: 1.6, maxWidth: 360, padding: "0 16px", animation: "gateIn .4s ease-out" }}>
          <div style={{ color: C.fg, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No folder yet</div>
          Choose the project you want to work in. Agents run in real terminals.
          <div>
            <button data-testid="gate-choose" onClick={choose} disabled={picking || busy}
              style={{ marginTop: 12, fontFamily: nav, fontSize: 12.5, padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.brand}`, background: "transparent", color: C.brand, cursor: picking || busy ? "default" : "pointer" }}>
              {picking ? "waiting for the folder dialog…" : busy ? "opening…" : "Start here"}
            </button>
          </div>
          {err && <div data-testid="gate-error" style={{ marginTop: 12, fontFamily: mono, fontSize: 11, color: C.bad, lineHeight: 1.5 }}>{err}</div>}
          {others.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {others.map((w: any) => (
                <button key={w.id} onClick={() => activate(w.name)} disabled={busy} title={w.root_path}
                  style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "rgba(10,9,8,.4)", cursor: busy ? "default" : "pointer", fontFamily: mono, fontSize: 11, color: C.muted }}>▣ {w.name}</button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 22 }}><InstallMultiplex /></div>
        </div>
      </div>
      {browsing && <FolderBrowser onPick={(p) => { setBrowsing(false); void open(p); }} onClose={() => setBrowsing(false)} />}
    </div>
  );
}
