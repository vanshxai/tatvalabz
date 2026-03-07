"""
solver.py — Self-contained math solver for Pyodide (WebAssembly).
Combines SafeMathEvaluator + _ALLOWED_FUNCTIONS + custom_solver logic
into a single file with ZERO external dependencies beyond Python stdlib.

Supports:
  - Single static point execution
  - Multi-scenario sweep execution (sequences with min/max/steps)
"""

from __future__ import annotations

import ast
import math
import json
import re
import time
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional
import itertools


# ═══════════════════════════════════════════════════════════
#  SAFE MATH EVALUATOR (from nodes.py)
# ═══════════════════════════════════════════════════════════

_ALLOWED_FUNCTIONS = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "sqrt": math.sqrt,
    "pow": pow,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "exp": math.exp,
}


class SafeMathEvaluator:
    def __init__(self, names: Dict[str, Any], functions: Dict[str, Any]):
        self.names = names
        self.functions = functions

    def eval(self, expression: str) -> float:
        tree = ast.parse(expression, mode="eval")
        return float(self._visit(tree.body))

    def _visit(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value
            if isinstance(node.value, str):
                return node.value
            raise ValueError("Unsupported constant")

        if isinstance(node, ast.Name):
            return self.names.get(node.id, 0.0)

        if isinstance(node, ast.BinOp):
            left = self._visit(node.left)
            right = self._visit(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right if right != 0 else 0.0
            if isinstance(node.op, ast.Mod):
                return left % right if right != 0 else 0.0
            if isinstance(node.op, ast.Pow):
                return left ** right
            raise ValueError("Unsupported binary operator")

        if isinstance(node, ast.UnaryOp):
            operand = self._visit(node.operand)
            if isinstance(node.op, ast.UAdd):
                return +operand
            if isinstance(node.op, ast.USub):
                return -operand
            raise ValueError("Unsupported unary operator")

        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("Only direct function calls are allowed")
            fn_name = node.func.id
            fn = self.functions.get(fn_name)
            if fn is None:
                raise ValueError(f"Function not allowed: {fn_name}")
            args = [self._visit(arg) for arg in node.args]
            return fn(*args)

        raise ValueError(f"Unsupported expression node: {type(node).__name__}")


# ═══════════════════════════════════════════════════════════
#  FORMULA HELPERS
# ═══════════════════════════════════════════════════════════

def _js_to_python_formula(formula: str) -> str:
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


def _parse_source_ref(ref: str, node_ids: set) -> tuple | None:
    for nid in sorted(node_ids, key=len, reverse=True):
        if ref.startswith(nid + "_"):
            output_name = ref[len(nid) + 1:]
            return (nid, output_name)
    return None


# ═══════════════════════════════════════════════════════════
#  CORE SINGLE-PASS SOLVER
# ═══════════════════════════════════════════════════════════

def _solve_single_pass(nodes, connections, global_inputs):
    """Solve the graph once for a single set of global_inputs."""
    node_map = {n["id"]: n for n in nodes}
    node_ids = set(node_map.keys())

    in_degree = {nid: 0 for nid in node_ids}
    graph = defaultdict(list)

    for node in nodes:
        for _input_name, source_ref in node.get("inputs_mapped", {}).items():
            parsed = _parse_source_ref(source_ref, node_ids)
            if parsed:
                source_node_id, _ = parsed
                graph[source_node_id].append(node["id"])
                in_degree[node["id"]] += 1

    # Topological sort
    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
    topo_order = []
    while queue:
        nid = queue.popleft()
        topo_order.append(nid)
        for nxt in graph[nid]:
            in_degree[nxt] -= 1
            if in_degree[nxt] == 0:
                queue.append(nxt)

    if len(topo_order) != len(node_ids):
        raise ValueError("Graph contains a cycle — cannot solve.")

    system_state = dict(global_inputs)
    node_outputs = {}
    functions = dict(_ALLOWED_FUNCTIONS)

    for nid in topo_order:
        node = node_map[nid]
        formulas = node.get("formulas", {})
        inputs_mapped = node.get("inputs_mapped", {})

        local_ns = dict(system_state)

        for input_name, source_ref in inputs_mapped.items():
            parsed = _parse_source_ref(source_ref, node_ids)
            if parsed:
                source_nid, source_output = parsed
                value = node_outputs.get(source_nid, {}).get(source_output, 0.0)
                local_ns[input_name] = value

        outputs = {}
        evaluator = SafeMathEvaluator(names=local_ns, functions=functions)

        for output_name, formula in formulas.items():
            py_formula = _js_to_python_formula(formula)
            try:
                value = float(evaluator.eval(py_formula))
            except Exception:
                value = 0.0
            outputs[output_name] = value
            local_ns[output_name] = value

        node_outputs[nid] = outputs

        for out_name, out_val in outputs.items():
            system_state[out_name] = out_val
            system_state[f"{nid}_{out_name}"] = out_val

    return {
        "topological_order": topo_order,
        "node_outputs": node_outputs,
        "system_state": system_state,
    }


# ═══════════════════════════════════════════════════════════
#  SWEEP ENGINE — Generates parameter ranges
# ═══════════════════════════════════════════════════════════

def _generate_sweep_points(sweeps):
    """
    Given a dict of {var_name: {min, max, steps}},
    generate all combinations of sweep values.
    Returns (var_names_list, list_of_value_tuples).
    """
    if not sweeps:
        return [], [()]

    var_names = sorted(sweeps.keys())
    ranges = []
    for var in var_names:
        cfg = sweeps[var]
        mn = float(cfg.get("min", 0))
        mx = float(cfg.get("max", 1))
        steps = int(cfg.get("steps", 10))
        if steps < 1:
            steps = 1
        if steps == 1:
            ranges.append([mn])
        else:
            step_size = (mx - mn) / (steps - 1)
            ranges.append([mn + i * step_size for i in range(steps)])

    # Cartesian product of all sweep dimensions
    combos = list(itertools.product(*ranges))
    return var_names, combos


# ═══════════════════════════════════════════════════════════
#  MULTI-SCENARIO ORCHESTRATOR
# ═══════════════════════════════════════════════════════════

def solve_custom_graph(nodes, connections, global_inputs=None, sequences=None, sweeps=None):
    """
    Full solver supporting:
      - Static single-pass (no sweeps)
      - Global sweeps (legacy mode)
      - Multi-scenario sequences (Orchestrator mode)
    """
    global_inputs = global_inputs or {}
    t_start = time.time()

    results = {}

    # ── Case 1: Multi-Scenario Sequences ──
    if sequences and len(sequences) > 0:
        scenario_results = []
        for seq in sequences:
            scenario_sweeps = seq.get("sweeps", {})
            scenario_name = seq.get("scenario_name", "Unnamed")
            scenario_id = seq.get("scenario_id", "unknown")

            if not scenario_sweeps:
                # No sweeps → single static run for this scenario
                single = _solve_single_pass(nodes, connections, global_inputs)
                scenario_results.append({
                    "scenario_id": scenario_id,
                    "scenario_name": scenario_name,
                    "sweep_points": 1,
                    "data_points": [single["node_outputs"]],
                    "system_states": [single["system_state"]],
                })
            else:
                var_names, combos = _generate_sweep_points(scenario_sweeps)
                data_points = []
                system_states = []
                for combo in combos:
                    run_inputs = dict(global_inputs)
                    for i, var_name in enumerate(var_names):
                        run_inputs[var_name] = combo[i]
                    single = _solve_single_pass(nodes, connections, run_inputs)
                    data_points.append(single["node_outputs"])
                    system_states.append(single["system_state"])

                scenario_results.append({
                    "scenario_id": scenario_id,
                    "scenario_name": scenario_name,
                    "sweep_variables": var_names,
                    "sweep_points": len(combos),
                    "sweep_values": [list(c) for c in combos],
                    "data_points": data_points,
                    "system_states": system_states,
                })

        results["scenario_results"] = scenario_results

    # ── Case 2: Global Sweeps (Legacy) ──
    elif sweeps and len(sweeps) > 0:
        var_names, combos = _generate_sweep_points(sweeps)
        data_points = []
        system_states = []
        for combo in combos:
            run_inputs = dict(global_inputs)
            for i, var_name in enumerate(var_names):
                run_inputs[var_name] = combo[i]
            single = _solve_single_pass(nodes, connections, run_inputs)
            data_points.append(single["node_outputs"])
            system_states.append(single["system_state"])

        results["sweep_variables"] = var_names
        results["sweep_points"] = len(combos)
        results["sweep_values"] = [list(c) for c in combos]
        results["data_points"] = data_points
        results["system_states"] = system_states

    # ── Case 3: Static Single Pass ──
    else:
        single = _solve_single_pass(nodes, connections, global_inputs)
        results["node_outputs"] = single["node_outputs"]
        results["system_state"] = single["system_state"]
        results["topological_order"] = single["topological_order"]

    total_elapsed = time.time() - t_start
    results["execution_metadata"] = {
        "total_elapsed_ms": round(total_elapsed * 1000, 3),
        "engine": "pyodide_local_cpu",
    }

    return results


# ═══════════════════════════════════════════════════════════
#  ENTRY POINT (called from WebWorker)
# ═══════════════════════════════════════════════════════════

def run_solver(payload_json: str) -> str:
    """Accept JSON string, solve, return JSON string."""
    payload = json.loads(payload_json)
    nodes = payload.get("nodes", [])
    connections = payload.get("connections", [])
    global_inputs = payload.get("global_constants", payload.get("global_inputs", {}))
    sequences = payload.get("sequences", None)
    sweeps = payload.get("sweeps", None)
    result = solve_custom_graph(nodes, connections, global_inputs, sequences, sweeps)
    return json.dumps(result)
