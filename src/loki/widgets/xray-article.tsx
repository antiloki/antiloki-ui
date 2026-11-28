// X-RAY ARTICLE — the codebase x-ray as a DETERMINISTIC deep-dive paper. Same ProjectReport in → same
// article out, no AI. Every section explains the WHY, not just the WHAT (we know what each smell, axis
// and risk factor MEANS, so the prose is real). Figures are excalidraw-style (hand-drawn / rough), and
// the type is the antiloki system fonts only — nav for prose + headings, mono for data.
import React from "react";
import { C, nav, mono } from "@/loki/theme";
import { fmtTokens } from "@/loki/util/tokens";
import type { ProjectReport, RiskFile, Smell, Vuln } from "@/loki/api/codebase";

const tone = (h: number) => (h >= 80 ? C.ok : h >= 50 ? C.warn : C.bad);
const bn = (p: string) => p.split("/").pop() || p;
const round = (n: any) => Math.round(Number(n) || 0);
const stamp = () => { try { return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); } catch { return ""; } };
const bold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, `<b style="font-family:${mono};color:${C.fg}">$1</b>`);

// ── deterministic knowledge — what each signal MEANS (this is the "why" the article can write) ──
const SMELL_MEANING: Record<string, string> = {
  "swallowed-error": "an error is caught and silently discarded — the failure vanishes instead of surfacing, so the first sign of a bug is missing data, not a stack trace",
  "debug-leftover": "a console.log or debugger left in shipped code — noise in the console, and occasionally a data leak",
  secret: "a credential-shaped literal sitting in source — it belongs in a gitignored key file, not the repo",
  todo: "a TODO / FIXME the code left for itself — deferred work, tracked nowhere else",
  "unused-import": "an import nothing references — dead weight that trips up refactors and readers",
  a11y: "an accessibility gap (an <img> with no alt, a click with no keyboard path) — unusable for some, and a lint/legal risk",
  "regex-risk": "a regex with nested quantifiers — catastrophic backtracking waiting for the wrong input (a quiet DoS)",
  "test-only": "a .only left in a suite — it silently disables every OTHER test in that file under CI",
  "hardcoded-strings": "user-facing text baked into JSX — nothing can be localised without a rewrite",
  "god-file": "one file carrying too many jobs — every feature touches it, so every change is risky and merges collide",
  "dead-export": "an export no one imports — public surface with zero users, pure maintenance cost",
  "orphan-file": "a file nothing imports — either dead code, or a wire someone forgot to connect",
  "clone-pair": "two near-identical blocks — a fix has to land twice, and the second one won't",
  cycle: "an import cycle — there's no clean build or test order, and a change loops back on itself",
};
const smellMeaning = (k: string) => SMELL_MEANING[k] ?? "a deterministic signal the detectors flagged as worth a look";

function whyRisk(f: RiskFile): string {
  const p: string[] = [];
  if (f.factors.fan_in >= 5) p.push(`**${f.factors.fan_in} files depend on it**, so a change to its surface ripples straight into all of them`);
  else if (f.factors.fan_in > 0) p.push(`${f.factors.fan_in} file${f.factors.fan_in === 1 ? "" : "s"} depend on it`);
  if (f.factors.complexity >= 40) p.push(`its complexity is **${f.factors.complexity}** — dense enough that it's hard to hold in your head and easy to break by accident`);
  else if (f.factors.complexity > 0) p.push(`complexity ${f.factors.complexity}`);
  if (f.factors.uncovered) p.push(`**no tests stand in front of it**, so a regression here ships silently`);
  if (f.factors.churn >= 8) p.push(`it **changes often** (churn ${f.factors.churn}) — a moving target that rarely settles`);
  const body = p.length ? p.join("; ") : "a mix of smaller factors that add up";
  return `${body}. That combination is why it tops the list: ${f.factors.uncovered ? "high blast radius with no safety net" : "high blast radius that ripples outward"}.`;
}

// ── excalidraw / rough kit — deterministic hand-drawn wobble (no Math.random, so it's reproducible) ──
const wob = (seed: number, amp = 1.3) => (((Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1 - 0.5) * 2 * amp;
function roughRect(x: number, y: number, w: number, h: number, seed: number): string {
  const pt = (dx: number, dy: number, s: number) => `${(x + dx + wob(seed + s)).toFixed(1)} ${(y + dy + wob(seed + s + 40)).toFixed(1)}`;
  return `M ${pt(0, 0, 1)} L ${pt(w, 0, 2)} L ${pt(w, h, 3)} L ${pt(0, h, 4)} L ${pt(0, 0, 5)}`;
}
// a hand-drawn horizontal bar chart
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
// a hand-drawn semicircle health gauge (two slightly-offset strokes = the sketch look)
function RoughGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const a = Math.PI * (1 - v / 100), x = 62 + 46 * Math.cos(a), y = 64 - 46 * Math.sin(a);
  const t = tone(value);
  return (
    <svg viewBox="0 0 124 80" style={{ width: 132, flexShrink: 0 }}>
      <path d="M 16 64 A 46 46 0 0 1 108 64" fill="none" stroke={C.border} strokeWidth="6" strokeLinecap="round" />
      <path d={`M 16 64 A 46 46 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke={t} strokeWidth="6" strokeLinecap="round" />
      <path d={`M 15 65 A 47 47 0 0 1 ${(x + wob(v, 1.6)).toFixed(1)} ${(y + wob(v + 9, 1.6)).toFixed(1)}`} fill="none" stroke={t} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <text x="62" y="55" textAnchor="middle" style={{ fontFamily: nav, fontSize: 28, fontWeight: 800 }} fill={t}>{round(value)}</text>
      <text x="62" y="72" textAnchor="middle" style={{ fontFamily: mono, fontSize: 8, letterSpacing: 1 }} fill={C.dim}>HEALTH / 100</text>
    </svg>
  );
}
// a hand-drawn sparkline (slightly jittered points)
function RoughSpark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 240, h = 46, lo = Math.min(...points), hi = Math.max(...points), sp = Math.max(1, hi - lo);
  const xy = points.map((v, i) => [(i / (points.length - 1)) * (w - 6) + 3 + wob(i, 0.8), h - 4 - ((v - lo) / sp) * (h - 8) + wob(i + 20, 0.8)]);
  const d = xy.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: 340, height: 46 }}>
      <path d={d} fill="none" stroke={C.brand} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.2" fill={i === xy.length - 1 ? tone(points[i]) : C.dim} />)}
    </svg>
  );
}

const H2: React.CSSProperties = { fontFamily: nav, fontSize: 12.5, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: C.brand, margin: "24px 0 8px", borderBottom: `1px solid ${C.border}`, paddingBottom: 4 };
const P: React.CSSProperties = { fontFamily: nav, fontSize: 13.5, lineHeight: 1.7, color: C.fg, margin: "0 0 11px", fontWeight: 400 };
const CAP: React.CSSProperties = { fontFamily: mono, fontSize: 9.5, color: C.dim, margin: "2px 0 2px", letterSpacing: 0.3 };
const Para = ({ html }: { html: string }) => <p style={P} dangerouslySetInnerHTML={{ __html: bold(html) }} />;

const verdict = (h: number) =>
  h >= 80 ? "The codebase is in good health. The structure holds, and what risk exists is contained to a few edges rather than spread through the core."
  : h >= 60 ? "The codebase is holding up. There are soft spots — the files below — but nothing has metastasised into the whole tree yet. This is the cheap moment to act."
  : h >= 40 ? "The codebase is under strain. The risk isn't evenly spread; it's concentrated in a handful of load-bearing files, and because they're load-bearing it compounds with every change."
  : "The codebase is in rough shape. The dangerous files are also the busy ones, so every change lands on thin ice — and without tests, the ice breaks quietly.";

export function XrayArticle({ data }: { data: ProjectReport }) {
  const health = round(data.project?.health), risk = round(data.project?.risk);
  const digest = (data as any)._digest as { files: number | null; symbols: number | null; edges: number | null; tokens: number | null } | null;
  const files = digest?.files ?? data.counts?.files ?? 0;
  const vulns = (data.vulns ?? []) as Vuln[];
  const critVulns = vulns.filter((v) => v.severity === "critical" || v.severity === "high");
  const risky = (data.top_risk ?? data.scores?.top_risk ?? []).slice(0, 8);
  const smells = data.smells ?? [];
  const byKind: Record<string, number> = {};
  for (const s of smells) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  const smellBars = Object.entries(byKind).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => ({ label: k.replace(/[-_]/g, " "), value: n, tone: C.warn }));
  const trend = (data.trend ?? []).map((t) => round(t.health)).filter((n) => n > 0);
  const uncoveredRisky = risky.filter((f) => f.factors.uncovered);
  const worstComplex = [...risky].sort((a, b) => b.factors.complexity - a.factors.complexity)[0];
  const highSmells = smells.filter((s) => s.severity === "high");

  return (
    <article style={{ maxWidth: 760, margin: "0 auto", background: C.bg, color: C.fg, padding: "6px 4px", fontFamily: nav }}>
      <div style={{ borderTop: `2px solid ${C.fg}`, borderBottom: `1px solid ${C.border}`, padding: "8px 0 6px", marginBottom: 14, textAlign: "center" }}>
        <div style={{ fontFamily: nav, fontSize: 27, fontWeight: 800, letterSpacing: 1, color: C.fg }}>CODEBASE X-RAY</div>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 3 }}>{data.origin ?? "atlas"} · {stamp()} · a deterministic report — measured from the AST, not vibed</div>
      </div>

      <Para html={`This codebase spans **${files}** ${files === 1 ? "file" : "files"}. It scores **${health}** for health and **${risk}** for risk. ${smells.length} ${smells.length === 1 ? "smell" : "smells"} surfaced${risky.length ? `, and ${risky.length} ${risky.length === 1 ? "file stands" : "files stand"} out as the ones to watch` : ""}. The rest of this report is the why behind those numbers.`} />

      <div style={{ background: `color-mix(in oklab, ${C.brand} 6%, transparent)`, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", margin: "4px 0 8px" }}>
        <div style={CAP}>HOW TO READ THIS</div>
        <Para html={`**Health** is a weighted blend of seven signals the parser reads straight from the AST — tests, coupling, cohesion, complexity, compliance, defects and churn. **Risk** is a different lens: it multiplies a file's *blast radius* (how many files lean on it) by its *fragility* (untested, complex, churny). A file can be perfectly healthy and still be the single riskiest thing in the repo — if half the tree imports it.`} />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "8px 0 2px" }}>
        <RoughGauge value={health} />
        <div><div style={{ ...H2, margin: "0 0 6px", border: "none", padding: 0 }}>The verdict</div><Para html={verdict(health)} /></div>
      </div>

      {digest && (digest.files || digest.symbols || digest.edges) && (<>
        <div style={H2}>The shape</div>
        <Para html={`The atlas maps **${digest.files ?? files}** files holding **${digest.symbols ?? "—"}** symbols, wired by **${digest.edges ?? "—"}** import edges${digest.tokens ? `, about **${fmtTokens(digest.tokens)}** tokens of code` : ""}. ${(digest.edges && digest.files && digest.edges / Math.max(1, digest.files) > 3) ? "That's a dense import graph — the modules lean on each other heavily, which is exactly why the risk below concentrates in a few hubs rather than spreading evenly." : "The import graph is relatively loose, so most files can change without disturbing their neighbours."}`} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontFamily: mono, margin: "2px 0 6px" }}>
          {([["files", digest.files ?? files], ["symbols", digest.symbols], ["import edges", digest.edges], ...(digest.tokens ? [["~tokens", fmtTokens(digest.tokens)] as [string, any]] : [])] as [string, any][]).filter(([, v]) => v != null).map(([k, v]) => (
            <div key={k}><div style={{ fontSize: 20, fontWeight: 700, color: C.fg }}>{v}</div><div style={{ fontSize: 8.5, textTransform: "uppercase", letterSpacing: 1, color: C.dim }}>{k}</div></div>
          ))}
        </div>
      </>)}

      {risky.length > 0 && (<>
        <div style={H2}>The files to watch</div>
        <Para html={`Risk is not the same as unhealthy — these files rank high because a change to them is *expensive*. They're depended on, hard to reason about, or unguarded by tests${uncoveredRisky.length ? `, and ${uncoveredRisky.length} of them have no tests at all` : ""}. Ranked by the risk they concentrate:`} />
        <div style={CAP}>▟ RISK BY FILE — taller bar = a change here hurts more</div>
        <RoughBars items={risky.map((f) => ({ label: bn(f.path), value: round(f.risk), tone: tone(f.health), sub: f.path }))} />
        <div style={{ margin: "12px 0 4px" }}>{risky.slice(0, 5).map((f, i) => (
          <div key={i} style={{ margin: "0 0 12px", paddingLeft: 10, borderLeft: `2px solid ${tone(f.health)}` }}>
            <div style={{ fontFamily: mono, fontSize: 12, color: C.fg, fontWeight: 700 }}>{i + 1}. {bn(f.path)} <span style={{ color: C.dim, fontWeight: 400 }}>· risk {round(f.risk)} · health {round(f.health)}</span></div>
            <Para html={whyRisk(f)} />
          </div>
        ))}</div>
      </>)}

      <div style={H2}>The smells</div>
      {smells.length === 0 ? <Para html="None surfaced — the deterministic detectors (secrets, swallowed errors, debug leftovers, dead code, cycles, and the rest) came back clean. That's a real signal, not an absence of one." /> : (<>
        <Para html={`**${smells.length}** ${smells.length === 1 ? "smell was" : "smells were"} detected across the tree${highSmells.length ? `, ${highSmells.length} of them **high-severity**` : ""}. A smell isn't a bug — it's a shape the detectors recognise as trouble. By kind:`} />
        <div style={CAP}>▟ SMELLS BY KIND</div>
        <RoughBars items={smellBars} />
        <div style={{ margin: "10px 0 4px" }}>{smells.slice(0, 6).map((s: Smell, i) => (
          <div key={i} style={{ margin: "0 0 9px" }}>
            <div style={{ fontFamily: mono, fontSize: 12 }}><b style={{ color: s.severity === "high" ? C.bad : s.severity === "medium" ? C.warn : C.dim }}>{s.kind}</b> <span style={{ fontSize: 10, color: C.dim }}>· {s.severity}{s.nodes?.length ? ` · ${s.nodes.length} site${s.nodes.length === 1 ? "" : "s"}` : ""}</span></div>
            <Para html={`${smellMeaning(s.kind)}.${s.detail ? ` Here: ${s.detail}` : ""}`} />
          </div>
        ))}</div>
      </>)}

      <div style={H2}>Known vulnerabilities</div>
      {vulns.length === 0
        ? <Para html="None. The lockfile was scanned against OSV and no known-CVE dependencies came back — a clean bill on the supply-chain side." />
        : (<>
          <Para html={`**${vulns.length}** known-CVE ${vulns.length === 1 ? "dependency" : "dependencies"} ship in the lockfile${critVulns.length ? `, **${critVulns.length}** of them critical or high` : ""}. This isn't your code — it's what you pull in — but it lands in your build all the same.`} />
          {vulns.slice(0, 6).map((v, i) => (
            <div key={i} style={{ margin: "0 0 8px" }}>
              <div style={{ fontFamily: mono, fontSize: 12 }}><b style={{ color: v.severity === "critical" || v.severity === "high" ? C.bad : v.severity === "moderate" ? C.warn : C.dim }}>{v.package}@{v.version}</b> <span style={{ fontSize: 10, color: C.dim }}>· {v.severity} · {v.cve || v.osv_id}</span></div>
              <Para html={`${v.summary || "a known vulnerability in this dependency"}.${v.fixed_in ? ` **Fixed in ${v.fixed_in}** — bump it.` : " No fix published yet — pin it and watch."}`} />
            </div>
          ))}
        </>)}

      {trend.length >= 2 && (<>
        <div style={H2}>The trend</div>
        <Para html={`Health has moved from **${trend[0]}** to **${trend[trend.length - 1]}** across the last ${trend.length} rebuilds. ${trend[trend.length - 1] >= trend[0] ? "It's climbing — whatever you're doing is working, keep the pressure on the files above." : "It's slipping. The slide is cheap to reverse now and expensive to reverse later; the files above are where it's leaking."}`} />
        <div style={CAP}>▟ HEALTH OVER THE LAST {trend.length} REBUILDS</div>
        <RoughSpark points={trend} />
      </>)}

      <div style={H2}>The tally</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontFamily: mono, margin: "6px 0 8px" }}>
        {([["files", files], ["health", health], ["risk", risk], ["smells", smells.length]] as [string, number][]).map(([k, v]) => (
          <div key={k}><div style={{ fontSize: 23, fontWeight: 700, color: k === "health" ? tone(health) : k === "risk" ? tone(100 - risk) : C.fg }}>{v}</div><div style={{ fontSize: 8.5, textTransform: "uppercase", letterSpacing: 1, color: C.dim }}>{k}</div></div>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 18, paddingTop: 10 }}>
        <div style={{ ...H2, border: "none", margin: "0 0 6px", padding: 0 }}>Where to start</div>
        <ol style={{ ...P, margin: "0 0 8px", paddingLeft: 20 }}>
          {uncoveredRisky[0] && <li style={{ marginBottom: 5 }} dangerouslySetInnerHTML={{ __html: bold(`Put a test in front of **${bn(uncoveredRisky[0].path)}** — it's high-risk and unguarded, so it's the biggest single reduction in risk for the least work.`) }} />}
          {worstComplex && worstComplex.factors.complexity >= 30 && <li style={{ marginBottom: 5 }} dangerouslySetInnerHTML={{ __html: bold(`Break up **${bn(worstComplex.path)}** — complexity ${worstComplex.factors.complexity} is what makes it fragile; extract the densest block.`) }} />}
          {smellBars[0] && <li style={{ marginBottom: 5 }} dangerouslySetInnerHTML={{ __html: bold(`Clear the **${smellBars[0].label}** smells (${smellBars[0].value}) — the most common kind, and usually the quickest to sweep.`) }} />}
        </ol>
        <Para html="Every figure above is computed from the same report, so this article is reproducible: rebuild the atlas and it rewrites itself, no prompt involved." />
        <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 4 }}>— antiIDE · deterministic · {stamp()}</div>
      </div>
    </article>
  );
}
