import React from "react";
import { C } from "@/loki/theme";


const mono = '"JetBrains Mono", "AntilokiSymbols", ui-monospace, monospace';

export function EndpointStub({ endpoint, title, hint }: { endpoint?: string; title?: string; hint?: string }) {
  return (
    <div style={{
      background: C.panel, border: `1px dashed ${C.border}`,
      borderRadius: 10, padding: 24, margin: 16,
      color: C.fg, fontFamily: '-apple-system, system-ui, sans-serif',
    }}>
      <div style={{ fontFamily: mono, fontSize: 10, color: C.brand, textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 6 }}>
        v3 · endpoint not yet wired
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {title || "Waiting on backend"}
      </div>
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
        {hint || "This screen will light up automatically once the BE exposes the endpoint."}
      </div>
      {endpoint && (
        <div style={{ marginTop: 10, fontFamily: mono, fontSize: 11, color: C.muted }}>
          expected: <span style={{ color: C.fg }}>{endpoint}</span>
        </div>
      )}
    </div>
  );
}
