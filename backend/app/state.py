from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass
class SystemState:
    """Global + node-scoped state store for the graph solver."""

    global_vars: Dict[str, Any] = field(default_factory=dict)
    scoped_vars: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def scoped_get(self, node_id: str, var: str, default: Any = 0.0) -> Any:
        node_bucket = self.scoped_vars.get(node_id, {})
        if var in node_bucket:
            return node_bucket[var]
        return self.global_vars.get(var, default)

    def scoped_set(self, node_id: str, var: str, value: Any) -> None:
        self.scoped_vars.setdefault(node_id, {})[var] = value

    def set_global(self, var: str, value: Any) -> None:
        self.global_vars[var] = value

    def get_global(self, var: str, default: Any = 0.0) -> Any:
        return self.global_vars.get(var, default)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "global": dict(self.global_vars),
            "scoped": {node_id: dict(values) for node_id, values in self.scoped_vars.items()},
        }
