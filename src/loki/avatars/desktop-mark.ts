// THE DESKTOP APP'S WINDOW FOR THE MARK (operator 2026-11-27: "draggable, I can place anywhere... if the person closes the multiplex we close just the icon"). Every call is the desktop shell's own window API, granted to this
// page by `tauri/capabilities/mark.json`; in a browser there is no shell and each call does nothing.
const tauri = (): any => (typeof window !== "undefined" ? (window as any).__TAURI__ : undefined);
const mine = (): any => { try { return tauri()?.window?.getCurrentWindow?.(); } catch { return undefined; } };
const quietly = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* the shell refused or is not there */ } };

export const inDesktop = (): boolean => !!tauri();
export const dragMark = (): void => { void quietly(async () => mine()?.startDragging()); };
/** Closes the icon only: antiloki and its agents go on, and the mark comes back the next time the app is minimised or closed. */
export const hideMark = (): void => { void quietly(async () => mine()?.hide()); };
export const openMain = (): void => { void quietly(async () => { const main = await tauri()?.window?.Window?.getByLabel("main"); if (!main) return; await main.show(); await main.unminimize(); await main.setFocus(); await mine()?.hide(); }); };
/** Where a window's top-left goes when it changes size and its bottom-right (where the mark is) stays put, kept on the screen. Pure. */
export const keepCorner = (x: number, y: number, w: number, h: number, nw: number, nh: number): { x: number; y: number } => ({ x: Math.max(0, x + w - nw), y: Math.max(0, y + h - nh) });
/** The window takes the size of what is drawn (CSS pixels), so its empty part never swallows a click; the mark does not move. */
export function fitMark(width: number, height: number): void {
  void quietly(async () => {
    const w = mine(); const dpi = tauri()?.dpi; if (!w || !dpi) return;
    const [s, pos, size] = [await w.scaleFactor(), await w.outerPosition(), await w.outerSize()]; const nw = Math.ceil(width * s), nh = Math.ceil(height * s);
    if (nw === size.width && nh === size.height) return;
    const to = keepCorner(pos.x, pos.y, size.width, size.height, nw, nh);
    await w.setSize(new dpi.PhysicalSize(nw, nh)); await w.setPosition(new dpi.PhysicalPosition(to.x, to.y));
  });
}
