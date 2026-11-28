// THE BOOK (RFC 0018): the laws that judge what a team makes (code, copy, reports, plans, tables, pages, images). The Leader proposes laws as candidates, the engine tests them against their own examples, and only a person ratifies: this is where.
// Everything shown is deterministic: no model reads a file here.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { teamOp } from "./api";

type LawRow = { key: string; title: string; domain: string; axis: string; detector: string; severity: string; weight: number; status: string; version: number; kinds: string[]; rule: string; fix: string; examples: { pass: number; fail: number }; created_by: string };
type PackRow = { id: string; name: string; description: string; axes: string[]; kinds: string[]; paths: string[]; origin: string; laws: LawRow[] };
type Tested = { passed: boolean; compiles: boolean; why: string; examples: { name: string; passed: boolean; hits: number; expect: string; error: string }[] };
const SEV: Record<string, string> = { info: "var(--c-dim)", warn: "var(--c-warn)", error: "var(--c-bad)", critical: "var(--c-bad)" };

export function BookView() {
  const [packs, setPacks] = React.useState<PackRow[] | null>(null); const [problems, setProblems] = React.useState<string[]>([]); const [open, setOpen] = React.useState<string | null>(null); const [tested, setTested] = React.useState<Record<string, Tested>>({}); const [msg, setMsg] = React.useState<{ text: string; bad?: boolean } | null>(null); const [busy, setBusy] = React.useState("");
  const load = React.useCallback(async () => { const r: any = await teamOp("book_list"); if (r?.ok) { setPacks(r.packs ?? []); setProblems(r.problems ?? []); } else setPacks([]); }, []);
  React.useEffect(() => { void load(); }, [load]);
  const id = (p: string, k: string) => `${p}/${k}`;
  const test = async (p: string, k: string) => { setBusy(id(p, k)); const r: any = await teamOp("book_test", { pack: p, key: k }); setBusy(""); if (r?.ok) setTested((t) => ({ ...t, [id(p, k)]: r as Tested })); else setMsg({ text: String(r?.error ?? "could not test"), bad: true }); };
  const act = async (op: "book_ratify" | "book_suspend", p: string, k: string, on?: boolean) => { setBusy(id(p, k)); const r: any = await teamOp(op, { pack: p, key: k, ...(on === undefined ? {} : { on }) }); setBusy(""); if (r?.ok) { setMsg({ text: op === "book_ratify" ? `${k} is ratified: it now gates` : on ? `${k} is suspended` : `${k} is back` }); await load(); } else setMsg({ text: String(r?.error ?? "not done"), bad: true }); };
  if (packs === null) return <div data-testid="book-loading" style={{ padding: 18, color: C.dim, fontFamily: nav }}>reading the book…</div>;
  const rows = packs.flatMap((p) => p.laws.map((l) => ({ p, l }))); const rank = (st: string) => (st === "candidate" ? 0 : st === "ratified" ? 1 : 2);
  const sorted = [...rows].sort((x, y) => rank(x.l.status) - rank(y.l.status) || (x.l.created_by === "seed" ? 1 : 0) - (y.l.created_by === "seed" ? 1 : 0) || x.p.id.localeCompare(y.p.id) || x.l.key.localeCompare(y.l.key));
  const cand = rows.filter((r) => r.l.status === "candidate").length;
  return (
    <div data-testid="book-view" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "10px 18px 30px", fontFamily: nav, color: C.fg, fontSize: 12.5 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0 4px", color: C.muted }}><b style={{ color: C.fg, fontSize: 14 }}>The book</b><span>{rows.length} laws{cand ? ` · ${cand} written by the Leader, waiting for you` : ""}</span></div>
      <div style={{ color: C.dim, marginBottom: 10, maxWidth: "80ch" }}>The Leader writes the laws for the work; each is run against its own examples; <b>you</b> ratify, and only a ratified law gates a run. No model reads a file here.</div>
      {msg && <div role="status" style={{ padding: "5px 10px", marginBottom: 8, borderRadius: 8, border: `1px solid ${msg.bad ? "var(--c-bad)" : C.border}`, color: msg.bad ? "var(--c-bad)" : C.muted }}>{msg.text}</div>}
      {problems.map((p) => <div key={p} style={{ color: "var(--c-bad)", marginBottom: 6 }}>a book file did not load: {p}</div>)}
      {rows.length === 0 && <div style={{ color: C.dim }}>No law yet. Ask the Leader to write the laws for this work.</div>}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        {sorted.map(({ p, l }, i) => { const k = id(p.id, l.key); const t = tested[k]; const ready = l.examples.pass > 0 && l.examples.fail > 0; const isOpen = open === k;
          return (
            <div key={k} data-testid={`book-law-${l.key}`} style={{ borderTop: i ? `1px solid ${C.border}` : undefined, padding: "6px 12px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k)} style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", font: "inherit", textAlign: "left", flex: 1, minWidth: 200 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: SEV[l.severity] ?? C.dim, display: "inline-block", marginRight: 8 }} />{l.title}<span style={{ color: C.dim, fontSize: 11, marginLeft: 8 }}>{p.id}</span></button>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{l.detector} · {l.severity}</span>
                <span data-testid={`book-status-${l.key}`} style={{ fontSize: 11, padding: "0 8px", borderRadius: 999, border: `1px solid ${l.status === "ratified" ? "var(--c-ok)" : l.status === "candidate" ? "var(--c-warn)" : C.border}`, color: l.status === "ratified" ? "var(--c-ok)" : l.status === "candidate" ? "var(--c-warn)" : C.dim }}>{l.status}</span>
                <span style={{ fontSize: 11, color: ready ? C.dim : "var(--c-bad)" }} title="examples that prove the law: passing / failing">{l.examples.pass}✓ {l.examples.fail}✗</span>
                <button className="bk" disabled={busy === k} onClick={() => void test(p.id, l.key)} style={btn()}>Test</button>
                {l.status === "candidate" && <button className="bk" data-testid={`book-ratify-${l.key}`} disabled={busy === k || !ready} title={ready ? "Ratify: this law will gate runs" : "A law needs a passing and a failing example before it can be ratified"} onClick={() => void act("book_ratify", p.id, l.key)} style={btn(true)}>Ratify</button>}
                {l.status === "ratified" && <button className="bk" disabled={busy === k} title="Stop this law from running" onClick={() => void act("book_suspend", p.id, l.key, true)} style={btn()}>Suspend</button>}
                {l.status === "suspended" && <button className="bk" disabled={busy === k} title="Run this law again (its examples are checked first)" onClick={() => void act("book_suspend", p.id, l.key, false)} style={btn()}>Resume</button>}
              </div>
              {isOpen && <div style={{ padding: "6px 0 2px 15px", color: C.muted }}>{l.rule && <div>{l.rule}</div>}{l.fix && <div>fix: {l.fix}</div>}<div style={{ color: C.dim }}>axis {l.axis || l.domain || "—"} · weight {l.weight} · v{l.version}{l.created_by ? ` · by ${l.created_by}` : ""}</div></div>}
              {t && <div data-testid={`book-tested-${l.key}`} style={{ padding: "4px 0 2px 15px", fontSize: 11.5, color: t.passed ? "var(--c-ok)" : "var(--c-bad)" }}>{t.passed ? "all examples agree" : t.why || "an example disagrees"}{!t.compiles ? " · does not compile" : ""}{(t.examples ?? []).filter((e) => !e.passed).map((e) => <div key={e.name}>{e.name}: {e.error || `${e.hits} hit(s), wanted ${e.expect}`}</div>)}</div>}
            </div>); })}
      </div>
    </div>);
}
const btn = (primary?: boolean): React.CSSProperties => ({ border: `1px solid ${primary ? "var(--c-brand)" : C.border}`, background: primary ? "color-mix(in srgb, var(--c-brand) 18%, transparent)" : "transparent", color: C.fg, borderRadius: 7, padding: "1px 10px", font: "inherit", fontSize: 11.5, cursor: "pointer" });

type Finding = { law: string; severity: string; advisory?: boolean; path: string; line: number; message: string; fix: string; pack: string };
/** The findings of the book on a run's folder, live while the agents write (the panel's Findings tab). */
export function useRunFindings(run: string, live: boolean) {
  const [rep, setRep] = React.useState<any>(null);
  React.useEffect(() => { let stop = false; let t: ReturnType<typeof setTimeout> | undefined; const go = async () => { const r: any = await teamOp("book_run", { run, limit: 200 }); if (stop) return; if (r?.ok && r.gate) setRep((o: any) => (o?.digest === r.digest ? o : r)); t = setTimeout(() => void go(), live ? 4000 : 30000); }; void go(); return () => { stop = true; if (t) clearTimeout(t); }; }, [run, live]);
  return rep as { gate: { passed: boolean; skipped: boolean; failing: number; fail_on: string }; score: number | null; axes: Record<string, number>; counts: Record<string, number>; findings: Finding[]; artifacts: unknown[]; laws_run: number; digest: string } | null;
}
export function FindingsPanel({ report, onOpen }: { report: ReturnType<typeof useRunFindings>; onOpen: (path: string) => void }) {
  if (!report) return <div style={{ padding: 14, color: C.dim }}>judging…</div>;
  const fs = (report.findings ?? []).filter((f) => !f.advisory); const g = report.gate;
  return (
    <div data-testid="ev-findings" style={{ height: "100%", overflow: "auto", fontFamily: nav, fontSize: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: C.muted, position: "sticky", top: 0, background: C.panel }}>
        <span data-testid="ev-gate" style={{ fontWeight: 600, color: g.skipped ? C.dim : g.passed ? "var(--c-ok)" : "var(--c-bad)" }}>{g.skipped ? "no law applies" : g.passed ? "gate passes" : `gate fails (${g.failing})`}</span>
        <span>score {report.score ?? "—"}</span>{Object.entries(report.axes ?? {}).map(([k, v]) => <span key={k}>{k} {v}</span>)}<span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: C.dim }} title="the same files and laws give the same digest">{String(report.digest ?? "").slice(0, 8)}</span>
      </div>
      {fs.length === 0 ? <div style={{ padding: 14, color: C.dim }}>{g.skipped ? "No law of the book applies to the files of this run." : "Nothing to fix: no finding."}</div> : fs.map((f, i) => (
        <button key={i} data-testid="ev-finding" onClick={() => onOpen(f.path)} style={{ display: "flex", gap: 10, alignItems: "baseline", width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: `1px solid ${C.border}`, padding: "5px 14px", color: C.fg, font: "inherit", cursor: "pointer" }}>
          <i style={{ width: 7, height: 7, borderRadius: "50%", background: SEV[f.severity] ?? C.dim, flex: "none" }} /><span style={{ fontFamily: mono, color: C.muted, flex: "none" }}>{f.path}:{f.line}</span><span style={{ flex: 1, minWidth: 0 }}>{f.message}{f.fix ? <span style={{ color: C.dim }}> · {f.fix}</span> : null}</span><span style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, flex: "none" }}>{f.law}</span>
        </button>))}
    </div>);
}
