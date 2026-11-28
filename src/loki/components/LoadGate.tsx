// LoadGate — first-render gating for the main screens. A screen's children
// are NOT rendered until every gate query has SETTLED (a successful fetch,
// or a definitive 404: gone / notWired). Until then an opaque overlay covers
// the surface so half-empty screens ("no cards", "Slug not found") can never
// flash during first load. Once settled, a ref latch keeps the gate open for
// the lifetime of the mount — later transient errors/unsettles degrade via
// the screen's own post-first-load UI, never by re-showing this overlay.
import * as React from "react";
import { C, mono } from "@/loki/theme";
import { reportFeError } from "@/loki/api/error-report";

export interface LoadGateQuery {
  lastSuccessAt: number | null;
  error?: boolean;
  gone?: boolean;
  notWired?: boolean;
  refetch?: () => void;
}

function settled(q: LoadGateQuery): boolean {
  return q.lastSuccessAt != null || q.gone === true || q.notWired === true;
}

const SLOW_MS = 5_000;
const FAIL_MS = 20_000;

export function LoadGate({ queries, label = "screen", children }: {
  queries: LoadGateQuery[];
  label?: string;
  children: React.ReactNode;
}) {
  // Latch: once every query has settled, the gate stays open for this mount.
  const latchRef = React.useRef(false);
  if (queries.every(settled)) latchRef.current = true;
  const open = latchRef.current;

  // Held in a ref so the timer effect doesn't re-run on every render
  // (the queries array is a fresh literal per render).
  const queriesRef = React.useRef(queries);
  queriesRef.current = queries;

  const [epoch, setEpoch] = React.useState(0);
  const [slow, setSlow] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (open) return;
    const t5 = setTimeout(() => setSlow(true), SLOW_MS);
    const t20 = setTimeout(() => {
      setFailed(true);
      reportFeError("load-gate-timeout", `${label} first load exceeded 20s`);
    }, FAIL_MS);
    return () => { clearTimeout(t5); clearTimeout(t20); };
  }, [open, epoch, label]);

  if (open) return <>{children}</>;

  const retry = () => {
    for (const q of queriesRef.current) if (!settled(q)) q.refetch?.();
    setSlow(false);
    setFailed(false);
    setEpoch((e) => e + 1);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 320, background: C.bg }}>
      <div style={{
        position: "absolute", inset: 0, background: C.bg, pointerEvents: "auto",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 12, color: C.dim, fontFamily: mono, fontSize: 12,
      }}>
        <style>{"@keyframes loadgate-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}</style>
        {failed ? (
          <>
            <div style={{ color: C.bad, fontSize: 13 }}>couldn't load {label}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>the BE didn't answer within 20s</div>
            <button onClick={retry} style={{
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5,
              color: C.brand, fontFamily: mono, fontSize: 11, padding: "4px 12px", cursor: "pointer",
            }}>Retry</button>
          </>
        ) : (
          <>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              border: `2px solid ${C.border}`, borderTopColor: C.brand,
              animation: "loadgate-spin 0.8s linear infinite",
            }} />
            <div>loading {label}…</div>
            {slow && <div style={{ color: C.muted }}>taking longer than usual — still trying…</div>}
          </>
        )}
      </div>
    </div>
  );
}
