import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { GLOSSARY } from "@/loki/mock/glossary";
import { C } from "@/loki/theme";


const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

/**
 * Inline glossary term. Wraps a string with a dotted underline + on-hover/tap tooltip.
 * Usage: <Term name="drift" /> or <Term name="drift">drift detected</Term> for custom label.
 */
export function Term({ name, children }: { name: keyof typeof GLOSSARY | string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[name as string];
  if (!entry) return <>{children ?? name}</>;

  const label = children ?? entry.term;

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        style={{
          textDecoration: "underline dotted",
          textDecorationColor: C.brand, // C.accent never existed — undefined underline color
          textUnderlineOffset: 3,
          cursor: "help",
        }}
      >
        {label}
      </span>
      {open && (
        <span
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 200,
            width: 280,
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "10px 12px",
            boxShadow: "0 12px 32px -8px rgba(0,0,0,.6)",
            color: C.fg,
            fontFamily: '-apple-system, system-ui, sans-serif',
            fontSize: 12,
            lineHeight: 1.5,
            textAlign: "left",
            whiteSpace: "normal",
            display: "block",
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 10, color: C.brand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            {entry.term}
          </div>
          <div style={{ color: C.fg, marginBottom: 6 }}>{entry.short}</div>
          <div style={{ color: C.dim, fontSize: 11 }}>{entry.long}</div>
          {entry.links && entry.links.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {entry.links.map(l => (
                <Link key={l.to} to={l.to} style={{ fontFamily: mono, fontSize: 10, color: C.brand, textDecoration: "none" }}>
                  {l.label} →
                </Link>
              ))}
            </div>
          )}
        </span>
      )}
    </span>
  );
}
