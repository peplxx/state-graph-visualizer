import {
	createStrategyWorkspace,
	strategyWorkspaceSchema
} from '../traversal/strategyWorkspace';
import { helpStateSchema } from '../help/topics';
import { createSimulatorState, validateSimulator } from '../traversal/state';
import { lazy } from 'react';
import { PanelsTopLeft, BookOpen, Code2 } from 'lucide-react';
import {
	createExplorerState,
	explorerStateSchema,
	explorerDirty,
	explorerYaml
} from './explorerState';
import type { WindowDefinition, WindowStateMap, WindowKind } from './types';

const ExplorerWindow = lazy(() =>
	import('./ExplorerWindow').then((module) => ({
		default: module.ExplorerWindow
	}))
);

export const windowRegistry: {
	[K in keyof WindowStateMap]: WindowDefinition<WindowStateMap[K]>;
} = {
	strategies: {
		label: 'Strategy editor',
		Icon: Code2,
		create: createStrategyWorkspace,
		validate: (value) => strategyWorkspaceSchema.parse(value),
		Component: lazy(() => import('../traversal/StrategiesWindow')),
		dirty: () => false,
		documentChanged: () => false,
		fileTitle: () => 'Strategy editor',
		save: (state) => state
	},
	help: {
		label: 'Help',
		Icon: BookOpen,
		create: () => ({ topic: 'overview' }),
		validate: (value) => helpStateSchema.parse(value),
		Component: lazy(() => import('../help/HelpWindow')),
		dirty: () => false,
		documentChanged: () => false,
		fileTitle: () => 'Help',
		save: (state) => state
	},
	traversal: {
		label: 'Traversal Simulator',
		Icon: PanelsTopLeft,
		create: createSimulatorState,
		validate: validateSimulator,
		Component: lazy(() =>
			import('../traversal/SimulatorWindow').then((m) => ({
				default: m.SimulatorWindow
			}))
		),
		dirty: () => false,
		documentChanged: () => false,
		fileTitle: (state) =>
			state.filename ? `Traversal · ${state.filename}` : null,
		save: (state) => state
	},
	explorer: {
		label: 'Explorer',
		Icon: PanelsTopLeft,
		create: createExplorerState,
		validate: (value) => explorerStateSchema.parse(value),
		Component: ExplorerWindow,
		dirty: explorerDirty,
		documentChanged: (previous, next) =>
			previous.graphData !== next.graphData ||
			previous.colorOverrides !== next.colorOverrides ||
			previous.areaOverrides !== next.areaOverrides ||
			previous.baselineYaml !== next.baselineYaml,
		fileTitle: (state) => state.filename || null,
		save: (state) => {
			return { ...state, baselineYaml: explorerYaml(state) };
		}
	}
};

// Keep the kind/state correlation at this dispatch boundary. Registry entries themselves
// are checked against their specific state types; the shell can dispatch any window kind.
export function getWindowDefinition<K extends WindowKind>(
	kind: K
): WindowDefinition<WindowStateMap[K]> {
	return windowRegistry[kind] as WindowDefinition<WindowStateMap[K]>;
}
