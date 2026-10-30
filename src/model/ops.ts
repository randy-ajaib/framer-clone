// Document commands. Each takes a mutable document (an Immer draft in the
// editor, a plain object in tests) and changes it in place.

import { createNode, defaultLayout, uid } from './factory';
import { isAbsolute, isDescendantOf, isFrame, subtree, topLevelOnly } from './tree';
import type { Document, FrameNode, Node, NodeId } from './types';

function frame(doc: Document, id: NodeId): FrameNode {
  const n = doc.nodes[id];
  if (!isFrame(n)) throw new Error(`${id} is not a frame`);
  return n;
}

export function insertNode(doc: Document, node: Node, parentId: NodeId, index?: number): void {
  const parent = frame(doc, parentId);
  node.parentId = parentId;
  doc.nodes[node.id] = node;
  const at = index === undefined ? parent.children.length : Math.max(0, Math.min(index, parent.children.length));
  parent.children.splice(at, 0, node.id);
}

export function removeNodes(doc: Document, ids: NodeId[]): void {
  for (const id of topLevelOnly(doc, ids)) {
    if (id === doc.rootId || !doc.nodes[id]) continue;
    const parentId = doc.nodes[id].parentId;
    if (parentId) {
      const parent = frame(doc, parentId);
      parent.children = parent.children.filter((c) => c !== id);
    }
    for (const n of subtree(doc, id)) delete doc.nodes[n];
  }
}

/**
 * Moves a node into a frame. `index` counts the target's children without the
 * moved node, which is what a drop indicator shows. `at` gives x/y when the
 * target places children freely.
 */
export function moveNode(
  doc: Document,
  id: NodeId,
  targetId: NodeId,
  index: number,
  at?: { x: number; y: number },
): boolean {
  if (id === doc.rootId || id === targetId || isDescendantOf(doc, targetId, id)) return false;
  const node = doc.nodes[id];
  const oldParent = frame(doc, node.parentId!);
  const target = frame(doc, targetId);
  oldParent.children = oldParent.children.filter((c) => c !== id);
  const at_ = Math.max(0, Math.min(index, target.children.length));
  target.children.splice(at_, 0, id);
  node.parentId = targetId;
  if (target.layout.mode === 'stack') {
    node.position = 'flow';
  } else if (at) {
    node.x = Math.round(at.x);
    node.y = Math.round(at.y);
  }
  return true;
}

/** Moves a node one step earlier or later among its siblings. */
export function shiftInParent(doc: Document, id: NodeId, delta: number): void {
  const node = doc.nodes[id];
  if (!node.parentId) return;
  const parent = frame(doc, node.parentId);
  const i = parent.children.indexOf(id);
  const j = Math.max(0, Math.min(parent.children.length - 1, i + delta));
  if (i === j) return;
  parent.children.splice(i, 1);
  parent.children.splice(j, 0, id);
}

export interface Fragment {
  rootIds: NodeId[];
  nodes: Record<NodeId, Node>;
}

/** Copies nodes and everything under them, keeping their ids (for the clipboard). */
export function copyFragment(doc: Document, ids: NodeId[]): Fragment {
  const rootIds = topLevelOnly(doc, ids).filter((id) => id !== doc.rootId);
  const nodes: Record<NodeId, Node> = {};
  for (const r of rootIds) for (const id of subtree(doc, r)) nodes[id] = structuredClone(doc.nodes[id]);
  return { rootIds, nodes };
}

/** Inserts a fragment under a frame with fresh ids. Returns the new top-level ids. */
export function pasteFragment(
  doc: Document,
  frag: Fragment,
  parentId: NodeId,
  index?: number,
  offset = 0,
): NodeId[] {
  const remap = new Map<NodeId, NodeId>();
  for (const id of Object.keys(frag.nodes)) remap.set(id, uid());
  const inserted: NodeId[] = [];
  frag.rootIds.forEach((rootId, k) => {
    for (const oldId of subtree({ ...doc, nodes: frag.nodes } as Document, rootId)) {
      const copy = structuredClone(frag.nodes[oldId]);
      copy.id = remap.get(oldId)!;
      copy.parentId = oldId === rootId ? parentId : remap.get(copy.parentId!)!;
      if (isFrame(copy)) copy.children = copy.children.map((c) => remap.get(c)!);
      if (oldId === rootId) {
        copy.x += offset;
        copy.y += offset;
        insertNode(doc, copy, parentId, index === undefined ? undefined : index + k);
        inserted.push(copy.id);
      } else {
        doc.nodes[copy.id] = copy;
      }
    }
  });
  return inserted;
}

export function duplicateNodes(doc: Document, ids: NodeId[]): NodeId[] {
  const out: NodeId[] = [];
  for (const id of topLevelOnly(doc, ids)) {
    const node = doc.nodes[id];
    if (!node?.parentId) continue;
    const parent = frame(doc, node.parentId);
    const offset = isAbsolute(doc, node) ? 16 : 0;
    out.push(...pasteFragment(doc, copyFragment(doc, [id]), parent.id, parent.children.indexOf(id) + 1, offset));
  }
  return out;
}

/** Wraps sibling nodes in a new stack frame. Returns its id, or null if they are not siblings. */
export function groupIntoStack(doc: Document, ids: NodeId[]): NodeId | null {
  const top = topLevelOnly(doc, ids).filter((id) => id !== doc.rootId);
  if (top.length === 0) return null;
  const parentId = doc.nodes[top[0]].parentId!;
  if (top.some((id) => doc.nodes[id].parentId !== parentId)) return null;
  const parent = frame(doc, parentId);
  const ordered = parent.children.filter((c) => top.includes(c));
  const first = doc.nodes[ordered[0]];
  const group = createNode('frame') as FrameNode;
  group.name = 'Stack';
  group.style.fill = null;
  group.style.radius = 0;
  group.width = { mode: 'fit' };
  group.layout = { ...defaultLayout(), padding: [0, 0, 0, 0] };
  group.position = first.position;
  group.x = Math.min(...ordered.map((id) => doc.nodes[id].x));
  group.y = Math.min(...ordered.map((id) => doc.nodes[id].y));
  insertNode(doc, group, parentId, parent.children.indexOf(ordered[0]));
  ordered.forEach((id, i) => {
    moveNode(doc, id, group.id, i);
  });
  return group.id;
}
