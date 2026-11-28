// Standard Vite + React SPA entry. No SSR. Mounts the TanStack Router
// against the generated route tree and hands control to React.
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installGlobalErrorReporting, reportFeError } from "./loki/api/error-report";
import { applyTheme, getTheme } from "./loki/theme";
import { bootAppearance } from "./loki/cowork/appearance";
import { GlobalNarrationDock } from "./loki/widgets/narration-player";
import { claimFromLocation } from "./loki/api/pairing";

installGlobalErrorReporting();
applyTheme(getTheme()); // set the persisted color theme (Ember / Midnight) before first paint
bootAppearance(); // and the Omarchy palette last worn (Cowork's appearance), so no screen flashes antiloki's own colours first

// FEAT-FE-ERROR-TELEMETRY: a route crash must NEVER render as a silent
// blank screen — that failure mode cost a full day of blind debugging
// ("the screen shows nothing") because the actual error lived only in the
// operator's devtools console. Every route error now renders its message
// + stack visibly and reports itself to the BE.
function RouteErrorPanel({ error }: { error: any }) {
  reportFeError("route-error", error?.message ?? String(error), error?.stack);
  return (
    <div style={{
      margin: 24, padding: 20, borderRadius: 8,
      background: "#2a1216", border: "1px solid #e5484d", color: "#ffd1d4",
      fontFamily: '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace', fontSize: 13,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: "#e5484d" }}>
        This screen crashed — the error below was reported to the substrate
      </div>
      <div style={{ marginBottom: 10 }}>{error?.message ?? String(error)}</div>
      {error?.stack && (
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, opacity: 0.8, maxHeight: 240, overflow: "auto" }}>
          {error.stack}
        </pre>
      )}
      <button onClick={() => location.reload()} style={{
        marginTop: 8, background: "transparent", border: "1px solid #e5484d",
        borderRadius: 5, color: "#ffd1d4", padding: "4px 12px", cursor: "pointer",
        fontFamily: "inherit", fontSize: 12,
      }}>reload</button>
    </div>
  );
}

// UI COMMAND BUS (operator 2026-07-26): the assistant navigates through the real router.
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultErrorComponent: RouteErrorPanel,
});
(window as any).__lokiRouter = router;


declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root in index.html");

// A PAIRING LINK (the phone's QR): trade the code for this device's token before anything asks the serve for anything
void claimFromLocation().then((paired) => {
if (paired && !paired.ok) {
  rootEl.innerHTML = "";
  const box = document.createElement("div"); box.setAttribute("data-testid", "pair-failed"); box.style.cssText = "margin:24px;padding:20px;border-radius:10px;border:1px solid #e5484d;background:#2a1216;color:#ffd1d4;font:14px system-ui,sans-serif;line-height:1.5";
  box.textContent = "This device could not be paired: " + (paired.error ?? "unknown error") + " Ask the machine for a new code (Phone, in the antiloki menu).";
  rootEl.appendChild(box); return;
}
createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
    {/* ♪ the narration jobs dock — bottom-right, survives every screen switch (the presses and
        the audio live at module level in narration-jobs.ts, outside any route's lifecycle) */}
    <GlobalNarrationDock />
  </StrictMode>,
);
});
