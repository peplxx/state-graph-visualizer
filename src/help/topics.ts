import { z } from 'zod';
export const helpTopics = {
	overview: {
		title: 'Getting started',
		description: 'Graphs, windows and local saving'
	},
	explorer: {
		title: 'Graph Explorer',
		description: 'Navigation, appearance and areas'
	},
	traversal: {
		title: 'Traversal Simulator',
		description: 'Strategies, playback and recordings'
	},
	api: {
		title: 'Priority function API',
		description: 'Inputs, return values and examples'
	}
} as const;
export type HelpTopic = keyof typeof helpTopics;
export const helpStateSchema = z.object({
	topic: z
		.enum(['overview', 'explorer', 'traversal', 'api'])
		.default('overview')
});
export type HelpState = z.infer<typeof helpStateSchema>;
