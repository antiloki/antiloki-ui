// SWITCHING WORKSPACES IS A WHOLE-APP EVENT (operator 2026-09-25: "on switching workspaces should show a loading on
// the entire screen and update with the new workspace data").
//
// It was not treated as one. `activateWorkspace` re-mounts the serve's entire DB set for another project, but on this
// side exactly ONE surface listened for the change (chat-thread) — so every other screen went on showing the previous
// project's cards, panes, runs and costs until something unrelated happened to refetch. That is worse than a slow
// screen: the data was real, just from a different repo, and nothing on screen said so.
//
// Two halves, and the second is the one that matters:
//   · this veil, so the switch is visibly an event rather than a silent swap;
//   · `usePoll` DROPS its data on the same signal (api/hooks.ts), so no poller can keep serving the old workspace's
//     payload. The veil without that would be a cosmetic pause in front of stale numbers.
//
// Three window events, dispatched by the switcher: `antiloki:workspace-switching` (the request went out),
// `antiloki:workspace-changed` (it took), `antiloki:workspace-switch-failed` (it did not — the veil must never be a
// screen you cannot leave).
import React from "react";
import { C, mono } from "@/loki/theme";

export const SWITCHING = "antiloki:workspace-switching";
export const CHANGED = "antiloki:workspace-changed";
export const FAILED = "antiloki:workspace-switch-failed";

/** CLOSING AN EPISODE IS THE SAME KIND OF WAIT (operator 2026-09-28: "after i close the episode it took a long time
 *  to show the new episode. I understand, but should at least show the page loading with no option of click and make
 *  mistakes"). It is a consolidation call with a three-minute ceiling, and the only thing that blocked during it was
 *  the 9px pill that started it — the composer stayed live, so an ask could be typed into an episode that was being
 *  folded up underneath it. Same veil, same guarantee that it always comes down, different words. */
export const EPISODE_CLOSING = "antiloki:episode-closing";
export const EPISODE_CLOSED = "antiloki:episode-closed";
export const EPISODE_FAILED = "antiloki:episode-close-failed";

/** WHY THE VEIL IS STILL UP AFTER THE SWITCH TOOK. The serve answers activation as soon as it has re-mounted the DB
 *  set, but this side then has to refetch everything, so dropping the veil on `changed` would flash empty screens. A
 *  short settle keeps it up while the first refetches land — long enough to cover them, short enough that nobody reads
 *  it as a hang. */
export const SETTLE_MS = 700;

/** what the veil says: the workspace being switched to, when the event carried a name. A veil that cannot name its
 *  destination says the generic thing rather than inventing one. Pure. */
export function veilText(name: string | null, kind: "workspace" | "episode" = "workspace"): string {
  if (kind === "episode") return "closing the episode…";
  return name ? `switching to ${name}…` : "switching workspace…";
}

/** the line under it: why the wait is worth sitting through. Pure. */
export function veilWhy(kind: "workspace" | "episode" = "workspace"): string {
  return kind === "episode"
    ? "it is being consolidated into a summary and a journey — the next one opens when that lands"
    : "the whole screen reloads — panes, runs and costs all belong to a workspace";
}

export function WorkspaceVeil() {
  const [name, setName] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<"workspace" | "episode">("workspace");
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    let settle: any = null;
    const start = (e: Event) => {
      const n = (e as CustomEvent)?.detail?.name;
      setName(typeof n === "string" && n ? n : null);
      setKind(e.type === EPISODE_CLOSING ? "episode" : "workspace");
      setOn(true);
      if (settle) { clearTimeout(settle); settle = null; }
    };
    // THE VEIL MUST ALWAYS COME DOWN. A switch that took lifts it after the settle; one that failed lifts it at once,
    // because the operator is still on the old workspace and needs the screen back to try again.
    const done = () => { if (settle) clearTimeout(settle); settle = setTimeout(() => { settle = null; setOn(false); }, SETTLE_MS); };
    const failed = () => { if (settle) { clearTimeout(settle); settle = null; } setOn(false); };
    window.addEventListener(SWITCHING, start);
    window.addEventListener(CHANGED, done);
    window.addEventListener(FAILED, failed);
    window.addEventListener(EPISODE_CLOSING, start);
    window.addEventListener(EPISODE_CLOSED, done);
    window.addEventListener(EPISODE_FAILED, failed);
    return () => {
      if (settle) clearTimeout(settle);
      window.removeEventListener(SWITCHING, start);
      window.removeEventListener(CHANGED, done);
      window.removeEventListener(FAILED, failed);
      window.removeEventListener(EPISODE_CLOSING, start);
      window.removeEventListener(EPISODE_CLOSED, done);
      window.removeEventListener(EPISODE_FAILED, failed);
    };
  }, []);
  if (!on) return null;
  return (
    <div data-testid="workspace-veil" role="status" aria-live="polite" style={{
      position: "fixed", inset: 0, zIndex: 9000, display: "flex", flexDirection: "column", gap: 12,
      alignItems: "center", justifyContent: "center", background: `color-mix(in oklab, ${C.bg} 88%, transparent)`,
      backdropFilter: "blur(2px)", animation: "antilokiFade .12s ease-out",
    }}>
      <style>{`@keyframes antilokiSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${C.border}`, borderTopColor: C.brand, animation: "antilokiSpin .7s linear infinite" }} />
      <div data-testid="workspace-veil-text" style={{ fontFamily: mono, fontSize: 11, color: C.dim, letterSpacing: .4 }}>{veilText(name, kind)}</div>
      <div style={{ fontFamily: mono, fontSize: 9.5, color: C.muted }}>{veilWhy(kind)}</div>
    </div>
  );
}
