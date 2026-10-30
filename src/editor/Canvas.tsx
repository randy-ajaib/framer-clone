import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import * as ops from '../model/ops';
import {
  ancestors,
  isAbsolute,
  isDescendantOf,
  isEffectivelyHidden,
  isEffectivelyLocked,
  isFrame,
} from '../model/tree';
import type { Document, NodeId } from '../model/types';
import { BREAKPOINTS, useEditor } from '../store';
import { NodeView } from './NodeView';
import { Overlay, type Handle, type OverlayExtras, type ScreenRect } from './Overlay';

/** Shared with the keyboard handler: holding space turns drags into panning. */
export const keys = { space: false };

const DRAG_THRESHOLD = 3;
const SNAP_PX = 6;

type Gesture =
  | { kind: 'pan'; x: number; y: number; panX: number; panY: number }
  | { kind: 'marquee'; x0: number; y0: number; base: NodeId[] }
  | { kind: 'pending'; id: NodeId; x: number; y: number }
  | {
      kind: 'move-abs';
      ids: NodeId[];
      starts: Record<NodeId, { x: number; y: number }>;
      x: number;
      y: number;
      snapX: number[];
      snapY: number[];
      size: { w: number; h: number };
      parentRect: DOMRect;
    }
  | { kind: 'move-flow'; id: NodeId; el: HTMLElement; x: number; y: number; grab: { x: number; y: number } }
  | {
      kind: 'resize';
      id: NodeId;
      handle: Handle;
      x: number;
      y: number;
      w: number;
      h: number;
      nx: number;
      ny: number;
      absolute: boolean;
    };

interface Drop {
  targetId: NodeId;
  index: number;
  at?: { x: number; y: number };
}

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const drop = useRef<Drop | null>(null);
  const [extras, setExtras] = useState<OverlayExtras>({});
  const [panning, setPanning] = useState(false);

  const rootId = useEditor((s) => s.doc.rootId);
  const title = useEditor((s) => s.doc.title);
  const view = useEditor((s) => s.view);
  const bp = useEditor((s) => BREAKPOINTS[s.breakpoint]);

  const vpRect = () => viewportRef.current!.getBoundingClientRect();
  const elFor = (id: NodeId) => viewportRef.current?.querySelector<HTMLElement>(`[data-node-id="${id}"]`) ?? null;
  const toScreen = (r: DOMRect): ScreenRect => {
    const v = vpRect();
    return { x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height };
  };

  // Wheel: pinch or ctrl/cmd + wheel zooms around the cursor; plain wheel pans.
  useEffect(() => {
    const el = viewportRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view, setView } = useEditor.getState();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        const zoom = clampZoom(view.zoom * Math.exp(-e.deltaY * 0.01));
        const k = zoom / view.zoom;
        setView({ zoom, panX: cx - (cx - view.panX) * k, panY: cy - (cy - view.panY) * k });
      } else {
        setView({ panX: view.panX - e.deltaX, panY: view.panY - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomToFit = useCallback(() => {
    const page = viewportRef.current?.querySelector<HTMLElement>('.page');
    if (!page) return;
    const v = vpRect();
    const { setView } = useEditor.getState();
    const w = page.offsetWidth;
    const h = page.offsetHeight;
    const zoom = clampZoom(Math.min((v.width - 80) / w, (v.height - 100) / h, 1));
    setView({ zoom, panX: (v.width - w * zoom) / 2, panY: 56 });
  }, []);

  // Fit the page whenever the breakpoint changes, and once on mount.
  useEffect(() => {
    const t = setTimeout(zoomToFit, 30);
    return () => clearTimeout(t);
  }, [bp.width, rootId, zoomToFit]);
  useEffect(() => {
    const onFit = () => zoomToFit();
    window.addEventListener('editor:zoom-to-fit', onFit);
    return () => window.removeEventListener('editor:zoom-to-fit', onFit);
  }, [zoomToFit]);

  /** Which node a click on `target` should select, Figma style. */
  const resolveHit = (target: Element, deep: boolean): NodeId | null => {
    const { doc, selection } = useEditor.getState();
    const hitEl = target.closest('[data-node-id]');
    let id = hitEl?.getAttribute('data-node-id') ?? null;
    while (id && isEffectivelyLocked(doc, id)) id = doc.nodes[id].parentId;
    if (!id || id === doc.rootId) return null;
    const chain = [id, ...ancestors(doc, id)].reverse().slice(1); // page child ... hit
    if (deep) return chain.at(-1)!;
    const sel = selection[0];
    if (sel && chain.includes(sel)) return sel;
    // Stay at the depth the user is working at: siblings of the selection, then of its ancestors.
    let ctx = sel ? doc.nodes[sel]?.parentId ?? null : null;
    while (ctx) {
      const match = chain.find((c) => doc.nodes[c].parentId === ctx);
      if (match) return match;
      ctx = doc.nodes[ctx]?.parentId ?? null;
    }
    return chain[0];
  };

  const onPointerDown = (e: RPointerEvent) => {
    const state = useEditor.getState();
    const target = e.target as HTMLElement;
    if (target.closest('[data-editing]')) return;
    if (state.editingTextId) (document.activeElement as HTMLElement | null)?.blur();
    if (target.closest('[data-handle]')) return; // handled by onResizeStart
    viewportRef.current!.setPointerCapture(e.pointerId);
    const v = vpRect();

    if (keys.space || e.button === 1) {
      gesture.current = { kind: 'pan', x: e.clientX, y: e.clientY, panX: state.view.panX, panY: state.view.panY };
      setPanning(true);
      return;
    }
    const id = resolveHit(target, e.metaKey || e.ctrlKey);
    if (!id) {
      if (!e.shiftKey) state.select([]);
      gesture.current = { kind: 'marquee', x0: e.clientX - v.left, y0: e.clientY - v.top, base: e.shiftKey ? state.selection : [] };
      return;
    }
    if (e.shiftKey) {
      state.select(state.selection.includes(id) ? state.selection.filter((s) => s !== id) : [...state.selection, id]);
      return;
    }
    if (!state.selection.includes(id)) state.select([id]);
    gesture.current = { kind: 'pending', id, x: e.clientX, y: e.clientY };
  };

  const startMove = (g: Extract<Gesture, { kind: 'pending' }>, e: RPointerEvent) => {
    const { doc, selection, begin, view } = useEditor.getState();
    const node = doc.nodes[g.id];
    const el = elFor(g.id);
    if (!el) return;
    const moving = selection.includes(g.id) ? selection : [g.id];
    if (isAbsolute(doc, node)) {
      const ids = moving.filter((id) => isAbsolute(doc, doc.nodes[id]));
      const starts: Record<NodeId, { x: number; y: number }> = {};
      for (const id of ids) starts[id] = { x: doc.nodes[id].x, y: doc.nodes[id].y };
      // Snap lines: edges and centres of the parent and of siblings that are not moving, in parent space.
      const parentEl = elFor(node.parentId!)!;
      const pr = parentEl.getBoundingClientRect();
      const snapX = [0, pr.width / 2 / view.zoom, pr.width / view.zoom];
      const snapY = [0, pr.height / 2 / view.zoom, pr.height / view.zoom];
      for (const sib of (doc.nodes[node.parentId!] as { children: NodeId[] }).children) {
        if (ids.includes(sib) || doc.nodes[sib].hidden) continue;
        const r = elFor(sib)?.getBoundingClientRect();
        if (!r) continue;
        const l = (r.left - pr.left) / view.zoom;
        const t = (r.top - pr.top) / view.zoom;
        snapX.push(l, l + r.width / view.zoom / 2, l + r.width / view.zoom);
        snapY.push(t, t + r.height / view.zoom / 2, t + r.height / view.zoom);
      }
      const r = el.getBoundingClientRect();
      begin();
      gesture.current = {
        kind: 'move-abs',
        ids,
        starts,
        x: g.x,
        y: g.y,
        snapX,
        snapY,
        size: { w: r.width / view.zoom, h: r.height / view.zoom },
        parentRect: pr,
      };
    } else {
      const r = el.getBoundingClientRect();
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.75';
      el.style.position = el.style.position || 'relative';
      el.style.zIndex = '10';
      gesture.current = {
        kind: 'move-flow',
        id: g.id,
        el,
        x: g.x,
        y: g.y,
        grab: { x: (g.x - r.left) / view.zoom, y: (g.y - r.top) / view.zoom },
      };
    }
    onPointerMove(e);
  };

  /** Where would the dragged flow node land if dropped at the pointer? */
  const findDrop = (id: NodeId, clientX: number, clientY: number, grab: { x: number; y: number }): Drop | null => {
    const { doc, view } = useEditor.getState();
    const originalParent = doc.nodes[id].parentId!;
    const stack = document.elementsFromPoint(clientX, clientY);
    let candidate: NodeId | null = null;
    for (const el of stack) {
      const cid = el.getAttribute('data-node-id');
      if (!cid) continue;
      if (cid === id || isDescendantOf(doc, cid, id)) continue;
      if (isFrame(doc.nodes[cid]) && !isEffectivelyLocked(doc, cid)) {
        candidate = cid;
        break;
      }
    }
    if (!candidate) candidate = doc.rootId;
    // Near the edge of a frame that is not the current parent, prefer the frame around it:
    // that reorders siblings instead of dropping into one of them.
    let target: NodeId = candidate;
    while (target !== doc.rootId && target !== originalParent && !isDescendantOf(doc, originalParent, target)) {
      const r = elFor(target)!.getBoundingClientRect();
      const inset = Math.min(24, r.width / 4, r.height / 4);
      const inside =
        clientX > r.left + inset && clientX < r.right - inset && clientY > r.top + inset && clientY < r.bottom - inset;
      if (inside) break;
      target = doc.nodes[target].parentId!;
    }
    const frame = doc.nodes[target];
    if (!isFrame(frame)) return null;
    const tr = elFor(target)!.getBoundingClientRect();
    if (frame.layout.mode === 'none') {
      return {
        targetId: target,
        index: frame.children.filter((c) => c !== id).length,
        at: { x: (clientX - tr.left) / view.zoom - grab.x, y: (clientY - tr.top) / view.zoom - grab.y },
      };
    }
    const kids = frame.children.filter((c) => c !== id && !doc.nodes[c].hidden);
    const rects = kids.map((c) => elFor(c)!.getBoundingClientRect());
    let index = kids.length;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const before =
        frame.layout.direction === 'row'
          ? clientY < r.top || (clientY <= r.bottom && clientX < r.left + r.width / 2)
          : clientY < r.top + r.height / 2;
      if (before) {
        index = i;
        break;
      }
    }
    // Map the index among visible children back to an index among all children.
    const all = frame.children.filter((c) => c !== id);
    const realIndex = index < kids.length ? all.indexOf(kids[index]) : all.length;
    return { targetId: target, index: realIndex };
  };

  const dropIndicator = (d: Drop, movingId: NodeId): OverlayExtras['drop'] => {
    const { doc } = useEditor.getState();
    const frame = doc.nodes[d.targetId];
    const tr = toScreen(elFor(d.targetId)!.getBoundingClientRect());
    if (!isFrame(frame)) return undefined;
    if (frame.layout.mode === 'none') return { frame: tr };
    const kids = frame.children.filter((c) => c !== movingId && !doc.nodes[c].hidden);
    const z = useEditor.getState().view.zoom;
    const gap = (frame.layout.gap * z) / 2;
    const [pt, , , pl] = frame.layout.padding.map((p) => p * z);
    const after = d.index >= frame.children.filter((c) => c !== movingId).length;
    const refId = after ? kids.at(-1) : frame.children.filter((c) => c !== movingId)[d.index];
    if (!refId) {
      return frame.layout.direction === 'row'
        ? { frame: tr, line: { x: tr.x + pl, y: tr.y + pt, w: 2, h: Math.max(24, tr.h - pt * 2) } }
        : { frame: tr, line: { x: tr.x + pl, y: tr.y + pt, w: Math.max(24, tr.w - pl * 2), h: 2 } };
    }
    const r = toScreen(elFor(refId)!.getBoundingClientRect());
    if (frame.layout.direction === 'row') {
      const x = after ? r.x + r.w + gap : r.x - gap;
      return { frame: tr, line: { x: x - 1, y: r.y, w: 2, h: r.h } };
    }
    const y = after ? r.y + r.h + gap : r.y - gap;
    return { frame: tr, line: { x: r.x, y: y - 1, w: r.w, h: 2 } };
  };

  const onPointerMove = (e: RPointerEvent) => {
    const g = gesture.current;
    const state = useEditor.getState();
    const z = state.view.zoom;
    if (!g) {
      const t = e.target as HTMLElement;
      state.setHover(t.closest('[data-handle]') ? null : resolveHit(t, e.metaKey || e.ctrlKey));
      return;
    }
    switch (g.kind) {
      case 'pan':
        state.setView({ panX: g.panX + e.clientX - g.x, panY: g.panY + e.clientY - g.y });
        return;
      case 'marquee': {
        const v = vpRect();
        const x1 = e.clientX - v.left;
        const y1 = e.clientY - v.top;
        const m = { x: Math.min(g.x0, x1), y: Math.min(g.y0, y1), w: Math.abs(x1 - g.x0), h: Math.abs(y1 - g.y0) };
        const { doc } = state;
        const hits = (doc.nodes[doc.rootId] as { children: NodeId[] }).children.filter((c) => {
          if (isEffectivelyHidden(doc, c) || isEffectivelyLocked(doc, c)) return false;
          const el = elFor(c);
          if (!el) return false;
          const r = toScreen(el.getBoundingClientRect());
          return r.x < m.x + m.w && r.x + r.w > m.x && r.y < m.y + m.h && r.y + r.h > m.y;
        });
        state.select([...new Set([...g.base, ...hits])]);
        setExtras({ marquee: m });
        return;
      }
      case 'pending':
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_THRESHOLD) startMove(g, e);
        return;
      case 'move-abs': {
        let dx = (e.clientX - g.x) / z;
        let dy = (e.clientY - g.y) / z;
        const guides: OverlayExtras['guides'] = [];
        const primary = g.ids[0];
        if (!e.altKey && primary) {
          const s = g.starts[primary];
          const snap = (pos: number, size: number, lines: number[]) => {
            let best: { d: number; line: number } | null = null;
            for (const line of lines)
              for (const off of [0, size / 2, size]) {
                const d = line - (pos + off);
                if (Math.abs(d) * z <= SNAP_PX && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
              }
            return best;
          };
          const sx = snap(s.x + dx, g.size.w, g.snapX);
          const sy = snap(s.y + dy, g.size.h, g.snapY);
          const v = vpRect();
          if (sx) {
            dx += sx.d;
            guides.push({ x: g.parentRect.left - v.left + sx.line * z, y: g.parentRect.top - v.top, w: 1, h: g.parentRect.height });
          }
          if (sy) {
            dy += sy.d;
            guides.push({ x: g.parentRect.left - v.left, y: g.parentRect.top - v.top + sy.line * z, w: g.parentRect.width, h: 1 });
          }
        }
        state.apply((d) => {
          for (const id of g.ids) {
            d.nodes[id].x = Math.round(g.starts[id].x + dx);
            d.nodes[id].y = Math.round(g.starts[id].y + dy);
          }
        });
        setExtras({ guides });
        return;
      }
      case 'move-flow': {
        g.el.style.transform = `translate(${(e.clientX - g.x) / z}px, ${(e.clientY - g.y) / z}px)`;
        drop.current = findDrop(g.id, e.clientX, e.clientY, g.grab);
        setExtras({ drop: drop.current ? dropIndicator(drop.current, g.id) : undefined });
        return;
      }
      case 'resize': {
        let dx = (e.clientX - g.x) / z;
        let dy = (e.clientY - g.y) / z;
        const h = g.handle;
        const west = h.includes('w');
        const north = h.includes('n');
        const horiz = h.includes('e') || west;
        const vert = h.includes('s') || north;
        let w = Math.max(1, g.w + (west ? -dx : dx));
        let hh = Math.max(1, g.h + (north ? -dy : dy));
        if (e.shiftKey && horiz && vert) {
          const k = Math.max(w / g.w, hh / g.h);
          w = g.w * k;
          hh = g.h * k;
        }
        state.apply((d) => {
          const n = d.nodes[g.id];
          if (horiz) n.width = { mode: 'fixed', value: Math.round(w) };
          if (vert) n.height = { mode: 'fixed', value: Math.round(hh) };
          if (g.absolute && west) n.x = Math.round(g.nx + g.w - w);
          if (g.absolute && north) n.y = Math.round(g.ny + g.h - hh);
        });
        return;
      }
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    setExtras({});
    if (!g) return;
    const state = useEditor.getState();
    if (g.kind === 'move-abs' || g.kind === 'resize') state.commit();
    if (g.kind === 'move-flow') {
      g.el.style.transform = '';
      g.el.style.pointerEvents = '';
      g.el.style.opacity = '';
      g.el.style.zIndex = '';
      const d = drop.current;
      drop.current = null;
      if (!d) return;
      const { doc } = state;
      const node = doc.nodes[g.id];
      const parent = doc.nodes[node.parentId!] as { children: NodeId[] };
      const sameSpot = d.targetId === node.parentId && parent.children.filter((c) => c !== g.id)[d.index] === parent.children[parent.children.indexOf(g.id) + 1];
      if (sameSpot && !d.at) return;
      state.apply((doc) => {
        ops.moveNode(doc as Document, g.id, d.targetId, d.index, d.at);
      });
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const { doc, selection, select, setEditingText } = useEditor.getState();
    // Pointer capture retargets the event to the viewport, so hit-test at the cursor instead.
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target.closest('[data-editing]')) return;
    const hitEl = target.closest('[data-node-id]');
    const hit = hitEl?.getAttribute('data-node-id');
    if (!hit || hit === doc.rootId) return;
    const sel = selection[0];
    const chain = [hit, ...ancestors(doc, hit)].reverse().slice(1);
    const i = sel ? chain.indexOf(sel) : -1;
    const next = i >= 0 && i < chain.length - 1 ? chain[i + 1] : chain[0];
    const node = doc.nodes[sel ?? ''];
    if (sel && node?.type === 'text' && i === chain.length - 1) {
      setEditingText(sel);
      return;
    }
    if (isEffectivelyLocked(doc, next)) return;
    select([next]);
    if (doc.nodes[next].type === 'text' && next === chain.at(-1)) setEditingText(next);
  };

  const onResizeStart = (handle: Handle, e: RPointerEvent) => {
    e.stopPropagation();
    const { doc, selection, view, begin } = useEditor.getState();
    const id = selection[0];
    const el = elFor(id);
    if (!id || !el) return;
    viewportRef.current!.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const node = doc.nodes[id];
    begin();
    gesture.current = {
      kind: 'resize',
      id,
      handle,
      x: e.clientX,
      y: e.clientY,
      w: r.width / view.zoom,
      h: r.height / view.zoom,
      nx: node.x,
      ny: node.y,
      absolute: isAbsolute(doc, node),
    };
  };

  return (
    <div
      ref={viewportRef}
      className={`viewport${panning || keys.space ? ' is-panning' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => !gesture.current && useEditor.getState().setHover(null)}
      onDoubleClick={onDoubleClick}
    >
      <div
        className="world"
        style={{ transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})` }}
      >
        <div className="page-label" style={{ fontSize: 13 / view.zoom }}>
          {title} · {bp.label} {bp.width}
        </div>
        <div className="page" style={{ width: bp.width }}>
          {rootId && <NodeView id={rootId} />}
        </div>
      </div>
      <Overlay viewportRef={viewportRef} extras={extras} onResizeStart={onResizeStart} />
    </div>
  );
}

export function clampZoom(z: number) {
  return Math.min(4, Math.max(0.1, z));
}
