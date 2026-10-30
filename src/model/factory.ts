import type {
  Document,
  Font,
  FrameNode,
  ImageNode,
  Layout,
  Node,
  NodeId,
  NodeType,
  RectNode,
  Style,
  TextNode,
} from './types';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const defaultStyle = (): Style => ({
  fill: null,
  opacity: 1,
  border: null,
  radius: 0,
  shadow: 'none',
});

export const defaultLayout = (): Layout => ({
  mode: 'stack',
  direction: 'column',
  gap: 16,
  padding: [24, 24, 24, 24],
  align: 'start',
  distribute: 'start',
  wrap: false,
});

export const defaultFont = (): Font => ({
  family: 'Lato',
  size: 18,
  weight: 400,
  lineHeight: 1.5,
  letterSpacing: 0,
  color: '#111111',
  align: 'left',
});

function base(type: NodeType, name: string) {
  return {
    id: uid(),
    type,
    name,
    parentId: null as NodeId | null,
    hidden: false,
    locked: false,
    position: 'flow' as const,
    x: 0,
    y: 0,
    minWidth: null,
    maxWidth: null,
    style: defaultStyle(),
  };
}

export function createNode(type: NodeType): Node {
  switch (type) {
    case 'frame': {
      const n: FrameNode = {
        ...base('frame', 'Frame'),
        type: 'frame',
        width: { mode: 'fixed', value: 320 },
        height: { mode: 'fit' },
        children: [],
        layout: defaultLayout(),
        clip: false,
      };
      n.style.fill = '#eef3fd';
      n.style.radius = 12;
      return n;
    }
    case 'text': {
      const n: TextNode = {
        ...base('text', 'Text'),
        type: 'text',
        width: { mode: 'fit' },
        height: { mode: 'fit' },
        text: 'Write something',
        tag: 'p',
        font: defaultFont(),
      };
      return n;
    }
    case 'image': {
      const n: ImageNode = {
        ...base('image', 'Image'),
        type: 'image',
        width: { mode: 'fixed', value: 320 },
        height: { mode: 'fixed', value: 220 },
        assetId: null,
        alt: '',
        fit: 'cover',
      };
      n.style.radius = 8;
      return n;
    }
    case 'rect': {
      const n: RectNode = {
        ...base('rect', 'Rectangle'),
        type: 'rect',
        width: { mode: 'fixed', value: 160 },
        height: { mode: 'fixed', value: 120 },
      };
      n.style.fill = '#c9d9f7';
      return n;
    }
  }
}

// ---- Declarative builder, used for the sample page and tests ----

type Spec =
  | ({ type: 'frame'; children?: Spec[] } & Partial<Omit<FrameNode, 'type' | 'children' | 'layout'>> & {
        layout?: Partial<Layout>;
      })
  | ({ type: 'text' } & Partial<Omit<TextNode, 'type' | 'font'>> & { font?: Partial<Font> })
  | ({ type: 'image' } & Partial<Omit<ImageNode, 'type'>>)
  | ({ type: 'rect' } & Partial<Omit<RectNode, 'type'>>);

export function buildTree(spec: Spec, nodes: Record<NodeId, Node>, parentId: NodeId | null): NodeId {
  const node = createNode(spec.type);
  const { children, ...rest } = spec as Spec & { children?: Spec[] };
  // Specs start from a plain style, not the tinted defaults a newly drawn frame gets.
  const merged = { ...node, ...rest, style: { ...defaultStyle(), ...(rest.style ?? {}) } } as Node;
  if (merged.type === 'frame' && 'layout' in rest && rest.layout) {
    merged.layout = { ...defaultLayout(), ...rest.layout };
  }
  if (merged.type === 'text' && 'font' in rest && rest.font) {
    merged.font = { ...defaultFont(), ...rest.font };
  }
  merged.id = node.id;
  merged.parentId = parentId;
  nodes[merged.id] = merged;
  if (merged.type === 'frame') {
    merged.children = (children ?? []).map((c) => buildTree(c, nodes, merged.id));
  }
  return merged.id;
}

export function blankDocument(): Document {
  const nodes: Record<NodeId, Node> = {};
  const rootId = buildTree(
    {
      type: 'frame',
      name: 'Page',
      width: { mode: 'fill' },
      height: { mode: 'fit' },
      style: { ...defaultStyle(), fill: '#ffffff' },
      layout: { gap: 0, padding: [0, 0, 0, 0], align: 'stretch' },
    },
    nodes,
    null,
  );
  return { version: 1, title: 'Untitled page', rootId, nodes, assets: {} };
}

const heroArt =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#1d2b4f"/><circle cx="560" cy="210" r="170" fill="#3278f0"/><circle cx="300" cy="380" r="220" fill="#f2b84b" opacity=".92"/><circle cx="640" cy="470" r="90" fill="#bdd5ff"/><rect x="90" y="90" width="170" height="10" rx="5" fill="#bdd5ff"/><rect x="90" y="116" width="110" height="10" rx="5" fill="#bdd5ff" opacity=".6"/></svg>`,
  );

const h = (text: string, size: number, color = '#111111', align: 'left' | 'center' = 'left'): Spec =>
  ({
    type: 'text',
    text,
    tag: size >= 40 ? 'h1' : size >= 28 ? 'h2' : 'h3',
    name: text.split(' ').slice(0, 3).join(' '),
    width: { mode: 'fill' },
    font: { size, weight: 700, lineHeight: 1.15, color, align, letterSpacing: size >= 40 ? -1 : 0 },
  });

const p = (text: string, color = '#4a4f5c', size = 18, align: 'left' | 'center' = 'left'): Spec =>
  ({
    type: 'text',
    text,
    tag: 'p',
    name: 'Body',
    width: { mode: 'fill' },
    font: { size, color, align, lineHeight: 1.55 },
  });

const button = (label: string, primary: boolean): Spec =>
  ({
    type: 'frame',
    name: `Button ${label}`,
    width: { mode: 'fit' },
    height: { mode: 'fit' },
    layout: { direction: 'row', padding: [14, 24, 14, 24], gap: 8, align: 'center' },
    style: {
      ...defaultStyle(),
      fill: primary ? '#3278f0' : null,
      radius: 999,
      border: primary ? null : { width: 1, color: '#c5cad6', style: 'solid' },
    },
    children: [
      {
        type: 'text',
        text: label,
        tag: 'span',
        name: 'Label',
        font: { size: 16, weight: 600, color: primary ? '#ffffff' : '#111111', lineHeight: 1.2 },
      },
    ],
  });

const card = (title: string, body: string): Spec =>
  ({
    type: 'frame',
    name: `Card ${title}`,
    width: { mode: 'fill' },
    minWidth: 240,
    height: { mode: 'fit' },
    layout: { gap: 10, padding: [28, 28, 28, 28] },
    style: { ...defaultStyle(), fill: '#f4f6fa', radius: 16 },
    children: [h(title, 22), p(body, '#4a4f5c', 16)],
  });

/** A finished-looking landing page so the editor opens on something real. */
export function sampleDocument(): Document {
  const doc = blankDocument();
  doc.title = 'Ledger Lane (sample)';
  doc.assets['hero-art'] = { id: 'hero-art', name: 'hero-art.svg', mime: 'image/svg+xml', dataUrl: heroArt };
  const root = doc.nodes[doc.rootId] as FrameNode;
  const sections: Spec[] = [
    {
      type: 'frame',
      name: 'Nav',
      width: { mode: 'fill' },
      layout: { direction: 'row', padding: [20, 32, 20, 32], distribute: 'space-between', align: 'center', wrap: true },
      style: { ...defaultStyle(), border: { width: 1, color: '#e6e8ee', style: 'solid' } },
      children: [
        { type: 'text', name: 'Logo', text: 'Ledger Lane', tag: 'span', font: { size: 20, weight: 700, color: '#111111' } },
        button('Join the waitlist', true),
      ],
    },
    {
      type: 'frame',
      name: 'Hero',
      width: { mode: 'fill' },
      layout: { direction: 'row', wrap: true, gap: 48, padding: [80, 32, 80, 32], align: 'center' },
      children: [
        {
          type: 'frame',
          name: 'Hero copy',
          width: { mode: 'fill' },
          minWidth: 280,
          layout: { gap: 20, padding: [0, 0, 0, 0] },
          children: [
            {
              type: 'text',
              name: 'Eyebrow',
              text: 'PERSONAL FINANCE, WEEK BY WEEK',
              tag: 'span',
              font: { size: 13, weight: 700, color: '#2264d4', letterSpacing: 1.2 },
            },
            h('See where every rupiah went this week.', 52),
            p('Ledger Lane sorts your spending into plain categories every Sunday, so you can plan the next seven days in five minutes.'),
            {
              type: 'frame',
              name: 'Actions',
              width: { mode: 'fit' },
              layout: { direction: 'row', gap: 12, padding: [8, 0, 0, 0], wrap: true },
              children: [button('Join the waitlist', true), button('See a sample report', false)],
            },
          ],
        },
        {
          type: 'image',
          name: 'Hero image',
          assetId: 'hero-art',
          alt: 'Abstract illustration of overlapping circles',
          width: { mode: 'fill' },
          minWidth: 280,
          height: { mode: 'fixed', value: 420 },
          style: { ...defaultStyle(), radius: 24 },
        },
      ],
    },
    {
      type: 'frame',
      name: 'Features',
      width: { mode: 'fill' },
      layout: { direction: 'row', wrap: true, gap: 20, padding: [16, 32, 80, 32] },
      children: [
        card('Sunday summary', 'One page with last week by category, compared with the week before.'),
        card('Budgets that bend', 'Move money between categories mid-week without breaking the plan.'),
        card('Bills on a calendar', 'See which bills land before your next payday, with the amount due.'),
      ],
    },
    {
      type: 'frame',
      name: 'Call to action',
      width: { mode: 'fill' },
      layout: { gap: 16, padding: [80, 32, 80, 32], align: 'center' },
      style: { ...defaultStyle(), fill: '#1d2b4f' },
      children: [
        h('Start next week with a plan.', 36, '#ffffff', 'center'),
        p('Free while in beta. No bank login needed to try the sample.', '#bdd5ff', 18, 'center'),
        button('Join the waitlist', true),
      ],
    },
    {
      type: 'frame',
      name: 'Footer',
      width: { mode: 'fill' },
      layout: { direction: 'row', distribute: 'space-between', padding: [28, 32, 28, 32], wrap: true, gap: 12 },
      children: [
        { type: 'text', name: 'Copyright', text: '© 2026 Ledger Lane. Sample page.', tag: 'span', font: { size: 14, color: '#6b7080' } },
        { type: 'text', name: 'Contact', text: 'hello@ledgerlane.example', tag: 'span', font: { size: 14, color: '#6b7080' } },
      ],
    },
  ];
  root.children = sections.map((s) => buildTree(s, doc.nodes, root.id));
  return doc;
}
