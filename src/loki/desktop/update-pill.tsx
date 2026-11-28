// UPDATES (operator 2026-09-17: "ready to receive updates and patches from time to time"): the
// shell checks the signed manifest on launch and every 6 h; a newer build shows one quiet pill,
// bottom-left. "restart" downloads, verifies, installs and relaunches — the
// engine's data is untouched. Nothing outside the desktop build.
import React from "react";
import { C, mono } from "@/loki/theme";
import { checkForUpdate, installUpdate, isDesktop, type UpdateInfo } from "./shell";

export function UpdatePill() {
  const [info, setInfo] = React.useState<UpdateInfo | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!isDesktop()) return;
    const run = () => void checkForUpdate().then((u) => { if (u?.available) setInfo(u); });
    const t0 = setTimeout(run, 8000); // after the first paint, never in its way
    const t = setInterval(run, 6 * 3600 * 1000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);
  if (!info?.available) return null;
  const restart = async () => { setBusy(true); setErr(null); const e = await installUpdate(); if (e) { setErr(e); setBusy(false); } };
  return (
    <div data-testid="update-pill" title={info.notes ?? undefined} style={{ position: "fixed", left: 14, bottom: 40, zIndex: 120, display: "flex", alignItems: "center", gap: 8, background: `color-mix(in oklab, ${C.panel} 90%, transparent)`, border: `1px solid color-mix(in oklab, ${C.brand} 60%, transparent)`, borderRadius: 9, padding: "3px 10px", fontFamily: mono, fontSize: 9.5, color: C.muted, backdropFilter: "blur(6px)" }}>
      <span style={{ color: C.brand }}>↑</span>
      <span>antiloki {info.version} is ready</span>
      <button onClick={() => void restart()} disabled={busy} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 6, padding: "1px 8px", cursor: "pointer", fontFamily: mono, fontSize: 9.5 }}>{busy ? "installing…" : "restart to update"}</button>
      {err && <span style={{ color: C.bad }}>{err}</span>}
    </div>
  );
}
