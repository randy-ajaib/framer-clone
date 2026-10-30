import { describe, expect, test } from 'bun:test';
import { nodeCss } from './css';
import { exportSite } from './export';
import { blankDocument, buildTree, createNode, sampleDocument } from './factory';
import * as ops from './ops';
import { subtree } from './tree';
import type { FrameNode, TextNode } from './types';

const css = (decls: [string, string][]) => Object.fromEntries(decls);

describe('nodeCss', () => {
  test('fill along a row stack becomes flex: 1 with min-width 0', () => {
    const doc = blankDocument();
    const root = doc.nodes[doc.rootId] as FrameNode;
    root.layout.direction = 'row';
    const child = createNode('rect');
    child.width = { mode: 'fill' };
    ops.insertNode(doc, child, root.id);
    const c = css(nodeCss(child, root));
    expect(c.flex).toBe('1 1 0');
    expect(c['min-width']).toBe('0');
  });

  test('fill across a column stack stretches', () => {
    const doc = blankDocument();
    const root = doc.nodes[doc.rootId] as FrameNode;
    const child = createNode('rect');
    child.width = { mode: 'fill' };
    ops.insertNode(doc, child, root.id);
    expect(css(nodeCss(child, root))['align-self']).toBe('stretch');
  });

  test('children of a frame without layout are absolutely placed', () => {
    const doc = blankDocument();
    const root = doc.nodes[doc.rootId] as FrameNode;
    root.layout.mode = 'none';
    const child = createNode('rect');
    child.x = 12;
    child.y = 30;
    ops.insertNode(doc, child, root.id);
    const c = css(nodeCss(child, root));
    expect(c.position).toBe('absolute');
    expect(c.left).toBe('12px');
    expect(c.top).toBe('30px');
  });
});

describe('exportSite', () => {
  test('writes one unique class per visible node and skips hidden ones', () => {
    const doc = sampleDocument();
    const anyText = Object.values(doc.nodes).find((n) => n.name === 'Eyebrow') as TextNode;
    anyText.hidden = true;
    const { html, css: out } = exportSite(doc, { mode: 'files' });
    expect(html).not.toContain(anyText.text);
    const classes = [...html.matchAll(/class="([^" ]+)/g)].map((m) => m[1]);
    expect(new Set(classes).size).toBe(classes.length);
    for (const c of classes) expect(out).toContain(`.${c} {`);
  });

  test('escapes text and writes images as files', () => {
    const doc = sampleDocument();
    const t = Object.values(doc.nodes).find((n) => n.type === 'text') as TextNode;
    t.text = '<script>alert(1)</script> & co';
    const { html, images, fontFiles } = exportSite(doc, { mode: 'files' });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(Object.keys(images)).toEqual(['images/hero-art.svg']);
    expect(html).toContain('src="images/hero-art.svg"');
    expect(fontFiles).toContain('Lato-Bold.ttf');
  });
});

describe('ops', () => {
  test('moveNode reorders within a stack and refuses moving a frame into itself', () => {
    const doc = blankDocument();
    const nodes = doc.nodes;
    const wrapId = buildTree({ type: 'frame', children: [{ type: 'rect' }, { type: 'text' }] }, nodes, doc.rootId);
    (nodes[doc.rootId] as FrameNode).children.push(wrapId);
    const wrap = nodes[wrapId] as FrameNode;
    const [a, b] = wrap.children;
    expect(ops.moveNode(doc, a, wrapId, 1)).toBe(true);
    expect(wrap.children).toEqual([b, a]);
    expect(ops.moveNode(doc, wrapId, wrapId, 0)).toBe(false);
  });

  test('duplicate copies a subtree with fresh ids', () => {
    const doc = sampleDocument();
    const root = doc.nodes[doc.rootId] as FrameNode;
    const hero = root.children[1];
    const before = Object.keys(doc.nodes).length;
    const size = subtree(doc, hero).length;
    const [copy] = ops.duplicateNodes(doc, [hero]);
    expect(copy).not.toBe(hero);
    expect(root.children[2]).toBe(copy);
    expect(Object.keys(doc.nodes).length).toBe(before + size);
  });

  test('groupIntoStack wraps siblings in order', () => {
    const doc = sampleDocument();
    const root = doc.nodes[doc.rootId] as FrameNode;
    const [nav, hero] = root.children;
    const g = ops.groupIntoStack(doc, [hero, nav])!;
    expect(root.children[0]).toBe(g);
    expect((doc.nodes[g] as FrameNode).children).toEqual([nav, hero]);
  });

  test('removeNodes deletes the subtree', () => {
    const doc = sampleDocument();
    const root = doc.nodes[doc.rootId] as FrameNode;
    const hero = root.children[1];
    ops.removeNodes(doc, [hero]);
    expect(root.children).not.toContain(hero);
    expect(Object.values(doc.nodes).some((n) => n.parentId === hero)).toBe(false);
  });
});

