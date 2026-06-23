// Task representation: (c, d) = (remaining computation time, relative deadline)
export interface TaskState {
  c: number; // remaining computation time
  d: number; // relative deadline for current job
}

// Job release indicator per task
export type ReleaseIndicator = 'up' | 'down' | 'none';

export interface NodeTaskDisplay {
  task: TaskState;
  release: ReleaseIndicator; // arrow up = job released, arrow down = job completing
}

export interface GraphNode {
  id: string;
  label?: string;
  tasks: NodeTaskDisplay[];
  isInitial?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  type: 'normal' | 'job-release'; // job-release = dashed red arc
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemConfig {
  tasks: Array<{ c: number; d: number; name?: string }>;
  m?: number; // number of processors
  description?: string;
}

export interface GraphFile {
  system?: SystemConfig;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: {
    name: 'dagre' | 'fcose' | 'cola' | 'breadthfirst' | 'grid';
    options?: Record<string, unknown>;
  };
}

// Cytoscape element types
export interface CytoscapeNodeData {
  id: string;
  label: string;
  tasks: NodeTaskDisplay[];
  isInitial: boolean;
  width: number;
  height: number;
}

export interface CytoscapeEdgeData {
  id: string;
  source: string;
  target: string;
  type: 'normal' | 'job-release';
  label?: string;
}
