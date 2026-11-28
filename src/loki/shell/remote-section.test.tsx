// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const st = (o: any = {}) => ({ enabled: false, port: 0, addresses: [], tunnel: null, devices: [], app: true, cloudflared: true, ...o });
const api = { status: vi.fn(), enable: vi.fn(), disable: vi.fn(), pair: vi.fn(), tunnel: vi.fn(), revoke: vi.fn(), list: vi.fn(), add: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), remove: vi.fn() };
vi.mock("@/loki/api/remote", () => ({ remoteStatus: (...a: any[]) => api.status(...a), remoteEnable: (...a: any[]) => api.enable(...a), remoteDisable: (...a: any[]) => api.disable(...a), remotePair: (...a: any[]) => api.pair(...a), remoteTunnel: (...a: any[]) => api.tunnel(...a), remoteRevoke: (...a: any[]) => api.revoke(...a),
  listMachines: (...a: any[]) => api.list(...a), addMachine: (...a: any[]) => api.add(...a), connectMachine: (...a: any[]) => api.connect(...a), disconnectMachine: (...a: any[]) => api.disconnect(...a), removeMachine: (...a: any[]) => api.remove(...a) }));
import { RemoteSection } from "./remote-section";

const pairing = (o: any = {}) => ({ code: "ABCD2345", expires_ms: Date.now() + 300_000, links: [{ label: "tunnel", url: "https://fox.trycloudflare.com/?pair=ABCD2345" }], app: true, ...o });
describe("the Remote section of the sidebar", () => {
  beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); api.status.mockResolvedValue({ status: st() }); api.list.mockResolvedValue({ machines: [] }); }); afterEach(() => cleanup());
  it("has three buttons, shows nothing until one is pressed, opens each part in place and closes it on a second press", async () => {
    render(<RemoteSection />); expect(screen.getByTestId("remote-phone")).toBeTruthy(); expect(screen.getByTestId("remote-machines")).toBeTruthy(); expect(screen.getByTestId("remote-publish")).toBeTruthy(); expect(screen.queryByTestId("remote-body-phone")).toBeNull();
    api.enable.mockResolvedValue({ status: st({ enabled: true, port: 41932, addresses: ["http://192.168.1.5:41932"] }) }); api.pair.mockResolvedValue({ pairing: pairing({ links: [{ label: "same network", url: "http://192.168.1.5:41932/?pair=ABCD2345" }] }) });
    fireEvent.click(screen.getByTestId("remote-phone")); await waitFor(() => screen.getByTestId("phone-show-qr")); expect(screen.getByTestId("phone-inline")).toBeTruthy(); expect(screen.queryByRole("dialog")).toBeNull();   // in place, not a dialog
    fireEvent.click(screen.getByTestId("phone-show-qr")); await waitFor(() => screen.getByTestId("phone-qr")); expect(screen.getByTestId("phone-code").textContent).toBe("ABCD2345");
    fireEvent.click(screen.getByTestId("remote-phone")); expect(screen.queryByTestId("remote-body-phone")).toBeNull();
    fireEvent.click(screen.getByTestId("remote-machines")); await waitFor(() => screen.getByTestId("machines-empty")); expect(screen.getByTestId("machines-inline")).toBeTruthy(); expect(screen.queryByTestId("remote-body-phone")).toBeNull();
  });
  it("adds a machine and connects it from the sidebar", async () => {
    const m = (o: any = {}) => ({ id: "box", name: "Box", target: "u@box", host: "box", ssh_port: 22, local_port: 41999, url: "http://127.0.0.1:41999", connected: false, up: false, ...o });
    api.add.mockResolvedValue({ machines: [m()] }); api.connect.mockResolvedValue({ machines: [m({ connected: true, up: true })], steps: ["connected"] });
    render(<RemoteSection />); fireEvent.click(screen.getByTestId("remote-machines")); await waitFor(() => screen.getByTestId("machine-target"));
    fireEvent.change(screen.getByTestId("machine-target"), { target: { value: "u@box" } }); fireEvent.click(screen.getByTestId("machine-add")); await waitFor(() => screen.getByTestId("machine-connect-box")); fireEvent.click(screen.getByTestId("machine-connect-box")); await waitFor(() => expect(screen.getByTestId("machine-state-box").textContent).toBe("connected"));
  });
  it("publishes: starts a tunnel, shows its address, makes a pairing link to copy, and stops; says what to install when there is no cloudflared", async () => {
    api.tunnel.mockResolvedValueOnce({ status: st({ tunnel: { provider: "cloudflared", url: "https://fox.trycloudflare.com" } }) }).mockResolvedValueOnce({ status: st() }); api.pair.mockResolvedValue({ pairing: pairing() });
    const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { value: { writeText: copy }, configurable: true });
    render(<RemoteSection />); fireEvent.click(screen.getByTestId("remote-publish")); await waitFor(() => screen.getByTestId("publish-start")); fireEvent.click(screen.getByTestId("publish-start")); await waitFor(() => expect(screen.getByTestId("publish-url").textContent).toBe("https://fox.trycloudflare.com"));
    fireEvent.click(screen.getByTestId("publish-link")); await waitFor(() => screen.getByTestId("publish-pair-link")); expect(screen.getByTestId("publish-pair-link").textContent).toContain("?pair=ABCD2345"); fireEvent.click(screen.getByTestId("publish-copy")); await waitFor(() => expect(copy).toHaveBeenCalledWith("https://fox.trycloudflare.com/?pair=ABCD2345"));
    fireEvent.click(screen.getByTestId("publish-stop")); await waitFor(() => screen.getByTestId("publish-start")); expect(screen.queryByTestId("publish-pair-link")).toBeNull();
    cleanup(); api.status.mockResolvedValue({ status: st({ cloudflared: false }) }); render(<RemoteSection />); fireEvent.click(screen.getByTestId("remote-publish")); await waitFor(() => expect(screen.getByTestId("publish-missing").textContent).toContain("cloudflared"));
  });
  it("tells the person when a firewall is in the way of the phone, with the command to open the port, and says nothing when the port is open", async () => {
    const fw = { kind: "ufw", open: false, command: "sudo ufw allow from 192.168.1.0/24 to any port 41932 proto tcp" };
    api.status.mockResolvedValue({ status: st({ enabled: true, port: 41932, addresses: ["http://192.168.1.5:41932"], firewall: fw }) }); api.enable.mockResolvedValue({ status: st({ enabled: true, port: 41932, addresses: ["http://192.168.1.5:41932"], firewall: fw }) }); api.pair.mockResolvedValue({ pairing: pairing({ links: [{ label: "same network", url: "http://192.168.1.5:41932/?pair=ABCD2345" }] }) });
    const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { value: { writeText: copy }, configurable: true });
    render(<RemoteSection />); fireEvent.click(screen.getByTestId("remote-phone")); await waitFor(() => screen.getByTestId("phone-show-qr")); fireEvent.click(screen.getByTestId("phone-show-qr")); await waitFor(() => screen.getByTestId("phone-firewall"));
    expect(screen.getByTestId("phone-firewall-command").textContent).toBe(fw.command); fireEvent.click(screen.getByTestId("phone-firewall-copy")); await waitFor(() => expect(copy).toHaveBeenCalledWith(fw.command));
    cleanup(); api.status.mockResolvedValue({ status: st({ enabled: true, port: 41932, addresses: ["http://192.168.1.5:41932"], firewall: { ...fw, open: true } }) }); api.enable.mockResolvedValue({ status: st({ enabled: true, port: 41932, addresses: ["http://192.168.1.5:41932"], firewall: { ...fw, open: true } }) });
    render(<RemoteSection />); fireEvent.click(screen.getByTestId("remote-phone")); await waitFor(() => screen.getByTestId("phone-show-qr")); fireEvent.click(screen.getByTestId("phone-show-qr")); await waitFor(() => screen.getByTestId("phone-qr")); expect(screen.queryByTestId("phone-firewall")).toBeNull();
  });
});
