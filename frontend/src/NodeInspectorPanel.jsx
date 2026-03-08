import React, { useMemo, useEffect, useState, useRef, useCallback } from "react";
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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const VARIABLE_HINTS = [
    { pattern: /(temp|temperature|thermal|heat)/i, type: "Thermal Input", note: "Higher values increase heat-linked outcomes." },
    { pattern: /(pressure|press)/i, type: "Pressure Input", note: "Use realistic process limits to avoid non-physical runs." },
    { pattern: /(flow|rate|velocity|speed|rpm)/i, type: "Flow/Speed Input", note: "Sweep around operating band before stress testing." },
    { pattern: /(voltage|current|amp|watt|power|torque)/i, type: "Electrical/Drive Input", note: "Keep safe ranges for hardware validation parity." },
    { pattern: /(density|mass|weight|volume)/i, type: "Material/Physical Input", note: "Prefer standards or datasheet windows." },
    { pattern: /(gain|sensitivity|factor|coeff|coefficient)/i, type: "Gain/Coefficient", note: "Start with small relative sweeps (5-15%)." },
    { pattern: /(offset|bias|drift)/i, type: "Offset/Bias", note: "Test zero-crossing and drift margins." },
    { pattern: /(efficiency|eta|ratio)/i, type: "Ratio/Bounded", note: "Usually bounded; avoid wide absolute sweeps." },
];

const inferVariableHint = (varName) => {
    const hit = VARIABLE_HINTS.find((entry) => entry.pattern.test(varName));
    return hit || { type: "General Variable", note: "Use conservative ranges first, then widen gradually." };
};

const getBaseValue = ({ varName, config, sensorParams, sweep, activeScenario }) => {
    const cfgDefault = Number(config?.defaultParams?.[varName]);
    if (Number.isFinite(cfgDefault)) return cfgDefault;
    const sensorDefault = Number(sensorParams?.[varName]);
    if (Number.isFinite(sensorDefault)) return sensorDefault;
    const existing = sweep?.[varName];
    if (existing && Number.isFinite(Number(existing.min)) && Number.isFinite(Number(existing.max))) {
        return (Number(existing.min) + Number(existing.max)) / 2;
    }
    if (activeScenario && existing && Number.isFinite(Number(existing.max))) return Number(existing.max);
    return 1;
};

const buildPresetRange = (varName, baseValue, mode = "standard") => {
    const lowerName = String(varName || "").toLowerCase();
    const isOffset = /(offset|bias|drift)/i.test(lowerName);
    const isRatio = /(efficiency|eta|ratio)/i.test(lowerName);
    const safeBase = Number.isFinite(baseValue) ? baseValue : 1;
    const absBase = Math.max(Math.abs(safeBase), 1e-6);
    const spreadMap = { tight: 0.05, standard: 0.1, wide: 0.25 };
    const spread = spreadMap[mode] ?? 0.1;

    if (isRatio) {
        const low = Math.max(0, safeBase - spread);
        const high = Math.min(1, safeBase + spread);
        return { min: low, max: high, steps: 11 };
    }
    if (isOffset) {
        const width = Math.max(absBase * spread, 0.5);
        return { min: safeBase - width, max: safeBase + width, steps: 9 };
    }

    const min = safeBase - (absBase * spread);
    const max = safeBase + (absBase * spread);
    return { min, max, steps: mode === "wide" ? 15 : 11 };
};

const formatCompact = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    if (Math.abs(n) >= 10000 || (Math.abs(n) > 0 && Math.abs(n) < 0.001)) return n.toExponential(2);
    return n.toFixed(4).replace(/\.?0+$/, "");
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

    const updateSweepVariable = (varName, updater) => {
        if (activeScenarioId && setScenarios) {
            setScenarios(prev => prev.map(s => {
                if (s.id !== activeScenarioId) return s;
                const nodeSweeps = s.sweeps[nodeId] || {};
                const currentVar = sweepData[varName] || { min: 0, max: 1, steps: 10 };
                const nextVar = updater(currentVar);
                return {
                    ...s,
                    sweeps: {
                        ...s.sweeps,
                        [nodeId]: {
                            ...nodeSweeps,
                            [varName]: nextVar
                        }
                    }
                };
            }));
        } else {
            const currentSweep = data.sweep || {};
            const currentVar = sweepData[varName] || { min: 0, max: 1, steps: 10 };
            const nextVar = updater(currentVar);
            updateNodeData(nodeId, {
                sweep: { ...currentSweep, [varName]: nextVar },
            });
        }
    };

    const handleSweepChange = (varName, field, value) => {
        updateSweepVariable(varName, (currentVar) => {
            if (field === "steps") {
                const parsedSteps = Math.max(1, Math.round(Number(value) || 1));
                return { ...currentVar, steps: parsedSteps };
            }
            const parsed = Number(value);
            return { ...currentVar, [field]: Number.isFinite(parsed) ? parsed : 0 };
        });
    };

    const handleApplySweepPreset = (varName, mode) => {
        const base = getBaseValue({
            varName,
            config,
            sensorParams,
            sweep: sweepData,
            activeScenario,
        });
        const preset = buildPresetRange(varName, base, mode);
        updateSweepVariable(varName, () => preset);
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

    const [panelSize, setPanelSize] = useState(() => {
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1400;
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
        const width = clamp(Math.round(viewportWidth * 0.78), 760, 1400);
        const height = clamp(Math.round(viewportHeight * 0.62), 420, 860);
        return { width, height };
    });
    const [panelPos, setPanelPos] = useState(() => {
        const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1400;
        const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
        const width = clamp(Math.round(viewportWidth * 0.78), 760, 1400);
        const height = clamp(Math.round(viewportHeight * 0.62), 420, 860);
        return {
            left: Math.max(8, Math.round((viewportWidth - width) / 2)),
            top: Math.max(8, Math.round((viewportHeight - height) / 2)),
        };
    });

    const dragStateRef = useRef(null);
    const resizeStateRef = useRef(null);

    const handleDragStart = useCallback((event) => {
        event.preventDefault();
        dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            initialLeft: panelPos.left,
            initialTop: panelPos.top,
        };
    }, [panelPos.left, panelPos.top]);

    const handleResizeStart = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        resizeStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            initialWidth: panelSize.width,
            initialHeight: panelSize.height,
            initialLeft: panelPos.left,
            initialTop: panelPos.top,
        };
    }, [panelPos.left, panelPos.top, panelSize.height, panelSize.width]);

    useEffect(() => {
        const handlePointerMove = (event) => {
            if (dragStateRef.current) {
                const drag = dragStateRef.current;
                const nextLeft = drag.initialLeft + (event.clientX - drag.startX);
                const nextTop = drag.initialTop + (event.clientY - drag.startY);
                const maxLeft = window.innerWidth - panelSize.width - 8;
                const maxTop = window.innerHeight - panelSize.height - 8;
                setPanelPos({
                    left: clamp(nextLeft, 8, Math.max(8, maxLeft)),
                    top: clamp(nextTop, 8, Math.max(8, maxTop)),
                });
                return;
            }

            if (resizeStateRef.current) {
                const resize = resizeStateRef.current;
                const rawWidth = resize.initialWidth + (event.clientX - resize.startX);
                const rawHeight = resize.initialHeight + (event.clientY - resize.startY);
                const maxWidth = window.innerWidth - resize.initialLeft - 8;
                const maxHeight = window.innerHeight - resize.initialTop - 8;
                setPanelSize({
                    width: clamp(rawWidth, 640, Math.max(640, maxWidth)),
                    height: clamp(rawHeight, 360, Math.max(360, maxHeight)),
                });
            }
        };

        const handlePointerUp = () => {
            dragStateRef.current = null;
            resizeStateRef.current = null;
        };

        window.addEventListener("mousemove", handlePointerMove);
        window.addEventListener("mouseup", handlePointerUp);
        return () => {
            window.removeEventListener("mousemove", handlePointerMove);
            window.removeEventListener("mouseup", handlePointerUp);
        };
    }, [panelSize.width, panelSize.height]);

    useEffect(() => {
        const handleWindowResize = () => {
            setPanelSize((prev) => {
                const maxWidth = Math.max(640, window.innerWidth - panelPos.left - 8);
                const maxHeight = Math.max(360, window.innerHeight - panelPos.top - 8);
                return {
                    width: clamp(prev.width, 640, maxWidth),
                    height: clamp(prev.height, 360, maxHeight),
                };
            });
            setPanelPos((prev) => {
                const maxLeft = window.innerWidth - panelSize.width - 8;
                const maxTop = window.innerHeight - panelSize.height - 8;
                return {
                    left: clamp(prev.left, 8, Math.max(8, maxLeft)),
                    top: clamp(prev.top, 8, Math.max(8, maxTop)),
                };
            });
        };

        window.addEventListener("resize", handleWindowResize);
        return () => window.removeEventListener("resize", handleWindowResize);
    }, [panelPos.left, panelPos.top, panelSize.width, panelSize.height]);

    return (
        <div
            className="fixed z-50 flex flex-col pointer-events-auto rounded-sm overflow-hidden"
            style={{
                left: `${panelPos.left}px`,
                top: `${panelPos.top}px`,
                width: `${panelSize.width}px`,
                height: `${panelSize.height}px`,
                background: "var(--bg-base)",
                border: "1px solid var(--border-technical)",
                boxShadow: "var(--shadow-node)",
            }}
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
        >
            {/* ── HEADER ── */}
            <div
                className="flex items-center justify-between px-4 py-2 shrink-0"
                style={{
                    background: theme.headerBg,
                    borderBottom: "1px solid var(--border-technical)",
                    cursor: "move",
                    userSelect: "none",
                }}
                onMouseDown={handleDragStart}
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
                                    fontSize: "7px", fontWeight: "bold", color: "var(--text-secondary)",
                                    padding: "1px 6px", borderRadius: "2px", border: "1px solid var(--border-subtle)"
                                }}>
                                    Optional
                                </span>
                            </div>
                            <div className="space-y-2">
                                {sensorFieldConfig.map((field) => (
                                    <div key={field.key} className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[8px] uppercase font-bold tracking-[0.1em]" style={{ color: "var(--text-secondary)" }}>{field.label}</span>
                                        </div>
                                        <input
                                            type="number"
                                            step="any"
                                            value={sensorParams[field.key] ?? ""}
                                            onChange={(e) => handleSensorParamChange(field.key, e.target.value)}
                                            placeholder="Leave blank to inherit default"
                                            style={{
                                                width: "100%",
                                                background: "var(--bg-surface)",
                                                border: "1px solid var(--border-subtle)",
                                                borderRadius: "6px",
                                                padding: "5px 8px",
                                                fontSize: "10px",
                                                color: "var(--text-primary)",
                                                outline: "none",
                                                fontFamily: "var(--font-mono)",
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = "var(--border-ring)"}
                                            onBlur={(e) => e.target.style.borderColor = "var(--border-subtle)"}
                                        />
                                        <span className="text-[7px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{field.helper}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Experiment Variable Ranges (if any) or Custom Config */}
                        <div className="flex flex-col gap-2">
                            {sweepableVars.length > 0 && (
                                <div className="p-3 rounded-sm border flex-1" style={{
                                    background: "rgba(255,255,255,0.01)",
                                    borderColor: "var(--border-technical)",
                                }}>
                                    <div className="flex items-center justify-between mb-2.5">
                                        <p className="text-[8px] uppercase tracking-[0.25em] font-bold flex items-center gap-1.5" style={{ color: "var(--status-warn)", margin: 0 }}>
                                            EXPERIMENT_VARIABLE_RANGES
                                        </p>
                                        {activeScenario && (
                                            <span style={{
                                                fontSize: "7px", fontWeight: "bold", color: "var(--primary)", background: "var(--primary-dim)",
                                                padding: "1px 6px", borderRadius: "2px", border: "1px solid var(--primary-glow)",
                                                textTransform: "uppercase"
                                            }}>
                                                SCENARIO_RANGE_OVERRIDE
                                            </span>
                                        )}
                                    </div>
                                    {sweepableVars.map((varName) => {
                                        const sv = sweepData[varName] || { min: 0, max: 1, steps: 10 };
                                        const hint = inferVariableHint(varName);
                                        const base = getBaseValue({
                                            varName,
                                            config,
                                            sensorParams,
                                            sweep: sweepData,
                                            activeScenario,
                                        });

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
                                                        fontFamily: "var(--font-mono)",
                                                    }}>
                                                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#fbbf24", opacity: 0.6 }} />
                                                        {varName}
                                                    </span>
                                                    <span style={{
                                                        fontSize: "8px", color: "var(--text-muted)",
                                                        fontFamily: "var(--font-mono)",
                                                    }}>
                                                        {sv.steps} steps
                                                    </span>
                                                </div>
                                                <div style={{
                                                    marginBottom: "6px",
                                                    padding: "5px 7px",
                                                    borderRadius: "6px",
                                                    background: "var(--primary-dim)",
                                                    border: "1px solid var(--primary-glow)",
                                                }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                                                        <span style={{ fontSize: "8px", color: "var(--primary-strong)", fontWeight: 700, letterSpacing: "0.04em" }}>{hint.type}</span>
                                                        <span style={{ fontSize: "8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                                                            base {formatCompact(base)}
                                                        </span>
                                                    </div>
                                                    <p style={{
                                                        margin: 0,
                                                        color: "var(--text-secondary)",
                                                        fontSize: "8px",
                                                        lineHeight: 1.35,
                                                        fontFamily: "var(--font-mono)",
                                                    }}>{hint.note}</p>
                                                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApplySweepPreset(varName, "tight")}
                                                            style={{
                                                                background: "var(--primary-dim)",
                                                                border: "1px solid var(--primary-glow)",
                                                                color: "var(--primary-strong)",
                                                                borderRadius: "10px",
                                                                padding: "1px 6px",
                                                                fontSize: "7px",
                                                                fontWeight: 700,
                                                                letterSpacing: "0.04em",
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            AUTO ±5%
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApplySweepPreset(varName, "standard")}
                                                            style={{
                                                                background: "var(--accent-cyan-dim)",
                                                                border: "1px solid rgba(34, 211, 238, 0.35)",
                                                                color: "var(--accent-cyan)",
                                                                borderRadius: "10px",
                                                                padding: "1px 6px",
                                                                fontSize: "7px",
                                                                fontWeight: 700,
                                                                letterSpacing: "0.04em",
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            AUTO ±10%
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApplySweepPreset(varName, "wide")}
                                                            style={{
                                                                background: "rgba(245,158,11,0.14)",
                                                                border: "1px solid rgba(245,158,11,0.35)",
                                                                color: "#fde68a",
                                                                borderRadius: "10px",
                                                                padding: "1px 6px",
                                                                fontSize: "7px",
                                                                fontWeight: 700,
                                                                letterSpacing: "0.04em",
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            AUTO ±25%
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Compact 2-column grid */}
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                                                    {[
                                                        { label: "Min", field: "min", val: sv.min },
                                                        { label: "Max", field: "max", val: sv.max },
                                                    ].map(({ label, field, val }) => (
                                                        <div key={field} style={{
                                                            display: "flex", alignItems: "center", gap: "4px",
                                                            background: "var(--bg-surface)",
                                                            border: "1px solid rgba(245, 158, 11, 0.1)",
                                                            borderRadius: "6px", padding: "3px 6px",
                                                        }}>
                                                            <span style={{
                                                                fontSize: "7px", color: "var(--text-muted)", textTransform: "uppercase",
                                                                fontFamily: "var(--font-mono)", fontWeight: 700,
                                                                letterSpacing: "0.08em", flexShrink: 0,
                                                            }}>{label}</span>
                                                            <input type="number" step="any" value={val}
                                                                onChange={(e) => handleSweepChange(varName, field, e.target.value)}
                                                                style={{
                                                                    flex: 1, width: "100%", background: "transparent",
                                                                    border: "none", fontSize: "10px", color: "#fef3c7",
                                                                    textAlign: "right", outline: "none",
                                                                    fontFamily: "var(--font-mono)",
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    <div style={{
                                                        gridColumn: "1 / -1",
                                                        display: "flex", alignItems: "center", gap: "4px",
                                                        background: "var(--bg-surface)",
                                                        border: "1px solid rgba(245, 158, 11, 0.1)",
                                                        borderRadius: "6px", padding: "3px 6px",
                                                    }}>
                                                        <span style={{
                                                            fontSize: "7px", color: "var(--text-muted)", textTransform: "uppercase",
                                                            fontFamily: "var(--font-mono)", fontWeight: 700,
                                                            letterSpacing: "0.08em", flexShrink: 0,
                                                        }}>Steps</span>
                                                        <input type="number" step="1" min="1" value={sv.steps}
                                                            onChange={(e) => handleSweepChange(varName, "steps", e.target.value)}
                                                            style={{
                                                                flex: 1, width: "100%", background: "transparent",
                                                                border: "none", fontSize: "10px", color: "#fef3c7",
                                                                textAlign: "right", outline: "none",
                                                                fontFamily: "var(--font-mono)",
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
                                    background: "var(--primary-dim)",
                                    borderColor: "var(--primary-glow)",
                                }}>
                                    <p className="text-[9px] uppercase tracking-[0.2em] mb-2 font-semibold" style={{ color: "var(--primary-strong)" }}>
                                        Config
                                    </p>
                                    <div className="flex flex-col gap-2 mb-2">
                                        {[
                                            { label: "Inputs (comma-separated)", placeholder: "e.g. a, b, c", value: data.customInputsString !== undefined ? data.customInputsString : customInputs.join(", "), onChange: handleCustomInputsChange },
                                            { label: "Outputs (comma-separated)", placeholder: "e.g. out1, out2", value: data.customOutputsString !== undefined ? data.customOutputsString : customOutputs.join(", "), onChange: handleCustomOutputsChange },
                                        ].map((f) => (
                                            <div key={f.label}>
                                                <p className="text-[8px] mb-0.5" style={{ color: "var(--primary-strong)" }}>{f.label}</p>
                                                <input type="text" placeholder={f.placeholder} value={f.value} onChange={f.onChange}
                                                    style={{
                                                        width: "100%", background: "var(--bg-surface)",
                                                        border: "1px solid var(--primary-glow)", borderRadius: "6px",
                                                        padding: "4px 8px", fontSize: "11px", color: "var(--text-primary)",
                                                        outline: "none", transition: "border-color 0.2s",
                                                    }}
                                                    onFocus={(e) => e.target.style.borderColor = "var(--primary)"}
                                                    onBlur={(e) => e.target.style.borderColor = "var(--primary-glow)"}
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
                <div className="flex-1 flex flex-col relative" style={{ background: 'var(--bg-surface)' }}>
                    <MiniCanvas parentNodeId={nodeId} parentNodeData={data} />
                </div>
            </div>

            <div
                onMouseDown={handleResizeStart}
                style={{
                    position: "absolute",
                    width: "16px",
                    height: "16px",
                    right: "2px",
                    bottom: "2px",
                    cursor: "nwse-resize",
                    borderRight: "2px solid var(--primary-glow)",
                    borderBottom: "2px solid var(--primary-glow)",
                    opacity: 0.9,
                }}
                aria-label="Resize inspector panel"
                title="Resize"
            />
        </div>
    );
}
