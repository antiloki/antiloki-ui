import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // House style codified (2026-07-16): dense terse formatting is deliberate — no
      // formatter runs in lint (eslint-plugin-prettier removed; it made lint permanently
      // red against a style that was never going to change). Correctness rules only.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // `any` at the BE data boundary is the current deliberate state (~2k sites). The
      // boundary-typing program (typed unwrap<T>, Pane props) flips this to "warn" when it lands.
      "@typescript-eslint/no-explicit-any": "off",
      // Annotated empty catches (`catch { /* best-effort */ }`) are the house error idiom.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Short-circuit + ternary expression-statements (`x && fn()`) are the house control idiom.
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      // JSX TEXT may use typographic spaces (U+3000 list markers in design-stories) — that's
      // rendered content. Code positions stay guarded: invisible chars in code are landmines
      // (a literal 0x01 in atlas-graph and a literal BOM in a regex both read as "" in review).
      "no-irregular-whitespace": ["error", { skipJSXText: true }],
    },
  },
);
