// WHEN AN APP REFUSES (the operator 2026-11-20: "if the token fails because the expiration got, or some permission is missed, a message should be said specifically with the link to resolve, in all panes"):
// what the serve and the apps say is sorted into a few causes, each with what to do and where to do it. Pure.
export type Problem = { kind: "expired" | "permission" | "sso" | "rate" | "install"; title: string; fix: string; links: { label: string; href: string }[] };
type Where = { name: string; links: { label: string; href: string }[]; permission: string };
const WHERE: Record<string, Where> = {
  github: { name: "GitHub", links: [{ label: "Fine-grained tokens", href: "https://github.com/settings/personal-access-tokens" }, { label: "Classic tokens", href: "https://github.com/settings/tokens" }], permission: "A classic token needs the repo and read:org scopes; a fine-grained one needs Contents (read), Issues, Pull requests (read and write) and Checks (read), on the repositories you want, and the organisation as its resource owner for an organisation's repositories." },
  linear: { name: "Linear", links: [{ label: "Linear API keys", href: "https://linear.app/settings/account/security" }], permission: "Create a key that is not read-only, or one for the team you are opening." },
  notion: { name: "Notion", links: [{ label: "Notion connections", href: "https://www.notion.so/profile/integrations" }], permission: "Open the page in Notion, choose ••• → Connections and add the integration; Notion only shows what a connection was given." },
  atlassian: { name: "Jira & Confluence", links: [{ label: "Atlassian API tokens", href: "https://id.atlassian.com/manage-profile/security/api-tokens" }], permission: "Ask the site admin for access to the project or space." },
  sentry: { name: "Sentry", links: [{ label: "Sentry auth tokens", href: "https://sentry.io/settings/account/api/auth-tokens/" }], permission: "Create a token with the project, event and organisation read scopes." },
  stripe: { name: "Stripe", links: [{ label: "Stripe API keys", href: "https://dashboard.stripe.com/apikeys" }], permission: "Use a restricted key with read access to what the pane shows." },
  asana: { name: "Asana", links: [{ label: "Asana developer console", href: "https://app.asana.com/0/my-apps" }], permission: "Give the token access to the workspace you are opening." },
  intercom: { name: "Intercom", links: [{ label: "Intercom developer hub", href: "https://app.intercom.com/a/apps/_/developer-hub" }], permission: "Turn on the permissions for conversations and contacts." },
  webflow: { name: "Webflow", links: [{ label: "Webflow integrations", href: "https://webflow.com/dashboard/account/integrations" }], permission: "Give the token the Sites and CMS read scopes." },
  paypal: { name: "PayPal", links: [{ label: "PayPal developer apps", href: "https://developer.paypal.com/dashboard/applications" }], permission: "Enable the features the pane reads on the app." },
  square: { name: "Square", links: [{ label: "Square developer apps", href: "https://developer.squareup.com/apps" }], permission: "Give the access token the read permissions the pane needs." },
};
const nameOf = (app: string) => WHERE[app]?.name ?? app;
/** Sort a refusal. `text` is what the serve (or the app, through the serve) said; null when it is not one of these (an ordinary error then shows as it is). */
export function classify(app: string, text: string): Problem | null {
  const t = (text || "").toLowerCase(); if (!t) return null; const w = WHERE[app]; const links = w?.links ?? [];
  if (/conditional access|blocked by .*polic|saml|single sign-on|\bsso\b/.test(t)) return { kind: "sso", title: `${nameOf(app)}'s organisation blocks this token`, fix: "The organisation has a policy this token does not meet. A fine-grained token must be created with the organisation as its resource owner, and an owner may have to approve it; for a classic token, open its page, press Configure SSO and authorize the organisation. Then try again.", links };
  if (/not installed/.test(t)) return { kind: "install", title: `${nameOf(app)} is not installed`, fix: "Open the Web apps store and install it.", links: [] };
  if (/rate limit|429|too many requests|secondary rate/.test(t)) return { kind: "rate", title: `${nameOf(app)} says to slow down`, fix: "Wait a minute and try again; the pane asks for a lot when it opens something new.", links: [] };
  if (/\b401\b|needs sign-in|bad credentials|unauthorized|expired|invalid token|token is invalid|not authenticated|requires authentication/.test(t)) return { kind: "expired", title: `${nameOf(app)} did not accept the token`, fix: `It is missing, wrong, revoked or has expired. Make a new one at ${nameOf(app)}, then paste it here (Connect).`, links };
  if (/\b403\b|forbidden|not accessible|insufficient|permission|scope|must have|not authorized|access denied|not allowed|resource not accessible/.test(t)) return { kind: "permission", title: `${nameOf(app)} refused: the token is missing a permission`, fix: w?.permission ?? "Give the token the permission for this action, then try again.", links };
  return null;
}
