import { useRef, useState } from 'react';
import { buildZip, slugify } from '../model/export';
import { blankDocument, sampleDocument } from '../model/factory';
import type { NodeType } from '../model/types';
import { isDocument } from '../persist';
import { BREAKPOINTS, useEditor } from '../store';

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads an image file into the document's assets and inserts it, sized to its natural ratio. */
export async function insertImageFile(file: File, replaceId?: string) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await img.decode().catch(() => undefined);
  const { addAsset, insert, updateNode } = useEditor.getState();
  const assetId = addAsset({ name: file.name, mime: file.type || 'image/png', dataUrl });
  const alt = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
  if (replaceId) {
    updateNode(replaceId, (n) => {
      if (n.type === 'image') {
        n.assetId = assetId;
        if (!n.alt) n.alt = alt;
      }
    });
    return;
  }
  const w = Math.min(img.naturalWidth || 480, 480);
  const h = img.naturalWidth ? Math.round((w * img.naturalHeight) / img.naturalWidth) : 320;
  insert('image', {
    name: alt || 'Image',
    assetId,
    alt,
    width: { mode: 'fixed', value: w },
    height: { mode: 'fixed', value: h },
  } as never);
}

const TOOLS: { type: NodeType; label: string; key: string }[] = [
  { type: 'frame', label: 'Frame', key: 'F' },
  { type: 'text', label: 'Text', key: 'T' },
  { type: 'image', label: 'Image', key: 'I' },
  { type: 'rect', label: 'Rectangle', key: 'R' },
];

export function Toolbar() {
  const title = useEditor((s) => s.doc.title);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const zoom = useEditor((s) => s.view.zoom);
  const breakpoint = useEditor((s) => s.breakpoint);
  const imageInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 2600);
  };

  const onExport = async () => {
    setBusy(true);
    try {
      const doc = useEditor.getState().doc;
      download(await buildZip(doc), `${slugify(doc.title || 'site')}.zip`);
      flash('Exported. Unzip it and open index.html.');
    } catch (err) {
      flash(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const onImportJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!isDocument(parsed)) throw new Error('This file is not a Site Builder document.');
      useEditor.getState().load(parsed);
      flash(`Opened ${file.name}`);
    } catch (err) {
      flash((err as Error).message);
    }
  };

  const menu = (label: string, run: () => void) => (
    <button
      className="menu-item"
      onClick={() => {
        setMenuOpen(false);
        run();
      }}
    >
      {label}
    </button>
  );

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <div className="menu-wrap">
          <button className="btn btn-ghost" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            File
          </button>
          {menuOpen && (
            <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
              {menu('New blank page', () => useEditor.getState().load(blankDocument()))}
              {menu('Open sample page', () => useEditor.getState().load(sampleDocument()))}
              {menu('Open document (.json)…', () => jsonInput.current?.click())}
              {menu('Save document (.json)', () => {
                const doc = useEditor.getState().doc;
                download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${slugify(doc.title || 'page')}.json`);
              })}
            </div>
          )}
        </div>
        <input
          id="doc-title"
          className="title-input"
          value={title}
          aria-label="Page title"
          onChange={(e) => {
            const v = e.target.value;
            useEditor.getState().apply((d) => {
              d.title = v;
            }, 'title');
          }}
        />
      </div>

      <div className="toolbar-group">
        {TOOLS.map((t) => (
          <button
            key={t.type}
            className="btn btn-tool"
            title={`${t.label} (${t.key})`}
            onClick={() => (t.type === 'image' ? imageInput.current?.click() : useEditor.getState().insert(t.type))}
          >
            <ToolIcon type={t.type} />
            <span>{t.label}</span>
          </button>
        ))}
        <span className="divider" />
        <button className="btn btn-icon" title="Undo (⌘Z)" disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
          ↶
        </button>
        <button className="btn btn-icon" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
          ↷
        </button>
      </div>

      <div className="toolbar-group">
        <div className="segmented" role="radiogroup" aria-label="Canvas width">
          {BREAKPOINTS.map((b, i) => (
            <button
              key={b.label}
              role="radio"
              aria-checked={breakpoint === i}
              className="segmented-item"
              onClick={() => useEditor.getState().setBreakpoint(i)}
              title={`${b.label}, ${b.width} px`}
            >
              {b.label} <span className="muted">{b.width}</span>
            </button>
          ))}
        </div>
        <button
          className="btn btn-ghost zoom"
          title="Zoom to fit (⇧1)"
          onClick={() => window.dispatchEvent(new Event('editor:zoom-to-fit'))}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className="btn btn-secondary" onClick={() => useEditor.getState().setPreviewOpen(true)} title="Preview (⌘P)">
          Preview
        </button>
        <button className="btn btn-primary" onClick={onExport} disabled={busy}>
          {busy ? 'Exporting…' : 'Export'}
        </button>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void insertImageFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={jsonInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImportJson(f);
          e.target.value = '';
        }}
      />
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </header>
  );
}

export function ToolIcon({ type }: { type: NodeType }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 };
  switch (type) {
    case 'frame':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4.5 1.5v13M11.5 1.5v13M1.5 4.5h13M1.5 11.5h13" />
        </svg>
      );
    case 'text':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 3.5h10M8 3.5v10M6 13.5h4" />
        </svg>
      );
    case 'image':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
          <circle cx="5.75" cy="6.25" r="1.25" />
          <path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" />
        </svg>
      );
    case 'rect':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
        </svg>
      );
  }
}
