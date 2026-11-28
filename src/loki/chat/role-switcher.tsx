// THE ROLE, IN THE AGENT'S OWN HEADER (operator 2026-09-26: "No sidebar left just the switcher agent dropdown you
// said to manually choose if the user wants and heimdall role flag is unactive").
//
// One agent that switches roles has nothing to list in a column. What it has is a CURRENT ROLE, and TWO STATES —
// never three (operator 2026-09-26: "if the user chooses a role heimdall get off, until the user turns it on
// again"):
//
//   · ROUTED — Heimdall reads each ask and picks. The chip says `· routed`.
//   · YOURS  — the operator picked, so role routing is off until they switch it back on. The chip says `· yours`.
//
// CHOOSING IS THE ACT OF TURNING IT OFF. The dropdown is live in BOTH states, because a control you cannot touch
// until you find a different switch is not a control. Picking flips the flag; there is no "pinned but still
// routing" third state, which would leave nobody able to say who is in charge.
//
// AND THE FLIP IS VISIBLE. `onPick` carries the intent so the caller can turn the ⚡ ROLES pill off in the same
// gesture: changing the system's behaviour without showing it is how an operator stops trusting the switch.
//
// WHAT DOES NOT TURN OFF IS HEIMDALL. It still picks the MERGE for whatever role is active, at the current Effort.
// "I choose the role" must not also mean "and now pick your own models" — that would throw the cheaper claim away
// at the exact moment the operator was being deliberate.
import React from "react";
import { createPortal } from "react-dom";
import { C, mono } from "@/loki/theme";
import type { RoleAdapter } from "./roles";

/** what the chip reads — and the two words are the whole state machine. Pure — tested. */
export function roleLabelOf(role: RoleAdapter | null, auto: boolean): string {
  if (!role) return auto ? "role · routed" : "pick a role";
  return `${role.name} · ${auto ? "routed" : "yours"}`;
}

/** WHICH ROLE KEY THE PANE HOLDS (operator 2026-09-29: the chip said "Backender/Tester · routed" while the work was frontend). The pane's
 *  settings keep `roles.role` after a pick, and `pinned ?? routed` let that stored pin beat the routed role even when routing was turned
 *  back on - so a stale pick showed as "routed" for ever. The pin means something only while routing is OFF (picking a role is the act of
 *  turning it off); while routing is on, the role Heimdall named on the newest run is the answer. Pure - tested. */
export function currentRoleKeyOf(rolesOn: boolean, pinned: string | null, routed: string | null): string | null {
  return rolesOn ? (routed ?? pinned) : (pinned ?? routed);
}

/** WHICH ROLE THE CHIP SHOWS (operator 2026-09-29: "at routed on the input text field is showing backender selected, but im working on a
 *  frontend"). There are TWO chips - the header's and the composer's - and only the header was given the live role; the composer's was
 *  given the role of the last GOAL RUN, which is stale the moment the next ask is a different kind of work. One rule for both:
 *  while routing is on, the role the serve named most recently wins; a pinned role (routing off) is the operator's and nothing moves it.
 *  Pure - tested. */
export function shownRoleOf(rolesOn: boolean, liveRole: string | null, roles: RoleAdapter[], currentRole: RoleAdapter | null): RoleAdapter | null {
  if (!rolesOn) return currentRole;
  return (liveRole ? roles.find((r) => r.key === liveRole) : null) ?? currentRole;
}

/** WHO IS ACTUALLY WORKING (operator 2026-09-26: "when the agents are running, the role and the merged models
 *  should appear on the header of the chat").
 *
 *  The chameleon changes form silently unless you open the run log. While work is running, the header answers
 *  "who is writing this" without a click: the role AND the merge under it.
 *
 *  `null` when nothing is running — the header must not imply work is happening. And a merge with only one side
 *  known prints that side rather than an em-dash pretending to be a pair. Pure — tested. */
export function workingLine(role: RoleAdapter | null, pair: { brain?: string | null; hands?: string | null } | null, busy: boolean): string | null {
  if (!busy) return null;
  const name = role?.name ?? "routing";
  const sides = [pair?.brain, pair?.hands].filter((x): x is string => !!x && x !== "raw" && x !== "-");
  if (sides.length === 0) return name;
  return `${name} · ${sides.join(" × ")}`;
}

/** the sentence under it: who chose, and on what. Pure — tested. */
export function roleTitleOf(role: RoleAdapter | null, auto: boolean, why?: string | null): string {
  if (auto) {
    const head = why?.trim() ? `Heimdall chose this role from the ask — ${why}` : "Heimdall picks the role from each ask.";
    return `${head} Pick one here and it becomes yours — role routing turns off until you switch it back on in the ⚡ menu.`;
  }
  return role
    ? `${role.name} — ${role.about}. Yours: role routing is off. Heimdall still picks the best ${role.name} merge at your Effort.`
    : "Role routing is off and no role is set — this agent runs the binding it was given.";
}

export function RoleSwitcher({ roles, current, auto, why, onPick, font = mono, colors }:
  { roles: RoleAdapter[]; current: RoleAdapter | null; auto: boolean; why?: string | null;
    onPick?: (key: string, takeover: boolean) => void; font?: string; colors?: { fg: string; dim: string; panel: string; border: string; accent: string } }) {
  const c = colors ?? { fg: C.fg, dim: C.dim, panel: C.panel, border: C.border, accent: C.brand };
  const [open, setOpen] = React.useState(false);
  const [nudge, setNudge] = React.useState(false);
  const box = React.useRef<HTMLSpanElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  // ROUTING OWNS THE ROLE WHILE IT IS ON (operator 2026-09-28: "if heimdall router is ON we shouldnt be able to
  // change the role").
  //
  // This used to be live in both states, on the reasoning that a control you cannot touch until you find a
  // different switch is not a control. The operator's rule is the stronger one and it is theirs: while Heimdall is
  // routing, the role is ITS answer and changes on every ask — offering a pick there invites the operator to set
  // something that the next message silently overrides. So the chip reads out and does not open, and says why when
  // it is pressed, naming the switch that gives it back.
  const canPick = !!onPick && roles.length > 0 && !auto;
  const locked = !!onPick && roles.length > 0 && auto;

  // THE MENU IS NOT CLIPPED BY ITS PANE (operator 2026-09-28: "role. route on click show the window below the
  // screen i cant see anything"). This chip sits in the COMPOSER FOOTER, about thirty pixels from the bottom of
  // the window, and the menu opened downward — `position: absolute; top: 100%` — so a 280px panel rendered almost
  // entirely below the fold, inside a pane that clips its overflow, under a `z-index: 30` that cannot climb over
  // the pane's sibling rails.
  //
  // The same bug was fixed twice already in `agent-chat-pane.tsx` — `HeimdallChip` ("the heimdall menu is cut for
  // not having space on the screen") and `ProviderSwitch` — and this was the one control on that row nobody
  // converted. Same cure: portal to the body, `position: fixed`, measured from the chip's own rect, opening
  // UPWARD, clamped into the viewport, scrolling inside itself when the window is short.
  const [pos, setPos] = React.useState<{ left: number; bottom: number; maxH: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = box.current; if (!b) return;
      const r = b.getBoundingClientRect();
      const w = panelRef.current?.offsetWidth || 210;
      const vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
      setPos({ left: Math.max(8, Math.min(r.left, vw - w - 8)), bottom: Math.max(8, vh - r.top + 6), maxH: Math.max(140, r.top - 18) });
    };
    place();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <span ref={box} style={{ position: "relative", display: "inline-flex" }}>
      <button data-testid="role-switcher" data-auto={auto ? "1" : "0"} data-can-pick={canPick ? "1" : "0"}
        onClick={canPick ? () => setOpen((o) => !o) : locked ? () => { setNudge(true); window.setTimeout(() => setNudge(false), 2600); } : undefined}
        title={locked ? "Heimdall is routing — it picks the role for every ask. Turn the ⚡ pill off to choose one yourself." : roleTitleOf(current, auto, why)}
        style={{ background: "transparent", border: "none", cursor: canPick ? "pointer" : "default",
                 fontFamily: font, fontSize: 10, color: auto ? c.dim : c.fg, padding: "0 4px", whiteSpace: "nowrap" }}>
        {roleLabelOf(current, auto)}{canPick ? " ▾" : ""}
      </button>
      {nudge && (
        <span data-testid="role-switcher-locked" style={{ marginLeft: 6, fontFamily: font, fontSize: 9.5, color: c.dim }}>
          Heimdall picks the role — turn ⚡ off to choose
        </span>
      )}
      {open && canPick && pos && createPortal(
        <>
          {/* the scrim closes it on any outside click, the same gesture the other two menus use */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }} />
          <div ref={panelRef} data-testid="role-switcher-menu"
            style={{ position: "fixed", left: pos.left, bottom: pos.bottom, zIndex: 401, background: c.panel,
                     border: `1px solid ${c.border}`, borderRadius: 8, padding: 4, minWidth: 210, maxHeight: pos.maxH,
                     overflowY: "auto", display: "flex", flexDirection: "column", boxShadow: "0 12px 34px rgba(0,0,0,.45)" }}>
          {roles.map((r) => (
            <button key={r.key} data-testid={`role-option-${r.key}`}
              // `takeover` is true when this pick is also switching role routing OFF — the caller turns the ⚡
              // pill dark in the same gesture, so the state change is never silent.
              onClick={() => { onPick?.(r.key, auto); setOpen(false); }}
              style={{ textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "4px 7px",
                       borderRadius: 6, fontFamily: font, fontSize: 10, color: r.key === current?.key ? c.accent : c.fg }}>
              {r.name}
              <span style={{ display: "block", color: c.dim, fontSize: 9, lineHeight: 1.4 }}>{r.about}</span>
            </button>
          ))}
          </div>
        </>, document.body)}
    </span>
  );
}
