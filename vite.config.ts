import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	build: {
		commonjsOptions: {
			include: [/cytoscape-dagre/, /cytoscape-fcose/, /node_modules/]
		}
	},
	optimizeDeps: {
		include: ['cytoscape', 'cytoscape-dagre', 'cytoscape-fcose', 'js-yaml']
	}
});
