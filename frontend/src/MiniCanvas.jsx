import React, { useState, useRef, useCallback } from "react";
import {
    ReactFlow,
    ReactFlowProvider,
    Controls,
    Background,
    BackgroundVariant,
    useNodesState,
    useEdgesState,
    addEdge,
    Handle,
    Position
} from "@xyflow/react";
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';
import { parse } from 'mathjs';
import { LogicNode, ForLoopNode, WhileLoopNode } from './SkeletonEditor';

const miniEditorBtnStyle = {
    height: "26px",
    borderRadius: "10px",
    background: "var(--primary-dim)",
    color: "var(--primary-strong)",
    border: "1px solid var(--primary-glow)",
    padding: "0 10px",
    fontSize: "10px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.15s",
    textTransform: "uppercase",
    fontFamily: "var(--font-body)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
};

// ── CUSTOM NODES FOR MINI-CANVAS ──

// A simple expression node (e.g., Add, Multiply)
function MathOpNode({ data }) {
    const isCustom = data.op === "custom";
    const batchLayer = data.batchLayer ?? "—";
    const batchColors = ["#22d3ee", "#818cf8", "#a78bfa", "#c084fc", "#e879f9", "#f472b6", "#fb923c", "#fbbf24"];
    const batchColor = batchColors[typeof batchLayer === "number" ? batchLayer % batchColors.length : 0] || "#818cf8";

    let texString = "";
    if (isCustom && data.expression) {
        try {
            texString = parse(data.expression.replace(/\*\*/g, '^')).toTex();
        } catch (e) {
            texString = String.raw`\text{...}`;
        }
    }

    return (
        <div style={{
            background: "var(--bg-card)",
            borderRadius: "4px",
            border: "1px solid var(--border-technical)",
            padding: "8px 12px",
            color: "var(--text-primary)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            minWidth: isCustom ? "150px" : "80px",
            textAlign: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            position: "relative",
        }}>
            {/* Batch Layer Badge (Read-Only) */}
            <div
                title={`Execution Batch ${batchLayer}`}
                style={{
                    position: "absolute", top: "-5px", right: "-5px", zIndex: 10,
                    background: "var(--bg-base)",
                    border: `1px solid ${batchColor}`,
                    borderRadius: "2px", padding: "0px 4px",
                    fontSize: "7px", fontWeight: "800",
                    color: batchColor, letterSpacing: "0.5px",
                }}
            >
                B{batchLayer}
            </div>
            {/* Dynamic Inputs (Top) */}
            {(data.inputs || ['a', 'b']).map((inp, i, arr) => (
                <Handle
                    key={inp}
                    type="target"
                    position={Position.Top}
                    id={inp}
                    style={{
                        background: "var(--primary-strong)",
                        left: `${(100 / (arr.length + 1)) * (i + 1)}%`,
                    }}
                />
            ))}

            <div style={{ color: "var(--primary-strong)", fontWeight: "bold", marginBottom: isCustom ? "4px" : "0" }}>
                {data.label}
            </div>

            {isCustom && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                    {/* Beautiful LaTeX Render Area (Read-Only) */}
                    <div style={{
                        background: "var(--bg-surface)",
                        padding: "8px",
                        borderRadius: "6px",
                        minHeight: "40px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-primary)"
                    }}>
                        {data.expression ? (
                            <InlineMath math={texString} errorColor={'#ef4444'} />
                        ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>Empty f(x)</span>
                        )}
                    </div>
                </div>
            )}

            <Handle type="source" position={Position.Bottom} id="out" style={{ background: "#10b981" }} />
        </div>
    );
}

// Input/Output terminal nodes (representing the parent component's I/O)
function TerminalNode({ data }) {
    const isInput = data.type === "input";
    return (
        <div style={{
            background: isInput ? "rgba(249, 115, 22, 0.08)" : "rgba(16, 185, 129, 0.08)",
            borderRadius: "2px",
            border: `1px solid ${isInput ? "rgba(249, 115, 22, 0.35)" : "rgba(16, 185, 129, 0.35)"}`,
            padding: "2px 6px",
            color: isInput ? "#fdba74" : "#6ee7b7",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            fontWeight: "bold"
        }}>
            {!isInput && <Handle type="target" position={Position.Top} style={{ background: "#6ee7b7" }} />}
            {data.label}
            {isInput && <Handle type="source" position={Position.Bottom} style={{ background: "#fdba74" }} />}
        </div>
    );
}

const nodeTypes = {
    mathOp: MathOpNode,
    logicOp: LogicNode,
    forLoop: ForLoopNode,
    whileLoop: WhileLoopNode,
    terminal: TerminalNode
};

// ── MAIN MINI-CANVAS COMPONENT ──

function MiniCanvasInner({ parentNodeId, parentNodeData }) {
    // Initial nodes based on parent's inputs and outputs
    const initialNodes = [];
    let xPosIn = 50;

    // Create terminal nodes for each input of the parent component
    const inputs = parentNodeData.customInputs || [];
    inputs.forEach((inp, idx) => {
        initialNodes.push({
            id: `in_${inp}`,
            type: "terminal",
            position: { x: xPosIn + (idx * 100), y: 50 },
            data: { label: inp, type: "input" },
            deletable: false,
        });
    });

    let xPosOut = 50;
    // Create terminal nodes for each output of the parent component
    const outputs = parentNodeData.customOutputs || [];
    outputs.forEach((out, idx) => {
        initialNodes.push({
            id: `out_${out}`,
            type: "terminal",
            position: { x: xPosOut + (idx * 100), y: 300 },
            data: { label: out, type: "output" },
            deletable: false,
        });
    });

    const hasInternalGraph = parentNodeData.internalGraph && parentNodeData.internalGraph.nodes && parentNodeData.internalGraph.nodes.length > initialNodes.length;
    const nodes = hasInternalGraph ? parentNodeData.internalGraph.nodes.map(n => ({ ...n, draggable: false, selectable: false })) : initialNodes;
    const edges = parentNodeData.internalGraph ? parentNodeData.internalGraph.edges : [];

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                minZoom={0.72}
                maxZoom={1.5}
                fitViewOptions={{ minZoom: 0.82, maxZoom: 1.08, padding: 0.12 }}
                fitView
                className="mini-canvas-theme"
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
            >
                <Background variant={BackgroundVariant.Dots} gap={15} size={1} color="var(--border-subtle)" />
                <Controls showInteractive={false} style={{ bottom: 10, left: 10 }} />
            </ReactFlow>

            {!hasInternalGraph ? (
                <div style={{
                    position: "absolute", inset: 0, zIndex: 10,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    background: "rgba(7, 12, 23, 0.6)",
                    pointerEvents: "none"
                }}>
                    <div style={{
                        background: "var(--bg-base)", border: "1px solid var(--border-technical)",
                        padding: "16px 24px", borderRadius: "2px", textAlign: "center",
                        boxShadow: "var(--shadow-node)", pointerEvents: "auto"
                    }}>
                        <p style={{ color: "var(--primary)", fontSize: "11px", fontWeight: "bold", marginBottom: "8px", textTransform: 'uppercase' }}>
                            LOCKED // READ_ONLY_SKELETON
                        </p>
                        <p style={{ color: "var(--text-muted)", fontSize: "9px", marginBottom: "16px", maxWidth: "250px", lineHeight: 1.4 }}>
                            Internal physics formula skeleton is locked to prevent accidental mutation. Use the logic editor for modifications.
                        </p>
                        <button
                            className="action-icon-btn"
                            onClick={() => {
                                const event = new CustomEvent("openSkeletonEditor", { detail: { nodeId: parentNodeId } });
                                window.dispatchEvent(event);
                            }}
                            style={miniEditorBtnStyle}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "color-mix(in oklab, var(--primary-dim) 78%, white 22%)";
                                e.currentTarget.style.boxShadow = "0 0 12px var(--primary-glow)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "var(--primary-dim)";
                                e.currentTarget.style.boxShadow = "none";
                            }}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75L3 17.25z" /><path d="M14.06 4.19l3.75 3.75" /></svg>
                            EDIT // LOGIC_EDITOR
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    className="action-icon-btn"
                    onClick={() => {
                        const event = new CustomEvent("openSkeletonEditor", { detail: { nodeId: parentNodeId } });
                        window.dispatchEvent(event);
                    }}
                    style={{
                        ...miniEditorBtnStyle,
                        position: "absolute", top: "10px", right: "10px", zIndex: 10,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = "color-mix(in oklab, var(--primary-dim) 78%, white 22%)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--primary-dim)";
                    }}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75L3 17.25z" /><path d="M14.06 4.19l3.75 3.75" /></svg>
                    EDIT // LOGIC_SKELETON
                </button>
            )}
        </div>
    );
}

// Wrap in provider so it has isolated state from the main app's ReactFlow
export default function MiniCanvas({ parentNodeId, parentNodeData }) {
    return (
        <ReactFlowProvider>
            <MiniCanvasInner parentNodeId={parentNodeId} parentNodeData={parentNodeData} />
        </ReactFlowProvider>
    );
}
