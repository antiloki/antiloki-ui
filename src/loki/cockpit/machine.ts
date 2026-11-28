// THE MACHINE, FOR THE BOTTOM BAR (operator 2026-11-21): CPU, RAM and VRAM and the heaviest processes, read from the serve's `/api/v1/machine`. Pure shapers and one polling hook.
import * as React from "react";
import { apiGet } from "@/loki/api/client";

export type Mem = { used_mb: number; total_mb: number; pct: number };
export type MachineProc = { pid: number; name: string; kind: string; /** null where the system lists no share (Windows) */ cpu: number | null; ram_kb: number };
export type Machine = { cpu: { pct: number | null; cores: number }; ram: Mem | null; vram: Mem | null; tone: "calm" | "loaded" | "danger"; procs: MachineProc[]; t_ms: number };
export type Tone = Machine["tone"];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const mem = (v: any): Mem | null => (v && num(v.total_mb) && num(v.used_mb) != null ? { used_mb: v.used_mb, total_mb: v.total_mb, pct: num(v.pct) ?? (v.used_mb / v.total_mb) * 100 } : null);
/** The serve's answer, defensively: a number it could not read stays null (never zero). Pure. */
export function parseMachine(r: any): Machine | null {
  if (!r || r.ok !== true) return null;
  return { cpu: { pct: num(r.cpu?.pct), cores: num(r.cpu?.cores) ?? 0 }, ram: mem(r.ram), vram: mem(r.vram), tone: r.tone === "danger" || r.tone === "loaded" ? r.tone : "calm",
    procs: (Array.isArray(r.procs) ? r.procs : []).filter((p: any) => p && typeof p.name === "string").map((p: any) => ({ pid: Number(p.pid) || 0, name: p.name, kind: String(p.kind ?? "other"), cpu: num(p.cpu), ram_kb: num(p.ram_kb) ?? 0 })), t_ms: num(r.t_ms) ?? 0 };
}
/** calm under 80%, loaded to 92%, danger above (the same as the serve). Pure. */
export const toneOf = (pct: number | null): Tone => (pct == null ? "calm" : pct >= 92 ? "danger" : pct >= 80 ? "loaded" : "calm");
export const toneColor = (t: Tone) => (t === "danger" ? "var(--c-bad)" : t === "loaded" ? "var(--c-warn)" : "var(--c-ok)");
export const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;
/** What to do about it, in words, for the worst of RAM and VRAM. Pure. */
export function adviceOf(m: Machine): { tone: Tone; text: string } {
  const worst = Math.max(m.ram?.pct ?? 0, m.vram?.pct ?? 0); const t = toneOf(worst); const heavy = m.procs.find((p) => p.kind === "local model") ?? m.procs[0];
  const which = (m.vram?.pct ?? 0) >= (m.ram?.pct ?? 0) && m.vram ? `VRAM is at ${Math.round(m.vram.pct)}%` : `RAM is at ${Math.round(m.ram?.pct ?? 0)}%`;
  if (t === "calm") return { tone: t, text: "Plenty of room. Local models and agents can run side by side." };
  if (t === "loaded") return { tone: t, text: `${which}. Another agent or a bigger model may start swapping.${heavy ? ` ${heavy.name} is the heaviest: unload or stop it to keep the others responsive.` : ""}` };
  return { tone: t, text: `${which}: the machine is about to freeze.${heavy ? ` Stop ${heavy.name} first.` : ""} Agents stall when memory runs out.` };
}
let LAST: { now: Machine | null; hist: { cpu: number[]; ram: number[]; vram: number[] } } = { now: null, hist: { cpu: [], ram: [], vram: [] } };
/** The machine, read every `ms`; `null` until the first answer (never a made-up zero). The last reading is kept, so the window opens with what the icon already knew. */
export function useMachine(ms = 2000): { now: Machine | null; hist: { cpu: number[]; ram: number[]; vram: number[] } } {
  const [now, setNow] = React.useState<Machine | null>(LAST.now); const [hist, setHist] = React.useState<{ cpu: number[]; ram: number[]; vram: number[] }>(LAST.hist);
  React.useEffect(() => {
    let stop = false; const go = async () => { const m = parseMachine(await apiGet("/api/v1/machine", { timeoutMs: 8000 } as any)); if (stop || !m) return; setNow(m);
      setHist((h) => { const push = (a: number[], v: number | null) => (v == null ? a : [...a, v].slice(-60)); const nh = { cpu: push(h.cpu, m.cpu.pct), ram: push(h.ram, m.ram?.pct ?? null), vram: push(h.vram, m.vram?.pct ?? null) }; LAST = { now: m, hist: nh }; return nh; }); };
    void go(); const t = setInterval(go, ms); return () => { stop = true; clearInterval(t); };
  }, [ms]);
  return { now, hist };
}
