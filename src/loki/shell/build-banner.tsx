// THE PAGE AND THE SERVE MUST BE THE SAME BUILD (operator 2026-11-11: "the phone showed a completely different version of antiloki, old, strange"). A page kept by a phone's cache, or reached through a tunnel to another serve, can be older than the
// serve it talks to, and then buttons call routes that are not there. The serve says which build of the app it hands out (the name of the entry script in its index.html: `/healthz` `fe_build`); the page knows its own. When they differ the page says so and
// offers one tap to load the right one. In the dev server (no hashed entry) and when the serve hands out no app files there is nothing to compare and nothing is shown.
import * as React from "react";
import { C, nav } from "@/loki/theme";
import { apiGet } from "@/loki/api/client";

/** The entry script's file name of the page being shown (`index-Bhn54EIs.js`), or null in dev. Pure over the document. */
export function pageBuild(doc: Pick<Document, "querySelectorAll"> = document): string | null {
  for (const s of Array.from(doc.querySelectorAll("script[src]"))) { const m = /\/assets\/(index-[A-Za-z0-9_-]+\.js)(?:\?|$)/.exec(s.getAttribute("src") ?? ""); if (m) return m[1]; }
  return null;
}
/** Is this page not the build the serve hands out? Both must be known. Pure - tested. */
export const isStale = (page: string | null, serve: string | null | undefined): boolean => !!page && !!serve && page !== serve;

export function BuildBanner() {
  const [stale, setStale] = React.useState<{ page: string; serve: string } | null>(null);
  React.useEffect(() => {
    const page = pageBuild(); if (!page) return; let stop = false;
    const check = () => void (async () => { try { const r: any = await apiGet("/healthz"); const serve = typeof r?.fe_build === "string" ? r.fe_build : null; if (!stop) setStale(isStale(page, serve) ? { page, serve: serve! } : null); } catch { /* the connection banner is elsewhere */ } })();
    check(); const t = setInterval(check, 60_000); const v = () => { if (document.visibilityState === "visible") check(); }; document.addEventListener("visibilitychange", v);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, []);
  if (!stale) return null;
  const reload = () => { try { const u = new URL(window.location.href); u.searchParams.set("v", stale.serve); window.location.replace(u.toString()); } catch { window.location.reload(); } };
  return (
    <div data-testid="build-banner" role="alert" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2000, display: "flex", alignItems: "center", gap: 10, padding: "8px 14px calc(8px + env(safe-area-inset-bottom, 0px))", background: `color-mix(in srgb, ${C.warn} 18%, ${C.bg})`, borderTop: `1px solid ${C.warn}`, fontFamily: nav, fontSize: 12.5, color: C.fg, flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 200 }}>This page is an older build of antiloki than the one it is connected to, so some buttons may not work.</span>
      <button data-testid="build-reload" onClick={reload} style={{ background: C.brand, color: "#fff", border: "none", borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontFamily: nav, fontSize: 12.5, fontWeight: 600 }}>Load the current one</button>
      <span data-testid="build-ids" style={{ fontSize: 10.5, color: C.muted, width: "100%" }}>page {stale.page} · serve {stale.serve}</span>
    </div>
  );
}
