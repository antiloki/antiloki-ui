// A reusable checkbox file-tree: flat paths → nested folders, each row a checkbox + name + optional token chip.
// A checked folder includes everything under it (ancestorChecked cascades). Extracted from the notebook scope
// picker so the Studio and the notebook research view share ONE tree. `token(path)` (optional) → the per-file /
// cumulative-per-folder token estimate; pass it to show "~N" chips (see buildTokenMap for the cumulative map).
import React from "react";
import { C, mono } from "@/loki/theme";
import { fmtTokens } from "@/loki/util/tokens";

export function buildTree(paths: string[]) {
  const root: any = { children: {} };
  for (const p of paths) {
    const parts = String(p).split("/").filter(Boolean);
    let node = root;
    parts.forEach((seg, i) => {
      node.children[seg] = node.children[seg] || { name: seg, path: parts.slice(0, i + 1).join("/"), isFile: i === parts.length - 1, children: {} };
      node = node.children[seg];
    });
  }
  return root;
}

// folders first, then files; each alphabetical.
export const topKids = (tree: any): any[] => Object.values(tree.children || {}).sort((a: any, b: any) => (a.isFile ? 1 : 0) - (b.isFile ? 1 : 0) || a.name.localeCompare(b.name));

// flat { path: tokens } (files) → cumulative { path: tokens } where each folder = sum of its descendants.
export function buildTokenMap(fileTokens: Record<string, number> | null | undefined): Record<string, number> | null {
  if (!fileTokens) return null;
  const m: Record<string, number> = {};
  for (const [path, n] of Object.entries(fileTokens)) {
    m[path] = (m[path] ?? 0) + (n as number);
    const parts = String(path).split("/");
    for (let i = 1; i < parts.length; i++) { const pre = parts.slice(0, i).join("/"); m[pre] = (m[pre] ?? 0) + (n as number); }
  }
  return m;
}

// themed checkbox (matches the workspace-signal style) — used for the scope tree + deps/dependents toggles.
export function Check({ on, dim }: any) {
  return <span style={{ width: 13, height: 13, flexShrink: 0, borderRadius: 3, border: `1.5px solid ${on ? C.brand : C.muted}`, background: on ? C.brand : "transparent", display: "grid", placeItems: "center", color: C.bg, fontSize: 9, opacity: dim ? 0.55 : 1 }}>{on ? "✓" : ""}</span>;
}
const Tok = ({ n }: { n: number | null }) => (n != null && n > 0 ? <span style={{ fontFamily: mono, fontSize: 8, color: C.muted, opacity: 0.7, flexShrink: 0 }} title={`≈ ${n.toLocaleString()} tokens (estimate)`}>~{fmtTokens(n)}</span> : null);

export function TreeNode({ node, depth, checked, onToggle, expanded, toggleExp, forceOpen, ancestorChecked, token }: any) {
  const kids: any[] = Object.values(node.children || {}).sort((a: any, b: any) => (a.isFile ? 1 : 0) - (b.isFile ? 1 : 0) || a.name.localeCompare(b.name));
  const hasKids = kids.length > 0;
  const on = ancestorChecked || checked.has(node.path);
  const open = forceOpen || expanded.has(node.path);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: depth * 12 }}>
        <span onClick={() => hasKids && toggleExp(node.path)} style={{ width: 10, cursor: hasKids ? "pointer" : "default", color: C.dim, fontSize: 9, textAlign: "center" }}>{hasKids ? (open ? "▾" : "▸") : ""}</span>
        <span onClick={(e) => { e.stopPropagation(); if (!ancestorChecked) onToggle(node.path); }} style={{ cursor: ancestorChecked ? "default" : "pointer", display: "grid", placeItems: "center" }}><Check on={on} dim={ancestorChecked} /></span>
        <span onClick={() => (hasKids ? toggleExp(node.path) : onToggle(node.path))} style={{ fontFamily: mono, fontSize: 10.5, color: node.isFile ? C.fg : C.brand, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{node.name}{node.isFile ? "" : "/"}</span>
        {token && <Tok n={token(node.path)} />}
      </div>
      {open && hasKids && kids.map((k) => <TreeNode key={k.path} node={k} depth={depth + 1} checked={checked} onToggle={onToggle} expanded={expanded} toggleExp={toggleExp} forceOpen={forceOpen} ancestorChecked={on} token={token} />)}
    </div>
  );
}
