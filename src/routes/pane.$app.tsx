import { createFileRoute } from "@tanstack/react-router";
import { SoloPane } from "@/loki/cowork/SoloPane";

// ONE PANE AS ITS OWN APP: the address holds the pane (loki/cowork/pane-app.ts). The root draws it alone (no shell): see `RootComponent` in __root.tsx.
export const Route = createFileRoute("/pane/$app")({ component: () => <SoloPane packed={new URLSearchParams(window.location.search).get("p") ?? ""} /> });
