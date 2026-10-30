import { useEffect, useRef, useState, type DragEvent } from 'react';
import * as ops from '../model/ops';
import { ancestors, isDescendantOf, isFrame } from '../model/tree';
import type { Document, NodeId } from '../model/types';
import { useEditor } from '../store';
import { ToolIcon } from './Toolbar';

type DropPos = 'before' | 'after' | 'inside';

export function LayersPanel() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const [collapsed, setCollapsed] = useState<Set<NodeId>>(new Set());
  const [renaming, setRenaming] = useState<NodeId | null>(null);
  const [dropAt, setDropAt] = useState<{ id: NodeId; pos: DropPos } | null>(null);
  const dragging = useRef<NodeId | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reveal the selected layer: expand its ancestors and scroll it into view.
  useEffect(() => {
    const id = selection[0];
    if (!id || !doc.nodes[id]) return;
    const hidden = ancestors(doc, id).filter((a) => collapsed.has(a));
    if (hidden.length) {
      setCollapsed((c) => new Set([...c].filter((x) => !hidden.includes(x))));
      return;
    }
    listRef.current?.querySelector(`[data-layer="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selection, doc, collapsed]);

  if (!doc.rootId) return null;

  const rows: { id: NodeId; depth: number }[] = [];
  const walk = (id: NodeId, depth: number) => {
    rows.push({ id, depth });
    const n = doc.nodes[id];
    if (isFrame(n) && !collapsed.has(id)) n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(doc.rootId, 0);

  const onDragOver = (e: DragEvent, id: NodeId) => {
    const src = dragging.current;
    if (!src || src === id || isDescendantOf(doc, id, src)) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = (e.clientY - r.top) / r.height;
    const frame = isFrame(doc.nodes[id]);
    let pos: DropPos = t < 0.5 ? 'before' : 'after';
    if (frame && t > 0.25 && t < 0.75) pos = 'inside';
    if (id === doc.rootId) pos = 'inside';
    setDropAt({ id, pos });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const src = dragging.current;
    const at = dropAt;
    dragging.current = null;
    setDropAt(null);
    if (!src || !at) return;
    useEditor.getState().apply((d) => {
      const docD = d as Document;
      if (at.pos === 'inside') {
        ops.moveNode(docD, src, at.id, 0);
        return;
      }
      const parentId = docD.nodes[at.id].parentId!;
      const siblings = (docD.nodes[parentId] as { children: NodeId[] }).children.filter((c) => c !== src);
      const i = siblings.indexOf(at.id) + (at.pos === 'after' ? 1 : 0);
      ops.moveNode(docD, src, parentId, i);
    });
  };

  return (
    <aside className="panel layers" aria-label="Layers">
      <div className="panel-title">Layers</div>
      <div className="layer-list" ref={listRef} onDragLeave={(e) => e.currentTarget === e.target && setDropAt(null)}>
        {rows.map(({ id, depth }) => {
          const n = doc.nodes[id];
          const isRoot = id === doc.rootId;
          const selected = selection.includes(id);
          const kids = isFrame(n) ? n.children.length : 0;
          return (
            <div
              key={id}
              data-layer={id}
              className={[
                'layer',
                selected && 'is-selected',
                n.hidden && 'is-hidden',
                dropAt?.id === id && `drop-${dropAt.pos}`,
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ paddingLeft: 8 + depth * 14 }}
              draggable={!isRoot && renaming !== id}
              onDragStart={(e) => {
                dragging.current = id;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                dragging.current = null;
                setDropAt(null);
              }}
              onDragOver={(e) => onDragOver(e, id)}
              onDrop={onDrop}
              onMouseEnter={() => useEditor.getState().setHover(isRoot ? null : id)}
              onMouseLeave={() => useEditor.getState().setHover(null)}
              onClick={(e) => {
                const { select } = useEditor.getState();
                if (isRoot) return select([]);
                if (e.shiftKey) select(selected ? selection.filter((s) => s !== id) : [...selection, id]);
                else select([id]);
              }}
              onDoubleClick={() => !isRoot && setRenaming(id)}
            >
              <button
                className="layer-caret"
                aria-label={collapsed.has(id) ? 'Expand' : 'Collapse'}
                style={{ visibility: kids ? 'visible' : 'hidden' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed((c) => {
                    const next = new Set(c);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
              >
                {collapsed.has(id) ? '▸' : '▾'}
              </button>
              <span className="layer-icon">
                <ToolIcon type={n.type} />
              </span>
              {renaming === id ? (
                <input
                  id={`rename-${id}`}
                  className="layer-rename"
                  autoFocus
                  defaultValue={n.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== n.name) useEditor.getState().updateNode(id, (x) => void (x.name = v));
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                    e.stopPropagation();
                  }}
                />
              ) : (
                <span className="layer-name">{isRoot ? 'Page' : n.name}</span>
              )}
              {!isRoot && (
                <span className="layer-toggles">
                  <button
                    className={`layer-toggle${n.locked ? ' on' : ''}`}
                    title={n.locked ? 'Unlock' : 'Lock'}
                    aria-pressed={n.locked}
                    onClick={(e) => {
                      e.stopPropagation();
                      useEditor.getState().updateNode(id, (x) => void (x.locked = !x.locked));
                    }}
                  >
                    {n.locked ? <LockIcon /> : <UnlockIcon />}
                  </button>
                  <button
                    className={`layer-toggle${n.hidden ? ' on' : ''}`}
                    title={n.hidden ? 'Show' : 'Hide'}
                    aria-pressed={n.hidden}
                    onClick={(e) => {
                      e.stopPropagation();
                      useEditor.getState().updateNode(id, (x) => void (x.hidden = !x.hidden));
                    }}
                  >
                    {n.hidden ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

const icon = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 };
const EyeIcon = () => (
  <svg {...icon} aria-hidden="true">
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);
const EyeOffIcon = () => (
  <svg {...icon} aria-hidden="true">
    <path d="M2 2l12 12M6.6 4c.45-.1.92-.15 1.4-.15 4 0 6.5 4.15 6.5 4.15s-.7 1.25-2 2.45M10.1 11.9c-.65.2-1.35.35-2.1.35-4 0-6.5-4.25-6.5-4.25s.8-1.45 2.3-2.7" />
  </svg>
);
const LockIcon = () => (
  <svg {...icon} aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5 7V5a3 3 0 016 0v2" />
  </svg>
);
const UnlockIcon = () => (
  <svg {...icon} aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5 7V5a3 3 0 015.8-1" />
  </svg>
);
