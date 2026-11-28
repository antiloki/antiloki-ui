// Substrate timestamps are SQLite's `datetime('now')` — UTC, no timezone marker. Rendering them
// raw showed an operator in UTC-3 a clock three hours ahead. These helpers exist to fix that, so
// the tests pin the UTC-interpretation itself, not just "a string comes back".
import { describe, it, expect, vi, afterEach } from "vitest";
import { toLocalHMS, toLocalFull, fmtAgoSec, localTzLabel } from "./time";

afterEach(() => vi.useRealTimers());

describe("toLocalHMS / toLocalFull — naked substrate timestamps are UTC", () => {
  it("interprets a naked 'YYYY-MM-DD HH:MM:SS' as UTC, not local", () => {
    // The assertion is timezone-independent: whatever the runner's zone, the rendered clock must
    // equal what Date gives for the SAME instant parsed as UTC. A naive parser (local) would drift.
    const ts = "2026-08-13 12:00:00";
    const expected = new Date(Date.UTC(2026, 7, 13, 12, 0, 0));
    const hh = String(expected.getHours()).padStart(2, "0");
    const mm = String(expected.getMinutes()).padStart(2, "0");
    const ss = String(expected.getSeconds()).padStart(2, "0");
    expect(toLocalHMS(ts)).toBe(`${hh}:${mm}:${ss}`);
  });

  it("accepts an already-ISO timestamp without double-appending Z", () => {
    const iso = "2026-08-13T12:00:00Z";
    expect(toLocalHMS(iso)).toBe(toLocalHMS("2026-08-13 12:00:00"));
  });

  it("handles fractional seconds (SQLite writes .fff)", () => {
    expect(toLocalHMS("2026-08-13 12:00:00.123")).toBe(toLocalHMS("2026-08-13 12:00:00"));
  });

  it("toLocalFull returns a full local stamp for the same instant", () => {
    const d = new Date(Date.UTC(2026, 7, 13, 12, 34, 56));
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(toLocalFull("2026-08-13 12:34:56")).toBe(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    );
  });

  it("empty/null/undefined render as an empty string, never 'Invalid Date'", () => {
    for (const v of [null, undefined, ""]) {
      expect(toLocalHMS(v)).toBe("");
      expect(toLocalFull(v)).toBe("");
    }
  });

  it("an unparseable string still shows SOMETHING rather than nothing", () => {
    // The fallback exists so a malformed row never renders blank in the timeline.
    expect(toLocalHMS("garbage 09:41:07 garbage")).toBe("09:41:07");
    expect(toLocalHMS("total garbage")).toBe("total garbage");
    expect(toLocalFull("total garbage")).toBe("total garbage");
  });
});

describe("fmtAgoSec — the unit boundaries", () => {
  it("sub-second is 'now', not '0s'", () => {
    expect(fmtAgoSec(0)).toBe("now");
    expect(fmtAgoSec(0.9)).toBe("now");
  });

  it("truncates rather than rounds at each boundary", () => {
    expect(fmtAgoSec(1)).toBe("1s");
    expect(fmtAgoSec(59.9)).toBe("59s");
    expect(fmtAgoSec(60)).toBe("1m");
    expect(fmtAgoSec(119)).toBe("1m"); // 1m59s is still "1m"
    expect(fmtAgoSec(3599)).toBe("59m");
    expect(fmtAgoSec(3600)).toBe("1h");
    expect(fmtAgoSec(86399)).toBe("23h");
    expect(fmtAgoSec(86400)).toBe("1d");
    expect(fmtAgoSec(86400 * 400)).toBe("400d");
  });
});

describe("localTzLabel", () => {
  it("names the zone and its UTC offset", () => {
    const label = localTzLabel();
    expect(label).toMatch(/UTC[+-]\d{2}/);
    expect(label.length).toBeGreaterThan(3);
  });

  it("degrades to 'local' instead of throwing when Intl is unavailable", () => {
    const orig = Intl.DateTimeFormat;
    // @ts-expect-error — deliberately breaking the global to prove the catch path
    Intl.DateTimeFormat = () => { throw new Error("no Intl"); };
    try {
      expect(localTzLabel()).toBe("local");
    } finally {
      Intl.DateTimeFormat = orig;
    }
  });
});
