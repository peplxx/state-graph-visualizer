import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import {
	EditorView,
	keymap,
	lineNumbers,
	highlightActiveLine
} from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab
} from '@codemirror/commands';
import {
	syntaxHighlighting,
	defaultHighlightStyle
} from '@codemirror/language';
import { setDiagnostics } from '@codemirror/lint';
import type { CodeDiagnostic } from './compiler';
const fields = {
	state: {
		id: 'string',
		label: 'string | undefined',
		metadata: 'Readonly<Record<string, unknown>>',
		tasks: 'readonly TraversalTask[]',
		depth: 'number',
		parentId: 'string | null',
		insertionOrder: 'number'
	},
	context: {
		graph: 'Readonly graph: nodes, edges, system',
		system: 'SystemConfig | undefined',
		step: 'number',
		expandedIds: 'readonly string[]',
		queueIds: 'readonly string[]'
	}
};
export default function StrategyEditor({
	value,
	onChange,
	diagnostics
}: {
	value: string;
	onChange: (value: string) => void;
	diagnostics: CodeDiagnostic[];
}) {
	const initialValue = useRef(value);
	const host = useRef<HTMLDivElement>(null);
	const editor = useRef<EditorView | null>(null);
	const change = useRef(onChange);
	const syncing = useRef(false);
	change.current = onChange;
	useEffect(() => {
		const view = new EditorView({
			parent: host.current!,
			state: EditorState.create({
				doc: initialValue.current,
				extensions: [
					lineNumbers(),
					highlightActiveLine(),
					history(),
					javascript({ typescript: true }),
					syntaxHighlighting(defaultHighlightStyle),
					keymap.of([
						indentWithTab,
						...defaultKeymap,
						...historyKeymap,
						...completionKeymap
					]),
					autocompletion({
						override: [
							(context) => {
								const member = context.matchBefore(
									/(?:state|context)\.\w*/
								);
								if (member) {
									const name = member.text.split(
										'.'
									)[0] as keyof typeof fields;
									return {
										from: member.from + name.length + 1,
										options: Object.entries(
											fields[name]
										).map(([label, detail]) => ({
											label,
											detail,
											type: 'property'
										}))
									};
								}
								const word = context.matchBefore(/\w*/);
								if (
									!word ||
									(!context.explicit && word.from === word.to)
								)
									return null;
								return {
									from: word.from,
									options: [
										'TraversalState',
										'TraversalContext',
										'Priority',
										'state',
										'context'
									].map((label) => ({ label, type: 'type' }))
								};
							}
						]
					}),
					EditorView.updateListener.of((update) => {
						if (update.docChanged && !syncing.current)
							change.current(update.state.doc.toString());
					}),
					EditorView.contentAttributes.of({
						'aria-label': 'TypeScript priority function'
					}),
					EditorView.lineWrapping
				]
			})
		});
		editor.current = view;
		return () => {
			view.destroy();
			editor.current = null;
		};
	}, []);
	useEffect(() => {
		const view = editor.current;
		if (view && view.state.doc.toString() !== value) {
			syncing.current = true;
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value }
			});
			syncing.current = false;
		}
	}, [value]);
	useEffect(() => {
		const view = editor.current;
		if (view)
			view.dispatch(
				setDiagnostics(
					view.state,
					diagnostics.map((d) => ({
						...d,
						from: Math.min(d.from, view.state.doc.length),
						to: Math.min(d.to, view.state.doc.length),
						severity: 'error' as const
					}))
				)
			);
	}, [diagnostics]);
	return <div className="traversal-editor" ref={host} />;
}
