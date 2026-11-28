// SCRIPTS REGISTRY strip (operator 2026-07-06: "a place at the code screen to track
// deterministically and store what the scripts commands are for building, run and
// testing — editable — this way the error doesn't occur like that"). One decided,
// editable answer per lifecycle command; the build/test gates and the recovery
// ladder read this registry first, package.json detection fills the gaps.
import * as React from "react";
import { apiGet, apiPost } from "@/loki/api/client";
import { C } from "@/loki/theme";

const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';
const FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "build", label: "build", hint: "the build gate runs this after apply" },
  { key: "dev", label: "dev / run", hint: "the preview + recovery ladder's dev-server" },
  { key: "test", label: "test", hint: "the test gate runs this after a GREEN build" },
  { key: "install", label: "install", hint: "deps install (preview + first-boot): npm ci / npm install / yarn / pnpm" },
];

export function ScriptsRegistry() {
  const [data, setData] = React.useState<any>(null);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [state, setState] = React.useState<"loading" | "ok" | "absent" | "saving">("loading");
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    try {
      const r: any = await apiGet(`/api/v1/workspace/scripts`);
      const d = r?.result ?? r;
      if (!d?.scripts) { setState("absent"); return; }
      setData(d);
      setDraft({ build: d.scripts.build ?? "", dev: d.scripts.dev ?? "", test: d.scripts.test ?? "", install: d.scripts.install ?? "", env: d.scripts.env ?? "" });
      setState("ok");
    } catch { setState("absent"); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (state === "absent") return null; // endpoint absent pre-restart — the strip hides
  if (state === "loading") return <div style={{ padding: "8px 18px", fontFamily: mono, fontSize: 10, color: C.muted }}>scripts registry…</div>;

  const save = async () => {
    setState("saving");
    try {
      await apiPost(`/api/v1/workspace/scripts`, draft);
      setSavedAt(Date.now());
      await load();
    } catch { setState("ok"); }
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", padding: "10px 18px", borderTop: `1px solid ${C.border}`, background: C.panel, flexWrap: "wrap" }}>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.brand, textTransform: "uppercase", letterSpacing: 1, alignSelf: "center" }}>
        scripts registry
        <div style={{ fontSize: 8.5, color: C.muted, textTransform: "none", letterSpacing: 0, marginTop: 2 }}>the gates run EXACTLY these — no guessing</div>
      </div>
      {FIELDS.map((f) => (
        <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 210, flex: 1 }} title={f.hint}>
          <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>
            {f.label}{" "}
            <span style={{ color: data?.source?.[f.key] === "recorded" ? C.ok : data?.source?.[f.key] === "detected" ? C.brand : C.dim }}>
              · {data?.source?.[f.key] ?? "none"}{data?.source?.[f.key] === "detected" ? ` (${data?.detected?.[f.key] ?? ""})` : ""}
            </span>
          </span>
          <input
            value={draft[f.key] ?? ""}
            placeholder={data?.detected?.[f.key] ?? "(none — gate skips)"}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.fg, padding: "6px 9px", borderRadius: 5, fontFamily: mono, fontSize: 10.5 }}
          />
        </label>
      ))}
      <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 100%", minWidth: 260 }} title="environment variables the preview + gates apply — KEY=VALUE per line">
        <span style={{ fontFamily: mono, fontSize: 9, color: C.muted }}>env vars <span style={{ color: C.dim }}>· KEY=VALUE per line — e.g. NODE_OPTIONS=--openssl-legacy-provider</span></span>
        <textarea value={draft.env ?? ""} placeholder="NODE_OPTIONS=--openssl-legacy-provider" spellCheck={false}
          onChange={(e) => setDraft((d) => ({ ...d, env: e.target.value }))}
          style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.fg, padding: "6px 9px", borderRadius: 5, fontFamily: mono, fontSize: 10.5, minHeight: 50, resize: "vertical", boxSizing: "border-box" }} />
      </label>
      <button onClick={save} disabled={state === "saving"}
        style={{ background: "transparent", border: `1px solid ${C.brand}`, color: C.brand, padding: "6px 14px", borderRadius: 5, fontFamily: mono, fontSize: 10.5, cursor: "pointer" }}>
        {state === "saving" ? "saving…" : "save"}
      </button>
      {savedAt && <span style={{ fontFamily: mono, fontSize: 9.5, color: C.ok }}>✓ recorded</span>}
    </div>
  );
}
