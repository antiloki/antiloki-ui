// X-RAY OF THE CODEBASE BEING WORKED ON (the operator 2026-11-19: "agents work, at threads or teams, it is the codebase being worked. The code and results are the codebase itself"): a team's work lives in its thread's own tree until you approve a merge, so X-ray reads THAT tree
// (a space of its own, indexed on demand) as well as the workspace folder. The page is framed (the embed names its space itself, so nothing here re-points the app's requests). The tree is the default when the team has work in it.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { x2 } from "./xray-board";
import { XrayDashboard } from "./xray-dashboard";

export type Tree = { thread: string; root: string; files: number; last: string };
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Which tree is the team's: the one of the thread that has its name (a team's thread is named like the team, and a fork adds `--t-…`). Pure. */
export function treeOfTeam(trees: Tree[], team: string): Tree | null { const s = slug(team.split("--t-")[0]); return trees.find((t) => slug(t.thread) === s) ?? null; }

export function XrayTree({ team }: { team: string }) {
  const [trees, setTrees] = React.useState<Tree[] | null>(null); const [pick, setPick] = React.useState<"tree" | "main" | null>(null); const [full, setFull] = React.useState(false);   // ONE screen of visual widgets; the full X-ray page (the code analysis) is one click away
  React.useEffect(() => { let stop = false; void x2<{ trees: Tree[] }>("", "trees").then((r) => { if (!stop) setTrees(r.ok ? r.trees : []); }); return () => { stop = true; }; }, []);
  if (trees === null) return <div style={{ padding: 16, color: C.dim, fontFamily: nav, fontSize: 13 }}>looking for the team's work…</div>;
  const mine = treeOfTeam(trees, team); const choice = pick ?? (mine && mine.files > 0 ? "tree" : "main"); const space = choice === "tree" && mine ? mine.root : "";
  const src = `/embed/xray?view=atlas${space ? `&space=${encodeURIComponent(space)}` : ""}`;
  return (
    <div data-testid="xray-tree" data-choice={choice} style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 420 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontFamily: nav, fontSize: 12.5, flexWrap: "wrap" }}>
        <div role="tablist" aria-label="which codebase" style={{ display: "inline-flex", gap: 2, padding: 2, border: `1px solid ${C.border}`, borderRadius: 999 }}>
          {([["tree", "Team's work"], ["main", "Main"]] as const).filter(([k]) => k === "main" || !!mine).map(([k, label]) => <button key={k} role="tab" aria-selected={choice === k} data-testid={`xray-tree-${k}`} onClick={() => setPick(k)} style={{ fontFamily: "inherit", fontSize: 12, padding: "3px 14px", borderRadius: 999, border: "none", cursor: "pointer", background: choice === k ? C.panel : "transparent", color: choice === k ? C.fg : C.muted }}>{label}</button>)}
        </div>
        {choice === "tree" && mine && <span style={{ color: C.muted }}><span style={{ fontFamily: mono, fontSize: 11 }}>{mine.thread}</span> · {mine.files} file{mine.files === 1 ? "" : "s"}{mine.last ? ` · ${mine.last}` : ""}</span>}
        {choice === "main" && <span style={{ color: C.muted }}>the workspace folder{mine ? ": the team's work reaches it when you approve the merge" : ""}</span>}
        <span style={{ flex: 1 }} /><div role="tablist" aria-label="X-ray view" style={{ display: "inline-flex", gap: 2, padding: 2, border: `1px solid ${C.border}`, borderRadius: 999 }}>{([[false, "Screen", "The overview: what the teams made, runs, files, history, and the code health"], [true, "Code", "Code: the file tree, file review, folder review, the code reader, docs, diagrams, constitution, rules, coverage: every part of X-ray"]] as const).map(([f, label, tip]) => <button key={label} role="tab" aria-selected={full === f} data-testid={f ? "xray-full" : "xray-screen"} title={tip} onClick={() => setFull(f)} style={{ fontFamily: "inherit", fontSize: 12, padding: "3px 14px", borderRadius: 999, border: "none", cursor: "pointer", background: full === f ? C.panel : "transparent", color: full === f ? C.fg : C.muted }}>{label}</button>)}</div>
      </div>
      {full ? <iframe key={src} title="X-ray" data-testid="xray-frame" src={src} style={{ flex: 1, minHeight: 0, border: 0, width: "100%", background: "transparent" }} /> : <div style={{ flex: 1, minHeight: 0 }}><XrayDashboard key={space} space={space} onCode={() => setFull(true)} /></div>}
    </div>
  );
}
