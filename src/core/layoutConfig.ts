export type LayoutName = 'dagre';

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
    }
  };

  return { ...bases[name], ...(overrides ?? {}) };
}
