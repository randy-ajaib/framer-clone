import type { Document, FrameNode, Node, NodeId } from './types';

export function getNode(doc: Document, id: NodeId): Node {
  const node = doc.nodes[id];
  if (!node) throw new Error(`Unknown node ${id}`);
  return node;
}

export function isFrame(node: Node | undefined): node is FrameNode {
  return node?.type === 'frame';
}

export function parentOf(doc: Document, id: NodeId): FrameNode | null {
  const parentId = doc.nodes[id]?.parentId;
  if (!parentId) return null;
  const parent = doc.nodes[parentId];
  return isFrame(parent) ? parent : null;
}

/** Ancestors from the node's parent up to the root. */
export function ancestors(doc: Document, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let cur = doc.nodes[id]?.parentId ?? null;
  while (cur) {
    out.push(cur);
    cur = doc.nodes[cur]?.parentId ?? null;
  }
  return out;
}

export function isDescendantOf(doc: Document, id: NodeId, ancestorId: NodeId): boolean {
  return ancestors(doc, id).includes(ancestorId);
}

/** The node and every node under it, depth first. */
export function subtree(doc: Document, id: NodeId): NodeId[] {
  const node = doc.nodes[id];
  if (!node) return [];
  if (!isFrame(node)) return [id];
  return [id, ...node.children.flatMap((c) => subtree(doc, c))];
}

/** Is the node placed at x/y (rather than by its parent's stack)? */
export function isAbsolute(doc: Document, node: Node): boolean {
  const parent = node.parentId ? doc.nodes[node.parentId] : null;
  if (!parent || !isFrame(parent)) return false;
  return parent.layout.mode === 'none' || node.position === 'absolute';
}

/** Hidden itself or under a hidden frame. */
export function isEffectivelyHidden(doc: Document, id: NodeId): boolean {
  if (doc.nodes[id]?.hidden) return true;
  return ancestors(doc, id).some((a) => doc.nodes[a]?.hidden);
}

export function isEffectivelyLocked(doc: Document, id: NodeId): boolean {
  if (doc.nodes[id]?.locked) return true;
  return ancestors(doc, id).some((a) => doc.nodes[a]?.locked);
}

/**
 * Of the given ids, keep only those whose ancestors are not also in the list,
 * so moving or deleting a frame and its child does not act twice.
 */
export function topLevelOnly(doc: Document, ids: NodeId[]): NodeId[] {
  const set = new Set(ids);
  return ids.filter((id) => !ancestors(doc, id).some((a) => set.has(a)));
}
