import { z } from 'zod';
import { PRESETS } from './api';
export const strategyDocumentSchema = z.object({
	id: z.string().min(1),
	strategyId: z.string(),
	name: z.string(),
	source: z.string(),
	open: z.boolean()
});
export const strategyWorkspaceSchema = z.object({
	documents: z.array(strategyDocumentSchema).default([]),
	activeId: z.string().nullable().default(null),
	sidebarWidth: z.number().min(240).max(640).default(276)
});
export type StrategyDocument = z.infer<typeof strategyDocumentSchema>;
export type StrategyWorkspaceState = z.infer<typeof strategyWorkspaceSchema>;
export interface StrategyEditorInput {
	id?: string;
	name: string;
	source: string;
}
export const createStrategyWorkspace = (): StrategyWorkspaceState => ({
	documents: [],
	activeId: null,
	sidebarWidth: 276
});
export function openStrategyDocument(
	state: StrategyWorkspaceState,
	input?: StrategyEditorInput
): StrategyWorkspaceState {
	const existing =
		input &&
		state.documents.find(
			(doc) =>
				doc.strategyId === (input.id ?? '') &&
				doc.source === input.source &&
				doc.name === input.name
		);
	if (existing)
		return {
			...state,
			activeId: existing.id,
			documents: state.documents.map((doc) =>
				doc.id === existing.id ? { ...doc, open: true } : doc
			)
		};
	const doc: StrategyDocument = {
		id: crypto.randomUUID(),
		strategyId: input?.id ?? '',
		name: input?.name ?? 'Untitled strategy',
		source: input?.source ?? PRESETS[0].source,
		open: true
	};
	return { ...state, activeId: doc.id, documents: [...state.documents, doc] };
}
export function closeStrategyDocument(
	state: StrategyWorkspaceState,
	id: string
): StrategyWorkspaceState {
	const opened = state.documents.filter((doc) => doc.open);
	const index = opened.findIndex((doc) => doc.id === id);
	return {
		...state,
		documents: state.documents.map((doc) =>
			doc.id === id ? { ...doc, open: false } : doc
		),
		activeId:
			state.activeId === id
				? (opened[index + 1]?.id ?? opened[index - 1]?.id ?? null)
				: state.activeId
	};
}

export function deleteStrategyDocument(
	state: StrategyWorkspaceState,
	id: string
): StrategyWorkspaceState {
	const next = closeStrategyDocument(state, id);
	return {
		...next,
		documents: next.documents.filter((doc) => doc.id !== id)
	};
}
