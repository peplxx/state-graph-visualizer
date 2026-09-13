import { test, expect } from 'bun:test';
import {
	emptyWorkspace,
	openHelp,
	openStrategies,
	restoreWorkspace
} from '../src/workspace/model';
import {
	createStrategyWorkspace,
	openStrategyDocument,
	closeStrategyDocument,
	deleteStrategyDocument
} from '../src/traversal/strategyWorkspace';
import {
	createSimulatorState,
	validateSimulator
} from '../src/traversal/state';

test('help topics reuse one tab and update its page', () => {
	let workspace = openHelp(emptyWorkspace(), 'api');
	const apiId = workspace.activeId;
	workspace = openHelp(workspace, 'traversal');
	expect(workspace.tabs).toHaveLength(1);
	expect(workspace.tabs[0].state).toEqual({ topic: 'traversal' });
	workspace = openHelp(workspace, 'api');
	expect(workspace.activeId).toBe(apiId);
	expect(restoreWorkspace(workspace).workspace).toEqual(workspace);
});
test('strategy editor retains multiple drafts and reopens closed documents', () => {
	let state = openStrategyDocument(createStrategyWorkspace(), {
		id: 'one',
		name: 'One',
		source: 'return 1'
	});
	const first = state.activeId;
	state = openStrategyDocument(state, {
		id: 'two',
		name: 'Two',
		source: 'return 2'
	});
	const second = state.activeId;
	state = closeStrategyDocument(state, second);
	expect(state.activeId).toBe(first);
	expect(state.documents.find((doc) => doc.id === second)?.source).toBe(
		'return 2'
	);
	state = openStrategyDocument(state, {
		id: 'two',
		name: 'Two',
		source: 'return 2'
	});
	expect(state.activeId).toBe(second);
	expect(state.documents).toHaveLength(2);
	expect(state.documents.every((doc) => doc.open)).toBe(true);
});
test('opening a changed simulator draft does not overwrite another editor draft', () => {
	let workspace = openStrategies(emptyWorkspace(), {
		id: 'one',
		name: 'One',
		source: 'original'
	});
	workspace = openStrategies(workspace, {
		id: 'one',
		name: 'One',
		source: 'changed'
	});
	expect(workspace.tabs).toHaveLength(1);
	const editor = workspace.tabs[0];
	if (editor.kind !== 'strategies') throw new Error('Expected editor');
	expect(editor.state.documents.map((doc) => doc.source)).toEqual([
		'original',
		'changed'
	]);
	const restored = restoreWorkspace(workspace);
	expect(restored.warnings).toEqual([]);
	expect(restored.workspace.tabs).toEqual(workspace.tabs);
});
test('older simulator sessions get default panel widths and new widths survive restore', () => {
	const state = createSimulatorState();
	const { panelWidths: _, ...old } = state;
	expect(validateSimulator(old).panelWidths).toEqual({
		strategy: 320,
		inspector: 276
	});
	state.panelWidths = { strategy: 460, inspector: 350 };
	expect(validateSimulator(state).panelWidths).toEqual(state.panelWidths);
});

test('older help tabs consolidate while preserving the active topic', () => {
	const workspace = openHelp(emptyWorkspace(), 'api');
	const extra = {
		...workspace.tabs[0],
		id: 'legacy-help',
		kind: 'help' as const,
		state: { topic: 'explorer' as const },
		title: 'Help · Graph Explorer'
	};
	const restored = restoreWorkspace({
		...workspace,
		tabs: [...workspace.tabs, extra],
		activeId: extra.id
	});
	expect(restored.warnings).toEqual([]);
	expect(restored.workspace.tabs).toHaveLength(1);
	expect(restored.workspace.activeId).toBe(extra.id);
	expect(restored.workspace.tabs[0].state).toEqual({ topic: 'explorer' });
});
test('deleting a draft removes it and focuses the adjacent editor', () => {
	let state = openStrategyDocument(createStrategyWorkspace());
	const first = state.activeId;
	state = openStrategyDocument(state);
	const removed = state.activeId!;
	state = deleteStrategyDocument(state, removed);
	expect(state.activeId).toBe(first);
	expect(state.documents).toHaveLength(1);
	expect(state.documents.some((doc) => doc.id === removed)).toBe(false);
	state = deleteStrategyDocument(state, first!);
	expect(state.activeId).toBeNull();
	expect(state.documents).toEqual([]);
});

test('default strategies seed old workspaces once and respect edits and deletions', () => {
	const legacy = {
		...emptyWorkspace(),
		traversalLibrary: {
			strategies: [{ id: 'custom', name: 'Custom', source: 'kept' }],
			records: []
		}
	};
	const first = restoreWorkspace(legacy).workspace;
	expect(first.traversalLibrary.strategies).toHaveLength(7);
	first.traversalLibrary.strategies = first.traversalLibrary.strategies
		.filter((s) => s.id !== 'bfs')
		.map((s) =>
			s.id === 'slack1' ? { ...s, name: 'My Slack', source: 'edited' } : s
		);
	const second = restoreWorkspace(first).workspace;
	expect(second.traversalLibrary.strategies).toHaveLength(6);
	expect(second.traversalLibrary.strategies.some((s) => s.id === 'bfs')).toBe(
		false
	);
	expect(
		second.traversalLibrary.strategies.find((s) => s.id === 'slack1')
			?.source
	).toBe('edited');
});
