import React from 'react';

export function DeleteAreaDialog({
	name,
	onCancel,
	onDelete
}: {
	name: string;
	onCancel: () => void;
	onDelete: () => void;
}) {
	const ref = React.useRef<HTMLDialogElement>(null);
	const titleId = React.useId();
	const descriptionId = React.useId();
	React.useEffect(() => {
		const dialog = ref.current;
		const previous = document.activeElement as HTMLElement | null;
		dialog?.showModal();
		return () => {
			dialog?.close();
			if (previous?.isConnected) previous.focus();
		};
	}, []);
	return (
		<dialog
			ref={ref}
			className="unsaved-dialog"
			aria-labelledby={titleId}
			aria-describedby={descriptionId}
			onKeyDown={(event) => event.stopPropagation()}
			onCancel={(event) => {
				event.preventDefault();
				onCancel();
			}}
		>
			<h2 id={titleId}>Delete area?</h2>
			<p id={descriptionId}>
				Delete <strong>{name}</strong>? Its nodes will remain in the
				graph.
			</p>
			<div className="dialog-actions">
				<button
					type="button"
					className="header-toggle"
					autoFocus
					onClick={onCancel}
				>
					Cancel
				</button>
				<button
					type="button"
					className="header-toggle is-active"
					onClick={onDelete}
				>
					Delete area
				</button>
			</div>
		</dialog>
	);
}
