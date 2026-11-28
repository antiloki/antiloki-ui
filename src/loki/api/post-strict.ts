// A POST THAT SAYS WHY IT FAILED (audit 2026-10-01). `apiPost` turns every failure into `null` - a refused token (401/400), a timeout, a dead
// serve - and turns a 404 into a `{__not_wired}` object that is truthy. Code written as `try { await apiPost(..); say("saved") } catch { say(error) }`
// therefore ALWAYS said "saved": the catch could not run. This wraps `apiPost` (with `throwOnError`, so a refusal carries the serve's own sentence)
// and throws for the three other ways a write can fail: nothing came back, the route is not there, the engine threw. A screen that has to tell the
// operator whether a write landed calls this; the hundred read paths that must not crash a screen keep `apiPost`.
import { apiPost } from "@/loki/api/client";

/** the sentence to show for a failed write: the serve's reason without the "POST /path → 400:" transport prefix. Pure. */
export function reasonOf(e: unknown): string {
  return String((e as any)?.message ?? e ?? "").replace(/^POST [^ ]+ → \d{3}:?\s*/, "").trim() || "the serve refused it";
}

export async function apiPostStrict<T = any>(path: string, body: any = {}, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const r: any = await apiPost<T>(path, body, { ...opts, throwOnError: true });
  if (r == null) throw new Error("the serve did not answer (offline, or it took too long)");
  // the sentinel shapes are read here, not through client's isNotWired/engineError, so a test that mocks the client module with just apiGet/apiPost still reaches this
  if (r.__not_wired === true) throw new Error(`this antiloki-serve does not have ${path.replace(/^\/api\/v1/, "")} yet - restart it`);
  const eng = r.__engine_error;
  if (eng) throw new Error(eng.cause || eng.code || "the engine refused it");
  return r as T;
}
