import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Draft } from 'immer';
import { isFrame } from '../model/tree';
import type { FontFamily, Layout, Node, NodeId, ShadowPreset, Size } from '../model/types';
import { useEditor } from '../store';
import { insertImageFile } from './Toolbar';

type Recipe = (n: Draft<Node>) => void;

export function PropertiesPanel() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);

  if (!doc.rootId) return <aside className="panel props" />;
  if (selection.length > 1) {
    return (
      <aside className="panel props" aria-label="Properties">
        <div className="panel-title">{selection.length} layers selected</div>
        <div className="section">
          <div className="row gap">
            <button className="btn btn-secondary" onClick={() => useEditor.getState().groupSelection()}>
              Group into stack
            </button>
            <button className="btn btn-ghost danger" onClick={() => useEditor.getState().deleteSelection()}>
              Delete
            </button>
          </div>
          <p className="hint">Group needs layers with the same parent.</p>
        </div>
      </aside>
    );
  }
  const id = selection[0] ?? doc.rootId;
  const node = doc.nodes[id];
  if (!node) return <aside className="panel props" />;
  return <NodeProperties key={id} id={id} node={node} isRoot={id === doc.rootId} />;
}

function NodeProperties({ id, node, isRoot }: { id: NodeId; node: Node; isRoot: boolean }) {
  const parent = useEditor((s) => (node.parentId ? s.doc.nodes[node.parentId] : null));
  const measured = useMeasured(id);
  const update = (key: string, recipe: Recipe) => useEditor.getState().updateNode(id, recipe, `${id}:${key}`);
  const parentIsStack = !!parent && isFrame(parent) && parent.layout.mode === 'stack';
  const absolute = !!parent && isFrame(parent) && (parent.layout.mode === 'none' || node.position === 'absolute');

  return (
    <aside className="panel props" aria-label="Properties">
      <div className="panel-title">
        {isRoot ? (
          'Page'
        ) : (
          <input
            id="prop-name"
            className="name-input"
            aria-label="Layer name"
            value={node.name}
            onChange={(e) => update('name', (n) => void (n.name = e.target.value))}
          />
        )}
        <span className="type-chip">{isRoot ? 'Page' : node.type === 'rect' ? 'Rectangle' : cap(node.type)}</span>
      </div>

      {!isRoot && (
        <Section title="Position">
          {parentIsStack && (
            <Segmented
              label="Placement"
              value={node.position}
              options={[
                ['flow', 'In stack'],
                ['absolute', 'Absolute'],
              ]}
              onChange={(v) => update('position', (n) => void (n.position = v as Node['position']))}
            />
          )}
          {absolute ? (
            <div className="grid2">
              <NumberField id="prop-x" label="X" value={node.x} onChange={(v) => update('x', (n) => void (n.x = v))} />
              <NumberField id="prop-y" label="Y" value={node.y} onChange={(v) => update('y', (n) => void (n.y = v))} />
            </div>
          ) : (
            <p className="hint">Placed by the parent stack. Drag it on the canvas to reorder.</p>
          )}
        </Section>
      )}

      {!isRoot && (
        <Section title="Size">
          <SizeRow label="Width" axis="width" size={node.width} measured={measured.w} update={update} />
          <SizeRow label="Height" axis="height" size={node.height} measured={measured.h} update={update} />
          <div className="grid2">
            <NumberField
              id="prop-minw"
              label="Min W"
              value={node.minWidth}
              placeholder="None"
              onChange={(v) => update('minw', (n) => void (n.minWidth = v))}
              allowEmpty
            />
            <NumberField
              id="prop-maxw"
              label="Max W"
              value={node.maxWidth}
              placeholder="None"
              onChange={(v) => update('maxw', (n) => void (n.maxWidth = v))}
              allowEmpty
            />
          </div>
        </Section>
      )}

      {node.type === 'frame' && <LayoutSection layout={node.layout} clip={node.clip} update={update} />}
      {node.type === 'text' && <TextSection node={node} update={update} />}
      {node.type === 'image' && <ImageSection id={id} node={node} update={update} />}

      <Section title="Fill">
        <ColorField
          id="prop-fill"
          label="Color"
          value={node.style.fill}
          allowNone
          onChange={(v) => update('fill', (n) => void (n.style.fill = v))}
        />
      </Section>

      <Section title="Border">
        <div className="grid2">
          <NumberField
            id="prop-border-w"
            label="Width"
            value={node.style.border?.width ?? 0}
            onChange={(v) =>
              update('border-w', (n) => {
                n.style.border = v > 0 ? { color: '#c5cad6', style: 'solid', ...(n.style.border ?? {}), width: v } : null;
              })
            }
          />
          <Select
            id="prop-border-style"
            label="Style"
            value={node.style.border?.style ?? 'solid'}
            options={[
              ['solid', 'Solid'],
              ['dashed', 'Dashed'],
            ]}
            disabled={!node.style.border}
            onChange={(v) => update('border-s', (n) => void (n.style.border && (n.style.border.style = v as 'solid')))}
          />
        </div>
        {node.style.border && (
          <ColorField
            id="prop-border-c"
            label="Color"
            value={node.style.border.color}
            onChange={(v) => update('border-c', (n) => void (n.style.border && (n.style.border.color = v ?? '#000000')))}
          />
        )}
      </Section>

      <Section title="Appearance">
        <div className="grid2">
          <NumberField id="prop-radius" label="Radius" value={node.style.radius} onChange={(v) => update('radius', (n) => void (n.style.radius = v))} />
          <NumberField
            id="prop-opacity"
            label="Opacity %"
            value={Math.round(node.style.opacity * 100)}
            min={0}
            max={100}
            onChange={(v) => update('opacity', (n) => void (n.style.opacity = Math.max(0, Math.min(100, v)) / 100))}
          />
        </div>
        <Segmented
          label="Shadow"
          value={node.style.shadow}
          options={[
            ['none', 'None'],
            ['sm', 'S'],
            ['md', 'M'],
            ['lg', 'L'],
          ]}
          onChange={(v) => update('shadow', (n) => void (n.style.shadow = v as ShadowPreset))}
        />
      </Section>
    </aside>
  );
}

function SizeRow({
  label,
  axis,
  size,
  measured,
  update,
}: {
  label: string;
  axis: 'width' | 'height';
  size: Size;
  measured: number;
  update: (key: string, r: Recipe) => void;
}) {
  return (
    <div className="size-row">
      <NumberField
        id={`prop-${axis}`}
        label={label}
        value={size.mode === 'fixed' ? size.value : Math.round(measured)}
        dim={size.mode !== 'fixed'}
        onChange={(v) => update(axis, (n) => void (n[axis] = { mode: 'fixed', value: Math.max(1, v) }))}
      />
      <Segmented
        value={size.mode}
        options={[
          ['fixed', 'Fixed'],
          ['fill', 'Fill'],
          ['fit', 'Fit'],
        ]}
        onChange={(mode) =>
          update(`${axis}-mode`, (n) => {
            n[axis] = mode === 'fixed' ? { mode: 'fixed', value: Math.max(1, Math.round(measured)) } : { mode: mode as 'fill' | 'fit' };
          })
        }
      />
    </div>
  );
}

function LayoutSection({ layout, clip, update }: { layout: Layout; clip: boolean; update: (key: string, r: Recipe) => void }) {
  const set = <K extends keyof Layout>(key: K, value: Layout[K]) =>
    update(`layout-${key}`, (n) => {
      if (n.type === 'frame') n.layout[key] = value as never;
    });
  const stack = layout.mode === 'stack';
  return (
    <Section title="Layout">
      <Segmented
        label="Children"
        value={layout.mode}
        options={[
          ['stack', 'Stack'],
          ['none', 'Free'],
        ]}
        onChange={(v) => set('mode', v as Layout['mode'])}
      />
      {stack && (
        <>
          <Segmented
            label="Direction"
            value={layout.direction}
            options={[
              ['row', 'Row →'],
              ['column', 'Column ↓'],
            ]}
            onChange={(v) => set('direction', v as Layout['direction'])}
          />
          <div className="grid2">
            <NumberField id="prop-gap" label="Gap" value={layout.gap} onChange={(v) => set('gap', Math.max(0, v))} />
            <label className="check">
              <input id="prop-wrap" type="checkbox" checked={layout.wrap} onChange={(e) => set('wrap', e.target.checked)} />
              Wrap
            </label>
          </div>
          <Select
            id="prop-align"
            label={layout.direction === 'row' ? 'Align (vertical)' : 'Align (horizontal)'}
            value={layout.align}
            options={[
              ['start', 'Start'],
              ['center', 'Center'],
              ['end', 'End'],
              ['stretch', 'Stretch'],
            ]}
            onChange={(v) => set('align', v as Layout['align'])}
          />
          <Select
            id="prop-distribute"
            label="Distribute"
            value={layout.distribute}
            options={[
              ['start', 'Start'],
              ['center', 'Center'],
              ['end', 'End'],
              ['space-between', 'Space between'],
            ]}
            onChange={(v) => set('distribute', v as Layout['distribute'])}
          />
        </>
      )}
      <div className="field-label">Padding</div>
      <div className="grid4">
        {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side, i) => (
          <NumberField
            key={side}
            id={`prop-pad-${side}`}
            label={side[0]}
            title={`Padding ${side.toLowerCase()}`}
            value={layout.padding[i]}
            onChange={(v) => {
              const next = [...layout.padding] as Layout['padding'];
              next[i] = Math.max(0, v);
              set('padding', next);
            }}
          />
        ))}
      </div>
      <label className="check">
        <input id="prop-clip" type="checkbox" checked={clip} onChange={(e) => update('clip', (n) => void (n.type === 'frame' && (n.clip = e.target.checked)))} />
        Clip content
      </label>
    </Section>
  );
}

function TextSection({ node, update }: { node: Extract<Node, { type: 'text' }>; update: (key: string, r: Recipe) => void }) {
  const f = node.font;
  const setFont = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) =>
    update(`font-${key}`, (n) => {
      if (n.type === 'text') n.font[key] = value as never;
    });
  return (
    <Section title="Text">
      <textarea
        id="prop-text"
        className="textarea"
        aria-label="Text content"
        value={node.text}
        rows={3}
        onChange={(e) => update('text', (n) => void (n.type === 'text' && (n.text = e.target.value)))}
      />
      <div className="grid2">
        <Select
          id="prop-tag"
          label="Tag"
          value={node.tag}
          options={[
            ['h1', 'Heading 1'],
            ['h2', 'Heading 2'],
            ['h3', 'Heading 3'],
            ['p', 'Paragraph'],
            ['span', 'Inline'],
          ]}
          onChange={(v) => update('tag', (n) => void (n.type === 'text' && (n.tag = v as typeof node.tag)))}
        />
        <Select
          id="prop-font"
          label="Font"
          value={f.family}
          options={[
            ['Lato', 'Lato'],
            ['system-ui', 'System'],
            ['Georgia', 'Georgia'],
            ['Courier New', 'Courier'],
          ]}
          onChange={(v) => setFont('family', v as FontFamily)}
        />
      </div>
      <div className="grid2">
        <NumberField id="prop-size" label="Size" value={f.size} onChange={(v) => setFont('size', Math.max(1, v))} />
        <Select
          id="prop-weight"
          label="Weight"
          value={String(f.weight)}
          options={[
            ['400', 'Regular'],
            ['600', 'Semibold'],
            ['700', 'Bold'],
          ]}
          onChange={(v) => setFont('weight', Number(v) as 400)}
        />
      </div>
      <div className="grid2">
        <NumberField id="prop-lh" label="Line height" step={0.05} value={f.lineHeight} onChange={(v) => setFont('lineHeight', Math.max(0.5, v))} />
        <NumberField id="prop-ls" label="Letter sp." step={0.1} value={f.letterSpacing} onChange={(v) => setFont('letterSpacing', v)} />
      </div>
      <ColorField id="prop-color" label="Color" value={f.color} onChange={(v) => setFont('color', v ?? '#111111')} />
      <Segmented
        label="Align"
        value={f.align}
        options={[
          ['left', 'Left'],
          ['center', 'Center'],
          ['right', 'Right'],
        ]}
        onChange={(v) => setFont('align', v as typeof f.align)}
      />
    </Section>
  );
}

function ImageSection({ id, node, update }: { id: NodeId; node: Extract<Node, { type: 'image' }>; update: (key: string, r: Recipe) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Section title="Image">
      <button className="btn btn-secondary wide" onClick={() => input.current?.click()}>
        {node.assetId ? 'Replace image…' : 'Choose image…'}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertImageFile(file, id);
          e.target.value = '';
        }}
      />
      <TextField id="prop-alt" label="Alt text" value={node.alt} placeholder="Describe the image" onChange={(v) => update('alt', (n) => void (n.type === 'image' && (n.alt = v)))} />
      <Segmented
        label="Fit"
        value={node.fit}
        options={[
          ['cover', 'Cover'],
          ['contain', 'Contain'],
        ]}
        onChange={(v) => update('fit', (n) => void (n.type === 'image' && (n.fit = v as 'cover')))}
      />
    </Section>
  );
}

// ---- Controls ----

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  dim,
  allowEmpty,
  placeholder,
  title,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  dim?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : String(Math.round(value * 100) / 100));
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (t === '' && allowEmpty) (onChange as (v: number | null) => void)(null);
    else {
      const v = Number(t);
      if (Number.isFinite(v)) onChange(clamp(v));
    }
    setDraft(null);
  };

  // Drag the label sideways to scrub the value, as one undo step.
  const scrub = (e: React.PointerEvent) => {
    if (value === null) return;
    const start = e.clientX;
    const startValue = value;
    const { begin, commit: end } = useEditor.getState();
    begin();
    const move = (ev: PointerEvent) => {
      const delta = Math.round((ev.clientX - start) / 2) * step * (ev.shiftKey ? 10 : 1);
      onChange(clamp(Math.round((startValue + delta) * 100) / 100));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="field" title={title}>
      <label htmlFor={id} className="field-label scrub" onPointerDown={scrub}>
        {label}
      </label>
      <input
        id={id}
        className={`input${dim ? ' dim' : ''}`}
        inputMode="decimal"
        value={shown}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(null);
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== null) {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            onChange(clamp(Math.round((value + d) * 100) / 100));
            setDraft(null);
          }
        }}
      />
    </div>
  );
}

function TextField({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Select({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select id={id} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Segmented({ label, value, options, onChange }: { label?: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="field">
      {label && <div className="field-label">{label}</div>}
      <div className="segmented small" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} className="segmented-item" onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
  allowNone,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (t === '' && allowNone) onChange(null);
    else if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(t)) onChange(t.startsWith('#') ? t.toLowerCase() : `#${t.toLowerCase()}`);
    setDraft(null);
  };
  const hex = value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="color-row">
        <input
          type="color"
          className="swatch"
          aria-label={`${label} picker`}
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          style={value ? undefined : { opacity: 0.35 }}
        />
        <input
          id={id}
          className="input"
          value={draft ?? value ?? ''}
          placeholder="None"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        {allowNone && value && (
          <button className="btn btn-icon small" title="Remove fill" onClick={() => onChange(null)}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/** The node's rendered size in page pixels, for Fill and Fit sizes. */
function useMeasured(id: NodeId) {
  const doc = useEditor((s) => s.doc);
  const zoom = useEditor((s) => s.view.zoom);
  const bp = useEditor((s) => s.breakpoint);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = document.querySelector(`.page [data-node-id="${id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next = { w: r.width / zoom, h: r.height / zoom };
    setSize((s) => (Math.abs(s.w - next.w) < 0.5 && Math.abs(s.h - next.h) < 0.5 ? s : next));
  }, [id, doc, zoom, bp]);
  return size;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
