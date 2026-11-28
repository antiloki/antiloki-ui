// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import * as React from "react";
import { VoiceBar, BAR_W, BAR_H } from "./VoiceBar";

describe("the sound bar", () => {
  beforeEach(() => vi.useFakeTimers()); afterEach(() => { cleanup(); vi.useRealTimers(); });
  it("has a fixed size at the bottom centre whatever it says, and moves its wave with the levels while listening", () => {
    const src = { levels: [] as number[] }; const { rerender } = render(<VoiceBar phase="listening" who="Claude Code" source={src} onSend={() => {}} onCancel={() => {}} />);
    const bar = screen.getByTestId("voice-bar"); expect(bar.style.width).toBe(`${BAR_W}px`); expect(bar.style.height).toBe(`${BAR_H}px`); expect(bar.style.position).toBe("fixed"); expect(bar.style.left).toBe("50%"); expect(bar.style.transform).toContain("translateX(-50%)");
    expect(screen.getByTestId("voice-line").textContent).toContain("recording for Claude Code"); expect(screen.getByTestId("voice-line").textContent).toContain("until you press Send"); expect(screen.getByTestId("voice-send").textContent).toBe("Send"); const before = Array.from(screen.getByTestId("voice-wave").children).map((c) => (c as HTMLElement).style.height);
    src.levels.push(0.2, 0.9); act(() => { vi.advanceTimersByTime(120); });
    const after = Array.from(screen.getByTestId("voice-wave").children).map((c) => (c as HTMLElement).style.height); expect(after).not.toEqual(before); expect(after[after.length - 1]).toBe("90%"); expect(after[after.length - 2]).toBe("20%");
    rerender(<VoiceBar phase="transcribing" who="Claude Code" source={src} onSend={() => {}} onCancel={() => {}} />); expect(screen.getByTestId("voice-bar").style.width).toBe(`${BAR_W}px`); expect(screen.getByTestId("voice-line").textContent).toContain("transcribing"); expect(screen.queryByTestId("voice-send")).toBeNull();
    rerender(<VoiceBar phase="sent" who="x" source={src} message="sent to x: “hi”" onSend={() => {}} onCancel={() => {}} />); expect(screen.getByTestId("voice-line").textContent).toBe("sent to x: “hi”"); expect(screen.getByTestId("voice-bar").style.height).toBe(`${BAR_H}px`);
  });
  it("sends or cancels on its buttons, and offers only cancel after an error", () => {
    const onSend = vi.fn(); const onCancel = vi.fn(); const src = { levels: [] };
    const { rerender } = render(<VoiceBar phase="listening" who="a" source={src} onSend={onSend} onCancel={onCancel} />); fireEvent.click(screen.getByTestId("voice-send")); fireEvent.click(screen.getByTestId("voice-cancel")); expect(onSend).toHaveBeenCalled(); expect(onCancel).toHaveBeenCalled();
    rerender(<VoiceBar phase="error" who="a" source={src} message="no microphone was found" onSend={onSend} onCancel={onCancel} />); expect(screen.getByTestId("voice-line").textContent).toBe("no microphone was found"); expect(screen.queryByTestId("voice-send")).toBeNull(); expect(screen.getByTestId("voice-cancel")).toBeTruthy();
  });
});
