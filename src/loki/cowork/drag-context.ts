import * as React from "react";
import type { Zone } from "./drag";

/** What a pane needs to take part in a drag: who is being dragged, and what to do on a drop. The screen provides it; a pane outside one gets a context that does nothing. */
export type PaneDragApi = {
  dragging: string | null; start: (id: string) => void; end: () => void; drop: (targetId: string, zone: Zone) => void;
  /** a team's block is being dragged (by its bar): the team's id; and whether a pane is one of its three */
  block?: string | null; startBlock?: (team: string) => void; inBlock?: (paneId: string) => boolean;
  /** what a drop on the middle / an edge of this pane means to the pane being dragged, in words (a pair: "start a pair session"; an agent already in a team or a pair: "already in a team or a pair") */
  label?: (targetId: string, zone: Zone) => string | null;
};
export const PaneDragContext = React.createContext<PaneDragApi>({ dragging: null, start: () => {}, end: () => {}, drop: () => {} });
