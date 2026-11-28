// A MENU ON THE AGENT'S TERMINAL (a permission question, "do you trust this folder", the list a bare `/model` opens), read from the screen so the chat can show it as buttons (operator 2026-11-26:
// "those permissions, trust menu and / menu that appear on terminal mode should also be on chat mode for all providers"). Read-only and pure: a choice is answered with the keys the person would press.
export type TermMenu = { title: string[]; options: string[]; selected: number; /** the choices lie side by side: left / right move between them */ horizontal?: boolean; /** chosen by typing its name into the list's own search */ search?: boolean; /** each choice has a key of its own: that key answers it */ keys?: string[] };

/** OpenCode's permission box: `Allow once   Always allow   Reject      (arrows) select  enter confirm`. The highlight is a colour, so it is taken to be on the first, where the box opens (the arrows wrap, so it cannot be reset). */
function sideBySide(lines: string[], from: number): TermMenu | null {
  for (let i = lines.length - 1; i >= Math.max(from, lines.length - 8); i--) {
    const at = lines[i].search(/(\u21c6|\u21c4|\u2190\/\u2192|\u2190\u2192)\s*select/i); if (at < 0) continue;
    let row = i; let text = lines[i].slice(0, at).replace(/\s*ctrl\+\w+\s+\w+\s*$/i, "");
    const strip = (t: string) => t.replace(/^\s*[│┃|]/, "").trim();
    while (!strip(text) && row > from) text = lines[--row];   // a narrow pane puts the keys under the choices
    const options = strip(text).split(/\s{2,}/).filter(Boolean);
    if (options.length >= 2 && options.every((o) => o.length <= 40)) {
      const above = titleAbove(lines, row, 8); const asked = above.findIndex((l) => /permission required/i.test(l));   // the conversation and the side panel above the box are not part of the question
      return { title: above.slice(Math.max(asked, 0)), options, selected: 0, horizontal: true };
    }
  }
  return null;
}
/** OpenCode's model list (`/models`, 2.4.2): the highlight is a colour, so a choice is made by typing its name into the list's search and pressing Enter. The group headings are not choices. */
const HEADINGS = /^(free|recent|favorites|popular|ollama|opencode zen|opencode go)$/i;
function searchList(lines: string[], from: number): TermMenu | null {
  for (let i = lines.length - 1; i >= from; i--) {
    const head = /^(.*?)(Search models)\s+esc\b/.exec(lines[i]); if (!head) continue;
    const col = head[1].length; const end = head[0].length + 2; const options: string[] = []; let selected = 0;
    for (let j = i + 1; j < lines.length; j++) {
      if (/connect (integration|provider)|favorite ctrl/i.test(lines[j])) return options.length ? { title: ["Switch model"], options, selected, search: true } : null;
      const name = lines[j].slice(col, end).trim(); if (!name || HEADINGS.test(name)) continue;
      if (/[▪●]\s*$/.test(lines[j].slice(0, col))) selected = options.length;
      options.push(name);
    }
    return null;   // the list's foot is not on screen: it is not open any more
  }
  return null;
}
/** Cursor's model list: `Available models`, the cursor `→`, then "1-10 of 48": chosen with the arrows (its filter ignores typed names). */
function cursorModels(lines: string[], from: number): TermMenu | null {
  for (let i = lines.length - 1; i >= from; i--) {
    const foot = /^\s*(\d+-\d+ of \d+)\s*$/.exec(lines[i]); if (!foot) continue;
    let a = i - 1; while (a >= from && !/^\s*Filter:/.test(lines[a])) a--; if (a < from) return null;
    const options: string[] = []; let selected = -1;
    for (let k = a + 1; k < i; k++) { const t = lines[k].trim(); if (!t) continue; if (t.startsWith("→")) selected = options.length; options.push(t.replace(/^→\s*/, "").replace(/\s*\(Tab to modify\)/i, "").replace(/\s{2,}/g, " · ")); }
    return options.length && selected >= 0 ? { title: [`Switch model (${foot[1]})`], options, selected } : null;
  }
  return null;
}
/** Cursor's style: one choice per line, each ending in its key — `Run (once) (y)`, `Add Shell(pwd) to allowlist? (tab)`, `Run Everything (shift+tab)`, `Skip (esc or n)`. */
const NAMED: Record<string, string> = { tab: "\t", "shift+tab": "\x1b[Z" };
function keyed(lines: string[], from: number): TermMenu | null {
  const KEY = /^\s*[│┃|]?\s*(?:[>❯›▶●→]\s*)?(\S.*?)\s*\((?:esc or )?([a-z]|tab|shift\+tab)\)\s*[│┃|]?$/i;
  for (let i = lines.length - 1; i >= Math.max(from, lines.length - 12); i--) {
    if (!KEY.test(lines[i])) continue;
    let a = i; while (a - 1 >= from && KEY.test(lines[a - 1])) a--;
    const found = lines.slice(a, i + 1).map((l) => KEY.exec(l)!);
    if (found.length < 2 || !found.some((m) => m[2].length === 1)) return null;   // a question has at least one letter to press
    return { title: titleAbove(lines, a), options: found.map((m) => m[1].trim()), selected: 0, keys: found.map((m) => NAMED[m[2].toLowerCase()] ?? m[2].toLowerCase()) };
  }
  return null;
}

const MARK = /^\s*[│┃|]?\s*([>❯›▶●→])\s+(\S.*)$/;
const NUMBERED = /^\s*[│┃|]?\s*(?:([>❯›▶●→])\s*)?(\d{1,2})[.)]\s+(\S.*)$/;
/** words a menu prints under or over its list */
const HINT = /(↑|↓|enter|esc|tab)\b.*(navigate|select|confirm|cancel|amend|close)|(navigate|esc to|enter to|use arrow)/i;
const tidy = (s: string) => s.replace(/[│┃|]\s*$/, "").trim();

/** The menu that is on the screen now, or null. Only the lower part of the screen counts: an answered menu scrolls away. */
export function parseTermMenu(rows: string[]): TermMenu | null {
  const lines = rows.map((r) => r.replace(/\s+$/, ""));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const from = Math.max(0, lines.length - 40);
  const other = cursorModels(lines, from) ?? searchList(lines, from) ?? sideBySide(lines, from) ?? keyed(lines, from); if (other) return other;
  // numbered choices: consecutive numbers from 1, one of them carrying the cursor
  for (let i = lines.length - 1; i >= from; i--) {
    const first = NUMBERED.exec(lines[i]); if (!first || first[2] !== "1") continue;
    const options: string[] = []; let selected = -1; let j = i;
    for (; j < lines.length; j++) {
      const m = NUMBERED.exec(lines[j]);
      if (m && Number(m[2]) === options.length + 1) { if (m[1]) selected = options.length; options.push(tidy(m[3])); }
      else if (!lines[j].trim() || HINT.test(lines[j]) || options.length === 0) break;
      // a long choice wraps onto the next line(s): it is one choice when the next number (or the menu's key line) still follows
      else if (lines.slice(j + 1, j + 4).some((l) => Number(NUMBERED.exec(l)?.[2]) === options.length + 1) || lines.slice(j + 1, j + 4).some((l) => HINT.test(l))) options[options.length - 1] = `${options[options.length - 1]} ${tidy(lines[j])}`;
      else if (!/^\s{4,}/.test(lines[j])) break;
    }
    if (options.length >= 2 && selected >= 0) return { title: titleAbove(lines, i), options, selected };
  }
  // an arrow list without numbers: trusted only when the screen says how to move in it
  const tail = lines.slice(-14);
  // (Claude's "trust this folder" question has no numbers and its foot names no arrows: "Enter to confirm · Esc to cancel", read from the real screen 2026-11-27)
  if (!tail.some((l) => (HINT.test(l) && /↑|↓|navigate|arrow/i.test(l)) || /^\s*enter to confirm\s*·\s*esc to cancel\s*$/i.test(l))) return null;
  for (let i = lines.length - 1; i >= from; i--) {
    const m = MARK.exec(lines[i]); if (!m) continue;
    const indent = lines[i].indexOf(m[2]);
    const peer = (l: string) => !!l.trim() && !HINT.test(l) && l.length > indent && l.slice(0, indent).trim().replace(/[│┃|]/g, "") === "" && l[indent] !== " ";
    let a = i; while (a - 1 >= from && peer(lines[a - 1])) a--;
    let b = i; while (b + 1 < lines.length && peer(lines[b + 1])) b++;
    const options = []; for (let k = a; k <= b; k++) options.push(tidy(k === i ? m[2] : lines[k]));
    // a trust question shows all of itself: which folder, and what is being asked
    if (options.length >= 2) return { title: titleAbove(lines, a, options.some((o) => /i trust this folder/i.test(o)) ? 10 : 4), options, selected: i - a };
  }
  return null;
}
function titleAbove(lines: string[], at: number, most = 4): string[] {
  const out: string[] = [];
  for (let i = at - 1; i >= 0 && out.length < most; i--) { const t = tidy(lines[i].replace(/^\s*[│┃|]/, "")); if (/^[─━═╭╮╰╯┌┐└┘-]{6,}/.test(t)) break; if (t) out.unshift(t); else if (out.length >= (most > 4 ? most : 2)) break; }
  return out;
}
/** The keys that choose option `to` from the cursor's place: arrows, then Enter. */
export function menuKeys(menu: TermMenu, to: number): string[] {
  if (menu.keys) return [menu.keys[to]];
  if (menu.search) return [menu.options[to], "\r"];
  const d = to - menu.selected; const [next, back] = menu.horizontal ? ["\x1b[C", "\x1b[D"] : ["\x1b[B", "\x1b[A"];
  return [...Array(Math.abs(d)).fill(d > 0 ? next : back), "\r"];
}
