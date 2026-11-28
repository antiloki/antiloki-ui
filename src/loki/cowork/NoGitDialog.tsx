// THE PROJECT IS NOT A GIT REPOSITORY (operator 2026-11-27: this was a line at the edge of the screen; it is a question, asked in the middle, with the two answers as buttons).
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { startGit } from "./api";

export function NoGitDialog({ onStarted, onKeep, forTeam }: { onStarted: () => void; onKeep: () => void; /** asked from a team's bar rather than for a worktree */ forTeam?: boolean }) {
  const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState("");
  const keep = React.useRef(onKeep); keep.current = onKeep;
  React.useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); keep.current(); } }; window.addEventListener("keydown", esc, true); return () => window.removeEventListener("keydown", esc, true); }, []);
  const start = async () => { setBusy(true); setError(""); const r = await startGit(); setBusy(false); if (r.ok) onStarted(); else setError(r.error ?? "Git could not be started"); };
  const btn: React.CSSProperties = { fontFamily: nav, fontSize: 13, padding: "7px 16px", borderRadius: 8, cursor: busy ? "default" : "pointer", background: "transparent" };
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="no-git-title" data-testid="no-git" style={{ position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", background: "rgba(0,0,0,.45)", padding: 16 }}>
      <div style={{ width: 440, maxWidth: "100%", padding: 20, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", gap: 12, color: C.fg, fontFamily: nav }}>
        <div id="no-git-title" style={{ fontWeight: 600, fontSize: 15 }}>{forTeam ? "A team needs Git" : "A worktree needs Git"}</div>
        <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>This project is not using Git yet. With Git, {forTeam ? "each worker gets a copy of its own" : "a thread can have a branch and folder of its own"}: you look at its work before it reaches your project folder, and you can throw it away.</div>
        <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.5 }}><b style={{ fontWeight: 600 }}>Start Git</b> makes a repository here and commits your files as they are. If there is no <span style={{ fontFamily: mono }}>.gitignore</span>, one is written that leaves out downloaded packages, builds and <span style={{ fontFamily: mono }}>.env</span> files. Nothing is uploaded.</div>
        {error ? <div data-testid="no-git-error" style={{ color: C.warn, fontSize: 12.5, lineHeight: 1.5, userSelect: "text" }}>{error}</div> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button data-testid="no-git-keep" onClick={onKeep} disabled={busy} style={{ ...btn, border: `1px solid ${C.border}`, color: C.fg }}>Cancel</button>
          <button autoFocus data-testid="no-git-start" onClick={() => void start()} disabled={busy} style={{ ...btn, border: `1px solid ${C.brand}`, color: C.brand }}>{busy ? "starting Git…" : "Start Git"}</button>
        </div>
      </div>
    </div>
  );
}
