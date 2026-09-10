import type { Workspace } from './types';

let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
	return (connection ??= new Promise((resolve, reject) => {
		const request = indexedDB.open('state-graph-workspace', 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore('sessions');
		request.onerror = () => {
			connection = undefined;
			reject(request.error);
		};
		request.onblocked = () => {
			connection = undefined;
			reject(new Error('Workspace storage is blocked by another page.'));
		};
		request.onsuccess = () => {
			const db = request.result;
			db.onversionchange = () => {
				db.close();
				connection = undefined;
			};
			resolve(db);
		};
	}));
}
export async function readWorkspace(): Promise<unknown> {
	const db = await database();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('sessions', 'readonly');
		const request = tx.objectStore('sessions').get('current');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
export function writeWorkspace(workspace: Workspace): Promise<void> {
	return storeSnapshot(workspace, 'current');
}

// Preserve the original session before skipping damaged tabs during recovery.
export function backupWorkspace(value: unknown): Promise<void> {
	return storeSnapshot(value, 'recovery');
}

async function storeSnapshot(value: unknown, key: string): Promise<void> {
	const db = await database();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('sessions', 'readwrite');
		tx.objectStore('sessions').put(value, key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () =>
			reject(tx.error ?? new Error('Workspace save was interrupted.'));
	});
}

// One in-flight write, one latest pending snapshot: old writes can never win.
export function createWorkspaceWriter(
	write: (workspace: Workspace) => Promise<void>,
	onError: (error: unknown) => void
) {
	let pending: Workspace | undefined;
	let running = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const flush = async () => {
		clearTimeout(timer);
		if (running) return;
		running = true;
		try {
			while (pending) {
				const next = pending;
				pending = undefined;
				try {
					await write(next);
				} catch (error) {
					onError(error);
				}
			}
		} finally {
			running = false;
		}
	};
	return {
		push(workspace: Workspace, immediate = false) {
			pending = workspace;
			clearTimeout(timer);
			if (immediate) void flush();
			else timer = setTimeout(() => void flush(), 150);
		},
		flush,
		dispose() {
			clearTimeout(timer);
			void flush();
		}
	};
}
