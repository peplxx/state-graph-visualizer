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

function normalizeNode(raw: unknown): GraphNode {
  const n = raw as Record<string, unknown>;
  return {
    id: String(n.id),
    tasks: normalizeTasks(n.tasks),
    isInitial: Boolean(n.initial ?? n.isInitial ?? false),
  };
}

function normalizeEdge(raw: unknown, idx: number): GraphEdge {
  const e = raw as Record<string, unknown>;
  return {
    id:     e.id ? String(e.id) : `e${idx}`,
    source: String(e.source),
    target: String(e.target),
    type:   e.type === 'job-release' ? 'job-release' : 'normal',
    label:  e.label ? String(e.label) : undefined,
  };
}

function fromRaw(raw: Record<string, unknown>): GraphFile {
  return {
    system: raw.system as GraphFile['system'],
    nodes:  ((raw.nodes ?? []) as unknown[]).map(normalizeNode),
    edges:  ((raw.edges ?? []) as unknown[]).map(normalizeEdge),
    layout: raw.layout as GraphFile['layout'],
  };
}

export function parseYAML(content: string): GraphFile {
  const raw = yaml.load(content) as Record<string, unknown>;
  return fromRaw(raw);
}

export function parseJSON(content: string): GraphFile {
  const raw = JSON.parse(content) as Record<string, unknown>;
  return fromRaw(raw);
}

export function parseFile(content: string, filename: string): GraphFile {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'json') return parseJSON(content);
  return parseYAML(content);
}
