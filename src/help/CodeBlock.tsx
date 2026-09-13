import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import {
	syntaxHighlighting,
	defaultHighlightStyle
} from '@codemirror/language';
export default function CodeBlock({
	source,
	title = 'types.ts'
}: {
	source: string;
	title?: string;
}) {
	const host = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const view = new EditorView({
			parent: host.current!,
			state: EditorState.create({
				doc: source.trim(),
				extensions: [
					EditorState.readOnly.of(true),
					EditorView.editable.of(false),
					lineNumbers(),
					javascript({ typescript: true }),
					syntaxHighlighting(defaultHighlightStyle),
					EditorView.contentAttributes.of({
						'aria-label': title,
						tabindex: '0'
					})
				]
			})
		});
		return () => view.destroy();
	}, [source, title]);
	return (
		<div className="help-code-block">
			<div className="help-code-caption">
				<span>{title}</span>
				<span>TypeScript · Read only</span>
			</div>
			<div ref={host} />
		</div>
	);
}
