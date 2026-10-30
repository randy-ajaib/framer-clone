import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { createNode, uid } from './model/factory';
import * as ops from './model/ops';
import { isFrame, parentOf } from './model/tree';
import type { Document, Node, NodeId, NodeType } from './model/types';

export const BREAKPOINTS = [
  { label: 'Desktop', width: 1440, height: 900 },
  { label: 'Tablet', width: 768, height: 1024 },
  { label: 'Phone', width: 390, height: 844 },
] as const;

const HISTORY_LIMIT = 200;
const MERGE_WINDOW_MS = 800;

interface View {
  zoom: number;
  panX: number;
  panY: number;
}

interface EditorState {
  doc: Document;
  selection: NodeId[];
  hoverId: NodeId | null;
  editingTextId: NodeId | null;
  view: View;
  breakpoint: number; // index into BREAKPOINTS
  previewOpen: boolean;
  past: Document[];
  future: Document[];
  /** Document at the start of a drag or resize; the whole gesture becomes one undo step. */
  txBase: Document | null;
  lastMerge: { key: string; at: number } | null;
  clipboard: ops.Fragment | null;

  load(doc: Document): void;
  /** Change the document. Edits that share a mergeKey within a short window become one undo step. */
  apply(recipe: (doc: Draft<Document>) => void, mergeKey?: string): void;
  begin(): void;
  commit(): void;
  undo(): void;
  redo(): void;

  select(ids: NodeId[]): void;
  setHover(id: NodeId | null): void;
  setEditingText(id: NodeId | null): void;
  setView(view: Partial<View>): void;
  setBreakpoint(i: number): void;
  setPreviewOpen(open: boolean): void;

  insert(type: NodeType, extra?: Partial<Node>): NodeId;
  updateNode(id: NodeId, recipe: (node: Draft<Node>) => void, mergeKey?: string): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  groupSelection(): void;
  copySelection(): void;
  paste(): void;
  addAsset(file: { name: string; mime: string; dataUrl: string }): string;
}

export const useEditor = create<EditorState>()((set, get) => ({
  doc: { version: 1, title: '', rootId: '', nodes: {}, assets: {} },
  selection: [],
  hoverId: null,
  editingTextId: null,
  view: { zoom: 0.6, panX: 40, panY: 40 },
  breakpoint: 0,
  previewOpen: false,
  past: [],
  future: [],
  txBase: null,
  lastMerge: null,
  clipboard: null,

  load(doc) {
    set({ doc, selection: [], past: [], future: [], txBase: null, lastMerge: null, editingTextId: null });
  },

  apply(recipe, mergeKey) {
    const { doc, txBase, lastMerge, past } = get();
    const next = produce(doc, recipe);
    if (next === doc) return;
    if (txBase) {
      set({ doc: next });
      return;
    }
    const now = Date.now();
    const merge = mergeKey && lastMerge && lastMerge.key === mergeKey && now - lastMerge.at < MERGE_WINDOW_MS;
    set({
      doc: next,
      past: merge ? past : [...past.slice(-HISTORY_LIMIT + 1), doc],
      future: [],
      lastMerge: mergeKey ? { key: mergeKey, at: now } : null,
    });
  },

  begin() {
    if (!get().txBase) set({ txBase: get().doc });
  },

  commit() {
    const { txBase, doc, past } = get();
    if (!txBase) return;
    if (txBase === doc) set({ txBase: null });
    else set({ txBase: null, past: [...past.slice(-HISTORY_LIMIT + 1), txBase], future: [], lastMerge: null });
  },

  undo() {
    const { past, doc, future } = get();
    const prev = past.at(-1);
    if (!prev) return;
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], lastMerge: null });
    pruneSelection();
  },

  redo() {
    const { past, doc, future } = get();
    const next = future[0];
    if (!next) return;
    set({ doc: next, past: [...past, doc], future: future.slice(1), lastMerge: null });
    pruneSelection();
  },

  select(ids) {
    set({ selection: ids, editingTextId: null });
  },
  setHover(id) {
    if (get().hoverId !== id) set({ hoverId: id });
  },
  setEditingText(id) {
    set({ editingTextId: id });
  },
  setView(view) {
    set({ view: { ...get().view, ...view } });
  },
  setBreakpoint(i) {
    set({ breakpoint: i });
  },
  setPreviewOpen(open) {
    set({ previewOpen: open });
  },

  insert(type, extra) {
    const { doc, selection } = get();
    const node = { ...createNode(type), ...extra } as Node;
    // Into the selected frame, else after the selected node, else at the end of the page.
    let parentId = doc.rootId;
    let index: number | undefined;
    const sel = selection.length === 1 ? doc.nodes[selection[0]] : undefined;
    if (sel && isFrame(sel)) parentId = sel.id;
    else if (sel?.parentId) {
      parentId = sel.parentId;
      index = (doc.nodes[parentId] as { children: NodeId[] }).children.indexOf(sel.id) + 1;
    }
    const parent = doc.nodes[parentId];
    if (isFrame(parent) && parent.layout.mode === 'none') {
      node.x = 40 + (parent.children.length % 6) * 24;
      node.y = 40 + (parent.children.length % 6) * 24;
    }
    get().apply((d) => ops.insertNode(d as Document, node, parentId, index));
    set({ selection: [node.id] });
    return node.id;
  },

  updateNode(id, recipe, mergeKey) {
    get().apply((d) => {
      const n = d.nodes[id];
      if (n) recipe(n);
    }, mergeKey);
  },

  deleteSelection() {
    const { selection, doc } = get();
    if (selection.length === 0) return;
    const next = parentOf(doc, selection[0])?.id;
    get().apply((d) => ops.removeNodes(d as Document, selection));
    set({ selection: next && next !== doc.rootId ? [next] : [] });
  },

  duplicateSelection() {
    let created: NodeId[] = [];
    get().apply((d) => {
      created = ops.duplicateNodes(d as Document, get().selection);
    });
    if (created.length) set({ selection: created });
  },

  groupSelection() {
    let group: NodeId | null = null;
    get().apply((d) => {
      group = ops.groupIntoStack(d as Document, get().selection);
    });
    if (group) set({ selection: [group] });
  },

  copySelection() {
    const { doc, selection } = get();
    if (selection.length) set({ clipboard: ops.copyFragment(doc, selection) });
  },

  paste() {
    const { doc, selection, clipboard } = get();
    if (!clipboard || clipboard.rootIds.length === 0) return;
    const sel = selection.length === 1 ? doc.nodes[selection[0]] : undefined;
    let parentId = doc.rootId;
    let index: number | undefined;
    if (sel && isFrame(sel)) parentId = sel.id;
    else if (sel?.parentId) {
      parentId = sel.parentId;
      index = (doc.nodes[parentId] as { children: NodeId[] }).children.indexOf(sel.id) + 1;
    }
    let created: NodeId[] = [];
    get().apply((d) => {
      created = ops.pasteFragment(d as Document, clipboard, parentId, index, 16);
    });
    set({ selection: created });
  },

  addAsset(file) {
    const id = uid();
    get().apply((d) => {
      d.assets[id] = { id, ...file };
    });
    return id;
  },
}));

function pruneSelection() {
  const { selection, doc } = useEditor.getState();
  const kept = selection.filter((id) => doc.nodes[id]);
  if (kept.length !== selection.length) useEditor.setState({ selection: kept });
}
