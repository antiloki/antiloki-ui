import React from "react";
import { Link } from "@tanstack/react-router";
import { useShell } from "./slug-context";
import { useNotifications } from "@/loki/api/hooks";
import { dispatchNotifDismiss } from "@/loki/api/dispatch";
import { EndpointStub } from "@/loki/components/EndpointStub";
import { C } from "@/loki/theme";


const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

const SEV: Record<string, string> = { error: C.bad, warning: C.warn, info: C.brand }; // C.info never existed — this rendered undefined (invisible) info badges

export function NotificationsDrawer() {
  const { notifOpen, setNotifOpen } = useShell();
  const { data, loading, notWired, error, refetch } = useNotifications();
  if (!notifOpen) return null;
  const items = data || [];

  return (
    <>
      <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.4)", zIndex: 80 }} />
      <aside style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 440, maxWidth: "90vw",
        background: C.bg, borderLeft: `1px solid ${C.border}`, zIndex: 90,
        display: "flex", flexDirection: "column", boxShadow: "-12px 0 32px -8px rgba(0,0,0,.5)",
      }}>
        <div style={{ height: 44, padding: "0 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11, color: C.dim }}>
          <span style={{ color: C.fg }}>notifications</span>
          <span>·</span>
          <span>{items.length} active</span>
          <div style={{ flex: 1 }} />
          <button onClick={refetch} title="Refresh" aria-label="Refresh notifications" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 13 }}>↻</button>
          <button onClick={() => setNotifOpen(false)} aria-label="Close notifications" style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {notWired ? (
            <EndpointStub endpoint="/api/v1/notifications/list" />
          ) : loading && !data ? (
            <div style={{ padding: 24, color: C.muted, fontFamily: mono, fontSize: 12 }}>loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: C.muted, fontFamily: mono, fontSize: 12 }}>
              {error ? "BE unreachable." : "no notifications · all clear"}
            </div>
          ) : (
            items.map(n => (
              <div key={n.id} style={{
                padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
                borderLeft: `3px solid ${SEV[n.severity] || C.muted}`,
                fontFamily: '-apple-system, system-ui, sans-serif', color: C.fg,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: SEV[n.severity] || C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{n.severity}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.muted }}>{n.kind}</span>
                  <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10, color: C.muted }}>{new Date(n.ts).toLocaleTimeString()}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: C.fg, marginBottom: 8, whiteSpace: "pre-wrap" }}>{n.message_md}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {n.card_slug && (
                    <Link to="/" onClick={() => setNotifOpen(false)} style={{ fontFamily: mono, fontSize: 10, color: C.brand, textDecoration: "none" }}>
                      → {n.card_slug}
                    </Link>
                  )}
                  <button
                    onClick={async () => { await dispatchNotifDismiss(n.id); refetch(); }}
                    style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`, color: C.dim, fontFamily: mono, fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}
                  >dismiss</button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
