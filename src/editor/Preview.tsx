import { useEffect, useMemo, useState } from 'react';
import { exportInlinePage } from '../model/export';
import { BREAKPOINTS, useEditor } from '../store';

/** Shows the exported page itself, not the canvas, so the preview is exactly what ships. */
export function Preview() {
  const doc = useEditor((s) => s.doc);
  const [bp, setBp] = useState(useEditor.getState().breakpoint);
  const html = useMemo(() => exportInlinePage(doc, `${location.origin}/fonts/`), [doc]);
  const close = () => useEditor.getState().setPreviewOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const width = BREAKPOINTS[bp].width;
  return (
    <div className="preview" role="dialog" aria-modal="true" aria-label="Preview">
      <div className="preview-bar">
        <strong>Preview</strong>
        <div className="segmented" role="radiogroup" aria-label="Preview width">
          {BREAKPOINTS.map((b, i) => (
            <button key={b.label} role="radio" aria-checked={bp === i} className="segmented-item" onClick={() => setBp(i)}>
              {b.label} <span className="muted">{b.width}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-secondary" onClick={close}>
          Close <span className="muted">Esc</span>
        </button>
      </div>
      <div className="preview-stage">
        <iframe title="Page preview" className="preview-frame" style={{ width }} srcDoc={html} sandbox="allow-same-origin" />
      </div>
    </div>
  );
}
