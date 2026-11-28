// Path + file-extension colouring, kept as a LEAF module (no React, no panels).
// atlas-graph owned these, but it also imports atlas-decorators — so anything that
// wanted a file's colour dragged 4k lines of decorator UI with it. Lives alone now.
export const baseName = (p: string) => { const a = String(p).split(/[/\\]/).filter(Boolean); return a[a.length - 1] || String(p); };
export const extOf = (p: string) => { const b = baseName(p); const i = b.lastIndexOf("."); return i > 0 ? b.slice(i + 1).toLowerCase() : ""; };

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Base LANGUAGE → oklch [L, C, H]. Different languages = different hues. Modifiers below shift the
// TONALITY for react files (jsx/tsx) and test files, so even a single-language repo reads with
// variation instead of one flat colour.
const LANG_COLOR: Record<string, [number, number, number]> = {
  ts: [0.70, 0.15, 250], js: [0.82, 0.16, 92], py: [0.74, 0.15, 150], go: [0.80, 0.13, 205],
  rs: [0.68, 0.17, 40], java: [0.70, 0.15, 28], rb: [0.64, 0.19, 18], php: [0.64, 0.14, 292],
  cs: [0.68, 0.16, 312], c: [0.74, 0.10, 240], cpp: [0.74, 0.12, 262], json: [0.78, 0.13, 82],
  md: [0.72, 0.05, 250], css: [0.74, 0.16, 330], scss: [0.72, 0.16, 332], html: [0.74, 0.15, 40],
  sh: [0.70, 0.10, 142], lua: [0.66, 0.14, 262], ex: [0.70, 0.16, 300], yaml: [0.72, 0.11, 60], sql: [0.72, 0.13, 180],
  swift: [0.76, 0.17, 45], scala: [0.62, 0.18, 20], kt: [0.72, 0.16, 285],
};
const EXT_LANG: Record<string, string> = {
  ts: "ts", mts: "ts", cts: "ts", tsx: "ts", js: "js", mjs: "js", cjs: "js", jsx: "js",
  py: "py", go: "go", rs: "rs", java: "java", kt: "kt", kts: "kt", rb: "rb", php: "php", cs: "cs",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp", hh: "cpp", cxx: "cpp", json: "json", jsonc: "json",
  swift: "swift", scala: "scala",
  md: "md", mdx: "md", css: "css", less: "css", scss: "scss", sass: "scss", html: "html", htm: "html",
  sh: "sh", bash: "sh", zsh: "sh", lua: "lua", ex: "ex", exs: "ex", yaml: "yaml", yml: "yaml", sql: "sql",
};
export const isReactExt = (ext: string) => ext === "jsx" || ext === "tsx";
export const isTestPath = (p: string) => {
  const s = String(p || "").replace(/\\/g, "/");
  return /\.(test|spec)\.[a-z]+$/i.test(baseName(s)) || /(^|\/)(__tests__|tests?|__mocks__)\//i.test(s);
};
export const extColor = (p: string) => {
  const ext = extOf(p);
  const lang = EXT_LANG[ext];
  if (!lang || !LANG_COLOR[lang]) return "oklch(0.62 0.03 250)";
  let [l, c, h] = LANG_COLOR[lang];
  // react (jsx/tsx): distinctly lighter + a hue nudge so it never reads as plain js/ts.
  if (isReactExt(ext)) { l = clamp(l + 0.07, 0, 0.97); c = clamp(c + 0.02, 0, 0.4); h = (h + 18) % 360; }
  // test files: muted — desaturated + lightened so they recede as secondary.
  if (isTestPath(p)) { c = c * 0.4; l = clamp(l + 0.08, 0, 0.97); }
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`;
};
