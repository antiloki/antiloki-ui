// screening widget (operator 2026-07-25) — the low-confidence (<70%) screen, rebuilt around the intent
// widget's behavior: instead of a questionnaire you answer, it lays out MANY SMALL CHIPS — the pieces the
// interviewer is unsure about — and you MOUNT A THOUGHT by selecting the ones that fit (plus your own).
// The old radio-questionnaire is dropped. The questions become faint section labels; their options become
// chips. Selecting is multi-select and cross-question — you assemble an idea, you don't fill a form.
import React, { useState } from "react";
import { C, mono } from "@/loki/theme";
import type { WidgetProps } from "./types";

const stripMd = (s: string) => String(s ?? "").replace(/[*_`#>]/g, "").trim();

export function ScreeningWidget({ payload, ctx }: WidgetProps) {
  const q = payload?.q;
  const questions: any[] = Array.isArray(q?.questions) ? q.questions : [];
  const past = ctx.isLast === false;            // a superseded screen from an earlier turn
  const [sel, setSel] = useState<Set<string>>(new Set()); // selected chip ids (multi-select, cross-question)
  const [custom, setCustom] = useState<string[]>([]);     // user-minted building blocks
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState(false);
  if (!questions.length) return null;
  const disabled = past || submitted || !!ctx.confirming;

  const cid = (qi: number, o: any) => `${qi}:${o.key ?? o.label}`;
  const toggle = (id: string) => { if (disabled) return; setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const addCustom = () => { const v = draft.trim(); if (!v || disabled) return; setCustom((c) => (c.includes(v) ? c : [...c, v])); setDraft(""); };
  const dropCustom = (v: string) => { if (disabled) return; setCustom((c) => c.filter((x) => x !== v)); };

  const picks = questions.map((qq, qi) => (qq.options ?? []).filter((o: any) => sel.has(cid(qi, o))).map((o: any) => o.label));
  const anySel = sel.size > 0 || custom.length > 0;
  const mounted = [...picks.flat(), ...custom];

  const submit = () => {
    if (disabled || !anySel) return;
    setSubmitted(true); // lock immediately, before the refetch marks the turn as past
    // Mount the thought: map each question to the pieces chosen under it, then append the user's own.
    const parts: string[] = [];
    questions.forEach((qq, qi) => { if (picks[qi].length) parts.push(`${stripMd(qq.question_md)} → ${picks[qi].join(", ")}`); });
    if (custom.length) parts.push(`also: ${custom.join(", ")}`);
    ctx.onPickOption?.(parts.join("\n") || mounted.join(", "));
  };

  return (
    <div style={{
      marginTop: 4, padding: "10px 12px", borderRadius: 8,
      background: C.panel, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.brand}`,
      fontFamily: mono, fontSize: 11, color: C.fg, display: "flex", flexDirection: "column", gap: 10,
      opacity: past ? 0.65 : 1,
    }}>
      <div style={{ color: C.muted, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.7 }}>
        screening · {past ? "mounted" : "pick the pieces that fit — mount your idea"}
      </div>

      {questions.map((qq, qi) => (
        <div key={qi} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ color: C.dim, fontSize: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{stripMd(qq.question_md)}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {(qq.options ?? []).map((o: any) => {
              const id = cid(qi, o); const on = sel.has(id);
              return <button key={id} disabled={disabled} onClick={() => toggle(id)} style={chip(on, disabled)}>{o.label}</button>;
            })}
          </div>
        </div>
      ))}

      {/* the user's own building blocks — mint a chip for a piece the options missed */}
      {(custom.length > 0 || !past) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {custom.map((v) => (
            <button key={v} disabled={disabled} onClick={() => dropCustom(v)} title="remove" style={{ ...chip(true, disabled), paddingRight: 6 }}>{v} <span style={{ opacity: 0.6 }}>✕</span></button>
          ))}
          {!past && (
            <input
              value={draft} disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="+ add your own piece"
              style={{ flex: "1 1 140px", minWidth: 120, background: C.panel2, color: C.fg, border: `1px solid ${draft.trim() ? C.brand : C.border}`, borderRadius: 12, padding: "4px 10px", fontFamily: mono, fontSize: 10.5, outline: "none" }}
            />
          )}
        </div>
      )}

      {/* the mounted thought so far — what will be sent */}
      {mounted.length > 0 && (
        <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>
          <span style={{ color: C.dim }}>your idea:</span> {mounted.join(" · ")}
        </div>
      )}

      {!past && (
        <button
          disabled={disabled || !anySel}
          onClick={submit}
          style={{ alignSelf: "flex-start", background: C.brand, color: C.bg, border: "none", borderRadius: 6, padding: "7px 14px", cursor: (disabled || !anySel) ? "not-allowed" : "pointer", fontFamily: mono, fontSize: 11, fontWeight: 600, opacity: (disabled || !anySel) ? 0.45 : 1 }}
        >{submitted ? "sent" : "Mount it →"}</button>
      )}
    </div>
  );
}

function chip(on: boolean, disabled: boolean): React.CSSProperties {
  return {
    background: on ? `color-mix(in oklab, ${C.brand} 18%, ${C.panel})` : C.panel2,
    color: on ? C.brand : C.dim,
    border: `1px solid ${on ? C.brand : C.border}`, borderRadius: 12, padding: "4px 10px",
    cursor: disabled ? "default" : "pointer", fontFamily: mono, fontSize: 10.5,
    fontWeight: on ? 600 : 400, opacity: disabled && !on ? 0.7 : 1, transition: "border-color .12s, color .12s, background .12s",
  };
}
