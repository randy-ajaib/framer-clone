import { memo, useEffect, useRef, type CSSProperties } from 'react';
import { nodeCss, toReactStyle } from '../model/css';
import type { NodeId } from '../model/types';
import { BREAKPOINTS, useEditor } from '../store';

/** Renders one document node, and its children, as the real DOM the export will produce. */
export const NodeView = memo(function NodeView({ id }: { id: NodeId }) {
  const node = useEditor((s) => s.doc.nodes[id]);
  const parent = useEditor((s) => {
    const n = s.doc.nodes[id];
    return n?.parentId ? s.doc.nodes[n.parentId] : null;
  });
  const isRoot = useEditor((s) => s.doc.rootId === id);
  const minHeight = useEditor((s) => BREAKPOINTS[s.breakpoint].height);
  const asset = useEditor((s) => {
    const n = s.doc.nodes[id];
    return n?.type === 'image' && n.assetId ? s.doc.assets[n.assetId] : undefined;
  });
  const editing = useEditor((s) => s.editingTextId === id);

  if (!node || node.hidden) return null;
  const style = toReactStyle(nodeCss(node, parent)) as CSSProperties;
  if (isRoot) style.minHeight = minHeight; // stands in for the export's min-height: 100vh
  const common = { 'data-node-id': id, style };

  switch (node.type) {
    case 'frame':
      return (
        <div {...common}>
          {node.children.map((c) => (
            <NodeView key={c} id={c} />
          ))}
        </div>
      );
    case 'text':
      return editing ? <TextEditor id={id} tag={node.tag} text={node.text} style={style} /> : (
        <node.tag {...common}>{node.text}</node.tag>
      );
    case 'image':
      return asset ? (
        <img {...common} src={asset.dataUrl} alt={node.alt} draggable={false} />
      ) : (
        <div {...common} className="placeholder" role="img" aria-label={node.alt}>
          <span className="placeholder-label">Image</span>
        </div>
      );
    case 'rect':
      return <div {...common} />;
  }
});

/** Text being edited in place. The store only changes when editing ends, as one undo step. */
function TextEditor({ id, tag: Tag, text, style }: { id: NodeId; tag: string; text: string; style: CSSProperties }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const finish = () => {
    const el = ref.current;
    if (!el) return;
    const next = el.innerText.replace(/\n$/, '');
    const { updateNode, setEditingText } = useEditor.getState();
    if (next !== text) {
      updateNode(id, (n) => {
        if (n.type === 'text') n.text = next;
      });
    }
    setEditingText(null);
  };

  const El = Tag as 'p';
  return (
    <El
      ref={ref as React.RefObject<HTMLParagraphElement>}
      data-node-id={id}
      data-editing="true"
      style={{ ...style, outline: 'none', cursor: 'text' }}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
    >
      {text}
    </El>
  );
}
