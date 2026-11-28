// A MODEL NODE'S SEAT IS PICKED, NOT TYPED (operator 2026-11-27): what this machine has is listed (Claude's models when Claude Code is installed, the local models Ollama holds), and anything else (a named endpoint) can still be typed.
import * as React from "react";
import { listEngines, localModels } from "../cowork/api";

export type SeatOption = { group: string; value: string; label: string };
/** What can be offered. Pure. A model node reaches Claude, a local model or a named endpoint: the other seats are not wired for single calls. */
export function seatOptions(claude: boolean, tags: string[]): SeatOption[] {
  return [...(claude ? ["haiku", "sonnet", "opus"].map((m) => ({ group: "Claude Code", value: `claude-code:${m}`, label: m })) : []), ...tags.map((t) => ({ group: "Local models (Ollama)", value: `local:${t}`, label: t }))];
}
const OTHER = "__other__";

export function SeatField({ value, onChange, style }: { value: string; onChange: (seat: string) => void; style: React.CSSProperties }) {
  const [options, setOptions] = React.useState<SeatOption[]>([]);
  const [typing, setTyping] = React.useState(false);
  React.useEffect(() => { let stop = false; void Promise.all([listEngines(), localModels()]).then(([engines, local]) => { if (!stop) setOptions(seatOptions(engines.some((e) => e.key === "claude-code" && e.installed), local.models.map((m) => m.tag))); }); return () => { stop = true; }; }, []);
  if (typing) return <input autoFocus data-testid="ins-llm-seat" aria-label="the seat" value={value} placeholder="endpoint:name · local:model · claude-code:model" onChange={(e) => onChange(e.target.value)} onBlur={() => setTyping(false)} onKeyDown={(e) => { if (e.key === "Enter") setTyping(false); }} style={style} />;
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <select data-testid="ins-llm-seat" aria-label="the seat" value={value} onChange={(e) => { if (e.target.value === OTHER) setTyping(true); else onChange(e.target.value); }} style={style}>
      {!value && <option value="">choose a seat…</option>}
      {value && !options.some((o) => o.value === value) && <option value={value}>{value}</option>}
      {groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)}
      <option value={OTHER}>type another (a named endpoint)…</option>
    </select>
  );
}
