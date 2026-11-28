// THE FOLDER CHOOSER (operator 2026-11-23: "it wasnt at home, it was inside a random folder, it showed all hidden folders, and didnt have the create folder button. Make it more user friendly").
//
// Our own window, the same on every Linux distro (the system's dialogs differ from one desktop to the next, start in whatever folder the server was launched from, and some have no
// "new folder"). It starts at the HOME folder, offers the places a person looks first (Home, Desktop, Documents, Downloads, the usual project folders), shows the path as clickable
// pieces, hides hidden folders unless asked, marks git repositories, and has a New folder button, so a person can make the project folder right here.
//
// The serve runs on this machine, so it can say what is on it: `GET /api/v1/workspaces/browse` lists the folders of one folder (directories only), `POST /api/v1/workspaces/mkdir` makes one.
// The window is a glass card in the middle of the screen over a dimmed backdrop, like the start screen. It chooses the folder you are STANDING in, as every directory dialog does.
import React from "react";
import { C, mono } from "@/loki/theme";
import { apiGet, apiPost } from "@/loki/api/client";

const nav = "-apple-system, system-ui, sans-serif";

export type Entry = { name: string; path: string; repo?: boolean };
export type Place = { name: string; path: string };
export type Listing = { ok: boolean; path: string; parent: string | null; dirs: Entry[]; error?: string | null; places?: Place[] };

export async function listFolder(path?: string, hidden = false): Promise<Listing> {
  const q = [path ? `path=${encodeURIComponent(path)}` : "", hidden ? "hidden=1" : ""].filter(Boolean).join("&");
  try {
    const r: any = await apiGet(`/api/v1/workspaces/browse${q ? `?${q}` : ""}`, { timeoutMs: 20_000 } as any);
    const d = r?.result ?? r;
    return { ok: !!d?.ok, path: String(d?.path ?? ""), parent: d?.parent ?? null, dirs: Array.isArray(d?.dirs) ? d.dirs : [], error: d?.error ?? null, places: Array.isArray(d?.places) ? d.places : [] };
  } catch (e: any) {
    return { ok: false, path: path ?? "", parent: null, dirs: [], error: String(e?.message ?? e) };
  }
}

/** Make a folder inside another. Never throws: the serve's own reason comes back as `error`. */
export async function makeFolder(parent: string, name: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  const r: any = await apiPost(`/api/v1/workspaces/mkdir`, { parent, name }, { timeoutMs: 15_000 } as any);
  const d = r?.result ?? r;
  return d && typeof d === "object" ? { ok: !!d.ok, path: d.path, error: d.error } : { ok: false, error: "the serve did not answer" };
}

/** A path as clickable pieces, from the root: `/home/u/dev` -> Home-less segments with the path each leads to. Pure; handles `/` and `\` paths. */
export function crumbsOf(path: string): { label: string; path: string }[] {
  if (!path) return [];
  const win = /^[A-Za-z]:[\\/]/.test(path) || path.includes("\\"); const sep = win ? "\\" : "/";
  const parts = path.split(/[\\/]/).filter(Boolean);
  const out: { label: string; path: string }[] = [];
  let acc = win ? "" : "";
  if (!win) out.push({ label: "/", path: "/" });
  parts.forEach((p, i) => { acc = win ? (i === 0 ? `${p}${sep}` : `${acc}${acc.endsWith(sep) ? "" : sep}${p}`) : `${acc}/${p}`; out.push({ label: p, path: acc }); });
  return out;
}

const glass: React.CSSProperties = { background: "rgba(22,20,19,.58)", backdropFilter: "blur(28px) saturate(1.5)", WebkitBackdropFilter: "blur(28px) saturate(1.5)", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 24px 60px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.1)" };
const chip: React.CSSProperties = { fontFamily: nav, fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "transparent", color: C.fg, cursor: "pointer" };

export function FolderBrowser({ start, onPick, onClose }: { start?: string; onPick: (path: string) => void; onClose: () => void }) {
  const [at, setAt] = React.useState<string | undefined>(start);
  const [hidden, setHidden] = React.useState(false);
  const [l, setL] = React.useState<Listing | null>(null);
  const [places, setPlaces] = React.useState<Place[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let live = true; setL(null);
    void listFolder(at, hidden).then((r) => { if (!live) return; setL(r); if (r.places?.length) setPlaces(r.places); });
    return () => { live = false; };
  }, [at, hidden]);

  const create = async () => {
    if (!l?.path || !name.trim()) return;
    setBusy(true); setErr(null);
    const r = await makeFolder(l.path, name.trim());
    setBusy(false);
    if (!r.ok || !r.path) { setErr(r.error || "could not create it"); return; }
    setCreating(false); setName(""); setAt(r.path);   // walk into the new folder: it is the one to choose next
  };

  const row = (label: string, onClick: () => void, extra?: React.ReactNode, key?: string) => (
    <button key={key ?? label} onClick={onClick} data-testid={`folder-row-${label}`}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontFamily: nav, fontSize: 13, color: C.fg, padding: "8px 10px", borderRadius: 8 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(236,233,230,.08)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <span style={{ color: C.brand, flexShrink: 0, fontSize: 12 }}>{label === ".." ? "↑" : "▣"}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label === ".." ? "up one level" : label}</span>
      {extra}
    </button>
  );
  const crumbs = crumbsOf(l?.path ?? "");
  const shown = crumbs.length > 4 ? [{ label: "…", path: crumbs[crumbs.length - 5].path }, ...crumbs.slice(-4)] : crumbs;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, display: "grid", placeItems: "center", background: "rgba(10,9,8,.5)" }}>
      <div data-testid="folder-browser" role="dialog" aria-label="choose a folder" onClick={(e) => e.stopPropagation()} style={{ ...glass, width: 520, maxWidth: "94vw", borderRadius: 16, overflow: "hidden", color: C.fg, fontFamily: nav }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 8px" }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Choose a folder</div>
          <button onClick={onClose} data-testid="folder-browser-close" aria-label="close" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontFamily: nav, fontSize: 16, padding: 4 }}>✕</button>
        </div>
        {places.length > 0 && (
          <div data-testid="folder-places" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 16px 10px" }}>
            {places.map((p) => <button key={p.path} onClick={() => { setAt(p.path); setCreating(false); setErr(null); }} data-testid={`folder-place-${p.name}`} style={{ ...chip, borderColor: l?.path === p.path ? C.brand : "rgba(255,255,255,.14)", color: l?.path === p.path ? C.brand : C.fg }}>{p.name}</button>)}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 16px", borderTop: "1px solid rgba(236,233,230,.1)", borderBottom: "1px solid rgba(236,233,230,.1)", minHeight: 34 }}>
          <div data-testid="folder-browser-at" title={l?.path ?? ""} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, fontFamily: mono, fontSize: 11.5, color: C.muted }}>
            {!l && "…"}
            {shown.map((c, i) => (
              <React.Fragment key={c.path + i}>
                {i > 0 && shown[i - 1].label !== "/" && <span style={{ color: C.dim }}>/</span>}
                <button onClick={() => setAt(c.path)} style={{ background: "transparent", border: "none", cursor: "pointer", color: i === shown.length - 1 ? C.fg : C.muted, fontFamily: mono, fontSize: 11.5, padding: "1px 3px", borderRadius: 4 }}>{c.label}</button>
              </React.Fragment>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: nav, fontSize: 11.5, color: C.muted, cursor: "pointer", flexShrink: 0 }}>
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} data-testid="folder-show-hidden" />hidden
          </label>
          <button onClick={() => { setCreating(true); setErr(null); }} disabled={!l?.ok} data-testid="folder-new" style={{ ...chip, flexShrink: 0, color: C.brand, borderColor: C.brand, opacity: l?.ok ? 1 : 0.5 }}>+ New folder</button>
        </div>
        <div style={{ height: 300, overflowY: "auto", padding: 8 }}>
          {creating && (
            <div data-testid="folder-new-row" style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px 10px" }}>
              <span style={{ color: C.brand, fontSize: 12 }}>▣</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="name of the new folder" data-testid="folder-new-name"
                onKeyDown={(e) => { if (e.key === "Enter") void create(); if (e.key === "Escape") { e.stopPropagation(); setCreating(false); setName(""); setErr(null); } }}
                style={{ flex: 1, minWidth: 0, background: "rgba(236,233,230,.06)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 8, color: C.fg, fontFamily: nav, fontSize: 13, padding: "6px 10px", outline: "none" }} />
              <button onClick={() => void create()} disabled={busy || !name.trim()} data-testid="folder-new-make" style={{ ...chip, color: C.brand, borderColor: C.brand, opacity: busy || !name.trim() ? 0.5 : 1 }}>create</button>
            </div>
          )}
          {err && <div data-testid="folder-new-error" style={{ fontFamily: mono, fontSize: 11, color: C.bad, padding: "0 10px 8px", wordBreak: "break-word" }}>{err}</div>}
          {!l && <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, padding: "8px 10px" }}>reading…</div>}
          {l?.error && <div style={{ fontFamily: mono, fontSize: 11, color: C.warn, padding: "8px 10px", wordBreak: "break-word" }}>{l.error}</div>}
          {l?.parent && row("..", () => setAt(l.parent!), undefined, "__up")}
          {l?.dirs.map((d) => row(d.name, () => setAt(d.path),
            d.repo ? <span title="a git repository" style={{ fontFamily: mono, fontSize: 10, color: C.brand, flexShrink: 0, border: `1px solid ${C.brand}`, borderRadius: 5, padding: "0 5px" }}>git</span> : undefined, d.path))}
          {l && !l.error && !l.dirs.length && !creating && <div style={{ fontFamily: nav, fontSize: 12.5, color: C.dim, padding: "8px 10px" }}>No folders in here. Use this folder, or make a new one.</div>}
        </div>
        {/* choosing is a separate act from walking: you pick the folder you are STANDING in, which is how every
            native directory dialog behaves and the only way to choose a folder with nothing under it. */}
        <div style={{ borderTop: "1px solid rgba(236,233,230,.1)", padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, fontFamily: mono, fontSize: 11, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" }} title={l?.path ?? ""}>{l?.path ?? ""}</div>
          <button onClick={onClose} style={{ fontFamily: nav, fontSize: 12.5, padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,.16)", background: "transparent", color: C.muted, cursor: "pointer" }}>cancel</button>
          <button data-testid="folder-browser-pick" disabled={!l?.ok || !l?.path}
            onClick={() => { if (l?.path) { onPick(l.path); onClose(); } }}
            style={{ fontFamily: nav, fontSize: 12.5, padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.brand}`, background: "transparent", color: C.brand, cursor: l?.ok ? "pointer" : "default", opacity: l?.ok ? 1 : .5 }}>use this folder</button>
        </div>
      </div>
    </div>
  );
}
