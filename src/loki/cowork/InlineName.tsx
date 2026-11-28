// A NAME YOU CAN CHANGE IN PLACE (herdr renames panes, tabs and workspaces; so does this): double-click it, type, Enter keeps it, Escape or an empty name puts it back.
// It is only the editing; where the name is stored is the caller's.
import * as React from "react";
import { C } from "@/loki/theme";

export function InlineName({ value, onCommit, max = 60, label, style, children, editRequest = 0 }: {
  value: string; onCommit: (name: string) => void; max?: number; label: string; style?: React.CSSProperties; children?: React.ReactNode;
  /** a number that goes up when something else (a shortcut) asks for the name to be edited */ editRequest?: number;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef<HTMLInputElement | null>(null);
  const lastRequest = React.useRef(editRequest);
  React.useEffect(() => { if (editRequest !== lastRequest.current) { lastRequest.current = editRequest; setDraft(value); setEditing(true); } }, [editRequest, value]);
  React.useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  const done = (keep: boolean) => {
    setEditing(false);
    const next = draft.trim().slice(0, max);
    if (keep && next && next !== value) onCommit(next);
  };
  if (!editing) {
    return <span title={`${label} (double-click to rename)`} data-testid="inline-name" onDoubleClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }} style={style}>{children ?? value}</span>;
  }
  return (
    <input ref={ref} data-testid="inline-name-input" aria-label={label} value={draft} maxLength={max} onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") done(true); else if (e.key === "Escape") done(false); }}
      onBlur={() => done(true)} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      style={{ background: C.bg, color: C.fg, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 5px", font: "inherit", fontSize: "inherit", width: "100%", minWidth: 60, outline: "none", ...style }} />
  );
}
