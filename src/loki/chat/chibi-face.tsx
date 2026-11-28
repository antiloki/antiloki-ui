// THE FACES (operator 2026-09-23, from the reference: "flat solid-colour blobs — a triangle, a circle, an egg, a rounded
// square, a hexagon, a drop, an arch — with two tiny white slit eyes, no mouth, no outline, each tilted a little and
// floating; the animations are gentle"). One shape and one colour per agent, fixed by its slug; the eyes are two small
// white slits that blink on the agent's own rhythm; the body floats and tilts. The MOOD is in the motion, never in a
// drawn expression: working — the eyes slide side to side and the float quickens; needs you — the eyes open tall
// and the body nudges; live — a slow drift; idle — a slower drift and a rarer blink; failed — the eyes drop to two
// low dashes and the body sags. Our own drawing. `prefers-reduced-motion` keeps only the blink.
import React from "react";

export type Mood = "needs" | "working" | "live" | "idle" | "failed";
export const SHAPES = ["circle", "egg", "square", "hex", "drop", "arch", "triangle"] as const;
export type Shape = (typeof SHAPES)[number];
/** the flat palette of the reference: purple · pink · orange · slate · teal · blue · yellow */
export const PALETTE = ["#7c5cf0", "#ec4f8f", "#f26b21", "#5b6f88", "#19a89d", "#1e88f0", "#e6b31e",
  // five more, far from the first seven and from each other (operator 2026-09-30: "the avatars of the agents should have different colours, not all the same"), so a roster of a dozen rarely repeats
  "#3fae4a", "#c0392b", "#8e5a2b", "#20b2d8", "#b15fd0"] as const;
/** a stable small hash of the slug → shape, colour, tilt and blink phase. Pure. */
export function hashOf(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
export function shapeOf(slug: string): Shape { return SHAPES[hashOf(slug) % SHAPES.length]; }
/** THE MAIN AGENT IS YELLOW (operator 2026-10-11: "the main avatar always has a brown colour, ugly, use a more alive colour like yellow"). Its slug happened to hash to the palette's brown. The main agent is the one
 *  every user has, so it gets a chosen colour instead of a lucky one, and nobody else on the roster is nudged onto it while the palette has another free. */
export const MAIN_SLUG = "main";
export const MAIN_COLOR = "#e6b31e";
export function colorOf(slug: string): string { return slug === MAIN_SLUG ? MAIN_COLOR : PALETTE[(hashOf(slug) >>> 3) % PALETTE.length]; }
/** EACH AGENT ITS OWN COLOUR (operator 2026-09-30). The face used to wear its ENGINE's accent, so every Claude agent was the same orange and every Codex agent the same blue. The colour is now the
 *  agent's own: its slug's hash, nudged to the next free colour when another agent on the roster already has it - so the roster is as varied as the palette allows. The same roster always gets the same colours
 *  (assignment walks the slugs in sorted order), but a colour is NOT stable across rosters: when two slugs hash to one colour the later one in sorted order is nudged, so adding or removing an agent
 *  can recolour the neighbour it collided with (corrected 2026-10-01: this comment used to promise an agent keeps its colour while the others change). Pure over the slugs - tested. */
export function assignColors(slugs: string[]): Record<string, string> {
  const out: Record<string, string> = {}; const used = new Set<number>();
  const mainAt = PALETTE.indexOf(MAIN_COLOR as typeof PALETTE[number]);
  if (slugs.includes(MAIN_SLUG)) { out[MAIN_SLUG] = MAIN_COLOR; used.add(mainAt); }
  for (const slug of [...new Set(slugs)].sort()) {
    if (slug === MAIN_SLUG) continue;
    let i = (hashOf(slug) >>> 3) % PALETTE.length, tries = 0;
    while (used.has(i) && tries < PALETTE.length) { i = (i + 1) % PALETTE.length; tries++; }
    used.add(i); if (used.size >= PALETTE.length) used.clear();   // a roster bigger than the palette starts a second lap
    out[slug] = PALETTE[i];
  }
  return out;
}
let ROSTER_COLORS: Record<string, string> = {};
/** Tell the faces who is on the roster right now (the roster screens call this on every render; it is idempotent - the same slugs give the same map - but it does write a module variable during render,
 *  which the faces read back through `agentColor`; moving that to a context is the clean fix and touches every roster screen, so it is not done here). */
export function assignAgentColors(slugs: string[]): void { ROSTER_COLORS = assignColors(slugs); }
/** EACH FORK ITS OWN COLOUR (operator 2026-10-09: "the new agent avatar should be a new colour, all agents avatars use the same colour"). A fork keeps its parent's SHAPE (it is the same agent again) but never
 *  its colour: each fork id takes its hash colour, nudged past the parent's and the earlier siblings' so two tabs of one agent are never the same colour. Pure - tested. */
export function assignForkColors(parentColor: string, forkIds: number[]): Record<number, string> {
  const used = new Set<string>([parentColor]); const out: Record<number, string> = {};
  for (const id of [...forkIds].sort((a, b) => a - b)) {
    let i = (hashOf(`fork-${id}`) >>> 3) % PALETTE.length, tries = 0;
    while (used.has(PALETTE[i]) && tries < PALETTE.length) { i = (i + 1) % PALETTE.length; tries++; }
    out[id] = PALETTE[i]; used.add(PALETTE[i]); if (used.size >= PALETTE.length) { used.clear(); used.add(parentColor); }
  }
  return out;
}
/** the colour an agent's face wears: the roster's assignment, else its slug's own hash colour. */
export function agentColor(slug: string): string { return ROSTER_COLORS[slug] ?? colorOf(slug); }

/** the outline of each shape in a 40×40 box, rounded like the reference. Pure. */
export function pathOf(shape: Shape): string {
  switch (shape) {
    case "circle": return "M20 3a17 17 0 1 1 0 34a17 17 0 1 1 0-34z";
    case "egg": return "M20 3c8 0 15 9 15 19s-6 15-15 15S5 32 5 22 12 3 20 3z";
    case "square": return "M12 4h16a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8H12a8 8 0 0 1-8-8V12a8 8 0 0 1 8-8z";
    case "hex": return "M17 3.7l14 8.1a3 3 0 0 1 1.5 2.6v11.2a3 3 0 0 1-1.5 2.6l-14 8.1a3 3 0 0 1-3 0L6 28.2a3 3 0 0 1-1.5-2.6V14.4A3 3 0 0 1 6 11.8l8-4.1a3 3 0 0 1 3 0z";
    case "drop": return "M20 3c7 9 14 15 14 22a14 14 0 0 1-28 0c0-7 7-13 14-22z";
    case "arch": return "M20 4c8 0 14 6 14 14v16a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V18C6 10 12 4 20 4z";
    default: return "M18.3 5.4a2 2 0 0 1 3.4 0l13.6 23.4a2 2 0 0 1-1.7 3H6.4a2 2 0 0 1-1.7-3z";
  }
}

/** A FACE AS AN ICON (operator 2026-09-23: "on add agent the icons should be the avatars and colours to combine"): a
 *  recipe's `icon` may be `face:<shape>:<colour>` instead of an emoji — the chosen shape and colour are then its face. Pure. */
export const FACE_ICON = "face:";
export function faceIcon(shape: Shape, color: string): string { return `${FACE_ICON}${shape}:${color}`; }
export function parseFaceIcon(icon: string | null | undefined): { shape: Shape; color: string } | null {
  const t = String(icon ?? ""); if (!t.startsWith(FACE_ICON)) return null;
  const [shape, color] = t.slice(FACE_ICON.length).split(":");
  return (SHAPES as readonly string[]).includes(shape) && /^#[0-9a-fA-F]{3,8}$/.test(color ?? "") ? { shape: shape as Shape, color } : null;
}
export function isFaceIcon(icon: string | null | undefined): boolean { return parseFaceIcon(icon) !== null; }
/** the emoji badge of an icon — none when the icon is a face (the face is the icon). A MALFORMED face spec is still
 *  a face spec: it used to fail `isFaceIcon` and get printed as text, so agent rows wore the word "face". Pure. */
export function badgeOf(icon: string | null | undefined): string | undefined {
  const t = String(icon ?? "");
  // "face", "face:", "face:egg:#7c5cf0" — all of them are a face, none of them is a badge. Rows stored before the
  // serve stopped truncating the spec to four characters still hold the bare word.
  return !t || t.startsWith("face") ? undefined : t;
}

export function ChibiFace({ slug, mood = "idle", size = 30, color, shape: shapeIn, title }: { slug: string; mood?: Mood; size?: number; color?: string; /** a chosen shape (a face icon) — else the slug's */ shape?: Shape; title?: string }) {
  const shape = shapeIn ?? shapeOf(slug); const h = hashOf(slug);
  const fill = color ?? colorOf(slug);
  const tilt = ((h >>> 5) % 25) - 12;                 // −12…12°, each agent its own lean
  const blinkPeriod = 3.4 + (h % 7) * 0.5;            // 3.4–6.4 s
  const blinkDelay = (h % 11) * 0.31;
  const floatPeriod = mood === "working" ? 1.4 : mood === "idle" ? 6.5 : 4.2;
  const tall = mood === "needs"; const sleepy = mood === "failed";
  const eyeH = sleepy ? 1.1 : tall ? 7 : 5.2; const eyeW = sleepy ? 3.4 : 2.1;
  const eyesAnim = mood === "working" ? "antilokiFaceScan 1.5s ease-in-out infinite" : mood === "idle" ? "antilokiFaceGlance 8s ease-in-out infinite" : "none";
  const bodyAnim = mood === "needs" ? `antilokiFaceNudge 2.4s ease-in-out infinite` : mood === "failed" ? "none" : `antilokiFaceFloat ${floatPeriod}s ease-in-out infinite`;
  return (
    <span data-testid={`chibi-${slug}`} data-shape={shape} data-mood={mood} title={title} style={{ display: "inline-block", width: size, height: size, lineHeight: 0, flex: `0 0 ${size}px` }}>
      <style>{`@keyframes antilokiFaceBlink{0%,93%,100%{transform:scaleY(1)}96.5%{transform:scaleY(.12)}}@keyframes antilokiFaceScan{0%,100%{transform:translateX(-1.6px)}50%{transform:translateX(1.6px)}}@keyframes antilokiFaceGlance{0%,84%,100%{transform:translateX(0)}88%{transform:translateX(1.8px)}95%{transform:translateX(-1.4px)}}@keyframes antilokiFaceFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}@keyframes antilokiFaceNudge{0%,88%,100%{transform:rotate(0)}91%{transform:rotate(-6deg)}96%{transform:rotate(5deg)}}@media(prefers-reduced-motion:reduce){.antiloki-face *{animation:none!important}.antiloki-face .eye{animation:antilokiFaceBlink 6s ease-in-out infinite!important}}`}</style>
      <svg className="antiloki-face" viewBox="0 0 40 40" width={size} height={size} aria-hidden style={{ overflow: "visible" }}>
        <g style={{ transformOrigin: "20px 21px", transform: `rotate(${tilt}deg)${sleepy ? " translateY(1.5px) scale(1, .94)" : ""}` }}>
          <g style={{ transformOrigin: "20px 21px", animation: bodyAnim }}>
            <path d={pathOf(shape)} fill={fill} />
            {/* the eyes: two white slits, high and close, blinking on their own rhythm; they look by sliding together */}
            <g style={{ transformOrigin: "20px 17px", animation: eyesAnim }}>
              {[16.6, 23.4].map((cx, i) => (
                <rect key={i} className="eye" x={cx - eyeW / 2} y={17 - eyeH / 2 + (shape === "triangle" ? 5 : shape === "drop" ? 4 : 0)} width={eyeW} height={eyeH} rx={Math.min(eyeW, eyeH) / 2} fill="#fff"
                  style={{ transformOrigin: `${cx}px ${17 + (shape === "triangle" ? 5 : shape === "drop" ? 4 : 0)}px`, animation: sleepy ? "none" : `antilokiFaceBlink ${blinkPeriod}s ease-in-out ${blinkDelay}s infinite` }} />
              ))}
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}

/** THE STAMP at a face's corner — a small circle with the job's two-letter code, like a job id (operator 2026-09-23:
 *  "make the stamp more discrete, small, a circle icon like a job ID"); the full job name is its title. Pure. */
export function FaceStamp({ text, title, testId }: { text: string; title?: string; testId?: string }) {
  return <span data-testid={testId} title={title} style={{ position: "absolute", right: -4, bottom: -3, width: 13, height: 13, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace', fontSize: 6, fontWeight: 700, letterSpacing: .3, color: "#e0a04a", background: "rgba(20,18,16,.95)", border: "1px solid #e0a04a", lineHeight: 1, pointerEvents: "none" }}>{text}</span>;
}
