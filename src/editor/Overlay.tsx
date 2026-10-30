import { useLayoutEffect, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react';
import { isEffectivelyLocked } from '../model/tree';
import type { Size } from '../model/types';
import { useEditor } from '../store';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface OverlayExtras {
  marquee?: ScreenRect;
  guides?: ScreenRect[];
  drop?: { frame: ScreenRect; line?: ScreenRect };
}

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const sizeLabel = (s: Size, px: number) => (s.mode === 'fixed' ? `${Math.round(px)}` : `${s.mode === 'fill' ? 'Fill' : 'Fit'} ${Math.round(px)}`);

/** Editor chrome drawn over the canvas in screen space, so it never ends up in the export. */
export function Overlay({
  viewportRef,
  extras,
  onResizeStart,
}: {
  viewportRef: RefObject<HTMLDivElement>;
  extras: OverlayExtras;
  onResizeStart: (h: Handle, e: RPointerEvent) => void;
}) {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const hoverId = useEditor((s) => s.hoverId);
  const editing = useEditor((s) => s.editingTextId);
  const view = useEditor((s) => s.view);
  const breakpoint = useEditor((s) => s.breakpoint);
  const [rects, setRects] = useState<Record<string, ScreenRect>>({});
  const [tick, setTick] = useState(0);

  // Re-measure when fonts or images finish loading and the page reflows.
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const page = vp?.querySelector('.page');
    if (!vp || !page) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(page);
    document.fonts?.ready.then(() => setTick((t) => t + 1));
    const onLoad = () => setTick((t) => t + 1);
    vp.addEventListener('load', onLoad, true);
    return () => {
      ro.disconnect();
      vp.removeEventListener('load', onLoad, true);
    };
  }, [viewportRef]);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const v = vp.getBoundingClientRect();
    const next: Record<string, ScreenRect> = {};
    for (const id of new Set([...selection, ...(hoverId ? [hoverId] : [])])) {
      const el = vp.querySelector(`[data-node-id="${id}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next[id] = { x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height };
    }
    setRects(next);
  }, [doc, selection, hoverId, view, breakpoint, tick, editing, viewportRef]);

  const single = selection.length === 1 ? selection[0] : null;
  const singleNode = single ? doc.nodes[single] : null;
  const showHandles = !!single && !editing && !isEffectivelyLocked(doc, single) && single !== doc.rootId;

  return (
    <div className="overlay">
      {hoverId && !selection.includes(hoverId) && rects[hoverId] && <Box r={rects[hoverId]} className="ov-hover" />}
      {selection.map((id) => rects[id] && <Box key={id} r={rects[id]} className="ov-selection" />)}
      {showHandles && rects[single!] && (
        <>
          {HANDLES.map((h) => (
            <div
              key={h}
              data-handle={h}
              className={`ov-handle ov-handle-${h}`}
              style={handlePos(rects[single!], h)}
              onPointerDown={(e) => onResizeStart(h, e)}
            />
          ))}
          {singleNode && (
            <div
              className="ov-size"
              style={{ left: rects[single!].x + rects[single!].w / 2, top: rects[single!].y + rects[single!].h + 8 }}
            >
              {sizeLabel(singleNode.width, rects[single!].w / view.zoom)} ×{' '}
              {sizeLabel(singleNode.height, rects[single!].h / view.zoom)}
            </div>
          )}
        </>
      )}
      {extras.drop && <Box r={extras.drop.frame} className="ov-drop-frame" />}
      {extras.drop?.line && <Box r={extras.drop.line} className="ov-drop-line" />}
      {extras.guides?.map((g, i) => <Box key={i} r={g} className="ov-guide" />)}
      {extras.marquee && <Box r={extras.marquee} className="ov-marquee" />}
    </div>
  );
}

function Box({ r, className }: { r: ScreenRect; className: string }) {
  return <div className={className} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />;
}

function handlePos(r: ScreenRect, h: Handle) {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2;
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2;
  return { left: x, top: y };
}
