// WHICH WAY THE SPLIT RUNS AROUND A PANE (operator 2026-11-11: panes collapse into a strip with their name): a pane in a ROW is squeezed to a tall, thin strip with its name written up the side; a pane in a COLUMN to a low bar with the name written along it.
import * as React from "react";
export type SplitDir = "row" | "col";
export const CollapseContext = React.createContext<SplitDir>("row");
/** How much room a collapsed pane keeps along the split, in px. */
export const STRIP_PX: Record<SplitDir, number> = { row: 40, col: 36 };
