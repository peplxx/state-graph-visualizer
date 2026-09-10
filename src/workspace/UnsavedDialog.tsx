import React from 'react';
export function UnsavedDialog({
	title,
	onSave,
	onDiscard,
	onCancel
}: {
	title: string;
	onSave: () => void;
	onDiscard: () => void;
	onCancel: () => void;
}) {
	const ref = React.useRef<HTMLDialogElement>(null);
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
			aria-labelledby="unsaved-title"
			onCancel={(event) => {
				event.preventDefault();
				onCancel();
			}}
		>
			<h2 id="unsaved-title">Save changes?</h2>
			<p>
				<strong>{title}</strong> has changes that have not been saved to
				the workspace.
			</p>
			<div className="dialog-actions">
				<button
					type="button"
					className="header-toggle"
					onClick={onCancel}
					autoFocus
				>
					Cancel
				</button>
				<button
					type="button"
					className="header-toggle"
					onClick={onDiscard}
				>
					Discard
				</button>
				<button
					type="button"
					className="header-toggle is-active"
					onClick={onSave}
				>
					Save
				</button>
			</div>
		</dialog>
	);
}
