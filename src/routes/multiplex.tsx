import { createFileRoute } from "@tanstack/react-router";
import { MultiplexWindow } from "@/loki/avatars/MultiplexWindow";

// MULTIPLEX AS AN APP: the small window the browser installs (loki/avatars/multiplex-app.ts). The root draws it alone (no shell): see `RootComponent` in __root.tsx.
export const Route = createFileRoute("/multiplex")({ component: MultiplexWindow });
