import { z } from 'zod';

export const RELEASE_INDICATORS = ['up', 'down', 'none'] as const;
export type ReleaseIndicator = (typeof RELEASE_INDICATORS)[number];

const ReleaseInputSchema = z.union([
	z.enum(RELEASE_INDICATORS),
	z.literal('↑'),
	z.literal('↓'),
	z.literal(1),
	z.literal(-1)
]);

export function normalizeRelease(val: unknown): ReleaseIndicator {
	const parsed = ReleaseInputSchema.safeParse(val);
	if (!parsed.success) return 'none';
	switch (parsed.data) {
		case 'up':
		case '↑':
		case 1:
			return 'up';
		case 'down':
		case '↓':
		case -1:
			return 'down';
		default:
			return 'none';
	}
}

export const NodeTaskYamlSchema = z.object({
	c: z.coerce.number().optional().default(0),
	d: z.coerce.number().optional().default(0),
	release: ReleaseInputSchema.optional().default('none')
});

export const SystemTaskYamlSchema = z.object({
	c: z.coerce.number(),
	d: z.coerce.number(),
	name: z.string().optional()
});

export const SystemConfigYamlSchema = z.object({
	description: z.string().optional(),
	m: z.coerce.number().optional(),
	tasks: z.array(SystemTaskYamlSchema).optional().default([])
});

export const LayoutYamlSchema = z.object({
	algorithm: z.enum(['dagre', 'concentric']).default('dagre')
});

export const GraphNodeYamlSchema = z.object({
	id: z.string().min(1, 'Node id is required'),
	initial: z.boolean().optional(),
	isInitial: z.boolean().optional(),
	tasks: z.array(NodeTaskYamlSchema).optional().default([]),
	children: z.array(z.string()).optional().default([]),
	loopback: z.array(z.string()).optional().default([]),
	label: z.string().optional(),
	borderColor: z.string().min(1).optional(),
	fillColor: z.string().min(1).optional(),
	metadata: z.record(z.string(), z.unknown()).optional()
});

export const GraphFileYamlSchema = z
	.object({
		schemaVersion: z.coerce.number().int().positive().optional().default(1),
		system: SystemConfigYamlSchema.optional(),
		nodes: z
			.array(GraphNodeYamlSchema)
			.min(1, 'At least one node is required'),
		layout: LayoutYamlSchema.optional()
	})
	.superRefine((data, ctx) => {
		const ids = new Set<string>();
		const idList: string[] = [];

		for (const node of data.nodes) {
			if (ids.has(node.id)) {
				ctx.addIssue({
					code: 'custom',
					message: `Duplicate node id: ${node.id}`,
					path: ['nodes']
				});
			}
			ids.add(node.id);
			idList.push(node.id);
		}

		const idSet = new Set(idList);
		for (const [nodeIndex, node] of data.nodes.entries()) {
			for (const [childIndex, targetId] of node.children.entries()) {
				if (!idSet.has(targetId)) {
					ctx.addIssue({
						code: 'custom',
						message: `Unknown child node "${targetId}" referenced from "${node.id}"`,
						path: ['nodes', nodeIndex, 'children', childIndex]
					});
				}
			}
			for (const [loopIndex, targetId] of node.loopback.entries()) {
				if (!idSet.has(targetId)) {
					ctx.addIssue({
						code: 'custom',
						message: `Unknown loopback node "${targetId}" referenced from "${node.id}"`,
						path: ['nodes', nodeIndex, 'loopback', loopIndex]
					});
				}
			}
		}

		if (data.system?.tasks?.length) {
			const expected = data.system.tasks.length;
			for (const [nodeIndex, node] of data.nodes.entries()) {
				if (node.tasks.length !== expected) {
					ctx.addIssue({
						code: 'custom',
						message: `Node "${node.id}" has ${node.tasks.length} task(s), expected ${expected} from system.tasks`,
						path: ['nodes', nodeIndex, 'tasks']
					});
				}
			}
		}
	});

export type GraphFileYaml = z.infer<typeof GraphFileYamlSchema>;
export type GraphNodeYaml = z.infer<typeof GraphNodeYamlSchema>;
export type SystemConfigYaml = z.infer<typeof SystemConfigYamlSchema>;
export type LayoutYaml = z.infer<typeof LayoutYamlSchema>;
export type NodeTaskYaml = z.infer<typeof NodeTaskYamlSchema>;

export function formatZodErrors(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path =
				issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
			return `${path}${issue.message}`;
		})
		.join('\n');
}
