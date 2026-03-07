import React, { useMemo, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { customConfirm } from './CustomDialog';
import ComponentRegistry from "./ComponentRegistry";
import {
    COMPONENT_THEME,
    DEFAULT_THEME,
    DebouncedInput,
    DebouncedTextarea
} from "./CustomNode";
import MiniCanvas from "./MiniCanvas";
import { ICON_OPTIONS, DEFAULT_ICON, resolveNodeIcon } from "./IconCatalog";

const MATH_FUNCTIONS = new Set([
    "sqrt", "abs", "max", "min", "pow", "sin", "cos", "tan", "log", "exp", "round", "Math"
]);

const extractFormulaVariables = (formulas = {}) => {
    const vars = new Set();
    Object.values(formulas).forEach((formula) => {
        if (typeof formula !== "string") return;
        const matches = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
        matches.forEach((name) => {
            if (MATH_FUNCTIONS.has(name)) return;
            vars.add(name);
        });
    });
    return Array.from(vars);
};

export default function NodeInspectorPanel({ nodeId, onClose, activeScenarioId, setScenarios, scenarios }) {
    const { getNode, updateNodeData, setNodes, setEdges } = useReactFlow();
    const node = getNode(nodeId);

    // If node doesn't exist, we auto-close in parent, but handle gracefully here
    if (!node) return null;

    const data = node.data;
    const componentType = data.type;
    const config = ComponentRegistry[componentType];
    if (!config) return null;

    const theme = COMPONENT_THEME[componentType] || DEFAULT_THEME;
    const formulaMap = (componentType === "custom_formula" ? data.customFormulas : config.formulas) || {};
    const formulaVars = useMemo(() => extractFormulaVariables(formulaMap), [formulaMap]);
    const configSweepVars = componentType === "custom_formula" && data.customInputs?.length > 0
        ? data.customInputs
        : (config.sweepable_variables || []);
    const sweepableVars = useMemo(() => Array.from(new Set([...configSweepVars, ...formulaVars])), [configSweepVars, formulaVars]);

    // Determine active sweep data source
    const activeScenario = activeScenarioId ? scenarios?.find(s => s.id === activeScenarioId) : null;
    const baseSweepData = activeScenario ? (activeScenario.sweeps[nodeId] || {}) : (data.sweep || {});
    const sweepData = useMemo(() => {
        const normalized = { ...baseSweepData };
        sweepableVars.forEach((varName) => {
            if (!normalized[varName]) normalized[varName] = { min: 0, max: 0, steps: 1 };
        });
        return normalized;
    }, [baseSweepData, sweepableVars]);

    useEffect(() => {
        const existing = data.sweepable_variables || [];
        const existingKey = existing.join("|");
        const newKey = sweepableVars.join("|");
        if (existingKey !== newKey) {
            updateNodeData(nodeId, { sweepable_variables: sweepableVars });
        }
    }, [nodeId, sweepableVars, updateNodeData, data.sweepable_variables]);

    const handleSweepChange = (varName, field, value) => {
        if (activeScenarioId && setScenarios) {
            // Write to Scenario
            setScenarios(prev => prev.map(s => {
                if (s.id !== activeScenarioId) return s;
                const nodeSweeps = s.sweeps[nodeId] || {};
                const currentVar = sweepData[varName] || { min: 0, max: 1, steps: 10 };
                return {
                    ...s,
                    sweeps: {
                        ...s.sweeps,
                        [nodeId]: {
                            ...nodeSweeps,
                            [varName]: { ...currentVar, [field]: parseFloat(value) || 0 }
                        }
                    }
                };
            }));
        } else {
            // Write to Global (Standard)
            const currentSweep = data.sweep || {};
            const currentVar = sweepData[varName] || { min: 0, max: 1, steps: 10 };
            updateNodeData(nodeId, {
                sweep: { ...currentSweep, [varName]: { ...currentVar, [field]: parseFloat(value) || 0 } },
            });
        }
    };

    const isCustom = componentType === "custom_formula";
    const customInputs = data.customInputs || [];
    const customOutputs = data.customOutputs || [];
    const customFormulas = data.customFormulas || {};

    const inputList = isCustom ? customInputs : config.inputs;
    const outputList = isCustom ? customOutputs : config.outputs;

    const handleSaveToLibrary = (e) => {
        e.stopPropagation();
        const targetLabel = (data.displayName || data.label || "Custom Node").trim();

        // Prevent storing duplicates
        const existingLabels = Object.values(ComponentRegistry).map(c => c.label?.toLowerCase().trim());
        if (existingLabels.includes(targetLabel.toLowerCase())) {
            window.dispatchEvent(new CustomEvent("showToast", {
                detail: { message: `❌ A component named "${targetLabel}" already exists!`, type: "error" }
            }));
            return;
        }

        const event = new CustomEvent("saveCustomComponent", {
            detail: {
                label: targetLabel,
                inputs: inputList,
                outputs: outputList,
                formulas: formulaMap,
                defaultParams: data.sweep || config.defaultParams || {},
                icon: customIcon,
            },
        });
        window.dispatchEvent(event);
        if (onClose) onClose(); // Auto-close Inspector when strictly saved
    };

    const handleDeleteNode = async (e) => {
        e.stopPropagation();
        const confirmed = await customConfirm('Delete Node', 'Remove node from canvas?');
        if (!confirmed) return;
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
        onClose();
    };

    const handleCustomInputsChange = (e) => {
        const val = e.target.value;
        const arr = val.split(",").map((s) => s.trim()).filter(Boolean);
        updateNodeData(nodeId, { customInputsString: val, customInputs: arr });
    };

    const handleCustomOutputsChange = (e) => {
        const val = e.target.value;
        const arr = val.split(",").map((s) => s.trim()).filter(Boolean);
        updateNodeData(nodeId, { customOutputsString: val, customOutputs: arr });
    };

    const handleCustomFormulaChange = (outName, e) => {
        updateNodeData(nodeId, { customFormulas: { ...customFormulas, [outName]: e.target.value } });
    };

    const sensorParams = data.sensorParams || {};
    const sensorFieldConfig = [
        {
            key: "sensitivity",
            label: "Sensitivity",
            helper: "The gain multiplier applied to the primary stimulus.",
        },
        {
            key: "noise_offset",
            label: "Noise Offset",
            helper: "A constant bias added to the final measurement.",
        },
    ];
    const handleSensorParamChange = (paramName, rawValue) => {
        const nextParams = { ...sensorParams };
        if (rawValue === "" || rawValue === null || rawValue === undefined) {
            delete nextParams[paramName];
        } else {
            const parsed = parseFloat(rawValue);
            if (Number.isNaN(parsed)) return;
            nextParams[paramName] = parsed;
        }
        updateNodeData(nodeId, { sensorParams: nextParams });
    };

    const handleDisplayNameChange = (e) => updateNodeData(nodeId, { displayName: e.target.value });
    const handleDescriptionChange = (e) => updateNodeData(nodeId, { description: e.target.value });
    const handleIconChange = (e) => updateNodeData(nodeId, { customIcon: e.target.value });

    const displayName = data.displayName || config.label;
    const customIcon = resolveNodeIcon({
        customIcon: data.customIcon || "",
        configIcon: config.icon || theme.icon || DEFAULT_ICON,
        type: componentType,
        label: displayName,
    });

    return (
        <div
            className="absolute bottom-0 left-0 right-0 z-50 flex flex-col pointer-events-auto"
            style={{
                width: "100%",
                height: "60vh",
                background: "var(--bg-base)",
                borderTop: "1px solid var(--border-technical)",
                boxShadow: "var(--shadow-node)",
                animation: "slideUpPanel 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
        >
            {/* ── HEADER ── */}
            <div
                className="flex items-center justify-between px-4 py-2 shrink-0"
                style={{
                    background: theme.headerBg,
                    borderBottom: "1px solid var(--border-technical)",
                }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-black/40 border border-white/10" style={{ color: theme.headerColor }}>
                        {customIcon || theme.icon}
                    </span>
                    <div>
                        <h3 className="font-bold text-sm tracking-tight" style={{ color: "var(--text-primary)" }}>
                            {displayName}
                        </h3>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isCustom && (
                        <button
                            onClick={handleDeleteNode}
                            style={{
                                background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.2)",
                                color: "#ef4444", padding: "4px 10px", borderRadius: "2px",
                                display: "flex", alignItems: "center", gap: "6px",
                                cursor: "pointer", fontSize: "9px", fontWeight: "bold",
                                textTransform: "uppercase"
                            }}
                        >
                            DELETE_NODE
                        </button>
                    )}
                    {isCustom && (
                        <button
                            onClick={handleSaveToLibrary}
                            style={{
                                background: "rgba(52, 211, 153, 0.05)", border: "1px solid rgba(52, 211, 153, 0.2)",
                                color: "#34d399", padding: "4px 10px", borderRadius: "2px",
                                display: "flex", alignItems: "center", gap: "6px",
                                cursor: "pointer", fontSize: "9px", fontWeight: "bold",
                                textTransform: "uppercase"
                            }}
                        >
                            COMMIT_TO_LIBRARY
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        style={{
                            background: "rgba(0,0,0,0.2)", border: "none", color: theme.headerColor,
                            width: "28px", height: "28px", borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", fontSize: "16px",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.4)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.2)"}
                    >
                        ✕
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex">
                {/* ── LEFT PANEL (Details + Config) ── */}
                <div className="w-[380px] flex-shrink-0 flex flex-col overflow-y-auto custom-scrollbar border-r"
                    style={{ borderColor: 'rgba(100, 160, 220, 0.1)' }}>
                    <div className="p-4 space-y-4">
                        {/* Node Details */}
                        <div className="p-3 space-y-2.5 rounded-sm border" style={{
                            background: "rgba(255,255,255,0.01)",
                            borderColor: "var(--border-technical)",
                        }}>
                            <p className="text-[8px] uppercase tracking-[0.25em] font-bold flex items-center gap-1.5" style={{ color: "var(--primary)" }}>
                                CONFIG_HEADER
                            </p>
                            <div>
                                <p className="text-[7px] uppercase font-bold mb-0.5" style={{ color: "var(--text-muted)" }}>Label</p>
                                <DebouncedInput type="text" placeholder={config.label} value={data.displayName || ""}
                                    onChange={handleDisplayNameChange}
                                    style={{
                                        width: "100%", background: "var(--bg-surface)",
                                        border: "1px solid var(--border-technical)", borderRadius: "2px",
                                        padding: "3px 8px", fontSize: "10px", color: "var(--text-secondary)",
                                        outline: "none",
                                    }}
                                />
                            </div>
                            <div>
                                <p className="text-[7px] uppercase font-bold mb-0.5" style={{ color: "var(--text-muted)" }}>Icon</p>
                                <select
                                    value={customIcon}
                                    onChange={handleIconChange}
                                    style={{
                                        width: "100%",
                                        background: "var(--bg-surface)",
                                        border: "1px solid var(--border-technical)",
                                        borderRadius: "2px",
                                        padding: "3px 8px",
                                        fontSize: "10px",
                                        color: "var(--text-secondary)",
                                        outline: "none",
                                    }}
                                >
                                    {ICON_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.value} {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <p className="text-[8px] mb-0.5" style={{ color: "#6b7fa0" }}>Description / Notes</p>
                                <DebouncedTextarea placeholder="Add notes..." value={data.description || ""} onChange={handleDescriptionChange}
                                    rows={2} style={{
                                        width: "100%", background: "rgba(6, 10, 16, 0.5)",
                                        border: "1px solid rgba(100, 160, 220, 0.12)", borderRadius: "6px",
                                        padding: "4px 8px", fontSize: "11px", color: "#e2e8f0",
                                        outline: "none", resize: "none", transition: "border-color 0.2s",
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = `${theme.accent}66`}
                                    onBlur={(e) => e.target.style.borderColor = "rgba(100, 160, 220, 0.12)"}
                                />
                            </div>
                        </div>

                        <div className="p-3 rounded-sm border" style={{
                            background: "rgba(255,255,255,0.01)",
                            borderColor: "var(--border-technical)",
                        }}>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[8px] uppercase tracking-[0.25em] font-bold flex items-center gap-1.5" style={{ color: "var(--status-warn)", margin: 0 }}>
                                    SENSOR_TUNING
                                </p>
                                <span style={{
                                    fontSize: "7px", fontWeight: "bold", color: "#94a3b8",
                                    padding: "1px 6px", borderRadius: "2px", border: "1px solid rgba(148, 163, 184, 0.2)"
                                }}>
                                    Optional
                                </span>
                            </div>
                            <div className="space-y-2">
                                {sensorFieldConfig.map((field) => (
                                    <div key={field.key} className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[8px] uppercase font-bold tracking-[0.1em]" style={{ color: "#94a3b8" }}>{field.label}</span>
                                        </div>
                                        <input
                                            type="number"
                                            step="any"
                                            value={sensorParams[field.key] ?? ""}
                                            onChange={(e) => handleSensorParamChange(field.key, e.target.value)}
                                            placeholder="Leave blank to inherit default"
                                            style={{
                                                width: "100%",
                                                background: "rgba(6, 10, 16, 0.4)",
                                                border: "1px solid rgba(148, 163, 184, 0.2)",
                                                borderRadius: "6px",
                                                padding: "5px 8px",
                                                fontSize: "10px",
                                                color: "#e2e8f0",
                                                outline: "none",
                                                fontFamily: "'JetBrains Mono', monospace",
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = "rgba(59, 130, 246, 0.6)"}
                                            onBlur={(e) => e.target.style.borderColor = "rgba(148, 163, 184, 0.2)"}
                                        />
                                        <span className="text-[7px] text-[#6b7280]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{field.helper}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Sweep Config (if any) or Custom Config */}
                        <div className="flex flex-col gap-2">
                            {sweepableVars.length > 0 && (
                                <div className="p-3 rounded-sm border flex-1" style={{
                                    background: "rgba(255,255,255,0.01)",
                                    borderColor: "var(--border-technical)",
                                }}>
                                    <div className="flex items-center justify-between mb-2.5">
                                        <p className="text-[8px] uppercase tracking-[0.25em] font-bold flex items-center gap-1.5" style={{ color: "var(--status-warn)", margin: 0 }}>
                                            SWEEP_PARAMETERS
                                        </p>
                                        {activeScenario && (
                                            <span style={{
                                                fontSize: "7px", fontWeight: "bold", color: "var(--primary)", background: "var(--primary-dim)",
                                                padding: "1px 6px", borderRadius: "2px", border: "1px solid var(--primary-glow)",
                                                textTransform: "uppercase"
                                            }}>
                                                SCENARIO_OVERRIDE
                                            </span>
                                        )}
                                    </div>
                                    {sweepableVars.map((varName) => {
                                        const sv = sweepData[varName] || { min: 0, max: 1, steps: 10 };

                                        return (
                                            <div key={varName} className="mb-3 last:mb-0">
                                                {/* Variable name pill */}
                                                <div className="flex items-center justify-between mb-2">
                                                    <span style={{
                                                        display: "inline-flex", alignItems: "center", gap: "3px",
                                                        padding: "1px 7px", borderRadius: "20px",
                                                        background: "rgba(251, 191, 36, 0.1)",
                                                        border: "1px solid rgba(251, 191, 36, 0.25)",
                                                        color: "#fbbf24", fontSize: "9px", fontWeight: 600,
                                                        fontFamily: "'JetBrains Mono', monospace",
                                                    }}>
                                                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#fbbf24", opacity: 0.6 }} />
                                                        {varName}
                                                    </span>
                                                    <span style={{
                                                        fontSize: "8px", color: "#4a5568",
                                                        fontFamily: "'JetBrains Mono', monospace",
                                                    }}>
                                                        {sv.steps} steps
                                                    </span>
                                                </div>

                                                {/* Compact 2-column grid */}
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                                                    {[
                                                        { label: "Min", field: "min", val: sv.min },
                                                        { label: "Max", field: "max", val: sv.max },
                                                    ].map(({ label, field, val }) => (
                                                        <div key={field} style={{
                                                            display: "flex", alignItems: "center", gap: "4px",
                                                            background: "rgba(6, 10, 16, 0.4)",
                                                            border: "1px solid rgba(245, 158, 11, 0.1)",
                                                            borderRadius: "6px", padding: "3px 6px",
                                                        }}>
                                                            <span style={{
                                                                fontSize: "7px", color: "#4a5568", textTransform: "uppercase",
                                                                fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                                                                letterSpacing: "0.08em", flexShrink: 0,
                                                            }}>{label}</span>
                                                            <input type="number" step="any" value={val}
                                                                onChange={(e) => handleSweepChange(varName, field, e.target.value)}
                                                                style={{
                                                                    flex: 1, width: "100%", background: "transparent",
                                                                    border: "none", fontSize: "10px", color: "#fef3c7",
                                                                    textAlign: "right", outline: "none",
                                                                    fontFamily: "'JetBrains Mono', monospace",
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    <div style={{
                                                        gridColumn: "1 / -1",
                                                        display: "flex", alignItems: "center", gap: "4px",
                                                        background: "rgba(6, 10, 16, 0.4)",
                                                        border: "1px solid rgba(245, 158, 11, 0.1)",
                                                        borderRadius: "6px", padding: "3px 6px",
                                                    }}>
                                                        <span style={{
                                                            fontSize: "7px", color: "#4a5568", textTransform: "uppercase",
                                                            fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                                                            letterSpacing: "0.08em", flexShrink: 0,
                                                        }}>Steps</span>
                                                        <input type="number" step="1" min="1" value={sv.steps}
                                                            onChange={(e) => handleSweepChange(varName, "steps", e.target.value)}
                                                            style={{
                                                                flex: 1, width: "100%", background: "transparent",
                                                                border: "none", fontSize: "10px", color: "#fef3c7",
                                                                textAlign: "right", outline: "none",
                                                                fontFamily: "'JetBrains Mono', monospace",
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {isCustom && (
                                <div className="p-3 rounded-xl border flex-1" style={{
                                    background: "rgba(99, 102, 241, 0.04)",
                                    borderColor: "rgba(99, 102, 241, 0.12)",
                                }}>
                                    <p className="text-[9px] uppercase tracking-[0.2em] mb-2 font-semibold" style={{ color: "#818cf8" }}>
                                        Config
                                    </p>
                                    <div className="flex flex-col gap-2 mb-2">
                                        {[
                                            { label: "Inputs (comma-separated)", placeholder: "e.g. a, b, c", value: data.customInputsString !== undefined ? data.customInputsString : customInputs.join(", "), onChange: handleCustomInputsChange },
                                            { label: "Outputs (comma-separated)", placeholder: "e.g. out1, out2", value: data.customOutputsString !== undefined ? data.customOutputsString : customOutputs.join(", "), onChange: handleCustomOutputsChange },
                                        ].map((f) => (
                                            <div key={f.label}>
                                                <p className="text-[8px] mb-0.5" style={{ color: "#a5b4fc" }}>{f.label}</p>
                                                <input type="text" placeholder={f.placeholder} value={f.value} onChange={f.onChange}
                                                    style={{
                                                        width: "100%", background: "rgba(6, 10, 16, 0.5)",
                                                        border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: "6px",
                                                        padding: "4px 8px", fontSize: "11px", color: "#e2e8f0",
                                                        outline: "none", transition: "border-color 0.2s",
                                                    }}
                                                    onFocus={(e) => e.target.style.borderColor = "rgba(99, 102, 241, 0.5)"}
                                                    onBlur={(e) => e.target.style.borderColor = "rgba(99, 102, 241, 0.2)"}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                </div>
                            )}
                        </div>
                    </div>


                </div>

                {/* ── RIGHT PANEL: FORMULAS / MINI-CANVAS ── */}
                <div className="flex-1 flex flex-col relative" style={{ background: 'rgba(6, 10, 16, 0.4)' }}>
                    <MiniCanvas parentNodeId={nodeId} parentNodeData={data} />
                </div>
            </div>
        </div>
    );
}
