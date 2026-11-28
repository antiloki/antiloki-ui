// A SMALL SYNTAX COLOURING for the Editor view's replay (the real, editable file uses CodeMirror): comments, strings, keywords and numbers of the C-like and script languages, per line. Pure, escapes everything it prints.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const RE = /(\/\/.*$|#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|const|let|var|return|function|async|await|if|else|for|while|new|class|def|fn|pub|use|struct|impl|match|true|false|null)\b|\b(\d+(?:\.\d+)?)\b/g;
/** One line as HTML with spans `k` (keyword), `s` (string), `c` (comment), `n` (number). Pure. */
export function highlightLine(line: string): string {
  let out = ""; let last = 0; RE.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = RE.exec(line))) { out += esc(line.slice(last, m.index)); const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : "n"; out += `<span class="${cls}">${esc(m[0])}</span>`; last = m.index + m[0].length; if (m[0].length === 0) RE.lastIndex++; }
  return out + esc(line.slice(last));
}
