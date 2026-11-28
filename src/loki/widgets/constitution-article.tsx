// CONSTITUTION ARTICLE — the codebase's constitution as a DETERMINISTIC paper. Same report in → same
// article out, no AI. It reshapes system.constitution.report into the actual LAW BOOK (every active law,
// its text, its family) plus how well the code obeys it. Every section explains the WHY — we know what
// each law family MEANS and what compliance/determinism buy you, so the prose is real, not filler.
// Figures are excalidraw-style (hand-drawn / rough); type is the antiloki system fonts only.
import React from "react";
import { C, nav, mono } from "@/loki/theme";

// ── shaped input (a subset of system.constitution.report) ────────────────────
type Law = { key: string; title?: string; scope?: string; detector?: string; weight?: number; severity?: string; category?: string; status?: string; rule_md?: string };
type Cat = { category: string; active_laws: number; violations: number; score: number };
type ByLaw = { law_key: string; title?: string; scope?: string; mass?: number; n: number };
type Worst = { kind: string; path: string; health: number; score: number; archetype?: string };
export type ConReport = {
  summary?: { health?: number; compliance?: number; determinism?: number; ai_readability?: number; violations?: number; files?: number; carried?: number; axes_avg?: Record<string, number> };
  constitution?: { counts?: { ratified?: number }; laws?: Law[] };
  by_category?: Cat[];
  by_law?: ByLaw[];
  worst?: Worst[];
  deltas?: { from_snapshot?: number; health?: number } | null;
  origin?: string;
};

const tone = (h: number) => (h >= 80 ? C.ok : h >= 50 ? C.warn : C.bad);
const bn = (p: string) => p.split("/").pop() || p;
const round = (n: any) => Math.round(Number(n) || 0);
const stamp = () => { try { return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); } catch { return ""; } };
const bold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, `<b style="font-family:${mono};color:${C.fg}">$1</b>`);

// ── deterministic knowledge — what each law FAMILY means + why it exists (the "why" the article writes) ──
const SCOPE_MEANING: Record<string, { what: string; why: string }> = {
  architecture: {
    what: "shared structural laws — dependency direction, layering, and no import cycles",
    why: "they keep the module graph a DAG, so the build has an order, a test has an order, and a change can't quietly loop back on itself. Break these and the whole tree becomes one tangled unit that can only be understood all at once.",
  },
  project: {
    what: "laws mined from THIS repo — the house way, learned from your own dominant patterns",
    why: "when a codebase already does something one way in 90% of its files, that way becomes law. It's how a newcomer — human or AI — matches the grain of the code instead of fighting it, and why the house style overrides the generic default.",
  },
  language: {
    what: "syntax and semantics the parser enforces agnostically, via tree-sitter",
    why: "these aren't preferences — they're the rules of the language itself. A detector reads the AST directly, so the verdict is the same on every machine, with no config to drift.",
  },
  framework: {
    what: "ecosystem-specific rules — the conventions a framework assumes",
    why: "frameworks punish you silently for breaking their contract (a missing key, a hook out of order, an effect with the wrong deps). Encoding them as law turns a runtime surprise into a rebuild-time finding.",
  },
  universal: {
    what: "best practices that hold in any codebase — the widely-agreed floor",
    why: "no secrets in source, no swallowed errors, no dead exports. They're universal because the cost of breaking them is the same everywhere, regardless of stack.",
  },
  business: {
    what: "domain invariants you authored by hand — the rules the parser can't mine",
    why: "these live in your head, not the syntax: an order can't ship before payment, a tenant can't read another tenant's rows. The mining can't find them because nothing in the AST spells them out — so you write them, and the constitution holds you to them.",
  },
  code: {
    what: "project-scoped code laws mined from the repository",
    why: "the same house-way enforcement as project laws, keyed to concrete code shapes the detectors can recognise.",
  },
};
const scopeMeaning = (k: string) => SCOPE_MEANING[k] ?? { what: "a family of laws the constitution enforces on rebuild", why: "each one carries a detector that scans the tree and a weight that sets how much a breach costs." };
const SCOPE_ORDER = ["architecture", "project", "code", "language", "framework", "universal", "business"];

const SEV_WHY: Record<string, string> = {
  critical: "a breach here is treated as a hard failure — it dominates the file's compliance score",
  high: "weighted heavily — a breach pulls the score down sharply",
  medium: "a moderate weight — noted, not fatal",
  low: "a light touch — a nudge, not a penalty",
  info: "advisory only — surfaced for awareness, costs nothing",
};

// ── excalidraw / rough kit — deterministic hand-drawn wobble (no Math.random, so it's reproducible) ──
const wob = (seed: number, amp = 1.3) => (((Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1 - 0.5) * 2 * amp;
function roughRect(x: number, y: number, w: number, h: number, seed: number): string {
  const pt = (dx: number, dy: number, s: number) => `${(x + dx + wob(seed + s)).toFixed(1)} ${(y + dy + wob(seed + s + 40)).toFixed(1)}`;
  return `M ${pt(0, 0, 1)} L ${pt(w, 0, 2)} L ${pt(w, h, 3)} L ${pt(0, h, 4)} L ${pt(0, 0, 5)}`;
}
function RoughBars({ items }: { items: { label: string; value: number; tone: string; sub?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, margin: "12px 0" }}>
      {items.map((it, i) => {
        const w = Math.max(6, (it.value / max) * 196);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 138, flexShrink: 0, fontFamily: mono, fontSize: 11, color: C.fg, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.sub || it.label}>{it.label}</span>
            <svg viewBox="0 0 200 15" preserveAspectRatio="none" style={{ flex: 1, height: 15 }}>
              <path d={roughRect(1, 2, 197, 10, i * 3 + 100)} fill="none" stroke={C.border} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
              <path d={roughRect(1, 2, w, 10, i * 3 + 1)} fill={it.tone} fillOpacity="0.18" stroke={it.tone} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ width: 30, flexShrink: 0, fontFamily: mono, fontSize: 11, fontWeight: 700, color: it.tone, textAlign: "right" }}>{it.value}</span>
          </div>
        );
      })}
    </div>
  );
}
function RoughGauge({ value, label = "COMPLIANCE / 100" }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const a = Math.PI * (1 - v / 100), x = 62 + 46 * Math.cos(a), y = 64 - 46 * Math.sin(a);
  const t = tone(value);
  return (
    <svg viewBox="0 0 124 80" style={{ width: 132, flexShrink: 0 }}>
      <path d="M 16 64 A 46 46 0 0 1 108 64" fill="none" stroke={C.border} strokeWidth="6" strokeLinecap="round" />
      <path d={`M 16 64 A 46 46 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke={t} strokeWidth="6" strokeLinecap="round" />
      <path d={`M 15 65 A 47 47 0 0 1 ${(x + wob(v, 1.6)).toFixed(1)} ${(y + wob(v + 9, 1.6)).toFixed(1)}`} fill="none" stroke={t} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <text x="62" y="55" textAnchor="middle" style={{ fontFamily: nav, fontSize: 28, fontWeight: 800 }} fill={t}>{round(value)}</text>
      <text x="62" y="72" textAnchor="middle" style={{ fontFamily: mono, fontSize: 7.5, letterSpacing: 1 }} fill={C.dim}>{label}</text>
    </svg>
  );
}
// two small hand-drawn dials side by side (determinism + ai-readability)
function RoughDial({ value, label }: { value: number; label: string }) {
  const t = tone(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg viewBox="0 0 64 64" style={{ width: 62 }}>
        <circle cx="32" cy="32" r="25" fill="none" stroke={C.border} strokeWidth="4" />
        <path d={`M 32 7 A 25 25 0 ${value > 50 ? 1 : 0} 1 ${(32 + 25 * Math.sin((value / 100) * 2 * Math.PI)).toFixed(1)} ${(32 - 25 * Math.cos((value / 100) * 2 * Math.PI)).toFixed(1)}`} fill="none" stroke={t} strokeWidth="4" strokeLinecap="round" />
        <text x="32" y="37" textAnchor="middle" style={{ fontFamily: nav, fontSize: 17, fontWeight: 800 }} fill={t}>{round(value)}</text>
      </svg>
      <div style={{ fontFamily: mono, fontSize: 8, letterSpacing: 0.6, color: C.dim, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

const H2: React.CSSProperties = { fontFamily: nav, fontSize: 12.5, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: C.brand, margin: "24px 0 8px", borderBottom: `1px solid ${C.border}`, paddingBottom: 4 };
const P: React.CSSProperties = { fontFamily: nav, fontSize: 13.5, lineHeight: 1.7, color: C.fg, margin: "0 0 11px", fontWeight: 400 };
const CAP: React.CSSProperties = { fontFamily: mono, fontSize: 9.5, color: C.dim, margin: "2px 0 2px", letterSpacing: 0.3 };
const Para = ({ html }: { html: string }) => <p style={P} dangerouslySetInnerHTML={{ __html: bold(html) }} />;

const complianceVerdict = (h: number) =>
  h >= 90 ? "The codebase is a good citizen of its own constitution. The laws it agreed to, it keeps — what breaches exist are isolated, not systemic."
  : h >= 70 ? "The codebase mostly obeys its constitution. A few laws bend in a few places — the sections below name them — but the rule of law holds across the tree."
  : h >= 50 ? "The codebase is drifting from its constitution. Enough laws are broken, often enough, that the constitution is describing an aspiration more than the code. This is the moment to either fix the code or amend the law."
  : "The codebase and its constitution disagree. Either the laws are wrong for this repo, or the code has drifted far from what it promised. Both are fixable, but not by ignoring the gap.";

export function ConstitutionArticle({ data }: { data: ConReport }) {
  const s = data.summary ?? {};
  const laws = (data.constitution?.laws ?? []).filter((l) => l.status !== "candidate");
  const active = laws.filter((l) => l.status !== "suspended");
  const compliance = round(s.compliance ?? 0);
  const cats = (data.by_category ?? []).slice().sort((a, b) => b.active_laws - a.active_laws);
  const byLaw = (data.by_law ?? []).slice().sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
  const worst = (data.worst ?? []).filter((w) => w.kind === "file").slice(0, 6);
  const violations = s.violations ?? byLaw.reduce((n, l) => n + (l.n ?? 0), 0);
  const families = SCOPE_ORDER.filter((sc) => active.some((l) => (l.scope ?? "") === sc || (sc === "project" && l.scope === "code")));
  const lawsByScope = (sc: string) => active.filter((l) => (l.scope ?? "") === sc || (sc === "project" && l.scope === "code"));
  const topLaw = byLaw[0];

  return (
    <article style={{ maxWidth: 760, margin: "0 auto", background: C.bg, color: C.fg, padding: "6px 4px", fontFamily: nav }}>
      <div style={{ borderTop: `2px solid ${C.fg}`, borderBottom: `1px solid ${C.border}`, padding: "8px 0 6px", marginBottom: 14, textAlign: "center" }}>
        <div style={{ fontFamily: nav, fontSize: 27, fontWeight: 800, letterSpacing: 1, color: C.fg }}>THE CONSTITUTION</div>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 3 }}>{data.origin ?? "atlas"} · {stamp()} · the laws this codebase agreed to live by — counted, not vibed</div>
      </div>

      <Para html={`**${active.length}** ${active.length === 1 ? "law" : "laws"} govern this codebase, across **${families.length}** ${families.length === 1 ? "family" : "families"}. The code obeys them at **${compliance}** out of 100${violations ? `, with **${violations}** open ${violations === 1 ? "breach" : "breaches"} across the tree` : ", with the tree currently clean"}. This article is two things at once: the constitution itself — every active law, in its own words — and the record of how faithfully the code keeps it.`} />

      <div style={{ background: `color-mix(in oklab, ${C.brand} 6%, transparent)`, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", margin: "4px 0 8px" }}>
        <div style={CAP}>HOW TO READ THIS</div>
        <Para html={`A **law** here is not a comment or a wish — it's a **detector** with a **weight**. The detector scans the AST on every rebuild; the weight sets how much a breach costs. **Compliance** is the weighted verdict: how much of the law-weighted surface the code actually satisfies. It's deliberately separate from *health* — a file can be clean, well-tested and still break a law, and a file can be a mess while breaking none. Laws come in families by **scope**: some are universal, some are mined from this very repo, some you authored by hand.`} />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "8px 0 2px", flexWrap: "wrap" }}>
        <RoughGauge value={compliance} />
        <div style={{ flex: 1, minWidth: 240 }}><div style={{ ...H2, margin: "0 0 6px", border: "none", padding: 0 }}>The verdict</div><Para html={complianceVerdict(compliance)} /></div>
      </div>

      {(s.determinism != null || s.ai_readability != null) && (
        <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap", margin: "2px 0 8px" }}>
          {s.determinism != null && <RoughDial value={round(s.determinism)} label="determinism" />}
          {s.ai_readability != null && <RoughDial value={round(s.ai_readability)} label="ai-read" />}
          <div style={{ flex: 1, minWidth: 240 }}><Para html={`The constitution exists to make the codebase **legible to a machine**. ${s.determinism != null ? `Determinism sits at **${round(s.determinism)}** — how much of the verdict comes from a detector reading the AST versus a judgment call; the higher it is, the more reproducible every number in this paper. ` : ""}${s.ai_readability != null ? `AI-readability is **${round(s.ai_readability)}** — how easily an agent opening this repo cold can predict its shape and follow its rules.` : ""}`} /></div>
        </div>
      )}

      {cats.length > 0 && (<>
        <div style={H2}>The families</div>
        <Para html={`The ${active.length} laws split into ${families.length} scopes. A scope tells you where a law comes from — the language itself, the framework, the wider craft, or this repo's own habits — and that provenance is exactly what tells you whether a breach is a real defect or a rule that doesn't fit here.`} />
        <div style={CAP}>▟ ACTIVE LAWS BY FAMILY</div>
        <RoughBars items={cats.map((c) => ({ label: c.category, value: c.active_laws, tone: tone(c.score ?? 100), sub: `${c.active_laws} laws · ${c.violations} breaches · score ${round(c.score)}` }))} />
        <div style={{ margin: "10px 0 4px" }}>{families.map((sc) => {
          const m = scopeMeaning(sc); const n = lawsByScope(sc).length; const cat = cats.find((c) => c.category === sc);
          return (
            <div key={sc} style={{ margin: "0 0 11px", paddingLeft: 10, borderLeft: `2px solid ${tone(cat?.score ?? 100)}` }}>
              <div style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>{sc} <span style={{ color: C.dim, fontWeight: 400 }}>· {n} law{n === 1 ? "" : "s"}{cat?.violations ? ` · ${cat.violations} breach${cat.violations === 1 ? "" : "es"}` : ""}</span></div>
              <Para html={`These are ${m.what}. Why they matter: ${m.why}`} />
            </div>
          );
        })}</div>
      </>)}

      {active.length > 0 && (<>
        <div style={H2}>The law book</div>
        <Para html={`Every active law, in its own words. Each carries a **detector** (how it's checked) and a **severity** (how much a breach weighs). Nothing here is enforced by memory — it's scanned, deterministically, on the next rebuild.`} />
        {families.map((sc) => {
          const rows = lawsByScope(sc);
          if (!rows.length) return null;
          return (
            <div key={sc} style={{ margin: "6px 0 14px" }}>
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: tone(cats.find((c) => c.category === sc)?.score ?? 100), margin: "0 0 6px" }}>§ {sc}</div>
              {rows.map((l, i) => (
                <div key={l.key + i} style={{ margin: "0 0 10px", paddingLeft: 10, borderLeft: `2px solid ${C.border}` }}>
                  <div style={{ fontFamily: mono, fontSize: 11.5, color: C.fg, fontWeight: 700 }}>{l.title ?? l.key}
                    {l.severity && <span style={{ color: C.dim, fontWeight: 400 }}> · {l.severity}{l.weight != null ? ` · w${l.weight}` : ""}</span>}
                    {l.detector && <span style={{ color: C.dim, fontWeight: 400, fontSize: 9.5 }}> · {l.detector}</span>}
                  </div>
                  {l.rule_md && <Para html={String(l.rule_md).replace(/\s+/g, " ").trim()} />}
                  {l.severity && SEV_WHY[l.severity] && <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, marginTop: -6, marginBottom: 8 }}>{SEV_WHY[l.severity]}.</div>}
                </div>
              ))}
            </div>
          );
        })}
      </>)}

      {byLaw.length > 0 && (<>
        <div style={H2}>Where it bends</div>
        <Para html={`Not every law is kept equally. These are the laws the code breaks most — ranked by how many times, weighted by how much each breach costs. A law at the top of this list is telling you one of two things: it's the codebase's biggest standing debt, or it's a law that doesn't actually fit this repo and should be amended.`} />
        <div style={CAP}>▟ BREACHES BY LAW — taller = broken more (× weight)</div>
        <RoughBars items={byLaw.slice(0, 8).map((l) => ({ label: l.title ?? l.law_key, value: l.n ?? 0, tone: C.warn, sub: l.law_key }))} />
        <div style={{ margin: "10px 0 4px" }}>{byLaw.slice(0, 4).map((l, i) => (
          <div key={i} style={{ margin: "0 0 9px" }}>
            <div style={{ fontFamily: mono, fontSize: 11.5 }}><b style={{ color: C.warn }}>{l.title ?? l.law_key}</b> <span style={{ fontSize: 9.5, color: C.dim }}>· {l.n} breach{l.n === 1 ? "" : "es"}{l.scope ? ` · ${l.scope}` : ""}</span></div>
            <Para html={`Broken **${l.n}** ${l.n === 1 ? "time" : "times"} across the tree. ${i === 0 ? "It's the single most-broken law — the first place a cleanup pass would pay off, or the first law to reconsider if it never fit." : "A recurring breach — worth deciding, once, whether to fix the code or the law."}`} />
          </div>
        ))}</div>
      </>)}

      {worst.length > 0 && (<>
        <div style={H2}>The worst spots</div>
        <Para html={`Where the breaches concentrate. These files carry the lowest compliance — the places where the constitution and the code disagree most sharply, ranked so you know where a single afternoon buys the most order.`} />
        <div style={CAP}>▟ FILES BY LAW-COMPLIANCE — lower = further from the law</div>
        <RoughBars items={worst.map((w) => ({ label: bn(w.path), value: round(w.score), tone: tone(w.score), sub: w.path }))} />
      </>)}

      {data.deltas && data.deltas.health != null && (<>
        <div style={H2}>The trend</div>
        <Para html={`Since snapshot #${data.deltas.from_snapshot ?? "—"}, the health tracked alongside compliance has moved by **${data.deltas.health > 0 ? "+" : ""}${round(data.deltas.health)}**. ${data.deltas.health >= 0 ? "The codebase is converging on its own constitution — the gap between what it promised and what it does is closing." : "The gap is widening. The constitution is slipping ahead of the code; close it before the laws become fiction."}`} />
      </>)}

      <div style={H2}>The tally</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontFamily: mono, margin: "6px 0 8px" }}>
        {([["laws", active.length], ["compliance", compliance], ["families", families.length], ["breaches", violations]] as [string, number][]).map(([k, v]) => (
          <div key={k}><div style={{ fontSize: 23, fontWeight: 700, color: k === "compliance" ? tone(compliance) : k === "breaches" ? (v ? C.warn : C.ok) : C.fg }}>{v}</div><div style={{ fontSize: 8.5, textTransform: "uppercase", letterSpacing: 1, color: C.dim }}>{k}</div></div>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 18, paddingTop: 10 }}>
        <div style={{ ...H2, border: "none", margin: "0 0 6px", padding: 0 }}>Where to start</div>
        <ol style={{ ...P, margin: "0 0 8px", paddingLeft: 20 }}>
          {topLaw && <li style={{ marginBottom: 5 }} dangerouslySetInnerHTML={{ __html: bold(`Settle **${topLaw.title ?? topLaw.law_key}** — it's broken ${topLaw.n} time${topLaw.n === 1 ? "" : "s"}, the most of any law. Either sweep the breaches or amend the law; leaving it broken erodes trust in all the others.`) }} />}
          {worst[0] && <li style={{ marginBottom: 5 }} dangerouslySetInnerHTML={{ __html: bold(`Start the sweep in **${bn(worst[0].path)}** — it's the furthest from the law (compliance ${round(worst[0].score)}), so it's where the most order is bought for the least motion.`) }} />}
          {compliance < 70 && <li style={{ marginBottom: 5 }} dangerouslySetInnerHTML={{ __html: bold(`Review the constitution itself — at ${compliance} compliance, some of these laws may not fit this repo. A law you'll never keep is worse than no law; suspend or amend it.`) }} />}
        </ol>
        <Para html="Every figure above is computed from the same constitution report, so this article is reproducible: rebuild the codebase and it rewrites itself, no prompt involved." />
        <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 4 }}>— antiIDE · deterministic · {stamp()}</div>
      </div>
    </article>
  );
}
