// WHAT MAIN SAYS BEFORE YOU ASK IT ANYTHING (operator 2026-09-24, from a Windows install: "i dont see anything
// that teachs about how it works the merge models. The Main should at least give some initial message with
// prints and examples so the user can ask about it and discovery. Like a conversation, can be a deterministic
// message the first one").
//
// It is deterministic on purpose: this is the first screen of the product, and it costs nothing and cannot be
// wrong about what is installed — it is read from the machine probe, not guessed and not asked of a model. The
// examples are measured bench rows with their dates, so a reader can go and check them.
import React from "react";
import { C, mono } from "@/loki/theme";
import { useMachine, machineLine, installed, type Machine } from "@/loki/widgets/engines";

export type Block = { kind: "line" | "example" | "next"; text: string; sub?: string };

/**
 * The opening, built from what this machine has. Four beats: what antiloki is, what a merge is, what it saved
 * on a real run, and what to do next — and the fourth changes depending on whether a merge is even possible
 * here. Pure — tested.
 */
export function welcome(m: Machine): Block[] {
  // ONLY THE SEATS THAT CAN RUN: a switched-off or signed-out CLI is not "running on" anything (2026-10-01)
  const on = installed(m.engines);
  const names = on.map((e) => e.label);
  const canMerge = m.advice?.can_merge ?? on.length > 1;
  const out: Block[] = [];

  out.push({ kind: "line", text: "I read this workspace and change nothing.",
    sub: "Ask me what the code does, where something lives, what an agent did yesterday. I am the one agent with no box and no scope — there is nothing here to configure and nothing I can break. The agents you hire are the ones that write." });

  out.push({ kind: "line", text: names.length ? `Running on ${names.join(" · ")}.` : "No agent CLI found on this machine yet.",
    sub: names.length
      ? "antiloki drives the CLIs you already pay for. It bundles no model of its own, so nothing here is a second subscription."
      : "antiloki drives agent CLIs you install and sign into yourself — Claude, Codex, Cursor, Gemini or Grok. It bundles no model of its own." });

  out.push({ kind: "line", text: "A merge is one agent with two models.",
    sub: "The brain plans, verifies, judges and explains. The hands edit, look things up and report. Heimdall reads every ask first and sends each job to the side that should have it — so the expensive model is paid for thinking, not for typing." });

  out.push({ kind: "example", text: "Claude × DeepSeek — 8 modules, 249 s, $0.25, 37/37 checks",
    sub: "Measured 2026-09-22. The same task given to raw Opus alone: 303 s, $1.28, the same 37/37. A fifth of the money and faster, for the same result." });
  out.push({ kind: "example", text: "Kimi × DeepSeek-Flash — the same 8 modules, 163 s, $0.04, 37/37",
    sub: "Measured 2026-09-23, entirely inside OpenCode. The cheapest row there is. What it does not buy is judgement: this pairing's judge missed a bug Opus caught, which is why the brain side is worth a subscription." });

  out.push({ kind: "next", text: canMerge ? "Hire an agent and pick its merge." : "Add one more engine to unlock merges.",
    sub: canMerge
      ? "Agents › hire. You choose the brain and the hands; the ones this machine cannot run are shown locked with what to install. Ask me “what merge should I use for this repo?” and I will read the code before answering."
      : (m.advice?.unlock?.[0]?.why ?? "A merge needs two sides that can run at once — a brain that plans and hands that write.") });

  return out;
}

/** The same thing on screen. Rendered only in Main's pane, only before its first turn. */
export function MainWelcome({ font = mono }: { font?: string }) {
  const machine = useMachine();
  const blocks = React.useMemo(() => welcome(machine), [machine]);
  return (
    <div data-testid="main-welcome" style={{ margin: "auto", maxWidth: 560, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 14, textAlign: "left" }}>
      {!!machine.engines.length && <div style={{ fontFamily: font, fontSize: 9.5, color: C.dim, letterSpacing: .4 }}>{machineLine(machine.engines)}</div>}
      {blocks.map((b, i) => (
        <div key={i} style={{ borderLeft: b.kind === "example" ? `2px solid ${C.brand}` : "2px solid transparent", paddingLeft: b.kind === "example" ? 10 : 0 }}>
          <div style={{ fontFamily: font, fontSize: b.kind === "next" ? 11.5 : 11, color: b.kind === "next" ? C.brand : C.fg, fontWeight: b.kind === "next" ? 700 : 400, lineHeight: 1.5 }}>{b.text}</div>
          {b.sub && <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55, marginTop: 3 }}>{b.sub}</div>}
        </div>
      ))}
    </div>
  );
}
