// THE SEATS, AS THE SERVE SAYS THEY STAND (operator 2026-10-01, "Engine config also": the FE named Claude Code as the default
// in five places and listed three engines in its pickers - on a machine whose Claude subscription had ended every one of them
// offered, or defaulted to, a seat that refuses every call). The serve already knows which seat is installed, signed in and
// switched on (`/api/v1/settings/providers`) and which one Heimdall plans on; this is the one place the FE reads that, so no
// component carries a default of its own.
import React from "react";
import { apiGet } from "./client";
import { ENGINE_KEYS, type EngineKey } from "./engine";

export type Seat = { key: EngineKey; name: string; usable: boolean; on: boolean };
export type Seats = { seats: Seat[]; /** the seat Heimdall plans on today - `null` when nothing at all can run */ defaultKey: EngineKey | null };

const known = (k: unknown): k is EngineKey => typeof k === "string" && (ENGINE_KEYS as readonly string[]).includes(k);

/** the providers payload as seats. `null` for anything that is not that payload (an older serve answers 404 JSON). Pure - tested. */
export function seatsOf(d: any): Seats | null {
  if (!d || typeof d !== "object" || !Array.isArray(d.engines)) return null;
  const seats: Seat[] = d.engines.filter((e: any) => known(e?.key)).map((e: any) => ({ key: e.key, name: String(e.name ?? e.key), usable: e.usable === true, on: e.on !== false }));
  // Heimdall's own seat first; else the first seat that can run, in the serve's order (the router's own, never a fixed Claude)
  const eff = d.heimdall?.effective;
  const defaultKey = known(eff) ? eff : (seats.find((s) => s.usable && s.on)?.key ?? null);
  return { seats, defaultKey };
}

/** the keys a picker may offer: seats that are on and usable, and the one in force (`keep`) so a picker can still show what it is on. Before the providers read has landed (or on a serve that
 *  cannot say) NOTHING is offered but `keep` - it used to return all six seats, including a switched-off Claude, for as long as the read had not answered (audit 2026-10-01). Callers handle the empty list. Pure - tested. */
export function offered(s: Seats | null, keep?: string | null): EngineKey[] {
  if (!s || !s.seats.length) return known(keep) ? [keep] : [];
  return s.seats.filter((x) => (x.usable && x.on) || x.key === keep).map((x) => x.key);
}

/** a seat's own name, for a label */
export function seatName(s: Seats | null, key: string): string { return s?.seats.find((x) => x.key === key)?.name ?? key; }

let cache: Seats | null = null;
let inflight: Promise<Seats | null> | null = null;
let gen = 0;                                   // bumped by forgetSeats: a read that began before it must not fill the cache
const listeners = new Set<() => void>();
/** The seats, once per page load; a failed read is not cached (the next caller asks again). ONE read at a time (audit 2026-10-01): fourteen components call useSeats and every mount used to send its own
 *  GET /settings/providers - concurrent callers now share the one in flight. */
export function fetchSeats(): Promise<Seats | null> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  const mine = gen;
  const p = (async () => {
    // a read that throws (no serve, a test double without the call) is "seats unknown" like any other failed read - never an unhandled rejection from a hook
    let raw: unknown = null;
    try { raw = await apiGet("/api/v1/settings/providers", { timeoutMs: 20_000 }); } catch { return null; }
    const s = seatsOf(raw);
    if (s && mine === gen) cache = s;
    return s;
  })().finally(() => { if (inflight === p) inflight = null; });
  inflight = p;
  return p;
}
/** Forget what was read - after the operator switches a seat on or off - and tell every mounted useSeats() to read again (it used to keep showing the old list until a remount). */
export function forgetSeats() { cache = null; inflight = null; gen++; for (const l of [...listeners]) l(); }

export function useSeats(): Seats | null {
  const [s, setS] = React.useState<Seats | null>(() => cache);
  React.useEffect(() => {
    let live = true;
    const pull = () => { void fetchSeats().then((x) => { if (live && x) setS(x); }); };
    pull(); listeners.add(pull);
    return () => { live = false; listeners.delete(pull); };
  }, []);
  return s;
}
