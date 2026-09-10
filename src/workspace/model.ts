import { findIdenticalGraph, DuplicateGraphError } from './graphIdentity';
import { normalizeLayoutName } from '../core/layoutConfig';
import { graphSchema, createExplorerState } from './explorerState';
import { parseFile, serializeToYAML } from '../core/parser';
import type { GraphFile } from '../types/graph';
import { windowRegistry, getWindowDefinition } from './registry';
import type { Workspace, WindowKind, WindowTab } from './types';

export function emptyWorkspace(): Workspace {
	return {
		version: 2,
		graphs: [],
		tabs: [],
		activeId: null,
		nextExplorer: 1
	};
}
export function addWindow(workspace: Workspace, kind: WindowKind): Workspace {
	const tab = {
		id: crypto.randomUUID(),
		kind,
		title: `${windowRegistry[kind].label} ${workspace.nextExplorer}`,
		customTitle: false,
		state: getWindowDefinition(kind).create()
	} as WindowTab;
	return {
		...workspace,
		tabs: [...workspace.tabs, tab],
		activeId: tab.id,
		nextExplorer: workspace.nextExplorer + 1
	};
}
export function closeWindow(workspace: Workspace, id: string): Workspace {
	const index = workspace.tabs.findIndex((tab) => tab.id === id);
	if (index < 0) return workspace;
	const activeId =
		workspace.activeId === id
			? (workspace.tabs[index + 1]?.id ??
				workspace.tabs[index - 1]?.id ??
				null)
			: workspace.activeId;
	return {
		...workspace,
		tabs: workspace.tabs.filter((tab) => tab.id !== id),
		activeId
	};
}
export function moveWindow(
	workspace: Workspace,
	from: string,
	to: string
): Workspace {
	const source = workspace.tabs.findIndex((tab) => tab.id === from);
	const target = workspace.tabs.findIndex((tab) => tab.id === to);
	if (source < 0 || target < 0 || source === target) return workspace;
	const tabs = [...workspace.tabs];
	tabs.splice(target, 0, tabs.splice(source, 1)[0]);
	return { ...workspace, tabs };
}
export function restoreWorkspace(value: unknown): {
	workspace: Workspace;
	warnings: string[];
} {
	if (value === undefined)
		return { workspace: emptyWorkspace(), warnings: [] };
	const raw = value as Record<string, unknown>;
	if (
		!raw ||
		(raw.version !== 1 && raw.version !== 2) ||
		!Array.isArray(raw.tabs)
	)
		throw new Error(
			'Unsupported or damaged workspace. Stored data has not been overwritten.'
		);
	const tabs: WindowTab[] = [];
	const graphs: Workspace['graphs'] = [];
	const warnings: string[] = [];
	if (raw.version === 2 && Array.isArray(raw.graphs)) {
		for (const item of raw.graphs) {
			try {
				if (
					!item ||
					typeof item.id !== 'string' ||
					!item.id ||
					typeof item.filename !== 'string' ||
					graphs.some((g) => g.id === item.id)
				)
					throw new Error();
				graphs.push({
					id: item.id,
					filename: item.filename,
					graph: graphSchema.parse(item.graph)
				});
			} catch {
				warnings.push(
					'Could not restore a loaded graph. Other graphs are available.'
				);
			}
		}
	}
	for (const item of raw.tabs) {
		try {
			if (
				!item ||
				typeof item.id !== 'string' ||
				!item.id ||
				tabs.some((tab) => tab.id === item.id) ||
				!Object.prototype.hasOwnProperty.call(
					windowRegistry,
					item.kind
				) ||
				typeof item.title !== 'string' ||
				!item.title.trim() ||
				typeof item.customTitle !== 'boolean'
			)
				throw new Error();
			const kind = item.kind as WindowKind;
			tabs.push({
				id: item.id,
				...(typeof item.graphId === 'string'
					? { graphId: item.graphId }
					: {}),
				kind,
				title: item.title,
				customTitle: item.customTitle,
				state: getWindowDefinition(kind).validate(item.state)
			} as WindowTab);
		} catch {
			warnings.push(
				`Could not restore a tab${typeof item?.title === 'string' ? `: ${item.title}` : ''}. Other tabs are available.`
			);
		}
	}
	for (const tab of tabs) {
		if (
			tab.kind === 'explorer' &&
			tab.state.graphData &&
			!graphs.some((g) => g.id === tab.graphId)
		) {
			tab.graphId = crypto.randomUUID();
			let graph = tab.state.graphData;
			try {
				if (tab.state.baselineYaml)
					graph = parseFile(tab.state.baselineYaml);
			} catch {
				/* Keep the recoverable graph. */
			}
			graphs.push({
				id: tab.graphId,
				filename: tab.state.filename,
				graph
			});
		}
	}
	return {
		workspace: {
			version: 2,
			graphs,
			tabs,
			activeId:
				raw.activeId === null
					? null
					: tabs.some((tab) => tab.id === raw.activeId)
						? (raw.activeId as string)
						: (tabs[0]?.id ?? null),
			nextExplorer:
				typeof raw.nextExplorer === 'number' &&
				Number.isSafeInteger(raw.nextExplorer)
					? Math.max(raw.nextExplorer, tabs.length + 1)
					: tabs.length + 1
		},
		warnings
	};
}

export function importGraph(
	workspace: Workspace,
	graph: GraphFile,
	filename: string
): Workspace {
	const existing = findIdenticalGraph(workspace.graphs, graph);
	if (existing) throw new DuplicateGraphError(existing);
	return {
		...workspace,
		graphs: [
			...workspace.graphs,
			{ id: crypto.randomUUID(), filename, graph }
		]
	};
}
export function openGraph(workspace: Workspace, graphId: string): Workspace {
	const graph = workspace.graphs.find((g) => g.id === graphId);
	if (!graph) return workspace;
	const existing = workspace.tabs.find((t) => t.graphId === graphId);
	if (existing) return { ...workspace, activeId: existing.id };
	const next = addWindow(workspace, 'explorer');
	const tab = next.tabs[next.tabs.length - 1];
	tab.graphId = graphId;
	tab.title = graph.filename;
	tab.state = {
		...createExplorerState(),
		graphData: graph.graph,
		filename: graph.filename,
		baselineYaml: serializeToYAML(graph.graph),
		layout: normalizeLayoutName(graph.graph.layout?.algorithm)
	};
	return next;
}

export function unloadGraph(workspace: Workspace, graphId: string): Workspace {
	let next = workspace;
	for (const tab of workspace.tabs) {
		if (tab.graphId === graphId) next = closeWindow(next, tab.id);
	}
	return {
		...next,
		graphs: next.graphs.filter((graph) => graph.id !== graphId)
	};
}
