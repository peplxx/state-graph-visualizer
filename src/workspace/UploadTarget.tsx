import React from 'react';

interface Props {
	className: string;
	onUpload: () => void;
	onFiles: (files: File[]) => void;
	children: React.ReactNode;
}

/** The same import path for file drops and the native file chooser. */
export function UploadTarget({
	className,
	onUpload,
	onFiles,
	children
}: Props) {
	const [dragging, setDragging] = React.useState(false);
	const depth = React.useRef(0);
	const reset = React.useCallback(() => {
		depth.current = 0;
		setDragging(false);
	}, []);
	React.useEffect(() => {
		if (!dragging) return;
		window.addEventListener('dragend', reset);
		window.addEventListener('drop', reset);
		return () => {
			window.removeEventListener('dragend', reset);
			window.removeEventListener('drop', reset);
		};
	}, [dragging, reset]);
	const isFiles = (event: React.DragEvent) =>
		event.dataTransfer.types.includes('Files');
	return (
		<button
			type="button"
			className={`${className}${dragging ? ' is-file-drop-target' : ''}`}
			onClick={onUpload}
			onDragEnter={(event) => {
				if (!isFiles(event)) return;
				event.preventDefault();
				depth.current++;
				setDragging(true);
			}}
			onDragOver={(event) => {
				if (!isFiles(event)) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = 'copy';
			}}
			onDragLeave={(event) => {
				if (!isFiles(event)) return;
				event.preventDefault();
				depth.current = Math.max(0, depth.current - 1);
				if (!depth.current) setDragging(false);
			}}
			onDrop={(event) => {
				if (!isFiles(event)) return;
				event.preventDefault();
				event.stopPropagation();
				const files = Array.from(event.dataTransfer.files);
				reset();
				if (files.length) onFiles(files);
			}}
		>
			{children}
		</button>
	);
}
