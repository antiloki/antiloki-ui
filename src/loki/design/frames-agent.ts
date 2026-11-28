// MOCKUPS MADE BY AGENTS, IN FRAMES (operator 2026-11-11: "frames also should be the place where, when we ask for a mockup, it is created by some agent"). The serve keeps them per workspace (`/api/v1/frames`): an
// agent hands one in through the MCP (`antiloki_frame_create`), or the person asks a design agent here (`ask`). This is the client and the pure parts; the pane draws them next to the screens from code.
import { apiGet, apiPost, unwrapResult as unwrap } from "@/loki/api/client";

export type Mockup = { id: string; name: string; ask: string; status: "working" | "done" | "failed"; author: string; created: number; error?: string };
const str = (v: unknown, n = 300) => (typeof v === "string" ? v.slice(0, n) : "");
export function parseMockups(raw: unknown): Mockup[] {
  const list = Array.isArray((raw as any)?.frames) ? (raw as any).frames : [];
  return list.filter((f: any) => f && typeof f.id === "string" && typeof f.name === "string").map((f: any) => ({
    id: String(f.id).slice(0, 40), name: str(f.name, 80), ask: str(f.ask, 600), status: f.status === "working" || f.status === "failed" ? f.status : "done",
    author: [str(f.author?.engine, 30), str(f.author?.model, 40)].filter(Boolean).join(" · ") || "an agent", created: typeof f.created_ms === "number" ? f.created_ms : 0, ...(typeof f.error === "string" && f.error ? { error: f.error.slice(0, 300) } : {}),
  }));
}
/** A mockup's whole document as what a frame holds: the `<style>` blocks, then the body (a frame is the body's markup, with the stylesheet laid under it). Pure over a parser - tested in jsdom. */
export function bodyOfDocument(doc: string): string {
  try {
    const d = new DOMParser().parseFromString(doc, "text/html");
    const styles = Array.from(d.querySelectorAll("style")).map((s) => s.outerHTML).join("\n");
    d.querySelectorAll("style").forEach((s) => s.remove());
    return `${styles}\n${d.body.innerHTML}`;
  } catch { return doc; }
}
export const mockupLine = (m: Mockup): string => (m.status === "working" ? "being made…" : m.status === "failed" ? "could not be made" : `by ${m.author}`);

export async function listMockups(): Promise<Mockup[] | null> { try { const r: any = unwrap(await apiGet("/api/v1/frames")); return r?.ok === true ? parseMockups(r) : null; } catch { return null; } }
export async function mockupHtml(id: string): Promise<string | null> { try { const r: any = unwrap(await apiGet(`/api/v1/frames/html?id=${encodeURIComponent(id)}`)); return r?.ok === true && typeof r.html === "string" ? r.html : null; } catch { return null; } }
export async function askForMockup(prompt: string, name = ""): Promise<{ ok: boolean; error?: string }> {
  try { const r: any = unwrap(await apiPost("/api/v1/frames", { op: "ask", prompt, name }, { timeoutMs: 20_000 })); return r?.ok === true ? { ok: true } : { ok: false, error: typeof r?.error === "string" ? r.error : "the serve did not accept that" }; } catch { return { ok: false, error: "the serve could not be reached" }; }
}
export async function removeMockup(id: string): Promise<boolean> { try { const r: any = unwrap(await apiPost("/api/v1/frames", { op: "delete", id }, { timeoutMs: 15_000 })); return r?.ok === true; } catch { return false; } }

// THE MOCKUP THE SCREEN WAS ASKED TO SHOW (an agent handed one in: the serve tells the screen to open Frames with it). It is remembered until a Frames pane has SELECTED it (not merely mounted: a pane may mount more than once while the layout settles,
// and the first mount used to take it, so the second opened on the first screen from the code: operator 2026-11-11, "it opens on screens, I had to click"), or for two minutes; and announced to a pane that is already open.
let pending: { id: string; at: number } | null = null;
const PENDING_MS = 120_000;
export const FRAMES_SHOW_EVENT = "antiloki:frames-show";
export function showMockup(id: string) { pending = { id, at: Date.now() }; try { window.dispatchEvent(new CustomEvent(FRAMES_SHOW_EVENT, { detail: { id } })); } catch { /* no window */ } }
export const peekPendingMockup = (): string | null => (pending && Date.now() - pending.at < PENDING_MS ? pending.id : null);
/** A pane has selected `id`: it is no longer pending (a later pane opens as usual). */
export function takePendingMockup(id?: string): string | null { const p = peekPendingMockup(); if (p && (!id || id === p)) { pending = null; return p; } return p; }
