// THE PHONE PANEL (operator 2026-11-10, asked three times: "a tunnel with a QR to use our cell phone like Claude Code does"): turn on the door, show a QR, pair a device with a one-time code, list and revoke devices, start a tunnel.
// Nothing is on until the person turns it on. The links carry a code good for five minutes; the phone trades it for a token and is the owner's from then on, until revoked here.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { remoteDisable, remoteEnable, remotePair, remoteRevoke, remoteStatus, remoteTunnel, type Pairing, type RemoteStatus } from "@/loki/api/remote";
import { clock, deviceLine, linkChoices, qrSvg, secondsLeft } from "./phone-model";

const box: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 };
const btn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontFamily: nav, fontSize: 12.5 };
const primary: React.CSSProperties = { ...btn, background: C.brand, borderColor: C.brand, color: "#fff", fontWeight: 600 };

export function PhonePanel({ onClose, inline = false }: { onClose: () => void; /** drawn in place (the sidebar's Remote section) instead of as a dialog */ inline?: boolean }) {
  const [st, setSt] = React.useState<RemoteStatus | null>(null); const [pairing, setPairing] = React.useState<Pairing | null>(null);
  const [copiedFw, setCopiedFw] = React.useState(false); const [pick, setPick] = React.useState(0); const [err, setErr] = React.useState(""); const [busy, setBusy] = React.useState(false); const [now, setNow] = React.useState(Date.now());
  const refresh = React.useCallback(async () => { const r = await remoteStatus(); if (r.status) setSt(r.status); else setErr(r.error ?? ""); }, []);
  React.useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 4000); return () => clearInterval(t); }, [refresh]);
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  React.useEffect(() => { if (inline) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const run = async (f: () => Promise<{ status: RemoteStatus | null; error?: string }>) => { setBusy(true); setErr(""); const r = await f(); setBusy(false); if (r.status) setSt(r.status); else setErr(r.error ?? "that did not work"); return r.status; };
  const showQr = async () => {
    setBusy(true); setErr("");
    const en = st?.enabled ? { status: st } : await remoteEnable(); if (en.status) setSt(en.status); else { setBusy(false); setErr(en.error ?? "could not open the door"); return; }
    const p = await remotePair(); setBusy(false); if (p.pairing) { setPairing(p.pairing); setPick(0); } else setErr(p.error ?? "could not make a code");
  };
  const links = pairing ? linkChoices(pairing.links) : []; const link = links[Math.min(pick, Math.max(0, links.length - 1))];
  const left = pairing ? secondsLeft(pairing.expires_ms, now) : 0;
  const body = (
    <>
        {err && <div role="alert" data-testid="phone-error" style={{ color: C.bad, fontSize: 12.5 }}>{err}</div>}

        <div style={box}>
          {!pairing ? <button data-testid="phone-show-qr" disabled={busy} onClick={() => void showQr()} style={primary}>{busy ? "one moment…" : "Show the QR code"}</button> : (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
              {link ? <div data-testid="phone-qr" aria-label={`QR code for ${link.url}`} role="img" style={{ width: "min(190px, 100%)", aspectRatio: "1 / 1", background: "#fff", borderRadius: 10, flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: qrSvg(link.url) }} /> : <div data-testid="phone-no-link" style={{ color: C.warn, fontSize: 12.5, maxWidth: 220 }}>This machine has no network address to give out. Connect it to Wi-Fi or a VPN, or start a tunnel below.</div>}
              <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: C.muted }}>Code <b data-testid="phone-code" style={{ fontFamily: mono, color: C.fg, letterSpacing: 2 }}>{pairing.code}</b> · {left > 0 ? <span data-testid="phone-left">expires in {clock(left)}</span> : <span data-testid="phone-expired" style={{ color: C.warn }}>expired</span>}</div>
                {links.length > 1 && <select data-testid="phone-link-pick" aria-label="which address" value={pick} onChange={(e) => setPick(Number(e.target.value))} style={{ background: C.panel, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 6, maxWidth: "100%", minWidth: 0, boxSizing: "border-box", padding: "4px 6px", fontFamily: mono, fontSize: 11.5 }}>{links.map((l, i) => <option key={l.url} value={i}>{l.label} · {l.url.replace(/\/\?pair=.*/, "")}</option>)}</select>}
                {link && <div data-testid="phone-link" style={{ fontFamily: mono, fontSize: 11, color: C.muted, wordBreak: "break-all" }}>{link.url}</div>}
                {st?.firewall && !st.firewall.open && (
                  <div data-testid="phone-firewall" style={{ border: `1px solid ${C.warn}`, borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                    <div style={{ color: C.warn, fontWeight: 600 }}>The phone keeps loading? This machine's firewall ({st.firewall.kind}) drops its connection.</div>
                    <div style={{ color: C.muted, lineHeight: 1.45 }}>Open the port once, from your own network only, then scan again:</div>
                    <code data-testid="phone-firewall-command" style={{ fontFamily: mono, fontSize: 11, wordBreak: "break-all", background: C.panel, padding: "4px 6px", borderRadius: 6 }}>{st.firewall.command}</code>
                    <div><button data-testid="phone-firewall-copy" onClick={() => { void (async () => { try { await navigator.clipboard.writeText(st.firewall!.command); setCopiedFw(true); setTimeout(() => setCopiedFw(false), 1500); } catch { /* the command is on screen to select */ } })(); }} style={btn}>{copiedFw ? "copied" : "Copy the command"}</button></div>
                  </div>
                )}
                {!pairing.app && <div data-testid="phone-no-app" style={{ color: C.warn, fontSize: 12 }}>This machine is not serving the app's files, so the phone would see no page. Start the serve with ANTILOKI_FE_DIR pointing at the built app (npm run build → dist).</div>}
                <div style={{ display: "flex", gap: 8 }}><button data-testid="phone-new-code" disabled={busy} onClick={() => void showQr()} style={btn}>New code</button></div>
              </div>
            </div>
          )}
        </div>

        <div style={box}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Reaching this machine</div>
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
            {st?.enabled ? <>The local network door is <b style={{ color: C.ok }}>on</b>{st.addresses.length ? <> at {st.addresses.map((a) => <span key={a} style={{ fontFamily: mono }}>{a} </span>)}</> : null}. A phone on the same Wi-Fi or VPN (such as Tailscale) can use it.</> : "The local network door is off. Showing the QR turns it on."}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {st?.enabled && <button data-testid="phone-off" disabled={busy} onClick={() => { setPairing(null); void run(remoteDisable); }} style={btn}>Turn the door off</button>}
            {st?.tunnel ? <>
              <span data-testid="phone-tunnel" style={{ fontFamily: mono, fontSize: 11.5, color: C.ok }}>tunnel: {st.tunnel.url}</span>
              <button data-testid="phone-tunnel-stop" disabled={busy} onClick={() => void run(() => remoteTunnel(false))} style={btn}>Stop the tunnel</button>
            </> : st?.cloudflared
              ? <button data-testid="phone-tunnel-start" disabled={busy} onClick={() => void run(() => remoteTunnel(true))} style={btn} title="a public https address through Cloudflare, so the phone works on mobile data; it still needs the pairing">Start a tunnel (works anywhere)</button>
              : <span data-testid="phone-tunnel-missing" style={{ fontSize: 12, color: C.muted }}>For mobile data, install <b>cloudflared</b>: antiloki will offer a tunnel here.</span>}
          </div>
        </div>

        <div style={box}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Paired devices</div>
          {(st?.devices ?? []).length === 0 && <div data-testid="phone-no-devices" style={{ fontSize: 12.5, color: C.muted }}>No phone is paired yet.</div>}
          {(st?.devices ?? []).map((d) => (
            <div key={d.id} data-testid={`phone-device-${d.id}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: d.revoked ? C.muted : C.fg }}>
              <span style={{ flex: 1 }}>{deviceLine(d, now)}</span>
              {!d.revoked && <button data-testid={`phone-revoke-${d.id}`} disabled={busy} onClick={() => void run(() => remoteRevoke(d.id))} style={{ ...btn, color: C.bad }}>Take out</button>}
            </div>
          ))}
        </div>
    </>
  );
  if (inline) return <div data-testid="phone-inline" style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: nav, fontSize: 12.5, color: C.fg }}>{body}</div>;
  return (
    <div role="dialog" aria-label="Phone" data-testid="phone-panel" style={{ position: "fixed", inset: 0, zIndex: 400, display: "grid", placeItems: "center", background: "rgba(0,0,0,.5)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "min(560px, calc(100vw - 24px))", maxHeight: "calc(100vh - 24px)", overflowY: "auto", background: C.bg, color: C.fg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 12, fontFamily: nav }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Use antiloki from your phone</div><button data-testid="phone-close" aria-label="close" onClick={onClose} style={btn}>✕</button></div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>Scan the code with your phone's camera. It opens antiloki from this machine and pairs the phone, once. Nothing is reachable from outside until you turn it on here, and you can take a phone out at any time.</div>
      {body}
      </div>
    </div>
  );
}
