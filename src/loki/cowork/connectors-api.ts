// THE CONNECTORS PANE'S CALLS (RFC 0022). A connector is proposed by an agent and finished by the person here. Every reply is read defensively;
// a secret is only ever SENT (to /connectors/save), never received: the serve says which inputs are filled, not what they hold.
import { apiGet, apiPost, BE_URL } from "@/loki/api/client";

export type ConnectorInput = { id: string; label: string; secret: boolean; help: string; link: string; optional: boolean; filled: boolean };
export type Connector = {
  slug: string; title: string; status: "draft" | "connected" | "error"; note: string; kind: "api" | "mcp"; auth: "key" | "oauth" | "none"; access: "read-only" | "read-write";
  site: string; summary: string; steps: string[]; inputs: ConnectorInput[]; missing: string[]; yaml: string; redirectUri: string; /** Connect works now with nothing pasted (a built-in or self-registered client) */ oauthReady: boolean; hasLogo: boolean; updatedAt: number;
};
export type Outcome = { ok: boolean; message: string; connector: Connector | null };

const un = (r: any) => (r && typeof r === "object" && r.result && typeof r.result === "object" && !Array.isArray(r.result) && !("ok" in r) ? r.result : r);
const str = (v: any) => (typeof v === "string" ? v : "");

export function parseConnector(r: any): Connector | null {
  if (!r || typeof r !== "object" || !str(r.slug)) return null;
  const rc = r.recipe && typeof r.recipe === "object" ? r.recipe : {};
  const status = r.status === "connected" || r.status === "error" ? r.status : "draft";
  return {
    slug: r.slug, title: str(r.title) || r.slug, status, note: str(r.note), kind: r.kind === "mcp" ? "mcp" : "api", auth: r.auth === "oauth" || r.auth === "none" ? r.auth : "key",
    access: r.access === "read-write" ? "read-write" : "read-only", site: str(r.site), summary: str(r.summary),
    steps: Array.isArray(rc.steps) ? rc.steps.filter((x: any) => typeof x === "string") : [],
    inputs: Array.isArray(rc.inputs) ? rc.inputs.filter((i: any) => i && str(i.id)).map((i: any) => ({ id: i.id, label: str(i.label) || i.id, secret: i.secret !== false, help: str(i.help), link: str(i.link), optional: i.optional === true, filled: i.filled === true })) : [],
    missing: Array.isArray(r.missing) ? r.missing.filter((x: any) => typeof x === "string") : [], yaml: str(r.yaml), redirectUri: str(r.redirect_uri), oauthReady: r.oauth_ready === true, hasLogo: r.has_logo === true, updatedAt: typeof r.updated_at === "number" ? r.updated_at : 0,
  };
}

export async function connectorsList(): Promise<Connector[] | null> {
  const r: any = un(await apiGet("/api/v1/connectors/list")); if (!r || r.ok !== true || !Array.isArray(r.connectors)) return null;
  return r.connectors.map(parseConnector).filter((c: Connector | null): c is Connector => !!c);
}
async function outcome(p: Promise<any>): Promise<Outcome> {
  const r: any = un(await p);
  if (!r || typeof r !== "object") return { ok: false, message: "the serve did not answer", connector: null };
  return { ok: r.ok === true, message: str(r.message) || str(r.error), connector: parseConnector(r.connector) };
}
/** the person's values (the secrets among them) go to the serve once; it writes them to the project's private `.antiloki/.env` and tests the connection */
export const connectorSave = (slug: string, inputs: Record<string, string>) => outcome(apiPost("/api/v1/connectors/save", { slug, inputs }, { timeoutMs: 60_000 }));
export const connectorSetAccess = (slug: string, access: "read-only" | "read-write") => outcome(apiPost("/api/v1/connectors/access", { slug, access }));
export const connectorTest = (slug: string) => outcome(apiPost("/api/v1/connectors/test", { slug }, { timeoutMs: 60_000 }));
export async function connectorRemove(slug: string): Promise<boolean> { const r: any = un(await apiPost("/api/v1/connectors/remove", { slug })); return !!r && r.ok === true; }
/** OAuth: the service's own sign-in page, to open in the browser; the code comes back to the serve */
export async function connectorOauthUrl(slug: string): Promise<{ url: string } | { error: string }> {
  const r: any = un(await apiGet(`/api/v1/connectors/oauth/start?slug=${encodeURIComponent(slug)}`));
  return r && r.ok === true && str(r.url) ? { url: r.url } : { error: str(r?.error) || "could not start the sign-in" };
}
export const connectorLogoUrl = (slug: string, v: number) => `${BE_URL}/api/v1/connectors/logo?slug=${encodeURIComponent(slug)}&v=${v}`;

export const statusWord = (c: Pick<Connector, "status" | "missing" | "auth">): string =>
  c.status === "connected" ? "connected" : c.status === "error" ? "needs another look" : c.missing.length ? "to set up" : c.auth === "oauth" ? "ready to sign in" : "ready to test";
export const monogram = (title: string) => (title.trim().match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();

// WHICH CONNECTOR THE PANE SHOWS FIRST: an agent proposed one and the screen opened the pane for it (command `connector_open`). A pane that is already
// open hears the event; one that opens a moment later reads the request when it mounts.
export const CONNECTOR_OPEN = "antiloki:connector-open";
let pendingOpen: string | null = null;
export function requestOpenConnector(slug: string) { pendingOpen = slug; try { window.dispatchEvent(new CustomEvent(CONNECTOR_OPEN, { detail: slug })); } catch { /* no window */ } }
export function takeOpenConnector(): string | null { const s = pendingOpen; pendingOpen = null; return s; }

/** The "+" of the Connectors pane: the screen opens an agent and asks this. */
export const NEW_CONNECTOR = "antiloki:new-connector";
export const NEW_CONNECTOR_ASK = "I want to create a new connector with antiloki (the antiloki_connector tool). I have not said which service: ask me which one before doing anything.";
