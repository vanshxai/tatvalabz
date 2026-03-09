import { MATERIAL_LIBRARY, MATERIAL_LIBRARY_VERSION } from "./materialLibraryData";

const RESERVED = new Set([
  "Math", "sqrt", "abs", "max", "min", "pow", "sin", "cos", "tan", "log", "exp", "round",
]);

const extractVariables = (formulas = {}) => {
  const vars = new Set();
  Object.values(formulas || {}).forEach((expr) => {
    if (typeof expr !== "string") return;
    const matches = expr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    matches.forEach((token) => {
      if (!RESERVED.has(token)) vars.add(token);
    });
  });
  return vars;
};

const toLowerBag = (...parts) => parts.filter(Boolean).join(" ").toLowerCase();

const scoreCandidate = (material, ctx) => {
  const constants = material.constants || {};
  const keys = Object.keys(constants);
  let score = 0;

  ctx.requiredKeys.forEach((key) => {
    if (key in constants) score += 5;
  });

  const text = ctx.text;
  if (/(motor|armature|winding|current|resistance|inductance)/i.test(text) && material.id.includes("cu_")) score += 6;
  if (/(back_emf|torque|magnet|rpm|shaft)/i.test(text) && material.id.includes("ndfeb")) score += 6;
  if (/(inertia|friction|mechanical|shaft|load_torque)/i.test(text) && /(steel|stainless|titanium)/i.test(material.id)) score += 4;
  if (/(core|flux|permeability|stator|rotor)/i.test(text) && material.id.includes("electrical_steel")) score += 5;

  if (keys.length === 0) score -= 100;
  return score;
};

export function inferAutoMaterialBinding({ componentType, componentConfig, nodeLabel }) {
  if (!componentConfig) return null;

  const formulaVars = extractVariables(componentConfig.formulas || {});
  const requiredKeys = new Set([
    ...(componentConfig.inputs || []),
    ...Object.keys(componentConfig.defaultParams || {}),
    ...formulaVars,
  ]);

  const text = toLowerBag(componentType, nodeLabel, componentConfig.label, ...(componentConfig.inputs || []), ...Object.values(componentConfig.formulas || {}));

  let best = null;
  let bestScore = -Infinity;
  MATERIAL_LIBRARY.forEach((material) => {
    const score = scoreCandidate(material, { requiredKeys, text });
    if (score > bestScore) {
      best = material;
      bestScore = score;
    }
  });

  if (!best || bestScore < 5) return null;

  const pickedConstants = {};
  Object.entries(best.constants || {}).forEach(([key, value]) => {
    if (requiredKeys.has(key)) pickedConstants[key] = value;
  });

  // For motor-like components include key electromechanical constants even if formula resolves them later.
  if (/(motor|armature|back_emf|torque|shaft|rpm)/i.test(text)) {
    ["armature_resistance", "armature_inductance", "back_emf_constant", "torque_constant", "friction_coeff", "inertia_j"].forEach((k) => {
      if (best.constants?.[k] !== undefined && pickedConstants[k] === undefined) pickedConstants[k] = best.constants[k];
    });
  }

  if (Object.keys(pickedConstants).length === 0) return null;

  return {
    sensorParams: pickedConstants,
    materialBinding: {
      materialId: best.id,
      materialName: best.name,
      category: best.category,
      grade: best.grade || "",
      source: best.source || "",
      constantsApplied: Object.keys(pickedConstants),
      libraryVersion: MATERIAL_LIBRARY_VERSION,
      autoMapped: true,
      appliedAt: new Date().toISOString(),
    },
  };
}
