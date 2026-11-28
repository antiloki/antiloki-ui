// Vitest global setup — registers @testing-library/jest-dom custom matchers
// (toBeVisible, toHaveTextContent, etc.) on the global expect.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";

// A pane keeps its place in localStorage (keptplace.ts): one test must not start where the last one stopped.
const forgetPlaces = () => { try { for (const k of Object.keys(localStorage)) if (k.startsWith("antiloki.place.")) localStorage.removeItem(k); } catch { /* no storage here */ } };
beforeEach(forgetPlaces); afterEach(forgetPlaces);   // before too: a late write of the last test's pane must not leak into the next one
