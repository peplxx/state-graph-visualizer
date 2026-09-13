import { createContext, useContext } from 'react';
import type { TraversalLibrary } from './types';
export const TraversalLibraryContext = createContext<{
	library: TraversalLibrary;
	updateLibrary: (
		update: (library: TraversalLibrary) => TraversalLibrary
	) => void;
} | null>(null);
export function useTraversalLibrary() {
	const context = useContext(TraversalLibraryContext);
	if (!context) throw new Error('Missing traversal library provider.');
	return context;
}
