import { compile } from './compiler';
const rawLibraries = import.meta.glob(
	'../../node_modules/typescript/lib/lib.{es5,es2015*,es2016*,es2017*,es2018*,es2019*,es2020*,decorators*}.d.ts',
	{ query: '?raw', import: 'default', eager: true }
);
const libraries = Object.fromEntries(
	Object.entries(rawLibraries).map(([path, contents]) => [
		path.split('/').pop()!,
		contents as string
	])
);
self.onmessage = (event: MessageEvent<{ id: number; source: string }>) => {
	try {
		self.postMessage({
			id: event.data.id,
			...compile(event.data.source, libraries)
		});
	} catch (error) {
		self.postMessage({ id: event.data.id, error: String(error) });
	}
};
