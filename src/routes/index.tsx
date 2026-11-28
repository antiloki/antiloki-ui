import { createFileRoute } from "@tanstack/react-router";
import { CoworkTerminals } from "@/loki/cowork/CoworkTerminals";
import { C } from "@/loki/theme";

// THE ONE HOME SCREEN IS COWORK (operator 2026-11-27: the old chat screen, reachable with `?cowork=chat` or a remembered choice, is gone).
export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Cowork · antiloki" }, { name: "description", content: "Agents side by side, in real terminals." }] }),
  component: CoworkHome,
});
function CoworkHome() {
  return <div style={{ height: "100%", minHeight: 0, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", background: C.bg, color: C.fg }}><CoworkTerminals /></div>;
}
