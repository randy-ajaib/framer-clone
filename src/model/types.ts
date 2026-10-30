// The document format. Everything in the editor reads and writes this shape;
// the canvas and the exporter are both pure functions of it.

export type NodeId = string;
export type NodeType = 'frame' | 'text' | 'image' | 'rect';

export type Size =
  | { mode: 'fixed'; value: number }
  | { mode: 'fill' }
  | { mode: 'fit' };

export type ShadowPreset = 'none' | 'sm' | 'md' | 'lg';
export type FontFamily = 'Lato' | 'Georgia' | 'system-ui' | 'Courier New';

export interface Border {
  width: number;
  color: string;
  style: 'solid' | 'dashed';
}

export interface Font {
  family: FontFamily;
  size: number;
  weight: 400 | 600 | 700;
  lineHeight: number; // multiplier, e.g. 1.4
  letterSpacing: number; // px
  color: string;
  align: 'left' | 'center' | 'right';
}

export interface Style {
  fill: string | null;
  opacity: number; // 0..1
  border: Border | null;
  radius: number;
  shadow: ShadowPreset;
}

export interface Layout {
  mode: 'none' | 'stack';
  direction: 'row' | 'column';
  gap: number;
  padding: [number, number, number, number]; // top, right, bottom, left
  align: 'start' | 'center' | 'end' | 'stretch';
  distribute: 'start' | 'center' | 'end' | 'space-between';
  wrap: boolean;
}

interface BaseNode {
  id: NodeId;
  type: NodeType;
  name: string;
  parentId: NodeId | null;
  hidden: boolean;
  locked: boolean;
  /** flow = placed by the parent stack; absolute = placed at x/y inside the parent */
  position: 'flow' | 'absolute';
  x: number;
  y: number;
  width: Size;
  height: Size;
  minWidth: number | null;
  maxWidth: number | null;
  style: Style;
}

export interface FrameNode extends BaseNode {
  type: 'frame';
  children: NodeId[];
  layout: Layout;
  clip: boolean;
}

export interface TextNode extends BaseNode {
  type: 'text';
  text: string;
  tag: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  font: Font;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  assetId: string | null;
  alt: string;
  fit: 'cover' | 'contain';
}

export interface RectNode extends BaseNode {
  type: 'rect';
}

export type Node = FrameNode | TextNode | ImageNode | RectNode;

export interface Asset {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
}

export interface Document {
  version: 1;
  title: string;
  rootId: NodeId;
  nodes: Record<NodeId, Node>;
  assets: Record<string, Asset>;
}
