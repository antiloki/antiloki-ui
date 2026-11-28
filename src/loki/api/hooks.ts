import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { apiGet, apiPost, makePoll, sameOrNext, isNotWired } from "./client";
import { subscribeToSubstrate, isStreamHealthy, type EntityChange, type SubstrateChange } from "./events";
import { fetchWorkspaces, type WorkspaceList } from "./dispatch";
import type {
  FocusResponse, BoardEvaluation, DriverStatus, Card, CardSlim, Contract,
  InboxMessage, Session, Turn, ActionRow,
  AuditTimelineResponse, DriverTick, Notification, PersonasDashboardResponse,
  AICallSummary, AICallDetail, CostToday, SubSkillMatrixEntry, ProviderMixEntry,
  AgentMixEntry, CostSettings, Law, Bypass, PendingDiff, MemoryEntry,
  NextWorkItem, TriageRecommendationState, AgentMeta, AgentDetail,
  SkillCatalogEntry,
} from "./types";

type PollState<T> = {
  data: T | null;
  lastSuccessAt: number | null;
  loading: boolean;
  error: boolean;
  notWired: boolean;
  // FIX-TRANSIENT-VS-GONE (2026-06-11): the BE positively said NOT_FOUND for
  // this resource (engine 404 with an error code) — a DEFINITIVE answer,
  // unlike `error` which is transient (timeout, network, 5xx) and will be
  // retried. Screens were rendering "Slug not found" / "no cards" on
  // transients, which read as data loss every time a fetch hiccuped.
  gone: boolean;
};

// FEAT-FE-SSE-SUBSTRATE-STREAM: usePoll is now event-driven. It refetches when
// the BE pushes a "substrate changed" ping (debounced so a burst of pings
// collapses into one fetch) and keeps a slow safety-net poll that only fires
// when the SSE stream is unhealthy or has gone quiet — so an idle board with a
// live stream makes zero requests. The public signature + return shape are
// unchanged: every call site keeps passing its old intervalMs and gets the
// same { data, lastSuccessAt, loading, error, notWired, refetch }.
const SAFETY_FLOOR_MS = 30_000;   // safety-net poll never runs faster than this
const RECONCILE_MS = 120_000;     // even on a healthy stream, reconcile this often
const EVENT_DEBOUNCE_MS = 600;    // collapse a burst of pings into one fetch

// `live` surfaces (the active card's process stream, metrics, driver status)
// poll at their true requested cadence and never skip on a "healthy" stream.
// The stream-health skip is right for idle list views — but the 20s BE
// heartbeat keeps isStreamHealthy() permanently true, which silently turned
// the 2s live polls into "refetch only when the BE happens to ping," so a
// stage that ran for several seconds without an end-of-tick ping left the
// waterfall frozen on the prior phase, then "jumped" when the tick finished.
// live:true restores honest seconds-cadence polling for those few surfaces.
export function usePoll<T>(
  fetcher: () => Promise<T | null>,
  intervalMs: number,
  enabled = true,
  opts?: {
    live?: boolean; static?: boolean; topics?: string[];
    // Re-key: when a poller's TARGET changes (e.g. the selected session id) but
    // `enabled`/`intervalMs` don't, the effect below wouldn't re-run, so the
    // fetcher silently pointed at the new target yet never fired until the next
    // ping — an idle substrate (chat) emits none, so switching sessions looked
    // "locked". Pass a fetchKey that changes with the target to force an
    // immediate refetch + clean teardown on switch.
    fetchKey?: string | number | null;
    // EVENT-SOURCED-FE (Phase 5): patch ONE entity in place from a scoped ping
    // instead of refetching the whole payload. Gets the changed entities + the
    // current data; return patched data to SKIP the refetch, or undefined to
    // fall back to a full refetch (adds, unknown shape, fetch error).
    patch?: (entities: EntityChange[], prev: T) => Promise<T | undefined> | T | undefined;
  },
): PollState<T> & { refetch: () => void } {
  const live = opts?.live === true;
  // SSE topic filter: when set, substrate-changed pings that declare topics
  // only trigger a refetch on overlap (events.ts). Stable string key so a
  // fresh array literal per render doesn't re-subscribe.
  const topicsKey = opts?.topics && opts.topics.length > 0 ? opts.topics.join("|") : "";
  // `static` surfaces are catalog data (actions.steps_json, skill metadata)
  // that never changes mid-run. They skip the SSE substrate-changed
  // subscription entirely so a burst of pings during active ticking can't
  // re-fetch them per stage — they fetch once and rely only on the slow
  // safety net. This was the "skills?names refetch storm" on every ping.
  const isStatic = opts?.static === true;
  // A change here re-runs the effect (teardown + fresh run()) so a parameterized
  // poller refetches the instant its target switches, not on the next ping.
  const fetchKey = opts?.fetchKey ?? null;
  const [state, setState] = useState<PollState<T>>({
    data: null, lastSuccessAt: null, loading: true, error: false, notWired: false, gone: false,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const lastSuccessRef = useRef(0);
  // Request generation counter. Each run() claims a generation before
  // awaiting; only the LATEST generation may apply its response. Without
  // this, overlapping fetches (ping-debounce + safety poll + refetch) could
  // resolve out of order and a stale slow response would clobber newer data.
  const genRef = useRef(0);
  // FIX-TRANSIENT-VS-GONE: consecutive transient failures since the last
  // success. Drives the fast retry (don't strand a screen on a hiccup for
  // 30s) with a cap so a genuinely-down BE falls back to the safety poll
  // instead of hammering every 1.5s forever.
  const failuresRef = useRef(0);
  const ERROR_FAST_RETRY_MS = 1500;
  const ERROR_FAST_RETRY_MAX = 3;
  // Phase 5 patch path: read current data inside the async patch + the patch fn.
  const dataRef = useRef<T | null>(state.data);
  dataRef.current = state.data;
  const patchRef = useRef(opts?.patch);
  patchRef.current = opts?.patch;

  const run = useCallback(async () => {
    const gen = ++genRef.current;
    const next = await fetcherRef.current();
    if (gen !== genRef.current) return; // a newer run() superseded this one

    if (next == null) {
      failuresRef.current += 1;
      // Fast retry on transient failure — a single hiccup (timeout under a
      // request burst, BE mid-restart) used to leave "Slug not found"/"no
      // cards" on screen until the 30s safety poll. Guarded by gen so a
      // newer run cancels it, capped so a dead BE doesn't get hammered.
      if (failuresRef.current <= ERROR_FAST_RETRY_MAX) {
        setTimeout(() => { if (gen === genRef.current) run(); }, ERROR_FAST_RETRY_MS);
      }
      setState((prev) => ({ ...prev, loading: false, error: true }));
      return;
    }
    if (isNotWired(next)) {
      setState((prev) => ({ ...prev, loading: false, error: false, notWired: true, gone: false }));
      return;
    }
    // Engine 404 sentinel (parse404): the BE RAN and said NOT_FOUND — a
    // definitive answer, not data. Without this the sentinel object leaked
    // into `data` and screens rendered garbage fields off it.
    if ((next as any)?.__engine_error) {
      setState((prev) => ({ ...prev, data: null, loading: false, error: false, notWired: false, gone: true }));
      return;
    }
    failuresRef.current = 0;
    lastSuccessRef.current = Date.now();
    setState((prev) => ({
      data: sameOrNext(prev.data, next),
      lastSuccessAt: Date.now(),
      loading: false,
      error: false,
      notWired: false,
      gone: false,
    }));
  }, []);

  // A WORKSPACE SWITCH INVALIDATES EVERY POLLER, INCLUDING THE DISABLED AND THE STATIC ONES (operator 2026-09-25:
  // "on switching workspaces should show a loading on the entire screen and update with the new workspace data").
  //
  // The serve re-mounts another project's whole DB set on activation, so every payload this hook holds is now the
  // WRONG PROJECT'S — cards, panes, runs, costs. The data is DROPPED rather than refreshed in place: while we do not
  // know, showing nothing is honest and showing the other project is not.
  //
  // THIS LIVES IN ITS OWN EFFECT (2026-09-26, found auditing). Inside the main one it sat behind `if (!enabled)
  // return`, so a poller that happened to be switched off at the moment of the switch KEPT the old workspace's data
  // and handed it to the next component that rendered it. A disabled poller is not loading, though — it is simply
  // empty — so it drops its data without claiming a fetch is in flight.
  useEffect(() => {
    const onWorkspaceChanged = () => {
      genRef.current++;               // nothing in flight for the old workspace may land
      failuresRef.current = 0;
      lastSuccessRef.current = 0;     // the safety net may not skip on a stale success
      setState({ data: null, lastSuccessAt: null, loading: enabled, error: false, notWired: false, gone: false });
      if (enabled) void run();
    };
    window.addEventListener("antiloki:workspace-changed", onWorkspaceChanged);
    return () => window.removeEventListener("antiloki:workspace-changed", onWorkspaceChanged);
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled) return;
    // Initial load.
    run();

    // Refetch on substrate-changed pings. Trailing-edge debounce: a burst of
    // pings collapses into ONE fetch that fires after the LAST ping, so the
    // fetch always reflects the burst's final state (the old leading-edge
    // version fetched after the FIRST ping and dropped the rest of the burst).
    let debounce: any = null;
    let pendingEntities: EntityChange[] = [];
    // Try a per-entity patch first (Phase 5); fall back to a full refetch when
    // there's no patch fn, no entities, or the patch declines (returns undefined).
    const patchThenRun = async (entities: EntityChange[]) => {
      const patch = patchRef.current;
      const prev = dataRef.current;
      if (patch && entities.length > 0 && prev != null) {
        const gen = ++genRef.current;
        try {
          const patched = await patch(entities, prev as T);
          if (gen !== genRef.current) return; // a newer run() superseded this
          if (patched !== undefined) {
            failuresRef.current = 0;
            lastSuccessRef.current = Date.now();
            setState((p) => ({
              data: sameOrNext(p.data, patched), lastSuccessAt: Date.now(),
              loading: false, error: false, notWired: false, gone: false,
            }));
            return;
          }
        } catch { /* fall through to a full refetch */ }
        if (gen !== genRef.current) return;
      }
      run();
    };
    const onEvent = (change?: SubstrateChange) => {
      if (change?.entities) pendingEntities.push(...change.entities);
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        const entities = pendingEntities;
        pendingEntities = [];
        void patchThenRun(entities);
      }, EVENT_DEBOUNCE_MS);
    };
    const unsubscribe = isStatic
      ? () => {}
      : subscribeToSubstrate(onEvent, topicsKey ? topicsKey.split("|") : undefined);

    // Safety net. For non-live surfaces: a slow poll floored at 30s that skips
    // while the stream is healthy + recently reconciled (idle board → zero
    // requests). For live surfaces: poll at the requested interval and never
    // skip — the active card must stay live even when no ping arrives mid-tick.
    // intervalMs===0 means "fetch once, no polling" (e.g. useAICallDetail).
    let stopPoll: (() => void) | null = null;
    if (intervalMs > 0) {
      const floor = live ? intervalMs : Math.max(intervalMs, SAFETY_FLOOR_MS);
      stopPoll = makePoll(async () => {
        if (!live && isStreamHealthy() && Date.now() - lastSuccessRef.current < RECONCILE_MS) return;
        await run();
      }, floor);
    }

    return () => {
      if (debounce) clearTimeout(debounce);
      unsubscribe();
      if (stopPoll) stopPoll();
      // Invalidate any in-flight fetch: a response from the previous
      // enabled/interval configuration must not land in the next one's state.
      genRef.current++;
    };
  }, [enabled, intervalMs, live, isStatic, topicsKey, run, fetchKey]);

  return { ...state, refetch: run };
}

// ─── v1 ───────────────────────────────────────────────────────────────

export const useFocus = () =>
  usePoll<FocusResponse>(() => apiPost<FocusResponse>("/api/v1/focus", {}), 10_000);

export const useBoardEvaluation = () =>
  usePoll<BoardEvaluation>(() => apiPost<BoardEvaluation>("/api/v1/board/evaluate", {}), 10_000);

// Event-driven, NOT live. driver-status is an app-shell indicator rendered on
// every screen — polling it every 5s forever was a constant background storm on
// an idle/dormant board. The BE emits a substrate-changed ping on every tick
// that advances or fails (engine.service.ts), so this refetches on each ping and
// stays fresh during active work; when the board is dormant there is nothing to
// report and the 30s safety net skips while the stream is healthy. A genuinely
// dead BE stops heartbeating → the stream goes stale (50s) → the safety poll
// resumes and surfaces tick-loop-dead. (Was live:true, which hammered forever.)
// Dedupe across mounts: driver-status is rendered by topbar AND waterfall (and
// any other shell surface) simultaneously — without sharing, N mounts made N
// identical HTTP calls per ping/poll window. Module-level cache: one in-flight
// promise + 1s result reuse, so N mounts = 1 call per window.
const DRIVER_STATUS_REUSE_MS = 1000;
let driverStatusCachedAt = 0;
let driverStatusCached: DriverStatus | null = null;
let driverStatusInflight: Promise<DriverStatus | null> | null = null;

function fetchDriverStatusShared(): Promise<DriverStatus | null> {
  if (driverStatusCached !== null && Date.now() - driverStatusCachedAt < DRIVER_STATUS_REUSE_MS) {
    return Promise.resolve(driverStatusCached);
  }
  if (driverStatusInflight) return driverStatusInflight;
  driverStatusInflight = apiPost<DriverStatus>("/api/v1/driver/status", {})
    .then((d) => {
      driverStatusCached = d;
      driverStatusCachedAt = Date.now();
      return d;
    })
    .finally(() => { driverStatusInflight = null; });
  return driverStatusInflight;
}

export const useDriverStatus = () =>
  usePoll<DriverStatus>(fetchDriverStatusShared, 5_000, true, { topics: ["driver"] });

// EPIC-DRIVER-BULLETPROOF WS-5: the read-only dispatch queue — what the driver
// loop would pick next and why every other card is blocked. Pure read (wraps
// driver-schedule without ticking). Polled on the seconds timescale like the
// other live pipeline data so the operator sees the queue update as cards move.
export interface DriverQueueItem {
  position: number;
  slug: string;
  title: string | null;
  status: string;
  is_next: boolean;
  dispatchable: boolean;
  backoff: boolean;
  terminal: boolean;
  next_agent: string | null;
  next_action: string | null;
  reason: string | null;
}

export interface DriverQueue {
  next_card: string | null;
  next: { slug: string; title: string | null; agent: string | null; action: string | null; reason: string | null } | null;
  queue: DriverQueueItem[];
  counts: { total: number; dispatchable: number; blocked: number };
}

export const useDriverQueue = () =>
  usePoll<DriverQueue>(() => apiPost<DriverQueue>("/api/v1/driver/queue", {}), 5_000, true, { live: true });

// BE returns { messages: InboxMessage[], counts: { total, unread, archived } }.
// Hook unwraps to InboxMessage[] so callers can just slice() / map() / length.
// If the shape ever changes back to a bare array, the array fallback handles it.
export const useInbox = () =>
  usePoll<InboxMessage[]>(async () => {
    const raw = await apiPost<any>("/api/v1/inbox/list", { include_archived: false, limit: 5 });
    if (raw == null || isNotWired(raw)) return raw as any;
    if (Array.isArray(raw)) return raw as InboxMessage[];
    if (Array.isArray(raw?.messages)) return raw.messages as InboxMessage[];
    return [];
  }, 15_000);

// slim=1 drops body_json/accuracy_detail_json (the fat TEXT columns) —
// no list surface reads them. limit=2000 matches the BE's hard cap so the
// Board's column counts reflect the full table at today's ~600 cards.
// Real fix at >2000 cards: a /api/v1/cards/counts endpoint + pagination —
// still filed as a follow-up.
export const useCards = () =>
  usePoll<CardSlim[]>(
    () => apiGet<CardSlim[]>("/api/v1/cards?limit=2000&slim=1"),
    10_000,
    true,
    {
      topics: ["cards", "driver"],
      // EVENT-SOURCED-FE (Phase 5): on a precise card:<slug> ping, patch JUST
      // that card instead of refetching all ~2000. CardSlim = Card minus two fat
      // fields, so a single /cards/<slug> fetch → strip → merge. Anything
      // imprecise (add, no slug, a non-card change) returns undefined → full
      // refetch. driver/timeline entities are ignored (they affect other hooks).
      patch: async (entities, prev) => {
        const cards = entities.filter((e) => e.kind === "card" && e.id);
        if (cards.length === 0) return undefined; // adds / broad 'cards' → full refetch
        let next = prev;
        for (const e of cards) {
          if (e.op === "delete") { next = next.filter((c) => c.slug !== e.id); continue; }
          try {
            const full = await apiGet<Card>(`/api/v1/cards/${e.id}`);
            if (!full || (full as any).__engine_error || typeof (full as any).slug !== "string") return undefined;
            const { body_json: _b, accuracy_detail_json: _a, ...slim } = full as Card;
            const i = next.findIndex((c) => c.slug === slim.slug);
            next = i >= 0 ? next.map((c, j) => (j === i ? (slim as CardSlim) : c)) : [...next, slim as CardSlim];
          } catch { return undefined; }
        }
        return next;
      },
    },
  );

// FEAT-WORKSPACE-CRUD-API: registered workspaces + the active one. Switching
// is rare, so poll slowly; the switcher refetches on demand after activate.
/** a workspace was added or removed elsewhere (the new-workspace window): the list refetches now instead of at the next 30 s tick */
export const WORKSPACES_CHANGED = "antiloki:workspaces-changed";
// ONE REQUEST FOR ALL THE MOUNTS (Grokbot QA 2026-10-12, performance: "the Activity feed holds 323,684 events, system.workspace.list firing about once per millisecond"). `useWorkspaces` is mounted by fifteen
// components (the menus, the gate, the chat, the agents float...), and each one polled on every substrate ping: fifteen identical POSTs, each logged twice in the Activity table. Calls that arrive
// while one is in flight now share it. There is deliberately NO result cache: the switcher refetches right after activating a workspace and must see the new state.
let workspacesInflight: Promise<WorkspaceList | null> | null = null;
export function fetchWorkspacesShared(): Promise<WorkspaceList | null> {
  if (workspacesInflight) return workspacesInflight;
  workspacesInflight = fetchWorkspaces().finally(() => { workspacesInflight = null; });
  return workspacesInflight;
}
export function useWorkspaces() {
  const s = usePoll<WorkspaceList>(fetchWorkspacesShared, 30_000);
  const refetch = s.refetch;
  useEffect(() => { const h = () => refetch(); window.addEventListener(WORKSPACES_CHANGED, h); return () => window.removeEventListener(WORKSPACES_CHANGED, h); }, [refetch]);
  return s;
}

export const useCard = (slug: string | null | undefined) =>
  usePoll<Card>(
    () => (slug ? apiGet<Card>(`/api/v1/cards/${slug}`) : Promise.resolve(null)),
    10_000,
    !!slug,
    { topics: slug ? [`card:${slug}`, "driver"] : undefined },
  );

// EPIC-INTERACTION-ENVELOPE: knowledge.documents for the chat composer's
// "@knowledge" picker. Read-only projection (no bytes) from the BE.
export interface KnowledgeDoc {
  id: number;
  vault_path: string;
  doc_type: string;
  bytes: number;
  summary: string | null;
  ingested_at: string;
}

export const useKnowledgeDocs = (enabled = true) =>
  usePoll<KnowledgeDoc[]>(() => apiGet<KnowledgeDoc[]>("/api/v1/knowledge/docs?limit=100"), 15_000, enabled);

export const useContract = (slug: string | null | undefined) =>
  usePoll<Contract>(
    () => (slug ? apiGet<Contract>(`/api/v1/contracts/${slug}`) : Promise.resolve(null)),
    10_000,
    !!slug,
    { topics: slug ? [`card:${slug}`, "driver"] : undefined },
  );

// FEAT-FE-CARD-DETAIL-FROM-BOARD: list recent non-superseded contracts.
// Card-detail page filters this client-side to find the contract whose
// card_slug matches. BE has no contracts-by-card endpoint today, but the
// recent list is small (default 50) so the filter is cheap. If contract
// volume grows, replace with /api/v1/contracts?card_slug=… on the BE.
export const useContracts = () =>
  usePoll<Contract[]>(() => apiGet<Contract[]>("/api/v1/contracts"), 15_000);

export interface CardCommit {
  sha: string;
  short_sha: string;
  author_name: string;
  ts: string;
  subject: string;
}

export const useCardCommits = (slug: string | null | undefined) =>
  usePoll<CardCommit[]>(
    () => (slug ? apiGet<CardCommit[]>(`/api/v1/cards/${slug}/commits?limit=50`) : Promise.resolve(null)),
    30_000,
    !!slug,
  );

export const useActions = (names?: string[]) =>
  usePoll<ActionRow[]>(
    () =>
      apiGet<ActionRow[]>(
        names && names.length
          ? `/api/v1/actions?names=${encodeURIComponent(names.join(","))}`
          : "/api/v1/actions?limit=1000",
      ),
    30_000,
    true,
    { static: true },
  );

// Pass `names` to fetch only those skills' metadata (the waterfall does this
// lazily per expanded stage). With no argument it fetches the full catalog.
// An empty `names` array disables the fetch entirely — used when a stage's skill
// list isn't known yet, so nothing is downloaded until it is.
export const useSkills = (names?: string[]) =>
  usePoll<SkillCatalogEntry[]>(
    () =>
      apiGet<SkillCatalogEntry[]>(
        names && names.length
          ? `/api/v1/skills?names=${encodeURIComponent(names.join(","))}`
          : "/api/v1/skills",
      ),
    60_000,
    !names || names.length > 0,
    { static: true },
  );

// FEAT-STAGE-TEMPLATE-VIEWER: the ACTIVE registered prompt templates by
// name — what the waterfall's per-skill "template" button shows (the raw
// contract the model is held to, placeholders unfilled — distinct from the
// per-call rendered prompt the AI tab shows). Empty names disables the
// fetch; templates change only on version bumps, so static + long poll.
export interface PromptTemplateRow {
  name: string;
  version: number;
  template_md: string;
  system_md: string | null;
  default_tier: string | null;
  default_temperature: string | null;
  phase_flow: string | null;
  max_output_tokens: number | null;
}

export const usePromptTemplates = (names?: string[]) =>
  usePoll<PromptTemplateRow[]>(
    () =>
      apiGet<PromptTemplateRow[]>(
        `/api/v1/prompt-templates?names=${encodeURIComponent((names ?? []).join(","))}`,
      ),
    120_000,
    !!names && names.length > 0,
    { static: true },
  );

export const useChatSessions = () =>
  usePoll<Session[]>(() => apiGet<Session[]>("/api/v1/sessions"), 15_000);

// every widget/artefact + pinned context persisted to a session (turn-independent) — retrieve always.
export const useSessionWidgets = (sessionId: number | null | undefined, enabled = true) =>
  usePoll<any[]>(
    () => (sessionId ? apiGet<any[]>(`/api/v1/sessions/${sessionId}/widgets`) : Promise.resolve(null)),
    5_000,
    !!sessionId && enabled,
    { fetchKey: sessionId ?? null },
  );

export const useChatTurns = (sessionId: number | null | undefined, enabled = true) =>
  usePoll<Turn[]>(
    () => (sessionId ? apiGet<Turn[]>(`/api/v1/sessions/${sessionId}/turns`) : Promise.resolve(null)),
    5_000,
    !!sessionId && enabled,
    // Re-key on the session id so clicking another session refetches its turns
    // immediately (without this the thread stayed "locked" on the first session).
    { fetchKey: sessionId ?? null },
  );

// Pending enrichment/reshape proposal for one card. The BE lists all pending
// proposals; we filter to this slug and take the most recent. Backs the
// inline proposal review on the card-detail page (accept/reject/redo) so the
// operator never needs the separate /enrich screen.
export interface EnrichProposal {
  id: number;
  card_slug: string;
  current_body_json: string | null;
  proposed_body_json: string;
  confidence_overall: number;
  dropped_fields_json: string | null;
  status: string;
  cost_usd: number;
  reasoning: string | null;
  created_at: string;
  decided_at: string | null;
  decision: string | null;
  batch_id: string | null;
}

// Wrapped in { proposal } so "no pending proposal" is a real value (null
// inside the object) — usePoll treats a bare null as an error and keeps stale
// data, which would leave an accepted/rejected proposal lingering on screen.
export const useCardProposal = (slug: string | null | undefined) =>
  usePoll<{ proposal: EnrichProposal | null }>(async () => {
    if (!slug) return { proposal: null };
    const raw = await apiGet<EnrichProposal[]>("/api/v1/enrich/proposals?filter=pending&limit=200");
    if (raw == null || isNotWired(raw)) return raw as any;
    const mine = (Array.isArray(raw) ? raw : [])
      .filter((p) => p.card_slug === slug && p.decided_at == null);
    if (mine.length === 0) return { proposal: null };
    mine.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { proposal: mine[0] };
  }, 8_000, !!slug);

export const decideProposal = (
  id: number,
  decision: "accepted" | "rejected" | "edited",
  edited_body?: any,
  // Accept commits the body THEN recomputes the accuracy score via an AI call
  // (card-body-enrich-persist), so the endpoint takes several seconds — the 5s
  // apiPost default would time out → null → the FE skips the post-accept refresh
  // even though the write landed. Same fix as the reshape call.
) => apiPost<any>(`/api/v1/enrich/${id}/decide`, { decision, edited_body }, { timeoutMs: 120_000 });

// ─── v2 ───────────────────────────────────────────────────────────────

export const useAuditTimeline = (filters: any = {}, intervalMs = 30_000) => {
  const body = useMemo(() => ({ limit: 100, ...filters }), [JSON.stringify(filters)]);
  return usePoll<AuditTimelineResponse>(
    () => apiPost<AuditTimelineResponse>("/api/v1/audit/timeline", body),
    intervalMs,
  );
};

// The live activity log — every dispatched action/skill (runtime_events). sacred_timeline (above)
// is the SEALED audit and stays empty until cards do gated work; this is what's actually populated.
export interface RuntimeEvent {
  id: number; ts: string; parent_event_id: number | null;
  actor: string; agent: string; action: string; skill: string;
  duration_ms: number | null; outcome: string; error_code: string;
  user_goal_id: string | null; source: string;
}
export interface RuntimeEventsResponse { events: RuntimeEvent[]; total: number; sources: string[] }
export const useRuntimeEvents = (filters: any = {}, intervalMs = 10_000) => {
  const body = useMemo(() => ({ limit: 300, ...filters }), [JSON.stringify(filters)]);
  return usePoll<RuntimeEventsResponse>(() => apiPost<RuntimeEventsResponse>("/api/v1/runtime/events", body), intervalMs);
};

export const useDriverTicks = (limit = 30) =>
  usePoll<DriverTick[]>(() => apiPost<DriverTick[]>("/api/v1/driver/ticks", { limit }), 15_000);

export const useNotifications = () =>
  usePoll<Notification[]>(
    () => apiPost<Notification[]>("/api/v1/notifications/list", { include_dismissed: false, severity: "all", limit: 50 }),
    10_000,
  );

export const usePersonasDashboard = () =>
  usePoll<PersonasDashboardResponse>(
    () => apiPost<PersonasDashboardResponse>("/api/v1/personas/dashboard", { window_hours: 168 }),
    30_000,
  );

export const useAgents = () =>
  usePoll<AgentMeta[]>(() => apiGet<AgentMeta[]>("/api/v1/agents"), 60_000);

// EPIC-FE-PERSONA-PROFILE-SCREENS: full profile for one agent — identity,
// core prompt, custom prompt, granted actions expanded to composed skills.
export const usePersonaDetail = (name: string | null | undefined) =>
  usePoll<AgentDetail>(
    () => (name ? apiGet<AgentDetail>(`/api/v1/agents/${name}`) : Promise.resolve(null)),
    30_000,
    !!name,
  );

export const setAgentCustomPrompt = (name: string, custom_prompt_md: string | null) =>
  apiPost<AgentDetail>(`/api/v1/agents/${name}/custom-prompt`, { custom_prompt_md });

// EPIC-SUBAGENT: create a sub-agent leaf (a specialized child) + edit a leaf's
// tunable fields. Mirror setAgentCustomPrompt — audited driver-signed dispatch BE-side.
export const createSubagent = (body: {
  name: string; description: string; parent_agent?: string | null;
  specialization_md?: string | null; applies_to?: unknown; is_abstract?: number;
}) => apiPost<any>(`/api/v1/agents/subagent`, body);

export const updateSubagent = (name: string, body: {
  specialization_md?: string | null; applies_to?: unknown; description?: string; is_abstract?: number;
}) => apiPost<AgentDetail>(`/api/v1/agents/${name}/subagent`, body);

export const useAICalls = (filters: any = {}, intervalMs = 60_000) => {
  const body = useMemo(() => ({ limit: 100, ...filters }), [JSON.stringify(filters)]);
  return usePoll<AICallSummary[]>(
    () => apiPost<AICallSummary[]>("/api/v1/ai-calls", body),
    intervalMs,
  );
};

export const useAICallDetail = (id: number | null | undefined) =>
  usePoll<AICallDetail>(
    () => (id ? apiGet<AICallDetail>(`/api/v1/ai-calls/${id}`) : Promise.resolve(null)),
    0,
    !!id,
  );

export const useCostToday = () =>
  usePoll<CostToday>(() => apiPost<CostToday>("/api/v1/cost/today", {}), 60_000);

export const useCostMatrix = (windowHours = 24) =>
  usePoll<SubSkillMatrixEntry[]>(
    () => apiPost<SubSkillMatrixEntry[]>("/api/v1/cost/sub-skill-matrix", { window_hours: windowHours }),
    60_000,
  );

export const useProviderMix = (windowHours = 24) =>
  usePoll<ProviderMixEntry[]>(
    () => apiPost<ProviderMixEntry[]>("/api/v1/cost/provider-mix", { window_hours: windowHours }),
    60_000,
  );

export const useAgentMix = (windowHours = 24) =>
  usePoll<AgentMixEntry[]>(
    () => apiPost<AgentMixEntry[]>("/api/v1/cost/agent-mix", { window_hours: windowHours }),
    60_000,
  );

export const useCostSettings = () =>
  usePoll<CostSettings>(() => apiGet<CostSettings>("/api/v1/settings/cost/get"), 60_000);

export const useLaws = (filters: any = {}) =>
  usePoll<Law[]>(() => apiPost<Law[]>("/api/v1/laws/list", filters), 60_000);

export const useBypasses = (sinceTs?: string) =>
  usePoll<Bypass[]>(
    () => apiPost<Bypass[]>("/api/v1/bypasses/list", { since_ts: sinceTs, limit: 100 }),
    60_000,
  );

export const usePendingDiffs = () =>
  usePoll<PendingDiff[]>(() => apiGet<PendingDiff[]>("/api/v1/diffs/pending"), 15_000);

export const usePendingDiff = (id: number | null | undefined) =>
  usePoll<PendingDiff>(
    () => (id ? apiGet<PendingDiff>(`/api/v1/diffs/${id}`) : Promise.resolve(null)),
    15_000,
    !!id,
  );

export const useMemoryList = (filters: any = {}) =>
  usePoll<MemoryEntry[]>(
    () => apiGet<MemoryEntry[]>("/api/v1/memory" + buildQs(filters)),
    60_000,
  );

export const useMemoryEntry = (id: number | null | undefined) =>
  usePoll<MemoryEntry>(
    () => (id ? apiGet<MemoryEntry>(`/api/v1/memory/${id}`) : Promise.resolve(null)),
    60_000,
    !!id,
  );

// The whole memory graph (graph-RAG canvas): { nodes, edges }.
export interface MemoryGraphResponse {
  nodes: Array<{ id: number; type: string; title: string; created_by?: string; created_at?: string }>;
  edges: Array<{ from: number; to: number; kind: string; weight?: number; rationale?: string }>;
}
export const useMemoryGraph = (enabled = true) =>
  usePoll<MemoryGraphResponse>(() => apiGet<MemoryGraphResponse>("/api/v1/memory/graph"), 60_000, enabled);

// Cross-DB graph-RAG vector graph (docs/graph-rag-cross-db.md): chunks from every workspace DB except
// state + their kNN/ref edges. Powers the Knowledge graph canvas once a sweep has run.
export interface RagGraphResponse {
  nodes: Array<{ id: number; source_db: string; source_table: string; source_row: string; snippet: string }>;
  edges: Array<{ from: number; to: number; kind: string; score: number }>;
  by_db: Array<{ source_db: string; n: number }>;
  total: number;
}
export const useRagGraph = (enabled = true) =>
  usePoll<RagGraphResponse>(() => apiPost<RagGraphResponse>("/api/v1/rag/graph", { limit: 1500 }), 60_000, enabled);

// Read-only git snapshot for the Code screen's diff + git-graph split panels.
type GitCommit = { sha: string; parents: string[]; author: string; date: string; subject: string };
type GitFile = { status: string; path: string };
export interface GitRepoSnapshot {
  root: string; rel_path: string; label: string; is_git: boolean; branch?: string | null;
  commits: GitCommit[]; status: GitFile[]; last_commit_files: GitFile[];
}
export interface CodeGitResponse {
  is_git: boolean; root?: string; branch?: string | null;
  commits: GitCommit[];
  status: GitFile[];
  last_commit_files: GitFile[];
  // Every git repo found in the workspace (root + nested), each understood separately. Top-level fields
  // mirror the PRIMARY repo for back-compat; repos[] is the full list for the repo switcher.
  repos?: GitRepoSnapshot[];
}
export const useCodeGit = (enabled = true) =>
  usePoll<CodeGitResponse>(() => apiPost<CodeGitResponse>("/api/v1/code/git", { limit: 30 }), 20_000, enabled);

export const useNextWork = (limit = 10) =>
  usePoll<NextWorkItem[]>(
    () => apiPost<NextWorkItem[]>("/api/v1/recommend/next-work", { limit }),
    30_000,
  );

export const useTriageState = () =>
  usePoll<TriageRecommendationState[]>(
    () => apiPost<TriageRecommendationState[]>("/api/v1/triage/recommendation/list", {}),
    30_000,
  );

function buildQs(obj: Record<string, any>): string {
  const qs = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

// ── EPIC-PIPELINE-WATERFALL-LIVE ───────────────────────────────────────
export interface ActiveCard {
  id: number;
  slug: string;
  title: string;
  // 'doing' | 'awaiting_children' — FEAT-CARD-AWAITING-CHILDREN-STATUS:
  // parents waiting for children to close sit in 'awaiting_children'.
  status: string;
  awaiting_children_at: string | null;
  kind: string | null;
  size: string | null;
  priority: number | null;
  risk: number | null;
  complexity: number | null;
  score: number | null;
  driver_intent: string | null;
  // FIX-THRASH-VISIBILITY: recorded stage failure of the latest contract.
  last_failure_kind?: string | null;
  last_failure_at?: string | null;
  current_phase: string | null;
  last_event_ts: string | null;
  last_actor: string | null;
  last_operation: string | null;
}

export interface CardMetricsContract {
  slug: string;
  status: string;
  tier: string | null;
  size: string | null;
  signed_by: string | null;
  signed_at: string | null;
  sandbox_path: string | null;
  worktree_path: string | null;
  current_attempt: number | null;
  microtask_progress: { done: number; total: number; tasks: Array<string | Record<string, any>> };
  acceptance: Array<string | Record<string, any>>;
  files_touched: Array<string | Record<string, any>>;
  body_md: string | null;
  tl_evaluation_md: string | null;
  created_at: string;
  updated_at: string;
  failure_kind: string | null;
  rejection_reason_md: string | null;
}

export interface CardMetricsTick {
  id: number;
  started_at: string;
  ended_at: string | null;
  decided_agent: string | null;
  decided_action: string | null;
  decided_reason: string | null;
  outcome: string;
  error_message: string | null;
  cost_usd: number;
  duration_ms: number | null;
}

export interface CardMetrics {
  slug: string;
  cost_usd_actual: number;
  cost_usd_estimated_baseline: number;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  ai_calls_count: number;
  cached_calls: number;
  commit_count: number;
  driver_intent: string | null;
  lock_state: "locked" | "open";
  lock_age_seconds: number | null;
  drift_count: number;
  drift_recent?: Array<{
    id: number;
    ts: string;
    actor: string | null;
    agent: string | null;
    action: string | null;
    outcome: string | null;
    law_slug: string | null;
    reason: string | null;
  }>;
  contract: CardMetricsContract | null;
  last_tick: CardMetricsTick | null;
}

// Event-driven, NOT live. The topbar active-cards indicator renders app-wide;
// the BE pings on every tick that moves a card, so this refetches on each ping
// and stays fresh during active work, then goes quiet on a dormant board (the
// 30s safety net skips while the stream is healthy). Was live:true (2s forever),
// which — alongside driver-status — was the bulk of the steady "calls after
// calls" the operator saw on every screen.
export const useActiveCards = () =>
  usePoll<ActiveCard[]>(() => apiGet<ActiveCard[]>("/api/v1/cards-active"), 2_000, true, { topics: ["cards", "driver"] });

// EPIC-DRIVER-BULLETPROOF WS-4: the realigned pipeline SST (agent_stages).
// The waterfall derives its simplified plan/build/verify stage view by
// grouping these rows on fe_group, instead of a hardcoded PHASES list that
// drifts from the executor. action_name is the real dispatched action; steps
// within each stage still come from the live actions.steps_json.
export interface PipelineStage {
  agent: string;
  stage_name: string;
  pipeline_order: number;
  fe_group: string;
  description: string | null;
  action_name: string | null;
  invocation_pattern: string | null;
}

export interface PipelineResponse {
  needs_migration: string | null;
  stages: PipelineStage[];
}

export const usePipeline = () =>
  usePoll<PipelineResponse>(() => apiGet<PipelineResponse>("/api/v1/pipeline"), 60_000);

// `live` defaults to true (honest 2s cadence while a card is actively being
// worked). Pass live=false on a PARKED card (paused / terminal-rejected / done)
// so the surface drops to the 30s safety net instead of hammering the BE every
// 2s forever — a dormant board should make near-zero requests, matching the BE
// dormancy model. The expensive metrics + process-events polls were the bulk of
// the "calls after calls" storm on a stuck card.
export const useCardMetrics = (slug: string | null | undefined, live = true) =>
  usePoll<CardMetrics>(
    // 15s timeout (vs the 5s default): metrics aggregates over the big brain
    // tables; under driver write load it can exceed 5s, and an aborted fetch
    // read as a red call in devtools + stale data on screen.
    () => (slug ? apiGet<CardMetrics>(`/api/v1/cards/${slug}/metrics`, { timeoutMs: 15_000 }) : Promise.resolve(null)),
    2_000,
    !!slug,
    { live, topics: slug ? [`card:${slug}`, "driver"] : undefined },
  );

// Merged sacred_timeline + ai_calls + driver_ticks chronological stream.
// Each row has source: "audit" | "ai" | "tick" so the FE renders the
// appropriate row shape.
export interface ProcessEvent {
  source: "audit" | "ai" | "tick";
  id: string;
  ts: string;
  // audit
  operation?: string;
  actor?: string;
  entity_type?: string;
  entity_id?: string;
  digital_print_short?: string | null;
  exec_env?: string | null; // EPIC-DRIVER-WATERFALL-REDESIGN: worktree:<path> | sandbox:<path> | live
  diff_summary?: { added: string[]; modified: string[]; removed: string[] } | null;
  field_changes?: { key: string; from: string; to: string }[] | null;
  created?: boolean;
  field_count?: number;
  // ai
  prompt_name?: string | null;
  prompt_version?: number | null;
  tier?: string | null;
  temperature?: string | null;
  provider?: string | null;
  model_id?: string | null;
  // EPIC-SUBAGENT: the sub-agent leaf this call ran as (e.g. tl.dev.style, qa.lawyer).
  subagent?: string | null;
  outcome?: string;
  cost_usd_actual?: number;
  tokens_in?: number;
  tokens_out?: number;
  duration_ms?: number | null;
  cached?: boolean;
  rendered_prompt_md?: string | null;
  reasoning_md?: string | null; // FEAT-PROCESS-TERMINAL-TAB: a local reasoning model's captured <think> chain
  outputs?: Array<{ field_name: string; value: any }>;
  // ai — EPIC-AI-BEHAVIOR-STUDY (pairing / attempts / postmortem)
  ai_call_id?: number;
  phase?: "reason" | "format" | "single";
  reason_call_id?: number | null;
  pair_call_id?: number | null;
  attempts_count?: number;
  attempts?: Array<{ attempt_no: number; outcome: string; errors?: string[] | null }>;
  validation_errors?: string[] | null;
  report?: {
    failure_class: string;
    severity: string;
    diagnosis_md: string;
    narrative_md?: string | null;
    recommendation_md?: string | null;
  } | null;
  has_full_detail?: boolean;
  // tick
  ended_at?: string | null;
  decided_agent?: string | null;
  decided_action?: string | null;
  decided_reason?: string | null;
  error_message?: string | null;
  cost_usd?: number;
}

export const useCardProcessEvents = (slug: string | null | undefined, live = true) =>
  usePoll<ProcessEvent[]>(
    // 15s timeout: the merged stream reads sacred_timeline + brain tables and
    // can run past the 5s default under driver write load.
    () => (slug ? apiGet<ProcessEvent[]>(`/api/v1/cards/${slug}/process-events?limit=300`, { timeoutMs: 15_000 }) : Promise.resolve(null)),
    2_000,
    !!slug,
    { live, topics: slug ? [`card:${slug}`, "driver"] : undefined },
  );

// ── system.card.runtime.state — authoritative stage truth ─────────────
// A contract_qa_reviews verdict row, as surfaced by card-runtime-state. Shared
// by the AI review (latest_qa_review) and the deterministic coverage gate
// (latest_plan_coverage); review_mode discriminates them.
export interface QaReviewRow {
  id: number;
  ts: string;
  passed: number;
  verdict: string;
  failure_target: string | null;
  review_mode: "plan" | "full" | "plan-coverage" | "manifest-lint";
  findings_head: string;
  // FIX-QA-FINDINGS-FULL-DISPLAY: the COMPLETE findings + parsed issues — the
  // RED panel must never show an amputated verdict.
  findings_md?: string | null;
  issues?: Array<{
    severity: string;
    microtask_id: string;
    file: string;
    problem: string;
    fix_hint: string;
  }>;
}

// EPIC-SWARM: the blueprint manifest — the typed dataflow graph (blocks = files,
// bindings = the information-flow edges) the FE renders as the "Blueprint" panel.
export interface SwarmPort { name: string; type: string | null; external?: boolean }
export interface SwarmBlock {
  id: string;
  file: string;
  role: string;
  // EPIC-SUBAGENT: the symbol level (functions/variables this file exports/imports)
  // + the routed authoring leaf.
  subagent_id?: string | null;
  produces?: SwarmPort[];
  consumes?: SwarmPort[];
}
export interface SwarmBinding {
  from: { block: string; port: string };
  to: { block: string; port: string };
  type: string | null;
}
export interface SwarmManifest {
  version: number;
  goal: string | null;
  lint_passed: number | null;
  blocks: SwarmBlock[];
  bindings: SwarmBinding[];
}

// Cheap one-pass snapshot (contract status + last tick + halt/awaiting-human)
// the waterfall stage ladder derives its current stage from, instead of
// re-deriving it from the heavy process-events stream.
export interface CardRuntimeState {
  slug: string;
  card_status: string;
  driver_intent: string | null;
  contract: {
    slug: string;
    status: string;
    current_attempt: number | null;
    dev_microtask_progress: number | null;
    failure_kind: string | null;
    last_failure_kind: string | null;
    last_failure_md: string | null;
    last_failure_at: string | null;
    last_refine: Record<string, any> | null;
  } | null;
  last_tick: {
    id: number;
    started_at: string;
    decided_action: string | null;
    decided_reason: string | null;
    outcome: string;
  } | null;
  // FIX-QA1-TRUTH: latest contract_qa_reviews row — verdict truth for the
  // QA review stages (the action succeeding ≠ the review passing).
  // FIX-PLAN-QA-SPLIT (2026-06-14): review_mode gained 'plan-coverage' (the
  // deterministic gate) and the BE now surfaces it separately as
  // latest_plan_coverage so the FE can paint the coverage rung independently of
  // the AI review rung.
  latest_qa_review: QaReviewRow | null;
  latest_plan_coverage: QaReviewRow | null;
  // EPIC-SWARM: the deterministic manifest-lint verdict (its own rung), surfaced
  // separately like latest_plan_coverage so the FE paints it independently.
  latest_manifest_lint: QaReviewRow | null;
  // EPIC-SWARM: the active blueprint manifest (compact) for the Blueprint panel.
  // null unless the swarm has designed a manifest for this contract.
  swarm_manifest: SwarmManifest | null;
  halted: boolean;
  awaiting_human: boolean;
  pending_questions: number;
}

export const useCardRuntimeState = (slug: string | null | undefined, live = true) =>
  usePoll<CardRuntimeState>(
    () => (slug ? apiGet<CardRuntimeState>(`/api/v1/cards/${slug}/runtime-state`) : Promise.resolve(null)),
    2_000,
    !!slug,
    { live, topics: slug ? [`card:${slug}`, "driver"] : undefined },
  );

// ─── EPIC-OPERATOR-DRIFT-RESOLUTION ──────────────────────────────────
// Three sources merged: pending diffs · failed-last-tick · stuck contracts.
// id field is the compound "diff-<n>" / "tick-<n>" — pass it straight to
// the questionnaire + resolve endpoints.

export interface DriftItem {
  type: "diff" | "drift" | "stuck";
  id: string;
  slug: string | null;
  title?: string | null;
  age_seconds: number;
  severity: "info" | "warn" | "error";
  summary: string;
  last_error?: string | null;
  last_tick_id?: number | null;
  decided_agent?: string | null;
  decided_action?: string | null;
  source_id?: number;
  hint?: string | null;
}

export interface DriftQuestionnaireChoice {
  label: string;
  dispatch_action?: string;
  dispatch_input?: Record<string, any>;
  recommended?: boolean;
  free_text?: boolean;
  blocked?: boolean;
  blocked_reason?: string;
}

export interface DriftQuestionnaireQuestion {
  id: string;
  prompt: string;
  choices: DriftQuestionnaireChoice[];
}

export interface DriftQuestionnaire {
  drift_id: string;
  slug?: string;
  source_summary?: string;
  category?: string;
  last_error?: string;
  questions: DriftQuestionnaireQuestion[];
  error?: string;
}

export interface DriftResolution {
  ok: boolean;
  drift_id: string;
  dispatched_action?: string;
  result?: any;
  error?: string;
  turn_id?: number;
  // Populated on failure when the substrate writes to memory.error_events.
  // Lets the FE link a receipt to the audit row + show "this exact
  // pattern has happened N times" when we wire a pattern panel.
  error_event_id?: number | null;
  error_category?: string | null;
  error_pattern_key?: string | null;
}

export const useDriftFeed = (filter: "all" | "diff" | "drift" | "stuck" = "all") =>
  usePoll<DriftItem[]>(
    () => apiGet<DriftItem[]>(`/api/v1/drift?filter=${filter}&limit=100`),
    5_000,
  );

export const fetchDriftQuestionnaire = (driftId: string) =>
  apiGet<DriftQuestionnaire>(`/api/v1/drift/${encodeURIComponent(driftId)}/questionnaire`);

export const resolveDrift = (
  driftId: string,
  body: {
    question_id?: string;
    choice_label?: string;
    dispatch_action?: string;
    dispatch_input?: Record<string, any>;
    free_text?: string;
  },
) =>
  apiPost<DriftResolution>(`/api/v1/drift/${encodeURIComponent(driftId)}/resolve`, body);

// ─── FEAT-SUBSTRATE-FIREHOSE ─────────────────────────────────────────
// Cross-card chronological stream. Per-card waterfall stays the same;
// this is the "tail -f the whole substrate" view operators asked for.

export interface SubstrateStreamEvent {
  source: "audit" | "ai" | "tick" | "notification";
  id: string;
  ts: string;
  // audit
  actor?: string;
  operation?: string;
  entity_type?: string;
  entity_id?: string;
  digital_print_short?: string;
  payload_short?: string;
  // ai
  prompt_name?: string | null;
  prompt_version?: number | null;
  tier?: string | null;
  temperature?: string | null;
  provider?: string | null;
  model_id?: string | null;
  outcome?: string;
  cost_usd?: number;
  tokens_in?: number;
  tokens_out?: number;
  duration_ms?: number | null;
  cached?: boolean;
  // tick
  card_slug?: string | null;
  decided_agent?: string | null;
  decided_action?: string | null;
  decided_reason?: string | null;
  error_message?: string | null;
  // notification
  kind?: string;
  severity?: string;
  notif_source?: string;
  message?: string;
  dismissed?: boolean;
}

export const useSubstrateStream = (
  kinds: Array<"audit" | "ai" | "tick" | "notification"> = ["audit", "ai", "tick", "notification"],
  limit = 200,
) => {
  const kindsParam = kinds.join(",");
  return usePoll<SubstrateStreamEvent[]>(
    () => apiGet<SubstrateStreamEvent[]>(`/api/v1/substrate/stream?limit=${limit}&kinds=${kindsParam}`),
    2_000,
  );
};
