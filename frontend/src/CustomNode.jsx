/**
 * CustomNode.jsx — Segmented Glassmorphic Node
 * Three-tier layout: Colored Header → I/O Dock → Formula Stage
 * with Code-Lite syntax highlighting and inline scrubbers.
 */

import { useState, useEffect, memo } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import ComponentRegistry from "./ComponentRegistry";
import { resolveNodeIcon } from "./IconCatalog";

export const DebouncedInput = ({ value, onChange, ...props }) => {
  const [localVal, setLocalVal] = useState(value || "");
  useEffect(() => setLocalVal(value || ""), [value]);
  return (
    <input
      {...props}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => onChange(localVal)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onChange(localVal);
          e.target.blur();
        }
      }}
    />
  );
};

export const DebouncedTextarea = ({ value, onChange, ...props }) => {
  const [localVal, setLocalVal] = useState(value || "");
  useEffect(() => setLocalVal(value || ""), [value]);
  return (
    <textarea
      {...props}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => onChange(localVal)}
    />
  );
};

/* ══════════════════════════════════════════════════
   COMPONENT COLOR MAP — Saturated header colors
   ══════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   COMPONENT COLOR MAP — Carbon IDE Style
   ══════════════════════════════════════════════════ */
const COMPONENT_THEME = {
  temperature_sensor: { headerBg: "#0f172a", headerColor: "#38bdf8", accent: "#2563eb", icon: "🌡️" },
  pressure_sensor: { headerBg: "#0f172a", headerColor: "#38bdf8", accent: "#2563eb", icon: "🧭" },
  flow_meter: { headerBg: "#0f172a", headerColor: "#38bdf8", accent: "#2563eb", icon: "🌊" },
  vibration_sensor: { headerBg: "#0f172a", headerColor: "#38bdf8", accent: "#2563eb", icon: "📳" },
  level_sensor: { headerBg: "#0f172a", headerColor: "#38bdf8", accent: "#2563eb", icon: "📏" },
  motor: { headerBg: "#171717", headerColor: "#60a5fa", accent: "#2563eb", icon: "⚙️" },
  pump: { headerBg: "#171717", headerColor: "#10b981", accent: "#2563eb", icon: "🌀" },
  valve: { headerBg: "#171717", headerColor: "#8b5cf6", accent: "#2563eb", icon: "🚿" },
  fan: { headerBg: "#171717", headerColor: "#38bdf8", accent: "#2563eb", icon: "💨" },
  heater: { headerBg: "#171717", headerColor: "#f97316", accent: "#2563eb", icon: "🔥" },
  compressor: { headerBg: "#171717", headerColor: "#94a3b8", accent: "#2563eb", icon: "🗜️" },
  pid_controller: { headerBg: "#1e1b4b", headerColor: "#a5b4fc", accent: "#2563eb", icon: "🎛️" },
  custom_formula: { headerBg: "#09090b", headerColor: "#d8b4fe", accent: "#2563eb", icon: "∑" },
};

const DEFAULT_THEME = {
  headerBg: "#18181b",
  headerColor: "#fafafa",
  accent: "#2563eb",
  icon: "◉",
};

/* ══════════════════════════════════════════════════
   FORMULA TOKENIZER — Syntax Highlighting Engine
   ══════════════════════════════════════════════════ */
const MATH_FUNCTIONS = new Set([
  "Math.sqrt", "Math.abs", "Math.max", "Math.min", "Math.pow",
  "Math.sin", "Math.cos", "Math.tan", "Math.log", "Math.exp",
  "Math.floor", "Math.ceil", "Math.round", "Math.PI", "sqrt", "abs",
]);

function tokenizeFormula(formula, inputs, outputs, defaultParams) {
  const paramNames = new Set(Object.keys(defaultParams || {}));
  const inputNames = new Set(inputs || []);
  const outputNames = new Set(outputs || []);
  const tokens = [];
  const regex = /(\d+\.?\d*|\w+(?:\.\w+)?|[+\-*/()><= !?:,]|\s+)/g;
  let match;
  while ((match = regex.exec(formula)) !== null) {
    const raw = match[0];
    if (/^\s+$/.test(raw)) tokens.push({ type: "space", value: raw });
    else if (/^\d+\.?\d*$/.test(raw)) tokens.push({ type: "number", value: raw });
    else if (MATH_FUNCTIONS.has(raw)) tokens.push({ type: "function", value: raw });
    else if (/^[+\-*/>=<!?:,]+$/.test(raw)) tokens.push({ type: "operator", value: raw });
    else if (/^[()]$/.test(raw)) tokens.push({ type: "paren", value: raw });
    else if (paramNames.has(raw)) tokens.push({ type: "param", value: raw });
    else if (inputNames.has(raw)) tokens.push({ type: "input", value: raw });
    else if (outputNames.has(raw)) tokens.push({ type: "output", value: raw });
    else tokens.push({ type: "variable", value: raw });
  }
  return tokens;
}

const TOKEN_COLORS = {
  number: { fg: "#3b82f6", bg: "rgba(59, 130, 246, 0.08)", border: "rgba(59, 130, 246, 0.2)" },
  input: { fg: "#10b981", bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.2)" },
  output: { fg: "#34d399", bg: "rgba(52, 211, 153, 0.08)", border: "rgba(52, 211, 153, 0.2)" },
  param: { fg: "#fbbf24", bg: "rgba(251, 191, 36, 0.08)", border: "rgba(251, 191, 36, 0.2)" },
  variable: { fg: "#94a3b8", bg: "rgba(148, 163, 184, 0.05)", border: "rgba(148, 163, 184, 0.15)" },
  operator: { fg: "#d8b4fe", bg: "transparent", border: "transparent" },
  function: { fg: "#8b5cf6", bg: "rgba(139, 92, 246, 0.08)", border: "rgba(139, 92, 246, 0.2)" },
  paren: { fg: "#52525b", bg: "transparent", border: "transparent" },
  space: { fg: "transparent", bg: "transparent", border: "transparent" },
};

/* ══════════════════════════════════════════════════
   PILL TOKEN — Rounded variable block
   ══════════════════════════════════════════════════ */
function PillToken({ type, value }) {
  const colors = TOKEN_COLORS[type] || TOKEN_COLORS.variable;
  const isPill = type !== "operator" && type !== "paren" && type !== "space";

  if (type === "space") return <span>{value}</span>;

  if (!isPill) {
    return (
      <span style={{
        color: colors.fg,
        fontWeight: type === "operator" ? 700 : 400,
        padding: "0 1px",
        fontSize: "10px",
      }}>
        {value}
      </span>
    );
  }

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "3px",
      padding: "0px 4px",
      borderRadius: "2px",
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      color: colors.fg,
      fontSize: "9px",
      fontWeight: 500,
      fontFamily: "'JetBrains Mono', monospace",
      lineHeight: "14px",
      margin: "1px 1px",
      transition: "all 0.1s",
    }}>
      {/* Type indicator dot */}
      {(type === "input" || type === "param" || type === "function") && (
        <span style={{
          width: 4, height: 4, borderRadius: "50%",
          background: colors.fg, opacity: 0.6, flexShrink: 0,
        }} />
      )}
      {value}
    </span>
  );
}

/* ══════════════════════════════════════════════════
   INLINE SCRUBBER PILL — Interactive parameter pill
   ══════════════════════════════════════════════════ */
function InlineScrubberPill({ paramName, defaultValue, currentValue, onChange }) {
  const [show, setShow] = useState(false);
  const val = currentValue ?? defaultValue;
  const absVal = Math.abs(defaultValue) || 1;
  const min = defaultValue >= 0 ? 0 : -absVal * 10;
  const max = absVal * 10;
  const step = absVal < 1 ? 0.01 : absVal < 10 ? 0.1 : 1;
  const colors = TOKEN_COLORS.param;

  return (
    <span className="relative nodrag" style={{ cursor: "pointer" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "3px",
        padding: "0px 6px", borderRadius: "2px",
        background: show ? "var(--primary-dim)" : "rgba(251, 191, 36, 0.05)",
        border: `1px solid ${show ? "var(--primary)" : "rgba(251, 191, 36, 0.15)"}`,
        color: show ? "var(--primary)" : "#fbbf24", fontSize: "9px", fontWeight: 500,
        fontFamily: "'JetBrains Mono', monospace", lineHeight: "14px",
        margin: "1px 1px", transition: "all 0.1s",
      }}>
        {paramName}
      </span>

      {/* Popup scrubber */}
      {show && (
        <div className="absolute z-50 nodrag" style={{
          top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: "6px",
          background: "#000", border: "1px solid var(--primary)", borderRadius: "2px",
          padding: "8px 10px", boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
          minWidth: "140px", whiteSpace: "nowrap",
        }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontSize: "8px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>{paramName}</span>
            <span style={{
              fontSize: "11px", color: "var(--primary)", fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {typeof val === "number" ? val.toFixed(step < 0.1 ? 2 : 1) : val}
            </span>
          </div>
          <input type="range" min={min} max={max} step={step} value={val}
            onChange={(e) => onChange(paramName, parseFloat(e.target.value))}
            className="nodrag scrubber-input" style={{ width: "100%", cursor: "ew-resize" }} />
        </div>
      )}
    </span>
  );
}

/* ══════════════════════════════════════════════════
   MINI SPARKLINE — Tiny SVG line chart
   ══════════════════════════════════════════════════ */
function MiniSparkline({ color, seed = 0 }) {
  // Generate deterministic but varied points based on the seed
  const [points] = useState(() => {
    const pts = [];
    let val = 0.5;
    for (let i = 0; i < 14; i++) {
      val += (Math.sin(seed * 13.37 + i * 2.1) * 0.3 + Math.cos(seed * 7.77 + i * 1.3) * 0.2);
      val = Math.max(0.05, Math.min(0.95, val));
      pts.push(val);
    }
    return pts;
  });

  const w = 36, h = 14;
  const pathData = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - (p * h);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" style={{ opacity: 0.7 }}>
      <defs>
        <linearGradient id={`spark-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <path d={`${pathData} L${w},${h} L0,${h} Z`} fill={`url(#spark-${seed})`} />
      {/* Line */}
      <path d={pathData} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      <circle cx={(w).toFixed(1)} cy={(h - points[points.length - 1] * h).toFixed(1)} r="1.5" fill={color} />
    </svg>
  );
}

/* ══════════════════════════════════════════════════
   FORMULA LINE — Visual Math Block with Sparkline
   ══════════════════════════════════════════════════ */
function FormulaLine({ lineNum, output, formula, inputs, outputs, defaultParams, onParamChange, paramOverrides, accentColor }) {
  const tokens = tokenizeFormula(formula, inputs, outputs, defaultParams);

  return (
    <div className="flex items-center gap-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>
      {/* Line number */}
      <span className="w-4 text-right shrink-0 select-none" style={{ color: "var(--text-muted)", fontSize: "9px" }}>
        {lineNum}
      </span>

      {/* Output pill */}
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "3px",
        padding: "0px 6px", borderRadius: "2px",
        background: "var(--primary-dim)",
        border: "1px solid var(--primary-glow)",
        color: "var(--primary)", fontSize: "9px", fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace", lineHeight: "14px",
        flexShrink: 0,
      }}>
        {output}
      </span>

      {/* Equals */}
      <span style={{ color: "var(--text-muted)", fontWeight: 500, flexShrink: 0 }}>=</span>

      {/* Tokenized pill expression */}
      <div className="flex flex-wrap items-center min-w-0 gap-0">
        {tokens.map((token, i) => {
          if (token.type === "space") return <span key={i}>{token.value}</span>;
          if (token.type === "param") {
            return (
              <InlineScrubberPill key={i} paramName={token.value}
                defaultValue={defaultParams[token.value] ?? 0}
                currentValue={paramOverrides[token.value] ?? defaultParams[token.value]}
                onChange={onParamChange} />
            );
          }
          return <PillToken key={i} type={token.type} value={token.value} />;
        })}
      </div>

      {/* Sparkline preview */}
      <MiniSparkline color={accentColor || "#10b981"} seed={lineNum * 7 + output.length} />
    </div>
  );
}

const CustomNode = memo(({ id, data, selected }) => {
  const { updateNodeData, setNodes, setEdges } = useReactFlow();
  const [showDetails, setShowDetails] = useState(false);

  const handleDeleteNode = (e) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const componentType = data.type;
  const config = ComponentRegistry[componentType];

  if (!config) {
    return (
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--status-err)", borderRadius: "4px",
        padding: "12px 16px", color: "var(--status-err)", fontSize: "11px",
        boxShadow: "var(--shadow-node)",
        display: "flex", flexDirection: "column", gap: "8px", alignItems: "center",
        fontFamily: "'JetBrains Mono', monospace"
      }}>
        <span className="text-center">ERR // UNKNOWN_TYPE <br /><strong style={{ fontSize: "9px", wordBreak: "break-all", opacity: 0.7 }}>{componentType}</strong></span>
        <button
          className="nodrag"
          onClick={handleDeleteNode}
          style={{
            background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "var(--status-err)", padding: "4px 10px", borderRadius: "2px", cursor: "pointer",
            fontWeight: "bold", fontSize: "10px", transition: "all 0.15s", textTransform: 'uppercase'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)"}
        >
          DELETE // FORCE
        </button>
      </div>
    );
  }

  const theme = COMPONENT_THEME[componentType] || DEFAULT_THEME;
  const sweepableVars = config.sweepable_variables || [];
  const sweepData = data.sweep || {};

  const handleSweepChange = (varName, field, value) => {
    const currentSweep = data.sweep || {};
    const currentVar = currentSweep[varName] || { min: 0, max: 1, steps: 10 };
    updateNodeData(id, {
      sweep: { ...currentSweep, [varName]: { ...currentVar, [field]: parseFloat(value) || 0 } },
    });
  };

  const isCustom = componentType === "custom_formula";
  const customInputs = data.customInputs || [];
  const customOutputs = data.customOutputs || [];
  const customFormulas = data.customFormulas || {};

  // If the user has saved a Skeleton with defined inputs/outputs, use those explicitly.
  // Otherwise, if it's a completely fresh pre-defined component, load its registry defaults.
  const inputList = data.customInputs !== undefined ? data.customInputs : config.inputs;
  const outputList = data.customOutputs !== undefined ? data.customOutputs : config.outputs;
  const formulaMap = isCustom ? customFormulas : config.formulas;

  const handleCustomInputsChange = (e) => {
    const val = e.target.value;
    const arr = val.split(",").map((s) => s.trim()).filter(Boolean);
    updateNodeData(id, { customInputsString: val, customInputs: arr });
  };

  const handleCustomOutputsChange = (e) => {
    const val = e.target.value;
    const arr = val.split(",").map((s) => s.trim()).filter(Boolean);
    updateNodeData(id, { customOutputsString: val, customOutputs: arr });
  };

  const handleCustomFormulaChange = (outName, e) => {
    updateNodeData(id, { customFormulas: { ...customFormulas, [outName]: e.target.value } });
  };

  const handleDisplayNameChange = (e) => updateNodeData(id, { displayName: e.target.value });
  const handleNodeIdChange = (e) => updateNodeData(id, { label: e.target.value });
  const handleDescriptionChange = (e) => updateNodeData(id, { description: e.target.value });
  const handleIconChange = (e) => updateNodeData(id, { customIcon: e.target.value });

  const displayName = data.displayName || config.label;
  const nodeLabel = data.label || id;
  const resolvedIcon = resolveNodeIcon({
    customIcon: data.customIcon || "",
    configIcon: config.icon || theme.icon,
    type: componentType,
    label: displayName || nodeLabel,
  });

  return (
    <div
      className="relative min-w-[220px]"
      style={{
        borderRadius: "12px",
        background: "var(--bg-surface)",
        border: `1px solid ${selected ? "var(--primary)" : "var(--border-technical)"}`,
        boxShadow: selected ? "var(--shadow-node), 0 0 12px var(--primary-dim)" : "var(--shadow-node)",
        transition: "all 0.15s ease",
      }}
    >
      <div className="relative">
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{
            background: theme.headerBg,
            borderBottom: "1px solid var(--border-technical)",
            borderTopLeftRadius: "11px",
            borderTopRightRadius: "11px"
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-black/40" style={{ color: theme.headerColor, border: `1px solid ${theme.accent}44` }}>
              {resolvedIcon}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-[11px] leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                {displayName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('openNodeInspector', { detail: { nodeId: id } })); }}
              className="nodrag text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all" style={{ color: "var(--text-secondary)" }}>EDIT</button>
            <button onClick={handleDeleteNode}
              className="nodrag text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40 transition-all" style={{ color: "var(--status-err)" }}>DEL</button>
          </div>
        </div>

        {showDetails && (
          <div className="p-3 space-y-2.5 border-b border-technical bg-black/20">
            <p className="text-[8px] uppercase tracking-wider font-bold text-muted">Node Config</p>
            {[
              { label: "Label", placeholder: config.label, value: data.displayName || "", onChange: handleDisplayNameChange },
              { label: "ID", placeholder: id, value: data.label || "", onChange: handleNodeIdChange, mono: true },
            ].map((field) => (
              <div key={field.label}>
                <DebouncedInput type="text" placeholder={field.placeholder} value={field.value}
                  onChange={field.onChange} className="nodrag glass-input text-[10px] w-full px-2 py-1 rounded-sm" />
              </div>
            ))}
          </div>
        )}

        <div className="bg-transparent">
          <div className="flex">
            {/* ── Inputs Column ── */}
            <div className="flex-1 py-1.5" style={{ borderRight: "1px solid var(--border-technical)" }}>
              <p className="text-[7px] uppercase tracking-widest font-bold px-2 mb-1 text-muted">
                Inputs
              </p>
              {inputList.map((inputName) => (
                <div key={inputName} className="flex items-center gap-2 px-2 py-0.5 relative group">
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={inputName}
                    style={{
                      left: -4,
                      background: "var(--primary)",
                      width: 8, height: 8,
                      borderRadius: "1px",
                      border: "1px solid var(--bg-surface)",
                      boxShadow: "0 0 4px var(--primary-glow)",
                    }}
                  />
                  <span className="text-[9px] truncate text-emerald-500 font-mono">
                    {inputName}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex-1 py-1.5">
              <p className="text-[7px] uppercase tracking-widest font-bold px-2 mb-1 text-right text-muted">
                Outputs
              </p>
              {outputList.map((outputName) => (
                <div key={outputName} className="flex items-center justify-end gap-2 px-2 py-0.5 relative group">
                  <span className="text-[9px] truncate text-blue-400 font-mono">
                    {outputName}
                  </span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={outputName}
                    style={{
                      right: -4,
                      background: "var(--primary)",
                      width: 8, height: 8,
                      borderRadius: "1px",
                      border: "1px solid var(--bg-surface)",
                      boxShadow: "0 0 4px var(--primary-glow)",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════╗
         ║  FOOTER: Minimal Technical Legend        ║
         ╚══════════════════════════════════════════╝ */}
        <div style={{
          padding: "2px 0",
          textAlign: "center",
          background: "rgba(0, 0, 0, 0.4)",
          borderTop: "1px solid var(--border-technical)",
        }}>
          <span style={{ fontSize: "6.5px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            ins_v1.0 // sys_ready
          </span>
        </div>
      </div>
    </div>
  );
});

export default CustomNode;

/* ══════════════════════════════════════════════════
         EXPORTS for NodeInspectorPanel in App.jsx
         ══════════════════════════════════════════════════ */
export { COMPONENT_THEME, DEFAULT_THEME, FormulaLine, PillToken, InlineScrubberPill, MiniSparkline, tokenizeFormula, TOKEN_COLORS };
