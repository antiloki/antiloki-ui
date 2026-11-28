// THE PANE HEADER'S OWN SLOT (the operator 2026-11-21: the Leader's float and side-by-side switches belong on the real top bar of the team, the pane's header): the frame offers its header as a place a pane body can draw controls into, through a portal.
import * as React from "react";
export const HeaderSlot = React.createContext<HTMLElement | null>(null);
