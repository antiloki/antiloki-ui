// THE BOARD'S GLYPHS (mockup boards 1 to 4): control flow and tools are icons, roles are avatars. Drawn inline (no network, no font), in the current colour.
import * as React from "react";
import { ROLE_COLOR, type FaceKey, type NodeState } from "./model";
import { AgentFace, useAgentTheme } from "./themes";

const P: Record<string, React.ReactNode> = {
  recap: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /><path d="M3 4.5v4h4" /><path d="M5.2 8.5A8.5 8.5 0 0 1 12 3.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  report: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 11h6M9 14.5h6" /><path d="M9 18l1.6-1.6L14 19.8" /><circle cx="17.5" cy="17.5" r="2.6" /><path d="M19.4 19.4 21 21" /></>,
  teamchat: <><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h8A2.5 2.5 0 0 1 16 5.5v4a2.5 2.5 0 0 1-2.5 2.5H8l-3.5 3v-3A2.5 2.5 0 0 1 3 9.5z" /><path d="M8 15.5v.5A2.5 2.5 0 0 0 10.5 18.5H16l3.5 3v-3A2.5 2.5 0 0 0 22 16v-4a2.5 2.5 0 0 0-2-2.4" /><circle cx="7" cy="7.5" r=".9" fill="currentColor" /><circle cx="10" cy="7.5" r=".9" fill="currentColor" /><circle cx="13" cy="7.5" r=".9" fill="currentColor" /></>,
  waterfall: <><path d="M3 20h18" /><rect x="4" y="4" width="7" height="3.2" rx="1.2" /><rect x="8" y="9" width="8" height="3.2" rx="1.2" /><rect x="13" y="14" width="7" height="3.2" rx="1.2" /><path d="M11 5.6h0M16 10.6h0" /></>,
  plan: <><path d="M3 20h18M3 20V4" /><path d="M5 16l4-5 4 3 6-8" /><path d="M5 18l4-3 4 1 6-4" strokeDasharray="2 2.5" /><circle cx="19" cy="6" r="1.3" /></>,
  diff: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 11h6M12 8v6" /><path d="M9 18h6" /></>,
  context: <><path d="M12 3 3 7.5l9 4.5 9-4.5z" /><path d="M3 12l9 4.5 9-4.5" /><path d="M3 16.5 12 21l9-4.5" /></>,
  files: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 11h18" /><path d="M8 15h5" /></>,
  sagas: <><rect x="3" y="4" width="18" height="5" rx="1.8" /><rect x="3" y="11" width="12" height="5" rx="1.8" /><rect x="3" y="18" width="7" height="3" rx="1.2" /><path d="M19 12v4M17 14h4" /></>,
  ifelse: <><path d="M12 3l9 9-9 9-9-9z" /><path d="M12 8v4M12 15v.5" /></>,
  switch: <><path d="M3 12h6" /><path d="M9 12l8-7h4" /><path d="M9 12h12" /><path d="M9 12l8 7h4" /></>,
  loop: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></>,
  foreach: <><rect x="4" y="4" width="16" height="4" rx="1" /><rect x="4" y="10" width="16" height="4" rx="1" /><rect x="4" y="16" width="16" height="4" rx="1" /></>,
  timer: <><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9v4.5l3 2" /><path d="M9 3h6" /></>,
  fork: <><path d="M3 12h5" /><path d="M8 12l7-6h6" /><path d="M8 12l7 6h6" /></>,
  join: <><path d="M21 12h-5" /><path d="M16 12l-7-6H3" /><path d="M16 12l-7 6H3" /></>,
  fallback: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  gauge: <><path d="M4 17a8 8 0 1 1 16 0" /><path d="M12 17l4-5" /></>,
  hand: <><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.2 6-5.2 6-2.4 0-3.6-1.2-4.8-3.5L5 13a1.5 1.5 0 0 1 2.6-1.4L8 12.5" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5L3 17.6 6.4 21l6.3-6.3a4 4 0 0 0 5-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
  float: <><rect x="3" y="4" width="14" height="11" rx="2" /><rect x="9" y="10" width="12" height="10" rx="2" fill="var(--c-panel, #111)" /></>,
  side: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  pane: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></>,
  plug: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" />,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  term: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 10l3 2.5L7 15M12 15h5" /></>,
  deliver: <><path d="M5 12l4 4 10-10" /></>,
  model: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /><path d="M10 12h4" /></>,
  check: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12.5l3 3 5-6" /></>,
  artifact: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 18v-3M12 18v-5M15 18v-2" /></>,
  code: <><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14" /></>,
  transform: <><path d="M3 8h14M13 4l4 4-4 4" /><path d="M21 16H7M11 12l-4 4 4 4" /></>,
  stop: <><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" /><path d="M8 12h8" /></>,
  subteam: <><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="8" width="10" height="9" rx="1.5" /><path d="M10 12h4" /></>,
  db: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  saga: <><path d="M5 5h14M5 12h14M5 19h9" /><circle cx="3" cy="5" r=".6" /><circle cx="3" cy="12" r=".6" /><circle cx="3" cy="19" r=".6" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></>,
  spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></>,
  planner: <><path d="M5 4h14v16H5z" /><path d="M9 9h6M9 13h6M9 17h3" /></>,
  worker: <><path d="M4 20l6-6" /><path d="M14 4l6 6-3 3-6-6z" /><path d="M10 14l-2-2" /></>,
  qa: <><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4M8.5 11l2 2 3-3.5" /></>,
  debugger: <><circle cx="12" cy="13" r="4.5" /><path d="M12 8.5V6M8 9L5.5 7M16 9l2.5-2M7.5 13H4M16.5 13H20M8.5 17.5L6 20M15.5 17.5L18 20" /></>,
  audit: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12h6M12 9v6" /></>,
  play: <path d="M7 5l11 7-11 7z" />, pause: <path d="M8 5v14M16 5v14" />, x: <path d="M6 6l12 12M18 6L6 18" />, tick: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, coin: <><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8m0 8v1.5" /></>,
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />, chat: <path d="M4.5 6.5a2 2 0 012-2h11a2 2 0 012 2v8a2 2 0 01-2 2H10l-4 3.5v-3.5a2 2 0 01-1.5-2z" />, list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  bars: <path d="M4 6.5h9M7 12h12M10 17.5h7" />, layers: <><path d="M12 4l8.5 4.5L12 13 3.5 8.5z" /><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" /></>, flag: <path d="M5.5 20.5v-16M5.5 5h11l-2 3.5 2 3.5h-11" />,
  moon: <path d="M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z" />, gear: <><path d="M12 5.5V3.5M12 20.5v-2M5.5 12h-2M20.5 12h-2M7.4 7.4L6 6M18 18l-1.4-1.4M7.4 16.6L6 18M18 6l-1.4 1.4" /><circle cx="12" cy="12" r="3.5" /></>,
  more: <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" />, chev: <path d="M7 10l5 5 5-5" />, seq: <path d="M6 4v16M12 4v16M18 4v16M6 9h6M12 15h6" />, graph: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.3 11l7.4-4M8.3 13l7.4 4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  branch: <><circle cx="7" cy="6" r="2" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="8" r="2" /><path d="M7 8v8M17 10c0 4-10 2-10 6" /></>, undo: <path d="M9 7L4.5 11.5 9 16M5 11.5h9a5 5 0 010 10h-2" />,
  agent: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-4 3-6 7-6s7 2 7 6" /></>,
};
export function Icon({ name, size = 22, color = "currentColor", stroke = 1.7 }: { name: string; size?: number; color?: string; stroke?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{P[name] ?? P.pane}</svg>;
}
/** An avatar: a round head and shoulders in the role's colour on a dark disc; the ring takes the same colour. */
export function Avatar({ role, size = 34 }: { role: keyof typeof ROLE_COLOR; size?: number }) {
  const c = ROLE_COLOR[role] ?? "#888";
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden data-role={role} style={{ flex: "none" }}><circle cx="12" cy="12" r="11" fill="#0b1213" stroke={c} strokeWidth="1.4" /><circle cx="12" cy="10" r="3.4" fill={c} opacity=".9" /><path d="M5.5 20c.8-3.6 3.3-5.2 6.5-5.2s5.7 1.6 6.5 5.2" fill={c} opacity=".55" /></svg>;
}

/** A role as one letter in a small outlined box (the list rows, the palette) in the Microchip theme; in any other theme, the small face of that theme. The border carries the role's colour, thinly. */
export function RoleBox({ role, size = 18, letter, face, state = "idle" }: { role: keyof typeof ROLE_COLOR; size?: number; letter?: string; face?: FaceKey; state?: NodeState }) {
  const [theme] = useAgentTheme();
  const L: Record<string, string> = { leader: "L", planner: "P", worker: "W", qa: "Q", debugger: "D", audit: "A", human: "H", agent: "G" };
  const ch = letter ?? L[role] ?? "?";
  if (theme !== "microchip" && role !== "human") return <span data-role={role} style={{ display: "inline-flex", flex: "none" }}><AgentFace theme={theme} face={face ?? (role === "leader" || role === "planner" || role === "worker" || role === "qa" || role === "debugger" || role === "audit" ? role : "worker")} code={ch} letter={ch} name={ch} state={state} size={Math.round(size * 1.35)} /></span>;
  return <span data-role={role} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, border: `1px solid ${ROLE_COLOR[role]}66`, borderRadius: 3, fontFamily: "ui-monospace, monospace", fontSize: Math.round(size * 0.55), color: "var(--c-muted)", flex: "none" }}>{L[role] ?? "?"}</span>;
}
