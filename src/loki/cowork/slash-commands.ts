// THE SLASH COMMANDS an agent's own terminal offers when the person types "/" (the operator 2026-11-24: "on terminal mode when using / it shows autocomplete, this also should happen on chat mode").
// The chat composer shows the same short list while the first word is still being typed. A static list per engine: the commands each CLI documents. A command the CLI has and this list lacks still works, it is only not suggested.
export type SlashCommand = { name: string; hint: string };

const CLAUDE: SlashCommand[] = [
  { name: "/model", hint: "switch the model (type /model sonnet)" },
  { name: "/effort", hint: "set how hard it thinks" },
  { name: "/clear", hint: "start a new conversation" },
  { name: "/compact", hint: "summarise the conversation to free context" },
  { name: "/context", hint: "see what fills the context" },
  { name: "/cost", hint: "what this session has cost" },
  { name: "/usage", hint: "plan usage and limits" },
  { name: "/status", hint: "version, model and account" },
  { name: "/resume", hint: "continue an earlier conversation" },
  { name: "/rewind", hint: "go back to an earlier point" },
  { name: "/init", hint: "write a CLAUDE.md for this project" },
  { name: "/review", hint: "review a pull request" },
  { name: "/memory", hint: "edit its memory files" },
  { name: "/mcp", hint: "the connected tool servers" },
  { name: "/agents", hint: "sub-agents" },
  { name: "/permissions", hint: "what it may do without asking" },
  { name: "/add-dir", hint: "let it see another folder" },
  { name: "/config", hint: "its settings" },
  { name: "/theme", hint: "colours" },
  { name: "/vim", hint: "vim keys in the prompt" },
  { name: "/export", hint: "save the conversation" },
  { name: "/doctor", hint: "check its install" },
  { name: "/help", hint: "all commands" },
  { name: "/exit", hint: "leave" },
];
const CODEX: SlashCommand[] = [
  { name: "/model", hint: "choose the model and effort" },
  { name: "/approvals", hint: "what it may do without asking" },
  { name: "/new", hint: "start a new conversation" },
  { name: "/compact", hint: "summarise the conversation to free context" },
  { name: "/init", hint: "write an AGENTS.md" },
  { name: "/diff", hint: "show the git diff" },
  { name: "/mention", hint: "point it at a file" },
  { name: "/status", hint: "model, approvals and usage" },
  { name: "/review", hint: "review the working tree" },
  { name: "/quit", hint: "leave" },
];

// read from each CLI's own "/" menu (2026-11-26)
const ANTIGRAVITY: SlashCommand[] = [
  { name: "/model", hint: "choose the model" },
  { name: "/usage", hint: "model quota usage" },
  { name: "/permissions", hint: "manage tool permissions" },
  { name: "/mcp", hint: "MCP servers" },
  { name: "/clear", hint: "start a new conversation" },
  { name: "/compact", hint: "summarise the conversation" },
  { name: "/effort", hint: "set the reasoning effort" },
  { name: "/plan", hint: "plan before executing" },
  { name: "/goal", hint: "run until the goal is finished" },
  { name: "/diff", hint: "uncommitted changes and diffs" },
  { name: "/agents", hint: "custom agents" },
  { name: "/skills", hint: "available skills" },
  { name: "/tasks", hint: "background tasks" },
  { name: "/add-dir", hint: "add a folder" },
  { name: "/btw", hint: "a side question" },
  { name: "/artifact", hint: "review artifacts" },
  { name: "/changelog", hint: "release notes" },
  { name: "/feedback", hint: "send feedback" },
  { name: "/keybindings", hint: "keybindings" },
  { name: "/schedule", hint: "run on a schedule" },
  { name: "/browser", hint: "a browser agent" },
  { name: "/help", hint: "commands and keys" },
  { name: "/logout", hint: "log out" },
];
const OPENCODE: SlashCommand[] = [
  { name: "/agents", hint: "switch agent" },
  { name: "/auth", hint: "connect an integration" },
  { name: "/btw", hint: "a side question" },
  { name: "/cd", hint: "change folder" },
  { name: "/clear", hint: "clear the session" },
  { name: "/connect", hint: "connect an integration" },
  { name: "/continue", hint: "switch session" },
  { name: "/debug", hint: "debug info" },
  { name: "/diff", hint: "diff viewer" },
  { name: "/mcps", hint: "tool servers" },
  { name: "/models", hint: "choose the model" },
  { name: "/plugins", hint: "plugins" },
];

// Read from Cursor Agent 2026.11's own "/" list (2026-11-26)
const CURSOR: SlashCommand[] = [
  { name: "/model", hint: "choose the model" },
  { name: "/plan", hint: "create or show a plan" },
  { name: "/ask", hint: "ask mode: read-only questions" },
  { name: "/debug", hint: "debug mode" },
  { name: "/goal", hint: "a goal that runs while idle" },
  { name: "/add-dir", hint: "add another folder" },
  { name: "/clear", hint: "start a new chat" },
  { name: "/resume", hint: "open a recent chat" },
  { name: "/fork", hint: "fork this chat" },
  { name: "/summarize", hint: "summarize to free context" },
  { name: "/rewind", hint: "jump back to a message" },
  { name: "/fast", hint: "toggle fast mode" },
  { name: "/auto-review", hint: "toggle auto review" },
  { name: "/run-everything", hint: "run without asking" },
  { name: "/config", hint: "its settings" },
  { name: "/about", hint: "version and account" },
  { name: "/help", hint: "commands" },
  { name: "/logout", hint: "sign out" },
  { name: "/quit", hint: "leave" },
];

/** The commands of one engine (`claude-code`, `codex`); none for any other. Pure. */
export function slashCommands(engine: string | undefined): SlashCommand[] {
  const e = (engine ?? "").toLowerCase();
  return e.startsWith("claude") ? CLAUDE : e.startsWith("codex") ? CODEX : e === "gemini" ? ANTIGRAVITY : e.startsWith("opencode") ? OPENCODE : e === "cursor" ? CURSOR : [];
}

/** What the menu shows and what choosing it puts in the box: a command (`/model`, inserted with a space after it) or a value for one (`sonnet`, inserted as `/model sonnet`). */
export type SlashItem = { name: string; hint: string; insert: string };

// The values the two commands that take a short word accept (Claude Code: `/model haiku|sonnet|opus` or a full model id; `/effort low..max`). Local models are not here: `/model` cannot reach them (a new start, see the model button).
const ARGS: Record<string, SlashCommand[]> = {
  "/model": [{ name: "haiku", hint: "fastest and cheapest" }, { name: "sonnet", hint: "balanced" }, { name: "opus", hint: "deepest, and the dearest" }],
  "/effort": [{ name: "low", hint: "quick answers" }, { name: "medium", hint: "the usual" }, { name: "high", hint: "thinks longer" }, { name: "xhigh", hint: "thinks much longer" }, { name: "max", hint: "as long as it needs" }],
};

/** The suggestions while the person types: the command's name while the first word is typed (`/mo`), then the values it takes once a space follows it (`/model s`). Nothing for any other text. Claude's only for the values. Pure. */
export function slashMatches(engine: string | undefined, text: string, localTags: string[] = []): SlashItem[] {
  const e = (engine ?? "").toLowerCase();
  const first = /^\/[a-z-]*$/i.exec(text);
  if (first) { const t = text.toLowerCase(); return slashCommands(engine).filter((c) => c.name.startsWith(t)).map((c) => ({ ...c, insert: `${c.name} ` })); }
  const arg = /^(\/[a-z-]+) ([a-z0-9._:-]*)$/i.exec(text);
  if (arg && e.startsWith("claude")) { const cmd = arg[1].toLowerCase(); const w = arg[2].toLowerCase(); const extra: SlashCommand[] = cmd === "/model" ? localTags.map((t) => ({ name: t, hint: "a local model: restarts this agent on it" })) : [];
    return [...(ARGS[cmd] ?? []), ...extra].filter((a) => a.name.startsWith(w)).map((a) => ({ ...a, insert: `${cmd} ${a.name}` })); }
  return [];
}
