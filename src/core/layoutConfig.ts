export type LayoutName = 'dagre' | 'fcose' | 'breadthfirst' | 'grid';

export function buildLayoutOptions(
  name: LayoutName,
  nodeCount: number,
  overrides?: Record<string, unknown>
): any {
  const sf = nodeCount > 5000 ? 0.55 : nodeCount > 1000 ? 0.75 : 1.0;

  const bases: Record<LayoutName, Record<string, unknown>> = {
    dagre: {
      name:    'dagre',
      rankDir: 'TB',
      ranker:  'longest-path',
      rankSep: 80 * sf,
      nodeSep: 52 * sf,
      edgeSep: 10,
      animate: false,
      // extra left padding so release arcs don't overlap nodes
      padding: 120,
    },
    fcose: {
      name:           'fcose',
      quality:        nodeCount > 2000 ? 'draft' : 'default',
      randomize:      false,
      animate:        false,
      padding:        80,
      nodeSeparation: 75 * sf,
      idealEdgeLength: 120 * sf,
      numIter:        nodeCount > 5000 ? 800 : 2500,
      tile:           true,
    },
    breadthfirst: {
      name:          'breadthfirst',
      directed:      true,
      animate:       false,
      spacingFactor: sf,
      padding:       80,
      avoidOverlap:  true,
      maximal:       true,
    },
    grid: {
      name:          'grid',
      animate:       false,
      padding:       80,
      spacingFactor: sf,
      avoidOverlap:  true,
    },
  };

  return { ...bases[name], ...(overrides ?? {}) };
}
