// A FILE DRAGGED FROM THE FILES PANE (operator 2026-11-26: "drag a file to an agent (linking the path like the + button)"). Its own kind of drag, so a pane being moved is never taken for a file.
export const FILE_DRAG = "application/x-antiloki-path";
export const startFileDrag = (dt: DataTransfer, path: string): void => { dt.setData(FILE_DRAG, path); dt.setData("text/plain", path); dt.effectAllowed = "copy"; };
export const carriesFile = (dt: DataTransfer | null | undefined): boolean => !!dt && Array.from(dt.types ?? []).includes(FILE_DRAG);
export const draggedPath = (dt: DataTransfer | null | undefined): string => (carriesFile(dt) ? dt!.getData(FILE_DRAG) : "");
