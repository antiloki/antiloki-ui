// The AI-call modal is the app's forensic window: every "why did it do that / what did it cost"
// question lands here. Two things in it broke silently once before — the global chip navigator
// (window.antilokiOpenAICall was called from a dozen places and registered in none, so every
// cross-call chip no-op'd), and the tab set, which must offer only the tabs this call actually has
// data for. The human tag bar is the third: it writes the strongest evidence tier in the ledger, so
// it must never show "recorded" for a write that failed.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

let aiCallId: number | null = null;
const setAiCallId = vi.fn((v: any) => { aiCallId = v; });
let detail: any = { data: null, loading: false, notWired: false, error: false };

vi.mock("@/loki/shell/slug-context", () => ({ useShell: () => ({ aiCallId, setAiCallId }) }));
vi.mock("@/loki/api/hooks", () => ({ useAICallDetail: () => detail }));
vi.mock("@/loki/api/client", () => ({ BE_URL: "http://be.test" }));
vi.mock("@/loki/components/HeimdallFlag", () => ({ HeimdallFlag: () => <span data-testid="flag" /> }));

import { AICallModalRoot } from "./AICallModal";

const call = (over: any = {}) => ({
  id: 7, prompt_name: "tl-draft", agent: "tl", tier: "high", model_id: "vendor/big",
  cost_usd: 0.0123, duration_ms: 1500, outcome: "success", tokens_in: 100, tokens_out: 50,
  cached_from_id: null, reason_call_id: null, ...over,
});
const body = (over: any = {}) => ({ call: call(), output_kv: [], retry_attempts: [], ...over });

const show = (data: any, state: any = {}) => {
  aiCallId = 7;
  detail = { data, loading: false, notWired: false, error: false, ...state };
  return render(<AICallModalRoot />);
};

beforeEach(() => { aiCallId = null; setAiCallId.mockClear(); detail = { data: null, loading: false, notWired: false, error: false }; });
afterEach(() => { delete (window as any).antilokiOpenAICall; });

describe("the global chip navigator", () => {
  it("registers window.antilokiOpenAICall so every cross-call chip in the app works", () => {
    render(<AICallModalRoot />);
    expect(typeof (window as any).antilokiOpenAICall).toBe("function");
    (window as any).antilokiOpenAICall(42);
    expect(setAiCallId).toHaveBeenCalledWith(42);
  });

  it("ignores a nonsense id rather than opening an empty modal", () => {
    render(<AICallModalRoot />);
    for (const bad of [0, -1, NaN, "abc", null]) (window as any).antilokiOpenAICall(bad);
    expect(setAiCallId).not.toHaveBeenCalled();
  });

  it("unregisters itself on unmount", () => {
    const { unmount } = render(<AICallModalRoot />);
    unmount();
    expect((window as any).antilokiOpenAICall).toBeUndefined();
  });

  it("renders nothing at all until a call is selected", () => {
    const { container } = render(<AICallModalRoot />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the frame", () => {
  it("identifies the call, its prompt, agent and cognition badge", () => {
    show(body());
    expect(screen.getByText("#7")).toBeTruthy();
    expect(screen.getByText("tl-draft")).toBeTruthy();
    expect(screen.getAllByText("tl").length).toBeGreaterThan(0);
    expect(screen.getByText("broad-AI")).toBeTruthy();
  });

  it("sits above every other overlay in the app", () => {
    show(body());
    expect(Number(screen.getByTestId("ai-call-modal").style.zIndex)).toBeGreaterThan(400);
  });

  it("closes on the backdrop and on ✕, but not on a click inside", () => {
    show(body());
    fireEvent.click(screen.getByText("✕"));
    expect(setAiCallId).toHaveBeenCalledWith(null);

    setAiCallId.mockClear();
    fireEvent.click(screen.getByText("tl-draft"));
    expect(setAiCallId).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("ai-call-modal"));
    expect(setAiCallId).toHaveBeenCalledWith(null);
  });

  it("navigates to the calls this one is linked to", () => {
    const open = vi.fn();
    show(body({ call: call({ cached_from_id: 3, reason_call_id: 4 }), pair: { format_call_ids: [5, 6] } }));
    (window as any).antilokiOpenAICall = open;

    fireEvent.click(screen.getByText("cached from #3"));
    fireEvent.click(screen.getByText("reason #4"));
    fireEvent.click(screen.getByText("format #5"));
    fireEvent.click(screen.getByText("format #6"));
    expect(open.mock.calls.map((c) => c[0])).toEqual([3, 4, 5, 6]);
  });

  it("shows no link chips for a plain, unlinked call", () => {
    show(body());
    expect(screen.queryByText(/cached from/)).toBeNull();
    expect(screen.queryByText(/reason #/)).toBeNull();
    expect(screen.queryByText(/format #/)).toBeNull();
  });
});

describe("the load states", () => {
  it("says loading", () => {
    show(null, { loading: true });
    expect(screen.getByText("loading…")).toBeTruthy();
  });

  it("distinguishes a failed load from an unwired endpoint", () => {
    const { unmount } = show(null, { error: true });
    expect(screen.getByText("Failed to load call detail.")).toBeTruthy();
    unmount();

    show(null, { notWired: true });
    expect(screen.getByText(/not yet wired/)).toBeTruthy();
  });
});

describe("the tab set adapts to what the call carries", () => {
  const tabs = () => screen.getAllByRole("button").map((b) => b.textContent).filter((t) => /^(STATS|SWARM|PROMPT|INPUT|OUTPUT|CONTEXT|HEIMDALL|RETRIES)/i.test(t!));

  it("offers only the always-present tabs for a plain call", () => {
    show(body());
    expect(tabs()).toEqual(["stats", "prompt", "input", "output", "retries (0)"]);
  });

  it("adds swarm, context and heimdall only when their data exists, each counted", () => {
    show(body({
      swarm: { session_id: "s1", totals: { calls: 4, cost_usd: 1, tokens_in: 1, tokens_out: 1, wall_ms: 1, compute_ms: 1 }, rows: [] },
      context_bundle: { item_count: 9, total_tokens: 500, bone_tokens: 200, sliced_tokens: 300, budget: null, items: [] },
      heimdall: { decision: {} },
      retry_attempts: [{ id: 1 }, { id: 2 }],
    }));
    expect(tabs()).toEqual(["stats", "swarm (4)", "prompt", "input", "output", "context (9)", "heimdall", "retries (2)"]);
  });

  it("starts on stats and switches on click", () => {
    show(body({ rendered_prompt: "the system prompt" }));
    expect(screen.queryByText("the system prompt")).toBeNull();
    fireEvent.click(screen.getAllByText("prompt")[0]);   // the tab, not the stats row label
    expect(screen.getByText("the system prompt")).toBeTruthy();
  });
});

describe("the banners", () => {
  it("shows every validation error, flagged as a validation failure", () => {
    show(body({ validation_errors: ["missing field: goal", "bad enum: kind"] }));
    expect(screen.getByText("validation_failed")).toBeTruthy();
    expect(screen.getByText("· missing field: goal")).toBeTruthy();
    expect(screen.getByText("· bad enum: kind")).toBeTruthy();
  });

  it("shows a postmortem diagnosis with its class, severity and recommendation", () => {
    show(body({ report: { failure_class: "TRUNCATION", severity: "high", diagnosis_md: "the answer was cut", narrative_md: "context ran out", recommendation_md: "raise max_tokens" } }));
    expect(screen.getByText(/diagnosis · TRUNCATION · high/)).toBeTruthy();
    expect(screen.getByText("the answer was cut")).toBeTruthy();
    expect(screen.getByText("context ran out")).toBeTruthy();
    expect(screen.getByText(/raise max_tokens/)).toBeTruthy();
  });

  it("shows no banners for a healthy call", () => {
    show(body());
    expect(screen.queryByText("validation_failed")).toBeNull();
    expect(screen.queryByText(/diagnosis ·/)).toBeNull();
  });
});

describe("the output tree", () => {
  const outputs = (rows: any[]) => {
    show(body({ output_kv: rows }));
    fireEvent.click(screen.getByText("output"));
  };

  it("says so when the call produced nothing", () => {
    outputs([]);
    expect(screen.getByText("(empty output)")).toBeTruthy();
  });

  it("nests children under their parent and orders siblings by their index", () => {
    outputs([
      { id: 2, field_name: "second", value_text: "b", order_index: 1, parent_output_id: null },
      { id: 1, field_name: "first", value_text: "a", order_index: 0, parent_output_id: null },
      { id: 3, field_name: "child", value_text: "c", order_index: 0, parent_output_id: 1 },
    ]);
    const items = Array.from(document.querySelectorAll("li")).map((l) => l.textContent);
    expect(items[0]).toContain("first");
    expect(items[0]).toContain("child");           // nested inside the first
    expect(items.some((t) => t!.startsWith("second"))).toBe(true);
    expect(items.findIndex((t) => t!.startsWith("first"))).toBeLessThan(items.findIndex((t) => t!.startsWith("second")));
  });

  it("renders each value type, including a falsy number and boolean", () => {
    outputs([
      { id: 1, field_name: "n", value_number: 0, order_index: 0, parent_output_id: null },
      { id: 2, field_name: "b", value_boolean: false, order_index: 1, parent_output_id: null },
      { id: 3, field_name: "t", value_text: "text", order_index: 2, parent_output_id: null },
      { id: 4, field_name: "empty", order_index: 3, parent_output_id: null },
    ]);
    const items = Array.from(document.querySelectorAll("li")).map((l) => l.textContent);
    expect(items).toContain("n0");
    expect(items).toContain("bfalse");
    expect(items).toContain("ttext");
    expect(items).toContain("empty");
  });
});

describe("the human verdict bar", () => {
  const fetchMock = vi.fn();
  // The verdict bar lives on the heimdall tab — it tags the CASTING, not the call in the abstract.
  const openTagBar = (heimdall: any = {}) => {
    vi.stubGlobal("fetch", fetchMock);
    show(body({ heimdall }));
    fireEvent.click(screen.getByText(/^heimdall$/));
  };

  beforeEach(() => { fetchMock.mockReset().mockResolvedValue({ ok: true }); });
  afterEach(() => vi.unstubAllGlobals());

  it("offers four verdicts with no neutral option", () => {
    openTagBar();
    for (const l of ["−2 wrong", "−1 weak", "+1 good", "+2 excellent"]) expect(screen.getByText(l), l).toBeTruthy();
    expect(screen.queryByText(/neutral|0 /)).toBeNull();
  });

  it("posts the verdict for THIS call and confirms only after the write lands", async () => {
    openTagBar();
    fireEvent.click(screen.getByText("+2 excellent"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://be.test/api/v1/heimdall/tag");
    expect(JSON.parse(init.body)).toMatchObject({ ai_call_id: 7, verdict: 2, surface: "castings" });
    await waitFor(() => expect(screen.getByText("✓ recorded")).toBeTruthy());
  });

  it("carries the operator's reason, and omits it when blank", async () => {
    openTagBar();
    fireEvent.change(screen.getByPlaceholderText(/optional: why/), { target: { value: "  it invented an API  " } });
    fireEvent.click(screen.getByText("−2 wrong"));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[0][1].body).reason_md).toBe("it invented an API"));

    fireEvent.change(screen.getByPlaceholderText(/optional: why/), { target: { value: "   " } });
    fireEvent.click(screen.getByText("−1 weak"));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[1][1].body).reason_md).toBeUndefined());
  });

  it("says it FAILED rather than recorded when the BE refuses", async () => {
    openTagBar();
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    fireEvent.click(screen.getByText("+1 good"));
    await waitFor(() => expect(screen.getByText(/✗ failed/)).toBeTruthy());
    expect(screen.queryByText("✓ recorded")).toBeNull();
  });

  it("survives a network rejection the same way", async () => {
    openTagBar();
    fetchMock.mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByText("+1 good"));
    await waitFor(() => expect(screen.getByText(/✗ failed/)).toBeTruthy());
  });

  it("shows an existing tag as the current one, and lets it be replaced", async () => {
    openTagBar({ human_tag: { verdict: -1, reason_md: "weak" } });
    const weak = screen.getByText("−1 weak");
    expect(weak.getAttribute("title")).toContain("current tag");
    fireEvent.click(screen.getByText("+2 excellent"));
    await waitFor(() => expect(screen.getByText("+2 excellent").getAttribute("title")).toContain("current tag"));
  });

  it("blocks a second click while one is in flight", async () => {
    openTagBar();
    let release: (v: any) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => { release = r; }));
    fireEvent.click(screen.getByText("+1 good"));
    fireEvent.click(screen.getByText("+2 excellent"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { release({ ok: true }); });
  });
});
