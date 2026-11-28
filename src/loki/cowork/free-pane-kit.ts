// FREE PANES, THE PAGE AND ITS RULES (RFC 0016): what the screen does with a pane's folder: it assembles ONE page (the files inlined), puts the content-security-policy first, and adds the kit. Pure; the component draws it and runs the bridge.
export type PaneFolder = { id: string; manifest: any; files: Record<string, string>; assets: Record<string, string>; hash: string; approved: boolean; problems: string[] };
export type PaneBrief = { id: string; title: string; version?: string; notes?: string; made_by?: string; icon?: string; apps?: { app: string; read?: string[]; write?: string[] }[]; hash: string; approved: boolean; problems: string[] };

/** The policy every pane page is given, written by the host before anything of the page: no network of its own (connect-src none), no frames, no forms; pictures and videos only from the host's own asset route or as data. */
export function policyFor(beUrl: string): string {
  const asset = `${beUrl}/api/v1/panes/asset`;
  return `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: ${asset}; media-src blob: ${asset}; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`;
}
/** The tokens a pane may use as CSS variables (the same names as the rest of the screen), read from the host's own computed style. */
export function themeTokens(read: (name: string) => string): Record<string, string> {
  const names = ["--c-bg", "--c-panel", "--c-panel2", "--c-border", "--c-fg", "--c-dim", "--c-muted", "--c-brand", "--c-ok", "--c-warn", "--c-bad"]; const out: Record<string, string> = {};
  for (const n of names) { const v = read(n).trim(); if (v) out[n] = v; } return out;
}
const KIT_CSS = "*{box-sizing:border-box}html,body{margin:0;background:var(--c-bg,#131316);color:var(--c-fg,#ededf0);font:14px/1.5 system-ui,sans-serif}a{color:var(--c-brand,#c97c5c)}button,input,select,textarea{font:inherit;color:inherit}.row{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--c-border,#26262b)}.pill{display:inline-block;border:1px solid var(--c-border,#26262b);border-radius:999px;padding:1px 9px;font-size:12px;color:var(--c-muted,#8b8b94)}.card{border:1px solid var(--c-border,#26262b);border-radius:12px;padding:12px}.muted{color:var(--c-muted,#8b8b94)}";
/** The kit's script: `antiloki.hello/read/write/state/asset/open/notice/describe/onAct` over the bridge, and `ui.text` (safe: text nodes, never innerHTML). Every one is a message to the host; none is a door of its own. */
export const KIT_JS = `(function(){var seq=0,wait={},actFn=null;function post(m){parent.postMessage(m,"*");}window.addEventListener("message",function(e){var d=e.data;if(!d||d.__antiloki!==1)return;if(d.type==="act"){Promise.resolve().then(function(){if(!actFn)throw new Error("this page does not take actions");return actFn(d.ref,d.value,d.action);}).then(function(r){post({__antiloki:1,id:d.id,type:"act_result",payload:{ok:true,detail:String(r==null?"done":r)}});},function(err){post({__antiloki:1,id:d.id,type:"act_result",payload:{ok:false,detail:String(err&&err.message||err)}});});return;}if(!wait[d.id])return;var w=wait[d.id];delete wait[d.id];d.ok?w.res(d.result):w.rej(new Error(d.error||"refused"));});function call(type,payload){return new Promise(function(res,rej){var id=++seq;wait[id]={res:res,rej:rej};post({__antiloki:1,id:id,type:type,payload:payload||{}});});}window.antiloki={hello:function(){return call("hello");},read:function(app,tool,args){return call("read",{app:app,tool:tool,args:args||{}});},write:function(app,tool,args,label){return call("write",{app:app,tool:tool,args:args||{},label:label||""});},state:{get:function(){return call("state.get");},set:function(v){return call("state.set",{state:v});}},asset:function(app,url){return call("asset",{app:app,url:url});},open:function(url){return call("open",{url:url});},notice:function(text){return call("notice",{text:text});},describe:function(tree){return call("describe",{tree:tree});},onAct:function(f){actFn=f;}};window.ui={text:function(t){var f=document.createDocumentFragment();String(t==null?"":t).split(/\\n{2,}/).forEach(function(p){var el=document.createElement("p");el.textContent=p;f.appendChild(el);});return f;}};})();`;

const esc = (t: string) => t.replace(/<\/(script|style)/gi, "<\\/$1");
/** One page from a pane's folder: the policy first in the head, the kit, the folder's stylesheets and scripts inlined where the page names them, the pictures and fonts as data addresses. A reference to anything else (a remote address) is left as written: the policy refuses it. Pure. */
export function buildSrcDoc(f: Pick<PaneFolder, "manifest" | "files" | "assets">, beUrl: string, tokens: Record<string, string> = {}): string {
  const entry: string = typeof f.manifest?.entry === "string" ? f.manifest.entry : "index.html"; let html = f.files[entry] ?? "";
  html = html.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["'][^>]*>/gi, (m, href: string) => (f.files[href] != null ? `<style>${esc(f.files[href])}</style>` : m));
  html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (m, src: string) => (f.files[src] != null ? `<script>${esc(f.files[src])}</script>` : m));
  html = html.replace(/\b(src|href)=["']([^"']+)["']/gi, (m, attr: string, v: string) => (f.assets[v] ? `${attr}="${f.assets[v]}"` : m));
  const vars = Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(";");
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policyFor(beUrl)}"><style>:root{${vars}}${KIT_CSS}</style><script>${KIT_JS}</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${head}`) : /<html[^>]*>/i.test(html) ? html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`) : `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
}
/** What the bridge may be asked (RFC 0016 §4.3): eight messages and `act_result`, the page's answer to an agent's act. Others are refused by name, not ignored. */
export const BRIDGE_TYPES = ["hello", "read", "write", "state.get", "state.set", "asset", "open", "notice", "describe", "act_result"] as const;
export type BridgeMessage = { __antiloki: 1; id: number; type: string; payload: Record<string, unknown> };
/** Is this a message of the bridge, of the right shape? Pure. */
export function asBridge(d: unknown): BridgeMessage | null {
  if (!d || typeof d !== "object") return null; const m = d as any;
  if (m.__antiloki !== 1 || !Number.isInteger(m.id) || m.id < 1 || typeof m.type !== "string" || m.type.length > 40) return null; if (m.payload != null && (typeof m.payload !== "object" || Array.isArray(m.payload))) return null;
  return { __antiloki: 1, id: m.id, type: m.type, payload: (m.payload ?? {}) as Record<string, unknown> };
}

/** What a write will do, in words, for the host's own confirmation card: the page's label (as the page's claim, shown as such) and every argument as `name: value` (long values cut), so the person sees what really goes. Pure. */
export function writeWords(args: Record<string, unknown>): { name: string; value: string }[] {
  return Object.entries(args ?? {}).slice(0, 30).map(([name, v]) => { const t = typeof v === "string" ? v : JSON.stringify(v); return { name, value: (t ?? "").length > 400 ? `${(t ?? "").slice(0, 400)}… (${(t ?? "").length} characters)` : t ?? "" }; });
}
/** An address the page may ask the host to open in the person's browser: http or https only, no credentials. Pure. */
export function openable(raw: unknown): URL | null { if (typeof raw !== "string" || raw.length > 2000) return null; try { const u = new URL(raw); return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password ? u : null; } catch { return null; } }
/** A notice in the pane's header: at most 200 characters, one every 3 seconds. Pure. */
export function noticeOk(text: unknown, lastMs: number, nowMs: number): string | null { if (typeof text !== "string" || !text.trim()) return null; if (nowMs - lastMs < 3000) return null; return text.trim().slice(0, 200); }
