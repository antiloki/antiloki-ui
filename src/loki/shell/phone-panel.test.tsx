// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";

const st = (o: any = {}) => ({ enabled: false, port: 0, addresses: [], tunnel: null, devices: [], app: true, cloudflared: false, ...o });
const api = { status: vi.fn(), enable: vi.fn(), disable: vi.fn(), pair: vi.fn(), tunnel: vi.fn(), revoke: vi.fn() };
vi.mock("@/loki/api/remote", () => ({ remoteStatus: (...a: any[]) => api.status(...a), remoteEnable: (...a: any[]) => api.enable(...a), remoteDisable: (...a: any[]) => api.disable(...a), remotePair: (...a: any[]) => api.pair(...a), remoteTunnel: (...a: any[]) => api.tunnel(...a), remoteRevoke: (...a: any[]) => api.revoke(...a) }));
import { PhonePanel } from "./phone-panel";

const pairing = (o: any = {}) => ({ code: "ABCD2345", expires_ms: Date.now() + 300_000, links: [{ label: "same network", url: "http://192.168.1.5:41932/?pair=ABCD2345" }], app: true, ...o });

describe("the phone panel", () => {
  beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); api.status.mockResolvedValue({ status: st() }); });
  afterEach(() => cleanup());
  it("turns the door on and shows a QR, the code and its time when asked, and nothing before", async () => {
    api.enable.mockResolvedValue({ status: st({ enabled: true, port: 41932, addresses: ["http://192.168.1.5:41932"] }) }); api.pair.mockResolvedValue({ pairing: pairing() });
    render(<PhonePanel onClose={() => {}} />);
    await waitFor(() => screen.getByTestId("phone-show-qr")); expect(screen.queryByTestId("phone-qr")).toBeNull(); expect(api.enable).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("phone-show-qr")); await waitFor(() => screen.getByTestId("phone-qr"));
    expect(screen.getByTestId("phone-qr").innerHTML).toContain("<svg"); expect(screen.getByTestId("phone-code").textContent).toBe("ABCD2345"); expect(screen.getByTestId("phone-left").textContent).toMatch(/expires in [45]:/); expect(screen.getByTestId("phone-link").textContent).toContain("?pair=ABCD2345");
    expect(api.enable).toHaveBeenCalledTimes(1);
  });
  it("offers the tunnel's link first, says when the app is not served and when the machine has no address", async () => {
    api.status.mockResolvedValue({ status: st({ enabled: true, cloudflared: true }) }); api.pair.mockResolvedValue({ pairing: pairing({ app: false, links: [{ label: "same network", url: "http://10.0.0.2:1/?pair=ABCD2345" }, { label: "tunnel", url: "https://fox.trycloudflare.com/?pair=ABCD2345" }] }) });
    render(<PhonePanel onClose={() => {}} />); await waitFor(() => screen.getByTestId("phone-show-qr")); fireEvent.click(screen.getByTestId("phone-show-qr")); await waitFor(() => screen.getByTestId("phone-link"));
    expect(screen.getByTestId("phone-link").textContent).toContain("fox.trycloudflare.com"); expect(screen.getByTestId("phone-no-app").textContent).toContain("ANTILOKI_FE_DIR"); expect((screen.getByTestId("phone-link-pick") as HTMLSelectElement).options).toHaveLength(2);
    api.pair.mockResolvedValue({ pairing: pairing({ links: [] }) }); fireEvent.click(screen.getByTestId("phone-new-code")); await waitFor(() => screen.getByTestId("phone-no-link"));
  });
  it("lists the paired devices and takes one out; says the tunnel needs cloudflared when it is not there, and starts one when it is", async () => {
    api.status.mockResolvedValue({ status: st({ enabled: true, devices: [{ id: "d1", name: "iPhone · Safari", created_ms: 1, last_seen_ms: Date.now(), revoked: false }] }) }); api.revoke.mockResolvedValue({ status: st({ enabled: true, devices: [{ id: "d1", name: "iPhone · Safari", created_ms: 1, last_seen_ms: 1, revoked: true }] }) });
    render(<PhonePanel onClose={() => {}} />); await waitFor(() => screen.getByTestId("phone-device-d1")); expect(screen.getByTestId("phone-device-d1").textContent).toContain("iPhone · Safari · seen just now"); expect(screen.getByTestId("phone-tunnel-missing").textContent).toContain("cloudflared");
    fireEvent.click(screen.getByTestId("phone-revoke-d1")); await waitFor(() => expect(screen.getByTestId("phone-device-d1").textContent).toContain("revoked")); expect(api.revoke).toHaveBeenCalledWith("d1"); expect(screen.queryByTestId("phone-revoke-d1")).toBeNull();
    cleanup(); api.status.mockResolvedValue({ status: st({ enabled: true, cloudflared: true }) }); api.tunnel.mockResolvedValue({ status: st({ enabled: true, cloudflared: true, tunnel: { provider: "cloudflared", url: "https://fox.trycloudflare.com" } }) });
    render(<PhonePanel onClose={() => {}} />); await waitFor(() => screen.getByTestId("phone-tunnel-start")); fireEvent.click(screen.getByTestId("phone-tunnel-start")); await waitFor(() => expect(screen.getByTestId("phone-tunnel").textContent).toContain("fox.trycloudflare.com")); expect(api.tunnel).toHaveBeenCalledWith(true);
  });
  it("shows the serve's sentence when something fails, and closes on Escape", async () => {
    api.enable.mockResolvedValue({ status: null, error: "cannot bind" }); const onClose = vi.fn();
    render(<PhonePanel onClose={onClose} />); await waitFor(() => screen.getByTestId("phone-show-qr")); fireEvent.click(screen.getByTestId("phone-show-qr")); await waitFor(() => expect(screen.getByTestId("phone-error").textContent).toBe("cannot bind"));
    fireEvent.keyDown(window, { key: "Escape" }); expect(onClose).toHaveBeenCalled();
  });
});
