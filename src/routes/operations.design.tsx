import { createFileRoute } from "@tanstack/react-router";
import { DesignView } from "@/loki/codebase/design-view";

// antiIDE's second view (operator 2026-09-17) — the pill top-center flips back to Code.
function DesignScreen() {
  return (
    <>
      <DesignView />
    </>
  );
}

export const Route = createFileRoute("/operations/design")({
  component: DesignScreen,
});
