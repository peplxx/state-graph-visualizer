import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	addWindow,
	importGraph,
	unloadGraph,
	openGraph,
	closeWindow,
	emptyWorkspace,
	moveWindow,
	restoreWorkspace
} from '../src/workspace/model';
import {
	createExplorerState,
	explorerDirty,
	explorerYaml
} from '../src/workspace/explorerState';
import { createWorkspaceWriter } from '../src/workspace/storage';
import { parseFile } from '../src/core/parser';

const loaded = () => {
	const state = createExplorerState();
	state.graphData = parseFile(
		readFileSync(
			new URL('../examples/gfp-m1-1-2-1-2.yaml', import.meta.url),
			'utf8'
		)
	);
	state.filename = 'same.yaml';
	state.baselineYaml = explorerYaml(state);
	return state;
};
const threeTabs = () =>
	Array.from({ length: 3 }).reduce<ReturnType<typeof emptyWorkspace>>(
		(w) => addWindow(w, 'explorer'),
		emptyWorkspace()
	);

describe('workspace lifecycle', () => {
	test('new windows have stable distinct identities and independent state', () => {
		const w = threeTabs();
		expect(w.tabs.map((t) => t.title)).toEqual([
			'Explorer 1',
			'Explorer 2',
			'Explorer 3'
		]);
		expect(new Set(w.tabs.map((t) => t.id)).size).toBe(3);
		expect(w.activeId).toBe(w.tabs[2].id);
		w.tabs[0].state.colorOverrides = new Map([['n0', { fill: '#ff0000' }]]);
		w.tabs[0].state.hiddenAreaIds.add('a');
		expect(w.tabs[1].state.colorOverrides.size).toBe(0);
		expect(w.tabs[1].state.hiddenAreaIds.size).toBe(0);
	});
	test('closing active selects right, then left, then the home screen', () => {
		let w = threeTabs();
		w.activeId = w.tabs[1].id;
		const right = w.tabs[2].id,
			left = w.tabs[0].id;
		w = closeWindow(w, w.activeId);
		expect(w.activeId).toBe(right);
		w = closeWindow(w, right);
		expect(w.activeId).toBe(left);
		w = closeWindow(w, left);
		expect(w.tabs).toEqual([]);
		expect(w.activeId).toBeNull();
		expect(addWindow(w, 'explorer').tabs[0].title).toBe('Explorer 4');
	});
	test('reorder preserves active identity and closing another tab keeps selection', () => {
		const w = threeTabs();
		const moved = moveWindow(w, w.tabs[2].id, w.tabs[0].id);
		expect(moved.tabs.map((t) => t.id)).toEqual([
			w.tabs[2].id,
			w.tabs[0].id,
			w.tabs[1].id
		]);
		expect(moved.activeId).toBe(w.activeId);
		expect(closeWindow(moved, w.tabs[0].id).activeId).toBe(w.activeId);
		expect(moveWindow(w, 'missing', w.tabs[0].id)).toBe(w);
	});
});

describe('document and restoration', () => {
	test('view changes are clean; document edits stay dirty after local recovery', () => {
		const state = loaded();
		expect(explorerDirty(state)).toBe(false);
		Object.assign(state, {
			view: { x: 77, y: -24, k: 0.6 },
			showLegend: true,
			showDeadlines: false,
			sidebarWidth: 410,
			appearanceOpen: true,
			selectedIds: ['n0']
		});
		expect(explorerDirty(state)).toBe(false);
		state.colorOverrides = new Map([['n0', { fill: '#ff0000' }]]);
		expect(explorerDirty(state)).toBe(true);
		const w = addWindow(emptyWorkspace(), 'explorer');
		w.tabs[0].state = state;
		const restored = restoreWorkspace(structuredClone(w)).workspace.tabs[0]
			.state;
		expect(restored).toEqual(state);
		expect(explorerDirty(restored)).toBe(true);
		restored.baselineYaml = explorerYaml(restored);
		expect(explorerDirty(restored)).toBe(false);
	});
	test('duplicate filenames, custom titles, areas and tab order survive structured storage', () => {
		const w = threeTabs();
		w.tabs[0].state = loaded();
		w.tabs[1].state = loaded();
		w.tabs[0].title = 'Custom title';
		w.tabs[0].customTitle = true;
		w.tabs[0].state.graphData!.areas = [
			{ id: 'area', nodeIds: ['n0'], label: 'Region' }
		];
		w.tabs[0].state.areaOverrides.set('area', {
			fill: '#ffeeee',
			nodes: ['n0'],
			labelPosition: 'top-left'
		});
		w.tabs[0].state.selectedAreaId = 'area';
		const reordered = moveWindow(w, w.tabs[0].id, w.tabs[2].id);
		const normalized = restoreWorkspace(
			structuredClone(reordered)
		).workspace;
		expect(restoreWorkspace(structuredClone(normalized)).workspace).toEqual(
			normalized
		);
		expect(normalized.tabs.map((t) => t.state)).toEqual(
			reordered.tabs.map((t) => t.state)
		);
	});
	test('corrupt or unknown tabs cannot prevent valid tabs from restoring', () => {
		const w = threeTabs();
		const raw = structuredClone(w);
		raw.tabs[0].state.view = { x: 0, y: 0, k: NaN };
		const result = restoreWorkspace({
			...raw,
			tabs: [
				raw.tabs[0],
				{ ...raw.tabs[1], kind: 'unknown' },
				raw.tabs[2],
				null
			]
		});
		expect(result.workspace.tabs.map((t) => t.id)).toEqual([w.tabs[2].id]);
		expect(result.warnings).toHaveLength(3);
		expect(result.workspace.activeId).toBe(w.tabs[2].id);
		expect(() => restoreWorkspace({ version: 99, tabs: [] })).toThrow();
		expect(restoreWorkspace(undefined).workspace).toEqual(emptyWorkspace());
	});
});

describe('ordered local saves', () => {
	test('in-flight writes finish before the latest snapshot, coalescing stale pending writes', async () => {
		const writes: number[] = [];
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const writer = createWorkspaceWriter(
			async (w) => {
				writes.push(w.nextExplorer);
				if (writes.length === 1) await blocked;
			},
			() => {
				throw new Error('unexpected failure');
			}
		);
		writer.push({ ...emptyWorkspace(), nextExplorer: 1 }, true);
		writer.push({ ...emptyWorkspace(), nextExplorer: 2 }, true);
		writer.push({ ...emptyWorkspace(), nextExplorer: 3 }, true);
		expect(writes).toEqual([1]);
		release();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(writes).toEqual([1, 3]);
		writer.dispose();
	});
	test('debounced view updates flush latest on disposal; storage errors permit later saves', async () => {
		const writes: number[] = [];
		const errors: unknown[] = [];
		const writer = createWorkspaceWriter(
			async (w) => {
				writes.push(w.nextExplorer);
				if (w.nextExplorer === 2) throw new Error('quota');
			},
			(e) => errors.push(e)
		);
		writer.push({ ...emptyWorkspace(), nextExplorer: 1 });
		writer.push({ ...emptyWorkspace(), nextExplorer: 2 });
		expect(writes).toEqual([]);
		await writer.flush();
		expect(writes).toEqual([2]);
		expect(errors).toHaveLength(1);
		writer.push({ ...emptyWorkspace(), nextExplorer: 3 });
		writer.dispose();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(writes).toEqual([2, 3]);
	});
});

test('unavailable IndexedDB surfaces a recoverable error without altering in-memory work', async () => {
	const { readWorkspace } = await import('../src/workspace/storage');
	const before = threeTabs();
	const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
	Object.defineProperty(globalThis, 'indexedDB', {
		configurable: true,
		value: {
			open() {
				throw new Error('Storage denied');
			}
		}
	});
	try {
		await expect(readWorkspace()).rejects.toThrow('Storage denied');
		expect(before.tabs).toHaveLength(3);
		expect(addWindow(before, 'explorer').tabs).toHaveLength(4);
	} finally {
		if (original) Object.defineProperty(globalThis, 'indexedDB', original);
		else Reflect.deleteProperty(globalThis, 'indexedDB');
	}
});

describe('loaded graph library', () => {
	test('imports do not open windows; closed Explorers leave their graph available', () => {
		let w = importGraph(emptyWorkspace(), loaded().graphData!, 'same.yaml');
		expect(w.tabs).toHaveLength(0);
		const id = w.graphs[0].id;
		w = openGraph(w, id);
		const tabId = w.activeId!;
		expect(w.tabs[0].graphId).toBe(id);
		expect(openGraph(w, id).tabs).toHaveLength(1);
		w = closeWindow(w, tabId);
		expect(w.graphs).toHaveLength(1);
		const restored = restoreWorkspace(structuredClone(w)).workspace;
		expect(openGraph(restored, id).tabs[0].state.graphData).toEqual(
			w.graphs[0].graph
		);
	});
	test('identical filenames have independent identities and matching Explorers', () => {
		let w = importGraph(emptyWorkspace(), loaded().graphData!, 'same.yaml');
		const different = loaded().graphData!;
		different.nodes[0].fillColor = '#ff0000';
		w = importGraph(w, different, 'same.yaml');
		w = openGraph(openGraph(w, w.graphs[0].id), w.graphs[1].id);
		expect(w.tabs).toHaveLength(2);
		expect(w.tabs[0].graphId).not.toBe(w.tabs[1].graphId);
		expect(openGraph(w, w.graphs[0].id).activeId).toBe(w.tabs[0].id);
	});
	test('version 1 migrates graph library without losing unsaved overrides or view', () => {
		const old = addWindow(emptyWorkspace(), 'explorer');
		old.tabs[0].state = loaded();
		old.tabs[0].state.colorOverrides = new Map([
			['n0', { fill: '#ff0000' }]
		]);
		old.tabs[0].state.view = { x: 23, y: 41, k: 1.3 };
		const migrated = restoreWorkspace({
			...old,
			version: 1,
			graphs: undefined
		}).workspace;
		expect(migrated.version).toBe(2);
		expect(migrated.graphs).toHaveLength(1);
		expect(migrated.tabs[0].graphId).toBe(migrated.graphs[0].id);
		expect(migrated.tabs[0].state).toEqual(old.tabs[0].state);
		expect(explorerDirty(migrated.tabs[0].state)).toBe(true);
	});
});

test('unloading removes only the selected graph and its Explorer, including after restore', () => {
	let w = importGraph(emptyWorkspace(), loaded().graphData!, 'same.yaml');
	const different = loaded().graphData!;
	different.nodes[0].fillColor = '#ff0000';
	w = importGraph(w, different, 'same.yaml');
	const [first, second] = w.graphs;
	w = openGraph(openGraph(w, first.id), second.id);
	const remainingTab = w.tabs[0].id;
	w = unloadGraph(w, second.id);
	expect(w.graphs.map((g) => g.id)).toEqual([first.id]);
	expect(w.activeId).toBe(remainingTab);
	expect(w.tabs).toHaveLength(1);
	expect(restoreWorkspace(structuredClone(w)).workspace).toEqual(w);
	w = unloadGraph(w, first.id);
	expect(w.tabs).toHaveLength(0);
	expect(w.graphs).toHaveLength(0);
	expect(w.activeId).toBeNull();
});

test('Save commits the graph without a browser download and retains styling in its saved document', async () => {
	const { getWindowDefinition } = await import('../src/workspace/registry');
	const state = loaded();
	state.colorOverrides = new Map([['n0', { fill: '#ff0000' }]]);
	expect(explorerDirty(state)).toBe(true);
	// This test has no DOM: saving must not create a download link.
	const saved = getWindowDefinition('explorer').save(state);
	expect(explorerDirty(saved)).toBe(false);
	expect(explorerDirty(state)).toBe(true);
	const graph = parseFile(saved.baselineYaml!);
	expect(graph.nodes.find((n) => n.id === 'n0')?.fillColor).toBe('#ff0000');
	const workspace = importGraph(emptyWorkspace(), graph, saved.filename);
	const restored = restoreWorkspace(structuredClone(workspace)).workspace;
	expect(
		openGraph(
			restored,
			restored.graphs[0].id
		).tabs[0].state.graphData?.nodes.find((n) => n.id === 'n0')?.fillColor
	).toBe('#ff0000');
});

test('duplicate contents are rejected regardless of filename, formatting, or node order', () => {
	const graph = loaded().graphData!;
	const w = importGraph(emptyWorkspace(), graph, 'original.yaml');
	const reordered = structuredClone(graph);
	reordered.nodes.reverse();
	reordered.edges.reverse();
	expect(() => importGraph(w, reordered, 'renamed.yaml')).toThrow(
		'already in your library'
	);
	const roundtrip = parseFile(
		'\n# different formatting\n' +
			explorerYaml({ ...loaded(), graphData: graph })
	);
	expect(() => importGraph(w, roundtrip, 'copy.yaml')).toThrow(
		'original.yaml'
	);
	expect(w.graphs).toHaveLength(1);
	const changed = structuredClone(graph);
	changed.nodes[0].tasks[0].task.c += 1;
	expect(importGraph(w, changed, 'original.yaml').graphs).toHaveLength(2);
});
