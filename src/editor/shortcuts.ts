import { useEffect } from 'react';
import { isAbsolute, isFrame } from '../model/tree';
import * as ops from '../model/ops';
import type { Document } from '../model/types';
import { useEditor } from '../store';
import { clampZoom, keys } from './Canvas';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (mod && k === 'p') {
        e.preventDefault();
        s.setPreviewOpen(true);
        return;
      }
      if (s.previewOpen || isTyping(e.target)) return;

      if (e.key === ' ') {
        keys.space = true;
        e.preventDefault();
        return;
      }
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && k === 'y') return void (e.preventDefault(), s.redo());
      if (mod && k === 'd') return void (e.preventDefault(), s.duplicateSelection());
      if (mod && k === 'g') return void (e.preventDefault(), s.groupSelection());
      if (mod && k === 'c') return void s.copySelection();
      if (mod && k === 'x') return void (s.copySelection(), s.deleteSelection());
      if (mod && k === 'v') return void (e.preventDefault(), s.paste());
      if (mod && k === 'a') {
        e.preventDefault();
        const first = s.selection[0];
        const parentId = first ? s.doc.nodes[first]?.parentId : s.doc.rootId;
        const parent = parentId ? s.doc.nodes[parentId] : undefined;
        if (isFrame(parent)) s.select(parent.children.filter((c) => !s.doc.nodes[c].locked));
        return;
      }
      if (mod && (e.key === '=' || e.key === '+' || e.key === '-')) {
        e.preventDefault();
        s.setView({ zoom: clampZoom(s.view.zoom * (e.key === '-' ? 1 / 1.25 : 1.25)) });
        return;
      }
      if (e.shiftKey && (e.code === 'Digit1')) {
        window.dispatchEvent(new Event('editor:zoom-to-fit'));
        return;
      }
      if (e.shiftKey && e.code === 'Digit0') {
        s.setView({ zoom: 1 });
        return;
      }
      if (mod || e.altKey) return;

      switch (k) {
        case 'f':
          return void s.insert('frame');
        case 't':
          return void s.insert('text');
        case 'i':
          return void s.insert('image');
        case 'r':
          return void s.insert('rect');
        case 'backspace':
        case 'delete':
          e.preventDefault();
          return void s.deleteSelection();
        case 'escape': {
          const first = s.selection[0];
          const parentId = first ? s.doc.nodes[first]?.parentId : null;
          s.select(parentId && parentId !== s.doc.rootId ? [parentId] : []);
          return;
        }
        case 'enter': {
          const node = s.doc.nodes[s.selection[0] ?? ''];
          if (!node) return;
          e.preventDefault();
          if (node.type === 'text') s.setEditingText(node.id);
          else if (isFrame(node) && node.children.length) s.select([node.children[0]]);
          return;
        }
        case 'arrowup':
        case 'arrowdown':
        case 'arrowleft':
        case 'arrowright': {
          if (s.selection.length === 0) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
          const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
          const doc = s.doc;
          s.apply((d) => {
            for (const id of s.selection) {
              const n = doc.nodes[id];
              if (!n || id === doc.rootId) continue;
              if (isAbsolute(doc, n)) {
                d.nodes[id].x += dx;
                d.nodes[id].y += dy;
              } else {
                // In a stack, arrows move the layer earlier or later.
                ops.shiftInParent(d as Document, id, dx + dy > 0 ? 1 : -1);
              }
            }
          }, 'nudge');
          return;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') keys.space = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
