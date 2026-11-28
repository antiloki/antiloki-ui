// SAGAS (operator 2026-10-11): the third screen, next to Cowork and X-ray - sagas, their episodes and steps, per project.
import { createFileRoute } from "@tanstack/react-router";
import { SagasScreen } from "@/loki/sagas/sagas-screen";

export const Route = createFileRoute("/sagas")({ component: SagasScreen });
