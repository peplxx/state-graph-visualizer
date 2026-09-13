import ts from 'typescript';
import { API_TYPES } from './api';
export interface CodeDiagnostic {
	from: number;
	to: number;
	message: string;
}
export function compile(
	source: string,
	libraries: Record<string, string>
): { js: string; diagnostics: CodeDiagnostic[] } {
	const file = ts.createSourceFile(
		'priority.ts',
		source,
		ts.ScriptTarget.ES2020,
		true
	);
	const diagnostics: CodeDiagnostic[] = [];
	const scan = (node: ts.Node) => {
		if (
			ts.isImportDeclaration(node) ||
			ts.isImportEqualsDeclaration(node) ||
			ts.isExportDeclaration(node) ||
			ts.isExportAssignment(node) ||
			(ts.isCallExpression(node) &&
				node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
			(ts.canHaveModifiers(node) &&
				ts
					.getModifiers(node)
					?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
		)
			diagnostics.push({
				from: node.getStart(file),
				to: node.end,
				message:
					'Imports and exports are not supported. Define function priority directly.'
			});
		ts.forEachChild(node, scan);
	};
	scan(file);
	const suffix =
		'\nconst __checkPriority: (state: TraversalState, context: TraversalContext) => Priority = priority;';
	const files: Record<string, string> = {
		'priority.ts': source + suffix,
		'api.d.ts': API_TYPES,
		...libraries
	};
	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ES2020,
		strict: true,
		noEmit: true,
		noLib: true,
		skipLibCheck: true,
		types: []
	};
	const host: ts.CompilerHost = {
		getSourceFile: (name, languageVersion) =>
			files[name] === undefined
				? undefined
				: ts.createSourceFile(name, files[name], languageVersion, true),
		getDefaultLibFileName: () => 'lib.d.ts',
		writeFile: () => {},
		getCurrentDirectory: () => '',
		getDirectories: () => [],
		fileExists: (name) => name in files,
		readFile: (name) => files[name],
		getCanonicalFileName: (name) => name,
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => '\n'
	};
	const program = ts.createProgram(Object.keys(files), options, host);
	for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
		if (diagnostic.file && diagnostic.file.fileName !== 'priority.ts')
			continue;
		const from = Math.min(diagnostic.start ?? 0, source.length);
		diagnostics.push({
			from,
			to: Math.min(from + (diagnostic.length ?? 1), source.length),
			message: ts.flattenDiagnosticMessageText(
				diagnostic.messageText,
				'\n'
			)
		});
	}
	return {
		js: diagnostics.length
			? ''
			: ts.transpileModule(source, {
					compilerOptions: {
						target: ts.ScriptTarget.ES2020,
						module: ts.ModuleKind.None
					}
				}).outputText,
		diagnostics
	};
}
