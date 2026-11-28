// THE PIECES OF THE EVOLVE AND SWARM PANELS (the operator 2026-11-22, approved mockups "Evolve and Swarm as one living story" and "The panels behind the icons"). Every setting is a small picture of what it does; the live windows show a race
// (slots, a bracket, a square per run) and a measurement (a gain meter that draws its own noise, a budget ring, a stage track, the team's versions). Flat tinted fills, no gradients, no glows; motion only where it explains something.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";

export const EVOLVE_COLOR = "#d97757";   // the colour of a controlled browser's border
export const SWARM_COLOR = "#f2c230";

export type Goal = "cost" | "time" | "quality";
export type TrialLike = { n: number; kind?: string; hypothesis: string; outcome: string; gain_pct: number; sure_pct?: number; spent_usd: number; why: string; experiment?: any };

// ---- pure helpers (tested) ----
/** What "at least `gain` % better" means in the goal's own numbers: the two bars (today, needed) as widths in %, and the word. */
export function meaning(goal: Goal, gain: number): { today: number; needed: number; word: string; label: string } {
  const g = Math.max(0, Math.min(90, gain));
  if (goal === "quality") return { today: 70, needed: Math.min(100, Math.round(70 * (1 + g / 100))), word: `+${g}%`, label: "pass rate" };
  return { today: 100, needed: 100 - g, word: `−${g}%`, label: goal === "cost" ? "cost" : "time" };
}
/** About what one idea costs: the mean of what ideas cost in the last session, or a typical figure when there is none. Cents. */
export function perIdeaCents(trials: TrialLike[]): { cents: number; fromSession: boolean } {
  const spent = trials.map((t) => t.spent_usd).filter((x) => x > 0.005); if (!spent.length) return { cents: 35, fromSession: false };
  return { cents: Math.max(1, Math.round((spent.reduce((a, b) => a + b, 0) / spent.length) * 100)), fromSession: true };
}
/** How many of `trials` ideas a budget pays for, and what the whole set would need. */
export function afford(cents: number, per: number, trials: number): { can: number; enough: boolean; needCents: number } { const can = Math.floor(cents / Math.max(1, per)); return { can: Math.min(can, trials), enough: can >= trials, needCents: trials * per }; }
/** Where things sit on the gain meter, in % of its width: the scale runs -40..+60, so 0 is at 40 and the goal's line at 40 + minGain. */
export const METER = { lo: -40, hi: 60 };
export function meterPos(pct: number): number { return Math.max(0, Math.min(100, ((pct - METER.lo) / (METER.hi - METER.lo)) * 100)); }
/** The bar and the whisker of one trial: the bar from 0 to the measured gain, the whisker from the gain with the noise counted ("sure") to the mirror of it. */
export function meterGeom(gain: number, sure: number | undefined, minGain = 0): { barL: number; barW: number; whL: number; whW: number; clears: boolean } {
  const s = sure === undefined || Number.isNaN(sure) ? gain : sure; const half = Math.max(0, gain - s); const lo = gain - half, hi = gain + half;
  const barL = meterPos(Math.min(0, gain)); return { barL, barW: Math.abs(meterPos(gain) - meterPos(0)), whL: meterPos(lo), whW: Math.max(0, meterPos(hi) - meterPos(lo)), clears: s > 0 && s >= minGain };
}
/** Which of the four stages a session is in: 0 propose, 1 screen, 2 race (full tests), 3 verdict; -1 not started. */
export function stageOf(status: string, trials: TrialLike[]): number {
  if (!trials.length) return status === "running" ? 0 : -1; if (status !== "running") return 3;
  if (trials.some((t) => t.outcome === "running")) return trials.some((t) => t.experiment?.stage === "full" || t.outcome === "admitted" || t.outcome === "not_admitted") ? 2 : 1; return trials.some((t) => ["admitted", "not_admitted", "screened_out", "passed_not_applied"].includes(t.outcome)) ? 2 : 0;
}
/** One bracket row: the squares of the screen column and of the full-test column, and the reason it ended. Pure. */
export function bracketRow(t: TrialLike): { screen: ("pass" | "fail" | "run" | "wait")[]; full: ("pass" | "fail" | "run" | "wait")[]; dead: string; win: boolean } {
  const cand = t.experiment?.candidate; const n = Math.max(0, Math.min(40, Number(cand?.n) || 0)); const p = Math.max(0, Math.min(n, Number(cand?.passed) || 0)); const stage = t.experiment?.stage;
  const runs = [...Array(p).fill("pass"), ...Array(n - p).fill("fail")] as ("pass" | "fail")[];
  if (t.outcome === "waiting") return { screen: ["wait"], full: [], dead: "", win: false };
  if (t.outcome === "running") return { screen: stage === "full" ? ["pass"] : ["run"], full: stage === "full" ? ["run"] : [], dead: "", win: false };
  if (t.outcome === "screened_out") return { screen: runs.length ? runs : ["fail"], full: [], dead: "pass fell", win: false };
  if (t.outcome === "error" || t.outcome === "no_proposal") return { screen: ["fail"], full: [], dead: t.outcome === "error" ? "error" : "no idea", win: false };
  return { screen: ["pass"], full: runs, dead: t.outcome === "admitted" ? "" : t.outcome === "passed_not_applied" ? "also passed" : "below line", win: t.outcome === "admitted" };
}

// ---- the stylesheet, once ----
const CSS = `
.ek{--ek-line:color-mix(in srgb, var(--c-fg) 12%, transparent);--ek-tint:color-mix(in srgb, var(--c-fg) 9%, transparent);display:flex;flex-direction:column;gap:9px;color:var(--c-fg);font-family:${nav};font-size:11.5px;line-height:1.5}
.ek *{box-sizing:border-box}.ek button:focus-visible,.ek input:focus-visible{outline:2px solid var(--c-fg);outline-offset:2px}
.ek-cap{font:600 10.5px ${mono};letter-spacing:.08em;text-transform:uppercase;color:var(--c-muted);margin-bottom:3px;display:flex;gap:6px;align-items:baseline;font-size:9.5px}.ek-cap i{display:none}
.ek-row{display:flex;align-items:baseline;gap:10px;justify-content:space-between}.ek-row .ek-cap{margin:0}
.ek-big{font:500 14px ${mono};letter-spacing:-.02em}.ek-big small{font-size:12px;color:var(--c-muted);letter-spacing:0}
.ek-chip{font:500 11px ${mono};padding:3px 9px;border-radius:999px;background:var(--ek-tint);color:var(--c-dim);white-space:nowrap}.ek-chip.run{color:var(--ek-accent);background:color-mix(in srgb, var(--ek-accent) 14%, transparent)}.ek-chip.ok{color:var(--c-ok);background:color-mix(in srgb, var(--c-ok) 14%, transparent)}
.ek-goals{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:3px;border-radius:10px;background:var(--ek-tint)}
.ek-ind{position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 14px)/3);border-radius:8px;background:color-mix(in srgb, var(--ek-accent) 16%, transparent);box-shadow:inset 0 0 0 1.5px var(--ek-accent);transition:transform .35s cubic-bezier(.3,1.3,.5,1)}
.ek-goals button{all:unset;position:relative;z-index:1;cursor:pointer;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:5px;padding:6px 2px;border-radius:8px;color:var(--c-dim);text-align:center}.ek-goals button[aria-pressed=true]{color:var(--c-fg)}.ek-goals button[disabled]{cursor:default;opacity:.7}
.ek-goals svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.ek-goals small{display:none}
.ek-sl{position:relative;height:26px;display:flex;align-items:center}.ek-sl input{-webkit-appearance:none;appearance:none;width:100%;height:26px;background:transparent;margin:0;position:relative;z-index:2;cursor:pointer}
.ek-sl input::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--c-fg);box-shadow:0 0 0 4px var(--c-panel)}.ek-sl input::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--c-fg);border:0;box-shadow:0 0 0 4px var(--c-panel)}
.ek-sl input:disabled{cursor:default;opacity:.6}.ek-tk{position:absolute;left:9px;right:9px;top:11px;height:4px;border-radius:2px;background:var(--ek-line)}.ek-fl{position:absolute;left:9px;top:11px;height:4px;border-radius:2px;background:var(--ek-accent)}
.ek-mean{display:grid;grid-template-columns:40px 1fr 36px;gap:4px 8px;align-items:center;font:10px ${mono};color:var(--c-muted);margin-top:2px}.ek-mean .b{height:7px;border-radius:3px;background:color-mix(in srgb, var(--c-fg) 20%, transparent);transition:width .5s cubic-bezier(.3,1.2,.5,1)}.ek-mean .b.need{background:var(--ek-accent)}.ek-mean em{font-style:normal;color:var(--c-dim);text-align:right}
.ek-note{font:10px ${mono};color:var(--c-dim);margin-top:4px}.ek-note b{color:var(--c-fg);font-weight:500}
.ek-dots{display:flex;flex-wrap:wrap;gap:3px}.ek-dots button{all:unset;cursor:pointer;width:8px;height:8px;border-radius:2px;box-shadow:inset 0 0 0 1.5px var(--ek-line);transition:background .2s}.ek-dots button.on{background:var(--ek-accent);box-shadow:none}.ek-dots button:hover{box-shadow:inset 0 0 0 1.5px var(--c-muted)}.ek-dots button.on:hover{box-shadow:none}.ek-dots button[disabled]{cursor:default}
.ek-dots button.pop{animation:ek-pop .28s ease-out}@keyframes ek-pop{50%{transform:scale(1.45)}}
.ek-warn{display:flex;gap:6px;font:10.5px ${mono};color:var(--c-warn);background:color-mix(in srgb, var(--c-warn) 10%, transparent);border-radius:8px;padding:5px 8px}.ek-warn.ok{color:var(--c-ok);background:color-mix(in srgb, var(--c-ok) 10%, transparent)}
.ek-bank{display:flex;gap:6px}.ek-bank>div{flex:1;display:flex;align-items:center;gap:6px;background:var(--ek-tint);border-radius:8px;padding:5px 8px}.ek-bank b{font:500 13px ${mono}}.ek-bank span{font:10px ${mono};color:var(--c-muted)}.ek-sq{display:flex;gap:2px;margin-left:auto}.ek-sq i{width:6px;height:6px;border-radius:3px;background:var(--c-ok);opacity:.85}.ek-sq i.e{background:transparent;box-shadow:inset 0 0 0 1.5px var(--c-muted)}
.ek-go{all:unset;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;padding:6px;border-radius:8px;font-weight:600;font-size:12px;color:#fff;background:var(--ek-accent)}.ek-go.bee{color:#241c00}.ek-go[disabled]{opacity:.5;cursor:default}.ek-go svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.ek-go.stop{background:var(--ek-tint);color:var(--c-fg)}
.ek-sticky{position:sticky;z-index:5;bottom:-10px;margin:0 -10px -10px;padding:6px 10px 10px;background:color-mix(in srgb, var(--c-panel) 94%, transparent);display:flex;flex-direction:column;gap:8px}
.ek-foot{display:none}
.ek-soc{display:flex;gap:4px;margin-bottom:12px}.ek-soc button{all:unset;cursor:pointer;flex:1;height:26px;border-radius:8px;box-shadow:inset 0 0 0 1.5px var(--ek-line);display:grid;place-items:center;position:relative;color:var(--c-muted);transition:.25s}
.ek-soc button.on{box-shadow:inset 0 0 0 1.5px var(--ek-accent);background:color-mix(in srgb, var(--ek-accent) 12%, transparent);color:var(--ek-accent)}.ek-soc svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.7}.ek-soc button.on svg{animation:ek-pl .5s ease-out}@keyframes ek-pl{from{transform:scale(.6);opacity:0}}
.ek-soc .rec{position:absolute;bottom:-13px;font:8.5px ${mono};color:var(--c-ok);white-space:nowrap}
.ek-mb{position:relative;height:6px;border-radius:3px;background:var(--ek-line);margin:16px 0 16px}.ek-mb .free{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:var(--c-ok);transition:width .6s,background .3s}.ek-mb .t{position:absolute;top:-6px;bottom:-6px;width:0;border-left:1.5px dashed var(--c-muted)}.ek-mb .t span{position:absolute;top:-14px;left:3px;white-space:nowrap;font:8.5px ${mono};color:var(--c-muted)}.ek-mb .t.lo span{top:auto;bottom:-14px}
.ek-mrow{display:flex;gap:6px;align-items:center;font:10.5px ${mono};color:var(--c-dim)}.ek-mrow b{color:var(--c-fg);font-weight:500}
/* the live pieces */
.ek-top{display:flex;gap:10px;align-items:center}.ek-ring{position:relative;width:34px;height:34px;flex:none}.ek-ring svg{width:34px;height:34px;transform:rotate(-90deg)}.ek-ring circle{fill:none;stroke-width:6}.ek-ring .bg{stroke:var(--ek-line)}.ek-ring .fg{stroke:var(--ek-accent);stroke-linecap:round;stroke-dasharray:138.2;transition:stroke-dashoffset .8s}.ek-ring span{position:absolute;inset:0;display:grid;place-items:center;font:500 8.5px ${mono}}
.ek-trk{flex:1;display:flex;flex-direction:column;gap:8px}.ek-tr{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.ek-tr div{height:4px;border-radius:2px;background:var(--ek-line);overflow:hidden;position:relative}.ek-tr div i{position:absolute;inset:0;background:var(--ek-accent);transform:scaleX(0);transform-origin:left;transition:transform .7s}.ek-tr div.on i{transform:scaleX(1)}
.ek-tl{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font:10px ${mono};color:var(--c-muted)}.ek-tl span.on{color:var(--c-fg)}
.ek-gm{display:grid;grid-template-columns:78px 1fr 32px;gap:5px 6px;align-items:center}.ek-gm .n{font-size:11px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--c-dim)}.ek-gm .n.on{color:var(--c-fg)}
.ek-mt{position:relative;height:18px}.ek-mt .z{position:absolute;top:0;bottom:0;width:1px;background:var(--c-muted)}.ek-mt .th{position:absolute;top:-3px;bottom:-3px;width:0;border-left:1.5px dashed var(--ek-accent)}
.ek-mt .bar{position:absolute;top:5px;height:8px;border-radius:2px;background:var(--c-muted);transition:width .9s cubic-bezier(.2,.8,.2,1),left .9s cubic-bezier(.2,.8,.2,1)}.ek-mt .bar.ok{background:var(--c-ok)}.ek-mt .bar.neg{background:var(--c-bad)}
.ek-mt .wh{position:absolute;top:8px;height:2px;background:var(--c-fg);transition:width .8s .8s,left .8s .8s,opacity .4s .8s}.ek-mt .wh::before,.ek-mt .wh::after{content:"";position:absolute;top:-3px;width:2px;height:8px;background:var(--c-fg);left:0}.ek-mt .wh::after{left:auto;right:0}
.ek-gm .v{font:500 11.5px ${mono};text-align:right;color:var(--c-muted)}.ek-gm .v.ok{color:var(--c-ok)}
.ek-axis{display:grid;grid-template-columns:78px 1fr 32px;gap:6px;font:8.5px ${mono};color:var(--c-muted);margin-top:5px}.ek-axis div{position:relative;height:12px}.ek-axis span{position:absolute;transform:translateX(-50%)}
.ek-why{font:10px ${mono};color:var(--c-dim);min-height:0;line-height:1.4;margin-top:4px}
.ek-lin{display:flex;align-items:center;overflow:hidden}.ek-vn{flex:none;position:relative;font:500 10px ${mono};color:var(--c-dim);display:flex;align-items:center;gap:7px}.ek-vn u{width:12px;height:12px;border-radius:50%;background:var(--c-fg);display:block}.ek-vn.nw u{background:var(--ek-accent)}
.ek-vn .rp{position:absolute;left:0;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;box-shadow:0 0 0 1.5px var(--ek-accent);opacity:0}.ek-vn.pop .rp{animation:ek-rip 1.2s ease-out 2}@keyframes ek-rip{from{transform:scale(1);opacity:.9}to{transform:scale(3.4);opacity:0}}
.ek-ln{flex:none;height:2px;width:22px;background:var(--ek-line);position:relative;overflow:hidden}.ek-ln i{position:absolute;inset:0;background:var(--ek-accent);transform:scaleX(0);transform-origin:left;transition:transform .8s}.ek-ln.on i{transform:scaleX(1)}
.ek-slots{display:flex;gap:5px}.ek-slot{flex:1;min-width:0;height:28px;border-radius:8px;box-shadow:inset 0 0 0 1.5px var(--ek-line);display:flex;align-items:center;gap:5px;padding:0 7px;position:relative;overflow:hidden;color:var(--c-muted);font:10px ${mono};transition:.3s}
.ek-slot.on{box-shadow:inset 0 0 0 1.5px var(--ek-accent);color:var(--c-fg);background:color-mix(in srgb, var(--ek-accent) 8%, transparent)}.ek-slot.hold{box-shadow:inset 0 0 0 1.5px var(--c-muted);color:var(--c-dim)}
.ek-slot svg{width:13px;height:13px;flex:none}.ek-slot .rg{stroke:var(--ek-accent);stroke-width:2.2;fill:none;stroke-dasharray:22 40;stroke-linecap:round;transform-origin:50% 50%;animation:ek-spin 1.1s linear infinite}.ek-slot.hold .rg{animation:none;stroke:var(--c-muted);stroke-dasharray:none}@keyframes ek-spin{to{transform:rotate(360deg)}}
.ek-slot .nm{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0}.ek-slot .pz{margin-left:auto;flex:none;font:600 10px ${mono};color:var(--ek-accent);animation:ek-bl 1s ease-in-out infinite}@keyframes ek-bl{50%{opacity:.25}}
.ek-queue{display:flex;gap:4px;margin-top:5px;font:9.5px ${mono};color:var(--c-muted);align-items:center;min-height:22px;flex-wrap:wrap}.ek-queue i{font-style:normal;padding:2px 9px;border-radius:999px;box-shadow:inset 0 0 0 1.5px var(--c-muted)}
.ek-br{display:grid;grid-template-columns:78px 34px 1fr;gap:4px 6px;align-items:center}.ek-br>*{min-width:0}.ek-cl{overflow:hidden}.ek-br .h{font:600 9px ${mono};letter-spacing:.07em;text-transform:uppercase;color:var(--c-muted)}
.ek-br .n{font-size:11px;color:var(--c-fg);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;transition:.4s}.ek-br .n.dead{color:var(--c-muted);text-decoration:line-through;text-decoration-color:color-mix(in srgb, var(--c-bad) 70%, transparent)}.ek-br .n.win{color:var(--ek-accent);font-weight:600}
.ek-cl{display:flex;gap:3px;min-height:12px;align-items:center;position:relative}.ek-cl i{width:8px;height:8px;border-radius:3px;background:var(--c-ok)}.ek-cl i.f{background:var(--c-bad)}.ek-cl i.r{background:var(--ek-accent);animation:ek-pu 1s ease-in-out infinite}.ek-cl i.q{background:transparent;box-shadow:inset 0 0 0 1.5px var(--c-muted)}@keyframes ek-pu{50%{opacity:.35}}
.ek-cl b{margin-left:4px;white-space:nowrap;font:500 9px ${mono};color:var(--c-bad)}.ek-cl b.w{color:var(--ek-accent)}
.ek-msg{display:flex;gap:6px;align-items:center;font:10px ${mono};color:var(--ek-accent);background:color-mix(in srgb, var(--ek-accent) 10%, transparent);border-radius:8px;padding:5px 8px}
.ek-tabs{display:flex;gap:2px;padding:2px;border-radius:999px;background:var(--ek-tint);width:max-content;font:10.5px ${mono}}.ek-tabs button{all:unset;cursor:pointer;padding:2px 10px;border-radius:999px;color:var(--c-dim)}.ek-tabs button[aria-pressed=true]{background:color-mix(in srgb, var(--c-fg) 14%, transparent);color:var(--c-fg)}
@media (prefers-reduced-motion: reduce){.ek *{animation:none!important;transition:none!important}}
`;
export function PanelStyle() { return <style>{CSS}</style>; }

const I = (p: string) => <svg viewBox="0 0 24 24" aria-hidden dangerouslySetInnerHTML={{ __html: p }} />;
const GOAL_ICONS: Record<Goal, React.ReactNode> = { cost: I('<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.6-.9-1.5-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.9 0 2.6 5.2 1.4 5.2 4 0 1.2-1.1 2-2.7 2-1.1 0-2.1-.4-2.7-1.3M12 6.5v11"/>'), time: I('<circle cx="12" cy="13" r="7.5"/><path d="M12 13V8.5M9.5 3.5h5"/>'), quality: I('<path d="M4 12.5l5 5L20 6.5"/>') };
const GOALS: { g: Goal; word: string; sub: string }[] = [{ g: "cost", word: "Cheaper", sub: "$ per run" }, { g: "time", word: "Faster", sub: "time per run" }, { g: "quality", word: "Better", sub: "pass rate" }];

export function GoalCards({ value, onChange, disabled }: { value: Goal; onChange: (g: Goal) => void; disabled?: boolean }) {
  const i = Math.max(0, GOALS.findIndex((x) => x.g === value));
  return <div className="ek-goals" data-testid="evolve-goal" role="group" aria-label="what should get better"><span className="ek-ind" style={{ transform: `translateX(calc(${i * 100}% + ${i * 6}px))` }} />
    {GOALS.map((x) => <button key={x.g} data-testid={`evolve-goal-${x.g}`} aria-pressed={value === x.g} disabled={disabled} onClick={() => onChange(x.g)}>{GOAL_ICONS[x.g]}{x.word}<small>{x.sub}</small></button>)}</div>;
}
export function Slider({ testid, label, min, max, step, value, onChange, disabled }: { testid: string; label: string; min: number; max: number; step: number; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const p = (value - min) / (max - min);
  return <div className="ek-sl"><span className="ek-tk" /><span className="ek-fl" style={{ width: `calc(${p * 100}% - ${p * 18}px + 9px)` }} /><input data-testid={testid} type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} /></div>;
}
export function MeanBars({ goal, gain }: { goal: Goal; gain: number }) {
  const m = meaning(goal, gain);
  return <><div className="ek-mean" data-testid="evolve-mean"><span>{m.label}</span><div><div className="b" style={{ width: `${m.today}%` }} /></div><em>today</em><span>needed</span><div><div className="b need" style={{ width: `${m.needed}%` }} /></div><span data-testid="evolve-mean-word">{m.word}</span></div>
    <div className="ek-note" title="An idea is accepted only if even the low end of its measured gain clears the line"><b>Noise counted</b></div></>;
}
export function Squares({ testid, value, max, onChange, disabled, label }: { testid: string; value: number; max: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  const [wave, setWave] = React.useState(0);
  return <div className="ek-dots" data-testid={testid} role="group" aria-label={label}>{Array.from({ length: max }, (_, k) => k + 1).map((i) => <button key={`${i}-${wave}`} aria-label={`${i}`} disabled={disabled} className={`${i <= value ? "on" : ""}${wave && i <= value ? " pop" : ""}`} style={wave ? { animationDelay: `${i * 18}ms` } : undefined} onClick={() => { setWave((w) => w + 1); onChange(i); }} />)}</div>;
}
export function BudgetField({ cents, onChange, trials, per, fromSession, disabled }: { cents: number; onChange: (c: number) => void; trials: number; per: number; fromSession: boolean; disabled?: boolean }) {
  const a = afford(cents, per, trials);
  return <div><div className="ek-row"><div className="ek-cap">Budget for the whole session</div><div className="ek-big">$<span data-testid="evolve-budget-value">{(cents / 100).toFixed(2)}</span></div></div>
    <Slider testid="evolve-budget" label="budget in cents" min={25} max={2000} step={25} value={Math.max(25, Math.min(2000, cents))} onChange={onChange} disabled={disabled} />
    <div className="ek-mrow" style={{ marginTop: 2 }}><span title={fromSession ? "the mean of what ideas cost in the last session" : "a typical figure: no earlier session to measure"}>about <b>${(per / 100).toFixed(2)}</b> an idea{fromSession ? "" : " (typical)"}</span><span style={{ flex: 1 }} /><span data-testid="evolve-afford">{a.enough ? <>enough for <b>{trials}</b> of {trials}</> : <>enough for <b style={{ color: "var(--c-warn)" }}>{a.can}</b> of {trials}</>}</span></div>
    {!a.enough && <div className="ek-warn" data-testid="evolve-afford-warn" style={{ marginTop: 8 }}><span>⚠</span><span>{a.can === 0 ? "Not even one idea fits. Raise it." : `Stops after about ${a.can}. $${(a.needCents / 100).toFixed(2)} covers all ${trials}.`}</span></div>}</div>;
}
export function BankTiles({ tune, held }: { tune: number; held: number }) {
  const sq = (n: number, of: number) => <div className="ek-sq">{Array.from({ length: Math.max(of, n) }, (_, i) => <i key={i} className={i < n ? "" : "e"} />)}</div>;
  return <div className="ek-bank" data-testid="evolve-bank"><div><b>{tune}</b><span>practice</span>{sq(Math.min(tune, 12), Math.min(Math.max(tune, 5), 12))}</div><div><b>{held}</b><span title="hidden from the improver">held-out</span>{sq(Math.min(held, 12), Math.min(Math.max(held, 5), 12))}</div></div>;
}
export type MachineView = { free_gb: number; total_gb: number; cores: number; load1: number | null; pause_under_gb: number; continue_over_gb: number };
export function Sockets({ value, onChange, rec, disabled }: { value: number; onChange: (n: number) => void; rec: number; disabled?: boolean }) {
  return <div className="ek-soc" data-testid="swarm-concurrency" role="group" aria-label="running at once">{[1, 2, 3, 4, 5, 6].map((i) => <button key={i} aria-label={`${i} at once`} disabled={disabled} className={i <= value ? "on" : ""} onClick={() => onChange(i)}>{I('<circle cx="12" cy="12" r="6"/>')}{i === rec && <span className="rec">fits this machine</span>}</button>)}</div>;
}
export function MachineBar({ m }: { m: MachineView | null }) {
  if (!m) return <div className="ek-note">The serve did not report this machine yet.</div>;
  const pct = (g: number) => Math.max(0, Math.min(100, (g / Math.max(1, m.total_gb)) * 100)); const low = m.free_gb < m.pause_under_gb;
  return <div data-testid="swarm-machine"><div className="ek-mb"><span className="free" style={{ width: `${pct(m.free_gb)}%`, background: low ? "var(--c-bad)" : "var(--c-ok)" }} /><span className="t" style={{ left: `${pct(m.pause_under_gb)}%` }}><span>pause &lt; {m.pause_under_gb} GB</span></span><span className="t lo" style={{ left: `${pct(m.continue_over_gb)}%` }}><span>continue &gt; {m.continue_over_gb} GB</span></span></div>
    <div className="ek-mrow"><span>free <b>{m.free_gb}</b> of {m.total_gb} GB</span><span style={{ flex: 1 }} /><span>load <b>{m.load1 === null ? "-" : m.load1.toFixed(1)}</b> / {m.cores}</span></div></div>;
}
/** How many runs at once this machine comfortably holds: memory first (about 2 GB each above the pause line), then half the cores. */
export function recommended(m: MachineView | null): number { if (!m) return 3; return Math.max(1, Math.min(6, Math.floor(Math.max(0, m.free_gb - m.pause_under_gb) / 2) || 1, Math.max(1, Math.floor(m.cores / 2)))); }
export const PauseIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>;
export function GoButton({ testid, children, onClick, disabled, bee, stop }: { testid: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; bee?: boolean; stop?: boolean }) {
  return <button data-testid={testid} className={`ek-go${bee ? " bee" : ""}${stop ? " stop" : ""}`} disabled={disabled} onClick={onClick}>{!stop && <svg viewBox="0 0 24 24"><path d="M7 4l12 8-12 8z" /></svg>}{children}</button>;
}

// ---- live ----
export function BudgetRing({ spent, budget }: { spent: number; budget: number }) {
  const f = budget > 0 ? Math.min(1, spent / budget) : 0; return <div className="ek-ring" data-testid="evolve-ring"><svg viewBox="0 0 52 52"><circle className="bg" cx="26" cy="26" r="22" /><circle className="fg" cx="26" cy="26" r="22" style={{ strokeDashoffset: 138.2 * (1 - f) }} /></svg><span>${spent.toFixed(2)}</span></div>;
}
const STAGES = ["propose", "screen", "race", "verdict"];
export function StageTrack({ stage }: { stage: number }) {
  return <div className="ek-trk" data-testid="evolve-stage" data-stage={stage}><div className="ek-tr">{STAGES.map((s, i) => <div key={s} className={i <= stage ? "on" : ""}><i /></div>)}</div><div className="ek-tl">{STAGES.map((s, i) => <span key={s} className={i <= stage ? "on" : ""}>{s}</span>)}</div></div>;
}
export function GainMeters({ trials, minGain }: { trials: TrialLike[]; minGain: number }) {
  const done = (t: TrialLike) => ["admitted", "not_admitted", "screened_out", "passed_not_applied"].includes(t.outcome);
  return <div data-testid="evolve-trials-list"><div className="ek-gm">{trials.map((t) => { const g = done(t) ? meterGeom(t.gain_pct, t.sure_pct, minGain) : null; return <React.Fragment key={t.n}>
    <span className={`n${g ? " on" : ""}`} title={t.hypothesis}>{t.hypothesis || `idea ${t.n}`}</span>
    <div className="ek-mt"><span className="z" style={{ left: `${meterPos(0)}%` }} /><span className="th" style={{ left: `${meterPos(minGain)}%` }} />{g && <><span className={`bar${g.clears ? " ok" : t.gain_pct < 0 ? " neg" : ""}`} style={{ left: `${g.barL}%`, width: `${g.barW}%` }} /><span className="wh" data-testid={`evolve-whisker-${t.n}`} style={{ left: `${g.whL}%`, width: `${g.whW}%`, opacity: g.whW > 0 ? 1 : 0 }} /></>}</div>
    <span className={`v${g?.clears ? " ok" : ""}`}>{g ? `${t.gain_pct > 0 ? "+" : ""}${Math.round(t.gain_pct)}%` : "·"}</span></React.Fragment>; })}</div>
    <div className="ek-axis"><i /><div><span style={{ left: "2%" }}>−40%</span><span style={{ left: `${meterPos(0)}%` }}>0</span><span style={{ left: `${meterPos(minGain)}%`, color: "var(--ek-accent)" }}>+{minGain}%</span><span style={{ left: "96%" }}>+60%</span></div><i /></div></div>;
}
export function Lineage({ versions, won }: { versions: { id: string; label: string }[]; won: boolean }) {
  const last = versions.slice(-3);
  return <div className="ek-lin" data-testid="evolve-lineage">{last.map((v, i) => <React.Fragment key={v.id}>{i > 0 && <span className="ek-ln on"><i /></span>}<span className="ek-vn"><u />{v.label}{i === last.length - 1 ? " · now" : ""}</span></React.Fragment>)}
    {won && <><span className="ek-ln on"><i /></span><span className="ek-vn nw pop" data-testid="evolve-newversion"><span className="rp" /><u />next</span></>}</div>;
}
export function Slots({ cap, running, queued, paused }: { cap: number; running: TrialLike[]; queued: TrialLike[]; paused: number }) {
  return <div><div className="ek-slots" data-testid="swarm-slots">{Array.from({ length: cap }, (_, i) => { const t = running[i]; const hold = !!t && i < paused; return <div key={i} className={`ek-slot${t ? (hold ? " hold" : " on") : ""}`}>{t ? <><svg viewBox="0 0 24 24"><circle className="rg" cx="12" cy="12" r="8" /></svg><span className="nm">{t.hypothesis || `idea ${t.n}`}</span>{hold && <span className="pz" title="paused: the machine is busy">||</span>}</> : <span>free</span>}</div>; })}</div>
    <div className="ek-queue" data-testid="swarm-queue">{queued.length > 0 && <><span>waiting for a socket</span>{queued.map((t) => <i key={t.n}>{t.hypothesis || `idea ${t.n}`}</i>)}</>}</div></div>;
}
export function Bracket({ trials }: { trials: TrialLike[] }) {
  const sq = (c: string, k: number) => <i key={k} data-cell={c} className={c === "fail" ? "f" : c === "run" ? "r" : c === "wait" ? "q" : ""} />;
  return <div className="ek-br" data-testid="swarm-grid"><span /><span className="h">Screen</span><span className="h">Full test</span>
    {trials.map((t) => { const r = bracketRow(t); return <React.Fragment key={t.n}><span className={`n${r.dead ? " dead" : ""}${r.win ? " win" : ""}`} title={t.hypothesis}>{t.hypothesis || `idea ${t.n}`}</span>
      <span className="ek-cl" data-testid={`swarm-row-${t.n}`}>{r.screen.map(sq)}</span><span className="ek-cl">{r.full.map(sq)}{r.win && <b className="w">winner</b>}{r.dead && <b>{r.dead}</b>}</span></React.Fragment>; })}</div>;
}
