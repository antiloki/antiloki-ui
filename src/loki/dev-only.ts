// WHAT IS NOT SHIPPED YET (operator 2026-09-23: "let's hide for now teams feature to the app and only show in dev
// mode"). A feature can be finished enough to use every day and still not be finished enough to put in front of a
// customer — Teams is one: the members share a brief, but they do not hand artefacts to one another yet, so calling
// it a pipeline in the shipped app would promise more than it does.
//
// The rule is the build, not a setting: `vite dev` and the test runner are dev, a production bundle is not. The
// localStorage escape hatch exists for one case only — showing the thing in a built app on purpose (a demo, a
// bug report) — and it is per-browser, so nobody can turn it on for anyone else.
export const DEV_FLAG_KEY = "antiloki:dev-features";

/** Should the unshipped features render here? Pure apart from the two reads, both of which can throw. */
export function devOnly(): boolean {
  try { if (localStorage.getItem(DEV_FLAG_KEY) === "on") return true; } catch { /* storage blocked — the build decides */ }
  try { return !!(import.meta as any)?.env?.DEV; } catch { return false; }
}
