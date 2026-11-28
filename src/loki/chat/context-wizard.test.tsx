// ContextWizard — crash regression (operator report 2026-07-15): "(callsQ.data ?? []).slice is
// not a function". /api/v1/ai-calls returns { rows, count }, not a bare array; the wizard must
// tolerate every list shape and still render its chips.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The wizard pulls in view-widgets, which transitively renders a router <Link>. Standing up a real
// RouterProvider here would test the router, not the wizard's list-shape tolerance — so the router
// is stubbed to a plain anchor. Without this the render throws on `null.isServer`.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={String(to ?? "#")} {...rest}>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ navigate: vi.fn() }),
  useSearch: () => ({}),
  useParams: () => ({}),
}));

vi.mock("@/loki/api/hooks", () => ({
  useCards: () => ({ data: [{ id: 412, slug: "FEAT-X" }], loading: false }),
  useKnowledgeDocs: () => ({ data: [{ id: 1, vault_path: "notes/auth.md", summary: "auth notes" }], loading: false }),
  useContracts: () => ({ data: [{ id: 7, slug: "FEAT-X-C1", title: "contract", status: "draft" }], loading: false }),
  useMemoryList: () => ({ data: [{ id: 9, title: "a lesson", summary_md: "s" }], loading: false }),
  // the EXACT shape that crashed: an object wrapper, not an array.
  useAICalls: () => ({ data: { rows: [{ id: 6113 }], count: 1 }, loading: false }),
  // view-widgets (pulled in via CodeSampleWidget) touches these at module scope:
  useCard: () => ({ data: null, loading: false }),
  usePipeline: () => ({ data: null, loading: false }),
  useCostToday: () => ({ data: null, loading: false }),
  useAuditTimeline: () => ({ data: [], loading: false }),
}));
vi.mock("@/loki/api/client", () => ({
  unwrapResult: (r: any) => (r?.result ?? r) ?? null, // real impl — components import it from the mocked module
  apiGet: vi.fn(async () => null),
  apiPost: vi.fn(async () => ({ nodes: [], file_tokens: null })),
}));
vi.mock("@/loki/api/codebase", () => ({
  fileRead: vi.fn(async () => null),
  widgetGenerate: vi.fn(async () => null),
  widgetSave: vi.fn(async () => null),
  explainSnippet: vi.fn(async () => null),
  getAtlas: vi.fn(async () => null),
}));
vi.mock("@/loki/api/dispatch", () => ({
  fetchByokStatus: vi.fn(async () => null),
  sendTerminalCommand: vi.fn(async () => null),
  sendTerminalSandbox: vi.fn(async () => null),
  sendDeepSearch: vi.fn(async () => null),
}));

import { ContextWizard } from "./context-wizard";

const noop = () => {};
const props = {
  refs: [] as any[],
  refKey: (r: any) => `${r.kind}:${r.slug ?? r.docId ?? r.path ?? r.source ?? r.id}`,
  trayLabel: (r: any) => String(r.slug ?? r.label ?? r.path ?? ""),
  addRef: noop, removeRef: noop, uploading: false, onUploadClick: noop, onClose: noop,
  model: null as string | null, setModel: noop,
};

describe("ContextWizard — list-shape tolerance + id-only rows", () => {
  it("renders every checkbox group even when ai-calls returns { rows } instead of an array", () => {
    render(<ContextWizard {...props} />);
    // groups (collapsed by default) — expand cards' FEAT/ and the work groups
    fireEvent.click(screen.getByText("FEAT/"));
    expect(screen.getByText("#412")).toBeTruthy();               // cards: rows show ONLY the ID
    expect(screen.queryByText(/\+ FEAT-X/)).toBeNull();          // never the slug/title on the row
    fireEvent.click(screen.getByText("Contracts/"));
    expect(screen.getByText("#7")).toBeTruthy();                 // contracts row: id only
    fireEvent.click(screen.getByText("AI calls/"));
    expect(screen.getByText("#6113")).toBeTruthy();              // ai calls ({ rows } shape — the crash)
    fireEvent.click(screen.getByText("notes/"));
    expect(screen.getByText(/auth\.md/)).toBeTruthy();           // knowledge docs grouped by folder
    expect(screen.getByText(/Generated docs/)).toBeTruthy();     // the generated-docs source chip
    expect(screen.getByText(/Stack Gazette/)).toBeTruthy();      // the faculty chips ride the catalog
    expect(screen.getByText("Context load")).toBeTruthy();       // the instrument panel is up
    expect(screen.getByText("Answering AI")).toBeTruthy();       // the model tile replaced the cost tile
    expect(screen.queryByText(/Est\. input cost/)).toBeNull();
  });
});
