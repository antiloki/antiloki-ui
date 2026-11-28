// Type surface for the engine's pure taxonomy module that the
// shared.test.ts vocabulary canary imports cross-package (the engine has
// no TS). Wildcard pattern because TS forbids relative names in ambient
// module declarations.
declare module "*failure-classes.mjs" {
  export const FAILURE_CLASSES: readonly string[];
  export function classifyFailure(evidence: unknown): string;
  export function renderDiagnosisMd(cls: string, evidence: unknown): string;
  export function renderRecommendationMd(cls: string, evidence: unknown): string | null;
}
