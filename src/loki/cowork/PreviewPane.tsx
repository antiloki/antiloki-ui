// (the menu names an agent by its title, "Claude Code", not by the slug of its box)
// THE PREVIEW PANE IN COWORK ("run the agent's app beside it"): the Run pane, told which boxes exist. Opened beside an agent it targets THAT agent's box; with no list of boxes its target menu offered only "workspace root"
// while the pane was really running the agent's box (found 2026-11-11 by opening it for real: the label lied). Now the menu names every box of the session and the pane's own target is the selected one.
import * as React from "react";
import { RunPane } from "@/loki/cockpit/cockpit-panes-extra";
import { apiPost, unwrapResult as unwrap } from "@/loki/api/client";
import type { PaneRef } from "./layout";

export function PreviewPane({ pane }: { pane: PaneRef }) {
  const [panes, setPanes] = React.useState<any[]>([]);
  React.useEffect(() => {
    let stop = false; const sid = pane.sessionId; if (!sid) return;
    const load = () => void (async () => { try { const d: any = unwrap(await apiPost("/api/v1/cockpit/session/get", { id: sid }, { timeoutMs: 15_000 })); if (!stop && Array.isArray(d?.panes)) setPanes(d.panes.filter((p: any) => p && p.worktree_path && p.status !== "closed").map((p: any) => { let t = ""; try { t = JSON.parse(p.settings_json || "{}").title ?? ""; } catch { /* a row with no settings */ } return t ? { ...p, subagent_name: t } : p; })); } catch { /* the menu keeps what it had */ } })();
    load(); const t = setInterval(load, 10_000); return () => { stop = true; clearInterval(t); };
  }, [pane.sessionId]);
  return <RunPane p={{ id: pane.paneId ?? 0, subagent_name: "preview", script_worktree_pane: pane.target ?? 0, settings_json: "{}" } as never} panes={panes as never} onChanged={() => {}} />;
}
