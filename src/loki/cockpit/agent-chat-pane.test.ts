// THE CHAT AGENT (2026-09-20): the CLI's stream-json events fold into a conversation.
import { describe, it, expect } from "vitest";
import { nextLink, linkHint, askOf, applyEvent, toolSummary, groupExchanges, withContext, atTokens, askText, specialistPrompt, transcriptSection, widgetsContextAsync, bangTokens, episodesContext, isCheckpointAsk, type Turn } from "./agent-chat-pane";
import { isMachineAsk, machineAskLine } from "./agent-chat-pane";
import { AGENT_THEMES, AGENT_THEME_KEYS, doneLine, agentTheme, engineTheme, loadTheme, modelTheme, faceColor, validThemeOr } from "./agent-themes";

const w = (ev: any, t = 5) => ({ t, ev });
describe("applyEvent", () => {
  it("user sends, streamed deltas become one draft, the assistant message replaces it, tools get their results, the result closes the turn", () => {
    let ts: Turn[] = [];
    ts = applyEvent(ts, 1, w({ type: "antiloki", subtype: "started", model: "sonnet" }));
    ts = applyEvent(ts, 2, w({ type: "antiloki", subtype: "user", text: "make it faster" }));
    ts = applyEvent(ts, 0, w({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Look" } } }));
    ts = applyEvent(ts, 0, w({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "ing." } } }));
    expect(ts[ts.length - 1]).toMatchObject({ kind: "assistant", text: "Looking.", streaming: true });
    ts = applyEvent(ts, 3, w({ type: "assistant", message: { model: "claude-sonnet-5", content: [{ type: "text", text: "Looking." }, { type: "tool_use", id: "tu1", name: "Read", input: { file_path: "a.js" } }] } }));
    expect(ts.filter((t) => t.kind === "assistant").length).toBe(1);
    expect(ts[ts.length - 1]).toMatchObject({ kind: "tool", name: "Read", id: "tu1" });
    ts = applyEvent(ts, 4, w({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tu1", content: "const x = 1" }] } }));
    expect((ts[ts.length - 1] as any).result).toBe("const x = 1");
    ts = applyEvent(ts, 5, w({ type: "result", total_cost_usd: 0.05, duration_ms: 1200, num_turns: 2 }));
    expect(ts[ts.length - 1]).toMatchObject({ kind: "result", cost: 0.05, ms: 1200 });
    expect(ts.map((t) => t.kind)).toEqual(["note", "user", "assistant", "tool", "result"]);
  });
  it("a chat's episode marker and the retriever's picks become notes (2026-09-21)", () => {
    let t = applyEvent([], 1, { t: 1, ev: { type: "antiloki", subtype: "episode", n: 2, reason: "continued on opencode", engine: "opencode", from_engine: "claude-code" } });
    expect(t[0]).toMatchObject({ kind: "note", tone: "ok" }); expect((t[0] as any).text).toContain("continued on opencode");
    t = applyEvent(t, 2, { t: 2, ev: { type: "antiloki", subtype: "episode", n: 3, reason: "4h gap", engine: "opencode", from_engine: "opencode" } });
    expect((t[1] as any).text).toContain("4h gap");
    t = applyEvent(t, 3, { t: 3, ev: { type: "antiloki", subtype: "context", used: [{ label: "the latest goal runs" }, { label: "goal run #42" }] } });
    expect((t[2] as any).text).toBe("⌕ looked up: the latest goal runs · goal run #42");
    expect(applyEvent([], 4, { t: 4, ev: { type: "antiloki", subtype: "context", used: [] } })).toEqual([]);
  });
  it("`!episode:N (Label)` names a chat's consolidation: its record (the next marker's snapshot) rides as a section (2026-09-21)", () => {
    const eps = [{ n: 1, title: "the cart", subtitle: "It totals.", snapshot: "", turns: 2 }, { n: 2, title: "tests", subtitle: "", snapshot: "2 turn(s); the last 2:\n- you: cart?\n- antiloki: totals", turns: 1 }];
    expect(bangTokens("see !episode:1 (episode #1) and !episode:1 (episode #1) then !episode:2 (episode #2)")).toEqual([1, 2]);
    const md = episodesContext("compare with !episode:1 (episode #1)", eps);
    expect(md.startsWith("# !episode #1 — the cart\n_It totals._\n\n2 turn(s)")).toBe(true);
    expect(episodesContext("and !episode:2 (episode #2)", eps)).toContain("(the open episode — its turns are this conversation)");
    expect(episodesContext("!episode:9 (episode #9)", eps)).toBe("");
    expect(askText("compare with !episode:1 (episode #1) please")).toBe("compare with !episode #1 please");
  });
  it("a rate limit past 80% becomes a warning note; below it is silent", () => {
    expect(applyEvent([], 1, w({ type: "rate_limit_event", rate_limit_info: { utilization: 0.62, rateLimitType: "seven_day" } })).length).toBe(0);
    expect(applyEvent([], 1, w({ type: "rate_limit_event", rate_limit_info: { utilization: 0.97, rateLimitType: "five_hour" } }))[0]).toMatchObject({ kind: "note", tone: "bad", text: "usage: 97% of the five hour window" });
  });
  it("toolSummary picks the thing that matters", () => {
    expect(toolSummary("Read", { file_path: "src/a.ts" })).toBe("src/a.ts");
    expect(toolSummary("Bash", { command: "git status", description: "x" })).toBe("git status");
    expect(toolSummary("Grep", { pattern: "foo", path: "src" })).toBe("foo in src");
  });
});
describe("groupExchanges", () => {
  it("groups each ask with the tools it took, its replies and its result — like antiChat's turns", () => {
    let ts: Turn[] = [];
    ts = applyEvent(ts, 1, w({ type: "antiloki", subtype: "resumed" }));
    ts = applyEvent(ts, 2, w({ type: "antiloki", subtype: "user", text: "read x" }));
    ts = applyEvent(ts, 3, w({ type: "assistant", message: { content: [{ type: "tool_use", id: "a", name: "Read", input: { file_path: "x" } }] } }));
    ts = applyEvent(ts, 4, w({ type: "assistant", message: { content: [{ type: "text", text: "x is 1" }] } }));
    ts = applyEvent(ts, 5, w({ type: "result", total_cost_usd: 0.01, duration_ms: 900 }));
    ts = applyEvent(ts, 6, w({ type: "antiloki", subtype: "user", text: "and y?" }));
    const x = groupExchanges(ts);
    expect(x.length).toBe(3); // the note before any ask, then two asks
    expect(x[0].notes.length).toBe(1);
    expect(x[1].user?.text).toBe("read x"); expect(x[1].tools.map((t) => t.name)).toEqual(["Read"]); expect(x[1].replies[0].text).toBe("x is 1"); expect(x[1].result?.cost).toBe(0.01);
    expect(x[2].user?.text).toBe("and y?"); expect(x[2].replies.length).toBe(0);
  });
});
describe("withContext", () => {
  it("appends the pinned context after the ask: files by path, then the rendered references", () => {
    expect(withContext("fix it", [], "", "")).toBe("fix it");
    const out = withContext("fix it", [{ kind: "code_file", path: "src/a.ts" }, { kind: "card", slug: "auth" }] as any, "## card auth\nbody", "");
    expect(out).toMatch(/^fix it\n\n\n---\nContext pinned by the operator/);
    expect(out).toContain("Files:\n- src/a.ts"); expect(out).toContain("## card auth\nbody");
  });
});
describe("themes", () => {
  it("every theme is complete and speaks in its own voice", () => {
    expect(AGENT_THEME_KEYS).not.toContain("antiloki" as any);                           // THERE IS NO HOUSE THEME (operator 2026-10-11: "remove it completely")
    expect((AGENT_THEMES as any).antiloki).toBeUndefined();
    for (const k of ["claude", "codex", "cursor", "gemini", "grok", "opencode"] as const) expect(AGENT_THEME_KEYS).toContain(k);   // every engine has its own look
    for (const k of AGENT_THEME_KEYS) { const t = AGENT_THEMES[k]; expect(t.key).toBe(k); expect(t.label).toBeTruthy(); expect(["bubbles", "transcript"]).toContain(t.layout); }
    expect(doneLine(AGENT_THEMES.claude, 4000, 0.244)).toBe("✻ Crunched for 4.0s · $0.244");
    expect(doneLine(AGENT_THEMES.terminal, 1200, 0.01)).toBe("[done 1.2s cost=$0.010]");
    expect(AGENT_THEMES.claude.user.glyph).toBe("❯ "); expect(AGENT_THEMES.codex.user.glyph).toBe("› "); expect(AGENT_THEMES.terminal.user.glyph).toBe("$ ");
    expect(AGENT_THEMES.xp.chrome?.kind).toBe("xp"); expect(AGENT_THEMES.mac.chrome?.kind).toBe("mac");
    expect(agentTheme("nope").key).toBe("terminal"); expect(agentTheme("antiloki").key).toBe("terminal");   // a retired or unknown key reads as the generic terminal
  });
});

describe("the engine's own theme (2026-09-20)", () => {
  it("a pane spawns dressed as its CLI — Claude, Codex, OpenCode — Cursor, Gemini, Grok — and the generic terminal for anything else; the viewer's pick still wins", () => {
    expect(engineTheme("claude-code")).toBe("claude"); expect(engineTheme("codex")).toBe("codex");
    expect(engineTheme("opencode")).toBe("opencode"); expect(engineTheme("opencode-direct")).toBe("opencode");
    expect(engineTheme("cursor")).toBe("cursor"); expect(engineTheme("gemini")).toBe("gemini"); expect(engineTheme("grok")).toBe("grok");
    expect(engineTheme("agent")).toBe("terminal"); expect(engineTheme(null)).toBe("terminal");
    expect(loadTheme(9_999_001, engineTheme("codex"))).toBe("codex");
    expect(loadTheme(9_999_002, "antiloki")).toBe("terminal");                          // a pane that carries the retired theme
    expect(validThemeOr("antiloki", "cursor")).toBe("cursor"); expect(validThemeOr("kimi", "cursor")).toBe("kimi"); expect(validThemeOr(null, "gemini")).toBe("gemini");
  });
  it("an OpenCode pane dresses as its MODEL (2026-09-23: DeepSeek · Kimi · Qwen each have a theme); a pair label picks the brain", () => {
    expect(engineTheme("opencode", "opencode/deepseek-v4-pro")).toBe("deepseek");
    expect(engineTheme("opencode", "opencode/kimi-k2.7-code")).toBe("kimi");
    expect(engineTheme("opencode-direct", "opencode/qwen3.6-plus")).toBe("qwen");
    expect(engineTheme("opencode", "opencode/glm-5")).toBe("opencode");
    expect(engineTheme("claude-code", "opencode/qwen3.6-plus")).toBe("claude");
    expect(modelTheme("Kimi × DeepSeek")).toBe("kimi"); expect(modelTheme("Claude × Qwen")).toBe("qwen"); expect(modelTheme("solo")).toBeNull();
    for (const k of ["deepseek", "kimi", "qwen"] as const) { expect(AGENT_THEMES[k].layout).toBe("transcript"); expect(AGENT_THEMES[k].accent).toMatch(/^#/); }
    expect(new Set([AGENT_THEMES.deepseek.accent, AGENT_THEMES.kimi.accent, AGENT_THEMES.qwen.accent, AGENT_THEMES.claude.accent, AGENT_THEMES.codex.accent, AGENT_THEMES.opencode.accent]).size).toBe(6);
  });
  it("faceColor — the saved theme's accent, else the engine's (the model's for OpenCode), else the palette", () => {
    expect(faceColor("kimi", "claude-code")).toBe(AGENT_THEMES.kimi.accent);
    expect(faceColor("antiloki", "claude-code")).toBe(AGENT_THEMES.claude.accent);
    expect(faceColor(null, "opencode", "opencode/deepseek-v4-flash")).toBe(AGENT_THEMES.deepseek.accent);
    expect(faceColor(undefined, "codex")).toBe(AGENT_THEMES.codex.accent);
    expect(faceColor(null, null)).toBeUndefined();
  });
});

describe("# widgets on the ask (2026-09-20)", () => {
  it("the referenced cells are reshaped into articles and ride under the ask; a cell off screen says so; no tokens → nothing", async () => {
    const { widgetsContext, withContext } = await import("./agent-chat-pane");
    const el = document.createElement("div");
    el.innerHTML = "<h3>Kanban</h3><div>todo: 3</div><div>doing: 1</div>";
    const md = widgetsContext("what is blocked on #kanban-1 (Kanban) vs #gone-9 (Diff)?", (id) => (id === "kanban-1" ? el : null));
    expect(md.startsWith("Widgets of this thread the operator pointed at (#):")).toBe(true);
    expect(md).toContain("todo: 3"); expect(md).toContain("(the widget Diff is not on screen right now)");
    expect(widgetsContext("plain ask", () => el)).toBe("");
    const full = withContext("what is blocked on #Kanban?", [], "", "", md);
    expect(full.startsWith("what is blocked on #Kanban?\n\n\n---\nContext pinned by the operator")).toBe(true); expect(full).toContain("todo: 3");
    expect(withContext("plain", [], "", "", "")).toBe("plain");
  });
});

// the buttons moved out of the pane and into the rail (operator 2026-09-24) — they are side questions now, and
// their prompts live with them in chat/side-questions.tsx. What is still true here is that the pane offers them.
describe("the reply's buttons (2026-09-24): they ask on the SIDE", () => {
  it("offers simplify · expand · summary · side question, and none of them rewrites the transcript", async () => {
    const { SIDE_OPS, sidePrompt } = await import("@/loki/chat/side-questions");
    expect(SIDE_OPS.map((o) => o.kind)).toEqual(["simplify", "expand", "summary", "ask"]);
    const text = "I edited `src/cart.ts` and ran `npm test` — 12 passed.";
    for (const kind of ["simplify", "expand", "summary"] as const) { const p = sidePrompt(kind, text); expect(p.endsWith(`--- THE REPLY ---\n${text}`)).toBe(true); expect(p.length).toBeGreaterThan(text.length + 60); }
    expect(sidePrompt("simplify", text)).toContain("fewer, plainer words");
    expect(sidePrompt("expand", text)).toContain("more detail");
    expect(sidePrompt("summary", text)).toContain("at most three lines");
    // a free question carries the reply it is about…
    const q = sidePrompt("ask", text, "which test file covers this?");
    expect(q).toContain("which test file covers this?");
    expect(q).toContain(text);
    // …and a question asked from the rail with nothing on screen is just the question, not an empty reply block
    expect(sidePrompt("ask", "", "what is a worktree?")).toBe("what is a worktree?");
  });
});

describe("⊕ a file on the ask (2026-09-21)", () => {
  it("boxRelative: a path inside the box becomes relative; outside (or the box itself) is null; separators do not matter", async () => {
    const { boxRelative } = await import("./agent-chat-pane");
    expect(boxRelative("/home/u/.antiloki/worktrees/box-1", "/home/u/.antiloki/worktrees/box-1/src/cart.ts")).toBe("src/cart.ts");
    expect(boxRelative("/home/u/.antiloki/worktrees/box-1/", "/home/u/.antiloki/worktrees/box-1/README.md")).toBe("README.md");
    expect(boxRelative("C:\\dev\\box", "C:\\dev\\box\\src\\a.rs")).toBe("src/a.rs");
    expect(boxRelative("/home/u/box-1", "/home/u/box-10/x.ts")).toBeNull(); expect(boxRelative("/home/u/box", "/home/u/box")).toBeNull(); expect(boxRelative(null, "/x")).toBeNull();
  });
});

// THE `@` EXTRAS (2026-09-21): other agents (their chats) and specialists (an isolated sub-agent with the ask)
describe("@ agents and specialists, # any widget", () => {
  it("reads the tokens once each, renders the ask for a reader, briefs a specialist", () => {
    const t = "ask @agent:12 (cart totals) and @specialist:axis:docs (Docs lens) about #uw-3 (Kanban) — @agent:12 (cart totals) again";
    expect(atTokens(t)).toEqual([{ kind: "agent", id: "12", label: "cart totals" }, { kind: "specialist", id: "axis:docs", label: "Docs lens" }]);
    expect(askText(t)).toBe("ask @cart totals and @Docs lens about #Kanban — @cart totals again");
    const brief = specialistPrompt({ title: "Docs lens", category: "axis", description: "reviews the docs" }, "check the README @specialist:axis:docs (Docs lens)");
    expect(brief.startsWith('You are the specialist "Docs lens" (axis) — reviews the docs.')).toBe(true);
    expect(brief).toContain("work only inside its scope"); expect(brief.trim().endsWith("check the README")).toBe(true);
    expect(transcriptSection("cart totals", "antichat#4", "**operator:** hi")).toBe("# @cart totals — the chat of the agent antichat#4\n\n**operator:** hi");
  });
  it("# reads on-screen cells as they are, agents as transcripts, off-screen widgets as ghosts (released after)", async () => {
    const on = document.createElement("div"); on.innerHTML = "<h2>Kanban</h2><p>todo: 3</p>";
    const ghostEl = document.createElement("div"); ghostEl.innerHTML = "<h2>Diff</h2><p>+12 −3</p>";
    let released = 0;
    const md = await widgetsContextAsync("see #uw-1 (Kanban), #uw-2 (Claude), #uw-3 (Diff) and #uw-4 (Gone)", {
      refables: [{ refId: "uw-1", label: "Kanban", onScreen: true }, { refId: "uw-2", label: "Claude", thread: "store", agentKey: "17-9", onScreen: false }, { refId: "uw-3", label: "Diff", thread: "store", onScreen: false }, { refId: "uw-4", label: "Gone", thread: "old" }],
      cellOf: (id) => (id === "uw-1" ? on : null),
      ghost: async (id) => (id === "uw-3" ? { el: ghostEl, release: () => { released += 1; } } : null),
      transcriptOfKey: async (k) => (k === "17-9" ? { name: "antichat#2", transcript: "**operator:** fix it\n\n**agent:** done" } : null),
    });
    expect(md.startsWith("Widgets the operator pointed at (#):")).toBe(true);
    expect(md).toContain("todo: 3");
    expect(md).toContain('# Claude (thread "store") — the chat of the agent antichat#2'); expect(md).toContain("**agent:** done");
    expect(md).toContain("+12 −3"); expect(released).toBe(1);
    expect(md).toContain('# Gone (thread "old")\n\n(the widget Gone could not be rendered for reading)');
    expect(await widgetsContextAsync("no tokens", { refables: [] })).toBe("");
  });
});

describe("askOf", () => {
  it("is the ask alone out of a composed message, and the whole text when nothing is pinned", () => {
    expect(askOf("what changed?\n---\nContext pinned by the operator (read it before answering):\n\n# !episode #1\n…")).toBe("what changed?");
    expect(askOf("plain ask")).toBe("plain ask");
  });
});

describe("machine asks fold (2026-09-23: the config is not the chat's)", () => {
  it("a long instruction-shaped prompt is a machine ask; a sentence, however long, is not", () => {
    const prompt = `You are the specialist "laws". ${"Check every export. ".repeat(80)}\nRespond with a single JSON object only — no prose before or after it.`;
    expect(isMachineAsk(prompt)).toBe(true);
    expect(isMachineAsk("fix the flaky test")).toBe(false);
    expect(isMachineAsk("please ".repeat(300))).toBe(false);
    expect(isMachineAsk(`ROUTINE nightly\n${"read the queue. ".repeat(80)}`)).toBe(true);
    expect(machineAskLine(prompt)).toMatch(/^⚙ instructions from antiloki · You are the specialist "laws"/);
  });
});

// THE THREE DETERMINISTIC GATES (operator 2026-09-24: "add another button to click test and build and lint
// gates. 3 buttons. They turn on and off 3 more gates deterministically to run after the agent claim
// completition and force re-run in case of error with the error logs").
describe("the gates on a claim", () => {
  it("each state reads at a glance, and a failure is never coloured like a pass", async () => {
    const { applyEvent } = await import("./agent-chat-pane");
    const ev = (o: any) => ({ ev: { type: "antiloki", subtype: "gates", ...o }, t: 1 });
    const note = (o: any) => applyEvent([], 1, ev(o))[0] as any;

    const running = note({ state: "running", text: "checking the claim: test · build over 3 changed file(s)" });
    expect(running.kind).toBe("note"); expect(running.tone).toBe("warn");
    expect(running.text).toBe("◌ checking the claim: test · build over 3 changed file(s)");

    const green = note({ state: "done", ok: true, text: "test: passed · `npx vitest` · 2 s" });
    expect(green.tone).toBe("ok"); expect(green.text.startsWith("✓")).toBe(true);

    const red = note({ state: "done", ok: false, text: "build: FAILED (exit 2) · `npm run build` · 9 s" });
    expect(red.tone).toBe("bad"); expect(red.text.startsWith("✗")).toBe(true);

    // the retry is not a failure and not a success — it is the agent being given another go
    const again = note({ state: "rerun", text: "a gate said no — the agent has the logs and is going again (once)" });
    expect(again.tone).toBe("warn"); expect(again.text.startsWith("↻")).toBe(true);

    // …and giving up says so rather than going quiet
    expect(note({ state: "stop", text: "a gate said no again — antiloki stops here" }).tone).toBe("bad");

    // an event with nothing to say adds no line
    expect(applyEvent([], 1, ev({ state: "done", ok: true }))).toHaveLength(0);
  });

    it("offers the project's own commands, and the laws gate as a different kind of thing", async () => {
      const { GATE_PILLS } = await import("./agent-chat-pane");
      expect(GATE_PILLS.map((g) => g.key)).toEqual(["test", "build", "lint", "laws"]);
      // THE THREE COMMAND GATES run what the repo already runs — never a model's opinion. That distinction is
      // what this assertion protects, so the laws gate is checked separately rather than by loosening it.
      for (const g of GATE_PILLS.filter((x) => x.key !== "laws")) {
        expect(g.on).toContain("the project's own");
        expect(g.off).toContain("click to run");
      }
      expect(GATE_PILLS.find((g) => g.key === "lint")!.on).toContain("not a model's taste");
      // THE LAWS GATE is antiloki's own laws applied to the project, not one of the project's commands. Still
      // deterministic, and it still says so when there is nothing to judge — the property that keeps "no laws"
      // from reading as "no violations".
      const laws = GATE_PILLS.find((g) => g.key === "laws")!;
      expect(laws.on).toContain("Deterministic");
      expect(laws.on).toContain("rather than passing");
      expect(laws.on).not.toContain("the project's own");
    });
});

// CLOSING AN EPISODE IS A MERGE (operator 2026-09-24: "the episodes could be just like new branches in their
// worktrees… When a episode is closed is like a merge in the code").
describe("what closing an episode says it did", () => {
  it("tells the shared-workspace case and the merged case apart", async () => {
    const { episodeNote } = await import("./agent-chat-pane");
    // an agent in the workspace has nothing to merge — the old sentence still fits
    expect(episodeNote({ ok: true })).toBe("episode closed — the next one is open");
    expect(episodeNote({ ok: true, unchanged: true, why: "the open episode is empty" })).toBe("the open episode is empty");
    expect(episodeNote({ ok: false, error: "the serve refused" })).toBe("the serve refused");

    // a boxed agent whose work landed
    expect(episodeNote({ ok: true, merge: { ok: true, sealed: { files: ["src/a.ts", "src/b.ts"] }, merge: { workspace: "main" } } }))
      .toBe("episode closed and merged into main · 2 files");
  });

  it("a merge that did NOT happen is the thing it most needs to say, with where the work is", async () => {
    const { episodeNote } = await import("./agent-chat-pane");
    // the two refusals the real run produced, each carrying its own instruction
    const dirty = episodeNote({ ok: true, merge: { ok: false, sealed: { files: ["src/a.ts"] },
      merge: { dirty: true, note: "your workspace has uncommitted changes, so git will not merge into it. The episode is safe on antiloki/dane/main — commit or stash what you have, then: git merge antiloki/dane/main" } } });
    expect(dirty).toContain("uncommitted changes");
    expect(dirty).toContain("antiloki/dane/main");
    expect(dirty).not.toContain("conflict");

    const clash = episodeNote({ ok: true, merge: { ok: false, merge: { conflict: "CONFLICT in src/a.ts", note: "the episode is safe on antiloki/dane/main; the workspace was left untouched." } } });
    expect(clash).toContain("the workspace was left untouched");

    // and a seal that could not even run says so rather than claiming success
    expect(episodeNote({ ok: true, merge: { error: "git could not run: No such file" } })).toContain("the merge failed");
  });
});

// THE FORGE (operator 2026-09-24: "not dependency on github should be agnostic with github by default").
describe("what closing an episode delivers", () => {
  it("offers three ways out, and the default is what closing has always meant", async () => {
    const { DELIVERIES } = await import("./agent-chat-pane");
    expect(DELIVERIES.map((d) => d.key)).toEqual(["merge", "patch", "pr"]);
    expect(DELIVERIES[0].hint).toContain("what closing an episode has always done");
    expect(DELIVERIES[1].hint).toContain("needs no forge and no token");
  });

  it("says where the work went, whichever way it went", async () => {
    const { episodeNote } = await import("./agent-chat-pane");
    // a patch: the path, so the operator can `git am` it
    expect(episodeNote({ ok: true, delivered: { ok: true, kind: "patch", path: "/r/.antiloki/outbox/ep-2.patch", sealed: { files: ["a.ts", "b.ts"] } } }))
      .toBe("episode closed · patch written to /r/.antiloki/outbox/ep-2.patch · 2 files");

    // a pull request: the url and how many checks rode along
    expect(episodeNote({ ok: true, delivered: { ok: true, kind: "github", url: "https://github.com/me/r/pull/7", statuses: 3, sealed: { files: ["a.ts"] } } }))
      .toBe("pull request opened · 1 file · 3 checks posted — https://github.com/me/r/pull/7");

    // a PR that fell back to a patch says WHY rather than looking like it did what was asked
    const fell = episodeNote({ ok: true, delivered: { ok: true, kind: "patch", path: "/r/out.patch", sealed: { files: [] },
      why: "this workspace's remote is not a forge antiloki can file against" } });
    expect(fell).toContain("not a forge antiloki can file against");

    // and a delivery that failed is never dressed up as a success
    expect(episodeNote({ ok: true, delivered: { ok: false, error: "no token for github.com. Set ANTILOKI_FORGE_TOKEN…" } }))
      .toContain("not delivered: no token for github.com");
  });
});

describe("the link to serve (operator 2026-09-27: a loading while the connection is restored, and the agent restarts itself)", () => {
  it("a failed probe is down, and nothing is sent or started", () => {
    expect(nextLink("up", { ok: false }, false)).toEqual({ link: "down", start: false });
    expect(nextLink("restarting", { ok: false }, true)).toEqual({ link: "down", start: false });
  });
  it("the first answer after an outage finds the engine gone and asks for it back, once", () => {
    expect(nextLink("down", { ok: true, running: false }, false)).toEqual({ link: "restarting", start: true });
    expect(nextLink("restarting", { ok: true, running: false }, false)).toEqual({ link: "restarting", start: false });
    expect(nextLink("restarting", { ok: true, running: true }, false)).toEqual({ link: "up", start: false });
  });
  it("a chat pane is always on: not running means start, even with no outage; a plain agent pane is left asleep", () => {
    expect(nextLink("up", { ok: true, running: false }, true)).toEqual({ link: "restarting", start: true });
    expect(nextLink("up", { ok: true, running: false }, false)).toEqual({ link: "up", start: false });
  });
  it("the composer says what is happening, and otherwise keeps the caller's hint", () => {
    expect(linkHint("down", null)).toMatch(/reconnecting/);
    expect(linkHint("restarting", "routing…")).toMatch(/starting again/);
    expect(linkHint("up", "routing…")).toBe("routing…");
  });
});

describe("an error result in an exchange (operator 2026-09-27: the 402 that drew as nothing)", () => {
  it("survives the empty success results the gates land after it", () => {
    const turns: Turn[] = [
      { kind: "user", seq: 1, t: 1, text: "hi" },
      { kind: "result", seq: 2, t: 2, cost: 0, ms: 72000, turns: 0, error: "Upstream request failed: Insufficient account funds" },
      { kind: "result", seq: 3, t: 3, cost: 0, ms: 73000, turns: 0 },
      { kind: "result", seq: 4, t: 4, cost: 0, ms: 74000, turns: 0 },
    ];
    const [x] = groupExchanges(turns);
    expect(x.result?.error).toMatch(/Insufficient account funds/);
    expect(x.result?.ms).toBe(74000);
  });
  it("a later error still replaces a clean result", () => {
    const [x] = groupExchanges([{ kind: "user", seq: 1, t: 1, text: "hi" }, { kind: "result", seq: 2, t: 2, cost: 0.01, ms: 5, turns: 1 }, { kind: "result", seq: 3, t: 3, cost: 0, ms: 9, turns: 0, error: "boom" }] as Turn[]);
    expect(x.result?.error).toBe("boom");
  });
});

// THE PR BUTTON THAT "DIDNT CREATE IT" (operator 2026-09-30): the repo had no remote, so "pull request" quietly wrote a patch. The menu now asks the serve what a click will do, and says so.
describe("the pull request row says what a click will do", () => {
  it("a GitHub remote with a token opens the PR and names the repo", async () => {
    const { prChoice } = await import("./agent-chat-pane");
    const c = prChoice({ can_pr: true, repo: "me/ministore", base: "main", branch: "antiloki/main-cheeky-double" });
    expect(c.action).toBe("pr"); expect(c.label).toBe("open a pull request on me/ministore"); expect(c.hint).toContain("against main");
  });
  it("a LOCAL-ONLY repo with a logged-in gh offers to create the online repo - and asks for a confirming second click", async () => {
    const { prChoice } = await import("./agent-chat-pane");
    const c = prChoice({ local_only: true, publish_available: true, gh_account: "acme", why: "this repo is local only (no remote)." });
    expect(c.action).toBe("publish"); expect(c.label).toMatch(/create a private GitHub repo/); expect(c.hint).toContain("click again to confirm");
  });
  it("a local-only repo with no gh login is blocked and says how to fix it; a missing token is blocked and says so", async () => {
    const { prChoice } = await import("./agent-chat-pane");
    expect(prChoice({ local_only: true, publish_available: false, why: "run `gh auth login`" })).toMatchObject({ action: "blocked", hint: "run `gh auth login`" });
    expect(prChoice({ kind: "github", can_pr: false, why: "no token for github.com" })).toMatchObject({ action: "blocked", label: "a pull request needs a token" });
    expect(prChoice({ kind: "patch", local_only: false, can_pr: false }).action).toBe("patch");
    expect(prChoice(null).action).toBe("pr");                          // an older serve: the button behaves as it always did
  });
  it("a pull request that became a patch says so plainly, and the PR's URL is in the note", async () => {
    const { episodeNote } = await import("./agent-chat-pane");
    expect(episodeNote({ ok: true, delivered: { ok: true, kind: "patch", path: ".antiloki/outbox/x", why: "this workspace's remote is not a forge antiloki can file against — written as a patch instead." } })).toMatch(/^no pull request was opened: this repo's remote is not a forge/);
    expect(episodeNote({ ok: true, delivered: { ok: true, kind: "github", url: "https://github.com/me/r/pull/7", sealed: { files: ["a.ts"] } } })).toContain("https://github.com/me/r/pull/7");
  });
});

describe("isCheckpointAsk (2026-10-13)", () => {
  it("matches whole-message checkpoint phrases only", () => {
    expect(isCheckpointAsk("save a checkpoint now")).toBe(true);
    expect(isCheckpointAsk("Save a checkpoint.")).toBe(true);
    expect(isCheckpointAsk("please take a checkpoint")).toBe(true);
    expect(isCheckpointAsk("save a checkpoint before refactoring the cart")).toBe(false);
  });
});
