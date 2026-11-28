// THE APPEARANCE POPOVER (RFC 0007 §17.8): the controls the person has for how the screen looks, and what each one asks for.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppearancePopover } from "./AppearancePopover";
import { DEFAULT_APPEARANCE } from "./appearance";
import type { OmarchyTheme, ThemeList } from "./api";

const tokyo: OmarchyTheme = { id: "tokyo-night", name: "Tokyo Night", source: "system", mode: "dark", colors: { background: "#1a1b26", lighter_background: "#24283b", accent: "#7aa2f7", green: "#9ece6a", red: "#f7768e" }, backgrounds: ["0-road.jpg", "1-quattro.jpg"], preview: true };
const cobalt: OmarchyTheme = { id: "cobalt2", name: "Cobalt2", source: "downloaded", mode: "dark", colors: { background: "#193549", accent: "#ffc600" }, backgrounds: [], preview: false };
const list: ThemeList = { current: "Tokyo Night", themes: [tokyo, cobalt], dir: "/home/u/.local/share/antiloki/themes" };
const setup = (over: Partial<React.ComponentProps<typeof AppearancePopover>> = {}) => {
  const set = vi.fn(); const onInstall = vi.fn().mockResolvedValue({ ok: true, id: "cobalt2" }); const onClose = vi.fn();
  render(<AppearancePopover ap={DEFAULT_APPEARANCE} set={set} themes={list} active={null} onInstall={onInstall} onClose={onClose} {...over} />);
  return { set, onInstall, onClose };
};

describe("the appearance popover", () => {
  it("the opacity slider shows its value and acts as it moves", () => {
    const { set } = setup({ ap: { ...DEFAULT_APPEARANCE, termOpacity: 0.9 } });
    expect(screen.getByTestId("appearance-opacity-value").textContent).toBe("90%");
    fireEvent.change(screen.getByTestId("appearance-opacity"), { target: { value: "55" } });
    expect(set).toHaveBeenCalledWith({ termOpacity: 0.55 });
  });
  it("the panes have their own slider, both go all the way to clear, and the presets set both at once", () => {
    const { set } = setup({ ap: { ...DEFAULT_APPEARANCE, termOpacity: 0.9, paneOpacity: 0.7 } });
    expect(screen.getByTestId("appearance-pane-opacity-value").textContent).toBe("70%");
    const term = screen.getByTestId("appearance-opacity") as HTMLInputElement; expect(term.min).toBe("0");
    fireEvent.change(screen.getByTestId("appearance-pane-opacity"), { target: { value: "0" } });
    expect(set).toHaveBeenLastCalledWith({ paneOpacity: 0 });
    fireEvent.click(screen.getByTestId("opacity-clear")); expect(set).toHaveBeenLastCalledWith({ termOpacity: 0, paneOpacity: 0 });
    fireEvent.click(screen.getByTestId("opacity-solid")); expect(set).toHaveBeenLastCalledWith({ termOpacity: 1, paneOpacity: 1 });
  });
  it("lists antiloki's own palette and every theme with where it came from; picking one wears it and forgets a following", () => {
    const { set } = setup();
    expect(screen.getByTestId("theme-tokyo-night").textContent).toMatch(/Tokyo Night/); expect(screen.getByTestId("theme-cobalt2").textContent).toMatch(/downloaded/);
    fireEvent.click(screen.getByTestId("theme-tokyo-night")); expect(set).toHaveBeenCalledWith({ themeId: "tokyo-night", wallpaper: null, follow: false });
    fireEvent.click(screen.getByTestId("theme-default")); expect(set).toHaveBeenCalledWith({ themeId: null, wallpaper: null, follow: false });
  });
  it("follow Omarchy is a checkbox that says which theme Omarchy wears", () => {
    const { set } = setup(); expect(screen.getByLabelText(/follow my desktop theme/).closest("label")!.textContent).toMatch(/Tokyo Night/);
    fireEvent.click(screen.getByTestId("appearance-follow")); expect(set).toHaveBeenCalledWith({ follow: true });
  });
  it("the wallpapers of the worn theme are chips, with none and a darken slider; a theme with no wallpaper shows no background section", () => {
    const { set } = setup({ active: tokyo, ap: { ...DEFAULT_APPEARANCE, themeId: "tokyo-night", dim: 0.4 } });
    fireEvent.click(screen.getByTestId("wall-1")); expect(set).toHaveBeenCalledWith({ wallpaper: "1-quattro.jpg" });
    fireEvent.click(screen.getByTestId("wall-none")); expect(set).toHaveBeenCalledWith({ wallpaper: "" });
    fireEvent.change(screen.getByTestId("appearance-dim"), { target: { value: "60" } }); expect(set).toHaveBeenCalledWith({ dim: 0.6 });
  });
  it("without a wallpaper in the worn theme there is no background section", () => {
    setup({ active: cobalt, ap: { ...DEFAULT_APPEARANCE, themeId: "cobalt2" } }); expect(screen.queryByTestId("wall-none")).toBeNull();
  });
  it("downloading a theme wears it when it works, and says why when it does not", async () => {
    const { set, onInstall } = setup();
    fireEvent.change(screen.getByTestId("theme-url"), { target: { value: "https://github.com/hoblin/omarchy-cobalt2-theme" } });
    fireEvent.click(screen.getByTestId("theme-download"));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ themeId: "cobalt2", wallpaper: null, follow: false }));
    expect(onInstall).toHaveBeenCalledWith("https://github.com/hoblin/omarchy-cobalt2-theme");
  });
  it("a refused download shows the serve's reason and wears nothing", async () => {
    const { set } = setup({ onInstall: vi.fn().mockResolvedValue({ ok: false, error: "that repository is not an Omarchy theme (it has no colors.toml)" }) });
    fireEvent.change(screen.getByTestId("theme-url"), { target: { value: "https://github.com/x/not-a-theme" } }); fireEvent.click(screen.getByTestId("theme-download"));
    expect((await screen.findByTestId("theme-error")).textContent).toMatch(/no colors\.toml/); expect(set).not.toHaveBeenCalled();
  });
  it("says where downloads are kept, and that the desktop is not changed; Escape closes it", () => {
    const { onClose } = setup(); expect(screen.getByTestId("appearance").textContent).toMatch(/antiloki's own folder.*never changed/s);
    fireEvent.keyDown(window, { key: "Escape" }); expect(onClose).toHaveBeenCalled();
  });
  it("with no themes it says so and offers the download", () => {
    setup({ themes: { current: null, themes: [], dir: "" } }); expect(screen.getByTestId("appearance").textContent).toMatch(/no antiloki themes on this machine yet/);
  });
});
