import type { StylesheetStyle } from 'cytoscape';

export const stylesheet: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'shape':            'round-rectangle',
      'background-color': '#FFFFFF',
      'border-color':     '#1A1A1A',
      'border-width':     1.8,
      'label':            'data(label)',
      'text-valign':      'center',
      'text-halign':      'center',
      'font-family':      '"JetBrains Mono", "Fira Mono", monospace',
      'font-size':        '11px',
      'color':            '#1A1A1A',
      'text-wrap':        'wrap',
      'width':            'data(width)',
      'height':           'data(height)',
      'opacity':          1,
      'z-index':          1,
    },
  },
  {
    selector: 'node[?isInitial]',
    style: {
      'border-width': 3,
      'border-color': '#000000',
    },
  },
  {
    selector: 'node.dimmed',
    style: {
      'opacity':          0.15,
      'background-color': '#FFFFFF',
      'border-color':     '#AAAAAA',
      'color':            '#AAAAAA',
    },
  },
  {
    selector: 'node.selected-node',
    style: {
      'background-color': '#F0F0F0',
      'border-color':     '#000000',
      'border-width':     2.8,
      'opacity':          1,
      'z-index':          10,
    },
  },
  {
    selector: 'node.neighbour',
    style: { 'opacity': 1, 'z-index': 5 },
  },
  {
    selector: 'edge[type = "normal"]',
    style: {
      'curve-style':        'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#2C2C2C',
      'line-color':         '#2C2C2C',
      'width':              1.4,
      'arrow-scale':        0.85,
      'opacity':            1,
      'z-index':            2,
    },
  },
  {
    // Base style only — control points set dynamically in routeReleaseArcs()
    selector: 'edge[type = "job-release"]',
    style: {
      'curve-style':        'unbundled-bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#C0392B',
      'line-color':         '#C0392B',
      'line-style':         'dashed',
      'line-dash-pattern':  [8, 5],
      'width':              1.5,
      'arrow-scale':        0.85,
      'opacity':            0.85,
      'z-index':            1,
    },
  },
  {
    selector: 'edge.dimmed',
    style: { 'opacity': 0.06 },
  },
  {
    selector: 'edge.neighbour',
    style: { 'opacity': 1, 'width': 2, 'z-index': 5 },
  },
];
