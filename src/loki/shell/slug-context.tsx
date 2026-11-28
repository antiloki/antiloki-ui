import React, { createContext, useContext, useEffect, useState } from "react";


export type Slug = {
  slug: string;
  phase: string;
  agent: string;
  status: "doing" | "done" | "blocked" | "todo";
};

export const ACTIVE_SLUGS: Slug[] = [
  { slug: "LOKI-COCKPIT-COST-DASHBOARD-001", phase: "qa", agent: "QA", status: "doing" },
  { slug: "ROLE-CLI-TL-COMMANDS-001", phase: "dev", agent: "DEV", status: "doing" },
  { slug: "DOCS-LIVING-FOUNDATION-001", phase: "tl", agent: "TL", status: "doing" },
  { slug: "MULTI-MODEL-ROUTING-001", phase: "pl", agent: "PL", status: "doing" },
  { slug: "LOKI-DRIFT-AUTOSCAN-002", phase: "close", agent: "—", status: "done" },
  { slug: "LOKI-COCKPIT-CHAT-LOG-VIEW-001", phase: "propose", agent: "—", status: "todo" },
  { slug: "PUBLIC-AUDIT-EXPORT-001", phase: "blocked", agent: "—", status: "blocked" },
];

type Role = "operator" | "builder" | "observer";

// A pending seed handed to the chat drawer.
//   - cardSlug (+ optional field): enter "discuss this card/field" mode.
//   - compose: pre-fill the composer with a starter and focus it, staying in
//     normal interviewer mode (used by "+ propose card" — the operator edits
//     the starter, sends, then confirms the proposed card.add). The two are
//     mutually exclusive; compose takes effect only when cardSlug is absent.
// The drawer consumes the seed once, then clears it.
export type ChatSeed = { cardSlug?: string; field?: string; compose?: string } | null;

type Ctx = {
  activeSlug: Slug;
  setActiveSlug: (s: Slug) => void;
  role: Role;
  setRole: (r: Role) => void;
  chatOpen: boolean;
  setChatOpen: (o: boolean) => void;
  chatSeed: ChatSeed;
  setChatSeed: (s: ChatSeed) => void;
  openChatWith: (s: ChatSeed) => void;
  // vibe (2026-07-12): the main left rail collapses to icons-only while the
  // pane grid is on screen — every horizontal pixel goes to the agents.
  railCollapsed: boolean;
  setRailCollapsed: (b: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  notifOpen: boolean;
  setNotifOpen: (o: boolean) => void;
  aiCallId: number | null;
  setAiCallId: (id: number | null) => void;
};

const SlugCtx = createContext<Ctx | null>(null);

const ROLE_KEY = "antiloki:role";

export function SlugProvider({ children }: { children: React.ReactNode }) {
  const [activeSlug, setActiveSlug] = useState<Slug>(ACTIVE_SLUGS[0]);
  const [role, setRoleState] = useState<Role>(() => {
    if (typeof window === "undefined") return "operator";
    const stored = window.localStorage?.getItem(ROLE_KEY) as Role | null;
    return stored === "operator" || stored === "builder" || stored === "observer" ? stored : "operator";
  });
  const setRole = (r: Role) => {
    setRoleState(r);
    if (typeof window !== "undefined") window.localStorage?.setItem(ROLE_KEY, r);
  };
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState<ChatSeed>(null);
  const openChatWith = (s: ChatSeed) => { setChatSeed(s); setChatOpen(true); };
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [aiCallId, setAiCallId] = useState<number | null>(null);


  return (
    <SlugCtx.Provider value={{
      activeSlug, setActiveSlug,
      role, setRole,
      chatOpen, setChatOpen,
      chatSeed, setChatSeed, openChatWith,
      railCollapsed, setRailCollapsed,
      paletteOpen, setPaletteOpen,
      notifOpen, setNotifOpen,
      aiCallId, setAiCallId,
    }}>
      {children}
    </SlugCtx.Provider>
  );
}

export function useShell() {
  const v = useContext(SlugCtx);
  if (!v) throw new Error("useShell must be used inside SlugProvider");
  return v;
}
/** The shell when there is one — null outside the SlugProvider (a widget rendered on its own, a test). */
export function useShellMaybe() { return useContext(SlugCtx); }
