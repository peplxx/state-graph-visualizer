import { toJSONSchema } from 'zod';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GraphFileYamlSchema } from '../src/schema/graphSchema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const outPath = join(rootDir, 'schema', 'graph-v1.schema.json');

const generated = toJSONSchema(GraphFileYamlSchema, { target: 'draft-7' });

// Fields that have .default() in Zod but should be optional in YAML
const OPTIONAL_NODE_FIELDS = ['tasks', 'children', 'loopback'];
const OPTIONAL_TOP_FIELDS = ['schemaVersion'];

function removeFromRequired(obj: Record<string, unknown>, fields: string[]) {
	if (Array.isArray(obj.required)) {
		obj.required = (obj.required as string[]).filter(
			(f) => !fields.includes(f)
		);
		if ((obj.required as string[]).length === 0) delete obj.required;
	}
}

// Patch top-level required
removeFromRequired(generated as Record<string, unknown>, OPTIONAL_TOP_FIELDS);

// Patch nodes[].items required
const nodesSchema = (generated as any)?.properties?.nodes?.items;
if (nodesSchema) removeFromRequired(nodesSchema, OPTIONAL_NODE_FIELDS);

const schemaDoc = {
	$schema: 'http://json-schema.org/draft-07/schema#',
	$id: 'https://state-graph-visualizer/graph-v1.schema.json',
	title: 'State Transition Graph',
	description:
		'YAML формат для графов переходов состояний в задачах планирования реального времени',
	...generated
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(schemaDoc, null, 2)}\n`);
console.log(`Generated: ${outPath}`);
