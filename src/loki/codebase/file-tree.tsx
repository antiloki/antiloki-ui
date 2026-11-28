// The collapsible folder TREE, on its own. atlas-files-ide owned it, but that module
// also imports all 17 antiIDE panels — so the cockpit, the pulls view and the features
// centre, which want nothing but these three helpers, each dragged the whole antiIDE
// into the entry bundle. A file tree has no business costing 22k lines.
import React from "react";
import { C, mono } from "@/loki/theme";
import { fmtTokens } from "@/loki/util/tokens";
import { extColor } from "./ext";

export type TreeNode = { name: string; path: string; children: Map<string, TreeNode>; isFile: boolean; fileNode?: any };

export function buildTree(files: { path: string; fileNode: any }[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map(), isFile: false };
  for (const f of files) {
    const parts = String(f.path).replace(/\\/g, "/").split("/").filter(Boolean);
    let cur = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      if (!cur.children.has(part)) cur.children.set(part, { name: part, path, children: new Map(), isFile, fileNode: isFile ? f.fileNode : undefined });
      cur = cur.children.get(part)!;
    });
  }
  return root;
}

// folders first, then files; each alphabetical.
export const sortKids = (n: TreeNode) => [...n.children.values()].sort((a, b) => (a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1));

// a small "⊞ N" chip = how many entry points live in this file / under this folder.
const EpChip = ({ n }: { n: number }) => (n > 0 ? <span style={{ fontFamily: mono, fontSize: 8.5, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 8, padding: "0 4px", flexShrink: 0, opacity: 0.85 }} title={`${n} entry point${n === 1 ? "" : "s"}`}>⊞ {n}</span> : null);
// a subtle "~N" chip = the estimated token weight of this file / everything under this folder.
const TokChip = ({ n }: { n: number | null }) => (n != null && n > 0 ? <span style={{ fontFamily: mono, fontSize: 8, color: C.muted, flexShrink: 0, opacity: 0.7 }} title={`≈ ${n.toLocaleString()} tokens (estimate)`}>~{fmtTokens(n)}</span> : null);

export function TreeRow({ node, depth, selected, onPick, onPickFolder, openMap, setOpen, epCount, tokCount, fontPx = 10.5, fileColor, dirColor }: any) {
  const pad = 8 + depth * 12;
  if (node.isFile) {
    const sel = selected === node.path;
    return (
      <div onClick={() => onPick(node)} title={node.path}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "1.5px 8px 1.5px " + pad + "px", cursor: "pointer",
          background: sel ? `color-mix(in oklab, ${C.brand} 22%, ${C.panel})` : "transparent", color: sel ? C.fg : (fileColor?.(node.path) ?? C.muted) }}>
        <span style={{ width: 7, height: 7, borderRadius: 7, background: extColor(node.path), flexShrink: 0 }} />
        <span style={{ fontFamily: mono, fontSize: fontPx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{node.name}</span>
        <TokChip n={tokCount?.(node.path)} />
        <EpChip n={epCount?.(node.path) ?? 0} />
      </div>
    );
  }
  const open = openMap[node.path] ?? depth < 1;
  return (
    <>
      {/* FOLDERS (operator 2026-09-18): the arrow expands/collapses; the NAME opens the folder's review */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "1.5px 8px 1.5px " + pad + "px", cursor: "pointer", color: C.dim, background: selected === node.path ? `color-mix(in oklab, ${C.brand} 12%, transparent)` : "transparent" }}>
        <span data-testid={`tree-arrow-${node.path}`} onClick={(e) => { e.stopPropagation(); setOpen(node.path, !open); }} style={{ fontSize: 9, width: 10, cursor: "pointer" }}>{open ? "▾" : "▸"}</span>
        <span data-testid={`tree-folder-${node.path}`} onClick={() => (onPickFolder ? onPickFolder(node) : setOpen(node.path, !open))} title={`${node.path}/ — the folder review`} style={{ fontFamily: mono, fontSize: fontPx, color: selected === node.path ? C.brand : dirColor?.(node.path) ?? C.dim, flex: 1 }}>{node.name}</span>
        <TokChip n={tokCount?.(node.path)} />
        <EpChip n={epCount?.(node.path) ?? 0} />
      </div>
      {open && sortKids(node).map((c) => <TreeRow key={c.path} node={c} depth={depth + 1} selected={selected} onPick={onPick} onPickFolder={onPickFolder} openMap={openMap} setOpen={setOpen} epCount={epCount} tokCount={tokCount} fontPx={fontPx} fileColor={fileColor} dirColor={dirColor} />)}
    </>
  );
}
