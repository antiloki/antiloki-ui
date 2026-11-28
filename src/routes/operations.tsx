import { createFileRoute, Outlet } from "@tanstack/react-router";
import { C } from "@/loki/theme";

export const Route = createFileRoute("/operations")({
  head: () => ({ meta: [{ title: "Operations · antiloki" }, { name: "description", content: "Board · Waterfall · Audit · Atlas." }] }),
  component: OperationsLayout,
});

// Redesign 2026-06-21: the legacy operations sub-tab bar (board/pipeline/audit/atlas) is gone —
// the discrete floating top nav handles those now. This layout just hosts the child screen on
// the new graphite bg.
function OperationsLayout() {
  return (
    // a DEFINITE height (operator 2026-09-20: "the code viewer gets the size of the file tree"): with
    // minHeight the column was content-sized, so X-ray's `height: 100%` resolved to auto and the IDE row
    // shrank to its tallest child — the tree. Long screens still scroll inside the inner div.
    <div style={{ background: C.bg, height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Outlet />
      </div>
    </div>
  );
}
