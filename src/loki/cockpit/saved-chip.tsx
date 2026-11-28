// WHAT THE ROUTER HAS SAVED YOU, ALWAYS ON SCREEN (operator 2026-09-26: "at the switcher on top header instead of
// the fuel icon add the saved value with $ and dont collapse this value, show all the time on green").
//
// This is the product's one claim, and until now it lived three clicks deep in the Heimdall ledger — whose own
// comment has said "always visible" since 2026-09-20. The pitch is *cheaper*; the number that proves it belongs
// where it cannot be missed, in the slot that never folds.
//
// TWO RULES IT WILL NOT BREAK.
//   1. Never invent a figure. Before the ledger answers, the chip renders NOTHING — not "$0.00", which reads as
//      "this thing saves you nothing" to a new user and as a measurement to everyone else.
//   2. Say what the number is. It is API-equivalent: a subscription pays $0 metered, and the baseline is one
//      high-tier agent doing the same tokens. That sentence is the title, always.
import React from "react";
import { apiGet } from "@/loki/api/client";
import { FuelMini, useFuelLive } from "./fuel-mini";
import { barCost } from "./usage-model";

export type Saved = { saved_usd: number; actual_usd: number; baseline_usd: number; tokens: number; runs: number; /** every call antiloki has measured on this machine, the first-run check's included (an older serve sends neither) */ calls?: number; calls_usd?: number } | null;

/** the chip's text: dollars saved, or "" when nothing has been measured yet. Pure — tested. */
export function savedLabel(s: Saved): string {
  // A MEASURED ZERO IS ZERO (operator 2026-10-11, Windows: the chip was blank after the first-run check, so the user saw no number at all). Once the check - or anything - has been measured, the chip shows,
  // and what it shows is the truth: nothing routed yet saved $0.00. Before ANY measurement it is still blank (rule 1).
  if (!s || !Number.isFinite(s.saved_usd) || (s.runs <= 0 && !((s.calls ?? 0) > 0))) return "";
  const v = s.saved_usd;
  // under a cent is not zero, and rounding it to $0.00 would read as "saved nothing"
  // JUST THE MONEY (operator 2026-09-26: "also take out the word saved"). Green, in the header, next to nothing
  // else — the word was doing no work the colour and the position were not already doing.
  return v > 0 && v < 0.01 ? "<$0.01" : `$${v.toFixed(2)}`;
}

/** the sentence under it — what the number means, so it is never mistaken for a metered bill. Pure. */
export function savedTitle(s: Saved): string {
  if (s && s.runs <= 0 && (s.calls ?? 0) > 0) return `${s.calls} call${s.calls === 1 ? "" : "s"} measured so far${s.calls_usd ? ` ($${s.calls_usd.toFixed(2)} at API prices)` : ""} — nothing routed yet, so nothing saved yet: the saving appears once the router has run something. A subscription pays $0 metered.`;
  if (!s || s.runs <= 0) return "nothing routed yet — the saving appears once the router has run something";
  const pct = s.baseline_usd > 0 ? Math.round((s.saved_usd / s.baseline_usd) * 100) : 0;
  return `API-equivalent: $${s.actual_usd.toFixed(2)} instead of $${s.baseline_usd.toFixed(2)} (${pct}%) across ${s.runs} routed run${s.runs === 1 ? "" : "s"}. `
    + `A subscription pays $0 metered — the baseline is one high-tier agent doing the same tokens.`;
}

/** THE CHIP. Click opens whatever the caller wants to show (the fuel/limits overlay, which is where the rest of
 *  the money and every window lives). */
export function SavedChip({ onOpen }: { onOpen?: () => void }) {
  const [s, setS] = React.useState<Saved>(null);
  React.useEffect(() => {
    let dead = false; let epoch = 0;
    const read = async () => {
      const mine = epoch;       // an answer already on its way for the OLD workspace must not land after a switch
      try {
        const r: any = await apiGet("/api/v1/cockpit/goals/ledger");
        const v = (r?.result ?? r)?.savings;
        if (!dead && mine === epoch && v && typeof v.saved_usd === "number") setS(v as Saved);
      } catch { /* a chip that cannot read stays silent rather than guessing */ }
    };
    // A WORKSPACE SWITCH DROPS THE NUMBER AT ONCE (operator 2026-09-30: "the value that appears on the switcher is still wrong, is from another workspace"): rule 1 again - while the new
    // workspace has not answered, the chip renders nothing rather than the other project's money.
    const changed = () => { epoch++; setS(null); void read(); };
    void read();
    const t = setInterval(read, 30_000);
    window.addEventListener("antiloki:workspace-changed", changed);
    // something was measured (a first-run check call landed): read now, not at the next 30 s tick
    const again = () => { void read(); };
    window.addEventListener("antiloki:ledger-changed", again);
    return () => { dead = true; clearInterval(t); window.removeEventListener("antiloki:workspace-changed", changed); window.removeEventListener("antiloki:ledger-changed", again); };
  }, []);
  // THE NUMBER ON THE BAR IS WHAT WAS SPENT (operator 2026-11-21, twice: "it still says 0"): the saving is a claim about routing and stays $0.00 until something was routed, so it is the hover; what the last 7 days' tokens would cost at OpenRouter's prices plus what the team runs spent is the figure, once the record has answered.
  const fuel = useFuelLive(); const spent = barCost(fuel) ?? 0; const money = (v: number) => (v > 0 && v < 0.01 ? "<$0.01" : `$${v.toFixed(2)}`);
  const savedLabelText = savedLabel(s); const label = fuel ? money(spent) : savedLabelText;
  const spentLine = fuel ? ` Last 7 days at OpenRouter's prices: ${money(spent)} (plus what team runs spent); subscriptions bill $0 metered.${savedLabelText ? ` Saved by routing: ${savedLabelText}.` : ""}` : "";
  if (!label) return null;          // rule 1: nothing measured, nothing claimed
  return <span data-testid="saved-chip" title={(s ? savedTitle(s) : "") + spentLine}><FuelMini variant="money" label={label} onOpenFull={onOpen} /></span>;
}
