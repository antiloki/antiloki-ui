// THE CHATS TAB (operator 2026-09-21: "the chats behave the same as the agents — a stream with a provider like
// Claude Code, Codex, OpenCode; read-only; full access to any context; the same chat can be converted into
// another provider" · "the chats become a single chat of episodes" · "the episodes are consolidations, they
// can have titles and subtitles" · "the chats episode design on the sidebar left was good before, bring back").
// ONE chat per workspace: a cockpit pane with `settings.chat` (serve: chat_pane.rs), made on first use with the
// default provider. The sidebar is the old episode timeline — ● now, then the chapters back through time, each
// named by its consolidation, its record unfolding below. The stage is the agent pane itself in antiChat's
// chrome, under a thin header: the episode, and the provider switch (the chat continues on another engine).
import React from "react";
import { C, mono, nav } from "@/loki/theme";
import { apiGet, apiPost } from "@/loki/api/client";
import type { ChatEngine } from "@/loki/api/engine";
import { apiPostStrict, reasonOf } from "@/loki/api/post-strict";
import { usePoll } from "@/loki/api/hooks";
import { useSeats, offered } from "@/loki/api/seats";
import { paneDisplay } from "@/loki/widgets/types";
import { CockpitPaneBody } from "@/loki/widgets/cockpit-pane-body";
import { Slide } from "./widget-dock";

export type ChatEpisode = { n: number; seq: number; t: number; reason: string; engine: string; turns: number; last_t: number; first_ask: string; snapshot: string; title: string; subtitle: string; /** the journey as a short story — the engine's narrative of the closed episode (2026-09-23) */ story?: string; replies: number };
export type ChatRow = { pane_id: number; session_id: number; key: string; engine: string; title: string; last: number; made: number | null; turns: number; episodes: ChatEpisode[]; live: boolean; busy: boolean };
// EVERY SEAT IS A CHAT (2026-09-28): Cursor and Grok through serve's `agent_print`, Gemini through `agent_gemini`.
// Keep this in step with `chat_pane::ENGINES` — serve validates the switch against its own copy.
// (the list itself lives in api/engine.ts - one copy for every surface)
// THERE IS NO DEFAULT PROVIDER HERE (operator 2026-10-01, "Engine config also"): a new chat names no engine and the serve assigns the seat Heimdall
// plans on (`chat_pane::create`) - this file used to say Claude Code, which refuses every chat the day that subscription ends.

export function useChats(enabled = true) {
  return usePoll<{ chats: ChatRow[] }>(() => apiGet<{ chats: ChatRow[] }>("/api/v1/cockpit/chats"), 5_000, enabled, { fetchKey: "chats" });
}
const hm = (t: number) => (t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const dayLabel = (t: number) => { if (!t) return ""; const d = new Date(t); const today = new Date(); if (d.toDateString() === today.toDateString()) return "today"; const y = new Date(today); y.setDate(y.getDate() - 1); if (d.toDateString() === y.toDateString()) return "yesterday"; return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); };
export const ago = (t: number): string => { if (!t) return ""; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; return `${Math.round(h / 24)}d ago`; };

export async function createChat(engine?: ChatEngine): Promise<ChatRow | null> {
  const r: any = await apiPost("/api/v1/cockpit/chat/create", { ...(engine ? { engine } : {}), title: "" }, { timeoutMs: 30_000 });
  const p = r?.result?.pane ?? r?.pane;
  if (!p?.id) return null;
  // the engine the serve ASSIGNED (its pane's kind) when none was named
  return { pane_id: Number(p.id), session_id: Number(p.session_id), key: String(p.subagent_name ?? ""), engine: engine ?? String(p.pane_kind ?? ""), title: "", last: Date.now(), made: Date.now(), turns: 0, episodes: [], live: false, busy: false };
}

/** THE EPISODES — the old timeline: ● now, then the chapters back through time; a chapter's record (its
 *  consolidation) unfolds below it. */
export function EpisodesSidebar({ chat, busy, onNewTopic }: { chat: ChatRow | null; busy: boolean; onNewTopic: () => void }) {
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const eps = chat?.episodes ?? [];
  const live = eps[eps.length - 1] ?? null;
  const past = eps.slice(0, -1).reverse();
  // a chapter's record is the snapshot the NEXT episode's marker carries
  const recordOf = (n: number) => eps.find((e) => e.n === n + 1)?.snapshot ?? "";
  let lastDay = "";
  return (
    <aside data-testid="chat-episodes" style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ padding: "12px 12px 8px" }}>
        <button data-testid="chat-new-topic" onClick={onNewTopic} disabled={busy || !live || live.turns === 0} title={live && live.turns > 0 ? "close this episode — the next one starts from its consolidation" : "the open episode is empty — it is a fresh topic already"}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = C.fg)} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = C.dim)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 6, border: "none", background: "transparent", color: C.dim, cursor: busy ? "wait" : live && live.turns > 0 ? "pointer" : "default", fontFamily: nav, fontSize: 13, fontStyle: "italic", opacity: busy || !live || live.turns === 0 ? 0.6 : 1, transition: "color .12s" }}>
          <span style={{ color: C.brand, fontSize: 15, lineHeight: 1, fontStyle: "normal" }}>✦</span> New topic
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 10px 12px", minHeight: 0 }}>
        {!chat ? (
          <div style={{ padding: "10px 8px", color: C.muted, fontSize: 12, fontFamily: nav, fontStyle: "italic" }}>the story begins with your first message.</div>
        ) : (
          <div style={{ position: "relative", paddingLeft: 20 }}>
            <span style={{ position: "absolute", left: 7, top: 8, bottom: 6, width: 1, background: C.border }} />
            {/* ● NOW — the live beat */}
            <div data-testid="episode-now" style={{ position: "relative", marginBottom: 14 }}>
              <span style={{ position: "absolute", left: -18, top: 2, width: 11, height: 11, borderRadius: "50%", background: C.bg, border: `2px solid ${C.brand}`, animation: "lokiLivePulse 2.4s ease-in-out infinite" }} />
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.brand, fontWeight: 700, letterSpacing: 0.6 }}>now — episode #{live?.n ?? 1}</div>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: C.dim, marginTop: 2 }}>{live ? `${live.turns} turn${live.turns === 1 ? "" : "s"} · ${live.turns ? `started ${ago(live.t)}` : "just opened"} · ${paneDisplay(live.engine).name}` : "just opened"}</div>
              {live && live.reason !== "the first" && <div style={{ fontFamily: mono, fontSize: 9, color: C.muted, marginTop: 2 }}>opened — {live.reason}</div>}
              {live?.title && <div style={{ fontFamily: nav, fontSize: 10.5, color: C.fg, fontStyle: "italic", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{live.title}”</div>}
            </div>
            {/* the chapters, back through time */}
            {past.map((e) => {
              const day = dayLabel(e.t); const sep = day !== lastDay ? (lastDay = day) : null;
              const open = expanded === e.n;
              const rec = recordOf(e.n);
              return (
                <React.Fragment key={e.n}>
                  {sep && <div style={{ fontFamily: mono, fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1.4, margin: "10px 0 7px" }}>{sep}</div>}
                  <button data-testid={`episode-${e.n}`} onClick={() => setExpanded(open ? null : e.n)} title={`episode #${e.n} — its record unfolds below`}
                    style={{ position: "relative", display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "1px 4px 11px 0", color: C.dim, transition: "color .12s" }}
                    onMouseEnter={(ev) => ((ev.currentTarget as HTMLElement).style.color = C.fg)} onMouseLeave={(ev) => ((ev.currentTarget as HTMLElement).style.color = C.dim)}>
                    <span style={{ position: "absolute", left: -16, top: 5, width: 7, height: 7, borderRadius: "50%", background: C.bg, border: `1.5px solid ${C.border}` }} />
                    <span style={{ display: "block", fontFamily: mono, fontSize: 10.5, color: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      ✦ episode #{e.n}<span style={{ color: C.muted }}> · {hm(e.t)}{e.last_t && hm(e.last_t) !== hm(e.t) ? `–${hm(e.last_t)}` : ""} · {e.turns} turn{e.turns === 1 ? "" : "s"}</span>
                    </span>
                    {e.reason !== "the first" && <span style={{ display: "block", fontFamily: mono, fontSize: 9, color: C.muted, marginTop: 2 }}>opened — {e.reason} · {paneDisplay(e.engine).name}</span>}
                    {e.title && <span style={{ display: "block", fontFamily: nav, fontSize: 10.5, color: C.fg, fontStyle: "italic", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{e.title}”</span>}
                    {e.subtitle && <span style={{ display: "block", fontFamily: nav, fontSize: 10, color: C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.subtitle}</span>}
                  </button>
                  {/* the record — grid-rows 0fr→1fr is the unfold animation */}
                  <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows .38s cubic-bezier(.25,.9,.3,1)" }}>
                    <div style={{ overflow: "hidden", minHeight: 0 }}>
                      <div data-testid={`episode-record-${e.n}`} style={{ margin: "0 2px 12px", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: mono, fontSize: 9.5, color: C.muted, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {e.story && <><div style={{ color: C.dim, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>the journey · the engine's story of this episode</div><div data-testid={`episode-story-${e.n}`} style={{ color: C.fg, marginBottom: 8 }}>{e.story}</div></>}
                        <div style={{ color: C.dim, fontSize: 8.5, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>the record · consolidated deterministically · $0</div>
                        {rec ? rec.replace(/\*\*/g, "") : "no record — the episode closed empty"}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

/** The stage: a thin header (the episode) over the chat's pane in antiChat's chrome; the provider sits in the composer (operator 2026-09-21:
 *  "place them down as the model chosen like it was before — when clicking I can choose the provider in a new topic"). */
export function ChatsStage({ chat, busy, err, onSwitch }: { chat: ChatRow | null; busy: string; err: string | null; onSwitch: (e: ChatEngine) => void }) {
  // the provider picker offers the seats that can run today - not a fixed list that includes a switched-off Claude
  const seats = useSeats();
  if (!chat) return <div style={{ flex: 1, display: "grid", placeItems: "center", fontFamily: mono, fontSize: 10.5, color: C.dim }}>opening the chat…</div>;
  const ep = chat.episodes[chat.episodes.length - 1];
  return (
    <div data-testid="chats-stage" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div data-testid="chat-header" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ color: C.brand, fontFamily: mono, fontSize: 11 }}>✦</span>
        <span style={{ fontFamily: nav, fontSize: 12.5, color: C.fg }}>antiChat</span>
        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>episode #{ep?.n ?? 1}{ep?.title ? ` · “${ep.title}”` : ""}</span>
        <span style={{ flex: 1 }} />
        {busy.startsWith("switch") && <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>handing over…</span>}
      </div>
      {err && <div style={{ padding: "4px 16px", fontFamily: mono, fontSize: 9.5, color: C.bad }}>{err}</div>}
      <Slide id={`${chat.pane_id}:${chat.engine}`} order={[]} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <CockpitPaneBody kind={chat.engine} sessionId={chat.session_id} paneId={chat.pane_id} attach={{ csId: chat.session_id, paneId: chat.pane_id }} chatEpisodes={chat.episodes.map((e) => ({ n: e.n, title: e.title, subtitle: e.subtitle, snapshot: e.snapshot, turns: e.turns }))}
            chatSwitch={{ engines: offered(seats, chat.engine), busy: busy.startsWith("switch"), pick: (e) => onSwitch(e as ChatEngine) }} />
        </div>
      </Slide>
    </div>
  );
}

/** Both halves over one chat — what chat-thread.tsx mounts on the chats tab. The chat is made on first use. */
/** The chat as it should be SHOWN: the serve's confirmed engine wins over a list that has not caught up yet.
 *  A switch the serve refused leaves no override, so the UI never claims an engine that is not running.
 *  Pure — tested. */
export function applySwitch<T extends { pane_id: number; engine: string }>(
  listed: T | null | undefined,
  switched: { pane: number; engine: string } | null,
): T | null {
  if (!listed) return listed ?? null;
  if (!switched || switched.pane !== listed.pane_id || switched.engine === listed.engine) return listed;
  return { ...listed, engine: switched.engine };
}

export function useChatsTab(enabled = true) {
  const q = useChats(enabled);
  const chats = q.data?.chats ?? null;
  const [made, setMade] = React.useState<ChatRow | null>(null);
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const creating = React.useRef(false);
  const listed = chats?.[0] ?? made;
  // no chat yet → one is made with the default provider (once)
  React.useEffect(() => {
    if (!enabled || !chats || chats.length || made || creating.current) return;
    creating.current = true;
    void createChat().then((row) => { if (row) setMade(row); q.refetch(); }).finally(() => { creating.current = false; });
  }, [enabled, chats, made]); // eslint-disable-line react-hooks/exhaustive-deps
  const call = async (label: string, path: string, body: any) => {
    setBusy(label); setErr(null);
    // strict (audit 2026-10-01): a refused switch or new topic came back as null and showed nothing
    try { const r: any = await apiPostStrict(path, body, { timeoutMs: 60_000 }); const d = r?.result ?? r; if (d && d.ok === false) setErr(String(d.error ?? "failed")); else q.refetch(); return d; }
    catch (e) { setErr(reasonOf(e)); }
    finally { setBusy(""); }
  };
  // THE SWITCH SHOWS AT ONCE (operator 2026-09-25: "i switched to codex seek … didnt change the UI for codex,
  // so my prompt didnt appear even tough the changes were made. Just when i reloaded the page it appeared like
  // a codex"). The serve awaits the rotation and returns the engine it settled on, so that answer is
  // authoritative — but the chat row came only from a list refetch that races it, and until the list caught up
  // the pane was still keyed to the old engine. The confirmed engine is held here and wins over the list until
  // the list agrees, which is the same shape as the optimistic ask in the pane: show what is known, let the
  // record replace it.
  const [switched, setSwitched] = React.useState<{ pane: number; engine: ChatEngine } | null>(null);
  const chat = applySwitch(listed, switched);
  // once the list agrees, the override has nothing left to say and is dropped
  React.useEffect(() => { if (switched && listed && listed.pane_id === switched.pane && listed.engine === switched.engine) setSwitched(null); }, [listed, switched]);
  const onSwitch = (engine: ChatEngine) => {
    if (!chat || engine === chat.engine) return;
    const pane = chat.pane_id;
    void call(`switch:${engine}`, "/api/v1/cockpit/chat/switch", { pane_id: pane, engine }).then((d) => {
      // only on the serve's own word — a failed switch must not leave the UI claiming an engine that is not running
      if (d && d.ok !== false) setSwitched({ pane, engine });
    });
  };
  const onNewTopic = () => { if (chat) void call("topic", "/api/v1/cockpit/chat/episode", { pane_id: chat.pane_id }); };
  const side = <EpisodesSidebar chat={chat} busy={!!busy} onNewTopic={onNewTopic} />;
  const stage = <ChatsStage chat={chat} busy={busy} err={err} onSwitch={onSwitch} />;
  return { side, stage, chat };
}
