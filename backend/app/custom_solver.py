"""
custom_solver.py
Lightweight solver for dynamic graphs sent from the frontend's GraphCompiler.

Accepts {nodes, connections} and solves formulas in topological order,
resolving inter-node dependencies via inputs_mapped.
"""

from __future__ import annotations

import re
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional

from .nodes import SafeMathEvaluator, _ALLOWED_FUNCTIONS


def _js_to_python_formula(formula: str) -> str:
    """Convert JavaScript-style math calls to Python-compatible ones."""
    result = formula
    result = result.replace("Math.sqrt", "sqrt")
    result = result.replace("Math.max", "max")
    result = result.replace("Math.min", "min")
    result = result.replace("Math.abs", "abs")
    result = result.replace("Math.pow", "pow")
    result = result.replace("Math.round", "round")
    result = result.replace("Math.sin", "sin")
    result = result.replace("Math.cos", "cos")
    result = result.replace("Math.tan", "tan")
    result = result.replace("Math.log", "log")
    result = result.replace("Math.exp", "exp")
    result = result.replace("Math.PI", "3.141592653589793")
    return result


def _parse_source_ref(ref: str, node_ids: set[str]) -> tuple[str, str] | None:
    """
    Parse a source reference like 'pid_controller_1_control_output'
    into (node_id, output_name).

    Strategy: try to match against known node IDs by finding the longest
    node_id prefix, then the remainder is the output handle.
    """
    for nid in sorted(node_ids, key=len, reverse=True):
        if ref.startswith(nid + "_"):
            output_name = ref[len(nid) + 1:]
            return (nid, output_name)
    return None


def solve_custom_graph(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
    global_inputs: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Solve a dynamic graph from the frontend.

    Each node has:
      - id: unique identifier
      - type: component type
      - label: display label
      - formulas: {output_name: formula_string}
      - inputs_mapped (optional): {input_name: "sourceNodeId_sourceHandle"}

    Returns computed outputs per node and a flat system state.
    """
    global_inputs = global_inputs or {}

    node_map: Dict[str, Dict[str, Any]] = {}
    for node in nodes:
        node_map[node["id"]] = node

    node_ids = set(node_map.keys())

    # --- Build dependency graph from inputs_mapped ---
    in_degree: Dict[str, int] = {nid: 0 for nid in node_ids}
    graph: Dict[str, List[str]] = defaultdict(list)

    for node in nodes:
        inputs_mapped = node.get("inputs_mapped", {})
        for _input_name, source_ref in inputs_mapped.items():
            parsed = _parse_source_ref(source_ref, node_ids)
            if parsed:
                source_node_id, _ = parsed
                graph[source_node_id].append(node["id"])
                in_degree[node["id"]] += 1

    # --- Topological sort ---
    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
    topo_order: List[str] = []
    while queue:
        nid = queue.popleft()
        topo_order.append(nid)
        for nxt in graph[nid]:
            in_degree[nxt] -= 1
            if in_degree[nxt] == 0:
                queue.append(nxt)

    if len(topo_order) != len(node_ids):
        raise ValueError("Graph contains a cycle — cannot solve.")

    # --- Solve in topological order ---
    # Global namespace: all computed outputs stored as flat keys
    system_state: Dict[str, float] = dict(global_inputs)
    node_outputs: Dict[str, Dict[str, float]] = {}

    # Build functions dict (exclude var since we don't use it here)
    functions = {k: v for k, v in _ALLOWED_FUNCTIONS.items() if v is not None}

    for nid in topo_order:
        node = node_map[nid]
        formulas = node.get("formulas", {})
        inputs_mapped = node.get("inputs_mapped", {})

        # Build local namespace for this node
        local_ns: Dict[str, float] = dict(system_state)

        # Resolve inputs_mapped: map local input names to values from source outputs
        for input_name, source_ref in inputs_mapped.items():
            parsed = _parse_source_ref(source_ref, node_ids)
            if parsed:
                source_nid, source_output = parsed
                # Look up the value from the source node's computed outputs
                value = node_outputs.get(source_nid, {}).get(source_output, 0.0)
                local_ns[input_name] = value

        # Evaluate each formula
        outputs: Dict[str, float] = {}
        evaluator = SafeMathEvaluator(names=local_ns, functions=functions)

        for output_name, formula in formulas.items():
            py_formula = _js_to_python_formula(formula)
            try:
                value = float(evaluator.eval(py_formula))
            except Exception as e:
                value = 0.0  # Fallback on eval errors
            outputs[output_name] = value
            # Store in local namespace so subsequent formulas in same node can reference it
            local_ns[output_name] = value

        node_outputs[nid] = outputs

        # Publish outputs to system state
        for out_name, out_val in outputs.items():
            system_state[out_name] = out_val
            system_state[f"{nid}_{out_name}"] = out_val

    return {
        "topological_order": topo_order,
        "node_outputs": node_outputs,
        "system_state": system_state,
    }


# ═══════════════════════════════════════════════════════════════
#  PARALLEL BATCH SOLVER
#  Executes formulas layer-by-layer using a thread pool.
#  All formulas within a single layer run in parallel (no dependencies).
#  Barrier sync between layers guarantees correctness.
# ═══════════════════════════════════════════════════════════════

import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed


def _compute_execution_layers(
    nodes: List[Dict[str, Any]],
    node_ids: set[str],
    graph: Dict[str, List[str]],
    in_degree: Dict[str, int],
) -> Dict[int, List[str]]:
    """
    Compute execution layers using BFS-based Kahn's algorithm.
    Returns a dict mapping layer_index -> list of node_ids.
    Respects manual `execution_layer` overrides from the frontend.
    """
    # Work on a copy so we don't mutate the original
    deg = dict(in_degree)

    # Layer 0: nodes with no incoming edges
    current_layer = [nid for nid, d in deg.items() if d == 0]
    auto_layers: Dict[str, int] = {}
    layer_idx = 0

    while current_layer:
        for nid in current_layer:
            auto_layers[nid] = layer_idx

        next_layer = []
        for nid in current_layer:
            for target in graph.get(nid, []):
                deg[target] -= 1
                if deg[target] == 0:
                    next_layer.append(target)

        current_layer = next_layer
        layer_idx += 1

    # Apply manual overrides from frontend (execution_layer field)
    node_map_local = {n["id"]: n for n in nodes}
    for nid, auto_layer in auto_layers.items():
        node = node_map_local.get(nid)
        if node:
            override = node.get("execution_layer")
            if override is not None:
                # Can only push to later layers, never earlier (would break deps)
                auto_layers[nid] = max(auto_layer, int(override))

    # Group by layer
    layers: Dict[int, List[str]] = defaultdict(list)
    for nid, layer in auto_layers.items():
        layers[layer].append(nid)

    return dict(sorted(layers.items()))


def _evaluate_node(
    nid: str,
    node: Dict[str, Any],
    system_state: Dict[str, float],
    node_outputs: Dict[str, Dict[str, float]],
    node_ids: set[str],
    functions: Dict,
) -> tuple[str, Dict[str, float]]:
    """
    Evaluate a single node's formulas. Thread-safe because it only READS
    from system_state/node_outputs (which are fully resolved for prior layers)
    and returns its computed outputs without mutating shared state.
    """
    formulas = node.get("formulas", {})
    inputs_mapped = node.get("inputs_mapped", {})

    # Build local namespace
    local_ns: Dict[str, float] = dict(system_state)

    # Resolve mapped inputs
    for input_name, source_ref in inputs_mapped.items():
        parsed = _parse_source_ref(source_ref, node_ids)
        if parsed:
            source_nid, source_output = parsed
            value = node_outputs.get(source_nid, {}).get(source_output, 0.0)
            local_ns[input_name] = value

    # Evaluate formulas
    outputs: Dict[str, float] = {}
    evaluator = SafeMathEvaluator(names=local_ns, functions=functions)

    for output_name, formula in formulas.items():
        py_formula = _js_to_python_formula(formula)
        try:
            value = float(evaluator.eval(py_formula))
        except Exception:
            value = 0.0
        outputs[output_name] = value
        local_ns[output_name] = value

    return nid, outputs


def solve_custom_graph_parallel(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
    global_inputs: Optional[Dict[str, float]] = None,
    max_workers: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Parallel batch solver for dynamic graphs from the frontend.

    Executes formulas layer-by-layer:
      - Layer 0: all source/leaf nodes (no dependencies) → parallel
      - Layer 1: nodes depending only on Layer 0 → parallel
      - Layer N: depends on layers < N → parallel
      - Barrier sync between each layer

    Thread count defaults to the number of available CPU cores.
    """
    global_inputs = global_inputs or {}
    t_start = time.perf_counter()

    node_map: Dict[str, Dict[str, Any]] = {n["id"]: n for n in nodes}
    node_ids = set(node_map.keys())

    # Build dependency graph
    in_degree: Dict[str, int] = {nid: 0 for nid in node_ids}
    graph: Dict[str, List[str]] = defaultdict(list)

    for node in nodes:
        for _input_name, source_ref in node.get("inputs_mapped", {}).items():
            parsed = _parse_source_ref(source_ref, node_ids)
            if parsed:
                source_node_id, _ = parsed
                graph[source_node_id].append(node["id"])
                in_degree[node["id"]] += 1

    # Compute execution layers
    layers = _compute_execution_layers(nodes, node_ids, graph, in_degree)

    # Determine thread pool size
    cpu_count = os.cpu_count() or 4
    workers = max_workers or min(cpu_count, 8)

    # Prepare shared state
    system_state: Dict[str, float] = dict(global_inputs)
    node_outputs: Dict[str, Dict[str, float]] = {}
    functions = {k: v for k, v in _ALLOWED_FUNCTIONS.items() if v is not None}

    batch_log: List[Dict[str, Any]] = []

    # Execute layer by layer
    for layer_idx in sorted(layers.keys()):
        layer_node_ids = layers[layer_idx]
        layer_start = time.perf_counter()

        if len(layer_node_ids) == 1:
            # Single node — no thread overhead needed
            nid = layer_node_ids[0]
            _, outputs = _evaluate_node(
                nid, node_map[nid], system_state, node_outputs, node_ids, functions
            )
            node_outputs[nid] = outputs
            for out_name, out_val in outputs.items():
                system_state[out_name] = out_val
                system_state[f"{nid}_{out_name}"] = out_val
        else:
            # Multiple nodes — fire them all in parallel
            with ThreadPoolExecutor(max_workers=min(workers, len(layer_node_ids))) as pool:
                futures = {
                    pool.submit(
                        _evaluate_node,
                        nid, node_map[nid], system_state, node_outputs, node_ids, functions
                    ): nid
                    for nid in layer_node_ids
                }

                for future in as_completed(futures):
                    nid, outputs = future.result()
                    node_outputs[nid] = outputs

            # ── BARRIER SYNC ──
            # After all threads complete, publish results to shared state
            for nid in layer_node_ids:
                for out_name, out_val in node_outputs.get(nid, {}).items():
                    system_state[out_name] = out_val
                    system_state[f"{nid}_{out_name}"] = out_val

        layer_elapsed = time.perf_counter() - layer_start
        batch_log.append({
            "layer": layer_idx,
            "node_count": len(layer_node_ids),
            "node_ids": layer_node_ids,
            "elapsed_ms": round(layer_elapsed * 1000, 3),
            "parallel": len(layer_node_ids) > 1,
        })

    total_elapsed = time.perf_counter() - t_start

    return {
        "node_outputs": node_outputs,
        "system_state": system_state,
        "batch_execution_log": batch_log,
        "execution_metadata": {
            "total_layers": len(layers),
            "total_nodes": len(node_ids),
            "thread_pool_size": workers,
            "cpu_cores_available": cpu_count,
            "total_elapsed_ms": round(total_elapsed * 1000, 3),
            "parallelizable_layers": sum(1 for l in batch_log if l["parallel"]),
        },
    }

