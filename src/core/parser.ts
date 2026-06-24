import * as yaml from 'js-yaml';
import type {
  GraphFile,
  GraphNode,
  GraphEdge,
  NodeTaskDisplay,
  ReleaseIndicator,
} from '../types/graph';

function parseRelease(val: unknown): ReleaseIndicator {
  if (val === 'up'   || val === '↑' || val === 1)  return 'up';
  if (val === 'down' || val === '↓' || val === -1) return 'down';
  return 'none';
}

function normalizeTasks(raw: unknown): NodeTaskDisplay[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((t) => ({
    task: { c: Number(t.c ?? 0), d: Number(t.d ?? 0) },
    release: parseRelease(t.release),
  }));
}

export function parseYAML(content: string): GraphFile {
  const raw = yaml.load(content) as Record<string, any>;
  
  if (!raw || !Array.isArray(raw.nodes)) {
    return { nodes: [], edges: [] };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let edgeIdx = 0;

  for (const rawNode of raw.nodes) {
    const id = String(rawNode.id);
    
    // 1. Normalize node
    nodes.push({
      id,
      tasks: normalizeTasks(rawNode.tasks),
      isInitial: Boolean(rawNode.initial ?? rawNode.isInitial ?? false),
    });

    // 2. Process childrens 
    if (Array.isArray(rawNode.childrens)) {
      for (const targetId of rawNode.childrens) {
        edges.push({
          id: `e${edgeIdx++}`,
          source: id,
          target: String(targetId),
          type: 'normal',
        });
      }
    }

    // 3. Process loops
    if (Array.isArray(rawNode.loop)) {
      for (const targetId of rawNode.loop) {
        edges.push({
          id: `e${edgeIdx++}`,
          source: id,
          target: String(targetId),
          type: 'loop',
        });
      }
    }
  }

  return {
    system: raw.system as GraphFile['system'],
    nodes,
    edges,
    layout: (raw.layout || 'dagre') as GraphFile['layout'],
  };
}

export function parseFile(content: string): GraphFile {
  return parseYAML(content);
}