// THE AGENT'S ERROR, SHOWN IN THE CHAT (operator 2026-11-26: "any provider which has free models and says the selected model is unavailable on free should at least show the error on chat mode"). The CLI prints it
// on its own screen (Cursor under its box), where the chat covers it. Only lines that start as an error, or the known refusals, count: an answer that merely talks about errors does not. Pure.
const STARTS = /^(?:[\u2502\u2503|\u2717\u00d7\u2718\u26a0\u25a0]\s*)*(?:API Error|Error|ERROR)\s*[:!]\s*(.+)$/;
const REFUSALS = /^(?:[\u2502\u2503|\u2717\u00d7\u2718\u26a0\u25a0]\s*)*(.*\b(?:model (?:is )?(?:unavailable|not available) (?:on|in|for) (?:the |your )?free|usage limit reached|quota exceeded|free (?:plan|tier) limit|upgrade your plan to)\b.*)$/i;
const END = /^(?:[\u2580\u2584\u2500\u2501\u2550\u256d\u2570>\u276f\u2192\u23f5?\u2299]|hide[A-Za-z]+:|~\/|…\/)/;

/** The error on the screen now, or null. Only its lower part counts; a message sent after it makes it old. */
export function parseTermError(rows: string[]): string | null {
  const lines = rows.map((r) => r.trim()).filter(Boolean).slice(-10);
  for (let i = lines.length - 1; i >= 0; i--) {
    const hit = STARTS.exec(lines[i]) ?? REFUSALS.exec(lines[i]); if (!hit) continue;
    const out = [hit[1].trim()];
    for (let j = i + 1; j < lines.length && out.length < 4; j++) { const t = lines[j].replace(/^[\u2502\u2503|]\s*/, ""); if (!t || END.test(t)) break; out.push(t); }
    return out.join(" ").slice(0, 400);
  }
  return null;
}
