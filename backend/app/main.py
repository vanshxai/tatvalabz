from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from pprint import pformat
import importlib.util
from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .nodes import NodeRepository
from .solver import DAGSolver
from .custom_solver import solve_custom_graph, solve_custom_graph_parallel


app = FastAPI(title="Physics-Based Digital Twin Workstation")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

repo = NodeRepository()
solver = DAGSolver(repo)


class SolveRequest(BaseModel):
    inputs: Dict[str, float] = Field(default_factory=dict)
    scoped_inputs: Dict[str, Dict[str, float]] = Field(default_factory=dict)


class SweepRequest(BaseModel):
    motor_id: str
    sweep_variable: str | None = None
    start: float = 0.0
    end: float = 1.0
    steps: int = 50
    inputs: Dict[str, float] = Field(default_factory=dict)
    scoped_inputs: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    healthy_snapshot: Dict[str, object] = Field(default_factory=dict)
    include_ledger: bool = False


class SignatureStoreRequest(BaseModel):
    scenario_limits: Dict[str, float] = Field(default_factory=dict)
    library: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class DependencyTreeRequest(BaseModel):
    node_id: str
    output: str
    inputs: Dict[str, float] = Field(default_factory=dict)
    scoped_inputs: Dict[str, Dict[str, float]] = Field(default_factory=dict)


class FaultSpec(BaseModel):
    node_id: str
    variable: str
    start: float = 0.0
    end: float = 1.0
    points: int = 5


class CustomNodeModel(BaseModel):
    id: str
    type: str
    label: str
    formulas: Dict[str, str] = Field(default_factory=dict)
    inputs_mapped: Dict[str, str] = Field(default_factory=dict)


class CustomSolveRequest(BaseModel):
    nodes: list[CustomNodeModel]
    connections: list[Dict[str, str]] = Field(default_factory=list)
    inputs: Dict[str, float] = Field(default_factory=dict)


class SimulateAllRequest(BaseModel):
    faults: list[FaultSpec] = Field(default_factory=list)
    permutations: int = 512
    bins: int = 20
    inputs: Dict[str, float] = Field(default_factory=dict)
    scoped_inputs: Dict[str, Dict[str, float]] = Field(default_factory=dict)


@app.get("/api/node-definitions")
def get_node_definitions() -> Dict[str, object]:
    return repo.manifest


@app.post("/api/solve")
def solve_graph(payload: Optional[SolveRequest] = None) -> Dict[str, object]:
    req = payload or SolveRequest()
    return solver.solve(global_inputs=req.inputs, scoped_inputs=req.scoped_inputs)


@app.post("/api/sweep")
def sweep_graph(payload: SweepRequest) -> Dict[str, object]:
    return solver.sweep(
        motor_id=payload.motor_id,
        sweep_variable=payload.sweep_variable,
        start=payload.start,
        end=payload.end,
        steps=payload.steps,
        global_inputs=payload.inputs,
        scoped_inputs=payload.scoped_inputs,
        healthy_snapshot=payload.healthy_snapshot or None,
        include_ledger=payload.include_ledger,
    )


@app.post("/api/dependency-tree")
def dependency_tree(payload: DependencyTreeRequest) -> Dict[str, object]:
    solved = solver.solve(global_inputs=payload.inputs, scoped_inputs=payload.scoped_inputs)
    tree = solver.dependency_tree(solved, node_id=payload.node_id, output=payload.output)
    return {
        "node_id": payload.node_id,
        "output": payload.output,
        "tree": tree,
        "system_state": solved["system_state"],
        "iterations": solved["iterations"],
        "converged": solved["converged"],
    }


@app.post("/api/simulate-all")
def simulate_all(payload: SimulateAllRequest) -> Dict[str, object]:
    faults = [fault.model_dump() for fault in payload.faults]
    return solver.simulate_all(
        faults=faults,
        permutations=payload.permutations,
        bins=payload.bins,
        global_inputs=payload.inputs,
        scoped_inputs=payload.scoped_inputs,
    )


@app.post("/api/signature-library/save")
def save_signature_library(payload: SignatureStoreRequest) -> Dict[str, object]:
    target = Path(__file__).resolve().parent / "signature_store.py"
    generated_at = datetime.now(timezone.utc).isoformat()

    file_body = (
        '"""Generated fault signature vectors for the Nassenger 8 Fault Lab."""\n\n'
        f"GENERATED_AT = {generated_at!r}\n"
        f"SCENARIO_LIMITS = {pformat(payload.scenario_limits, width=100)}\n"
        f"SIGNATURE_LIBRARY = {pformat(payload.library, width=100)}\n"
    )
    target.write_text(file_body, encoding="utf-8")

    return {
        "saved": True,
        "generated_at": generated_at,
        "path": str(target),
        "scenario_count": len(payload.library),
    }


@app.get("/api/signature-library")
def read_signature_library() -> Dict[str, object]:
    target = Path(__file__).resolve().parent / "signature_store.py"
    if not target.exists():
        return {"generated_at": None, "scenario_limits": {}, "library": {}}

    spec = importlib.util.spec_from_file_location("signature_store_generated", target)
    if spec is None or spec.loader is None:
        return {"generated_at": None, "scenario_limits": {}, "library": {}}

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return {
        "generated_at": getattr(module, "GENERATED_AT", None),
        "scenario_limits": getattr(module, "SCENARIO_LIMITS", {}),
        "library": getattr(module, "SIGNATURE_LIBRARY", {}),
    }


@app.post("/api/solve-custom")
def solve_custom(payload: CustomSolveRequest) -> Dict[str, object]:
    nodes = [node.model_dump() for node in payload.nodes]
    return solve_custom_graph(
        nodes=nodes,
        connections=[dict(c) for c in payload.connections],
        global_inputs=payload.inputs,
    )


@app.post("/api/solve-custom-parallel")
def solve_custom_parallel(payload: CustomSolveRequest) -> Dict[str, object]:
    """Parallel batch solver — executes formulas layer-by-layer across CPU threads."""
    nodes = [node.model_dump() for node in payload.nodes]
    return solve_custom_graph_parallel(
        nodes=nodes,
        connections=[dict(c) for c in payload.connections],
        global_inputs=payload.inputs,
    )
