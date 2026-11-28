// ALL THE LOCAL MODELS IN ONE WINDOW (operator 2026-11-24: "group all local models under a button called Local; on click open a window with complete info of all local models installed, so we choose there"): the same window from the new-agent menu,
// the chat input's selector and the terminal's top bar. A glass card, a card per model (name, size, parameters, family, whether it is loaded now), the machine line (GPU or CPU), Esc or a click outside closes it.
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import type { LocalModel } from "./api";

export type LocalInfo = { gpuMb?: number | null; loaded?: { name: string; gpu_pct: number }[]; base?: string };
/** The line about the machine: the GPU's memory, or that the models run on the CPU. Pure. */
export function hardwareLine(i: LocalInfo | null | undefined): string {
  if (!i || i.gpuMb === undefined) return "";
  return i.gpuMb ? `GPU: ${(i.gpuMb / 1024).toFixed(0)} GB of VRAM.` : "No GPU found: local models run on the CPU, so even a small one is slow.";
}
/** Biggest last-used first is not known here: models are listed by name. Pure. */
export function sortedModels(models: LocalModel[]): LocalModel[] { return [...models].sort((a, b) => a.tag.localeCompare(b.tag)); }

export function LocalModelsWindow({ models, info, current, onPick, onClose, busy = false }: { models: LocalModel[]; info?: LocalInfo | null; /** the model the pane runs now, marked */ current?: string; onPick: (m: LocalModel) => void; onClose: () => void; busy?: boolean }) {
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const loaded = new Map((info?.loaded ?? []).map((l) => [l.name, l.gpu_pct]));
  const hw = hardwareLine(info);
  return createPortal(
    <div data-testid="local-models-window" role="dialog" aria-label="local models" onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 9995, display: "grid", placeItems: "center", background: "rgba(0,0,0,.35)", padding: 16 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(760px, 100%)", maxHeight: "min(640px, 100%)", display: "flex", flexDirection: "column", borderRadius: 14, border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.panel} 86%, transparent)`, backdropFilter: "blur(22px) saturate(1.4)", WebkitBackdropFilter: "blur(22px) saturate(1.4)", boxShadow: "0 18px 60px rgba(0,0,0,.5)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "14px 16px 6px" }}>
          <span style={{ fontFamily: nav, fontSize: 15, fontWeight: 600, color: C.fg }}>Local models</span>
          <span style={{ fontFamily: nav, fontSize: 12, color: C.muted, flex: 1 }}>{models.length} installed{info?.base ? ` · ${info.base}` : ""}</span>
          <button data-testid="local-models-close" aria-label="close" onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        {hw && <div data-testid="local-models-hw" style={{ padding: "0 16px 8px", fontFamily: nav, fontSize: 11.5, color: info?.gpuMb ? C.muted : C.warn }}>{hw}</div>}
        <div style={{ overflowY: "auto", padding: "4px 12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
          {sortedModels(models).map((m) => {
            const gpu = loaded.get(m.tag); const on = current === m.tag || current === m.id;
            return (
              <button key={m.id} data-testid={`local-card-${m.tag}`} disabled={busy || !!m.unavailable} title={m.unavailable} onClick={() => onPick(m)}
                style={{ textAlign: "left", display: "grid", gap: 4, padding: "10px 12px", borderRadius: 10, cursor: m.unavailable || busy ? "default" : "pointer", border: `1px solid ${on ? C.brand : C.border}`, background: "transparent", color: m.unavailable ? C.muted : C.fg, opacity: m.unavailable ? 0.6 : 1 }}>
                <span style={{ fontFamily: mono, fontSize: 12.5, overflowWrap: "anywhere" }}>{m.tag}</span>
                <span style={{ fontFamily: nav, fontSize: 11.5, color: C.muted }}>{[m.params, m.size_gb ? `${m.size_gb} GB` : "", m.family].filter(Boolean).join(" · ")}</span>
                <span style={{ fontFamily: nav, fontSize: 11, color: m.unavailable ? C.warn : gpu !== undefined ? C.ok : C.dim }}>{m.unavailable ?? (gpu !== undefined ? `loaded now · ${gpu}% on the GPU` : on ? "this pane runs it" : "not loaded: the first answer waits for it")}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>, document.body);
}
