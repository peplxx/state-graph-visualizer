export const API_TYPES = `
type Priority = number | readonly number[];
interface TraversalTask {
    readonly c: number;
    readonly d: number;
    readonly release: "up" | "down" | "none";
}

interface TraversalState {
    readonly id: string;
    readonly label?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly tasks: readonly TraversalTask[];
    readonly depth: number;
    readonly parentId: string | null;
    readonly insertionOrder: number;
}

interface GraphNode {
    readonly id: string;
    readonly label?: string;
    readonly isInitial?: boolean;
    readonly borderColor?: string;
    readonly fillColor?: string;
    readonly hatch?: "single" | "cross";
    readonly tasks: readonly {
        readonly task: {
            readonly c: number;
            readonly d: number;
        };
        readonly release: "up" | "down" | "none";
    }[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}

interface GraphEdge {
    readonly id?: string;
    readonly source: string;
    readonly target: string;
    readonly type: "normal" | "loop";
    readonly label?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

interface SystemConfig {
    readonly m?: number;
    readonly description?: string;
    readonly tasks: readonly {
        readonly c: number;
        readonly d: number;
        readonly name?: string;
    }[];
}

interface GraphArea {
    readonly id: string;
    readonly nodeIds: readonly string[];
    readonly label?: string;
    readonly labelPosition?:
        | "top-left"
        | "top-center"
        | "top-right"
        | "center"
        | "bottom-left"
        | "bottom-center"
        | "bottom-right";
    readonly fillColor?: string;
    readonly borderColor?: string;
    readonly hatch?: "single" | "cross";
    readonly metadata?: Readonly<Record<string, unknown>>;
}

interface TraversalContext {
    readonly graph: {
        readonly schemaVersion?: number;
        readonly nodes: readonly GraphNode[];
        readonly edges: readonly GraphEdge[];
        readonly system?: SystemConfig;
        readonly areas?: readonly GraphArea[];
        readonly layout?: {
            readonly algorithm: "dagre" | "concentric";
        };
    };
    readonly system: SystemConfig | undefined;
    readonly step: number;
    readonly expandedIds: readonly string[];
    readonly queueIds: readonly string[];
}
`;
export const PRESETS = [
	{
		id: 'bfs',
		name: 'BFS',
		description: 'FIFO · first discovered, first expanded',
		source: `function priority(state: TraversalState, context: TraversalContext): Priority {
  return state.insertionOrder;
}`
	},
	{
		id: 'myslack1',
		name: 'Hybrid Slack 1',
		description: 'Weighted active jobs and remaining work',
		source: `function priority(state: TraversalState, context: TraversalContext): Priority {
  let maxD = 0;
  let activeWeight = 0;
  let weightedWork = 0;
  state.tasks.forEach(({ c, d }, index) => {
    const weight = index + 1;
    if (index === 0 || d > maxD) maxD = d;
    if (c > 0) activeWeight += weight;
    weightedWork += c * weight;
  });
  return maxD + activeWeight - weightedWork;
}`
	},
	{
		id: 'myslack2',
		name: 'Hybrid Slack 2',
		description: 'Weighted work with an urgency bonus',
		source: `function priority(state: TraversalState, context: TraversalContext): Priority {
  let maxD = 0;
  let activeWeight = 0;
  let workBonus = 0;
  state.tasks.forEach(({ c, d }, index) => {
    const weight = index + 1;
    maxD = Math.max(maxD, d);
    if (c > 0) activeWeight += weight;
    const urgency = d > 0 ? c / d : 1;
    workBonus += c * weight * (3 + urgency);
  });
  return maxD + activeWeight - workBonus;
}`
	},
	{
		id: 'slack1',
		name: 'Slack 1',
		description: 'Sum of 1 − c/d; zero deadline contributes 1',
		source: `function priority(state: TraversalState, context: TraversalContext): Priority {
  return state.tasks.reduce(
    (total, { c, d }) => total + (d === 0 ? 1 : 1 - c / d),
    0
  );
}`
	},
	{
		id: 'slack2',
		name: 'Slack 2',
		description: 'Total deadlines divided by remaining work',
		source: `function priority(state: TraversalState, context: TraversalContext): Priority {
  const sumC = state.tasks.reduce((total, task) => total + task.c, 0);
  if (sumC === 0) return Number.MAX_VALUE;
  const sumD = state.tasks.reduce((total, task) => total + task.d, 0);
  return sumD / sumC;
}`
	},
	{
		id: 'pending',
		name: 'Burmuakov 2022',
		description: 'More unfinished jobs first (c > 0)',
		source: `function priority(state: TraversalState, context: TraversalContext): Priority {
  return -state.tasks.filter(task => task.c > 0).length;
}`
	}
];
