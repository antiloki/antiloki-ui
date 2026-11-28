import { createFileRoute } from "@tanstack/react-router";
import { XrayEmbed } from "@/loki/codebase/xray-embed";

// ONE PART OF X-RAY, FILLING THE PAGE: what a Cowork pane frames when an agent asks to see exactly one part (the system diagram, a file's review, the rules...). No shell around it: see `RootComponent`.
export const Route = createFileRoute("/embed/xray")({
  component: XrayEmbed,
});
