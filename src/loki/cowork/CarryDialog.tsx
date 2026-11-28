// UNCOMMITTED CHANGES ARE NEVER MOVED SILENTLY (operator 2026-11-27): a new worktree asks whether to copy them in. Either way the project folder keeps them.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";

export function CarryDialog({ files, count, onAnswer, onCancel }: { files: string[]; count: number; onAnswer: (take: boolean) => void; onCancel: () => void }) {
  const cancel = React.useRef(onCancel); cancel.current = onCancel;
  React.useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cancel.current(); } }; window.addEventListener("keydown", esc, true); return () => window.removeEventListener("keydown", esc, true); }, []);
  const btn: React.CSSProperties = { fontFamily: nav, fontSize: 13, padding: "7px 14px", borderRadius: 8, cursor: "pointer", background: "transparent", border: `1px solid ${C.border}`, color: C.fg };
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="carry-title" data-testid="carry" style={{ position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", background: "rgba(0,0,0,.45)", padding: 16 }}>
      <div style={{ width: 460, maxWidth: "100%", padding: 20, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", gap: 12, color: C.fg, fontFamily: nav }}>
        <div id="carry-title" style={{ fontWeight: 600, fontSize: 15 }}>{count} file{count === 1 ? " has" : "s have"} uncommitted changes</div>
        <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>A new worktree starts from your last commit. Copy these changes into it? Your project folder keeps them either way, so commit or discard them there before you merge the worktree back.</div>
        <div style={{ maxHeight: 150, overflow: "auto", fontFamily: mono, fontSize: 11.5, color: C.dim, lineHeight: 1.6, userSelect: "text" }}>{files.map((f) => <div key={f} style={{ overflowWrap: "anywhere" }}>{f}</div>)}{count > files.length && <div>and {count - files.length} more</div>}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button data-testid="carry-cancel" onClick={onCancel} style={{ ...btn, color: C.muted }}>Cancel</button>
          <button data-testid="carry-no" onClick={() => onAnswer(false)} style={btn}>Start without them</button>
          <button autoFocus data-testid="carry-yes" onClick={() => onAnswer(true)} style={{ ...btn, border: `1px solid ${C.brand}`, color: C.brand }}>Copy them in</button>
        </div>
      </div>
    </div>
  );
}
