// THE PHONE'S CALLS (operator 2026-11-10): status, the LAN door, one-time pairing codes, devices, the tunnel. The serve answers them to this machine only.
import { apiGet, apiPost } from "./client";

export type RemoteDevice = { id: string; name: string; created_ms: number; last_seen_ms: number; revoked: boolean };
export type RemoteStatus = { enabled: boolean; port: number; addresses: string[]; tunnel: { provider: string; url: string } | null; devices: RemoteDevice[]; app: boolean; cloudflared: boolean; /** a firewall that may keep a phone out: which, whether the port is open in it, and the command that opens it */ firewall: { kind: string; open: boolean; command: string } | null };
export type PairLink = { label: string; url: string };
export type Pairing = { code: string; expires_ms: number; links: PairLink[]; app: boolean };

const un = (r: any) => r?.result?.result ?? r?.result ?? r;
const status = (r: any): RemoteStatus | null => r && r.ok !== false && typeof r.enabled === "boolean" ? { enabled: r.enabled, port: Number(r.port) || 0, addresses: Array.isArray(r.addresses) ? r.addresses : [], tunnel: r.tunnel?.url ? { provider: String(r.tunnel.provider ?? ""), url: String(r.tunnel.url) } : null, devices: Array.isArray(r.devices) ? r.devices : [], app: r.app === true, cloudflared: r.cloudflared === true, firewall: r.firewall && typeof r.firewall.command === "string" ? { kind: String(r.firewall.kind ?? ""), open: r.firewall.open === true, command: String(r.firewall.command).slice(0, 300) } : null } : null;
type Res = { status: RemoteStatus | null; error?: string };
const call = async (path: string, body?: object): Promise<Res> => { try { const r = un(body ? await apiPost(path, body, { timeoutMs: 60_000 }) : await apiGet(path)); const s = status(r); return s ? { status: s } : { status: null, error: String(r?.error ?? "the machine did not answer") }; } catch (e: any) { return { status: null, error: String(e?.message ?? e) }; } };
export const remoteStatus = () => call("/api/v1/remote/status");
export const remoteEnable = () => call("/api/v1/remote/enable", {});
export const remoteDisable = () => call("/api/v1/remote/disable", {});
export const remoteTunnel = (on: boolean) => call(`/api/v1/remote/tunnel/${on ? "start" : "stop"}`, {});
export const remoteRevoke = (id: string) => call("/api/v1/remote/devices/revoke", { id });
export async function remotePair(): Promise<{ pairing: Pairing | null; error?: string }> {
  try { const r: any = un(await apiPost("/api/v1/remote/pair/start", {})); return r?.ok === true && typeof r.code === "string" ? { pairing: { code: r.code, expires_ms: Number(r.expires_ms) || 0, links: Array.isArray(r.links) ? r.links : [], app: r.app === true } } : { pairing: null, error: String(r?.error ?? "could not make a code") }; } catch (e: any) { return { pairing: null, error: String(e?.message ?? e) }; }
}

// ── other machines, over SSH ────────────────────────────────────────────────────────────────────────────────────────
export type Machine = { id: string; name: string; target: string; host: string; ssh_port: number; local_port: number; url: string; connected: boolean; up: boolean };
const machines = (r: any): Machine[] | null => (Array.isArray(r?.machines) ? r.machines.filter((m: any) => m && typeof m.id === "string") : null);
type MRes = { machines: Machine[] | null; error?: string; steps?: string[] };
const mcall = async (path: string, body?: object): Promise<MRes> => { try { const r = un(body ? await apiPost(path, body, { timeoutMs: 180_000 }) : await apiGet(path)); const ms = machines(r); return r?.ok === false ? { machines: ms, error: String(r.error ?? "that did not work"), steps: Array.isArray(r.steps) ? r.steps : undefined } : { machines: ms, steps: Array.isArray(r?.steps) ? r.steps : undefined }; } catch (e: any) { return { machines: null, error: String(e?.message ?? e) }; } };
export const listMachines = () => mcall("/api/v1/machines");
export const addMachine = (target: string, name: string) => mcall("/api/v1/machines/add", { target, name });
export const connectMachine = (id: string) => mcall("/api/v1/machines/connect", { id });
export const disconnectMachine = (id: string, stopRemote = false) => mcall("/api/v1/machines/disconnect", { id, stop_remote: stopRemote });
export const removeMachine = (id: string) => mcall("/api/v1/machines/remove", { id });
