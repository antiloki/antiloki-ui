// THE PROVIDER BUTTON in an agent's header (the operator 2026-11-24: the button now changes the PROVIDER, not the model). It shows the provider of the pane; one click lists the cloud providers installed on this machine,
// one more switches to that provider on its own default model. The switch is the serve's: it closes an episode in the saga and hands the new provider the reconciliation pack, so the conversation goes on.
import * as React from "react";
import { createPortal } from "react-dom";
import { C, mono, nav } from "@/loki/theme";
import { listEngines, localModels, paneModels, setPaneModel, switchProvider, type Engine, type LocalModel } from "./api";
import { shortModel } from "./model-name";
import { ProviderMark } from "./ProviderMark";
import { LocalModelsWindow, type LocalInfo } from "./LocalModelsWindow";

/** The short code of a provider for a small button ("Claude Code" -> "CC", "Codex" -> "CX"). Pure. */
export function providerCode(label: string): string {
  const words = label.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : (words[0] ?? "?").slice(0, 2).toUpperCase();
}

/** The providers a pane can switch to: the ones installed here and not switched off, the cloud ones (no local models). Pure. */
export function switchable(engines: Engine[]): Engine[] {
  return engines.filter((e) => e.installed && !e.off && !e.key.startsWith("local"));
}

export function ProviderButton({ paneId, engine, model, onRestart, onSwitched, compact = false, up = false }: { paneId: number; /** the menu opens above the button (a button at the bottom of a pane, like the chat input) */ up?: boolean; /** the model the pane runs (its name), shown in the compact pill as its short code (H5.5) */ model?: string; /** the pane's provider (its engine key) */ engine: string; /** the screen starts the terminal again on the new provider */ onRestart: () => void; /** the switch went through: the pane takes the new provider before its terminal restarts */ onSwitched?: (key: string, label: string) => void; compact?: boolean }) {
  const [open, setOpen] = React.useState(false); const [list, setList] = React.useState<Engine[] | null>(null);
  const [busy, setBusy] = React.useState(false); const [note, setNote] = React.useState(""); const [chosen, setChosen] = React.useState<string | null>(null);
  const [locals, setLocals] = React.useState<LocalModel[] | null>(null); const [ollama, setOllama] = React.useState(true); const [localWin, setLocalWin] = React.useState(false); const [info, setInfo] = React.useState<LocalInfo | null>(null);
  const current = chosen ?? engine;
  // THE MODEL ON THE PILL IS NEVER LOST (2026-11-24: the chat input showed only "CC"): the model the usage reports; else the last one seen; else the one the pane was set to (an alias: Haiku, Sonnet, Opus), asked once
  const lastModel = React.useRef(""); const [chosenModel, setChosenModel] = React.useState("");
  if (model) lastModel.current = model;
  React.useEffect(() => { if (model) return; let stop = false; void paneModels(paneId).then((d) => { const m = d?.current ?? ""; if (!stop && m) setChosenModel(/^(haiku|sonnet|opus)$/i.test(m) ? m[0].toUpperCase() + m.slice(1).toLowerCase() : m); }); return () => { stop = true; }; }, [paneId, model]);
  const shownModel = model || lastModel.current || chosenModel;
  const labelOf = (key: string) => list?.find((e) => e.key === key)?.label ?? key;
  const toggle = async () => {
    const o = !open; setOpen(o);
    if (o && !list) setList(switchable(await listEngines()));
    if (o) { const lm = await localModels(); setOllama(!!lm?.reachable); setLocals(lm?.reachable ? lm.models : []); setInfo(lm ? { gpuMb: lm.gpuMb, loaded: lm.loaded, base: lm.base } : null); }
  };
  // A LOCAL MODEL IS A PROVIDER TOO (restored 2026-11-24): Claude Code on the model server. The pane takes Claude Code first if it is on another provider, then the local model; the serve restarts the terminal on it.
  const pickLocal = async (m: LocalModel) => {
    setOpen(false); setBusy(true); setNote(`switching to ${m.tag} (local)…`);
    // the same handover as any switch (an episode closed, the pack for the new start), even when the pane is already on Claude Code
    const r = await switchProvider(paneId, "claude-code", `local:${m.tag}`); setBusy(false);
    if (!r.ok) { setNote(r.error ?? "could not switch to the local model"); return; }
    setChosen("claude-code"); onSwitched?.("claude-code", `${m.tag} · local`);
    setNote(`${m.tag} (local) continues this conversation`); onRestart();
    window.setTimeout(() => setNote(""), 8000);
  };
  const pick = async (key: string) => {
    setOpen(false); setBusy(true); setNote(`switching to ${labelOf(key)}…`);
    const r = await switchProvider(paneId, key); setBusy(false);
    if (!r.ok) { setNote(r.error ?? "could not switch the provider"); return; }
    if (r.changed === false) { setNote(""); return; }
    setChosen(key); onSwitched?.(key, labelOf(key));
    setNote(`${labelOf(key)} continues this conversation${r.episodeClosed ? ": the episode so far is saved in the saga" : ""}`);
    onRestart();
    window.setTimeout(() => setNote(""), 8000);
  };
  // THE LIST IS DRAWN IN THE PAGE, NOT IN THE PANE (2026-11-24: on the leader's chat bar it opened behind the chat): a fixed panel at the button, above everything
  const anchor = React.useRef<HTMLSpanElement>(null);
  // a click anywhere else, or Escape, closes the list (it used to stay open over the neighbouring pane, seen live 2026-11-25)
  React.useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { const t = e.target as Element | null; if (t && (anchor.current?.contains(t) || t.closest?.("[role=listbox]"))) return; setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); };
  }, [open]); const at = open && anchor.current ? anchor.current.getBoundingClientRect() : null;
  const shown = list?.find((e) => e.key === current)?.label ?? (current === "claude-code" ? "Claude Code" : current);
  return (
    <span ref={anchor} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }} onMouseDown={(e) => e.stopPropagation()}>
      <button data-testid={`provider-button-${paneId}`} aria-haspopup="listbox" aria-expanded={open} title="change this agent's provider (its conversation goes on with the new one)" onClick={() => void toggle()} disabled={busy} draggable={false}
        style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 999, padding: compact ? "0 11px" : "0 8px", cursor: busy ? "default" : "pointer", fontFamily: mono, fontSize: compact ? 11.5 : 10.5, height: compact ? 28 : 20, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <ProviderMark engine={current} size={compact ? 15 : 13} local={/local|·\s*local/i.test(shownModel) && current === "claude-code" && /:/.test(shownModel)} />{shownModel ? shortModel(shownModel) : compact ? "" : shown}
      </button>
      {note && <span data-testid={`provider-note-${paneId}`} style={{ color: C.muted, fontSize: 10.5, fontFamily: nav, whiteSpace: "nowrap" }}>{note}</span>}
      {open && at && createPortal(
        <div role="listbox" data-testid={`provider-list-${paneId}`} style={{ position: "fixed", left: Math.max(8, Math.min(at.left, window.innerWidth - 236 - 8)), ...(up ? { bottom: window.innerHeight - at.top + 6 } : { top: at.bottom + 6 }), zIndex: 9990, minWidth: 220, maxWidth: window.innerWidth - 16, maxHeight: Math.max(160, (up ? at.top : window.innerHeight - at.bottom) - 20), overflowY: "auto", padding: 4, borderRadius: 10, border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.panel} 88%, transparent)`, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", boxShadow: "0 8px 28px rgba(0,0,0,.4)" }}>
          {list === null && <div style={{ padding: "6px 10px", color: C.muted, fontSize: 11.5 }}>loading…</div>}
          {locals && !ollama && <div data-testid="provider-ollama-down" style={{ padding: "6px 10px", color: C.muted, fontSize: 11.5 }}>local models: Ollama is not answering. Start it with `ollama serve`.</div>}
          {list?.length === 0 &&<div data-testid="provider-none" style={{ padding: "6px 10px", color: C.muted, fontSize: 11.5 }}>no other provider is installed on this machine</div>}
          {list?.map((e) => (
            <button key={e.key} role="option" aria-selected={e.key === current} data-testid={`provider-opt-${e.key}`} disabled={busy || e.key === current || e.seat === false} onClick={() => void pick(e.key)}
              title={e.seat === false ? "installed, but not signed in" : undefined}
              style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 14, textAlign: "left", background: "transparent", border: "none", color: e.key === current ? C.brand : e.seat === false ? C.muted : C.fg, cursor: e.key === current || e.seat === false ? "default" : "pointer", fontFamily: mono, fontSize: 11.5, padding: "5px 10px", borderRadius: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><ProviderMark engine={e.key} size={14} />{e.label}</span>
              <span style={{ color: C.muted, fontSize: 10.5 }}>{e.key === current ? "current" : e.seat === false ? "not signed in" : "switch"}</span>
            </button>
          ))}
          {locals && ollama && locals.length > 0 && (
            <button data-testid="provider-local-open" role="option" aria-selected={false} disabled={busy} onClick={() => { setOpen(false); setLocalWin(true); }} title="every model installed on this machine, with its size, parameters and whether it is loaded"
              style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 14, textAlign: "left", background: "transparent", border: "none", color: C.fg, cursor: "pointer", fontFamily: mono, fontSize: 11.5, padding: "5px 10px", borderRadius: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><ProviderMark local size={14} />Local</span><span style={{ color: C.muted, fontSize: 10.5 }}>{locals.length} model{locals.length === 1 ? "" : "s"} ▸</span>
            </button>
          )}
        </div>, document.body)}
      {localWin && <LocalModelsWindow models={locals ?? []} info={info} busy={busy} onClose={() => setLocalWin(false)} onPick={(m) => { setLocalWin(false); void pickLocal(m); }} />}
    </span>
  );
}
