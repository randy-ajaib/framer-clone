import { isFrame } from './tree';
import type { FontFamily, Layout, Node, ShadowPreset } from './types';

/**
 * The one place that turns a node into CSS. The canvas renders with it and the
 * exporter writes it out, so what the designer sees is what ships.
 * Returns kebab-case declarations in a stable order.
 */
export type Declarations = [property: string, value: string][];

export const shadowCss: Record<ShadowPreset, string | null> = {
  none: null,
  sm: '0 1px 2px rgba(16, 24, 40, 0.08), 0 1px 3px rgba(16, 24, 40, 0.06)',
  md: '0 4px 12px rgba(16, 24, 40, 0.10), 0 2px 4px rgba(16, 24, 40, 0.06)',
  lg: '0 16px 40px rgba(16, 24, 40, 0.16), 0 4px 10px rgba(16, 24, 40, 0.06)',
};

export const fontStack: Record<FontFamily, string> = {
  Lato: "'Lato', 'Helvetica Neue', Arial, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  'system-ui': "system-ui, -apple-system, 'Segoe UI', sans-serif",
  'Courier New': "'Courier New', ui-monospace, monospace",
};

const flexAlign = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const;
const flexJustify = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
} as const;

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

export function nodeCss(node: Node, parent: Node | null): Declarations {
  const out: Declarations = [];
  const add = (p: string, v: string | number | null | undefined) => {
    if (v !== null && v !== undefined && v !== '') out.push([p, String(v)]);
  };
  const parentLayout: Layout | null = parent && isFrame(parent) ? parent.layout : null;
  const absolute = !!parentLayout && (parentLayout.mode === 'none' || node.position === 'absolute');
  const inStack = !absolute && parentLayout?.mode === 'stack';
  const mainAxis = parentLayout?.direction === 'row' ? 'width' : 'height';

  // Placement
  if (absolute) {
    add('position', 'absolute');
    add('left', px(node.x));
    add('top', px(node.y));
  } else if (isFrame(node)) {
    // Frames are the positioning context for their absolutely placed children.
    add('position', 'relative');
  }

  // Size, per axis
  for (const axis of ['width', 'height'] as const) {
    const size = node[axis];
    if (size.mode === 'fixed') {
      add(axis, px(size.value));
      if (inStack && axis === mainAxis) add('flex-shrink', '0');
    } else if (size.mode === 'fill') {
      if (inStack && axis === mainAxis) {
        add('flex', '1 1 0');
        add(axis === 'width' ? 'min-width' : 'min-height', '0');
      } else if (inStack) {
        add('align-self', 'stretch');
      } else {
        add(axis, '100%');
      }
    } else {
      // fit
      add(axis, axis === 'width' ? (node.type === 'text' || isFrame(node) ? 'fit-content' : 'auto') : 'auto');
      if (inStack && axis === mainAxis) add('flex-shrink', '0');
    }
  }
  // Fixed widths may shrink on narrow screens rather than overflow the page.
  if (node.width.mode === 'fixed' && !absolute) add('max-width', '100%');
  if (node.minWidth !== null) add('min-width', px(node.minWidth));
  if (node.maxWidth !== null) add('max-width', px(node.maxWidth));

  // Layout
  if (isFrame(node)) {
    const l = node.layout;
    if (l.mode === 'stack') {
      add('display', 'flex');
      add('flex-direction', l.direction);
      if (l.wrap) add('flex-wrap', 'wrap');
      add('gap', px(l.gap));
      add('align-items', flexAlign[l.align]);
      add('justify-content', flexJustify[l.distribute]);
    }
    const [t, r, b, lft] = l.padding;
    if (t || r || b || lft) add('padding', [t, r, b, lft].map(px).join(' '));
    if (node.clip) add('overflow', 'hidden');
  }

  // Appearance
  const s = node.style;
  add('background', s.fill);
  if (s.border && s.border.width > 0) add('border', `${px(s.border.width)} ${s.border.style} ${s.border.color}`);
  if (s.radius) add('border-radius', px(s.radius));
  add('box-shadow', shadowCss[s.shadow]);
  if (s.opacity < 1) add('opacity', s.opacity);

  // Content
  if (node.type === 'text') {
    const f = node.font;
    add('margin', '0');
    add('font-family', fontStack[f.family]);
    add('font-size', px(f.size));
    add('font-weight', f.weight);
    add('line-height', f.lineHeight);
    if (f.letterSpacing) add('letter-spacing', px(f.letterSpacing));
    add('color', f.color);
    if (f.align !== 'left') add('text-align', f.align);
    add('white-space', 'pre-wrap');
    add('overflow-wrap', 'break-word');
  }
  if (node.type === 'image') {
    add('display', 'block');
    add('object-fit', node.fit);
  }
  return out;
}

/** kebab-case declarations to a React style object. */
export function toReactStyle(decls: Declarations): Record<string, string> {
  const style: Record<string, string> = {};
  for (const [p, v] of decls) {
    style[p.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return style;
}
