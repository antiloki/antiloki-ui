// THE SHORTCUTS, HELD (operator 2026-11-10): the person's choices, kept per browser (only a convenience: the defaults are always there to come back to).
import * as React from "react";
import { DEFAULT_LEADER, LEADER_KEY, SHORTCUTS_KEY, getLeader, leaderProblem, normalizeChord, setLeader, clearChord, parseOverrides, resetChord, resolve, setChord, type ActionId, type Bindings, type Overrides, type SetResult } from "./shortcuts";

/** The leader: the person's choice, else Ctrl+Space. */
function loadLeader(): string { try { const v = normalizeChord(window.localStorage.getItem(LEADER_KEY) ?? ""); if (v && !leaderProblem(v)) return v; } catch { /* blocked */ } return DEFAULT_LEADER; }
function load(): Overrides { try { return parseOverrides(window.localStorage.getItem(SHORTCUTS_KEY)); } catch { return {}; } }

export function useShortcuts() {
  const [leader, setLeaderState] = React.useState<string>(() => { const l = loadLeader(); setLeader(l); return l; });
  const [overrides, setOverrides] = React.useState<Overrides>(load);
  const bindings: Bindings = React.useMemo(() => resolve(overrides), [overrides]);
  const chooseLeader = React.useCallback((chord: string): string | null => { const c = normalizeChord(chord); const bad = c ? leaderProblem(c) : "that is not a key combination"; if (!c || bad) return bad ?? "that is not a key combination"; setLeader(c); setLeaderState(c); try { window.localStorage.setItem(LEADER_KEY, c); } catch { /* blocked */ } return null; }, []);
  const keep = React.useCallback((next: Overrides) => {
    setOverrides(next);
    try { if (Object.keys(next).length === 0) window.localStorage.removeItem(SHORTCUTS_KEY); else window.localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(next)); } catch { /* blocked storage: the choice lasts until the page does */ }
  }, []);
  const set = React.useCallback((id: ActionId, chord: string, take = false): SetResult => {
    const r = setChord(overrides, id, chord, take); if (r.ok) keep(r.overrides); return r;
  }, [overrides, keep]);
  const clear = React.useCallback((id: ActionId) => keep(clearChord(overrides, id)), [overrides, keep]);
  const reset = React.useCallback((id: ActionId) => keep(resetChord(overrides, id)), [overrides, keep]);
  const resetAll = React.useCallback(() => keep({}), [keep]);
  return { bindings, overrides, set, clear, reset, resetAll, leader, chooseLeader, getLeader };
}
