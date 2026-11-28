import { pickFolderStrict, isDesktop } from "@/loki/desktop/shell";
import { setWorkspaceScope } from "./workspace-scope";
import { apiPost, apiGet, BE_URL, getFeSession, getRequestWorkspace } from "./client";
import type { FixOption, CostSettings, ByokStatus } from "./types";

export type DispatchResult = { ok: boolean; error?: string; nav?: string; openChat?: boolean; expandEpic?: string };

export async function dispatchFixOption(opt: FixOption): Promise<DispatchResult> {
  const cardSlug = opt.card_slug;
  try {
    switch (opt.action) {
      case "nav_card":
        return { ok: true, nav: cardSlug ? `/contracts/${cardSlug}` : "/operations" };

      case "set_intent": {
        if (!cardSlug || !opt.intent) return { ok: false, error: "missing card_slug/intent" };
        const r = await apiPost(`/api/v1/driver/card/${opt.intent}`, { slug: cardSlug });
        return { ok: r != null, error: r == null ? "request failed" : undefined };
      }

      case "set_status": {
        if (!cardSlug || !opt.status) return { ok: false, error: "missing card_slug/status" };
        const r = await apiPost(`/api/v1/dispatch`, {
          action_name: "board-keeper.card.status.change",
          input: { slug: cardSlug, status: opt.status },
        });
        return { ok: r != null };
      }

      case "pl_session_start": {
        if (!cardSlug) return { ok: false, error: "missing card_slug" };
        const r = await apiPost(`/api/v1/dispatch`, { action_name: "pl.session.start", input: { card_slug: cardSlug } });
        return { ok: r != null, openChat: true };
      }

      case "tick_now": {
        const r = await apiPost(`/api/v1/driver/tick-now`, {});
        return { ok: r != null };
      }

      case "restart_contract": {
        if (!cardSlug) return { ok: false, error: "missing card_slug" };
        const r = await apiPost(`/api/v1/driver/card/restart`, { slug: cardSlug });
        return { ok: r != null };
      }

      case "nav_fixit":
        return { ok: true, nav: "/operations" };

      case "nav_inbox":
      case "nav_chat":
        return { ok: true, openChat: true };

      case "show_children":
        return { ok: true, expandEpic: cardSlug };

      default:
        if (typeof console !== "undefined") console.warn("[dispatch] unknown action:", opt.action);
        return { ok: false, error: `action '${opt.action}' not yet wired in v1` };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "dispatch failed" };
  }
}

export async function dispatchAction(actionName: string, input: any = {}): Promise<DispatchResult> {
  const r = await apiPost(`/api/v1/dispatch`, { action_name: actionName, input });
  return { ok: r != null, error: r == null ? "dispatch failed" : undefined };
}

// Atlas rebuild caps — the editable family budget the PARTITIONED rebuild reads to bound memory
// (max_tokens/max_files per folder-family, max_file_bytes to skip pathological blobs). Uses the
// generic action dispatch, so no dedicated BE route is needed; both return the settings payload.
export type RebuildSettings = { max_tokens: number; max_files: number; max_file_bytes: number };
export async function fetchRebuildSettings(): Promise<RebuildSettings | null> {
  return apiPost(`/api/v1/dispatch`, { action_name: "system.codebase.rebuild.settings", input: { op: "get" } });
}
export async function saveRebuildSettings(patch: Partial<RebuildSettings>): Promise<RebuildSettings | null> {
  return apiPost(`/api/v1/dispatch`, { action_name: "system.codebase.rebuild.settings", input: { op: "set", ...patch } });
}

export async function setCardIntent(slug: string, intent: "play" | "pause" | "stop" | "restart") {
  return apiPost(`/api/v1/driver/card/${intent}`, { slug });
}

// FEAT-CARD-RUN-PREFLIGHT: the RUN gate. Runs deps-check + field-completeness
// + PL accuracy score and returns the verdict. The card may only join the
// driver when ok=true; otherwise blockers explain what to fix (hard-block).
export type PreflightBlocker = { code: string; message: string };
export type PreflightFieldIssue = { field: string; severity: "error" | "warn"; problem: string };
export type PreflightFieldScore = { field: string | null; score: number | null; issue: string };
export type PreflightResult = {
  ok: boolean;
  blockers: PreflightBlocker[];
  field_issues: PreflightFieldIssue[];
  accuracy_score: number | null;
  accuracy_summary: string | null;
  field_scores: PreflightFieldScore[];
  accuracy_min: number;
};
export async function cardPreflight(slug: string): Promise<PreflightResult | null> {
  // Runs a live PL AI evaluation server-side — give it room past the 5s default.
  const r: any = await apiPost(`/api/v1/driver/preflight`, { slug }, { timeoutMs: 120_000 });
  if (!r) return null;
  return (r.ok != null && Array.isArray(r.blockers) ? r : r.result) ?? null;
}

export async function reorderCard(slug: string, position: any) {
  return apiPost(`/api/v1/card/reorder`, { slug, position });
}

// FEAT-CARD-REWIND-TO-STAGE: rewind the driver PROCESS to an earlier pipeline
// stage. confirm:false = preview (returns would_clear counts, no mutation);
// confirm:true = execute. NOT a history revert — the audit chain is untouched;
// this resets mutable process state + GCs downstream artifacts so the state
// machine re-walks forward from the chosen stage.
export type RewindTarget = "redraft" | "microtasks" | "man_audit" | "sandbox" | "qa" | "post_qa"
  // v2 (blueprint pipeline) targets
  | "screening" | "blueprint" | "build";
export type RewindPreview = {
  preview: true;
  slug: string;
  target: RewindTarget;
  contract_slug?: string;
  new_status: string;
  would_clear: {
    qa_runs: number;
    man_reports: number;
    blueprints: number;
    pending_diffs: number;
    phase_events: number;
    journey: number;
    sandbox?: { path: string | null; will_delete: boolean };
  };
};
export type RewindResult = {
  slug: string;
  intent: "play";
  target: RewindTarget;
  new_contract_status: string;
  new_card_status: string;
  cleared_notifications?: number;
  next_step: string;
};
export async function rewindCardTo(
  slug: string,
  target: RewindTarget,
  confirm: boolean,
): Promise<RewindPreview | RewindResult | null> {
  const r: any = await apiPost(`/api/v1/driver/rewind`, { slug, target, confirm }, { timeoutMs: 30_000 });
  if (!r) return null;
  // action-run may return the skill result directly or nested under .result.
  return (r.preview != null || r.intent != null ? r : r.result) ?? null;
}

// FEAT-CARD-RESET-CLONE-ARCHIVE: "reset card" = clone the card's authored
// content into a FRESH backlog card + ARCHIVE the original. History is
// immutable, so this is NOT an in-place wipe and NOT a revert — it only appends
// two audit rows (card.add on the clone, card.status.change on the original).
// confirm:false = preview (returns the clone slug + what carries, no mutation);
// confirm:true = execute (returns the new clone slug to navigate to).
export type ResetPreview = {
  preview: true;
  slug: string;
  clone_slug: string;
  will_archive: string;
  clone_title: string;
  carries: {
    risk: number | null; complexity: number | null;
    priority: number | null; score: number | null; parent_slug: string | null;
  };
  next_step: string;
};
export type ResetResult = {
  executed: true;
  slug: string;
  clone_slug: string;
  archived: string;
  clone_title: string;
  next_step: string;
};
export async function resetCard(
  slug: string,
  confirm: boolean,
): Promise<ResetPreview | ResetResult | null> {
  const r: any = await apiPost(`/api/v1/driver/clone-archive`, { slug, confirm }, { timeoutMs: 30_000 });
  if (!r) return null;
  return (r.preview != null || r.executed != null ? r : r.result) ?? null;
}

// FEAT-PL-CLARIFY-IN-WATERFALL: when the driver parks a card "awaiting human",
// it's a PL session in `clarifying` with unanswered questions. These let the
// waterfall render the questions (A/B/C options + write-yourself) and record
// an answer in-app, which advances the session and unblocks the card.
export type PlClarifyOption = { id: number; option_md: string; order_index: number };
export type PlClarifyQuestion = {
  id: number;
  step: string;
  question_md: string;
  allows_writein: boolean;
  order_index: number;
  options: PlClarifyOption[];
  answer: { selected_option_id: number | null; writein_md: string | null } | null;
};
export type PlClarifyState = {
  pl_session: { id: number; status: string } | null;
  awaiting_human: boolean;
  pending_count: number;
  questions: PlClarifyQuestion[];
};

export async function plClarifyState(slug: string): Promise<PlClarifyState | null> {
  const r: any = await apiPost(`/api/v1/pl/clarify/state`, { slug });
  if (!r || r.__not_wired) return null;
  // action-run may return the skill result directly or nested under .result.
  return (r.awaiting_human != null ? r : r.result) ?? null;
}

export async function plClarifyAnswer(
  question_id: number,
  choice: { selected_option_id?: number; writein_md?: string },
): Promise<boolean> {
  const r = await apiPost(`/api/v1/pl/clarify/answer`, { question_id, ...choice });
  return r != null && !(r as any).__not_wired;
}

// FEAT-CARD-ACCURACY-SCORE: (re)compute just the PL accuracy score for a
// card. Triggered by clicking the accuracy chip. Runs a live PL AI call
// server-side, so give it room past the 5s default. The score is persisted
// to the card row — callers refetch the card to read the fresh value.
export async function recomputeAccuracy(slug: string, reason?: string): Promise<boolean> {
  const r = await apiPost(
    `/api/v1/card/accuracy/recompute`,
    { slug, ...(reason ? { reason } : {}) },
    { timeoutMs: 120_000 },
  );
  return r != null;
}

// EPIC-INTERACTION-ENVELOPE: "@" references + file attachments the operator
// pulled into the composer. The BE assembles these into the interaction
// envelope and grounds the AI on the referenced content.
export type ChatRef =
  | { ref_type: "card"; id: string }
  | { ref_type: "knowledge"; id: number }
  | { ref_type: "db_row"; id: string | number; table: string }
  // a workspace-relative source path — resolved server-side to the real file content (bounded).
  | { ref_type: "code_file"; id: string }
  // a LIVE substrate source kind (ast/digest/cards/failures/memory/…) — the studio chip catalog,
  // resolved server-side by the same gather the cockpit source preview uses.
  | { ref_type: "source"; id: string };
export type ChatAttachment = { document_id: number };

// POST a chat turn to the interviewer. The BE TurnDto expects `user_text`
// (+ optional `user_identifier` for session grouping) — the old payload sent
// `content`/`session_id`, which the BE validator rejected, so every message
// silently failed. user_identifier groups a tab's turns into one session.
export async function sendChatTurn(
  content: string,
  userIdentifier?: string,
  references?: ChatRef[],
  attachments?: ChatAttachment[],
  modelId?: string | null, // COCKPIT Wave 3: pin an exact model for this turn (null/undefined = auto)
  sessionId?: number | null, // SESSION IS THE UNIT: the turn lands in the session being VIEWED
  screenMd?: string | null, // SCREEN MANIFEST: what the operator SEES right now, serialized deterministically
  priorMd?: string | null, // EPISODES: the previous episode's consolidated snapshot (rolling context)
) {
  // 300s: the turn runs interviewer-chat (low tier). On a local Ollama low tier that's CPU-bound,
  // a reply can take minutes — a 120s abort returned null and the message vanished silently. For a
  // snappy chat, pin/route to a fast (hosted) model; this just stops the premature abort.
  return apiPost(`/api/v1/turn`, {
    user_text: content,
    ...(sessionId != null ? { session_id: sessionId } : {}),
    ...(userIdentifier ? { user_identifier: userIdentifier } : {}),
    ...(references && references.length ? { references } : {}),
    ...(attachments && attachments.length ? { attachments } : {}),
    ...(modelId ? { model_id: modelId } : {}),
    ...(screenMd && screenMd.trim() ? { screen_md: screenMd.slice(0, 20000) } : {}), // the BE DTO caps at 20000; the interviewer folds it whole
    ...(priorMd && priorMd.trim() ? { episode_prior_md: priorMd.slice(0, 4000) } : {}),
  }, { timeoutMs: 300_000 });
}

// COCKPIT Wave 4: the direct-AI terminal REPL (isolated from the chat thread). The FE owns the
// transcript + passes the recent history. Returns { response, ai_call_id, model_id, provider, cost_usd }.
export async function sendTerminalCommand(
  userInput: string,
  history?: { role: string; text: string }[],
  modelId?: string | null,
  contextFlags?: { laws?: boolean; memory?: boolean; codebase?: boolean },
  scope?: { exclude_folders?: string[]; include_folders?: string[] },
  sessionId?: string | null,
) {
  const hasScope = scope && ((scope.exclude_folders && scope.exclude_folders.length) || (scope.include_folders && scope.include_folders.length));
  return apiPost(`/api/v1/terminal`, {
    user_input: userInput,
    ...(history && history.length ? { history } : {}),
    ...(modelId ? { model_id: modelId } : {}),
    ...(contextFlags ? { context_flags: contextFlags } : {}),
    ...(hasScope ? { scope } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
  }, { timeoutMs: 300_000 });
}

// Terminal writable sandbox ops (the worktree is provisioned server-side on run; this drives the
// review/merge-back: diff = show the patch, apply = gated git-apply to the real tree, discard = teardown).
export async function sendTerminalSandbox(mode: "diff" | "apply" | "discard", sessionId: string, allowFolders?: string[]) {
  return apiPost(`/api/v1/terminal/sandbox`, { mode, session_id: sessionId, ...(allowFolders ? { allow_folders: allowFolders } : {}) }, { timeoutMs: 120_000 });
}

// ⛨ the sentinel's close-time consolidation — dispatches system.episode.consolidate (deterministic
// report + flags always; one gated low-tier headline/narrative when the chapter is big enough).
export async function consolidateEpisodeRemote(session_id: number) {
  return apiPost(`/api/v1/episode/consolidate`, { session_id }, { timeoutMs: 90_000 });
}

// Cross-DB graph-RAG: re-index the workspace DBs (embed → rag_chunks → rebuild graph). Slow on the
// first run (the embed model cold-loads), so a long timeout. Returns the sweep stats.
export async function sendRagSweep() {
  return apiPost(`/api/v1/rag/sweep`, {}, { timeoutMs: 300_000 });
}

// COCKPIT Wave 6: DeepSearch — research across the selected scopes → a synthesized document.
// Returns { title, md, citations, finding_count, ai_call_id, cost_usd }.
export async function sendDeepSearch(
  query: string,
  scopes?: string[],
  modelId?: string | null,
) {
  return apiPost(`/api/v1/deepsearch`, {
    query,
    ...(scopes && scopes.length ? { scopes } : {}),
    ...(modelId ? { model_id: modelId } : {}),
  }, { timeoutMs: 180_000 });
}

// POST a file to the upload endpoint (multipart). Returns the indexed
// knowledge.documents row id so the composer can attach it to the next turn.
export type UploadResult = {
  document_id: number;
  doc_type: string;
  title: string;
  vault_path: string;
  sha256: string;
  bytes: number;
  mime: string;
  idempotent: boolean;
};
export async function uploadFile(file: File): Promise<UploadResult | null> {
  const form = new FormData();
  form.append("file", file);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${BE_URL}/api/v1/upload`, {
      method: "POST",
      headers: { accept: "application/json", "X-FE-Session": getFeSession() },
      body: form,
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const r: any = await res.json();
    // action-run may return the skill result directly or nested under .result.
    return (r?.document_id != null ? r : r?.result) ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Ask the AI about a card (whole card or one field). Unlike the interviewer
// (which proposes mutations), this is grounded read-only Q&A: the BE
// dispatches system.card.discuss and returns { answer_md, ... }. Used by the
// "discuss" buttons on the card header + each field.
export type DiscussOperation = "expand" | "summarize" | "simplify";
export type DiscussResult = {
  slug: string;
  field: string | null;
  operation: DiscussOperation | null;
  question: string;
  answer_md: string;
  ai_call_id: number | null;
  cost_usd: number;
};
export async function sendCardDiscuss(
  slug: string,
  question?: string,
  field?: string,
  operation?: DiscussOperation,
  references?: ChatRef[],
  attachments?: ChatAttachment[],
): Promise<DiscussResult | null> {
  // This dispatches a live AI call (the BE spawns the model), which routinely
  // runs longer than the default 5s client timeout. Give it room — otherwise
  // the fetch aborts while the BE completes, and the answer is lost.
  const r: any = await apiPost(`/api/v1/discuss`, {
    slug,
    ...(field ? { field } : {}),
    ...(operation ? { operation } : {}),
    ...(question ? { question } : {}),
    ...(references && references.length ? { references } : {}),
    ...(attachments && attachments.length ? { attachments } : {}),
  }, { timeoutMs: 120_000 });
  if (!r) return null;
  // action-run may return the skill result directly or nested under .result.
  return (r.answer_md != null ? r : r.result) ?? null;
}

// ✂ Simplify / ⤢ Expand ONE chat reply in place (the buttons under each response). The BE
// dispatches system.turn.rewrite — read-only, grounded in the original answer; the thread swaps
// the bubble client-side (display-only, ↩ original always available).
export type RewriteOperation = "simplify" | "expand";
export type RewriteResult = {
  turn_id: number;
  operation: RewriteOperation;
  answer_md: string;
  ai_call_id: number | null;
  cost_usd: number;
  model_id: string | null;
};
export async function sendTurnRewrite(turnId: number, operation: RewriteOperation): Promise<RewriteResult | null> {
  const r: any = await apiPost(`/api/v1/turn/rewrite`, { turn_id: turnId, operation }, { timeoutMs: 120_000 });
  if (!r) return null;
  return (r.answer_md != null ? r : r.result) ?? null;
}

// Studio result durability: anchor a generated widget/artifact to its chat turn
// (interviewer_turn_widgets) so a reloaded session re-renders it via deriveWidgets.
// SESSION-SCOPED (operator 2026-07-25): persist to the SESSION so it's retrievable always — a turn is
// optional (render-order hint). session_id is the durable anchor; it works even before the first message.
export async function saveTurnWidget(
  args: { session_id?: number | null; turn_id?: number | null; type: "widget" | "artifact"; kind: string; payload: any },
): Promise<{ ok: boolean; id?: number; session_id?: number } | null> {
  const r: any = await apiPost(`/api/v1/turn/widget`, {
    session_id: args.session_id ?? undefined,
    turn_id: args.turn_id ?? undefined,
    type: args.type, kind: args.kind, payload: args.payload,
  }, { timeoutMs: 30_000 });
  if (!r) return null;
  return (r.ok != null ? r : r.result) ?? null;
}

// Eager session creation — "New chat" creates the session up front so widgets/context can persist
// before any message. Returns the new session id (or null if the endpoint is unavailable).
export async function createChatSession(user_identifier?: string): Promise<number | null> {
  const r: any = await apiPost(`/api/v1/session/create`, { user_identifier }, { timeoutMs: 15_000 });
  const res = (r?.ok != null ? r : r?.result) ?? null;
  return res?.session_id != null ? Number(res.session_id) : null;
}

// EPIC-FE-CUSTOM-LAW-MANAGEMENT: operator-confirmed dispatch. system-owned
// actions (system.law.add, system.law.set.active) are NOT on the god-action
// allowlist, so they reach the substrate only through the interviewer
// propose→"go" path: POST /turn with a prebuilt plan, then POST /dispatch
// with confirmation_text "go". The actor is attributed as interviewer:confirmed.
async function operatorDispatch(action: string, args: any, userText: string): Promise<DispatchResult> {
  try {
    const turn: any = await apiPost(`/api/v1/turn`, {
      user_text: userText,
      user_identifier: "danil",
      prebuilt_plan: [{ action, args, risk_tier: "medium" }],
    }, { timeoutMs: 60_000 });
    const turnId = turn?.turn_id;
    if (turnId == null) return { ok: false, error: "no turn_id returned" };
    const res: any = await apiPost(`/api/v1/dispatch`, {
      turn_id: turnId,
      confirmation_text: "go",
    }, { timeoutMs: 60_000 });
    const result = Array.isArray(res?.results) ? res.results.find((r: any) => r.action === action) : null;
    if (!result) return { ok: false, error: "no dispatch result" };
    return { ok: result.ok === true, error: result.ok ? undefined : (result.error || "dispatch failed") };
  } catch (e: any) {
    return { ok: false, error: e?.message || "dispatch failed" };
  }
}

// FEATURE-DESIGN WIZARD (operator 2026-07-10): file a card from the wizard's hand-off step.
// Same operator-confirmed propose→"go" seam as law management — board-keeper.card.add is not on
// the god allowlist, and the click on "file the cards" IS the operator's confirmation. The body
// must match the canonical card-body schema (kind + size required, canonical enums).
export async function dispatchCardAdd(card: { slug: string; title: string; body: Record<string, any>; parent_slug?: string | null }): Promise<DispatchResult> {
  return operatorDispatch("board-keeper.card.add", { slug: card.slug, title: card.title, body: card.body, ...(card.parent_slug ? { parent_slug: card.parent_slug } : {}) }, `file card from the design wizard: ${card.title}`);
}

// Confirm a chat turn that proposed a medium/high-risk action. The interviewer
// chat (POST /turn) already created + persisted the turn with its plan; the user
// pressing "go" only needs to dispatch it. interviewer-dispatch returns
// { ok, failed, errors, results } — ok=false when every proposed action threw
// (the silent-swallow fix), so the chat can report a real failure instead of a
// false success.
export async function confirmInterviewerTurn(
  turnId: number | string,
  confirmationText = "go",
): Promise<DispatchResult> {
  try {
    const res: any = await apiPost(`/api/v1/dispatch`, {
      turn_id: turnId,
      confirmation_text: confirmationText,
    }, { timeoutMs: 60_000 });
    if (res?.ok === false || res?.failed === true) {
      const first = Array.isArray(res?.errors) && res.errors.length ? res.errors[0] : null;
      return { ok: false, error: first ? `${first.action}: ${first.error}` : "dispatch failed" };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "dispatch failed" };
  }
}

// ─── FEAT-INTERVIEWER-ERROR-RESOLVE: in-chat error resolution ────────────
// When a confirm/dispatch fails (git code-drift blocking card.add, or a law
// denial), the chat surfaces ~3 selectable alternatives instead of dumping a
// raw error. The git-drift path offers commit-from-chat: list the pending
// files, confirm a message, commit ONLY those files, then re-confirm "go".

export type ErrorAlternativeKind =
  | "commit_pending"
  | "retry"
  | "rephrase"
  | "write_myself"
  | "guidance";
export type ErrorAlternative = { key: string; label: string; action_kind: ErrorAlternativeKind; hint?: string };
export type ErrorResolution = {
  kind: "git_drift" | "law_denied" | "unknown";
  law?: string;
  message_md: string;
  alternatives: ErrorAlternative[];
};

const WRITE_MYSELF: ErrorAlternative = { key: "W", label: "Write it myself", action_kind: "write_myself" };

// Client mirror of .antiloki/skills/agents/in/interviewer-error-resolve.mjs —
// kept in sync with that skill's mapping so the chat can fork without a round
// trip. (The substrate skill is the source of truth + has the tests.)
export function resolveDispatchError(error: string): ErrorResolution {
  const msg = typeof error === "string" ? error : String(error ?? "");
  const lawMatch = msg.match(/law '([A-Z0-9_]+)'/);
  const law = lawMatch ? lawMatch[1] : undefined;
  const isDrift = law === "COMMIT_CODE_BEFORE_AUDIT_COMMIT" || /code drift detected/i.test(msg);
  if (isDrift) {
    return {
      kind: "git_drift",
      law: "COMMIT_CODE_BEFORE_AUDIT_COMMIT",
      message_md:
        "You have uncommitted code changes. The board can't move until that code is committed.",
      alternatives: [
        { key: "C", label: "Commit my pending code & create the card", action_kind: "commit_pending" },
        { key: "M", label: "I'll commit manually first", action_kind: "guidance", hint: "Dismiss and commit in your terminal, then retry." },
        WRITE_MYSELF,
      ],
    };
  }
  if (law || /PERMISSION_DENIED/.test(msg)) {
    return {
      kind: "law_denied",
      law,
      message_md: law ? `Blocked by rule \`${law}\`.` : "That action was denied by a rule.",
      alternatives: [
        { key: "R", label: "Rephrase my request", action_kind: "rephrase" },
        { key: "T", label: "Retry", action_kind: "retry" },
        WRITE_MYSELF,
      ],
    };
  }
  return {
    kind: "unknown",
    message_md: msg || "Something went wrong.",
    alternatives: [
      { key: "T", label: "Retry", action_kind: "retry" },
      { key: "R", label: "Rephrase my request", action_kind: "rephrase" },
      WRITE_MYSELF,
    ],
  };
}

// Read-only: the uncommitted code-drift set the law blocks on.
export type PendingFiles = { files: string[]; count: number };
export async function fetchPendingFiles(): Promise<PendingFiles | null> {
  const r: any = await apiPost(`/api/v1/git/pending/list`, {}, { timeoutMs: 30_000 });
  if (!r) return null;
  const res = Array.isArray(r.files) ? r : r.result;
  return res ? { files: res.files ?? [], count: res.count ?? (res.files?.length ?? 0) } : null;
}

// Commit ONLY the operator-selected pending files with a confirmed message.
// Never git add -A — the BE intersects with the live drift set.
export type CommitPendingResult = { ok: boolean; committed?: number; files?: string[]; gitSha?: string; error?: string };
export async function commitPendingFiles(files: string[], message: string): Promise<CommitPendingResult> {
  try {
    const res = await fetch(`${BE_URL}/api/v1/git/pending/commit`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "X-FE-Session": getFeSession() },
      body: JSON.stringify({ files, message }),
    });
    const text = await res.text();
    const data: any = text ? JSON.parse(text) : null;
    if (!res.ok) {
      return { ok: false, error: data?.error?.cause || data?.message || `commit failed (${res.status})` };
    }
    const r = data?.committed != null ? data : data?.result;
    return { ok: r?.committed != null, committed: r?.committed, files: r?.files, gitSha: r?.gitSha };
  } catch (e: any) {
    return { ok: false, error: e?.message || "commit failed" };
  }
}

export type NewCustomLaw = {
  slug: string;
  title: string;
  statement: string;
  rationale?: string;
  domain?: string;
  kind?: "principle" | "decision" | "procedural" | "permission";
};

export async function addCustomLaw(law: NewCustomLaw): Promise<DispatchResult> {
  return operatorDispatch("system.law.add", {
    slug: law.slug,
    title: law.title,
    statement: law.statement,
    ...(law.rationale ? { rationale: law.rationale } : {}),
    domain: law.domain || "custom",
    kind: law.kind || "principle",
    enforcement: "soft",
  }, `Add a custom rule "${law.slug}".`);
}

export async function setLawActive(slug: string, active: boolean): Promise<DispatchResult> {
  return operatorDispatch("system.law.set.active", { slug, active },
    `${active ? "Activate" : "Deactivate"} the custom rule "${slug}".`);
}

// ─── workspaces (FEAT-WORKSPACE-CRUD-API) ───────────────────────────────
// The substrate can point antiloki's driver at an external managed project
// ("workspace"). The registry of workspaces + which is active lives in the
// substrate state DB; switching takes effect on the next substrate restart,
// when openDb mounts the active workspace's own DB set.
export type Workspace = {
  id: number;
  name: string;
  root_path: string;
  vcs: string;
  is_active: number;
  db_dir: string | null;
  created_at: string;
  // the registered folder is gone from the disk (moved, trashed, unmounted) - the serve flags it, never deletes the row (operator 2026-10-01)
  missing?: boolean;
};
export type WorkspaceList = { workspaces: Workspace[]; active: Workspace | null; count: number };

export async function fetchWorkspaces(): Promise<WorkspaceList | null> {
  const r: any = await apiPost(`/api/v1/workspaces/list`, {});
  if (!r) return null;
  // action-run may return the skill result directly or nested under .result.
  let list: WorkspaceList | null = (Array.isArray(r.workspaces) ? r : r.result) ?? null;
  // a screen reading ANOTHER workspace than the active one (X-ray's space filter) sees that one as "the workspace": the name, the root, the scope of what the browser remembers
  const chosen = getRequestWorkspace();
  if (list && chosen) {
    const w = list.workspaces?.find((x) => x.root_path === chosen);
    // (the rows keep the serve's own `is_active`, so the switcher can still say which workspace the serve has open)
    if (w) list = { ...list, active: { ...w, is_active: 1 } };
  }
  if (list) setWorkspaceScope(list.active?.root_path ?? list.workspaces?.find((w) => w.is_active)?.root_path);
  return list;
}

// What the BE host's folder dialog came back with. `path` is null both when the
// operator cancels and when the host has no dialog to show, so `supported` is
// what separates them — without it the browse button is indistinguishable from
// a dead one on any host lacking a picker.
export interface FolderPick {
  path: string | null;
  supported: boolean;
}

// Open the host OS's native folder dialog on the BE host; returns the chosen
// absolute path (null if canceled or unsupported — read `supported` to tell
// which). The dialog blocks on the user, so allow a long timeout. Browsers
// can't read absolute paths, hence the BE round-trip.
export async function pickWorkspaceFolder(): Promise<FolderPick> {
  // THE SHELL'S OWN DIALOG FIRST (operator 2026-09-24, from the installed build: "the binary has a bug on click
  // open project doesnt open the file explorer to choose a folder"). The serve's picker is a PowerShell/COM
  // dialog that exists on Windows only and returns no path anywhere else, so on Linux and macOS this button
  // opened nothing and — because the handler omitted `supported` and the default below is true — said nothing
  // either. Inside the desktop app the dialog plugin works on all three platforms.
  // The app's own dialog first (the OS's own window on every platform). Only if it could not open is the serve asked: it runs on the same machine and tries zenity, kdialog, yad, qarma and the desktop's portal on Linux, PowerShell on Windows.
  if (isDesktop()) {
    try { return { path: await pickFolderStrict(), supported: true }; } catch (e) { console.warn("[desktop] folder dialog failed, asking the serve", e); }
  }
  const r: any = await apiPost(`/api/v1/workspaces/pick-folder`, {}, { timeoutMs: 300_000 });
  // supported defaults TRUE when the BE omits it: an older BE only ever answered
  // with a path, and treating its silence as "no dialog here" would put the
  // unavailable message on every cancel.
  return { path: r?.path ?? null, supported: r?.supported !== false };
}

// FEAT-DRIVER-PR-GATE: per-card merge policy. auto_merge=0 (default) ships QA-green
// work as a pull request (Pulls screen, operator merges); 1 merges immediately.
export async function setCardAutoMerge(card_slug: string, auto_merge: boolean): Promise<boolean> {
  const r: any = await apiPost(`/api/v1/cards/automerge`, { card_slug, auto_merge: auto_merge ? 1 : 0 });
  return !!r;
}

// Register + provision a new managed project. Its own fetch (not apiPost) so
// the substrate's validation cause (bad slug / missing path) reaches the form;
// apiPost discards the error body. Returns the cause on failure.
export type AddWorkspaceResult = { ok: boolean; name?: string; db_dir?: string; error?: string };
export async function addWorkspace(name: string, root_path: string): Promise<AddWorkspaceResult> {
  try {
    const res = await fetch(`${BE_URL}/api/v1/workspaces/add`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "X-FE-Session": getFeSession() },
      body: JSON.stringify({ name, root_path }),
    });
    const text = await res.text();
    const data: any = text ? JSON.parse(text) : null;
    if (!res.ok) {
      return { ok: false, error: data?.error?.cause || data?.message || `add failed (${res.status})` };
    }
    const r = data?.ok != null ? data : data?.result;
    return { ok: r?.ok === true, name: r?.name, db_dir: r?.db_dir };
  } catch (e: any) {
    return { ok: false, error: e?.message || "add failed" };
  }
}

// antiloki-core: un-wire (default) or delete_data a workspace so it stops appearing in the list.
export type RemoveWorkspaceResult = { ok: boolean; error?: string; note?: string };
export async function removeWorkspace(name: string, delete_data = false): Promise<RemoveWorkspaceResult> {
  const r: any = await apiPost(`/api/v1/workspaces/remove`, { name, delete_data });
  if (!r) return { ok: false, error: "remove failed (no response)" };
  const res = r?.ok != null ? r : r?.result;
  return { ok: res?.ok === true, error: res?.error, note: res?.note };
}

// antiloki-core: reset a substrate DB to the clean scaffold/molde state (recovery). DESTRUCTIVE.
// db='all' keeps state (your board); db='state' clears cards/contracts. The BE re-seeds + reopens,
// so allow a longer timeout than the 5s default.
export type ResetDbResult = { ok: boolean; error?: string; note?: string; reset?: string[] };
export async function resetDb(db: string): Promise<ResetDbResult> {
  const r: any = await apiPost(`/api/v1/db/reset`, { db }, { timeoutMs: 60_000 });
  if (!r) return { ok: false, error: "reset failed (no response)" };
  const res = r?.ok != null ? r : r?.result;
  return { ok: res?.ok === true, error: res?.error, note: res?.note, reset: res?.reset };
}

// antiloki-core sources: raw files (md/pdf/…) the chat/context/notebooks reference by id. The
// allowlisted system.source.* actions route through the generic /dispatch — no dedicated BE route.
export type Source = {
  id: string; filename: string; rel_path: string; ext: string; mime: string;
  sha256: string; bytes: number; title: string; added_at: string; abs_path?: string;
  has_text?: number; // 1 if extracted text is indexed (text files + parsed PDFs), 0 for binary
};
export async function addSource(filename: string, content_base64: string, title?: string): Promise<{ ok: boolean; source?: Source; deduped?: boolean; error?: string }> {
  const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.source.add", input: { filename, content_base64, title } }, { timeoutMs: 60_000 });
  if (!r) return { ok: false, error: "add failed (no response)" };
  const res = r?.ok != null ? r : r?.result;
  return { ok: res?.ok === true, source: res?.source, deduped: res?.deduped, error: res?.error };
}
export async function listSources(): Promise<{ sources: Source[]; count: number }> {
  const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.source.list", input: {} });
  const res = r && (r.ok != null ? r : r.result);
  return { sources: res?.sources ?? [], count: res?.count ?? (res?.sources?.length ?? 0) };
}
export async function readSource(id: string): Promise<{ ok: boolean; text?: string | null; is_binary?: boolean; filename?: string; mime?: string; bytes?: number; error?: string }> {
  const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.source.read", input: { id } }, { timeoutMs: 30_000 });
  if (!r) return { ok: false, error: "read failed (no response)" };
  const res = r?.ok != null ? r : r?.result;
  return { ok: res?.ok === true, text: res?.text, is_binary: res?.is_binary, filename: res?.filename, mime: res?.mime, bytes: res?.bytes, error: res?.error };
}
export async function removeSource(id: string): Promise<{ ok: boolean; error?: string }> {
  const r: any = await apiPost(`/api/v1/dispatch`, { action_name: "system.source.remove", input: { id } }, { timeoutMs: 30_000 });
  if (!r) return { ok: false, error: "remove failed (no response)" };
  const res = r?.ok != null ? r : r?.result;
  return { ok: res?.ok === true, error: res?.error };
}

export async function activateWorkspace(name: string): Promise<DispatchResult> {
  try {
    // The BE re-mounts the workspace DB live (reopenDb), which drains in-flight
    // work first — up to ~10s. Override the 5s default so the request doesn't
    // abort while the swap (which is already succeeding server-side) finishes.
    const r: any = await apiPost(`/api/v1/workspaces/activate`, { name }, { timeoutMs: 30_000 });
    if (!r) return { ok: false, error: "activate failed" };
    // a 404 comes back as an engine error object, not a throw (client.ts `parse404`): "workspace 'x' is not registered" is now a 404 (QA report BUG-001), and its sentence is what the person needs
    if (r.__engine_error) return { ok: false, error: r.__engine_error.cause || "activate failed" };
    const res = r.ok != null ? r : r.result;
    // EPIC-CODEBASE-ATLAS (Wave G #23): activating an EXTERNAL workspace auto-onboards it in the
    // background. Stash the job id under the same key the Atlas onboard panel reads, so opening
    // Atlas resumes the live per-phase progress view of that auto-run.
    const jobId = res?.onboard_job_id ?? r?.onboard_job_id;
    if (jobId) { try { localStorage.setItem("atlas.onboard.job", String(jobId)); } catch { /* ignore */ } }
    return { ok: res?.ok === true || res?.active === name, error: undefined };
  } catch (e: any) {
    return { ok: false, error: e?.message || "activate failed" };
  }
}

// ─── v2 dispatchers ────────────────────────────────────────────────────

export async function dispatchHalt(halt: boolean) {
  return apiPost(`/api/v1/driver/halt`, { halt });
}

export async function dispatchForceTick() {
  return apiPost(`/api/v1/driver/tick-now`, {});
}

export async function dispatchTriage(slug: string, state: "keep" | "modify" | "defer" | "archive") {
  return apiPost(`/api/v1/triage/recommendation/mark`, { slug, state });
}

export async function dispatchDiffApprove(id: number) {
  return apiPost(`/api/v1/diffs/${id}/approve`, {});
}

export async function dispatchDiffApply(id: number) {
  return apiPost(`/api/v1/diffs/${id}/apply`, {});
}

export async function dispatchDiffReject(id: number, reason: string) {
  return apiPost(`/api/v1/diffs/${id}/reject`, { reason });
}

export async function dispatchNotifDismiss(id: number) {
  return apiPost(`/api/v1/notifications/${id}/dismiss`, {});
}

export async function dispatchCostSettingsSave(settings: Partial<CostSettings>) {
  return apiPost(`/api/v1/settings/cost/set`, settings);
}

// ─── BYOK (bring-your-own-key) ──────────────────────────────────────────
export async function fetchByokStatus(): Promise<ByokStatus | null> {
  // The BE syncs OpenRouter's live /models catalog on this read, so give it
  // more than the default 5s before aborting.
  return apiGet(`/api/v1/settings/byok/status`, { timeoutMs: 15_000 });
}

export async function dispatchByokKeySave(api_key: string, provider = "openrouter") {
  return apiPost(`/api/v1/settings/byok/key`, { provider, api_key });
}

// Live connection test: pings each tier's active model through its real adapter. Read-only; a slow
// or reasoning model can take a while, so give it room.
export type ByokTestResult = { tier: string; provider?: string; model_id?: string; ok: boolean; ms?: number; sample?: string; error?: string };
export async function dispatchByokTest(tier?: "low" | "mid" | "high"): Promise<{ results: ByokTestResult[] } | null> {
  return apiPost(`/api/v1/settings/byok/test`, tier ? { tier } : {}, { timeoutMs: 120_000 });
}

export async function dispatchByokStrategy(strategy: "byok" | "subscription") {
  return apiPost(`/api/v1/settings/byok/strategy`, { strategy });
}

// rank: 0 = primary, 1/2 = fallbacks tried (in order) when the provider errors on the
// model. An empty model_id clears a fallback slot (rank 1/2); the primary can't be cleared.
export async function dispatchByokModel(tier: "low" | "mid" | "high" | "image", model_id: string, rank = 0, provider = "openrouter") {
  return apiPost(`/api/v1/settings/byok/model`, { tier, model_id, provider, rank });
}

// FEAT-PROVIDER-ADAPTER-OLLAMA: local AI (Ollama). Set where Ollama listens,
// and register a downloaded local model (e.g. "deepseek-r1:8b") as a tier's model.
export async function dispatchByokLocalEndpoint(endpoint: string) {
  return apiPost(`/api/v1/settings/byok/local/endpoint`, { endpoint });
}
export async function dispatchByokLocalModel(tier: "low" | "mid" | "high", model_id: string, rank = 0) {
  return apiPost(`/api/v1/settings/byok/local/model`, { tier, model_id, rank });
}
export type OllamaModel = { name: string; parameter_size: string | null; quantization: string | null; family: string | null; capabilities: string[]; thinking: boolean };
export type OllamaModelsResult = { host: string; models: OllamaModel[]; error?: string };
// List the models a local Ollama server has pulled. Pass the (maybe unsaved)
// endpoint to preview before saving; omit to use the saved host.
export async function dispatchByokLocalModels(endpoint?: string): Promise<OllamaModelsResult | null> {
  return apiPost(`/api/v1/settings/byok/local/models`, endpoint ? { endpoint } : {});
}
