'use strict';

const assert = require('node:assert/strict');

function text(value) {
  return { nodeType: 3, nodeName: '#text', nodeValue: value, parentElement: null };
}

function element(tagName, children, dataset, innerText) {
  const el = {
    nodeType: 1,
    nodeName: String(tagName || 'div').toUpperCase(),
    tagName: String(tagName || 'div').toUpperCase(),
    dataset: dataset || {},
    children: children || [],
    parentElement: null,
  };
  el.children.forEach(function (child) { child.parentElement = el; });
  if (innerText !== undefined) el.innerText = innerText;
  return el;
}

global.NodeFilter = { SHOW_TEXT: 4 };
global.document = {
  createTreeWalker: function (root) {
    const nodes = [];
    function visit(node) {
      if (!node) return;
      if (node.nodeType === 3) { nodes.push(node); return; }
      (node.children || []).forEach(visit);
    }
    visit(root);
    let index = 0;
    return { nextNode: function () { return nodes[index++] || null; } };
  },
};

require('../assets/richtext.js');
const RichText = global.RelatumRichText;

function extract(root) {
  return RichText.extractEditable(root);
}

// Enter may arrive as a carriage return text node. Persist one canonical \n.
{
  const root = element('div', [text('123\r456')], {}, '123\r456');
  assert.deepEqual(extract(root), { text: '123\n456', marks: [] });
}

// Browser-created block lines must not throw and must retain their visible boundary.
{
  const secondLine = element('div', [text('456')]);
  const root = element('div', [text('123'), secondLine], {}, '123\n456');
  assert.deepEqual(extract(root), { text: '123\n456', marks: [] });
}

// <br> contributes a visible line break through innerText even though it has no text node.
{
  const root = element('div', [text('123'), element('br'), text('456')], {}, '123\n456');
  assert.deepEqual(extract(root), { text: '123\n456', marks: [] });
}

// Rich runs on either side of a generated line break keep correct offsets and palettes.
{
  const first = element('span', [text('same')], { rtBold: '1' });
  const second = element('span', [text('same')], { rtColor: 'red', rtHighlight: 'yellow' });
  const block = element('div', [second]);
  const root = element('div', [first, block], {}, 'same\nsame');
  assert.deepEqual(extract(root), {
    text: 'same\nsame',
    marks: [
      { start: 0, end: 4, bold: true },
      { start: 5, end: 9, color: 'red', highlight: 'yellow' },
    ],
  });
}

// DOM-only text omitted from innerText must not shift its style onto visible content.
{
  const hidden = element('span', [text('hidden')], { rtColor: 'red' });
  const visible = element('span', [text('visible')], { rtBold: '1' });
  const root = element('div', [hidden, visible], {}, 'visible');
  assert.deepEqual(extract(root), {
    text: 'visible',
    marks: [{ start: 0, end: 7, bold: true }],
  });
}

console.log('richtext regression tests passed');
