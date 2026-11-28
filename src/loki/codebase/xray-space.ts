// X-RAY ACROSS SPACES (operator 2026-11-10: "make x-ray work for multiple spaces at the same time with a filter per space, so it shows the last selected space on x-ray"). The serve answers a request that names a
// workspace from that workspace's own database (the `X-Antiloki-Workspace` header, `client.ts`), so X-ray can read, rebuild and edit the rules of ANY registered space while Cowork keeps the one it has open. The choice is
// remembered (the last space looked at is the one X-ray opens on) and lives only while X-ray is open: leaving the screen puts every request back on the active workspace.
import * as React from "react";
import { getRequestWorkspace, setRequestWorkspace } from "@/loki/api/client";
import type { Workspace } from "@/loki/api/dispatch";
import { fetchWorkspacesShared, useWorkspaces, WORKSPACES_CHANGED } from "@/loki/api/hooks";

const KEY = "antiloki.xray.space";

export function rememberedSpace(): string | null { try { return localStorage.getItem(KEY) || null; } catch { return null; } }
function remember(root: string | null) { try { if (root) localStorage.setItem(KEY, root); else localStorage.removeItem(KEY); } catch { /* private mode */ } }

/** The space X-ray shows: the remembered one if it is still a registered, existing folder, else the one the serve has open. Pure. */
export function pickSpace(workspaces: Workspace[], remembered: string | null): string | null {
  const live = workspaces.filter((w) => !w.missing);
  const hit = remembered ? live.find((w) => w.root_path === remembered) : undefined;
  return (hit ?? live.find((w) => w.is_active === 1) ?? live[0])?.root_path ?? null;
}

/** The spaces to offer, the serve's own (the one Cowork has open) marked. Pure. */
export function spaceChips(workspaces: Workspace[]): { root: string; name: string; open: boolean }[] {
  return workspaces.filter((w) => !w.missing).map((w) => ({ root: w.root_path, name: w.name, open: w.is_active === 1 }));
}

/** Point every request at `root` (null → the active workspace) and have the workspace list read again. NOT the whole-app "workspace changed" signal: that one is for the serve switching workspaces, drops every poller's data and
 *  puts the app back behind its splash, which would tear this very screen down. The screen is keyed on the space instead, so another space is a fresh mount that fetches its own data. */
export function applySpace(root: string | null, activeRoot: string | null) {
  const next = root && root !== activeRoot ? root : null;
  if (next === getRequestWorkspace()) return;     // nothing moved: no poller has anything to fetch again
  setRequestWorkspace(next);
  window.dispatchEvent(new Event(WORKSPACES_CHANGED));
}

/** X-ray's space: `chosen` is what the screen is about; `choose` switches it (and remembers it). Everything that reads through the API client follows. `ready` is false until the first choice has been applied, so the
 *  screen does not fetch one space's data and then another's. */
export function useXraySpace() {
  const ws = useWorkspaces();
  const list = ws.data?.workspaces ?? [];
  const serveActive = list.find((w) => w.is_active === 1)?.root_path ?? null;
  const [chosen, setChosen] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  // the first choice: the remembered space (when it is still there) — applied before X-ray fetches anything
  React.useEffect(() => {
    if (ready || !ws.data) return;
    const first = pickSpace(list, rememberedSpace());
    setChosen(first);
    applySpace(first, serveActive);
    setReady(true);
  }, [ws.data, ready, list, serveActive]);
  // leaving X-ray: the requests are the active workspace's again
  React.useEffect(() => () => { if (getRequestWorkspace()) { setRequestWorkspace(null); window.dispatchEvent(new Event(WORKSPACES_CHANGED)); } }, []);
  const choose = React.useCallback((root: string) => { remember(root); setChosen(root); applySpace(root, serveActive); void fetchWorkspacesShared(); }, [serveActive]);
  return { spaces: spaceChips(list), chosen, serveActive, ready: ready || (!ws.data && !ws.loading), choose };
}

/** What the screen below reads: the spaces, the chosen one, and how to switch. Null outside the X-ray page (a widget in a Cowork pane is about the open workspace). */
export const XraySpaceContext = React.createContext<ReturnType<typeof useXraySpace> | null>(null);
