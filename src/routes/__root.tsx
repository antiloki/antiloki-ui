import { Outlet, createRootRoute, useRouter, useLocation, Navigate } from "@tanstack/react-router";
import React, { useEffect } from "react";
import { installBloom } from "@/loki/shell/bloom";
import { installWindowShell } from "@/loki/shell/window-shell";
import { ScreenSwitch } from "@/loki/shell/screen-switch";
import { ProgressiveTour } from "@/loki/shell/mini-tour";
import { UpdatePill } from "@/loki/desktop/update-pill";
import { BuildBanner } from "@/loki/shell/build-banner";
import { SlugProvider, useShell } from "@/loki/shell/slug-context";
import { ActivityBar } from "@/loki/shell/activity-bar";
import { Dock, DockPanel, dockInset } from "@/loki/shell/dock";
import { useDock } from "@/loki/shell/dock-store";
import { CornerMenu } from "@/loki/shell/corner-menu";
import { C } from "@/loki/theme";
import { AppearanceProvider, PageBackdrop } from "@/loki/cowork/AppearanceProvider";


// THE TABS SHELL (operator 2026-07-20): the app presents as a simple chat — the
// product tabs live on the text field (composer + the Dock), so the left rail is
// HIDDEN, not removed (we may need it later; the command palette still navigates).
const SHOW_LEFT_RAIL = false;
import { ChatDrawer } from "@/loki/shell/chat-drawer";
import { CommandPalette } from "@/loki/shell/command-palette";
import { TooltipHost } from "@/loki/shell/tooltip-host";
import { TeamToasts } from "@/loki/team/TeamToasts";
import { OnboardingProvider } from "@/loki/shell/onboarding";
import { MultiplexWindow } from "@/loki/avatars/MultiplexWindow";
import { WorkspaceGate } from "@/loki/shell/workspace-gate";
import { NotificationsDrawer } from "@/loki/shell/notifications-drawer";
import { AICallModalRoot } from "@/loki/components/AICallModal";
import { NewWorkspaceDialogHost } from "@/loki/shell/new-workspace-dialog";
import { WorkspaceVeil } from "@/loki/shell/workspace-veil";
import { FolderGoneNotice } from "@/loki/shell/folder-gone-notice";
import { isShortcutChord } from "@/loki/shell/typing-target";

// the rebuild mini bar is small and rare: it is fetched after the first paint, not before it
const ClosedAvatar = React.lazy(() => import("@/loki/avatars/ClosedAvatar").then((m) => ({ default: m.ClosedAvatar })));
const RebuildMini = React.lazy(() => import("@/loki/codebase/rebuild-panel").then((m) => ({ default: m.RebuildMini })));

/** AN ADDRESS THAT IS NOT A SCREEN GOES HOME (operator 2026-11-27: "kill the inexistent routes"): the app has Cowork, X-ray and Sagas; an old bookmark lands on Cowork. */
function NotFoundComponent() {
  return <Navigate to="/" replace />;
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  // Print actual error to console so the operator can see what crashed.
  // Format includes stack trace for diagnosis.
  console.error("[antiloki-fe] route error:", error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-2xl text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Something crashed in this view</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The screen failed to render. Open browser DevTools (F12) → Console for the full stack trace.
        </p>
        <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-foreground">
          {(error as Error | undefined)?.message || String(error)}
          {(error as Error | undefined)?.stack ? `\n\n${(error as Error).stack!.slice(0, 1500)}` : ""}
        </pre>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >Try again</button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  useEffect(() => { installBloom(); installWindowShell(); }, []);   // every window blooms out of where it was opened from
  const { pathname } = useLocation();
  // A PAGE FRAMED INSIDE ANOTHER (`/embed/...`, an X-ray pane in Cowork): no shell, no gates, no chat - the page alone, so it can name its own space. It wears the palette (not the wallpaper).
  // THE ONE AVATAR (N13): the desktop shell's small window shows this page alone, when the main window is closed with agents or teams still running
  if (typeof window !== "undefined" && window.location.pathname === "/avatar") return <AppearanceProvider wallpaper={false} pathname={pathname}><React.Suspense fallback={null}><ClosedAvatar /></React.Suspense></AppearanceProvider>;
  // MULTIPLEX AS AN APP (`/multiplex`): its small window alone
  if (typeof window !== "undefined" && window.location.pathname === "/multiplex") return <AppearanceProvider wallpaper={false} pathname={pathname}><MultiplexWindow /></AppearanceProvider>;
  // ONE PANE AS ITS OWN APP (`/pane/...`): the pane alone, with the palette and the tips
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/pane/")) return <AppearanceProvider wallpaper={false} pathname={pathname}><TooltipHost /><Outlet /></AppearanceProvider>;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/embed/")) return <AppearanceProvider wallpaper={false} pathname={pathname}><Outlet /></AppearanceProvider>;
  return (
    <AppearanceProvider pathname={pathname}>
    <SlugProvider>
      <OnboardingProvider>
        <TooltipHost />
      <TeamToasts />
        <GlobalShortcuts />
        <WorkspaceGate>
        <div style={{ position: "relative", display: "flex", flexDirection: "row", height: "100vh", width: "100vw", overflow: "hidden", background: C.bg, isolation: "isolate" }}>
          {/* THE WORN WALLPAPER, behind every screen but Cowork (which draws its own) */}
          <PageBackdrop pathname={pathname} />
          {/* fade on tab/route switch (operator: "add fade to the switch between tabs") */}
          <style>{`@keyframes antilokiFade{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}} .antiloki-chips::-webkit-scrollbar{display:none} .antiloki-chips>*{flex-shrink:0}`}</style>
          {/* IDE-shell (2026-06-24): the LEFT activity rail was the only chrome. Tabs shell
              (2026-07-20) hides it — navigation lives on the text field's product tabs. */}
          {SHOW_LEFT_RAIL && <ActivityBar />}
          <DockedMain />
          {/* the docked chat: a COLUMN on its edge — <main> above pads by its size (2026-09-18) */}
          <DockPanel />
          <Dock />
          {/* CornerMenu removed (operator 2026-07-23): the same menu lives on the dock text field —
              two profile circles was chrome duplication. */}
          <ChatDrawer />
          <NotificationsDrawer />
          <CommandPalette />
          {/* the rebuild's floating mini preview, on every screen but X-ray (rebuild-panel.tsx) */}
          <React.Suspense fallback={null}><RebuildMini /></React.Suspense>
          {/* the avatar dock is for when antiloki is CLOSED (one avatar, desktop overlay: not built yet); never over the open app (operator 2026-11-16) */}
          <AICallModalRoot />
          {/* STANDALONE (2026-09-17): the update pill — desktop-first, harmless in a tab. The LICENSE GATE is not here: it is mounted above the workspace gate (see RootComponent) */}
          <UpdatePill />
          <BuildBanner />
          <GlobalSwitch />
          {/* SWITCHING WORKSPACES COVERS THE WHOLE SCREEN (operator 2026-09-25) — every screen behind it belongs to
              the workspace being left. */}
          <WorkspaceVeil />
          {/* THE ACTIVE FOLDER VANISHED (QA report BUG-006): the serve rebinds on its own; this says so, once */}
          <FolderGoneNotice />
          {/* THE NEW-WORKSPACE WINDOW lives here, not in the dropdown that opens it (operator 2026-09-30): a hover menu that closes when the pointer leaves cannot hold a form */}
          <NewWorkspaceDialogHost />
          {/* THE PROGRESSIVE TOUR (2026-09-20): three steps per section, on its first access */}
          <ProgressiveTour />
          {/* THE AGENTS ARE IN THE SWITCHER NOW (operator 2026-09-23: "remove the agents running indication on the
              right bottom, the mini window — keep the agent running in background at a notification icon on the
              switcher top center"). The floating stack covered the bottom-right corner of every screen, which is
              where the Studio's buttons and the composer's chips live. See cockpit/agents-icon.tsx. */}
        </div>
        </WorkspaceGate>
      </OnboardingProvider>
    </SlugProvider>
    </AppearanceProvider>
  );
}

// THE SCREEN SWITCH EVERYWHERE (2026-09-18): antiDesk · ◌ ⏲ · antiIDE rides every screen. antiDesk
// ("/") mounts its own (it knows the widget instruments); every other route gets it here.
// the screen's main area, padded on the side the chat is docked on so the panel never covers content
function DockedMain() {
  const dock = useDock();
  const { pathname } = useLocation();
  return (
    <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", transition: "padding .2s ease", ...dockInset(dock, pathname) }}>
      <FadeOutlet />
    </main>
  );
}
function GlobalSwitch() {
  const { pathname } = useLocation();
  if (pathname === "/") return null;
  // the Sagas page has neither the Cowork · X-ray · Sagas switcher nor the floating instruments (the operator 2026-11-22); the logo menu stays
  if (pathname.startsWith("/sagas")) return <ScreenSwitch pill="none" tabs="none" />;
  return <ScreenSwitch />;
}

// Re-mounts on pathname change so the fade-in keyframe replays on every tab/route switch.
function FadeOutlet() {
  const { pathname } = useLocation();
  return (
    <div key={pathname} style={{ flex: 1, minHeight: 0, overflow: "auto", animation: "antilokiFade .42s ease-out" }}>
      <Outlet />
    </div>
  );
}

function GlobalShortcuts() {
  const router = useRouter();
  const { setNotifOpen, notifOpen, setPaletteOpen, paletteOpen, chatOpen, aiCallId, setAiCallId } = useShell();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      const nav = (to: string) => { e.preventDefault(); router.navigate({ to: to as any }); };
      // THE LETTER SHORTCUTS ARE ALT CHORDS (Grokbot QA 2026-10-12, item 35): a bare letter is somebody typing, and after a dialog closes the focus is on the page itself, not in a field. `e.code` because
      // Alt changes what `e.key` says on some layouts.
      if (isShortcutChord(e)) {
        switch (e.code) {
          case "KeyA": return nav("/operations/audit");
          case "KeyP": return nav("/pipeline");
          case "KeyO": return nav("/personas");
          case "KeyQ": return nav("/prompts");
          case "KeyD": return nav("/diffs");
          case "KeyK": return nav("/knowledge");
          case "KeyN": e.preventDefault(); setNotifOpen(!notifOpen); return;
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      { const tag = (e.target as HTMLElement)?.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return; }   // Escape keeps its old reach: not from a plain field
      switch (k) {
        case "Escape":
          if (aiCallId != null) { e.preventDefault(); setAiCallId(null); return; }
          if (paletteOpen) { e.preventDefault(); setPaletteOpen(false); return; }
          if (notifOpen && !chatOpen) { e.preventDefault(); setNotifOpen(false); return; }
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, notifOpen, paletteOpen, chatOpen, aiCallId, setNotifOpen, setPaletteOpen, setAiCallId]);
  return null;
}
