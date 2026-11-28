import { createFileRoute } from "@tanstack/react-router";
import { XrayPage } from "@/loki/codebase/xray-page";

// EPIC-CODEBASE-ATLAS: the code-structure graph (nodes + edges + blast radius).
// antiIDE IS ONE PLACE WITH TWO VIEWS (operator 2026-09-17: "the same concept on antiIDE for Code and
// Design"): Code here, Design at /operations/design — the floating pill top-center flips between them.
// The design band that used to stack under the IDE is gone; Design is its own view. The scripts
// registry (build · dev · test · install · env) left this screen on 2026-09-19 for Settings › Environments —
// it is a runtime setting, next to docker/host, not an analysis.
//
// X-RAY ACROSS SPACES (operator 2026-11-10): the page is about ONE space at a time, chosen by the chips in its header band and remembered; the screen is keyed on it, so another space is a fresh page of that space's data.
export const Route = createFileRoute("/operations/atlas")({
  component: XrayPage,
});
