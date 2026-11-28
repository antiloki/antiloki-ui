// THE SCREEN SWITCH (operator 2026-09-18: "Threads is now very similar to Blocks — replace the
// Blocks/Threads switcher with antiDesk / antiIDE"). Blocks is retired; the one floating pill
// top-center is the switch between the two screens, with the instruments (fuel · timeline) between
// the words: antiDesk · ◌ ⎇ ⏲ · antiIDE (the PR icon in the middle, operator 2026-09-19). (antiIDE's views — Code, Design, … — are its own tabs.)
import React from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { ViewSwitch, FLOATING_TOP } from "./view-switch";
import { C, nav } from "@/loki/theme";
import { LogoMenu, LogoMark } from "./logo-menu";
import { UsagePopover } from "@/loki/cockpit/usage-popover";
import { LimitsIcon } from "@/loki/cockpit/limits-icon";
import { SavedChip } from "@/loki/cockpit/saved-chip";
import { type Instrument } from "@/loki/widgets/agents-timeline";
import { FloatingScreening } from "@/loki/cockpit/floating-screening";
import { MachineIcon } from "@/loki/cockpit/MachineIcon";


export const DESK_PATH = "/";
export const IDE_CODE_PATH = "/operations/atlas";
export const IDE_DESIGN_PATH = "/operations/design";
export const SAGAS_PATH = "/sagas";

type Key = "desk" | "ide" | "sagas" | "code" | "design";

/** Which pill entries a path shows, and which is lit — two screens, always (antiIDE's views are its own
 *  tabs since 2026-09-18: Overview · Code · Design · Quality · Architecture · History · Reference). Pure — tested. */
export function screenOptions(pathname: string): { options: { key: Key; label: string }[]; view: Key } {
  const onIde = pathname.startsWith(IDE_CODE_PATH) || pathname.startsWith(IDE_DESIGN_PATH);
  // the two words: Cowork (the desk) · X-ray (the analysis).
  //
  // "Threads" until 2026-09-23, then "Agents", then COWORK (operator 2026-09-26). Each rename fixed the same
  // complaint: the word named the wrong thing. "Threads" named a container the product no longer has. "Agents"
  // names the ROWS IN THE SIDEBAR — the things you pick — not the screen you are on, and the screen needed its own
  // word once the sidebar, the panes and the Studio all lived there together.
  //
  // The words that lost, and why (the operator's own reasons): Team reads as people collaborating, which this is
  // not — nobody here is human. Office is Microsoft's. Flow "doesn't seem right". Crew is a theatre or a dance
  // troupe. Cowork carries the one association that helps: it resembles Claude Cowork, whose layout this genuinely
  // resembles — and a person who sees agents and a Studio in it will know where they are.
  //
  // The key stays `desk`: only the word the operator reads changed, so no route, no storage key and no test id moves.
  //
  // SAGAS, THE THIRD WORD (operator 2026-10-11): the place where the user and their agents keep the work - sagas (a goal; an AI plan is one), their episodes and steps, with a timeline and the numbers
  // of the real runs. It is plural because it lists many. (Queue was the other candidate; it says "waiting", and this page also holds what is running and what is done.)
  const onSagas = pathname.startsWith(SAGAS_PATH);
  return { options: [{ key: "desk", label: "Cowork" }, { key: "ide", label: "X-ray" }, { key: "sagas", label: "Sagas" }], view: onSagas ? "sagas" : onIde ? "ide" : "desk" };
}
export function pathFor(key: Key): string { return key === "desk" ? DESK_PATH : key === "sagas" ? SAGAS_PATH : key === "design" ? IDE_DESIGN_PATH : IDE_CODE_PATH; }

/** The floating pill, top-right, in the same glass as the screen switch, that carries the live instruments. */
export function InstrumentsPill({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="instruments-pill" style={{ position: "fixed", top: FLOATING_TOP, right: 28, zIndex: 125, display: "flex", alignItems: "center", gap: 6, padding: "2px 10px", borderRadius: 9,
      background: `color-mix(in oklab, ${C.panel} var(--antiloki-glass, 78%), transparent)`, border: `1px solid color-mix(in oklab, ${C.border} 70%, transparent)`, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
      {children}
    </div>
  );
}

/** THE INSTRUMENTS: the licence, the agents, the money, the limits, and the logo menu, each as it was, with the fuel and limits windows they open. In the floating pill (top-right) on the screens that have no bar of their own;
 *  `inline` in Cowork's bottom bar (operator 2026-11-10: "the second switcher on top right could be on the bottom bar right"), flat, with the logo's menu hanging upward. */
export function Instruments({ chatSessionId = null, inline = false, onLogo, logoOpen = false }: { chatSessionId?: number | null; inline?: boolean; /** the logo opens this instead of its own small menu (Cowork: the whole sidebar, from the bottom bar; the operator 2026-11-22) */ onLogo?: () => void; logoOpen?: boolean }) {
  const [usageOpen, setUsageOpen] = React.useState(false);   // the usage meter: a small glass popover first, the full window behind "All the numbers" (approved mockup 2026-11-18)
  return (
    <>
      <span data-testid={inline ? "instruments-inline" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <MachineIcon /><FloatingScreening /><SavedChip onOpen={() => setUsageOpen((o) => !o)} /><LimitsIcon onOpen={() => setUsageOpen((o) => !o)} />
        {/* THE COLLAPSED LOGO, AT THE END (operator 2026-10-11): the monogram that opens the same menu (search, account, settings, docs), hanging leftward from the screen's edge. */}
        <span aria-hidden style={{ width: 1, height: 16, background: C.border, margin: "0 4px" }} />
        <span data-testid="pill-logo">{onLogo ? <button data-testid="bar-logo" aria-label="open the menu" aria-expanded={logoOpen} title="Spaces, threads, agents and sagas (Alt+B)" onClick={onLogo} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 2px", display: "inline-flex", alignItems: "center", height: 20 }}><span style={{ fontFamily: nav, fontWeight: 700, fontSize: 15, letterSpacing: -0.5, lineHeight: 1, color: C.fg, userSelect: "none" }}>a<span style={{ color: C.brand }}>.</span></span></button> : <LogoMenu align="right" />}</span>
      </span>
      {usageOpen && <UsagePopover onClose={() => setUsageOpen(false)} />}
    </>
  );
}

/** `pill`: where the instruments go. "top" (the default) is the floating pill; "none" leaves them to the screen, which places `<Instruments inline />` itself (Cowork's bottom bar). */
/** THE SCREEN SWITCH AS A ROW (operator 2026-11-10: "restore the switcher at the center top, but not floating, a bar"): the same three words, not floating, for Cowork's top bar to hold. */
export function ScreenTabs({ bar = false }: { bar?: boolean } = {}) {
  const { pathname } = useLocation();
  const router = useRouter();
  const { options, view } = screenOptions(pathname);
  return <ViewSwitch inline bar={bar} testId="screen-switch" view={view} options={options} onChange={(k) => { const to = pathFor(k); if (to !== pathname) router.navigate({ to }); }} />;
}

/** `pill`: where the instruments go. "top" (the default) is the floating pill; "none" leaves them to the screen, which places `<Instruments inline />` itself (Cowork's bottom bar). `tabs`: "none" leaves the three words to the screen too (Cowork puts them in its sidebar). */
export function ScreenSwitch({ instruments = [], chatSessionId = null, pill = "top", tabs = "top" }: { instruments?: Instrument[]; chatSessionId?: number | null; pill?: "top" | "none"; tabs?: "top" | "none" }) {
  void instruments;
  const { pathname } = useLocation();
  const router = useRouter();
  const { options, view } = screenOptions(pathname);
  return (
    <>
      {/* THE LOGO MENU, TOP-LEFT (operator 2026-09-27): fixed, top-left, on every screen ScreenSwitch draws — which excludes the desk ("/"), whose sidebar carries its own LogoMenu. */}
      {pathname !== DESK_PATH && (
        <div data-testid="screen-logo-menu" style={{ position: "fixed", top: FLOATING_TOP, left: 10, zIndex: 126 }}>
          {/* the Sagas page has no menu on its logo (the operator 2026-11-22: the submenu is legacy): the mark alone, and it takes you back to the desk */}
          {pathname.startsWith("/sagas") ? <button data-testid="sagas-logo" aria-label="back to the desk" onClick={() => router.navigate({ to: DESK_PATH })} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "inline-flex" }}><LogoMark /></button> : (
          /* ALWAYS EXPANDED on X-ray (operator 2026-10-11): there is room, so the product says its own name. */
          <LogoMenu wide />)}
        </div>
      )}
      {tabs === "top" && <ViewSwitch testId="screen-switch" view={view} options={options} onChange={(k) => { const to = pathFor(k); if (to !== pathname) router.navigate({ to }); }} />}
      {/* THE INSTRUMENTS HAVE A PILL OF THEIR OWN, TOP-RIGHT (operator 2026-10-11), floating too: the three screens are one pill and the instruments another, and nothing sits between the words. */}
      {pill === "top" && <InstrumentsPill><Instruments chatSessionId={chatSessionId} /></InstrumentsPill>}
    </>
  );
}
