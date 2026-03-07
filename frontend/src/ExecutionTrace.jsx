/**
 * ExecutionTrace.jsx — "Logic Trace" View
 *
 * Replaces the raw JSON Graph tab with a step-by-step execution audit log.
 * Shows each node in topological order with:
 *   - STEP number (execution layer order)
 *   - Node label and type
 *   - The raw formula
 *   - The "resolved trace" with actual numbers substituted in
 *   - The final computed value
 */

import React, { useMemo } from "react";

/* ═══ Number formatter ═══ */
function fmt(val) {
    if (val === undefined || val === null) return "—";
    if (typeof val !== "number") return String(val);
    if (Number.isNaN(val)) return "NaN";
    if (!Number.isFinite(val)) return val > 0 ? "+∞" : "-∞";
    if (Math.abs(val) >= 1e6 || (Math.abs(val) < 0.001 && val !== 0)) return val.toExponential(3);
    if (Number.isInteger(val)) return val.toLocaleString();
    return val.toFixed(4);
}

function formatSweepSummary(variables, values) {
    if (!variables || variables.length === 0 || !values) return "";
    return variables
        .map((name, idx) => {
            const raw = values[idx];
            if (raw === undefined) return "";
            return `${name}=${fmt(raw)}`;
        })
        .filter(Boolean)
        .join(", ");
}

function buildTraceVariants(backendResult) {
    if (!backendResult) return [];

    const variants = [];

    if (backendResult.node_outputs && backendResult.system_state) {
        variants.push({
            id: "default",
            label: "Default run",
            nodeOutputs: backendResult.node_outputs,
            systemState: backendResult.system_state,
        });
    }

    const scenarioResults = Array.isArray(backendResult.scenario_results) ? backendResult.scenario_results : [];
    scenarioResults.forEach((scenario) => {
        const combos = scenario.sweep_values || [];
        const nodes = scenario.data_points || [];
        const systemStates = scenario.system_states || [];
        const varNames = scenario.sweep_variables || [];
        const total = nodes.length || 1;
        nodes.forEach((nodeOutputs, idx) => {
            const summary = formatSweepSummary(varNames, combos[idx]);
            variants.push({
                id: `${scenario.scenario_id || "scenario"}_${idx}`,
                label: `${scenario.scenario_name || "Scenario"} • run ${idx + 1}/${total}`,
                nodeOutputs,
                systemState: systemStates[idx] || {},
                sweepVariables: varNames,
                sweepValues: combos[idx],
                sweepSummary: summary,
            });
        });
    });

    if (!scenarioResults.length && Array.isArray(backendResult.data_points)) {
        const combos = backendResult.sweep_values || [];
        const nodes = backendResult.data_points;
        const systemStates = backendResult.system_states || [];
        const varNames = backendResult.sweep_variables || [];
        const total = nodes.length || 1;
        nodes.forEach((nodeOutputs, idx) => {
            const summary = formatSweepSummary(varNames, combos[idx]);
            variants.push({
                id: `legacy_${idx}`,
                label: `Sweep run ${idx + 1}/${total}`,
                nodeOutputs,
                systemState: systemStates[idx] || {},
                sweepVariables: varNames,
                sweepValues: combos[idx],
                sweepSummary: summary,
            });
        });
    }

    return variants;
}

/* ═══ Inline token colorizer ═══ */
function colorizeFormula(formula) {
    // Simple tokenizer: numbers in blue, operators in purple, variables in green
    const parts = formula.split(/(\b\d+\.?\d*\b|[+\-*/()=,]|\s+)/g).filter(Boolean);
    return parts.map((part, i) => {
        if (/^\d+\.?\d*$/.test(part)) {
            return <span key={i} style={{ color: "#3b82f6", fontWeight: 600 }}>{part}</span>;
        }
        if (/^[+\-*/()=,]+$/.test(part)) {
            return <span key={i} style={{ color: "#d8b4fe", fontWeight: 700 }}>{part}</span>;
        }
        if (/^\s+$/.test(part)) {
            return <span key={i}>{part}</span>;
        }
        // Variable names
        return <span key={i} style={{ color: "#10b981" }}>{part}</span>;
    });
}

function parseSourceRef(sourceRef, nodeOutputs) {
    if (!sourceRef || !nodeOutputs) return null;
    const nodeIds = Object.keys(nodeOutputs).sort((a, b) => b.length - a.length);
    for (const nodeId of nodeIds) {
        const prefix = `${nodeId}_`;
        if (sourceRef.startsWith(prefix)) {
            return { nodeId, outputName: sourceRef.slice(prefix.length) };
        }
    }
    return null;
}

function parseSourceRefByNodeIds(sourceRef, nodeIds) {
    if (!sourceRef || !nodeIds || nodeIds.length === 0) return null;
    const sortedIds = [...nodeIds].sort((a, b) => b.length - a.length);
    for (const nodeId of sortedIds) {
        const prefix = `${nodeId}_`;
        if (sourceRef.startsWith(prefix)) {
            return { nodeId, outputName: sourceRef.slice(prefix.length) };
        }
    }
    return null;
}

/* ═══ Resolve a formula by substituting variable names with actual values ═══ */
function resolveFormula(formula, nodeId, inputsMapped, nodeOutputs, systemState) {
    let resolved = formula;
    const substitutions = {};

    // First, collect all variable names used in the formula
    const varRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    let match;
    while ((match = varRegex.exec(formula)) !== null) {
        const varName = match[1];
        // Skip math function names
        if (["sqrt", "abs", "max", "min", "pow", "sin", "cos", "tan", "log", "exp", "round", "Math"].includes(varName)) continue;

        if (systemState && varName in systemState) {
            substitutions[varName] = systemState[varName];
            continue;
        }

        // Node-scoped constants/inputs (used by the solve-time payload scoping).
        const scopedKey = `${nodeId}__${varName}`;
        if (systemState && scopedKey in systemState) {
            substitutions[varName] = systemState[scopedKey];
            continue;
        }

        // Alternate backend key pattern for outputs.
        const altScopedKey = `${nodeId}_${varName}`;
        if (systemState && altScopedKey in systemState) {
            substitutions[varName] = systemState[altScopedKey];
            continue;
        }

        // For wired inputs, resolve from mapped source output.
        const sourceRef = inputsMapped?.[varName];
        const parsed = parseSourceRef(sourceRef, nodeOutputs);
        if (parsed) {
            const mappedValue = nodeOutputs?.[parsed.nodeId]?.[parsed.outputName];
            if (mappedValue !== undefined) {
                substitutions[varName] = mappedValue;
                continue;
            }
        }

        // Intra-node references to previously computed outputs.
        const localOut = nodeOutputs?.[nodeId]?.[varName];
        if (localOut !== undefined) {
            substitutions[varName] = localOut;
        }
    }

    // Substitute values (longest names first to avoid partial replacements)
    const sortedVars = Object.keys(substitutions).sort((a, b) => b.length - a.length);
    for (const varName of sortedVars) {
        const val = substitutions[varName];
        resolved = resolved.replace(new RegExp(`\\b${varName}\\b`, "g"), fmt(val));
    }

    return resolved;
}

/* ═══ STEP CARD — One node's execution trace ═══ */
function StepCard({ node, nodeOutputs, systemState, nodeLabelById, layerByNodeId, traceVariants }) {
    const formulas = node.formulas || {};
    const formulaEntries = Object.entries(formulas);
    const inputsMapped = node.inputs_mapped || {};
    const inputEntries = Object.entries(inputsMapped);
    const variantBlocks = (traceVariants || []).filter(variant => variant.nodeOutputs?.[node.id]);

    const renderFormulaRows = (variantNodeOutputs, variantSystemState, prefix) => {
        return formulaEntries.map(([outputName, formula]) => {
            const resolvedStr = resolveFormula(formula, node.id, inputsMapped, variantNodeOutputs, variantSystemState);
            const variantOutput = variantNodeOutputs?.[node.id] || {};
            const resolvedValue = variantOutput?.[outputName];

            return (
                <div key={`${prefix}-${outputName}`} style={{ marginBottom: "8px" }}>
                    <div style={{
                        display: "flex", alignItems: "flex-start", gap: "6px",
                        marginBottom: "4px",
                    }}>
                        <span style={{
                            fontSize: "7px", fontWeight: 700, color: "#4a5568",
                            fontFamily: "'JetBrains Mono', monospace",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            flexShrink: 0,
                            paddingTop: "2px",
                        }}>FORMULA</span>
                        <div style={{
                            fontSize: "10px", fontFamily: "'JetBrains Mono', monospace",
                            lineHeight: "1.5",
                            wordBreak: "break-all",
                        }}>
                            <span style={{ color: "#6ee7b7", fontWeight: 600 }}>{outputName}</span>
                            <span style={{ color: "#d8b4fe", fontWeight: 700 }}> = </span>
                            {colorizeFormula(formula)}
                        </div>
                    </div>

                    <div style={{
                        display: "flex", alignItems: "flex-start", gap: "6px",
                        marginBottom: "4px",
                    }}>
                        <span style={{
                            fontSize: "7px", fontWeight: 700, color: "#4a5568",
                            fontFamily: "'JetBrains Mono', monospace",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            flexShrink: 0,
                            paddingTop: "2px",
                        }}>TRACE</span>
                        <div style={{
                            fontSize: "10px", fontFamily: "'JetBrains Mono', monospace",
                            color: "#94a5568",
                            lineHeight: "1.5",
                            wordBreak: "break-all",
                        }}>
                            <span style={{ color: "#6ee7b7", fontWeight: 600 }}>{outputName}</span>
                            <span style={{ color: "#d8b4fe" }}> = </span>
                            {resolvedStr}
                        </div>
                    </div>

                    {resolvedValue !== undefined && (
                        <div style={{
                            display: "flex", alignItems: "center", gap: "6px",
                        }}>
                            <span style={{
                                fontSize: "7px", fontWeight: 700, color: "#4a5568",
                                fontFamily: "'JetBrains Mono', monospace",
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                                flexShrink: 0,
                            }}>RESULT</span>
                            <span style={{
                                fontSize: "13px", fontWeight: 800, color: "#22d3ee",
                                fontFamily: "'JetBrains Mono', monospace",
                                background: "rgba(34, 211, 238, 0.06)",
                                border: "1px solid rgba(34, 211, 238, 0.15)",
                                padding: "2px 10px",
                                borderRadius: "3px",
                            }}>{fmt(resolvedValue)}</span>
                        </div>
                    )}
                </div>
            );
        });
    };

    const renderVariantBlock = (variant, idx) => {
        const variantNodeOutputs = variant.nodeOutputs || {};
        const variantSystemState = variant.systemState || {};
        return (
            <div key={`${variant.id}-${idx}`} style={{
                border: "1px solid rgba(100, 160, 220, 0.12)",
                borderRadius: "6px",
                overflow: "hidden",
                background: "rgba(15, 23, 42, 0.75)",
            }}>
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 10px", borderBottom: "1px solid rgba(100, 160, 220, 0.08)",
                    background: "rgba(34, 41, 61, 0.9)",
                }}>
                    <span style={{
                        fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
                        color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace",
                    }}>{variant.label}</span>
                    {variant.sweepSummary && (
                        <span style={{
                            fontSize: "8px", fontWeight: 600, color: "#c5d5e8",
                            fontFamily: "'JetBrains Mono', monospace",
                        }}>
                            {variant.sweepSummary}
                        </span>
                    )}
                </div>
                <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {renderFormulaRows(variantNodeOutputs, variantSystemState, `${variant.id}-${idx}`)}
                </div>
            </div>
        );
    };

    return (
        <div style={{
            background: "rgba(255,255,255,0.01)",
            border: "1px solid rgba(100, 160, 220, 0.08)",
            borderRadius: "6px",
            overflow: "hidden",
        }}>
            {/* Step Header */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px",
                background: "rgba(0,0,0,0.2)",
                borderBottom: "1px solid rgba(100, 160, 220, 0.06)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{
                        fontSize: "9px", fontWeight: 800, color: "#3b82f6",
                        background: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(59, 130, 246, 0.2)",
                        padding: "2px 8px", borderRadius: "2px",
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: "0.05em",
                    }}>LAYER {(layerByNodeId[node.id] ?? 0) + 1}</span>
                    <span style={{
                        fontSize: "11px", fontWeight: 700, color: "#e2e8f0",
                        fontFamily: "'JetBrains Mono', monospace",
                    }}>{node.label || node.id}</span>
                </div>
                <span style={{
                    fontSize: "8px", color: "#4a5568",
                    fontFamily: "'JetBrains Mono', monospace",
                    textTransform: "uppercase",
                }}>LAYER {node.execution_layer ?? "?"} • {node.type}</span>
            </div>

            {/* Inputs Section */}
            {inputEntries.length > 0 && (
                <div style={{ padding: "6px 12px", borderBottom: "1px solid rgba(100, 160, 220, 0.04)" }}>
                    <span style={{
                        fontSize: "7px", fontWeight: 700, letterSpacing: "0.15em",
                        textTransform: "uppercase", color: "#f59e0b",
                        fontFamily: "'JetBrains Mono', monospace",
                    }}>INPUTS WIRED</span>
                    <div style={{ marginTop: "4px" }}>
                        {inputEntries.map(([inputName, sourceRef]) => {
                            const val = systemState?.[inputName];
                            const parsed = parseSourceRefByNodeIds(sourceRef, Object.keys(nodeLabelById || {}));
                            const sourceDisplay = parsed
                                ? `${nodeLabelById?.[parsed.nodeId] || parsed.nodeId}.${parsed.outputName}`
                                : sourceRef;
                            return (
                                <div key={inputName} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "2px 0",
                                }}>
                                    <span style={{ fontSize: "9px", color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace" }}>
                                        <span style={{ color: "#4a5568" }}>{sourceDisplay} → </span>{inputName}
                                    </span>
                                    {val !== undefined && (
                                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#fef3c7", fontFamily: "'JetBrains Mono', monospace" }}>
                                            {fmt(val)}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Formulas Section */}
            {formulaEntries.length > 0 && (
                variantBlocks.length > 0 ? (
                    <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                        {variantBlocks.map(renderVariantBlock)}
                    </div>
                ) : (
                    <div style={{ padding: "8px 12px" }}>
                        {renderFormulaRows(nodeOutputs, systemState, "base")}
                    </div>
                )
            )}

            {/* No formulas fallback */}
            {formulaEntries.length === 0 && (
                <div style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: "9px", color: "#4a5568", fontFamily: "'JetBrains Mono', monospace", fontStyle: "italic" }}>
                        No formulas defined for this node.
                    </span>
                </div>
            )}
        </div>
    );
}
/* ═══ MAIN COMPONENT ═══ */
export default function ExecutionTrace({ compiledJson, backendResult, layout = "list" }) {
    // Determine the execution order
    const orderedNodes = useMemo(() => {
        if (!compiledJson?.nodes) return [];
        const nodes = [...compiledJson.nodes];

        // Sort by execution_layer (topological order)
        nodes.sort((a, b) => (a.execution_layer ?? 999) - (b.execution_layer ?? 999));
        return nodes;
    }, [compiledJson]);

    const nodeOutputs = backendResult?.node_outputs || null;
    const systemState = backendResult?.system_state || null;
    const traceVariants = useMemo(() => buildTraceVariants(backendResult), [backendResult]);
    const hasResults = !!backendResult;
    const nodeLabelById = useMemo(() => {
        const map = {};
        for (const n of orderedNodes) map[n.id] = n.label || n.id;
        return map;
    }, [orderedNodes]);
    const layerByNodeId = useMemo(() => {
        const map = {};
        for (const n of compiledJson?.nodes || []) {
            map[n.id] = n.execution_layer ?? 0;
        }
        return map;
    }, [compiledJson]);

    return (
        <div className="p-4 space-y-3">
            {/* Summary bar */}
            <div style={{
                display: "flex", gap: "6px", flexWrap: "wrap",
            }}>
                {[
                    { label: "NODES", value: orderedNodes.length, color: "#22d3ee" },
                    { label: "CONNECTIONS", value: compiledJson?.connections?.length || 0, color: "#10b981" },
                    { label: "LAYERS", value: compiledJson?.batch_metadata?.total_layers || 0, color: "#a78bfa" },
                    ...(hasResults ? [{ label: "STATUS", value: "SOLVED", color: "#6ee7b7" }] : [{ label: "STATUS", value: "PENDING", color: "#f59e0b" }]),
                ].map(badge => (
                    <span key={badge.label} style={{
                        fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em",
                        padding: "3px 10px", borderRadius: "2px",
                        background: `${badge.color}0C`,
                        color: badge.color,
                        border: `1px solid ${badge.color}25`,
                        fontFamily: "'JetBrains Mono', monospace",
                    }}>{badge.label}: {badge.value}</span>
                ))}
            </div>

            {/* Info hint */}
            {!hasResults && (
                <div style={{
                    background: "rgba(245, 158, 11, 0.06)",
                    border: "1px solid rgba(245, 158, 11, 0.15)",
                    borderRadius: "4px", padding: "8px 12px",
                }}>
                    <p style={{
                        fontSize: "9px", color: "#fbbf24", margin: 0,
                        fontFamily: "'JetBrains Mono', monospace",
                    }}>
                        Click "SOLVE" to see resolved traces with actual computed values.
                    </p>
                </div>
            )}

            {/* Step-by-step trace */}
            <div
                style={layout === "grid"
                    ? {
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
                        gap: "10px",
                    }
                    : undefined}
                className={layout === "grid" ? "" : "space-y-2"}
            >
                {orderedNodes.map((node) => (
                    <StepCard
                        key={node.id}
                        node={node}
                        nodeOutputs={nodeOutputs}
                        systemState={systemState}
                        nodeLabelById={nodeLabelById}
                        layerByNodeId={layerByNodeId}
                        traceVariants={traceVariants}
                    />
                ))}
            </div>

            {orderedNodes.length === 0 && (
                <p style={{ textAlign: "center", padding: "20px 0", color: "#4a5568", fontSize: "11px" }}>
                    No nodes compiled. Add nodes to the canvas and click "Execute" first.
                </p>
            )}
        </div>
    );
}
