import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useShell } from "./slug-context";
import { Term } from "./term";
import { useFocus, useDriverStatus, useNotifications, useActiveCards } from "@/loki/api/hooks";
import type { ActiveCard } from "@/loki/api/hooks";
import { C } from "@/loki/theme";


const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { setChatOpen, setPaletteOpen, chatOpen, role, setRole, notifOpen, setNotifOpen } = useShell();
  const notifQ = useNotifications();
  const errCount = (notifQ.data || []).filter((n: any) => n.severity === "error" && !n.dismissed_at).length;
  const [roleMenu, setRoleMenu] = useState(false);
  const focusQ = useFocus();
  const driverQ = useDriverStatus();

  const redCount = focusQ.data?.signals
    ? Object.values(focusQ.data.signals).filter((s: any) => s.signal === "red").length
    : 0;

  const driver = driverQ.data;
  let healthColor: string = C.muted;
  let healthTip = "BE status unknown";
  if (driver) {
    if (driver.halt_file_exists) { healthColor = C.bad; healthTip = "Driver HALTED (halt file present)"; }
    else if (driver.be_tick_running || driver.tick_in_progress) { healthColor = C.ok; healthTip = `BE working · ${driver.ticks_5m} ticks/5m · $${(driver.cost_usd_1h ?? 0).toFixed(2)}/h`; }
    // Idle is the resting state, not a fault: the driver runs as a straight line
    // on dispatch then sleeps. Muted (not amber/red) so a quiet board reads calm.
    else { healthColor = C.muted; healthTip = "BE idle · nothing to run (wakes on dispatch)"; }
  } else if (driverQ.error) {
    healthColor = C.bad;
    healthTip = "BE unreachable";
  }

  return (
    <header style={{
      height: 48,
      background: C.bg,
      borderBottom: `1px solid ${C.border}`,
      color: C.fg,
      display: "flex", alignItems: "center", gap: 12,
      padding: "0 14px",
      fontFamily: '-apple-system, system-ui, sans-serif',
      fontSize: 13,
      position: "relative",
    }}>
      <button
        onClick={onToggleSidebar}
        style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 14 }}
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >☰</button>

      {/* Substrate heartbeat — visible proof the driver is ticking.
          Pulses with each new tick (detected by tick-count increment); freshness
          is encoded in dot color/glow so operator can scan-judge "alive" without
          reading the tooltip. */}
      <SubstrateHeartbeat driver={driver} error={!!driverQ.error} tip={healthTip} color={healthColor} />

      {/* RUN/PAUSE controls deliberately NOT in the topbar — they live
          inside cards / waterfall / drift cards so the operator only
          runs the substrate when in context. Operator feedback 2026-05-28. */}

      {/* Doing-cards dropdown — preview of cards currently in flight,
          replaces the operator/builder/observer role switcher per
          operator feedback. Click a row to jump to that card's waterfall. */}
      <DoingCardsDropdown open={roleMenu} setOpen={setRoleMenu} />

      <div style={{ flex: 1 }} />

      {/* drift badge — from real signals */}
      {redCount > 0 && (
        <Link to="/operations" style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "transparent", border: `1px solid ${C.bad}`,
          borderRadius: 8, padding: "5px 10px",
          color: C.bad, textDecoration: "none",
          fontFamily: mono, fontSize: 11,
        }} title="Cards with red signal · open board">
          <span style={{ fontSize: 13 }}>●</span>
          <span>{redCount} <Term name="drift">red</Term></span>
        </Link>
      )}

      <button
        onClick={() => setPaletteOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "6px 12px", color: C.dim, cursor: "pointer",
          fontFamily: '-apple-system, system-ui, sans-serif', fontSize: 12, minWidth: 240,
        }}
      >
        <span style={{ fontSize: 14 }}>⌘</span>
        <span>Search · jump · run skill…</span>
      </button>


      <button
        onClick={() => setNotifOpen(!notifOpen)}
        title="Notifications"
        aria-label="Notifications"
        style={{
          position: "relative",
          background: notifOpen ? C.panel : "transparent",
          color: errCount > 0 ? C.bad : C.dim,
          border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "6px 10px", cursor: "pointer", fontFamily: mono, fontSize: 13,
        }}
      >
        🔔
        {errCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: C.bad, color: "#fff",
            fontSize: 9, fontWeight: 700, minWidth: 16, height: 16,
            padding: "0 4px", borderRadius: 8, display: "grid", placeItems: "center",
            fontFamily: mono,
          }}>{errCount}</span>
        )}
      </button>

      <button
        onClick={() => setChatOpen(!chatOpen)}
        style={{
          background: chatOpen ? C.brand : "transparent",
          color: chatOpen ? C.bg : C.dim,
          border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "6px 12px", cursor: "pointer", fontFamily: mono, fontSize: 11,
        }}
        title="Toggle chat drawer"
      >chat</button>
    </header>
  );
}

// Substrate heartbeat — replaces the static "BE" pill. Shows:
//  - a colored dot that PULSES briefly on every newly-detected tick
//  - the current ticks/5m + ticks/1h counts (live, updated every poll)
//  - the elapsed seconds since the last tick (1s tick to keep it honest)
//  - a hover tooltip with full state
//
// Color encoding:
//  - green        : substrate ticking + recent activity (last tick < 60s)
//  - amber        : ticking but no recent activity (60s–300s)
//  - red          : >5min since last tick OR halt flag set OR BE unreachable
//  - muted        : status unknown
function SubstrateHeartbeat({ driver, error, tip, color }: {
  driver: any | null; error: boolean; tip: string; color: string;
}) {
  // Detect a new tick by watching ticks_5m + last_tick_at; pulse on change.
  const lastTickAt = driver?.last_tick_at ?? null;
  const ticks5m = driver?.ticks_5m ?? 0;
  const [pulse, setPulse] = React.useState(false);
  const prevKey = React.useRef<string>("");
  React.useEffect(() => {
    const key = `${lastTickAt}|${ticks5m}`;
    if (prevKey.current && prevKey.current !== key) {
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 600);
      return () => window.clearTimeout(t);
    }
    prevKey.current = key;
  }, [lastTickAt, ticks5m]);

  // Tick a 1Hz clock so "Xs ago" stays honest between BE polls.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, []);

  let ageSec: number | null = null;
  if (lastTickAt) {
    // Substrate stores "YYYY-MM-DD HH:MM:SS" UTC. Treat naked timestamp as UTC.
    const parsed = lastTickAt.includes("T") ? Date.parse(lastTickAt) : Date.parse(lastTickAt.replace(" ", "T") + "Z");
    if (Number.isFinite(parsed)) ageSec = Math.max(0, Math.round((now - parsed) / 1000));
  }

  // Health, NOT freshness. The driver is event-driven: it runs as a straight
  // line on dispatch then goes dormant. "No recent tick" is the normal idle
  // state, not a dead loop — so we never colour idle red. Down means only:
  // BE unreachable or halted. A failing card backs off on its own (per-card
  // window) without halting the loop, so red notifications no longer pause it.
  let dotColor = color;
  let fresh: "live" | "idle" | "down" = "idle";
  const working = !!driver && (driver.be_tick_running || driver.tick_in_progress);

  if (error || !driver) { dotColor = C.bad; fresh = "down"; }
  else if (driver.halt_file_exists) { dotColor = C.bad; fresh = "down"; }
  else if (working) { dotColor = C.ok; fresh = "live"; }
  else { dotColor = C.muted; fresh = "idle"; }

  const richTip = error ? tip :
    !driver ? "BE status unknown" :
    driver.halt_file_exists ? "Driver HALTED" :
    working ? `Driver working · last tick ${ageSec ?? "?"}s ago · ${ticks5m} ticks/5m · ${driver.ticks_1h ?? 0}/1h · $${(driver.cost_usd_1h ?? 0).toFixed(2)}/h` :
    `Driver idle · nothing to run. Runs as a straight line on dispatch, then sleeps.${lastTickAt ? ` Last tick ${ageSec ?? "?"}s ago.` : ""}`;

  return (
    <div
      title={richTip}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        background: C.panel, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "6px 10px",
        fontFamily: mono, fontSize: 11, color: C.dim,
      }}
    >
      {/* heartbeat dot */}
      <span style={{
        position: "relative", width: 10, height: 10, display: "inline-block",
      }}>
        <span style={{
          position: "absolute", inset: 1, borderRadius: "50%",
          background: dotColor,
          boxShadow: `0 0 ${pulse ? 14 : 6}px ${dotColor}`,
          transition: "box-shadow .15s ease-out",
        }} />
        {fresh === "live" && (
          <span style={{
            position: "absolute", inset: -2, borderRadius: "50%",
            border: `1px solid ${dotColor}`,
            animation: pulse ? "antilokiPulseExpand .6s ease-out forwards" : "none",
            opacity: pulse ? 1 : 0,
          }} />
        )}
      </span>
      <span style={{ color: C.fg, letterSpacing: 0.4 }}>BE</span>
      {driver?.halt_file_exists ? (
        <span style={{ color: C.bad, fontWeight: 700, letterSpacing: 0.4 }}>
          · HALTED
        </span>
      ) : working ? (
        <span style={{ color: C.muted }}>
          · {ageSec != null ? `${ageSec}s ago` : "live"}
          {" · "}
          <span style={{ color: dotColor }}>{ticks5m}t/5m</span>
        </span>
      ) : driver ? (
        <span style={{ color: C.muted }}>· idle</span>
      ) : null}
      <HeartbeatStyleInjector />
    </div>
  );
}

let _antilokiPulseInjected = false;
function HeartbeatStyleInjector() {
  React.useEffect(() => {
    if (_antilokiPulseInjected || typeof document === "undefined") return;
    _antilokiPulseInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes antilokiPulseExpand {
        from { transform: scale(0.6); opacity: 1; }
        to   { transform: scale(2.6); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}

// Doing-cards dropdown. Replaces the role switcher: shows every card the
// substrate has at status=doing, ranked by most recent event. The trigger
// button summarizes the count + names the most-recent one; the menu lists
// all of them with their current derived phase. Clicking a row navigates
// to that card's waterfall.
export function DoingCardsDropdown({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const q = useActiveCards();
  const cards: ActiveCard[] = Array.isArray(q.data) ? q.data : [];
  const sorted = React.useMemo(() => {
    return cards.slice().sort((a, b) => String(b.last_event_ts ?? "").localeCompare(String(a.last_event_ts ?? "")));
  }, [cards]);
  const head = sorted[0] ?? null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        title={cards.length === 0 ? "No doing cards" : `${cards.length} card(s) in flight`}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "transparent", border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "5px 10px",
          color: C.dim, cursor: "pointer", fontFamily: mono, fontSize: 11,
          maxWidth: 320,
        }}
      >
        <span style={{
          fontSize: 10, padding: "1px 6px", borderRadius: 3,
          background: cards.length > 0 ? C.panel : "transparent",
          color: cards.length > 0 ? C.brand : C.muted,
          fontWeight: 600,
        }}>
          {cards.length} doing
        </span>
        {head ? (
          <>
            <code style={{ color: C.brand, fontWeight: 600 }}>#{head.id}</code>
            <span style={{ color: C.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
              {head.title}
            </span>
          </>
        ) : (
          <span style={{ color: C.muted }}>nothing in flight</span>
        )}
        <span style={{ color: C.muted, marginLeft: 2 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: 6, minWidth: 360, maxWidth: 480,
            maxHeight: 460, overflow: "auto",
            boxShadow: "0 12px 32px -8px rgba(0,0,0,.5)",
          }}>
            <div style={{ padding: "6px 8px", fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
              cards in flight · doing
            </div>
            {sorted.length === 0 && (
              <div style={{ padding: "10px 8px", color: C.muted, fontStyle: "italic", fontSize: 11 }}>
                No active cards. Set a backlog card's intent to <code style={{ fontFamily: mono }}>play</code> to queue it.
              </div>
            )}
            {sorted.map((c) => (
              <Link
                key={c.slug}
                to="/"
                onClick={() => setOpen(false)}
                style={{
                  display: "flex", flexDirection: "column", gap: 3,
                  padding: "7px 9px", margin: "1px 2px",
                  borderRadius: 6, textDecoration: "none", color: C.fg,
                  background: "transparent",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.panel)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 10 }}>
                  <code style={{ color: C.brand, fontWeight: 600 }}>#{c.id}</code>
                  <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {c.slug}
                  </span>
                  {c.current_phase && (
                    <span style={{
                      padding: "1px 6px", borderRadius: 3,
                      background: C.panel, color: C.brand, fontWeight: 500,
                    }}>{c.current_phase}</span>
                  )}
                  {c.driver_intent === "play" && <span style={{ color: C.ok }}>▶</span>}
                  {c.driver_intent === "paused" && <span style={{ color: C.warn }}>⏸</span>}
                </div>
                <div style={{ fontSize: 11.5, color: C.fg, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
                  {c.title}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
