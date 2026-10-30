import { useEffect, useState } from 'react';
import { Canvas } from './editor/Canvas';
import { LayersPanel } from './editor/LayersPanel';
import { Preview } from './editor/Preview';
import { PropertiesPanel } from './editor/PropertiesPanel';
import { useShortcuts } from './editor/shortcuts';
import { Toolbar } from './editor/Toolbar';
import { sampleDocument } from './model/factory';
import { loadDocument, saveDocument } from './persist';
import { useEditor } from './store';

export function App() {
  const [ready, setReady] = useState(false);
  const previewOpen = useEditor((s) => s.previewOpen);
  useShortcuts();

  // Open the last document, or the sample page the first time.
  useEffect(() => {
    let alive = true;
    loadDocument().then((doc) => {
      if (!alive) return;
      useEditor.getState().load(doc ?? sampleDocument());
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Autosave every change, debounced.
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc || s.txBase) return;
      clearTimeout(timer);
      timer = setTimeout(() => void saveDocument(useEditor.getState().doc).catch(console.error), 400);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [ready]);

  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <LayersPanel />
        <Canvas />
        <PropertiesPanel />
      </div>
      {previewOpen && <Preview />}
    </div>
  );
}
