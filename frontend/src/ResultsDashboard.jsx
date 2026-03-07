/**
 * ResultsDashboard.jsx — Human-Friendly Execution Results
 *
 * Replaces the raw JSON dump with:
 *   Level 1: Summary Dashboard (stats cards)
 *   Level 2: Node-by-Node Data Grid
 *   Level 3: Inline SVG Signature Charts (sweep visualization)
 *   Level 4: Raw JSON toggle (for debugging)
 */

import React, { useState, useMemo } from "react";

/* ═══════════════════════════════════════════════════
   UTILITY: Format numbers nicely
   ═══════════════════════════════════════════════════ */
function fmt(val) {
    if (val === undefined || val === null) return "—";
    if (typeof val !== "number") return String(val);
    if (Number.isNaN(val)) return "NaN";
    if (!Number.isFinite(val)) return val > 0 ? "+∞" : "-∞";
    if (Math.abs(val) >= 1e6 || (Math.abs(val) < 0.001 && val !== 0)) return val.toExponential(3);
    if (Number.isInteger(val)) return val.toLocaleString();
    return val.toFixed(4);
}

/* ═══════════════════════════════════════════════════
   STAT CARD — Glassmorphic metric badge
   ═══════════════════════════════════════════════════ */
function StatCard({ label, value, icon, color }) {
    return (
        <div style={{
            flex: "1 1 0", minWidth: "100px",
            background: `${color}08`,
            border: `1px solid ${color}25`,
            borderRadius: "6px",
            padding: "10px 12px",
            display: "flex", flexDirection: "column", gap: "4px",
        }}>
            <span style={{
                fontSize: "8px", fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: `${color}88`,
                fontFamily: "'JetBrains Mono', monospace",
            }}>{icon} {label}</span>
            <span style={{
                fontSize: "16px", fontWeight: 700, color,
                fontFamily: "'JetBrains Mono', monospace",
            }}>{value}</span>
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   MINI SVG CHART — Plots array of numbers
   ═══════════════════════════════════════════════════ */
function MiniChart({ data, label, color, sweepVarName, sweepValues }) {
    if (!data || data.length < 2) return null;

    const W = 200, H = 60, PAD = 4;
    const minV = Math.min(...data);
    const maxV = Math.max(...data);
    const range = maxV - minV || 1;

    const points = data.map((v, i) => {
        const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
        const y = H - PAD - ((v - minV) / range) * (H - PAD * 2);
        return { x, y, val: v };
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const areaD = `${pathD} L${points[points.length - 1].x.toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`;

    return (
        <div style={{ marginBottom: "8px" }}>
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: "4px",
            }}>
                <span style={{
                    fontSize: "9px", fontWeight: 600, color,
                    fontFamily: "'JetBrains Mono', monospace",
                }}>{label}</span>
                <span style={{
                    fontSize: "8px", color: "#4a5568",
                    fontFamily: "'JetBrains Mono', monospace",
                }}>{fmt(minV)} → {fmt(maxV)}</span>
            </div>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{
                width: "100%", height: "auto",
                background: "rgba(0,0,0,0.2)",
                borderRadius: "4px",
                border: `1px solid ${color}15`,
            }}>
                <defs>
                    <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={areaD} fill={`url(#grad-${label})`} />
                <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                {/* Start and end dots */}
                <circle cx={points[0].x} cy={points[0].y} r="2.5" fill={color} />
                <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={color} />
            </svg>
            {sweepVarName && sweepValues && (
                <div style={{
                    display: "flex", justifyContent: "space-between", marginTop: "2px",
                }}>
                    <span style={{ fontSize: "7px", color: "#4a5568", fontFamily: "'JetBrains Mono', monospace" }}>
                        {sweepVarName}={fmt(sweepValues[0])}
                    </span>
                    <span style={{ fontSize: "7px", color: "#4a5568", fontFamily: "'JetBrains Mono', monospace" }}>
                        {sweepVarName}={fmt(sweepValues[sweepValues.length - 1])}
                    </span>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   NODE OUTPUT ROW — Expandable row for data grid
   ═══════════════════════════════════════════════════ */
function NodeOutputRow({ nodeId, nodeLabel, outputs, isExpanded, onToggle }) {
    const outputEntries = Object.entries(outputs || {});
    if (outputEntries.length === 0) return null;

    return (
        <div style={{
            background: "rgba(255,255,255,0.01)",
            border: "1px solid rgba(100, 160, 220, 0.08)",
            borderRadius: "4px",
            overflow: "hidden",
        }}>
            {/* Header */}
            <button onClick={onToggle} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer",
                transition: "background 0.15s",
            }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
                <span style={{
                    fontSize: "10px", fontWeight: 700, color: "#e2e8f0",
                    fontFamily: "'JetBrains Mono', monospace",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                }}>{nodeLabel || nodeId}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{
                        fontSize: "9px", color: "#4a5568",
                        fontFamily: "'JetBrains Mono', monospace",
                    }}>{outputEntries.length} output{outputEntries.length !== 1 ? "s" : ""}</span>
                    <span style={{
                        fontSize: "10px", color: "#6b7fa0",
                        transition: "transform 0.2s",
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}>▸</span>
                </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div style={{
                    borderTop: "1px solid rgba(100, 160, 220, 0.06)",
                    padding: "0",
                }}>
                    {outputEntries.map(([name, value], i) => (
                        <div key={name} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "6px 12px",
                            borderBottom: i < outputEntries.length - 1 ? "1px solid rgba(100, 160, 220, 0.04)" : "none",
                        }}>
                            <span style={{
                                fontSize: "10px", color: "#93c5fd",
                                fontFamily: "'JetBrains Mono', monospace",
                            }}>{name}</span>
                            <span style={{
                                fontSize: "11px", fontWeight: 600, color: "#6ee7b7",
                                fontFamily: "'JetBrains Mono', monospace",
                            }}>{fmt(value)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════
   SCENARIO TAB — For multi-scenario results
   ═══════════════════════════════════════════════════ */
function ScenarioTab({ scenario, isActive, onClick }) {
    return (
        <button onClick={onClick} style={{
            padding: "5px 12px", borderRadius: "2px",
            fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontFamily: "'JetBrains Mono', monospace",
            background: isActive ? "var(--primary-dim, rgba(37, 99, 235, 0.12))" : "transparent",
            color: isActive ? "var(--primary, #3b82f6)" : "#4a5568",
            border: isActive ? "1px solid var(--primary-glow, rgba(37, 99, 235, 0.3))" : "1px solid transparent",
            cursor: "pointer",
            transition: "all 0.15s",
        }}>
            {scenario.scenario_name || "Scenario"}
        </button>
    );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function ResultsDashboard({ result, compiledJson }) {
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const [selectedScenarioIdx, setSelectedScenarioIdx] = useState(0);
    const [showRawJson, setShowRawJson] = useState(false);
    const [viewMode, setViewMode] = useState("grid"); // "grid" | "charts"

    if (!result) return null;

    const toggleNode = (nid) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nid)) next.delete(nid);
            else next.add(nid);
            return next;
        });
    };

    const meta = result.execution_metadata || {};
    const isMultiScenario = result.scenario_results && result.scenario_results.length > 0;
    const isSweep = result.sweep_points && result.sweep_points > 1;
    const isStatic = !isMultiScenario && !isSweep;
    const nodeLabelById = useMemo(() => {
        const map = {};
        for (const n of compiledJson?.nodes || []) {
            map[n.id] = n.label || n.id;
        }
        return map;
    }, [compiledJson]);
    const finalLayerInfo = useMemo(() => {
        const nodes = compiledJson?.nodes || [];
        if (nodes.length === 0) return { maxLayer: null, finalNodeIds: new Set() };
        const maxLayer = nodes.reduce((mx, n) => Math.max(mx, n.execution_layer ?? 0), 0);
        const finalNodeIds = new Set(
            nodes.filter((n) => (n.execution_layer ?? 0) === maxLayer).map((n) => n.id)
        );
        return { maxLayer, finalNodeIds };
    }, [compiledJson]);

    // ── Extract data for display ──
    let nodeOutputs = {};
    let sweepVars = [];
    let sweepValues = [];
    let dataPoints = [];

    if (isMultiScenario) {
        const sc = result.scenario_results[selectedScenarioIdx];
        if (sc) {
            sweepVars = sc.sweep_variables || [];
            sweepValues = sc.sweep_values || [];
            dataPoints = sc.data_points || [];
            // Show the LAST sweep point's outputs (or the only one if no sweep)
            nodeOutputs = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1] : {};
        }
    } else if (isSweep) {
        sweepVars = result.sweep_variables || [];
        sweepValues = result.sweep_values || [];
        dataPoints = result.data_points || [];
        nodeOutputs = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1] : {};
    } else {
        nodeOutputs = result.node_outputs || {};
    }

    const displayedNodeOutputs = useMemo(() => {
        if (!finalLayerInfo.finalNodeIds.size) return nodeOutputs;
        const filtered = {};
        for (const [nodeId, outputs] of Object.entries(nodeOutputs)) {
            if (finalLayerInfo.finalNodeIds.has(nodeId)) filtered[nodeId] = outputs;
        }
        return filtered;
    }, [nodeOutputs, finalLayerInfo]);

    // ── Compute aggregate stats ──
    const totalNodes = Object.keys(displayedNodeOutputs).length;
    const totalOutputs = Object.values(displayedNodeOutputs).reduce((s, outs) => s + Object.keys(outs || {}).length, 0);

    // ── Build chart data for sweep results ──
    const chartData = useMemo(() => {
        if (dataPoints.length < 2) return [];
        const charts = [];
        const sampleOutputs = dataPoints[0];
        if (!sampleOutputs) return [];

        for (const [nodeId, outputs] of Object.entries(sampleOutputs)) {
            if (finalLayerInfo.finalNodeIds.size > 0 && !finalLayerInfo.finalNodeIds.has(nodeId)) continue;
            for (const outName of Object.keys(outputs || {})) {
                const series = dataPoints.map(dp => dp[nodeId]?.[outName] ?? 0);
                // Only chart if values actually vary
                const min = Math.min(...series);
                const max = Math.max(...series);
                if (max - min > 1e-12) {
                    charts.push({
                        nodeId,
                        outName,
                        label: `${nodeLabelById[nodeId] || nodeId} → ${outName}`,
                        data: series,
                    });
                }
            }
        }
        return charts;
    }, [dataPoints, nodeLabelById, finalLayerInfo]);

    const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

    return (
        <div className="space-y-4">
            {/* ══════════════════════════════════════
         LEVEL 1: SUMMARY DASHBOARD
         ══════════════════════════════════════ */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {isMultiScenario && (
                    <StatCard label="Scenarios" value={result.scenario_results.length} icon="⚡" color="#8b5cf6" />
                )}
                {(isSweep || (isMultiScenario && dataPoints.length > 1)) && (
                    <StatCard label="Sweep Points" value={dataPoints.length} icon="📊" color="#f59e0b" />
                )}
                <StatCard label="Nodes" value={totalNodes} icon="🔷" color="#3b82f6" />
                <StatCard label="Outputs" value={totalOutputs} icon="📤" color="#10b981" />
                {meta.total_elapsed_ms !== undefined && (
                    <StatCard label="Time" value={`${meta.total_elapsed_ms}ms`} icon="⏱" color="#06b6d4" />
                )}
            </div>

            {/* ══════════════════════════════════════
         SCENARIO SELECTOR (Multi-Scenario only)
         ══════════════════════════════════════ */}
            {isMultiScenario && (
                <div style={{
                    display: "flex", gap: "4px", flexWrap: "wrap",
                    padding: "4px", borderRadius: "4px",
                    background: "rgba(0,0,0,0.15)",
                    border: "1px solid rgba(100, 160, 220, 0.06)",
                }}>
                    {result.scenario_results.map((sc, idx) => (
                        <ScenarioTab
                            key={sc.scenario_id}
                            scenario={sc}
                            isActive={idx === selectedScenarioIdx}
                            onClick={() => setSelectedScenarioIdx(idx)}
                        />
                    ))}
                </div>
            )}

            {/* ══════════════════════════════════════
         VIEW MODE TOGGLE
         ══════════════════════════════════════ */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
                <div style={{ display: "flex", gap: "2px" }}>
                    {[
                        { key: "grid", label: "DATA GRID" },
                        ...(chartData.length > 0 ? [{ key: "charts", label: "CHARTS" }] : []),
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setViewMode(tab.key)} style={{
                            padding: "4px 10px", fontSize: "8px", fontWeight: 700,
                            textTransform: "uppercase", letterSpacing: "0.1em",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: viewMode === tab.key ? "#e2e8f0" : "#4a5568",
                            background: viewMode === tab.key ? "rgba(255,255,255,0.05)" : "transparent",
                            border: viewMode === tab.key ? "1px solid rgba(100, 160, 220, 0.12)" : "1px solid transparent",
                            borderRadius: "2px", cursor: "pointer",
                            transition: "all 0.15s",
                        }}>{tab.label}</button>
                    ))}
                </div>
                <button onClick={() => setShowRawJson(!showRawJson)} style={{
                    padding: "3px 8px", fontSize: "7px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.1em",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: showRawJson ? "#fbbf24" : "#4a5568",
                    background: "transparent",
                    border: `1px solid ${showRawJson ? "rgba(251, 191, 36, 0.2)" : "rgba(100, 160, 220, 0.06)"}`,
                    borderRadius: "2px", cursor: "pointer",
                }}>{showRawJson ? "HIDE RAW" : "RAW JSON"}</button>
            </div>

            {finalLayerInfo.maxLayer !== null && (
                <p style={{
                    fontSize: "8px", fontWeight: 700, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: "#6b7fa0",
                    fontFamily: "'JetBrains Mono', monospace",
                }}>
                    Output Layer // Layer {finalLayerInfo.maxLayer + 1}
                </p>
            )}

            {/* ══════════════════════════════════════
         LEVEL 2: DATA GRID
         ══════════════════════════════════════ */}
            {viewMode === "grid" && (
                <div className="space-y-2">
                    {Object.entries(displayedNodeOutputs).length === 0 ? (
                        <p style={{ textAlign: "center", padding: "20px 0", color: "#4a5568", fontSize: "11px" }}>
                            No node outputs to display.
                        </p>
                    ) : (
                        Object.entries(displayedNodeOutputs).map(([nodeId, outputs]) => (
                            <NodeOutputRow
                                key={nodeId}
                                nodeId={nodeId}
                                nodeLabel={nodeLabelById[nodeId]}
                                outputs={outputs}
                                isExpanded={expandedNodes.has(nodeId)}
                                onToggle={() => toggleNode(nodeId)}
                            />
                        ))
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════
         LEVEL 3: SIGNATURE CHARTS
         ══════════════════════════════════════ */}
            {viewMode === "charts" && chartData.length > 0 && (
                <div className="space-y-3">
                    <p style={{
                        fontSize: "8px", fontWeight: 700, letterSpacing: "0.12em",
                        textTransform: "uppercase", color: "#6b7fa0",
                        fontFamily: "'JetBrains Mono', monospace",
                        marginBottom: "4px",
                    }}>SWEEP SIGNATURES — {chartData.length} varying output{chartData.length !== 1 ? "s" : ""}</p>
                    {chartData.map((chart, i) => (
                        <MiniChart
                            key={chart.label}
                            data={chart.data}
                            label={chart.label}
                            color={COLORS[i % COLORS.length]}
                            sweepVarName={sweepVars[0]}
                            sweepValues={sweepValues?.map(sv => sv[0])}
                        />
                    ))}
                </div>
            )}

            {/* ══════════════════════════════════════
         LEVEL 4: RAW JSON (Toggle)
         ══════════════════════════════════════ */}
            {showRawJson && (
                <pre style={{
                    fontSize: "10px", color: "#6ee7b7",
                    fontFamily: "'JetBrains Mono', monospace",
                    background: "rgba(6, 10, 16, 0.4)",
                    border: "1px solid rgba(100, 160, 220, 0.06)",
                    borderRadius: "4px",
                    padding: "12px",
                    maxHeight: "300px",
                    overflow: "auto",
                    lineHeight: "1.5",
                }}>
                    {JSON.stringify(result, null, 2)}
                </pre>
            )}
        </div>
    );
}
