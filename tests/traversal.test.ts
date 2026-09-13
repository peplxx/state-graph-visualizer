import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import {
	appendEvent,
	defaultStarts,
	evaluate,
	expand,
	finishEvent,
	forkRun,
	seed,
	snapshotAt,
	sourceAt
} from '../src/traversal/engine';
import {
	validateRun,
	validateSimulator,
	createSimulatorState
} from '../src/traversal/state';
import { compile } from '../src/traversal/compiler';
import { PRESETS } from '../src/traversal/api';
import {
	emptyWorkspace,
	importGraph,
	openGraph,
	openTraversal,
	closeWindow,
	restoreWorkspace,
	unloadGraph
} from '../src/workspace/model';
import type { GraphFile } from '../src/types/graph';
import type { PriorityFunction, Run } from '../src/traversal/types';
const graph: GraphFile = {
	nodes: ['a', 'b', 'c', 'd', 'z'].map((id, i) => ({
		id,
		isInitial: i === 0,
		tasks: [{ task: { c: i, d: 5 }, release: 'none' }]
	})),
	edges: [
		['a', 'b'],
		['a', 'c'],
		['b', 'd'],
		['c', 'd'],
		['d', 'a'],
		['a', 'b'],
		['d', 'd']
	].map(([source, target], i) => ({
		source,
		target,
		type: i >= 4 ? 'loop' : 'normal'
	}))
};
const bfs: PriorityFunction = (state) => state.depth;
function newRun(fn: PriorityFunction = bfs, input = graph): Run {
	const starts = defaultStarts(input);
	return {
		id: 'run',
		name: 'Test',
		createdAt: '2026-09-11',
		graph: input,
		filename: 'test.yaml',
		starts,
		initial: evaluate(input, seed(input, starts), fn),
		events: [],
		checkpoints: [],
		revisions: [{ at: 0, source: PRESETS[0].source }]
	};
}
function step(run: Run, fn: PriorityFunction = bfs): Run {
	const before = snapshotAt(run, run.events.length);
	const next = expand(run.graph, before);
	const after = evaluate(run.graph, next.snapshot, fn);
	return appendEvent(run, finishEvent(before, after, next.event), after);
}
function finish(run: Run, fn: PriorityFunction = bfs): Run {
	while (snapshotAt(run, run.events.length).queue.length) run = step(run, fn);
	return run;
}
describe('traversal engine and recordings', () => {
	test('BFS expands each reachable node once, skips cycles, duplicate edges and diamond joins', () => {
		const run = finish(newRun());
		expect(run.events.map((e) => e.nodeId)).toEqual(['a', 'b', 'c', 'd']);
		expect(
			run.events.flatMap((e) => e.edges).filter((e) => !e.added)
		).toHaveLength(4);
		expect(snapshotAt(run, 4).discovered.map((n) => n.id)).not.toContain(
			'z'
		);
		expect(snapshotAt(run, 4).queue).toEqual([]);
	});
	test('DFS uses reverse insertion order and tuples use stable lexicographic order', () => {
		const dfs: PriorityFunction = (state) => -state.insertionOrder;
		expect(finish(newRun(dfs), dfs).events.map((e) => e.nodeId)).toEqual([
			'a',
			'c',
			'd',
			'b'
		]);
		const tuple: PriorityFunction = (state) => [
			state.depth,
			-state.insertionOrder
		];
		expect(
			finish(newRun(tuple), tuple).events.map((e) => e.nodeId)
		).toEqual(['a', 'c', 'b', 'd']);
		const constant: PriorityFunction = () => 0;
		expect(
			finish(newRun(constant), constant).events.map((e) => e.nodeId)
		).toEqual(['a', 'b', 'c', 'd']);
	});
	test('dynamic priorities re-evaluate waiting states with insertion-ordered candidates', () => {
		const contexts: string[][] = [];
		const dynamic: PriorityFunction = (state, context) => {
			contexts.push([...context.queueIds]);
			return context.step % 2
				? -state.insertionOrder
				: state.insertionOrder;
		};
		const run = step(newRun(dynamic), dynamic);
		expect(snapshotAt(run, 1).queue.map((e) => e.state.id)).toEqual([
			'c',
			'b'
		]);
		expect(contexts.slice(-2)).toEqual([
			['b', 'c'],
			['b', 'c']
		]);
	});
	test('multiple initial states, explicit seeds and fallback are deterministic', () => {
		expect(
			defaultStarts({
				...graph,
				nodes: graph.nodes.map((n) => ({
					...n,
					isInitial: n.id === 'b' || n.id === 'z'
				}))
			})
		).toEqual(['b', 'z']);
		expect(
			defaultStarts({
				...graph,
				nodes: graph.nodes.map((n) => ({ ...n, isInitial: false }))
			})
		).toEqual(['a']);
		expect(
			seed(graph, ['z', 'a', 'z']).queue.map((e) => e.state.id)
		).toEqual(['z', 'a']);
		expect(() => seed(graph, [])).toThrow();
	});
	test('invalid priorities and exceptions leave the previous snapshot unchanged', () => {
		const before = newRun().initial;
		for (const bad of [
			NaN,
			Infinity,
			[],
			[1, NaN],
			'bad',
			Promise.resolve(1)
		]) {
			expect(() =>
				evaluate(graph, before, (() => bad) as PriorityFunction)
			).toThrow('Node a:');
		}
		expect(() =>
			evaluate(graph, before, () => {
				throw new Error('oops');
			})
		).toThrow('Node a: oops');
		expect(before.queue[0].priority).toBe(0);
		expect(() => evaluate(graph, before, () => [1])).toThrow('consistent');
	});
	test('seek/replay does not evaluate code and reconstructs each recorded queue', () => {
		const run = finish(newRun());
		expect(snapshotAt(run, 1).queue.map((e) => e.state.id)).toEqual([
			'b',
			'c'
		]);
		expect(snapshotAt(run, 2).queue.map((e) => e.state.id)).toEqual([
			'c',
			'd'
		]);
		expect(snapshotAt(run, 0)).toEqual(run.initial);
		expect(validateRun(structuredClone(run))).toEqual(run);
	});
	test('changing code at a past step preserves the old branch and records re-prioritization', () => {
		const old = finish(newRun());
		const dfs: PriorityFunction = (state) => -state.insertionOrder;
		const base = evaluate(graph, snapshotAt(old, 1), dfs);
		const branch = forkRun(old, 1, PRESETS[1].source, base, 'branch');
		expect(old.events).toHaveLength(4);
		expect(branch.events).toHaveLength(1);
		expect(snapshotAt(branch, 1).queue.map((e) => e.state.id)).toEqual([
			'c',
			'b'
		]);
		expect(sourceAt(branch, 0)).toBe(PRESETS[0].source);
		expect(sourceAt(branch, 1)).toBe(PRESETS[1].source);
		expect(finish(branch, dfs).events.map((e) => e.nodeId)).toEqual([
			'a',
			'c',
			'd',
			'b'
		]);
		expect(validateRun(structuredClone(branch))).toEqual(branch);
	});
	test('checkpoints reconstruct long histories and are rebuilt from events on restore', () => {
		const input: GraphFile = {
			nodes: Array.from({ length: 140 }, (_, i) => ({
				id: String(i),
				tasks: []
			})),
			edges: Array.from({ length: 139 }, (_, i) => ({
				source: String(i),
				target: String(i + 1),
				type: 'normal'
			}))
		};
		const run = finish(newRun(bfs, input));
		expect(run.checkpoints.map((c) => c.at)).toEqual([64, 128]);
		expect(snapshotAt(run, 130).currentId).toBe('129');
		run.checkpoints[0].snapshot.currentId = 'corrupt-cache';
		expect(validateRun(run).checkpoints[0].snapshot.currentId).toBe('63');
	});
	test('rejects damaged authoritative histories', () => {
		const run = finish(newRun());
		run.events[1].nodeId = 'z';
		expect(() => validateRun(run)).toThrow('Damaged traversal history');
	});
});
describe('TypeScript compiler', () => {
	const directory = dirname(require.resolve('typescript/lib/lib.es5.d.ts'));
	const lib = Object.fromEntries(
		readdirSync(directory)
			.filter((name) =>
				/^lib\.(es5|es20(1[5-9]|20)[^.]*|es20(1[5-9]|20)\..*|decorators.*)\.d\.ts$/.test(
					name
				)
			)
			.map((name) => [name, readFileSync(join(directory, name), 'utf8')])
	);
	test('presets compile with actual TypeScript annotations and array helpers', () => {
		for (const preset of PRESETS)
			expect(compile(preset.source, lib).diagnostics).toEqual([]);
	});
	test('rejects type mistakes, mutation, async results, imports and syntax errors', () => {
		for (const source of [
			'function priority(s: TraversalState): Priority { return s.missing; }',
			'function priority(s: TraversalState): Priority { s.depth = 3; return 0; }',
			'async function priority(): Promise<number> { return 1; }',
			'import x from "thing"; function priority() { return x; }',
			'function priority( {',
			'function priority(): Priority { return "bad"; }'
		])
			expect(compile(source, lib).diagnostics.length).toBeGreaterThan(0);
	});
	test('modern array and object helpers are available', () => {
		expect(
			compile(
				'function priority(s: TraversalState, c: TraversalContext): Priority { return c.expandedIds.includes(s.id) ? Object.values(s.metadata ?? {}).length : 0; }',
				lib
			).diagnostics
		).toEqual([]);
	});
	test('diagnostics use editor source coordinates', () => {
		const source =
			'function priority(s: TraversalState): Priority { return s.missing; }';
		expect(
			compile(source, lib).diagnostics.some(
				(d) => source.slice(d.from, d.to) === 'missing'
			)
		).toBe(true);
	});
});
describe('workspace integration', () => {
	test('simulators are independent and do not steal Explorer opening', () => {
		let workspace = importGraph(emptyWorkspace(), graph, 'test.yaml');
		const id = workspace.graphs[0].id;
		workspace = openTraversal(openTraversal(workspace, id), id);
		expect(workspace.tabs).toHaveLength(2);
		workspace = openGraph(workspace, id);
		expect(workspace.tabs[2].kind).toBe('explorer');
		const first = workspace.tabs[0];
		if (first.kind !== 'traversal') throw new Error();
		first.state.run = finish(newRun());
		first.state.cursor = 2;
		workspace.traversalLibrary.records.push(first.state.run);
		workspace.traversalLibrary.strategies.push({
			...PRESETS[0],
			id: 'saved'
		});
		const restored = restoreWorkspace(structuredClone(workspace));
		expect(restored.warnings).toEqual([]);
		expect(restored.workspace.tabs[0].state).toEqual(first.state);
		const closed = closeWindow(restored.workspace, first.id);
		expect(closed.traversalLibrary.records).toHaveLength(1);
		expect(unloadGraph(closed, id).traversalLibrary.records).toHaveLength(
			1
		);
	});
	test('version 2 migrates and damaged records do not discard valid siblings', () => {
		const migrated = restoreWorkspace({
			...emptyWorkspace(),
			version: 2,
			traversalLibrary: undefined
		});
		expect(migrated.workspace.version).toBe(3);
		expect(migrated.workspace.traversalLibrary.strategies).toHaveLength(6);
		expect(migrated.workspace.traversalLibrary.records).toEqual([]);
		expect(migrated.workspace.traversalLibrary.defaultsInitialized).toBe(
			true
		);
		const workspace = emptyWorkspace();
		workspace.traversalLibrary.records = [finish(newRun()), {} as Run];
		const restored = restoreWorkspace(workspace);
		expect(restored.warnings).toHaveLength(1);
		expect(restored.workspace.traversalLibrary.records).toHaveLength(1);
	});
	test('restoring a simulator retains code without evaluating it', () => {
		const state = {
			...createSimulatorState(),
			graphData: graph,
			starts: ['a'],
			draft: 'function priority() { while(true) {} }',
			run: finish(newRun()),
			cursor: 2
		};
		const restored = validateSimulator(structuredClone(state));
		expect(restored.draft).toBe(state.draft);
		expect(restored.cursor).toBe(2);
	});
});

describe('traversal graph appearance', () => {
	test('captures unsaved Explorer formatting, areas and display preferences without changing the source', () => {
		const styled: GraphFile = {
			...graph,
			nodes: graph.nodes.map((node) => ({
				...node,
				fillColor: '#abcdef',
				hatch: 'single'
			})),
			edges: graph.edges.map((edge, i) => ({
				...edge,
				id: `edge-${i}`,
				label: 'transition',
				metadata: { weight: i }
			})),
			areas: [
				{
					id: 'zone',
					nodeIds: ['a', 'b'],
					label: 'Zone',
					fillColor: '#eeeeee',
					hatch: 'single'
				}
			]
		};
		let workspace = importGraph(emptyWorkspace(), styled, 'styled.yaml');
		const id = workspace.graphs[0].id;
		workspace = openGraph(workspace, id);
		const explorer = workspace.tabs[0];
		if (explorer.kind !== 'explorer') throw new Error();
		explorer.state.colorOverrides.set('a', {
			fill: '#ff0000',
			border: '#0000ff',
			hatch: 'none'
		});
		explorer.state.areaOverrides.set('zone', {
			fill: '#00ff00',
			border: '#333333',
			hatch: 'cross',
			labelPosition: 'bottom-right',
			nodes: ['a', 'c']
		});
		explorer.state.layout = 'tree';
		explorer.state.hiddenAreaIds.add('zone');
		explorer.state.showDeadlineBadges = false;
		workspace = openTraversal(workspace, id);
		const simulator = workspace.tabs[1];
		if (simulator.kind !== 'traversal') throw new Error();
		expect(simulator.state.graphData!.nodes[0]).toMatchObject({
			fillColor: '#ff0000',
			borderColor: '#0000ff',
			hatch: undefined
		});
		expect(simulator.state.graphData!.areas![0]).toMatchObject({
			label: 'Zone',
			nodeIds: ['a', 'c'],
			fillColor: '#00ff00',
			borderColor: '#333333',
			hatch: 'cross',
			labelPosition: 'bottom-right'
		});
		expect(simulator.state.graphData!.edges).toEqual(styled.edges);
		expect(simulator.state.layout).toBe('tree');
		expect(simulator.state.appearance).toEqual({
			showAreas: true,
			hiddenAreaIds: ['zone'],
			showDeadlineBadges: false
		});
		expect(workspace.graphs[0].graph.nodes[0].fillColor).toBe('#abcdef');
		explorer.state.graphData!.nodes[0].fillColor = '#ffffff';
		expect(simulator.state.graphData!.nodes[0].fillColor).toBe('#ff0000');
		const run = {
			...newRun(bfs, simulator.state.graphData!),
			appearance: simulator.state.appearance
		};
		const restored = validateSimulator(
			structuredClone({ ...simulator.state, run })
		);
		expect(restored.run!.graph).toEqual(simulator.state.graphData);
		expect(restored.appearance).toEqual(simulator.state.appearance);
	});
	test('a library graph retains its native appearance and older sessions receive visible-area defaults', () => {
		const styled: GraphFile = {
			...graph,
			layout: { algorithm: 'dagre' },
			areas: [{ id: 'zone', nodeIds: ['a'], fillColor: '#abcdff' }]
		};
		let workspace = importGraph(emptyWorkspace(), styled, 'styled.yaml');
		workspace = openTraversal(workspace, workspace.graphs[0].id);
		const simulator = workspace.tabs[0];
		if (simulator.kind !== 'traversal') throw new Error();
		expect(simulator.state.graphData).toEqual(styled);
		expect(simulator.state.layout).toBe('tree');
		expect(simulator.state.appearance.showAreas).toBe(true);
		const { appearance: _appearance, ...legacy } = simulator.state;
		expect(validateSimulator(legacy).appearance.showAreas).toBe(true);
	});
});
