import type { NodeTaskDisplay } from '../types/graph';

// Produces the multi-line label rendered inside the node box
// Format per row: (c,d)↑  or  (c,d)↓  or  (c,d)
export function buildNodeLabel(tasks: NodeTaskDisplay[]): string {
  const invisibleSpace = '\u2800';
  return tasks
    .map(({ task, release }) => {
      const base = `(${task.c},${task.d})`;
      if (release === 'up') return `${base}↑`;
      if (release === 'down') return `${base}↓`;
      return `${base}${invisibleSpace}`;
    })
    .join('\n');
}

// Estimate node dimensions based on task count and value widths
export function estimateNodeSize(tasks: NodeTaskDisplay[]): {
  width: number;
  height: number;
} {
  const maxLen = Math.max(
    ...tasks.map(({ task, release }) => {
      const s = `(${task.c},${task.d})`;
      return s.length + (release !== 'none' ? 1 : 0);
    }),
    4
  );
  const charWidth = 7.5; // px per character at 11px monospace
  const lineHeight = 16;
  const padH = 18;
  const padV = 12;
  return {
    width: Math.max(60, maxLen * charWidth + padH),
    height: Math.max(36, tasks.length * lineHeight + padV),
  };
}
