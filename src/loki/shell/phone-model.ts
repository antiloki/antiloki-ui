// THE PHONE PANEL'S RULES (operator 2026-11-10). Pure.
import qrcode from "qrcode-generator";
import type { PairLink, RemoteDevice } from "@/loki/api/remote";

/** The QR of a text as an SVG string (black on white, with the quiet margin a phone needs). The type number is chosen to fit. */
export function qrSvg(text: string, cell = 5): string {
  const qr = qrcode(0, "M"); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: cell, margin: 4, scalable: true });
}
/** Seconds left on a code. */
export function secondsLeft(expiresMs: number, nowMs: number): number { return Math.max(0, Math.ceil((expiresMs - nowMs) / 1000)); }
export function clock(sec: number): string { return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; }
/** The links offered for the QR: the tunnel's first (it works from anywhere), then each address of the machine's networks. */
export function linkChoices(links: PairLink[]): PairLink[] { return [...links].sort((a, b) => (a.label === "tunnel" ? 0 : 1) - (b.label === "tunnel" ? 0 : 1)); }
/** A device as one line: its name and when it was last seen. */
export function deviceLine(d: Pick<RemoteDevice, "name" | "last_seen_ms" | "revoked">, now: number): string {
  if (d.revoked) return `${d.name} · revoked`;
  const s = Math.max(0, Math.round((now - d.last_seen_ms) / 1000)); const ago = s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
  return `${d.name} · seen ${ago}`;
}
