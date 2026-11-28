import { describe, it, expect } from "vitest";
import { qrSvg, secondsLeft, clock, linkChoices, deviceLine } from "./phone-model";
import { pairCodeIn, deviceName, withoutPair } from "@/loki/api/pairing";
import { beUrlFor } from "@/loki/api/client";

describe("the phone", () => {
  it("draws a QR as an svg for any link, longer ones too", () => {
    for (const t of ["http://192.168.1.5:41932/?pair=ABCD2345", "https://quick-brown-fox.trycloudflare.com/?pair=ABCD2345"]) { const s = qrSvg(t); expect(s).toContain("<svg"); expect(s).toContain("viewBox"); expect(s.length).toBeGreaterThan(500); }
    expect(qrSvg("a")).not.toBe(qrSvg("b"));
  });
  it("counts a code's time down and never below zero", () => { expect(secondsLeft(10_000, 4_000)).toBe(6); expect(secondsLeft(10_000, 20_000)).toBe(0); expect(clock(299)).toBe("4:59"); expect(clock(5)).toBe("0:05"); });
  it("offers the tunnel's link first", () => { expect(linkChoices([{ label: "same network", url: "a" }, { label: "tunnel", url: "t" }, { label: "same network", url: "b" }]).map((l) => l.url)).toEqual(["t", "a", "b"]); });
  it("says who a device is and when it was last seen", () => {
    expect(deviceLine({ name: "iPhone", last_seen_ms: 0, revoked: false }, 30_000)).toBe("iPhone · seen just now"); expect(deviceLine({ name: "iPhone", last_seen_ms: 0, revoked: false }, 600_000)).toBe("iPhone · seen 10 min ago");
    expect(deviceLine({ name: "iPhone", last_seen_ms: 0, revoked: false }, 3 * 86_400_000)).toBe("iPhone · seen 3 days ago"); expect(deviceLine({ name: "iPad", last_seen_ms: 0, revoked: true }, 1)).toBe("iPad · revoked");
  });
  it("reads a pairing code from an address, names the device and cleans the address", () => {
    expect(pairCodeIn("?pair=abcd2345")).toBe("ABCD2345"); expect(pairCodeIn("?pair=")).toBeNull(); expect(pairCodeIn("?x=1")).toBeNull(); expect(pairCodeIn("?pair=a b")).toBeNull(); expect(pairCodeIn("?pair=<script>")).toBeNull();
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1")).toBe("iPhone · Safari"); expect(deviceName("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0 Mobile Safari/537.36")).toBe("Android phone · Chrome"); expect(deviceName("???")).toBe("device");
    expect(withoutPair("http://192.168.1.5:41932/sagas?pair=ABCD2345#saga/3")).toBe("/sagas#saga/3"); expect(withoutPair("http://h/?a=1&pair=X1")).toBe("/?a=1");
  });
  it("asks the machine the page came from, unless it is the desktop app or the dev server", () => {
    expect(beUrlFor(undefined, { protocol: "http:", hostname: "192.168.1.5", origin: "http://192.168.1.5:41932" })).toBe("http://192.168.1.5:41932");
    expect(beUrlFor(undefined, { protocol: "https:", hostname: "x.trycloudflare.com", origin: "https://x.trycloudflare.com" })).toBe("https://x.trycloudflare.com");
    expect(beUrlFor(undefined, { protocol: "http:", hostname: "localhost", origin: "http://localhost:5199" })).toBe("http://localhost:41931"); expect(beUrlFor(undefined, { protocol: "tauri:", hostname: "localhost", origin: "tauri://localhost" })).toBe("http://localhost:41931");
    expect(beUrlFor("http://localhost:41999", { protocol: "http:", hostname: "192.168.1.5", origin: "http://192.168.1.5:1" })).toBe("http://localhost:41999"); expect(beUrlFor(undefined, null)).toBe("http://localhost:41931");
  });
});
