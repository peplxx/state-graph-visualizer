import type { ComponentType } from 'react';
import type { ExplorerState } from './explorerState';

export interface WindowStateMap {
	explorer: ExplorerState;
}
export type WindowKind = keyof WindowStateMap;
export type WindowTab = {
	[K in WindowKind]: {
		id: string;
		graphId?: string;
		kind: K;
		title: string;
		customTitle: boolean;
		state: WindowStateMap[K];
	};
}[WindowKind];
export interface LibraryGraph {
	id: string;
	filename: string;
	graph: import('../types/graph').GraphFile;
}
export interface Workspace {
	version: 2;
	graphs: LibraryGraph[];
	tabs: WindowTab[];
	activeId: string | null;
	nextExplorer: number;
}
export interface WindowProps<S> {
	initialState: S;
	onChange: (state: S) => void;
	confirmDiscard: (action: () => void) => void;
}
export interface WindowDefinition<S> {
	label: string;
	create: () => S;
	validate: (value: unknown) => S;
	Component: ComponentType<WindowProps<S>>;
	dirty: (state: S) => boolean;
	documentChanged: (previous: S, next: S) => boolean;
	fileTitle: (state: S) => string | null;
	save: (state: S) => S;
}
