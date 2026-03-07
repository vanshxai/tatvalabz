from __future__ import annotations

import ast
import json
import math
from pathlib import Path
from typing import Any, Dict

from .state import SystemState


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
    "var": None,
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
                return left / right
            if isinstance(node.op, ast.Mod):
                return left % right
            if isinstance(node.op, ast.Pow):
                return left**right
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


class UniversalPhysicsNode:
    def __init__(self, definition: Dict[str, Any]):
        self.definition = definition
        self.id = definition["id"]
        self.outputs = definition.get("outputs", [])
        self.formulas = definition.get("formulas", {})

    def evaluate(self, state: SystemState) -> Dict[str, float]:
        def _var(name: str, fallback: float = 0.0) -> float:
            value = state.scoped_get(self.id, name, fallback)
            try:
                return float(value)
            except (TypeError, ValueError):
                return fallback

        functions = dict(_ALLOWED_FUNCTIONS)
        functions["var"] = _var

        names: Dict[str, Any] = {}
        for key, value in state.global_vars.items():
            if key.isidentifier():
                names[key] = value

        evaluator = SafeMathEvaluator(names=names, functions=functions)

        out: Dict[str, float] = {}
        for output_name in self.outputs:
            expression = self.formulas.get(output_name)
            if expression is None:
                continue
            value = float(evaluator.eval(expression))
            state.scoped_set(self.id, output_name, value)
            state.set_global(output_name, value)
            state.set_global(f"{self.id}_{output_name}", value)
            state.set_global(f"{self.id}__{output_name}", value)
            out[output_name] = value

        return out


class NodeRepository:
    def __init__(self, path: Path | None = None):
        base = Path(__file__).resolve().parent
        self.path = path or (base / "data" / "physics_equations.json")
        with self.path.open("r", encoding="utf-8") as handle:
            self.manifest = json.load(handle)

    def node_map(self) -> Dict[str, UniversalPhysicsNode]:
        return {item["id"]: UniversalPhysicsNode(item) for item in self.manifest["nodes"]}
