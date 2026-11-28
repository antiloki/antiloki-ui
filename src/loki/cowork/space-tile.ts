// A SPACE'S MONOGRAM TILE (operator 2026-11-10, from the mockup: "monogram tiles spaces approved"): the space's first letter on a gradient that is its own, fixed by its name, so a space is recognised by its tile. Pure.
import { PALETTE, hashOf } from "@/loki/chat/chibi-face";

/** The letter on the tile: the first letter or digit of the name, upper case; "·" for a name with none. */
export function initialOf(name: string): string { const m = /[\p{L}\p{N}]/u.exec(name.trim()); return m ? m[0].toUpperCase() : "·"; }
/** The space's own colour, fixed by its name (case and spaces do not matter). */
export function tileColor(name: string): string { return PALETTE[(hashOf(name.trim().toLowerCase()) >>> 3) % PALETTE.length]; }
/** THE GLASS (operator 2026-11-10: "dont make 3D, make semi transparent glass"): a flat, see-through tile tinted with the space's colour, a fine edge of it, the letter in a lighter tone of it; no gradient, no shadow. The open space is a little
 *  more filled and its edge stronger. Pure. */
export function glassStyle(name: string, active: boolean): { background: string; border: string; color: string; backdropFilter: string; WebkitBackdropFilter: string } {
  const c = tileColor(name);
  return { background: `color-mix(in srgb, ${c} ${active ? 34 : 20}%, transparent)`, border: `1px solid color-mix(in srgb, ${c} ${active ? 85 : 50}%, transparent)`, color: `color-mix(in srgb, ${c} 45%, #fff)`, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" };
}
