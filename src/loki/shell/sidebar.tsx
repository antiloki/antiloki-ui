import React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useShell } from "./slug-context";
import { C } from "@/loki/theme";
import { openNewWorkspace } from "./new-workspace-dialog";
import { useWorkspaces } from "@/loki/api/hooks";
import { activateWorkspace, removeWorkspace } from "@/loki/api/dispatch";
import { SWITCHING, CHANGED, FAILED } from "./workspace-veil";


const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "5px 7px", borderRadius: 5,
  border: `1px solid ${C.border}`, background: C.bg, color: C.fg,
  fontFamily: mono, fontSize: 10, outline: "none", boxSizing: "border-box",
};
const btnStyle: React.CSSProperties = {
  flex: 1, padding: "5px 7px", borderRadius: 5, border: `1px solid ${C.border}`,
  background: C.panel, cursor: "pointer", fontFamily: mono, fontSize: 10,
};

// FEAT-WORKSPACE-CRUD-API + FEAT-WORKSPACE-HOT-SWAP: switch which external
// project antiloki's driver operates on. Activation flips the active row in the
// substrate registry and the BE re-mounts that workspace's DB set live (no
// restart) — the switcher confirms the switch took effect immediately.
export function WorkspaceSwitcher() {
  const { data, refetch } = useWorkspaces();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [switchedTo, setSwitchedTo] = React.useState<string | null>(null);

  const workspaces = data?.workspaces ?? [];
  const active = data?.active ?? null;
  const activeLabel = active?.name ?? "—";
  const selfHosting = active != null && active.db_dir == null;

  async function pick(name: string) {
    if (name === active?.name) { setOpen(false); return; }
    if (workspaces.find((w) => w.name === name)?.missing) return; // its folder is gone: not openable (the serve would refuse it too)
    setBusy(name);
    // THE WHOLE SCREEN IS SWITCHING, NOT JUST THIS MENU (operator 2026-09-25). The veil goes up on the REQUEST, not on
    // the answer: activation re-mounts the serve's DB set and can take seconds, and during those seconds every screen
    // behind this menu is showing the other project's data. `changed` lowers it once the refetches land; `failed`
    // lowers it at once, because the operator is still on the old workspace and needs the screen back.
    window.dispatchEvent(new CustomEvent(SWITCHING, { detail: { name } }));
    setOpen(false);
    const r = await activateWorkspace(name);
    setBusy(null);
    if (r.ok) {
      setSwitchedTo(name);
      refetch();
      window.dispatchEvent(new CustomEvent(CHANGED, { detail: { name } })); // every poller drops its data (api/hooks.ts)
    } else {
      window.dispatchEvent(new CustomEvent(FAILED, { detail: { name, error: r.error } }));
      window.alert(r.error || `could not switch to ${name}`);
    }
  }

  async function removeWs(name: string) {
    if (!window.confirm(`Remove workspace "${name}" from the list?\n\nThis un-wires it — the DB files stay on disk. Cancel to keep it.`)) return;
    setBusy(`rm:${name}`);
    const r = await removeWorkspace(name);
    setBusy(null);
    if (r.ok) refetch();
    else window.alert(r.error || "remove failed");
  }

  async function archiveAll() {
    const targets = workspaces.filter((w) => w.db_dir != null); // everything but self
    if (!targets.length) return;
    if (!window.confirm(`Archive all ${targets.length} workspace(s)?\n\nUn-wires them so antiloki opens to a clean slate (the login + add-workspace screen). DB files stay on disk — delete them manually if you want. Cancel to keep them.`)) return;
    setBusy("archive-all");
    for (const w of targets) { try { await removeWorkspace(w.name); } catch { /* keep going */ } }
    setBusy(null);
    refetch();
  }

  return (
    <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10 }}>
      <div style={{ color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>workspace</div>

      {open && (
        <div style={{ marginBottom: 6, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
          {workspaces.map((w) => {
            const isActive = w.is_active === 1;
            const isSelf = w.db_dir == null;
            // THE FOLDER IS GONE (operator 2026-10-01: "ministore-2" moved to the Trash and was still offered): dimmed, not openable, and the way out is the remove beside it
            const gone = w.missing === true;
            return (
              <div
                key={w.id}
                data-testid={gone ? `workspace-missing-${w.name}` : undefined}
                style={{ display: "flex", alignItems: "center", background: isActive ? C.active : "transparent", opacity: gone ? 0.5 : 1 }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = C.hover; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <button
                  onClick={() => pick(w.name)}
                  disabled={busy != null || gone}
                  title={gone ? `folder missing: ${w.root_path}` : w.root_path}
                  style={{
                    flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 8px", border: "none", cursor: busy ? "default" : "pointer",
                    background: "transparent", color: isActive ? C.fg : C.dim,
                    textAlign: "left", fontFamily: mono, fontSize: 10,
                  }}
                >
                  <span style={{ color: isActive ? C.ok : C.muted, width: 10 }}>{isActive ? "●" : (busy === w.name ? "…" : "")}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                  {isSelf && <span style={{ color: C.muted }}>self</span>}
                  {gone && <span style={{ color: C.bad }}>folder missing</span>}
                </button>
                {!isSelf && (
                  <button
                    onClick={() => removeWs(w.name)}
                    disabled={busy != null}
                    title={`remove "${w.name}" from the list (un-wire; keeps DB files)`}
                    style={{
                      border: "none", background: "transparent", cursor: busy ? "default" : "pointer",
                      color: C.muted, padding: "6px 8px", fontFamily: mono, fontSize: 11, lineHeight: 1,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.bad; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.muted; }}
                  >
                    {busy === `rm:${w.name}` ? "…" : gone ? "remove ✕" : "✕"}
                  </button>
                )}
              </div>
            );
          })}

          <button
            data-testid="new-workspace-open"
            onClick={() => { openNewWorkspace(); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, width: "100%",
              padding: "6px 8px", border: "none", borderTop: `1px solid ${C.border}`,
              cursor: "pointer", background: "transparent", color: C.brand,
              textAlign: "left", fontFamily: mono, fontSize: 10,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.hover; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <span style={{ width: 10 }}>+</span>
            <span style={{ flex: 1 }}>new workspace…</span>
          </button>

          {workspaces.some((w) => w.db_dir != null) && (
            <button
              onClick={archiveAll}
              disabled={busy != null}
              title="un-wire every workspace (keeps DB files) → clean slate"
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%",
                padding: "6px 8px", border: "none", borderTop: `1px solid ${C.border}`,
                cursor: busy ? "default" : "pointer", background: "transparent", color: C.muted,
                textAlign: "left", fontFamily: mono, fontSize: 10,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.bad; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.muted; }}
            >
              <span style={{ width: 10 }}>⌫</span>
              <span style={{ flex: 1 }}>{busy === "archive-all" ? "archiving…" : "archive all (clean slate)"}</span>
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.panel, color: C.fg, cursor: "pointer", fontFamily: mono, fontSize: 11,
        }}
      >
        <span style={{ color: C.brand }}>{selfHosting ? "⌂" : "▣"}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{activeLabel}</span>
        <span style={{ color: C.muted }}>{open ? "▴" : "▾"}</span>
      </button>

      {switchedTo && (
        <div style={{ marginTop: 6, color: C.muted, lineHeight: 1.5 }}>
          switched to <b>{switchedTo}</b> — mounted live, no restart needed.
        </div>
      )}
    </div>
  );
}

type Role = "operator" | "builder" | "observer";

type NavItem = { to: string; label: string; glyph: string; deprecated?: boolean; v2?: boolean; roles: Role[] };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "driver",
    items: [
      { to: "/", label: "chat", glyph: "◆", roles: ["operator", "builder", "observer"] },
      { to: "/operations", label: "Operations", glyph: "▰", roles: ["operator", "builder"] },
      { to: "/operations/atlas", label: "Atlas", glyph: "⛁", roles: ["operator", "builder", "observer"] },
      { to: "/operations/pulls", label: "Pull Requests", glyph: "⇄", roles: ["operator", "builder", "observer"] },
      { to: "/features", label: "Features", glyph: "◇", roles: ["operator", "builder", "observer"] },
      { to: "/drift", label: "Drift", glyph: "⌥", v2: true, roles: ["operator", "builder"] },
      { to: "/firehose", label: "Firehose", glyph: "≋", v2: true, roles: ["operator", "builder", "observer"] },
    ],
  },
  {
    label: "govern",
    items: [
      { to: "/docs", label: "Docs", glyph: "▤", roles: ["operator", "builder", "observer"] },
      { to: "/knowledge", label: "Knowledge", glyph: "✦", v2: true, roles: ["operator", "builder", "observer"] },
      { to: "/reviews", label: "Reviews", glyph: "❑", v2: true, roles: ["operator", "builder", "observer"] },
      { to: "/personas", label: "Personas", glyph: "◉", roles: ["operator", "builder"] },
    ],
  },
  {
    label: "advanced",
    items: [
      { to: "/prompts", label: "Prompts", glyph: "✎", v2: true, roles: ["builder"] },
      { to: "/enrich", label: "Enrich", glyph: "✦", v2: true, roles: ["operator", "builder"] },
      { to: "/code", label: "Code", glyph: "⌗", v2: true, roles: ["operator", "builder", "observer"] },
    ],
  },
];

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { pathname } = useLocation();
  const { role } = useShell();
  const width = collapsed ? 56 : 224;

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        background: C.bg,
        borderRight: `1px solid ${C.border}`,
        color: C.fg,
        display: "flex",
        flexDirection: "column",
        transition: "width .18s ease",
        fontFamily: '-apple-system, system-ui, sans-serif',
        fontSize: 13,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 12px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.border}` }}>
        <button
          onClick={onToggle}
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, oklch(0.78 0.16 295), oklch(0.84 0.13 200))",
            color: "#0b0b10", border: "none", cursor: "pointer",
            display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14,
          }}
          aria-label="Toggle sidebar"
        >L</button>
        {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontWeight: 600 }}>antiloki</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase" }}>{role} mode</span>
          </div>
        )}
      </div>

      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 6px" }}>
        {GROUPS.map((g) => {
          const visible = g.items.filter(it => it.roles.includes(role as Role));
          if (!visible.length) return null;
          return (
          <div key={g.label} style={{ marginBottom: 14 }}>
            {!collapsed && (
              <div style={{ padding: "4px 10px", fontFamily: mono, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
                {g.label}
              </div>
            )}
            {g.items.filter(it => it.roles.includes(role as Role)).map((it) => {
              const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
              const dimmed = it.deprecated || it.v2;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: collapsed ? "8px 0" : "7px 10px",
                    margin: "1px 4px",
                    borderRadius: 6,
                    color: active ? C.fg : (dimmed ? C.muted : C.dim),
                    background: active ? C.active : "transparent",
                    textDecoration: "none",
                    justifyContent: collapsed ? "center" : "flex-start",
                    transition: "background .12s, color .12s",
                    fontStyle: dimmed ? "italic" : "normal",
                    opacity: dimmed ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = C.hover; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  title={collapsed ? it.label : (it.v2 ? `${it.label} · wiring in progress (v2)` : it.deprecated ? `${it.label} · deprecated` : undefined)}
                >
                  <span style={{ fontFamily: mono, fontSize: 12, color: active ? C.brand : C.muted, width: 18, textAlign: "center" }}>{it.glyph}</span>
                  {!collapsed && <span style={{ flex: 1 }}>{it.label}</span>}
                  {!collapsed && it.v2 && (
                    <span style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, padding: "1px 5px", border: `1px solid ${C.border}`, borderRadius: 3, letterSpacing: 0.5 }}>v2</span>
                  )}
                </Link>
              );
            })}
          </div>
          );
        })}
      </nav>

      {!collapsed && <WorkspaceSwitcher />}

      {!collapsed && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
          <div>v3.1 · sprint loki-3.1</div>
          <div>5 done · 3 doing · 4 todo</div>
        </div>
      )}
    </aside>
  );
}
