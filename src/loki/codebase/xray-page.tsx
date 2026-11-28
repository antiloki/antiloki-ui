// THE X-RAY PAGE, AS IT HAS ALWAYS BEEN (the operator 2026-11-19: "they were working and useful, I said they be here on this tab"): the space chips and the atlas view with its own tabs (overview, architecture, quality, history...).
// The route /operations/atlas and the X-ray tab of a team both draw this.
import React from "react";
import { AtlasView } from "@/loki/codebase/atlas-view";
import { C } from "@/loki/theme";
import { useXraySpace, XraySpaceContext } from "@/loki/codebase/xray-space";
import { XraySpaceBar } from "@/loki/codebase/xray-space-bar";

/** `embedded`: inside a team's tab it is about the workspace that is open (no space chips, and nothing that re-points the whole app's requests: that tore the pane down in a loop, 2026-11-19). */
export function XrayPage({ embedded = false, onEmpty }: { embedded?: boolean; /** the workspace holds no code: a team's tab opens the board instead (what its teams made needs no atlas) */ onEmpty?: () => void } = {}) {
  if (embedded) return <div data-testid="xray-embedded" style={{ height: "100%", overflow: "hidden", background: C.bg, position: "relative" }}><AtlasView autoRebuild onEmpty={onEmpty} emptyNote={<>X-ray reads <b style={{ fontWeight: 500 }}>source code</b>. This workspace has none to index (a marketing, notes or docs folder), so a rebuild finds nothing: that is not an error. What its teams made is on the X-ray board.</>} /></div>;
  return <XrayRouted />;
}
function XrayRouted() {
  const space = useXraySpace();
  return (
    <div style={{ height: "100%", overflow: "hidden", background: C.bg, position: "relative" }}>
      {space.ready ? <XraySpaceContext.Provider value={space}><XraySpaceBar /><AtlasView key={space.chosen ?? "active"} /></XraySpaceContext.Provider> : null}
    </div>
  );
}
