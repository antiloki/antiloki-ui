import { createFileRoute } from "@tanstack/react-router";
import { ClosedAvatar } from "@/loki/avatars/ClosedAvatar";

// THE ONE AVATAR (N13): the desktop shell's small window. The root draws it alone (no shell): see `RootComponent` in __root.tsx.
export const Route = createFileRoute("/avatar")({ component: ClosedAvatar });
