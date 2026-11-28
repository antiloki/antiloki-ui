// DigestView — the codebase DIGEST: a deterministic, full code-review snapshot rendered GENERICALLY
// from the table columns. The BE returns `sections` (each {col,label,group,kind,value}) reflected
// straight out of code_digests — this panel hardcodes NO section list; it switches on `kind`
// (num/pct/json/md/text) and groups by `group`. Add a column to digest-spec.mjs → a card appears here.
// The snapshot is (re)computed on rebuild (↻); the button below forces a fast deterministic refresh.
import React from "react";
import { C, mono } from "@/loki/theme";
import { digestLatest, digestSnapshot } from "@/loki/api/codebase";

const fmtNum = (v: any) => {
  const n = Number(v);
  if (!isFinite(n)) return String(v ?? "—");
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(n < 10 ? 2 : 1);
};
const baseName = (p: string) => { const a = String(p).split(/[/\\]/).filter(Boolean); return a[a.length - 1] || String(p); };

// a compact scalar stat (num / text)
function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div style={{ minWidth: 96, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel2 }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 18, color: accent ?? C.fg, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// a percentage as a labeled bar (0..100); color ramps red→amber→green
function Pct({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const col = v >= 70 ? C.ok : v >= 40 ? C.warn : C.bad;
  return (
    <div style={{ minWidth: 150, flex: 1, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        <span>{label}</span><span style={{ color: col }}>{v.toFixed(1)}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: C.bg, marginTop: 5, overflow: "hidden" }}>
        <div style={{ width: `${v}%`, height: "100%", background: col }} />
      </div>
    </div>
  );
}

// WHAT each list section MEANS + what to do about it (operator 2026-07-23: "most central, most
// risk, most complex … doesn't say why they are most something"). Keyed by digest column; the
// metric label names the NUMBER shown on each row, so "most X" is never a bare mystery score.
const SECTION_WHY: Record<string, { metric: string; what: string; todo: string }> = {
  top_central_json: { metric: "fan-in (files that import it)", what: "the files the most OTHER files depend on — the load-bearing walls", todo: "change these with care: a bad edit ripples into every importer. Keep their public surface small and tested." },
  top_risky_json: { metric: "risk (depended-on + untested)", what: "heavily imported files with NO test covering them — a silent break spreads everywhere", todo: "add a test around each one's main export first; that single test protects every importer." },
  top_complex_json: { metric: "cyclomatic complexity (branch count)", what: "the files with the most decision paths — hardest to reason about, likeliest to hide bugs", todo: "extract the densest blocks into small named functions; the gravity map (▩) decomposes what makes each one heavy." },
  hubs_json: { metric: "fan-in (files that import it)", what: "the most-imported modules — the de-facto API of the codebase", todo: "keep them stable and boring; version their exports deliberately." },
  largest_files_json: { metric: "lines of code", what: "the biggest files by raw size — size alone isn't guilt, but it multiplies every other problem", todo: "if one is also complex or churning (see gravity ▩), split it by responsibility." },
  top_churn_json: { metric: "commits touching it (git)", what: "the files changing most often — where the work actually happens", todo: "churn + complexity + no tests = the exact spot the next bug lands. Test these first." },
  orphans_json: { metric: "", what: "files with no imports in or out — probably dead code or forgotten experiments", todo: "open each: delete it if dead, wire it in if it should live." },
  entry_points_json: { metric: "count", what: "where the outside world enters: routes, UI mounts, data writes", todo: "every entry point deserves validation + a test; they are the attack/regression surface." },
};

// a "path · value" row (the common {path, <metric>} list shape) or a generic key:value row.
// Rows with a real `path` are CLICKABLE when onOpen is wired (→ open in the reader).
function ListBlock({ label, value, col, onOpen }: { label: string; value: any; col?: string; onOpen?: (path: string) => void }) {
  const why = col ? SECTION_WHY[col] : undefined;
  let body: React.ReactNode;
  if (Array.isArray(value)) {
    if (!value.length) body = <span style={{ color: C.muted }}>—</span>;
    else if (typeof value[0] === "object" && value[0]) {
      const metricKey = Object.keys(value[0]).find((k) => k !== "path"); // path · metric
      body = value.map((it, i) => (
        <div key={i} title={`${it.path ?? JSON.stringify(it)}${why?.metric ? `\n${metricKey}: ${why.metric}` : ""}${it.path && onOpen ? "\nclick → open in the reader" : ""}`}
          onClick={() => it.path && onOpen?.(it.path)}
          style={{ display: "flex", gap: 8, fontFamily: mono, fontSize: 10.5, padding: "1px 0", cursor: it.path && onOpen ? "pointer" : "default" }}>
          <span style={{ flex: 1, color: it.path && onOpen ? C.fg : C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.path ? baseName(it.path) : JSON.stringify(it)}</span>
          {metricKey != null && <span style={{ color: C.brand, flexShrink: 0 }}>{fmtNum(it[metricKey])}</span>}
        </div>
      ));
    } else {
      // array of scalars → chips (paths → clickable)
      body = <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{value.map((s, i) => (
        <span key={i} title={String(s)} onClick={() => onOpen?.(String(s))}
          style={{ fontFamily: mono, fontSize: 10, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 5px", cursor: onOpen ? "pointer" : "default" }}>{baseName(String(s))}</span>
      ))}</div>;
    }
  } else if (value && typeof value === "object") {
    const ks = Object.keys(value);
    body = !ks.length ? <span style={{ color: C.muted }}>—</span> : (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{ks.map((k) => (
        <span key={k} style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 6px" }}>
          {k} <b style={{ color: C.brand }}>{fmtNum(value[k])}</b>
        </span>
      ))}</div>
    );
  } else {
    body = <span style={{ color: C.muted }}>{value == null ? "—" : String(value)}</span>;
  }
  return (
    <div style={{ flex: "1 1 240px", minWidth: 220, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel2 }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}{why?.metric ? <span style={{ textTransform: "none", letterSpacing: 0, color: C.dim }}> · number = {why.metric}</span> : null}</div>
      {why && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, lineHeight: 1.5, marginBottom: 5 }}>{why.what} → <span style={{ color: C.muted }}>{why.todo}</span></div>}
      {body}
    </div>
  );
}

function MdBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: "1 1 100%", padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel2 }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      {value
        ? <div style={{ fontFamily: mono, fontSize: 11, color: C.fg, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{value}</div>
        : <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>— rebuild (↻) to generate the architecture narrative</span>}
    </div>
  );
}

function Section({ s, onOpen }: { s: any; onOpen?: (path: string) => void }) {
  if (s.kind === "num" || s.kind === "text") return <Stat label={s.label} value={s.kind === "num" ? fmtNum(s.value) : (s.value ?? "—")} />;
  if (s.kind === "pct") return <Pct label={s.label} value={s.value} />;
  if (s.kind === "md") return <MdBlock label={s.label} value={s.value} />;
  return <ListBlock label={s.label} value={s.value} col={s.col} onOpen={onOpen} />; // json
}

export function DigestView({ origin = "atlas", onOpen }: { origin?: string; onOpen?: (path: string) => void }) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setData(await digestLatest({ origin })); } finally { setLoading(false); }
  }, [origin]);
  React.useEffect(() => { void load(); }, [load]);

  const regenerate = async () => {
    setBusy(true);
    try { await digestSnapshot({ origin, skip_narrative: true }); await load(); } finally { setBusy(false); }
  };

  const found = data?.found && (data?.sections?.length ?? 0) > 0;
  const groups: string[] = data?.groups ?? [];
  const byGroup = (g: string) => (data?.sections ?? []).filter((s: any) => s.group === g);

  return (
    <div style={{ height: "100%", overflow: "auto", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.panel2, zIndex: 1 }}>
        <span style={{ flex: 1, fontFamily: mono, fontSize: 10, color: C.dim }}>
          digest{data?.created_at ? ` · ${data.created_at}` : ""}{data?.digest_id ? ` · #${data.digest_id}` : ""}
        </span>
        <button onClick={regenerate} disabled={busy} title="recompute the deterministic full code-review digest now (manual — it is NOT computed on codebase rebuild)"
          style={{ fontFamily: mono, fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: busy ? "wait" : "pointer", background: C.bg, border: `1px solid ${C.border}`, color: busy ? C.muted : C.brand }}>
          {busy ? "computing…" : "↻ recompute"}
        </button>
      </div>

      {loading && !data ? (
        <div style={{ padding: 14, fontFamily: mono, fontSize: 11, color: C.muted }}>loading digest…</div>
      ) : !found ? (
        <div style={{ padding: 14, fontFamily: mono, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          No digest snapshot yet.<br />
          Click <b style={{ color: C.brand }}>↻ recompute</b> above to generate one — a fast deterministic pass. The digest is manual; it is not computed on codebase rebuild.
          {data?.error ? <div style={{ marginTop: 6, color: C.warn }}>{data.error}</div> : null}
        </div>
      ) : (
        <div style={{ padding: "10px 12px" }}>
          {groups.map((g) => (
            <div key={g} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.brand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{g}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {byGroup(g).map((s: any) => <Section key={s.col} s={s} onOpen={onOpen} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
