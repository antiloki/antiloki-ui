// WHICH QA BOX IS OPEN (operator 2026-09-30: "QA boxes are heavy to the chat. Previous and old ones should appear collapsed, just the last expanded, and onclick expands another").
// A thread can hold many runs, each with a live browser frame, a terminal and a strip of pictures. Only the NEWEST run that has a QA film is open; older ones are one line, and a click opens
// any of them (and closes it again). The choice the operator makes by clicking is kept for as long as the thread is on screen and beats the default in both directions.
import React from "react";

const present = new Map<number, number>();         // run -> how many components of it are mounted, for runs known to HAVE a QA film
const manual = new Map<number, boolean>();         // what the operator chose by clicking
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach((l) => l()); };

/** the newest run that has a QA film on screen right now, 0 when none. Pure over the store - tested. */
export function latestQaRun(): number { let m = 0; for (const r of present.keys()) if (r > m) m = r; return m; }
/** is this run's QA open: the operator's click if there was one, else "it is the newest". */
export function isQaExpanded(run: number): boolean { return manual.get(run) ?? run === latestQaRun(); }
export function toggleQa(run: number, to?: boolean): void { manual.set(run, to ?? !isQaExpanded(run)); emit(); }
/** a run with a QA film is on screen (returns the way to say it left) */
export function registerQaRun(run: number): () => void {
  present.set(run, (present.get(run) ?? 0) + 1); emit();
  return () => { const n = (present.get(run) ?? 1) - 1; if (n <= 0) present.delete(run); else present.set(run, n); emit(); };
}
/** THE OPERATOR'S CLICKS BELONG TO A WORKSPACE (audit 2026-10-01): run ids restart in every workspace's database, so "run 5 was collapsed" in one project must not collapse a different project's run 5. */
export function forgetQaChoices(): void { if (manual.size) { manual.clear(); emit(); } }
/** test hook: forget everything */
export function resetQaFocus(): void { present.clear(); manual.clear(); emit(); }

/** `has`: this run is known to have a QA film (it only competes for "the newest" once it does). */
export function useQaExpanded(run: number, has: boolean): { expanded: boolean; toggle: () => void } {
  React.useEffect(() => { window.addEventListener("antiloki:workspace-changed", forgetQaChoices); return () => window.removeEventListener("antiloki:workspace-changed", forgetQaChoices); }, []);
  React.useLayoutEffect(() => (has ? registerQaRun(run) : undefined), [run, has]);      // before paint: the newest never flashes collapsed
  const v = React.useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version, () => version);
  void v;
  return { expanded: isQaExpanded(run), toggle: () => toggleQa(run) };
}
