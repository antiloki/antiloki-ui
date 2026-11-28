// EPIC-CHAT-WIDGETS: the drawer is now a thin shell — the 480px right-side
// chrome around the shared <ChatThread>. The full-page chat at "/" renders the
// same ChatThread with variant="page", so the two surfaces can't drift. All the
// session/turn/composer/discuss/reference-tray logic lives in chat-thread.tsx.
import React from "react";
import { useShell } from "./slug-context";
import { C } from "@/loki/theme";

// the drawer is shut until it is opened: the chat screen (and the notebooks, cockpit and atlas it brings) is fetched then, not on every first load
const ChatThread = React.lazy(() => import("@/loki/chat/chat-thread").then((m) => ({ default: m.ChatThread })));

export function ChatDrawer() {
  const { chatOpen, setChatOpen } = useShell();
  if (!chatOpen) return null;
  return (
    <>
      <div
        onClick={() => setChatOpen(false)}
        style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.4)", zIndex: 80 }}
      />
      <aside style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 480, maxWidth: "90vw",
        background: C.bg, borderLeft: `1px solid ${C.border}`,
        zIndex: 90, display: "flex", flexDirection: "column",
        boxShadow: "-12px 0 32px -8px rgba(0,0,0,.5)",
      }}>
        <React.Suspense fallback={<div style={{ padding: 16, fontSize: 13, opacity: 0.6 }}>loading…</div>}><ChatThread variant="drawer" onRequestClose={() => setChatOpen(false)} /></React.Suspense>
      </aside>
    </>
  );
}
