/**
 * ComponentRegistry.js
 * Central dictionary for all Digital Twin components.
 * Each entry defines the component's inputs, outputs, formulas, and default parameters.
 */

import { templateDerivedComponents } from "./templateUtils";

const baseComponentRegistry = {
  // --- Sensors ---
  temperature_sensor: {
    label: "Temperature Sensor",
    icon: "🌡️",
    inputs: ["ambient_temp", "heat_source"],
    outputs: ["measured_temp"],
    formulas: {
      measured_temp: "ambient_temp + (heat_source * sensitivity) + noise_offset",
    },
    defaultParams: {
      sensitivity: 0.8,
      noise_offset: 0.5,
    },
    sweepable_variables: ["sensitivity", "noise_offset", "ambient_temp", "heat_source"],
  },
  pressure_sensor: {
    label: "Pressure Sensor",
    icon: "🧭",
    inputs: ["flow_rate", "valve_restriction"],
    outputs: ["measured_pressure"],
    formulas: {
      measured_pressure: "(flow_rate * 2.5) + valve_restriction",
    },
    defaultParams: {},
    sweepable_variables: ["flow_rate", "valve_restriction"],
  },

  // --- Custom ---
  custom_formula: {
    label: "Custom Math Node",
    icon: "∑",
    inputs: [],
    outputs: [],
    formulas: {},
    defaultParams: {},
    sweepable_variables: [], // Dynamically populated from customInputs
  },
};

const ComponentRegistry = {
  ...baseComponentRegistry,
  ...templateDerivedComponents,
};

export default ComponentRegistry;
