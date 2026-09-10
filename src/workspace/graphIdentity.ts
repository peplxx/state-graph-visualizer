import { load } from 'js-yaml';
import { serializeToYAML } from '../core/parser';
import type { GraphFile } from '../types/graph';
import type { LibraryGraph } from './types';

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object')
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
			.join(',')}}`;
	return JSON.stringify(value) ?? 'null';
}

// Compare documents, not filenames or YAML whitespace. Task order remains significant.
export function graphIdentity(graph: GraphFile): string {
	const document = load(serializeToYAML(graph)) as {
		nodes: { children: string[]; loopback: string[] }[];
		areas?: { nodes: string[] }[];
	};
	for (const node of document.nodes) {
		node.children.sort();
		node.loopback.sort();
	}
	document.nodes.sort((a, b) => canonical(a).localeCompare(canonical(b)));
	for (const area of document.areas ?? []) area.nodes.sort();
	document.areas?.sort((a, b) => canonical(a).localeCompare(canonical(b)));
	return canonical(document);
}
export function findIdenticalGraph(
	graphs: LibraryGraph[],
	graph: GraphFile
): LibraryGraph | undefined {
	const identity = graphIdentity(graph);
	return graphs.find((item) => graphIdentity(item.graph) === identity);
}
export class DuplicateGraphError extends Error {
	constructor(public readonly existing: LibraryGraph) {
		super(
			`This graph is already in your library as “${existing.filename}”.`
		);
		this.name = 'DuplicateGraphError';
	}
}
