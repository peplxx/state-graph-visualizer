import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as yaml from 'js-yaml';
import {
	GraphFileYamlSchema,
	formatZodErrors
} from '../src/schema/graphSchema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const schemaPath = join(rootDir, 'schema', 'graph-v1.schema.json');

function collectYamlFiles(paths: string[]): string[] {
	const files: string[] = [];
	for (const input of paths) {
		const abs = resolve(input);
		const stat = statSync(abs);
		if (stat.isDirectory()) {
			for (const entry of readdirSync(abs)) {
				if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
					files.push(join(abs, entry));
				}
			}
		} else {
			files.push(abs);
		}
	}
	return files;
}

function validateFile(
	filePath: string,
	validate: ReturnType<Ajv['compile']>
): boolean {
	let ok = true;
	const content = readFileSync(filePath, 'utf8');
	let raw: unknown;

	try {
		raw = yaml.load(content);
	} catch (err) {
		console.error(`✗ ${filePath}`);
		console.error(`  Invalid YAML: ${(err as Error).message}`);
		return false;
	}
	if (!validate(raw)) {
		console.error(`✗ ${filePath}`);
		for (const err of (validate as any).errors ?? []) {
			console.error(
				`  JSON Schema: ${err.instancePath || '/'} ${err.message}`
			);
		}
		ok = false;
	}

	const zodResult = GraphFileYamlSchema.safeParse(raw);
	if (!zodResult.success) {
		console.error(`✗ ${filePath}`);
		for (const line of formatZodErrors(zodResult.error).split('\n')) {
			console.error(`  Zod: ${line}`);
		}
		ok = false;
	}

	if (ok) {
		console.log(`✓ ${filePath}`);
	}
	return ok;
}

function main() {
	const args = process.argv.slice(2);
	const targets = args.length > 0 ? args : [join(rootDir, 'examples')];

	let schemaExists = true;
	try {
		statSync(schemaPath);
	} catch {
		schemaExists = false;
	}

	if (!schemaExists) {
		console.error(
			`Missing ${schemaPath}. Run "npm run schema:generate" first.`
		);
		process.exit(1);
	}

	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);

	const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
	const validate = ajv.compile(schema);

	const files = collectYamlFiles(targets);
	if (files.length === 0) {
		console.error('No YAML files found to validate.');
		process.exit(1);
	}

	let allOk = true;
	for (const file of files) {
		if (!validateFile(file, validate)) allOk = false;
	}

	process.exit(allOk ? 0 : 1);
}

main();
