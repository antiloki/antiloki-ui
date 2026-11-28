// SESSION CONTEXT STUDIO (S5): the shared-memory wizard. Asserts the shared
// lanes load (mission + context docs + coordination), and the "what this pane
// sees" preview assembles the honest context block (mission + docs + scope +
// scratch) — the anti-hidden-memory guarantee.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const posts: any[] = [];
vi.mock("@/loki/api/client", () => ({
  unwrapResult: (r: any) => (r?.result ?? r) ?? null, // real impl — components import it from the mocked module
  apiPost: vi.fn(async (url: string, body: any) => {
    posts.push({ url, body });
    if (url.endsWith("/cockpit/context-preview")) return { ok: true, kind: body?.kind, text: body?.kind === "cards" ? "- [doing] CARD-1 — ship login" : "" };
    if (url.endsWith("/cockpit/pane/brief")) return {
      ok: true,
      pane: { id: body?.pane_id, idx: 0, subagent_name: "ui-pane", pane_kind: "agent", tier: "low", model_id: null },
      sections: [
        { key: "persona", label: "persona · base identity + your guidance", tokens: 3, body: "be terse" },
        { key: "mission", label: "mission + shared context (sources embedded)", tokens: 42, body: "ship the login screen\n\n--- CONTEXT DOC #5 ---\nAUTH: use /api/v1/session" },
        { key: "scope", label: "edit scope · what it may WRITE", tokens: 4, body: "src/ui/**" },
      ],
      docs: [{ id: 5, label: "AUTH: use /api/v1/session", source: null, tokens: 8, excluded: false }],
      totals: { tokens: 49 },
    };
    if (url.endsWith("/codebase/get")) return { nodes: [{ type: "file", path: "src/api/auth.ts" }, { type: "file", path: "src/ui/Login.tsx" }], file_tokens: {} };
    if (url.endsWith("/blackboard/read")) {
      // shared read (no pane_id) vs per-pane scratch read
      if (body?.pane_id == null) {
        const docs = [{ id: 5, body_md: "AUTH: use /api/v1/session" }];
        if (body.session_id === 2) docs.push({ id: 9, body_md: "CONTEXT SOURCE — Cards:\n(consult…)" });
        return { mission_md: "ship the login screen", context_docs: docs, coordination: [{ id: 1, kind: "handoff", body_md: "@ui take the button" }] };
      }
      return { scratch: body.pane_id === 11 ? [{ kind: "note", body_md: "tried the modal approach" }] : [] };
    }
    return { ok: true };
  }),
}));

import { ContextStudio } from "./cockpit-panes-extra";
import type { Pane } from "@/loki/api/types";

const panes = [
  { id: 11, idx: 0, subagent_name: "ui-pane", scope: ["src/ui/**"], extra_prompt_md: "be terse" },
  { id: 12, idx: 1, subagent_name: "api-pane", scope: ["src/api/**"] },
] as unknown as Pane[]; // partial rows — the studio only reads these fields

describe("ContextStudio", () => {
  it("loads shared lanes; the PROMPT WINDOW shows the exact slice + token sums; reads/writes split per agent", async () => {
    render(<ContextStudio sessionId={1} panes={panes} onClose={() => {}} onChanged={() => {}} />);

    // shared memory lanes populate from the blackboard
    expect((await screen.findByDisplayValue("ship the login screen"))).toBeTruthy();
    expect(screen.getByText(/AUTH: use \/api\/v1\/session/)).toBeTruthy();
    expect(screen.getByText(/@ui take the button/)).toBeTruthy();

    // the agent card makes the READS/WRITES distinction (scope = writes)
    expect(screen.getAllByText("src/ui/**").length).toBeGreaterThan(0);
    // per-agent read toggles exist for the shared doc
    expect((await screen.findAllByTestId("read-toggle")).length).toBeGreaterThan(0);

    // 🧾 prompt opens the PROMPT WINDOW: the server-assembled slice + token sums
    const seesButtons = await screen.findAllByTestId("pane-sees");
    fireEvent.click(seesButtons[0]);
    const win = await screen.findByTestId("prompt-window");
    expect(await screen.findByTestId("prompt-total")).toBeTruthy();     // Σ ≈49 tok
    expect(win.textContent).toMatch(/mission \+ shared context \(sources embedded\)/);
    expect(win.textContent).toMatch(/≈49 tok/);
    // the mission section starts open and carries the EMBEDDED doc, not a pointer
    expect(win.textContent).toMatch(/AUTH: use \/api\/v1\/session/);
    const call = posts.find((p) => p.url.endsWith("/cockpit/pane/brief"));
    expect(call?.body?.pane_id).toBe(11);
  });

  it("unchecking a doc on an agent card writes that pane's context_excludes", async () => {
    posts.length = 0;
    render(<ContextStudio sessionId={1} panes={panes} onClose={() => {}} onChanged={() => {}} />);
    const toggles = await screen.findAllByTestId("read-toggle");
    fireEvent.click(toggles[0]); // exclude doc #5 for pane #11
    await screen.findAllByTestId("read-toggle"); // let the async update flush
    const upd = posts.find((p) => p.url.endsWith("/cockpit/pane/update") && p.body?.context_excludes);
    expect(upd?.body?.pane_id).toBe(11);
    expect(upd?.body?.context_excludes).toEqual([5]);
  });

  it("quick-add chips seed a labeled doc; the code checkbox adds a focus-files doc", async () => {
    posts.length = 0;
    render(<ContextStudio sessionId={1} panes={panes} onClose={() => {}} onChanged={() => {}} />);
    // chip seeds the add textarea with a label
    const chips = await screen.findAllByTestId("doc-chip");
    fireEvent.click(chips[0]); // Constraint
    expect(((await screen.findByPlaceholderText(/paste new context/)) as HTMLTextAreaElement).value).toContain("[Constraint] ");
    // open the code checkbox tree (same atlas component the studios use)
    fireEvent.click(screen.getByTestId("toggle-files"));
    expect(await screen.findByPlaceholderText(/filter files/)).toBeTruthy();
  });

  it("the full notebook source sidebar (Code/Work/Knowledge chips) is present and one-click adds", async () => {
    posts.length = 0;
    render(<ContextStudio sessionId={1} panes={panes} onClose={() => {}} onChanged={() => {}} />);
    const chips = await screen.findAllByTestId("source-chip");
    // Code(9 — incl. the self-generated Docs) + Work(5) + Knowledge(3 — memory + the two
    // faculty magazines, Stack Gazette / Market Herald) = 17 source chips
    expect(chips.length).toBe(17);
    const cardsChip = chips.find((c) => /Cards/.test(c.textContent ?? ""));
    const memChip = chips.find((c) => /Memory/.test(c.textContent ?? ""));
    expect(cardsChip).toBeTruthy();
    expect(memChip).toBeTruthy();
    fireEvent.click(cardsChip!);
    const add = posts.find((p) => p.url.endsWith("/blackboard/post") && /CONTEXT SOURCE — Cards/.test(p.body?.body_md ?? ""));
    expect(add).toBeTruthy();
  });

  it("an active source chip toggles OFF (deletes its doc) — the reported bug", async () => {
    posts.length = 0;
    // session 2's blackboard-read includes a Cards source doc (id 9), so its chip is active (✓).
    render(<ContextStudio sessionId={2} panes={panes} onClose={() => {}} onChanged={() => {}} />);
    const chips = await screen.findAllByTestId("source-chip");
    const cards = chips.find((c) => /Cards/.test(c.textContent ?? ""))!;
    expect(cards.textContent).toMatch(/✓/);   // shows as added
    posts.length = 0;
    fireEvent.click(cards);                    // clicking the active chip removes it
    const del = posts.find((p) => p.url.endsWith("/blackboard/post") && p.body?.op === "delete" && p.body?.id === 9);
    expect(del, "clicking an active source chip must delete its doc").toBeTruthy();
  });

  it("expanding a source tile fetches + shows the LIVE preview (not just the stub)", async () => {
    posts.length = 0;
    // session 2 has the Cards source doc (id 9) — its tile expands to a live preview
    render(<ContextStudio sessionId={2} panes={panes} onClose={() => {}} onChanged={() => {}} />);
    const tiles = await screen.findAllByTestId("studio-doc");
    const cardsTile = tiles.find((t) => /live source/.test(t.textContent ?? ""))!;
    expect(cardsTile).toBeTruthy();
    fireEvent.click(cardsTile);
    expect(await screen.findByTestId("source-preview")).toBeTruthy();
    expect(await screen.findByText(/CARD-1 — ship login/)).toBeTruthy();
    const call = posts.find((p) => p.url.endsWith("/cockpit/context-preview"));
    expect(call?.body?.kind).toBe("cards");
  });

  it("adds a context doc through the shared endpoint", async () => {
    posts.length = 0;
    render(<ContextStudio sessionId={1} panes={panes} onClose={() => {}} onChanged={() => {}} />);
    const ta = await screen.findByPlaceholderText(/paste new context/);
    fireEvent.change(ta, { target: { value: "new decision: single-writer per card" } });
    fireEvent.click(screen.getByText("+ add context"));
    const add = posts.find((p) => p.url.endsWith("/blackboard/post") && p.body?.kind === "context");
    expect(add?.body.body_md).toMatch(/single-writer per card/);
  });
});
