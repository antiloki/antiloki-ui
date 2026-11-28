// THE REMOTE SECTION OF THE SIDEBAR (operator 2026-11-11: "phone pairing, SSH machines: how do I test that? The frontend has no button for it: a Remote button on the sidebar, and below Sagas the space for the QR code of the phone, or the link to connect another machine over SSH: connect or publish").
// Three things, each a button that opens its own part in place: the PHONE (a QR to scan, a one-time code, the paired devices), MACHINES (other computers over SSH: add, connect in one click, open their screen), and PUBLISH (a public link to this machine through a tunnel, and a pairing link to hand out).
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { remotePair, remoteStatus, remoteTunnel, type Pairing, type RemoteStatus } from "@/loki/api/remote";
import { PhonePanel } from "./phone-panel";
import { MachinesPanel } from "./machines-panel";
import { clock, secondsLeft } from "./phone-model";

export type RemotePart = "phone" | "machines" | "publish" | null;
const btn = (on: boolean): React.CSSProperties => ({ flex: 1, minWidth: 0, background: on ? `color-mix(in srgb, ${C.brand} 18%, transparent)` : "transparent", color: on ? C.brand : C.fg, border: `1px solid ${on ? C.brand : C.border}`, borderRadius: 7, padding: "5px 4px", cursor: "pointer", fontFamily: nav, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
const small: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.fg, borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: nav, fontSize: 12 };

/** PUBLISH: a public address for this machine through a tunnel (cloudflared, when installed), and a pairing link to hand to whoever should use it. Nothing is published until the person starts it; the link alone opens nothing without the code. */
export function PublishBody() {
  const [st, setSt] = React.useState<RemoteStatus | null>(null); const [pairing, setPairing] = React.useState<Pairing | null>(null); const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState(""); const [copied, setCopied] = React.useState(""); const [now, setNow] = React.useState(Date.now());
  const refresh = React.useCallback(async () => { const r = await remoteStatus(); if (r.status) setSt(r.status); else setErr(r.error ?? ""); }, []);
  React.useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 5000); return () => clearInterval(t); }, [refresh]);
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const tunnel = async (on: boolean) => { setBusy(true); setErr(""); const r = await remoteTunnel(on); setBusy(false); if (r.status) { setSt(r.status); if (!on) setPairing(null); } else setErr(r.error ?? "that did not work"); };
  const link = async () => { setBusy(true); setErr(""); const p = await remotePair(); setBusy(false); if (p.pairing) setPairing(p.pairing); else setErr(p.error ?? "could not make a link"); };
  const copy = async (text: string, key: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { /* the text is on screen to select */ } };
  const url = st?.tunnel?.url; const shareable = pairing?.links.find((l) => l.label === "tunnel") ?? pairing?.links[0];
  const left = pairing ? secondsLeft(pairing.expires_ms, now) : 0;
  return (
    <div data-testid="publish-inline" style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: nav, fontSize: 12.5, color: C.fg }}>
      <div style={{ color: C.muted, lineHeight: 1.5 }}>Give this machine a public https address, so a phone on mobile data or another computer can reach it. It still needs a pairing code to get in.</div>
      {err && <div role="alert" data-testid="publish-error" style={{ color: C.bad }}>{err}</div>}
      {url ? (
        <>
          <div data-testid="publish-url" style={{ fontFamily: mono, fontSize: 11, color: C.ok, wordBreak: "break-all" }}>{url}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button data-testid="publish-link" disabled={busy} onClick={() => void link()} style={small}>{pairing ? "New pairing link" : "Make a pairing link"}</button>
            <button data-testid="publish-stop" disabled={busy} onClick={() => void tunnel(false)} style={small}>Stop publishing</button>
          </div>
          {pairing && shareable && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div data-testid="publish-pair-link" style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, wordBreak: "break-all" }}>{shareable.url}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}><button data-testid="publish-copy" onClick={() => void copy(shareable.url, "link")} style={small}>{copied === "link" ? "copied" : "Copy the link"}</button><span style={{ fontSize: 11, color: left > 0 ? C.muted : C.warn }}>{left > 0 ? `good for ${clock(left)}, once` : "expired"}</span></div>
            </div>
          )}
        </>
      ) : st?.cloudflared ? <button data-testid="publish-start" disabled={busy} onClick={() => void tunnel(true)} style={{ ...small, alignSelf: "flex-start", color: "#fff", background: C.brand, borderColor: C.brand, fontWeight: 600 }}>{busy ? "starting…" : "Publish this machine"}</button>
        : <div data-testid="publish-missing" style={{ color: C.muted }}>Publishing needs <b>cloudflared</b> on this machine. Install it and this button appears.</div>}
    </div>
  );
}

export function RemoteSection({ initial = null }: { initial?: RemotePart }) {
  const [part, setPart] = React.useState<RemotePart>(initial); const [open, setOpen] = React.useState(initial !== null);
  const pick = (p: Exclude<RemotePart, null>) => { setOpen(true); setPart((cur) => (cur === p && open ? null : p)); };
  return (
    <section aria-label="Remote" data-testid="remote-section">
      <button data-testid="remote-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "transparent", border: "none", cursor: "pointer", fontFamily: nav, fontSize: 11, letterSpacing: "0.05em", color: C.muted, padding: "0 6px 6px", textTransform: "uppercase", textAlign: "left" }}>
        <span>Remote</span><span style={{ flex: 1 }} /><span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      <div style={{ display: "flex", gap: 4, padding: "0 4px" }}>
        <button data-testid="remote-phone" aria-pressed={part === "phone"} title="scan a QR code with your phone to use antiloki from it" onClick={() => pick("phone")} style={btn(part === "phone")}>Phone</button>
        <button data-testid="remote-machines" aria-pressed={part === "machines"} title="other computers over SSH: connect in one click" onClick={() => pick("machines")} style={btn(part === "machines")}>Machines</button>
        <button data-testid="remote-publish" aria-pressed={part === "publish"} title="a public link to this machine, through a tunnel" onClick={() => pick("publish")} style={btn(part === "publish")}>Publish</button>
      </div>
      {open && part && (
        <div data-testid={`remote-body-${part}`} style={{ margin: "8px 4px 0", padding: 8, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          {part === "phone" && <PhonePanel inline onClose={() => setPart(null)} />}
          {part === "machines" && <MachinesPanel inline onClose={() => setPart(null)} />}
          {part === "publish" && <PublishBody />}
        </div>
      )}
    </section>
  );
}
