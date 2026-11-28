// WS-5: Operator dispatch-queue view. Read-only projection of
// driver-schedule's all_candidates (POST /api/v1/driver/queue) — the same
// ranked candidate set the autonomous driver picks from on each tick.
// Shows the next card to dispatch and, for every blocked card, the
// state-machine reason it is not next. No tick, no dispatch (RUN lives only
// in card context).
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useDriverQueue } from "@/loki/api/hooks";
import type { DriverQueueItem } from "@/loki/api/hooks";
import { C, mono } from "@/loki/theme";

function statusColor(it: DriverQueueItem): string {
  if (it.is_next) return C.ok;
  if (it.terminal) return C.muted;
  if (it.backoff) return C.warn;
  if (it.dispatchable) return C.brand;
  return C.dim;
}

function statusLabel(it: DriverQueueItem): string {
  if (it.is_next) return "NEXT";
  if (it.dispatchable) return "READY";
  if (it.backoff) return "BACKOFF";
  if (it.terminal) return "DONE";
  return "BLOCKED";
}

export function DriverQueuePanel() {
  const q = useDriverQueue();
  const data = q.data;
  const queue = data?.queue ?? [];

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel,
      fontFamily: mono, marginBottom: 14, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
        background: C.panel2,
      }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: C.dim }}>
          dispatch queue
        </span>
        {data && (
          <span style={{ fontSize: 11, color: C.muted }}>
            {data.counts.dispatchable} ready · {data.counts.blocked} blocked · {data.counts.total} total
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 10, color: C.muted }}>
          read-only · driver-schedule candidates · 5s
        </span>
      </div>

      {q.loading && !data && (
        <div style={{ padding: 16, fontSize: 11, color: C.muted }}>loading…</div>
      )}
      {data && queue.length === 0 && (
        <div style={{ padding: 16, fontSize: 11, color: C.muted }}>
          no active cards in the driver queue.
        </div>
      )}

      {queue.map((it) => (
        <div key={it.slug} style={{
          display: "flex", alignItems: "baseline", gap: 10,
          padding: "8px 14px", borderBottom: `1px solid ${C.border}`,
          background: it.is_next ? C.hover : "transparent",
        }}>
          <span style={{ width: 18, fontSize: 11, color: C.muted, flexShrink: 0 }}>
            {it.position}
          </span>
          <span style={{
            width: 64, flexShrink: 0, fontSize: 9, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: 0.5,
            color: statusColor(it),
          }}>
            {statusLabel(it)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link
              to="/"
              style={{ color: C.fg, fontSize: 12, textDecoration: "none" }}
            >
              {it.title || it.slug}
            </Link>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
              {it.is_next && it.next_action
                ? <span style={{ color: C.ok }}>→ {it.next_agent}.{it.next_action}</span>
                : (it.reason || it.status)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
