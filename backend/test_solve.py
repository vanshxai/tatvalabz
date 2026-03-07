import asyncio
from app.main import solve_graph, SolveRequest

payload = {
  "nodes": [
    {
      "id": "pid_controller_1",
      "type": "pid_controller",
      "label": "pid_controller_1",
      "formulas": {
        "control_output": "1.2 * (setpoint - process_variable) + 0.5 * 0 + 0.1 * 0"
      }
    },
    {
      "id": "valve_1",
      "type": "valve",
      "label": "valve_1",
      "formulas": {
        "flow_rate": "15 * (command_signal / 100) * Math.sqrt(max(0, inlet_pressure - outlet_pressure))",
        "outlet_pressure": "inlet_pressure - (15 * command_signal / 50)"
      },
      "inputs_mapped": {
        "command_signal": "pid_controller_1_control_output"
      }
    },
    {
      "id": "flow_meter_1",
      "type": "flow_meter",
      "label": "flow_meter_1",
      "formulas": {
        "flow_rate": "(pump_speed * 0.1) * (pipe_diameter * pipe_diameter)"
      },
      "inputs_mapped": {
        "pump_speed": "valve_1_flow_rate"
      }
    }
  ],
  "connections": [
    {
      "from": "pid_controller_1 → [control_output]",
      "to": "valve_1 → [command_signal]"
    },
    {
      "from": "valve_1 → [flow_rate]",
      "to": "flow_meter_1 → [pump_speed]"
    }
  ]
}

req = SolveRequest(manifest=payload)
print(solve_graph(req))
