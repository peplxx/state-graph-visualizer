# State Graph Visualizer

[![Demo](https://img.shields.io/badge/-State_Graph_Visualizer-76283F?style=for-the-badge&logo=vercel&logoColor=white)](https://state-graph-visualizer-alpha.vercel.app/)
[![CI](https://github.com/peplxx/state-graph-visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/peplxx/state-graph-visualizer/actions/workflows/ci.yml)

An interactive viewer for exploring state-transition graphs and schedules in real-time systems. It works alongside [libstgx](https://github.com/peplxx/libstgx/tree/main), a C++ library for building and validating these graphs: export a graph as YAML, then open it here to explore its states, connections, and schedules.

![Radial graph with a branch highlighted in burgundy](docs/screenshots/radial-overview.png)

Use **Upload graph** to add files to your workspace, then **Open Explorer** to inspect one. The **Graphs** menu opens loaded graphs; **New window** opens the Explorer picker. Closing an Explorer keeps its graph in the library. Drag tabs to reorder or double-click to rename. Graphs and tabs restore locally in the same browser; a dot marks changes that still need **Save**.

## Explore states and schedules

Switch between radial and tree layouts, zoom into a branch, or find a node by ID. Select a state to inspect its tasks, connections, and schedule along a path from the initial state. Toggle deadline markers and export the schedule as SVG.

![Selected state, task details, and a schedule for three tasks on two processors](docs/screenshots/state-schedule.png)

## Analyze groups and create areas

Hold **Ctrl / Cmd** and click to add or remove nodes from a selection, or **Shift-drag** to select a group with the lasso. The sidebar shows selected IDs, internal edges, incoming and outgoing connections, and total node degrees.

Click **Create area from selection** to turn the group into a named visual region, or use **Assign to Area** to move it into an existing one. Customize its label, fill, border, and hatching; toggle its visibility or use **Select nodes** to inspect the group again.

![Four selected nodes grouped into an area, with internal and external connection counts](docs/screenshots/group-analysis.png)

## Import and export

Load YAML or JSON graphs. **Save** stores graph changes in the workspace; **Download YAML** downloads a file without changing its saved status; **Export** saves the graph as SVG. Browse the [examples](examples) or read the [YAML format documentation](docs/graph-format.md). The examples were generated with the [GFP tool in libstgx](https://github.com/peplxx/libstgx/tree/main/examples/gfp), using the parameters in each file with state pruning disabled.

## Run locally

Requires Node.js 22 (22.12 or newer) and Bun 1.3.6.

```sh
bun install --frozen-lockfile
bun run dev
```

Open the URL printed in the terminal, upload a graph, then open it in an Explorer.

## Checks

```sh
bun run build      # TypeScript checks and production build
bun run test       # Workspace state and persistence tests
bun run lint       # Oxlint errors and warnings
bun run fmt:check  # Formatting check
```

GitHub Actions runs these checks on pushes and pull requests. Run `bun run fmt` to fix formatting locally; file exclusions are defined in `.oxfmtrc.json`.

## Simulate a traversal

Choose **New window → Traversal Simulator**, then a loaded graph. Each simulator is independent of Explorer and other runs. Select start nodes if needed and press **Start traversal** to evaluate the initial queue.

Write a synchronous TypeScript `priority(state, context)` function returning a finite number or a non-empty tuple of finite numbers. Smaller values come first; tuples compare left to right and equal priorities preserve insertion order. The result kind and tuple length must remain consistent throughout a run. The editor checks types and offers field completions with **Ctrl+Space**. Inputs are read-only; use a pure function for reproducible new runs. Imports are not supported, and a priority evaluation exceeding two seconds is stopped in a worker without committing the unfinished step.

Each step expands the first queued node, considers all its outgoing transitions (including returns), adds newly discovered states once, and evaluates the remaining queue for the next step. `state` includes flattened task data (`c`, `d`, `release`), `depth`, `parentId`, and `insertionOrder`. `context` includes `graph`, `system`, `step`, `expandedIds`, and insertion-ordered `queueIds`. BFS, DFS, and most-pending-jobs examples are included. This explores the supplied graph; it does not generate new states or implement pruning/schedulability tests from the papers.

Use **Next step**, **Play**, or **To end**, and rewind with the timeline. The queue and node badges show the priorities at the selected step. Applying changed code starts a new branch at that step and automatically saves the previous branch in **Records**. Replay reads recorded results without executing the draft. Continuing beyond the computed history evaluates the active recorded strategy.

Save named strategies to use with any graph. **Save recording** keeps a run, its strategy revisions, and a graph snapshot independently of tabs and the graph library. Saved records are also accessible through **New window → Traversal Simulator → Open saved recordings**. The workspace, draft, timeline position, and view autosave in this browser and restore paused. Storage errors are reported without discarding the in-memory session.
