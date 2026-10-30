# Site Builder (Framer clone)

A Framer-style visual editor MVP: lay out a landing page on a canvas with stacks,
style it, preview it at desktop, tablet and phone widths, and export a zip of
plain HTML, CSS, images and fonts. See the PRD for scope.

## Run

Requires [Bun](https://bun.sh) (Node is not needed).

```bash
bun install
bun run dev     # editor on http://localhost:5199
bun test        # model and exporter unit tests
bun run build   # type check + production build in dist/
```

## Layout

- `src/model/` the document format (`types.ts`), edit commands (`ops.ts`), the one
  node-to-CSS function shared by canvas and export (`css.ts`), and the exporter.
- `src/store.ts` Zustand store with undo/redo (document snapshots; drags and
  resizes are one step each).
- `src/editor/` canvas, overlay (selection, handles, guides), panels, preview.
- `src/persist.ts` autosave to IndexedDB.

Editor colors come from pd-design-artifacts `tokens/ui-color.json`, which was
transcribed by hand and is not yet verified against Figma.
