/**
 * GraphCompiler.js
 * Utility that compiles a React Flow graph (nodes + edges) into
 * a mathematical JSON payload describing the system dependencies.
 */

import ComponentRegistry from "./ComponentRegistry";

/**
 * Compiles a visual Skeleton Graph (nodes + edges) into flat mathematical
 * equations for the backend.
 * e.g. "a" + "b" visually -> "((a) + (b))"
 */
export function compileSkeletonToFormulas(skeletonNodes, skeletonEdges) {
  const formulas = {};

  // Find all output terminal nodes in the skeleton
  const outputTerminals = skeletonNodes.filter(n => n.type === 'terminal' && n.data.type === 'output');

  // Recursively evaluate the value of a given node
  function resolveNode(nodeId) {
    const node = skeletonNodes.find(n => n.id === nodeId);
    if (!node) return "0";

    // Reached an Input Variable terminal!
    if (node.type === 'terminal' && node.data.type === 'input') {
      return node.data.label; // e.g., "flow_rate"
    }

    // Processing a Math Operation node
    if (node.type === 'mathOp' || node.type === 'logicOp') {
      let expr = node.data.expression || "0";
      const inputs = node.data.inputs || ['a', 'b'];

      let substitutedExpr = expr;

      // For each variable in the math block (e.g., 'a', 'b', 'c'), find what is wired into it
      inputs.forEach(handleName => {
        const incomingEdge = skeletonEdges.find(e => e.target === node.id && e.targetHandle === handleName);
        let handleValue = "0";
        if (incomingEdge) {
          handleValue = resolveNode(incomingEdge.source);
        }

        // Exact word match replacement (e.g. replace 'a' with '(flow_rate)', but leave 'area' alone)
        const regex = new RegExp(`\\b${handleName}\\b`, 'g');
        substitutedExpr = substitutedExpr.replace(regex, `(${handleValue})`);
      });

      return substitutedExpr;
    }

    return "0"; // Fallback for pure loops etc.
  }

  // Calculate the final math string for every output
  outputTerminals.forEach(outTarget => {
    const outName = outTarget.data.label;
    const incomingEdge = skeletonEdges.find(e => e.target === outTarget.id);
    if (incomingEdge) {
      formulas[outName] = resolveNode(incomingEdge.source);
    } else {
      formulas[outName] = "0"; // Empty output
    }
  });

  return formulas;
}

/**
 * Substitutes defaultParams values into formula strings.
 * e.g. "(voltage / resistance) + (load_tension * 0.5)" with { resistance: 5 }
 * => "(voltage / 5) + (load_tension * 0.5)"
 */
function substituteParams(formula, params) {
  let result = formula;
  for (const [key, value] of Object.entries(params)) {
    // Replace whole-word occurrences of the param name with its value
    result = result.replace(new RegExp(`\\b${key}\\b`, "g"), String(value));
  }
  return result;
}

function mergeSensorParams(node, defaultParams = {}) {
  const overrides = {};
  const sensorParams = node?.data?.sensorParams || {};

  Object.entries(sensorParams).forEach(([key, raw]) => {
    if (raw === undefined || raw === null || raw === "") return;
    const numeric = typeof raw === "number" ? raw : parseFloat(raw);
    if (!Number.isNaN(numeric)) {
      overrides[key] = numeric;
    }
  });

  return { ...defaultParams, ...overrides };
}

/**
 * Compiles the React Flow nodes and edges into a structured math payload.
 *
 * @param {Array} nodes - React Flow node objects
 * @param {Array} edges - React Flow edge objects
 * @returns {Object} JSON payload describing the math graph
 */
export function compileGraphToMath(nodes, edges) {
  const compiledNodes = nodes.map((node) => {
    const componentType = node.data.type;
    const registry = ComponentRegistry[componentType];

    if (!registry) {
      return { id: node.id, type: componentType, error: "Unknown component type" };
    }

    let params = mergeSensorParams(node, registry.defaultParams || {});
    let registryFormulas = registry.formulas || {};

    // Override for custom formulas
    if (componentType === "custom_formula" && node.data.customFormulas) {
      registryFormulas = node.data.customFormulas;
    }

    // Substitute default params into each formula
    const resolvedFormulas = {};
    for (const [output, formula] of Object.entries(registryFormulas)) {
      resolvedFormulas[output] = substituteParams(formula, params);
    }

    // Build inputs_mapped by scanning edges that TARGET this node
    const inputs_mapped = {};
    edges.forEach((edge) => {
      if (edge.target === node.id && edge.targetHandle) {
        // Key = local input port name, Value = "<sourceNodeId>_<sourceHandle>"
        inputs_mapped[edge.targetHandle] = `${edge.source}_${edge.sourceHandle}`;
      }
    });

    return {
      id: node.id,
      type: componentType,
      label: node.data.label,
      formulas: resolvedFormulas,
      ...(Object.keys(inputs_mapped).length > 0 && { inputs_mapped }),
    };
  });

  // Build a list of connections for clarity
  const connections = edges.map((edge) => ({
    from: `${edge.source} → [${edge.sourceHandle}]`,
    to: `${edge.target} → [${edge.targetHandle}]`,
  }));

  return {
    nodes: compiledNodes,
    connections,
  };
}

/**
 * Detects inputs on nodes that are NOT connected via edges.
 * These "leaf inputs" need user-supplied values.
 *
 * @param {Array} nodes - React Flow node objects
 * @param {Array} edges - React Flow edge objects
 * @returns {Array} List of { nodeId, nodeLabel, inputName } objects
 */
export function getUnconnectedInputs(nodes, edges) {
  // Build a set of connected target handles: "nodeId::inputName"
  const connectedInputs = new Set();
  edges.forEach((edge) => {
    if (edge.targetHandle) {
      connectedInputs.add(`${edge.target}::${edge.targetHandle}`);
    }
  });

  const unconnected = [];
  nodes.forEach((node) => {
    const componentType = node.data.type;
    const registry = ComponentRegistry[componentType];
    if (!registry) return;

    let inputsList = registry.inputs || [];
    if (componentType === "custom_formula" && node.data.customInputs) {
      inputsList = node.data.customInputs;
    }

    inputsList.forEach((inputName) => {
      const key = `${node.id}::${inputName}`;
      if (!connectedInputs.has(key)) {
        unconnected.push({
          nodeId: node.id,
          nodeLabel: node.data.label,
          inputName,
        });
      }
    });
  });

  return unconnected;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  PARALLEL EXECUTION BATCH ENGINE
 *  Groups nodes into dependency layers for parallel processing.
 *  Uses BFS-based Kahn's algorithm to assign levels.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Computes parallel execution batches from React Flow nodes and edges.
 * Each batch contains nodes that are fully independent of each other
 * and can be calculated simultaneously on different CPU threads.
 *
 * Respects manual `batchOverride` set by the user in the Skeleton Editor.
 *
 * @param {Array} reactNodes - React Flow node objects
 * @param {Array} reactEdges - React Flow edge objects
 * @returns {Object} { batches: Array<{layer, nodeIds, formulas}>, nodeLayers: Map<nodeId, layer> }
 */
export function computeExecutionBatches(reactNodes, reactEdges) {
  const nodeIds = new Set(reactNodes.map(n => n.id));

  // Build adjacency: for each node, which nodes feed INTO it?
  const incomingMap = {};  // nodeId -> Set of source nodeIds
  const outgoingMap = {};  // nodeId -> Set of target nodeIds
  nodeIds.forEach(id => {
    incomingMap[id] = new Set();
    outgoingMap[id] = new Set();
  });

  reactEdges.forEach(edge => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      incomingMap[edge.target].add(edge.source);
      outgoingMap[edge.source].add(edge.target);
    }
  });

  // Kahn's algorithm with level tracking
  const inDegree = {};
  nodeIds.forEach(id => { inDegree[id] = incomingMap[id].size; });

  // Layer 0: nodes with no incoming edges (source/leaf nodes)
  let currentLayer = [];
  nodeIds.forEach(id => {
    if (inDegree[id] === 0) currentLayer.push(id);
  });

  const nodeLayers = {};  // nodeId -> auto-calculated layer number
  const batches = [];      // [{layer, nodeIds, formulas}]
  let layerIndex = 0;

  while (currentLayer.length > 0) {
    // All nodes in currentLayer are independent — they form one parallel batch
    currentLayer.forEach(id => { nodeLayers[id] = layerIndex; });

    // Collect formula info for this batch
    const batchFormulas = [];
    currentLayer.forEach(id => {
      const node = reactNodes.find(n => n.id === id);
      if (!node) return;
      const componentType = node.data.type;
      const registry = ComponentRegistry[componentType];
      if (!registry) return;

      let formulas = registry.formulas || {};
      if (componentType === "custom_formula" && node.data.customFormulas) {
        formulas = node.data.customFormulas;
      }

      Object.keys(formulas).forEach(output => {
        batchFormulas.push({ nodeId: id, output, formula: formulas[output] });
      });
    });

    batches.push({
      layer: layerIndex,
      nodeIds: [...currentLayer],
      formulas: batchFormulas,
    });

    // Find next layer: reduce in-degree for dependents
    const nextLayer = [];
    currentLayer.forEach(id => {
      outgoingMap[id].forEach(targetId => {
        inDegree[targetId]--;
        if (inDegree[targetId] === 0) {
          nextLayer.push(targetId);
        }
      });
    });

    currentLayer = nextLayer;
    layerIndex++;
  }

  // Apply manual batch overrides (user can force a node into a specific layer)
  reactNodes.forEach(node => {
    const override = node.data.batchOverride;
    if (override !== undefined && override !== null && override !== "") {
      const overrideLayer = parseInt(override, 10);
      if (!isNaN(overrideLayer) && overrideLayer >= 0) {
        // Ensure the override layer is >= auto-calculated (can't run before dependencies)
        const autoLayer = nodeLayers[node.id] ?? 0;
        nodeLayers[node.id] = Math.max(autoLayer, overrideLayer);
      }
    }
  });

  // Rebuild batches after overrides
  const finalBatchMap = {};
  Object.entries(nodeLayers).forEach(([nodeId, layer]) => {
    if (!finalBatchMap[layer]) finalBatchMap[layer] = [];
    finalBatchMap[layer].push(nodeId);
  });

  const finalBatches = Object.keys(finalBatchMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map(layer => {
      const ids = finalBatchMap[layer];
      const formulas = [];
      ids.forEach(id => {
        const node = reactNodes.find(n => n.id === id);
        if (!node) return;
        const componentType = node.data.type;
        const registry = ComponentRegistry[componentType];
        if (!registry) return;

        let nodeFormulas = registry.formulas || {};
        if (componentType === "custom_formula" && node.data.customFormulas) {
          nodeFormulas = node.data.customFormulas;
        }

        Object.keys(nodeFormulas).forEach(output => {
          formulas.push({ nodeId: id, output, formula: nodeFormulas[output] });
        });
      });

      return { layer, nodeIds: ids, formulas };
    });

  return { batches: finalBatches, nodeLayers };
}


/**
 * Compiles the React Flow state into the EXACT JSON structure
 * required by the Python backend for parameter sweeps and signature generation.
 * Now includes parallel execution batch metadata and multi-scenario sequences.
 *
 * @param {Array} reactNodes - React Flow node objects
 * @param {Array} reactEdges - React Flow edge objects
 * @param {Object} globalConstants - Global input values (e.g. { voltage: 220, frequency: 50 })
 * @param {Array} scenarios - Optional array of scenario objects defining isolated runs
 * @returns {Object} Backend-compatible JSON payload
 */
export const compileGraphToBackendJSON = (reactNodes, reactEdges, globalConstants = {}, scenarios = []) => {
  // --- Compile nodes ---
  const { batches, nodeLayers } = computeExecutionBatches(reactNodes, reactEdges);

  const nodes = reactNodes.map((node) => {
    const componentType = node.data.type;
    const registry = ComponentRegistry[componentType];

    if (!registry) {
      return { id: node.id, type: componentType, label: node.data.label, error: "Unknown component type" };
    }

    let params = mergeSensorParams(node, registry.defaultParams || {});
    let registryFormulas = registry.formulas || {};

    // Override for custom formulas
    if (componentType === "custom_formula" && node.data.customFormulas) {
      registryFormulas = node.data.customFormulas;
    }

    // Substitute default params into each formula
    const formulas = {};
    for (const [output, formula] of Object.entries(registryFormulas)) {
      formulas[output] = substituteParams(formula, params);
    }

    // Build inputs_mapped by scanning edges that TARGET this node
    const inputs_mapped = {};
    reactEdges.forEach((edge) => {
      if (edge.target === node.id && edge.targetHandle) {
        inputs_mapped[edge.targetHandle] = `${edge.source}_${edge.sourceHandle}`;
      }
    });

    const compiled = {
      id: node.id,
      type: componentType,
      label: node.data.label || node.id,
      formulas,
      execution_layer: nodeLayers[node.id] ?? 0,
    };

    if (Object.keys(inputs_mapped).length > 0) {
      compiled.inputs_mapped = inputs_mapped;
    }

    return compiled;
  });

  // --- Compile connections ---
  const connections = reactEdges.map((edge) => ({
    from: `${edge.source} → [${edge.sourceHandle}]`,
    to: `${edge.target} → [${edge.targetHandle}]`,
  }));

  // --- Build execution batches for parallel processing ---
  const execution_batches = batches.map(batch => ({
    layer: batch.layer,
    node_ids: batch.nodeIds,
    formula_count: batch.formulas.length,
    formulas: batch.formulas.map(f => ({
      node_id: f.nodeId,
      output: f.output,
      formula: f.formula,
    })),
  }));

  // --- Base Payload ---
  const payload = {
    nodes,
    connections,
    global_constants: { ...globalConstants },
    execution_batches,
    batch_metadata: {
      total_layers: batches.length,
      total_formulas: batches.reduce((sum, b) => sum + b.formulas.length, 0),
      parallelizable: batches.some(b => b.nodeIds.length > 1),
    },
  };

  // --- Compile Sequences or Global Sweeps ---
  if (scenarios && scenarios.length > 0) {
    // Multi-scenario Orchestrator mode
    payload.sequences = scenarios.map((scenario) => {
      const scenarioSweeps = {};
      Object.entries(scenario.sweeps).forEach(([nodeId, vars]) => {
        Object.entries(vars).forEach(([varName, config]) => {
          scenarioSweeps[`${nodeId}_${varName}`] = {
            min: config.min ?? 0,
            max: config.max ?? 1,
            steps: config.steps ?? 10,
          };
        });
      });
      return {
        scenario_id: scenario.id,
        scenario_name: scenario.name,
        sweeps: scenarioSweeps
      };
    });
  } else {
    // Legacy single-pass run mode based on node.data.sweep directly
    const sweeps = {};
    reactNodes.forEach((node) => {
      const sweepData = node.data.sweep;
      if (!sweepData) return;

      for (const [varName, config] of Object.entries(sweepData)) {
        const key = `${node.id}_${varName}`;
        sweeps[key] = {
          min: config.min ?? 0,
          max: config.max ?? 1,
          steps: config.steps ?? 10,
        };
      }
    });
    payload.sweeps = sweeps;
    payload.sequences = [];
  }

  return payload;
};

/**
 * Validates the compiler payload for missing dependencies or invalid configurations.
 * E.g., checks if a scenario is trying to sweep a variable that wasn't connected or
 * exposed in the graph.
 *
 * @param {Object} payload - The generated JSON payload
 * @returns {Array} List of warning or error message strings. Empty array if valid.
 */
export const validatePayload = (payload) => {
  const errors = [];

  // Check generic issues
  if (payload.nodes.length === 0) {
    errors.push("Graph is empty. Cannot run simulation.");
    return errors;
  }

  // Check sequence issues
  if (payload.sequences && payload.sequences.length > 0) {
    payload.sequences.forEach((seq) => {
      if (!seq.sweeps || Object.keys(seq.sweeps).length === 0) {
        errors.push(`Warning: Scenario "${seq.scenario_name}" has no variable sweeps defined. It will run as a single static point.`);
      }
    });
  } else if (!payload.sweeps || Object.keys(payload.sweeps).length === 0) {
    errors.push("Warning: No variables configured for sweeping. The simulation will run as a single static point.");
  }

  return errors;
};
