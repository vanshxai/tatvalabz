from __future__ import annotations

from collections import defaultdict, deque
import itertools
import random
import re
from typing import Any, Dict, List, Tuple

from .nodes import NodeRepository
from .state import SystemState


_MATH_NAMES = {"max", "min", "abs", "round", "sqrt", "pow", "sin", "cos", "tan", "log", "exp", "var"}


class DAGSolver:
    def __init__(self, repo: NodeRepository):
        self.repo = repo
        self.node_map = repo.node_map()
        self.manifest = repo.manifest
        self.topological_order = self._topological_sort()
        self.variable_producers = self._build_variable_producers()

    def _topological_sort(self) -> List[str]:
        in_degree = {node_id: 0 for node_id in self.node_map.keys()}
        graph = defaultdict(list)

        for source, target in self.manifest.get("edges", []):
            graph[source].append(target)
            in_degree[target] += 1

        queue = deque([n for n, degree in in_degree.items() if degree == 0])
        order: List[str] = []
        while queue:
            node_id = queue.popleft()
            order.append(node_id)
            for nxt in graph[node_id]:
                in_degree[nxt] -= 1
                if in_degree[nxt] == 0:
                    queue.append(nxt)

        if len(order) != len(self.node_map):
            raise ValueError("Graph must be acyclic and fully connected to listed nodes.")

        return order

    def _build_variable_producers(self) -> Dict[str, Tuple[str, str]]:
        producers: Dict[str, Tuple[str, str]] = {}
        for node_id, node in self.node_map.items():
            for out in node.definition.get("outputs", []):
                producers.setdefault(out, (node_id, out))
                producers[f"{node_id}_{out}"] = (node_id, out)
                producers[f"{node_id}__{out}"] = (node_id, out)
        return producers

    @staticmethod
    def _extract_variables(expression: str) -> List[str]:
        vars_found = set()
        for match in re.findall(r"var\('([^']+)'\)", expression):
            vars_found.add(match)

        cleaned = re.sub(r"var\('([^']+)'\)", " ", expression)
        for token in re.findall(r"\b[A-Za-z_][A-Za-z0-9_]*\b", cleaned):
            if token not in _MATH_NAMES:
                vars_found.add(token)
        return sorted(vars_found)

    @staticmethod
    def _resolve_value(system_state: Dict[str, Any], node_id: str | None, var_name: str) -> float:
        scoped = system_state.get("scoped", {}).get(node_id or "", {})
        global_state = system_state.get("global", {})
        if node_id and var_name in scoped:
            return float(scoped[var_name])
        if var_name in global_state:
            return float(global_state[var_name])
        if node_id and f"{node_id}__{var_name}" in global_state:
            return float(global_state[f"{node_id}__{var_name}"])
        if node_id and f"{node_id}_{var_name}" in global_state:
            return float(global_state[f"{node_id}_{var_name}"])
        return 0.0

    def _initialize_state(
        self,
        global_inputs: Dict[str, float] | None,
        scoped_inputs: Dict[str, Dict[str, float]] | None,
    ) -> SystemState:
        state = SystemState()
        defaults = self.manifest.get("defaults", {})
        for key, value in defaults.get("global_inputs", {}).items():
            state.set_global(key, value)

        if global_inputs:
            for key, value in global_inputs.items():
                state.set_global(key, value)

        if scoped_inputs:
            for node_id, vars_map in scoped_inputs.items():
                for var_name, value in vars_map.items():
                    state.scoped_set(node_id, var_name, value)
        return state

    def _snapshot_outputs(self, state: SystemState) -> Dict[str, float]:
        out: Dict[str, float] = {}
        for node_id, node in self.node_map.items():
            for output in node.definition.get("outputs", []):
                key = f"{node_id}__{output}"
                out[key] = float(state.get_global(key, 0.0))
        return out

    def solve(
        self,
        global_inputs: Dict[str, float] | None = None,
        scoped_inputs: Dict[str, Dict[str, float]] | None = None,
        max_iterations: int = 16,
        tolerance: float = 1e-6,
    ) -> Dict[str, Any]:
        state = self._initialize_state(global_inputs, scoped_inputs)
        iteration_logs: List[Dict[str, Dict[str, float]]] = []
        converged = False

        previous = self._snapshot_outputs(state)
        for _ in range(max_iterations):
            forward_outputs: Dict[str, Dict[str, float]] = {}
            for node_id in self.topological_order:
                forward_outputs[node_id] = self.node_map[node_id].evaluate(state)

            reverse_outputs: Dict[str, Dict[str, float]] = {}
            for node_id in reversed(self.topological_order):
                reverse_outputs[node_id] = self.node_map[node_id].evaluate(state)

            iteration_logs.append({"forward": forward_outputs, "reverse": reverse_outputs})
            current = self._snapshot_outputs(state)
            max_delta = max((abs(current[k] - previous.get(k, 0.0)) for k in current.keys()), default=0.0)
            if max_delta <= tolerance:
                converged = True
                break
            previous = current

        last = iteration_logs[-1] if iteration_logs else {"forward": {}, "reverse": {}}
        return {
            "topological_order": self.topological_order,
            "forward_outputs": last["forward"],
            "reverse_outputs": last["reverse"],
            "iterations": len(iteration_logs),
            "converged": converged,
            "system_state": state.as_dict(),
        }

    def _resolve_producer(self, context_node_id: str | None, var_name: str) -> Tuple[str, str] | None:
        if var_name in self.variable_producers:
            return self.variable_producers[var_name]
        if context_node_id and f"{context_node_id}__{var_name}" in self.variable_producers:
            return self.variable_producers[f"{context_node_id}__{var_name}"]
        if context_node_id and f"{context_node_id}_{var_name}" in self.variable_producers:
            return self.variable_producers[f"{context_node_id}_{var_name}"]
        return None

    def dependency_tree(self, solve_result: Dict[str, Any], node_id: str, output: str) -> Dict[str, Any]:
        system_state = solve_result["system_state"]

        def build(var_name: str, context_node: str | None, visited: set[str]) -> Dict[str, Any]:
            producer = self._resolve_producer(context_node, var_name)
            value = self._resolve_value(system_state, context_node, var_name)
            key = f"{context_node or ''}:{var_name}"

            if producer is None:
                return {
                    "variable": var_name,
                    "value": value,
                    "producer_node": None,
                    "formula": None,
                    "substituted": None,
                    "dependencies": [],
                }

            p_node, p_output = producer
            cycle_key = f"{p_node}:{p_output}"
            if cycle_key in visited:
                return {
                    "variable": var_name,
                    "value": value,
                    "producer_node": p_node,
                    "formula": "[cycle]",
                    "substituted": "[cycle]",
                    "dependencies": [],
                }

            expression = self.node_map[p_node].definition.get("formulas", {}).get(p_output, "")
            deps = self._extract_variables(expression)
            visited_next = set(visited)
            visited_next.add(cycle_key)

            substituted = expression
            dep_nodes = []
            for dep in deps:
                dep_value = self._resolve_value(system_state, p_node, dep)
                substituted = substituted.replace(f"var('{dep}')", f"{dep}({dep_value:.4f})")
            for dep in sorted(deps, key=len, reverse=True):
                dep_value = self._resolve_value(system_state, p_node, dep)
                substituted = re.sub(rf"\b{re.escape(dep)}\b", f"{dep}({dep_value:.4f})", substituted)
                dep_nodes.append(build(dep, p_node, visited_next))

            return {
                "variable": var_name,
                "value": self._resolve_value(system_state, p_node, p_output),
                "producer_node": p_node,
                "formula": expression,
                "substituted": substituted,
                "dependencies": dep_nodes,
            }

        return build(output, node_id, set())

    def _node_formula_ledger(self, node_id: str, solve_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        node = self.node_map[node_id].definition
        formulas = node.get("formulas", {})
        steps: List[Dict[str, Any]] = []
        for output, expression in formulas.items():
            substituted = expression
            variables = self._extract_variables(expression)
            values: Dict[str, float] = {}
            for var_name in variables:
                value = self._resolve_value(solve_result["system_state"], node_id, var_name)
                values[var_name] = value
                substituted = substituted.replace(f"var('{var_name}')", f"{var_name}({value:.4f})")
            for var_name in sorted(values.keys(), key=len, reverse=True):
                substituted = re.sub(rf"\b{re.escape(var_name)}\b", f"{var_name}({values[var_name]:.4f})", substituted)
            steps.append(
                {
                    "output": output,
                    "formula": expression,
                    "variables": values,
                    "substituted": substituted,
                    "result": self._resolve_value(solve_result["system_state"], node_id, output),
                }
            )
        return steps

    def sweep(
        self,
        motor_id: str,
        sweep_variable: str | None,
        start: float,
        end: float,
        steps: int,
        global_inputs: Dict[str, float] | None = None,
        scoped_inputs: Dict[str, Dict[str, float]] | None = None,
        healthy_snapshot: Dict[str, Any] | None = None,
        include_ledger: bool = False,
    ) -> Dict[str, Any]:
        if motor_id not in self.node_map:
            raise ValueError(f"Unknown motor id: {motor_id}")
        if not motor_id.startswith("motor_"):
            raise ValueError("Sweep target must be a motor node id (motor_XX).")

        allowed_vars = set(self.node_map[motor_id].definition.get("variables", {}).keys())
        if sweep_variable is None:
            sweep_variable = next((name for name in allowed_vars if name.endswith("__friction")), None)

        if sweep_variable is None or sweep_variable not in allowed_vars:
            raise ValueError("Sweep variable must be a motor friction or tension fault variable.")
        if not (sweep_variable.endswith("__friction") or sweep_variable.endswith("__tension")):
            raise ValueError("Sweep variable must be $V_XX__friction or $V_XX__tension.")

        current_var = f"{motor_id}__i"
        steps = max(2, steps)
        step_size = (end - start) / float(steps - 1)
        x_values: List[float] = [start + idx * step_size for idx in range(steps)]
        healthy: List[float] = []
        live: List[float] = []
        instances: List[Dict[str, Any]] = []

        baseline_level = None
        if healthy_snapshot:
            baseline_level = float(healthy_snapshot.get("global", {}).get(current_var, 0.0))

        for x in x_values:
            base_scoped = {node: dict(values) for node, values in (scoped_inputs or {}).items()}
            node_scoped = dict(base_scoped.get(motor_id, {}))

            baseline_scoped = dict(base_scoped)
            baseline_node_scoped = dict(node_scoped)
            baseline_node_scoped[sweep_variable] = 0.0
            baseline_scoped[motor_id] = baseline_node_scoped

            live_scoped = dict(base_scoped)
            live_node_scoped = dict(node_scoped)
            live_node_scoped[sweep_variable] = x
            live_scoped[motor_id] = live_node_scoped

            healthy_state = self.solve(global_inputs=global_inputs, scoped_inputs=baseline_scoped)
            live_state = self.solve(global_inputs=global_inputs, scoped_inputs=live_scoped)

            healthy_value = float(healthy_state["system_state"]["global"].get(current_var, 0.0))
            if baseline_level is not None:
                healthy_value = baseline_level

            healthy.append(healthy_value)
            live.append(float(live_state["system_state"]["global"].get(current_var, 0.0)))

            if include_ledger:
                instances.append(
                    {
                        "x": float(x),
                        "healthy_current": healthy[-1],
                        "live_current": live[-1],
                        "healthy_steps": self._node_formula_ledger(motor_id, healthy_state),
                        "live_steps": self._node_formula_ledger(motor_id, live_state),
                    }
                )

        response = {
            "motor_id": motor_id,
            "current_var": current_var,
            "sweep_variable": sweep_variable,
            "x": x_values,
            "healthy": healthy,
            "live": live,
        }
        if include_ledger:
            response["instances"] = instances
        return response

    def simulate_all(
        self,
        faults: List[Dict[str, Any]],
        permutations: int,
        global_inputs: Dict[str, float] | None,
        scoped_inputs: Dict[str, Dict[str, float]] | None,
        bins: int = 20,
    ) -> Dict[str, Any]:
        if not faults:
            return {"permutations": 0, "runs": [], "heatmap": [], "overlap_matrix": [], "bin_edges": []}

        permutations = max(1, permutations)
        bins = max(5, bins)
        rng = random.Random(42)

        base_scoped = {node: dict(values) for node, values in (scoped_inputs or {}).items()}

        runs: List[Dict[str, Any]] = []
        fault_currents: Dict[str, List[float]] = {f"{f['node_id']}::{f['variable']}": [] for f in faults}

        domains: List[List[float]] = []
        for fault in faults:
            start = float(fault.get("start", 0.0))
            end = float(fault.get("end", 1.0))
            points = int(fault.get("points", 5))
            points = max(2, points)
            step = (end - start) / float(points - 1)
            domains.append([start + idx * step for idx in range(points)])

        Cartesian_size = 1
        for domain in domains:
            Cartesian_size *= len(domain)

        if Cartesian_size <= permutations:
            iterator = itertools.product(*domains)
            combos = list(iterator)
        else:
            combos = [[rng.uniform(min(d), max(d)) for d in domains] for _ in range(permutations)]

        for combo in combos[:permutations]:
            scoped = {node: dict(values) for node, values in base_scoped.items()}
            fault_map: Dict[str, float] = {}

            for idx, fault in enumerate(faults):
                node_id = fault["node_id"]
                var_name = fault["variable"]
                value = float(combo[idx])
                scoped.setdefault(node_id, {})[var_name] = value
                fault_map[f"{node_id}::{var_name}"] = value

            solved = self.solve(global_inputs=global_inputs, scoped_inputs=scoped)
            live_current = float(solved["system_state"]["global"].get("live_current", 0.0))
            runs.append({"faults": fault_map, "live_current": live_current})

            for fkey, fvalue in fault_map.items():
                if fvalue > 0:
                    fault_currents[fkey].append(live_current)

        all_currents = [r["live_current"] for r in runs] or [0.0]
        cmin = min(all_currents)
        cmax = max(all_currents)
        if abs(cmax - cmin) < 1e-9:
            cmax = cmin + 1.0

        bin_width = (cmax - cmin) / bins
        bin_edges = [cmin + idx * bin_width for idx in range(bins + 1)]

        def to_bin(value: float) -> int:
            idx = int((value - cmin) / bin_width)
            return max(0, min(bins - 1, idx))

        heatmap = []
        bin_sets: Dict[str, set[int]] = {}
        for fault_name, currents in fault_currents.items():
            counts = [0 for _ in range(bins)]
            for cur in currents:
                counts[to_bin(cur)] += 1
            heatmap.append({"fault": fault_name, "counts": counts})
            bin_sets[fault_name] = {idx for idx, count in enumerate(counts) if count > 0}

        fault_names = list(fault_currents.keys())
        overlap_matrix: List[List[float]] = []
        for left in fault_names:
            row: List[float] = []
            for right in fault_names:
                union = bin_sets[left] | bin_sets[right]
                inter = bin_sets[left] & bin_sets[right]
                row.append(float(len(inter)) / float(len(union)) if union else 0.0)
            overlap_matrix.append(row)

        return {
            "permutations": len(runs),
            "runs": runs[:250],
            "fault_names": fault_names,
            "heatmap": heatmap,
            "overlap_matrix": overlap_matrix,
            "bin_edges": bin_edges,
            "current_range": {"min": cmin, "max": cmax},
        }
