import { useState } from 'react';
import { Check, FileClock, Pencil, Play, Trash2, X } from 'lucide-react';
import type { Run } from './types';

export default function RecordingList({
	records,
	activeId,
	busy,
	onOpen,
	onRename,
	onDelete
}: {
	records: Run[];
	activeId?: string;
	busy: boolean;
	onOpen: (id: string) => void;
	onRename: (id: string, name: string) => void;
	onDelete: (id: string) => void;
}) {
	const [editingId, setEditingId] = useState('');
	const [name, setName] = useState('');
	return (
		<>
			<div className="recordings-list-heading">
				<span>Saved recordings</span>
				<span>{records.length}</span>
			</div>
			<ol
				className="recordings-list"
				aria-label="Saved recordings"
				tabIndex={0}
			>
				{records.map((record, index) => (
					<li
						key={record.id}
						className={activeId === record.id ? 'is-active' : ''}
					>
						{editingId === record.id ? (
							<form
								className="recording-rename"
								onSubmit={(e) => {
									e.preventDefault();
									if (name.trim()) {
										onRename(record.id, name.trim());
										setEditingId('');
									}
								}}
							>
								<input
									aria-label="Recording name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									autoFocus
								/>
								<button
									aria-label="Save recording name"
									disabled={!name.trim()}
								>
									<Check size={14} />
								</button>
								<button
									type="button"
									aria-label="Cancel rename"
									onClick={() => setEditingId('')}
								>
									<X size={14} />
								</button>
							</form>
						) : (
							<>
								<button
									className="recording-open"
									disabled={busy}
									aria-label={`Open recording ${record.name}`}
									onClick={() => onOpen(record.id)}
								>
									<span className="recording-number">
										{index + 1}
									</span>
									<span className="recording-description">
										<strong>{record.name}</strong>
										<small title={record.filename}>
											{record.filename}
										</small>
									</span>
									<Play size={13} />
								</button>
								<div className="recording-meta">
									<span>
										{record.events.length} steps ·{' '}
										{record.graph.nodes.length} nodes
									</span>
									<button
										aria-label={`Rename recording ${record.name}`}
										onClick={() => {
											setEditingId(record.id);
											setName(record.name);
										}}
									>
										<Pencil size={12} />
									</button>
									<button
										aria-label={`Delete recording ${record.name}`}
										onClick={() => onDelete(record.id)}
									>
										<Trash2 size={12} />
									</button>
								</div>
							</>
						)}
					</li>
				))}
				{!records.length && (
					<li className="recordings-empty">
						<FileClock size={24} />
						<strong>No recordings yet</strong>
						<span>Save a run to replay its steps later.</span>
					</li>
				)}
			</ol>
		</>
	);
}
