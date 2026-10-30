import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useEditor } from './store';
import './styles.css';

// Dev only: lets the browser console inspect the editor state.
if (import.meta.env.DEV) (window as unknown as { __editor: typeof useEditor }).__editor = useEditor;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
