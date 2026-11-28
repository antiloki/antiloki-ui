// SAVE A FREE PANE AS ONE FILE (never its approval or its memory). It was a button inside the pane; it is a small icon on the pane's top bar now.
import { panesOp } from "./api";
import { fileNameFor } from "./panebundle";

export async function exportFreePane(id: string): Promise<{ ok: boolean; error?: string }> {
  const r = await panesOp({ op: "export", id }); if (r?.ok !== true) return { ok: false, error: String(r?.error ?? "the pane could not be exported") };
  const url = URL.createObjectURL(new Blob([JSON.stringify(r.export, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = fileNameFor(id); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true };
}
