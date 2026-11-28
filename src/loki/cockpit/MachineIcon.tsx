// THE MACHINE ICON (replaces the agents bell, operator 2026-11-21): three small bars, CPU, RAM and VRAM, that rise and fall with the machine and turn amber then red BEFORE it starts to swap, so a local model or a crowd of agents never freezes it unseen. Click for the window.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { toneColor, toneOf, useMachine } from "./machine";
import { MachineWindow } from "./MachineWindow";

export function MachineIcon() {
  const { now } = useMachine(4000); const [open, setOpen] = React.useState(false);
  const vals = [now?.cpu.pct ?? null, now?.ram?.pct ?? null, now?.vram?.pct ?? null]; const worst = Math.max(now?.ram?.pct ?? 0, now?.vram?.pct ?? 0, 0);
  return (
    <>
      <button data-testid="machine-icon" data-tone={now ? now.tone : "none"} aria-label="Machine: CPU, RAM and VRAM" title={now ? `CPU ${Math.round(now.cpu.pct ?? 0)}% · RAM ${Math.round(now.ram?.pct ?? 0)}%${now.vram ? ` · VRAM ${Math.round(now.vram.pct)}%` : ""}: ${now.tone}` : "reading the machine…"} onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: C.muted, fontFamily: mono, fontSize: 11, padding: "2px 6px", borderRadius: 6 }}>
        <span aria-hidden style={{ display: "inline-flex", gap: 3, alignItems: "flex-end", height: 16 }}>
          {vals.map((v, i) => <i key={i} data-testid={`machine-bar-${i}`} style={{ display: "block", width: 4, borderRadius: 1, height: Math.max(3, ((v ?? 0) / 100) * 16), background: v == null ? C.border : toneColor(toneOf(v)), transition: "height .6s ease, background .3s" }} />)}
        </span>
        {now && worst >= 80 && <span style={{ color: toneColor(now.tone) }}>{Math.round(worst)}%</span>}
      </button>
      {open && <MachineWindow onClose={() => setOpen(false)} />}
    </>);
}
