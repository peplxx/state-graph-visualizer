import { lazy } from 'react';
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
	explorer: {
		label: 'Explorer',
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
