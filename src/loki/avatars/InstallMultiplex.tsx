// THE ONBOARDING STEP (operator 2026-11-27: "install the multiplex... a simple step in one click"): one button on the start screen. Where the browser offers to install, the click installs; where it does not, it opens the Multiplex window.
import * as React from "react";
import { C } from "@/loki/theme";
import { MULTIPLEX_PATH, useMultiplexInstall } from "./multiplex-app";

export function InstallMultiplex() {
  const { install, installed } = useMultiplexInstall();
  if (typeof window !== "undefined" && (window as any).__TAURI__) return null;   // the desktop app has its own corner mark
  return (
    <div data-testid="install-multiplex" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 12.5 }}>
      <button data-testid="install-multiplex-btn" disabled={installed} onClick={() => (install ? install() : void window.open(MULTIPLEX_PATH, "_blank", "popup,width=340,height=480"))}
        style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "color-mix(in srgb, #0d1012 62%, transparent)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 14px", color: C.fg, font: "inherit", cursor: installed ? "default" : "pointer" }}>
        <span aria-hidden style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 7, fontWeight: 700, fontSize: 11, color: "#fff", border: "1.5px solid", background: "#0d1012", borderColor: C.brand }}>a.</span>
        {installed ? "Multiplex is installed" : install ? "Install Multiplex" : "Open Multiplex"}
      </button>
      <span style={{ color: C.muted }}>a small window that shows what your agents are doing</span>
    </div>
  );
}
