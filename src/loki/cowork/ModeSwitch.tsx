// One icon in the chat's box: the agent's mode; a click goes to its next mode (the key the CLI itself names). Hidden when the screen does not say the mode.
import * as React from "react";
import { C } from "@/loki/theme";
import { NEXT_MODE_KEY, parseMode, type ModeKind } from "./modes";
import { ptyInput } from "./api";

const PATHS: Record<ModeKind, string> = {
  default: "M12 3l8 3v6c0 5-3.5 8-8 9-4.500-1-8-4-8-9V6z",                                   // shield: it asks
  auto: "M13 2L4 14h6l-1 8 9-12h-6z",                                                        // bolt
  plan: "M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01",                           // list
  edits: "M4 20h4L19 9l-4-4L4 16zM13.5 6.500l4 4",                                           // pencil
  bypass: "M12 3l10 18H2zM12 10v5M12 18h.01",                                                // warning
  ask: "M9 9a3 3 0 1 1 4.500 2.600c-1 .600-1.500 1.200-1.500 2.400M12 18h.01",              // question
  debug: "M9 9h6v7a3 3 0 0 1-6 0zM9 9a3 3 0 0 1 6 0M4 12h5M15 12h5M5 19l4-2M19 19l-4-2M5 6l4 3M19 6l-4 3", // bug
  build: "M14.500 5.500a4 4 0 0 0-5 5L3 17l4 4 6.500-6.500a4 4 0 0 0 5-5l-3 3-3-1-1-3z",    // wrench
  other: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9v6M9 12h6",
};

export function ModeSwitch({ paneId, engine, screen, held }: { paneId: number; engine?: string; screen: string[]; /** a question is open or the agent is paused: the key would answer it, so it is not sent */ held?: boolean }) {
  const mode = parseMode(engine, screen);
  if (!mode) return null;
  const legend = `${mode.label} mode${held ? "" : " — click for the next mode"}`;
  return (
    <button data-testid="chat-mode" data-mode={mode.kind} aria-label={legend} title={legend} disabled={held} onClick={() => void ptyInput(paneId, NEXT_MODE_KEY)}
      style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: "none", background: "transparent", display: "grid", placeItems: "center", cursor: held ? "default" : "pointer", opacity: held ? 0.45 : 1, color: mode.kind === "bypass" ? C.warn : mode.kind === "default" ? C.muted : C.fg }}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={PATHS[mode.kind]} /></svg>
    </button>);
}
