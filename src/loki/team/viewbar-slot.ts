// WHERE THE VIEW BAR IS DRAWN (Graph, Editor, Sequence, zoom, run controls): the run picker's row, to the right of its dropdown; the team pane offers that row as a slot and the run draws into it.
import * as React from "react";
export const ViewBarSlot = React.createContext<HTMLElement | null>(null);
