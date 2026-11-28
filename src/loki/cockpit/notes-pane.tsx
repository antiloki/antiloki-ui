// THE NOTES PANE (operator 2026-07-12: "a notes pane, to annotate something"; then 2026-10-11: "notes make a single note editable the entire pane, simple, minimalist, no save button, saves automatically, just write";
// then "the styling through markdown is not working, it should be live like obsidian does on its notes": the page is a live markdown editor, see live-markdown.tsx).
// ONE note fills the pane. It is a single blackboard entry (kind 'note', pane_id = this pane) that is written a moment after the last keystroke, when the box loses focus and when the pane goes away, so there is nothing to press.
// Notes an older version of this pane made (several, one per entry) are shown together as one text and folded into the first the first time the text is saved: nothing is lost and nothing is asked.
import * as React from "react";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import { C } from "@/loki/theme";
import { LiveMarkdown, type LiveMarkdownHandle } from "./live-markdown";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
/** how long after the last keystroke the text is saved */
export const NOTES_SAVE_MS = 700;
const RETRY_MS = 3000;

/** The single note's starting text: every note the pane already holds, oldest first, as paragraphs; the first one's id is the note that is kept and the others are to be folded into it. Pure - tested. */
export function mergeNotes(notes: Array<{ id: number; body_md?: string }>): { text: string; id: number | null; extra: number[] } {
  const sorted = [...notes].sort((a, b) => a.id - b.id);
  return { text: sorted.map((n) => String(n.body_md ?? "").trimEnd()).filter((t) => t.length > 0).join("\n\n"), id: sorted[0]?.id ?? null, extra: sorted.slice(1).map((n) => n.id) };
}

const POST = "/api/v1/cockpit/blackboard/post", READ = "/api/v1/cockpit/blackboard/read";

export function NotesPane({ sessionId, paneId, onChanged, saveMs = NOTES_SAVE_MS, focused = false }: { sessionId: number; paneId: number; onChanged?: () => void; saveMs?: number; /** the pane has the focus (a hover gives it): the caret goes into the page at once, no click needed (the operator 2026-11-18) */ focused?: boolean }) {
  const editor = React.useRef<LiveMarkdownHandle | null>(null);
  const [text, setText] = React.useState("");
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const idRef = React.useRef<number | null>(null);            // the note that holds the text on the server, if there is one yet
  const extraRef = React.useRef<number[]>([]);                // older notes still to be folded into it
  const savedRef = React.useRef<string | null>(null);         // the text the server holds in that note (null = not known to match, so the first save writes)
  const textRef = React.useRef("");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = React.useRef<Promise<void>>(Promise.resolve());   // saves run one after another, so a note is never created twice
  const onChangedRef = React.useRef(onChanged); onChangedRef.current = onChanged;

  const readNotes = React.useCallback(async () => {
    const d: any = unwrap(await apiPost(READ, { session_id: sessionId, pane_id: paneId }, { timeoutMs: 20000 }));
    return ((d?.scratch ?? []) as any[]).filter((n) => n.kind === "note");
  }, [sessionId, paneId]);

  React.useEffect(() => {
    let alive = true; setReady(false);
    void (async () => {
      let notes: any[] = [];
      try { notes = await readNotes(); } catch { /* an empty note to start with; the first save will say if the server is unreachable */ }
      if (!alive) return;
      const m = mergeNotes(notes);
      idRef.current = m.id; extraRef.current = m.extra;
      savedRef.current = m.extra.length ? null : m.text;      // folded older notes mean the merged text is not what the server holds yet
      textRef.current = m.text; setText(m.text); setReady(true);
    })();
    return () => { alive = false; };
  }, [readNotes]);

  const save = React.useCallback((): Promise<void> => {
    chain.current = chain.current.then(async () => {
      const t = textRef.current;
      if (t === savedRef.current) return;
      try {
        let ok = true;
        if (!t.trim()) {
          if (idRef.current != null) { ok = (await apiPost(POST, { op: "delete", id: idRef.current }, { timeoutMs: 20000 })) != null; if (ok) idRef.current = null; }
        } else if (idRef.current != null) {
          ok = (await apiPost(POST, { op: "update", id: idRef.current, body_md: t }, { timeoutMs: 20000 })) != null;
        } else {
          ok = (await apiPost(POST, { session_id: sessionId, pane_id: paneId, kind: "note", body_md: t }, { timeoutMs: 20000 })) != null;
          if (ok) { const notes = await readNotes(); idRef.current = notes.length ? Math.max(...notes.map((n) => Number(n.id))) : null; }
        }
        if (ok) { for (const id of extraRef.current) await apiPost(POST, { op: "delete", id }, { timeoutMs: 20000 }); extraRef.current = []; }
        if (!ok) throw new Error("not saved");
        savedRef.current = t; setFailed(false); onChangedRef.current?.();
      } catch {
        setFailed(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { void save(); }, RETRY_MS);   // keeps trying: what was typed is never dropped
      }
    });
    return chain.current;
  }, [sessionId, paneId, readNotes]);

  const change = (v: string) => {
    textRef.current = v;   // the editor owns the text while it is open; `text` is only what it was opened with
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, saveMs);
  };
  const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } void save(); };
  // the pane going away saves what is pending
  React.useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } void save(); }, [save]);

  React.useEffect(() => { if (focused && ready) editor.current?.focus(); else if (!focused) editor.current?.blur(); }, [focused, ready]);   // the caret follows the pointer: in when it arrives, out when it leaves
  return (
    <div data-testid="notes-page" onMouseLeave={() => editor.current?.blur()} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      {ready
        ? <LiveMarkdown ref={editor} testId="note-page" initial={text} placeholderText="just write…" onChange={change} onBlur={flush} />
        : <span style={{ padding: "16px 14px", color: C.muted, fontFamily: mono, fontSize: 11 }}>…</span>}
      {failed && <span data-testid="note-unsaved" role="status" style={{ position: "absolute", right: 10, bottom: 6, fontFamily: mono, fontSize: 9, color: C.warn }}>not saved yet - trying again</span>}
    </div>
  );
}
