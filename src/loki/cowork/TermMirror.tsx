// THE TERMINAL'S MENU IN THE CHAT: the pane's screen is read while the chat covers it, so a question the agent asks there can be answered here, by the same keys. An engine whose conversation antiloki cannot read shows its screen.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { ptyInput, ptyScreen } from "./api";
import { menuKeys, parseTermMenu, type TermMenu } from "./term-menu";

export function useTermScreen(paneId: number, everyMs: number): string[] {
  const [rows, setRows] = React.useState<string[]>([]);
  React.useEffect(() => {
    let alive = true; let timer = 0; let last = "";
    const tick = async () => {
      if (!document.hidden) { const r = await ptyScreen(paneId); if (!alive) return; const s = (r ?? []).join("\n"); if (r && s !== last) { last = s; setRows(r); } }
      if (alive) timer = window.setTimeout(() => void tick(), everyMs);
    };
    void tick(); return () => { alive = false; window.clearTimeout(timer); };
  }, [paneId, everyMs]);
  return rows;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function TermMenuCard({ paneId, menu, who }: { paneId: number; menu: TermMenu; who: string }) {
  const [busy, setBusy] = React.useState(false);
  const press = async (keys: string[]) => { setBusy(true); try { for (const k of keys) { await ptyInput(paneId, k); await wait(70); } } finally { setBusy(false); } };
  const btn: React.CSSProperties = { textAlign: "left", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", background: "transparent", color: C.fg, cursor: "pointer", fontSize: 12.5 };
  return (
    <div data-testid="chat-term-menu" role="alertdialog" aria-label={`${who} asks`} style={{ margin: "0 auto 8px", maxWidth: 760, width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: `color-mix(in srgb, ${C.panel} 85%, transparent)`, display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflow: "auto" }}>
      {menu.title.map((t, i) => <div key={i} style={{ fontSize: 12, color: C.muted, fontFamily: mono, wordBreak: "break-word" }}>{t}</div>)}
      {menu.options.map((o, i) => <button key={`${i}-${o}`} data-testid={`chat-term-option-${i}`} disabled={busy} aria-pressed={i === menu.selected} onClick={() => void press(menuKeys(menu, i))} style={{ ...btn, ...(i === menu.selected ? { borderColor: C.brand } : {}) }}>{o}</button>)}
      <button data-testid="chat-term-cancel" disabled={busy} onClick={() => void press(["\x1b"])} style={{ ...btn, border: "none", color: C.muted, alignSelf: "flex-start" }}>Cancel (Esc)</button>
    </div>
  );
}

export function TermMirror({ rows }: { rows: string[] }) {
  return <pre data-testid="chat-term-mirror" style={{ margin: "0 auto", maxWidth: 760, width: "100%", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: mono, fontSize: 11.5, color: C.fg, lineHeight: 1.45 }}>{rows.join("\n").replace(/\n{3,}/g, "\n\n").trim()}</pre>;
}
export { parseTermMenu };
