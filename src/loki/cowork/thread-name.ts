/** The name a thread made from the keyboard gets: "thread N", the first number not in use. Pure. */
export function nextThreadName(taken: string[]): string { const used = new Set(taken.map((t) => t.trim().toLowerCase())); let n = taken.length + 1; while (used.has(`thread ${n}`)) n++; return `thread ${n}`; }
