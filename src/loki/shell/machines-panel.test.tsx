// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
const api = { list: vi.fn(), add: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), remove: vi.fn() };
vi.mock("@/loki/api/remote", () => ({ listMachines: (...a: any[]) => api.list(...a), addMachine: (...a: any[]) => api.add(...a), connectMachine: (...a: any[]) => api.connect(...a), disconnectMachine: (...a: any[]) => api.disconnect(...a), removeMachine: (...a: any[]) => api.remove(...a) }));
import { MachinesPanel, machineState } from "./machines-panel";

const m = (o: any = {}) => ({ id: "build-box", name: "Build box", target: "dane@build.local", host: "build.local", ssh_port: 22, local_port: 41999, url: "http://127.0.0.1:41999", connected: false, up: false, ...o });
describe("the machines panel", () => {
  beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); api.list.mockResolvedValue({ machines: [] }); }); afterEach(() => cleanup());
  it("says a machine's state in a word", () => { expect(machineState({ connected: true, up: true }).word).toBe("connected"); expect(machineState({ connected: true, up: false }).word).toBe("connecting…"); expect(machineState({ connected: false, up: false }).word).toBe("not connected"); });
  it("adds a machine from user@host, connects it in one click showing the steps, and offers its screen", async () => {
    api.add.mockResolvedValue({ machines: [m()] }); api.connect.mockResolvedValue({ machines: [m({ connected: true, up: true })], steps: ["reached dane@build.local (Linux x86_64)", "put antiloki on that machine", "connected: its screen is at http://127.0.0.1:41999"] });
    render(<MachinesPanel onClose={() => {}} />); await waitFor(() => screen.getByTestId("machines-empty"));
    fireEvent.change(screen.getByTestId("machine-target"), { target: { value: " dane@build.local " } }); fireEvent.change(screen.getByTestId("machine-name"), { target: { value: "Build box" } }); fireEvent.click(screen.getByTestId("machine-add"));
    await waitFor(() => screen.getByTestId("machine-build-box")); expect(api.add).toHaveBeenCalledWith("dane@build.local", "Build box"); expect((screen.getByTestId("machine-target") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByTestId("machine-connect-build-box")); await waitFor(() => screen.getByTestId("machine-open-build-box"));
    expect(screen.getByTestId("machine-state-build-box").textContent).toBe("connected"); expect(screen.getByTestId("machine-steps-build-box").textContent).toContain("put antiloki on that machine"); expect(screen.getByTestId("machine-open-build-box").getAttribute("href")).toBe("http://127.0.0.1:41999");
  });
  it("says why a connection failed with the steps that did go, and disconnects, stops there too and removes", async () => {
    api.list.mockResolvedValue({ machines: [m()] }); api.connect.mockResolvedValue({ machines: [m()], error: "ssh could not sign in without a password. Set up a key (ssh-copy-id dane@build.local) and try again", steps: ["reached nothing"] });
    render(<MachinesPanel onClose={() => {}} />); await waitFor(() => screen.getByTestId("machine-connect-build-box")); fireEvent.click(screen.getByTestId("machine-connect-build-box"));
    await waitFor(() => expect(screen.getByTestId("machines-error").textContent).toContain("ssh-copy-id"));
    cleanup(); api.list.mockResolvedValue({ machines: [m({ connected: true, up: true })] }); api.disconnect.mockResolvedValue({ machines: [m()] }); api.remove.mockResolvedValue({ machines: [] });
    render(<MachinesPanel onClose={() => {}} />); await waitFor(() => screen.getByTestId("machine-stop-build-box")); fireEvent.click(screen.getByTestId("machine-stop-build-box")); await waitFor(() => expect(api.disconnect).toHaveBeenCalledWith("build-box", true));
    fireEvent.click(screen.getByTestId("machine-remove-build-box")); await waitFor(() => screen.getByTestId("machines-empty")); expect(api.remove).toHaveBeenCalledWith("build-box");
  });
});
