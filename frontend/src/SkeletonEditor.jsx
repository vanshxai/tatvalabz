import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    BackgroundVariant,
    Handle,
    Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ComponentRegistry from './ComponentRegistry';
import { computeExecutionBatches } from './GraphCompiler';
import { InlineMath } from 'react-katex';
import { parse } from 'mathjs';
import { DebouncedInput } from './CustomNode';
import { customPrompt } from './CustomDialog';
import { templateFormulaLibrary } from './templateUtils';

// ── CUSTOM NODES FOR SKELETON EDITOR ──

function MathNode({ data }) {
    const isCustom = data.op === "custom";
    const batchLayer = data.batchLayer ?? "—";
    const batchOverride = data.batchOverride;
    const hasBatchOverride = batchOverride !== undefined && batchOverride !== null && batchOverride !== "";
    const [draftExpression, setDraftExpression] = useState(data.expression || "");

    // Color scale for batch layers
    const batchColors = ["#22d3ee", "#818cf8", "#a78bfa", "#c084fc", "#e879f9", "#f472b6", "#fb923c", "#fbbf24"];
    const batchColor = batchColors[typeof batchLayer === "number" ? batchLayer % batchColors.length : 0] || "#818cf8";

    const lhsVar = data.outputName
        || (typeof data.label === "string" && data.label.includes("=") ? data.label.split("=")[0].trim() : "out");
    const savedLhs = normalizeFormulaLhs(lhsVar) || "out";

    useEffect(() => {
        const savedRhs = (data.expression || "").trim();
        if (!savedRhs) {
            setDraftExpression("");
            return;
        }
        setDraftExpression(`${savedLhs} = ${savedRhs}`);
    }, [data.expression, savedLhs]);

    const rawDraft = (draftExpression || "").trim();
    const eqIndex = rawDraft.indexOf("=");
    const hasInlineEquation = eqIndex > 0;
    const typedLhs = hasInlineEquation ? rawDraft.slice(0, eqIndex).trim() : "";
    const normalizedTypedLhs = normalizeFormulaLhs(typedLhs);
    const rhsExpression = hasInlineEquation ? rawDraft.slice(eqIndex + 1).trim() : rawDraft;

    let texString = "";
    if (isCustom && rhsExpression) {
        try {
            // convert expression to LaTeX using mathjs (replacing python ** with ^ for parsing)
            texString = parse(rhsExpression.replace(/\*\*/g, '^')).toTex();
        } catch (e) {
            texString = String.raw`\text{... } `; // Fallback if user is mid-typing an incomplete expression
        }
    }

    const previewLhs = normalizedTypedLhs || savedLhs;
    const lhsTex = String(previewLhs).replace(/_/g, '\\_');
    const formulaTex = rhsExpression ? `${lhsTex} = ${texString}` : "";
    const isDirty = rhsExpression !== (data.expression || "") || (normalizedTypedLhs && normalizedTypedLhs !== savedLhs);

    const handleBatchClick = async (e) => {
        e.stopPropagation();
        const newBatch = await customPrompt(
            `Batch Override for ${data.label}`,
            `Current batch layer: ${batchLayer} \n\nEnter a manual batch override(number ≥ 0), or leave empty to use auto - detection: `,
            hasBatchOverride ? String(batchOverride) : ""
        );
        if (newBatch === null) return; // cancelled
        if (data.onBatchOverride) {
            data.onBatchOverride(newBatch.trim() === "" ? null : newBatch.trim());
        }
    };

    return (
        <div style={{
            background: "rgba(14, 20, 35, 0.9)",
            borderRadius: "10px",
            border: "1px solid rgba(167, 139, 250, 0.4)",
            padding: "8px 12px",
            color: "#e2e8f0",
            fontSize: "12px",
            fontFamily: "'JetBrains Mono', monospace",
            minWidth: isCustom ? "150px" : "80px",
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            position: "relative",
        }}>
            {/* Batch Layer Badge */}
            <div
                onClick={handleBatchClick}
                title={`Execution Batch ${batchLayer}${hasBatchOverride ? " (manual override)" : " (auto)"} \nClick to change`}
                className="nodrag"
                style={{
                    position: "absolute", top: "-8px", right: "-8px", zIndex: 10,
                    background: hasBatchOverride ? "rgba(251, 191, 36, 0.25)" : `${batchColor} 22`,
                    border: `1.5px solid ${hasBatchOverride ? "#fbbf24" : batchColor} `,
                    borderRadius: "10px", padding: "1px 6px",
                    fontSize: "9px", fontWeight: "800",
                    color: hasBatchOverride ? "#fbbf24" : batchColor,
                    cursor: "pointer", transition: "all 0.2s",
                    letterSpacing: "0.5px",
                    boxShadow: `0 0 8px ${hasBatchOverride ? "rgba(251, 191, 36, 0.3)" : `${batchColor}33`} `,
                }}
            >
                B{batchLayer}{hasBatchOverride ? "⚡" : ""}
            </div>

            {/* Dynamic Inputs (left) */}
            {(data.inputs || ['a', 'b']).map((inp, i, arr) => (
                <Handle
                    key={inp}
                    type="target"
                    position={Position.Top}
                    id={inp}
                    style={{
                        background: "#c4b5fd",
                        left: `${(100 / (arr.length + 1)) * (i + 1)}% `,
                    }}
                />
            ))}

            <div style={{ color: "#a5b4fc", fontWeight: "bold", marginBottom: isCustom ? "4px" : "0" }}>
                {data.label}
            </div>

            {isCustom && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                    {/* Beautiful LaTeX Render Area */}
                    <div style={{
                        background: "rgba(0,0,0,0.5)",
                        padding: "8px",
                        borderRadius: "6px",
                        minHeight: "40px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid rgba(167,139,250,0.2)",
                        color: "#e2e8f0"
                    }}>
                        {draftExpression ? (
                            <InlineMath math={formulaTex} errorColor={'#ef4444'} />
                        ) : (
                            <span style={{ color: "#6b7fa0", fontSize: "10px" }}>out = f(x) Preview</span>
                        )}
                    </div>

                    {/* Raw Text Input */}
                    <input
                        type="text"
                        placeholder="e.g. v = i*r  or  (a+b**2)/sqrt(c)"
                        value={draftExpression}
                        onChange={(e) => setDraftExpression(e.target.value)}
                        className="nodrag"
                        style={{
                            width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(167,139,250,0.5)",
                            color: "#fbbf24", fontSize: "11px", padding: "6px", borderRadius: "4px", textAlign: "center",
                            outline: "none", transition: "border-color 0.2s"
                        }}
                        onFocus={(e) => e.target.style.borderColor = "#c4b5fd"}
                        onBlur={(e) => e.target.style.borderColor = "rgba(167,139,250,0.5)"}
                    />

                    <button
                        className="nodrag"
                        onClick={() => data.onExpressionChange && data.onExpressionChange(rhsExpression, normalizedTypedLhs)}
                        style={{
                            width: "100%",
                            background: isDirty ? "rgba(16,185,129,0.2)" : "rgba(100,160,220,0.08)",
                            border: `1px solid ${isDirty ? "rgba(16,185,129,0.45)" : "rgba(100,160,220,0.25)"}`,
                            color: isDirty ? "#6ee7b7" : "#94a3b8",
                            padding: "5px 8px",
                            borderRadius: "4px",
                            fontSize: "10px",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            cursor: "pointer",
                            textTransform: "uppercase",
                        }}
                        title="Save this formula into the node"
                    >
                        {isDirty ? "Save Formula" : "Saved"}
                    </button>
                </div>
            )}

            <Handle type="source" position={Position.Bottom} id="out" style={{ background: "#10b981" }} />
        </div>
    );
}

// ── NEW LOGIC NODE ──
export function LogicNode({ data }) {
    return (
        <div style={{
            background: "rgba(20, 15, 35, 0.9)",
            borderRadius: "10px",
            border: "1px solid rgba(236, 72, 153, 0.4)",
            padding: "8px 12px",
            color: "#e2e8f0",
            fontSize: "12px",
            fontFamily: "'JetBrains Mono', monospace",
            minWidth: "160px",
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(236, 72, 153, 0.2)"
        }}>
            <div style={{ color: "#f472b6", fontWeight: "bold", marginBottom: "8px" }}>
                {data.label}
            </div>

            {/* Inputs */}
            <Handle type="target" position={Position.Top} id="dataIn" style={{ background: "#f472b6", left: "50%" }} />
            <span style={{ fontSize: "8px", position: "absolute", top: "-12px", left: "40%", color: "#f472b6" }}>Data In</span>

            {/* Condition Editor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: "rgba(0,0,0,0.3)", padding: '4px 6px', borderRadius: '4px', marginBottom: '12px', color: '#fbcfe8', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }}>
                <span>if</span>
                <DebouncedInput
                    type="text"
                    placeholder="var"
                    value={data.condVar || ""}
                    onChange={(e) => data.onChange && data.onChange("condVar", e.target.value)}
                    className="nodrag"
                    style={{ width: "35px", background: "transparent", borderBottom: "1px solid #f472b6", color: "#fbcfe8", textAlign: "center", outline: 'none' }}
                />
                <select
                    className="nodrag"
                    value={data.operator || ">"}
                    onChange={(e) => data.onChange && data.onChange("operator", e.target.value)}
                    style={{ background: "transparent", color: "#f472b6", border: "none", outline: 'none', appearance: 'none', cursor: 'pointer', textAlign: 'center', padding: '0 4px', fontWeight: 'bold' }}
                >
                    <option style={{ background: '#1a0b16' }} value=">">&gt;</option>
                    <option style={{ background: '#1a0b16' }} value="<">&lt;</option>
                    <option style={{ background: '#1a0b16' }} value="==">==</option>
                    <option style={{ background: '#1a0b16' }} value="!=">!=</option>
                    <option style={{ background: '#1a0b16' }} value=">=">&gt;=</option>
                    <option style={{ background: '#1a0b16' }} value="<=">&lt;=</option>
                </select>
                <DebouncedInput
                    type="text"
                    placeholder="val"
                    value={data.condVal || ""}
                    onChange={(e) => data.onChange && data.onChange("condVal", e.target.value)}
                    className="nodrag"
                    style={{ width: "35px", background: "transparent", borderBottom: "1px solid #f472b6", color: "#fbcfe8", textAlign: "center", outline: 'none' }}
                />
                <span>:</span>
            </div>

            {/* Outputs */}
            <Handle type="source" position={Position.Bottom} id="trueOut" style={{ background: "#10b981", left: "25%" }} />
            <span style={{ fontSize: "8px", position: "absolute", bottom: "-14px", left: "15%", color: "#10b981" }}>True</span>

            <Handle type="source" position={Position.Bottom} id="falseOut" style={{ background: "#ef4444", left: "75%" }} />
            <span style={{ fontSize: "8px", position: "absolute", bottom: "-14px", left: "65%", color: "#ef4444" }}>False</span>
        </div>
    );
}

// ── NEW FOR LOOP NODE ──
export function ForLoopNode({ data }) {
    let texString = "";
    if (data.expression) {
        try {
            texString = parse(data.expression.replace(/\*\*/g, '^')).toTex();
        } catch (e) {
            texString = String.raw`\text{... } `;
        }
    }

    return (
        <div style={{
            background: "rgba(20, 30, 15, 0.9)",
            borderRadius: "10px",
            border: "1px solid rgba(132, 204, 22, 0.4)",
            padding: "8px 12px",
            color: "#e2e8f0",
            fontSize: "12px",
            fontFamily: "'JetBrains Mono', monospace",
            minWidth: "160px",
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(132, 204, 22, 0.2)"
        }}>
            <div style={{ color: "#bef264", fontWeight: "bold", marginBottom: "8px" }}>
                {data.label}
            </div>

            {/* Input Data */}
            <Handle type="target" position={Position.Top} id="dataIn" style={{ background: "#bef264", left: "50%" }} />
            <span style={{ fontSize: "8px", position: "absolute", top: "-12px", left: "40%", color: "#bef264" }}>Data In</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: "rgba(0,0,0,0.3)", padding: '4px', borderRadius: '4px', marginBottom: '8px', color: '#d9f99d', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }}>
                <span>for</span>
                <DebouncedInput
                    type="text"
                    placeholder="i"
                    value={data.iteratorVar || ""}
                    onChange={(e) => data.onChange && data.onChange("iteratorVar", e.target.value)}
                    className="nodrag"
                    style={{ width: "24px", background: "transparent", borderBottom: "1px solid #84cc16", color: "#d9f99d", textAlign: "center", outline: 'none' }}
                />
                <span>in range(</span>
                <DebouncedInput
                    type="number"
                    placeholder="0"
                    value={data.startRange || ""}
                    onChange={(e) => data.onChange && data.onChange("startRange", Number(e.target.value))}
                    className="nodrag"
                    style={{ width: "30px", background: "transparent", borderBottom: "1px solid #84cc16", color: "#d9f99d", textAlign: "center", outline: 'none' }}
                />
                <span>,</span>
                <DebouncedInput
                    type="number"
                    placeholder="10"
                    value={data.endRange || ""}
                    onChange={(e) => data.onChange && data.onChange("endRange", Number(e.target.value))}
                    className="nodrag"
                    style={{ width: "30px", background: "transparent", borderBottom: "1px solid #84cc16", color: "#d9f99d", textAlign: "center", outline: 'none' }}
                />
                <span>):</span>
            </div>

            {/* Expression Builder inside loop */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ background: "rgba(0,0,0,0.5)", padding: "4px", borderRadius: "4px", minHeight: "30px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(132, 204, 22, 0.2)" }}>
                    {data.expression ? <InlineMath math={texString} errorColor={'#ef4444'} /> : <span style={{ color: "#6b7fa0", fontSize: "10px" }}>Value changes</span>}
                </div>
                <DebouncedInput
                    type="text"
                    placeholder="e.g. dataIn + i**2"
                    value={data.expression || ""}
                    onChange={(e) => data.onExpressionChange && data.onExpressionChange(e.target.value)}
                    className="nodrag"
                    style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(132, 204, 22, 0.5)", color: "#fbbf24", fontSize: "11px", padding: "4px", borderRadius: "4px", textAlign: "center" }}
                />
            </div>

            <Handle type="source" position={Position.Bottom} id="out" style={{ background: "#bef264" }} />
        </div>
    );
}

// ── NEW WHILE LOOP NODE ──
export function WhileLoopNode({ data }) {
    let texString = "";
    if (data.expression) {
        try { texString = parse(data.expression.replace(/\*\*/g, '^')).toTex(); } catch (e) { texString = String.raw`\text{... } `; }
    }

    return (
        <div style={{
            background: "rgba(30, 20, 15, 0.9)",
            borderRadius: "10px",
            border: "1px solid rgba(249, 115, 22, 0.4)",
            padding: "8px 12px",
            color: "#e2e8f0",
            fontSize: "12px",
            fontFamily: "'JetBrains Mono', monospace",
            minWidth: "160px",
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(249, 115, 22, 0.2)"
        }}>
            <div style={{ color: "#fdba74", fontWeight: "bold", marginBottom: "8px" }}>
                {data.label}
            </div>

            <Handle type="target" position={Position.Top} id="dataIn" style={{ background: "#fdba74", left: "50%" }} />
            <span style={{ fontSize: "8px", position: "absolute", top: "-12px", left: "40%", color: "#fdba74" }}>Data In</span>

            {/* Condition Editor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: "rgba(0,0,0,0.3)", padding: '4px 6px', borderRadius: '4px', marginBottom: '8px', color: '#fed7aa', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }}>
                <span>while</span>
                <DebouncedInput
                    type="text"
                    placeholder="var"
                    value={data.condVar || ""}
                    onChange={(e) => data.onChange && data.onChange("condVar", e.target.value)}
                    className="nodrag"
                    style={{ width: "35px", background: "transparent", borderBottom: "1px solid #f97316", color: "#fed7aa", textAlign: "center", outline: 'none' }}
                />
                <select
                    className="nodrag"
                    value={data.operator || "<"}
                    onChange={(e) => data.onChange && data.onChange("operator", e.target.value)}
                    style={{ background: "transparent", color: "#f97316", border: "none", outline: 'none', appearance: 'none', cursor: 'pointer', textAlign: 'center', padding: '0 4px', fontWeight: 'bold' }}
                >
                    <option style={{ background: '#1a100c' }} value=">">&gt;</option>
                    <option style={{ background: '#1a100c' }} value="<">&lt;</option>
                    <option style={{ background: '#1a100c' }} value="==">==</option>
                    <option style={{ background: '#1a100c' }} value="!=">!=</option>
                    <option style={{ background: '#1a100c' }} value=">=">&gt;=</option>
                    <option style={{ background: '#1a100c' }} value="<=">&lt;=</option>
                </select>
                <DebouncedInput
                    type="number"
                    placeholder="val"
                    value={data.condVal || ""}
                    onChange={(e) => data.onChange && data.onChange("condVal", e.target.value)}
                    className="nodrag"
                    style={{ width: "35px", background: "transparent", borderBottom: "1px solid #f97316", color: "#fed7aa", textAlign: "center", outline: 'none' }}
                />
                <span>:</span>
            </div>

            {/* Expression Inside Loop */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ background: "rgba(0,0,0,0.5)", padding: "4px", borderRadius: "4px", minHeight: "30px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(249, 115, 22, 0.2)" }}>
                    {data.expression ? <InlineMath math={texString} errorColor={'#ef4444'} /> : <span style={{ color: "#6b7fa0", fontSize: "10px" }}>Value changes</span>}
                </div>
                <DebouncedInput
                    type="text"
                    placeholder="e.g. pressure + 5"
                    value={data.expression || ""}
                    onChange={(e) => data.onExpressionChange && data.onExpressionChange(e.target.value)}
                    className="nodrag"
                    style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(249, 115, 22, 0.5)", color: "#fbbf24", fontSize: "11px", padding: "4px", borderRadius: "4px", textAlign: "center" }}
                />
            </div>

            <Handle type="source" position={Position.Bottom} id="out" style={{ background: "#fdba74" }} />
        </div>
    );
}

function TerminalNode({ data }) {
    const isInput = data.type === "input";
    return (
        <div style={{
            background: isInput ? "rgba(249, 115, 22, 0.15)" : "rgba(16, 185, 129, 0.15)",
            borderRadius: "6px",
            border: `1px solid ${isInput ? "rgba(249, 115, 22, 0.4)" : "rgba(16, 185, 129, 0.4)"} `,
            padding: "6px 12px",
            color: isInput ? "#fdba74" : "#6ee7b7",
            fontSize: "13px",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: "bold"
        }}>
            {!isInput && <Handle type="target" position={Position.Top} style={{ background: "#6ee7b7" }} />}
            {data.label}
            {isInput && <Handle type="source" position={Position.Bottom} style={{ background: "#fdba74" }} />}
        </div>
    );
}

const nodeTypes = {
    mathOp: MathNode,
    logicOp: LogicNode,
    forLoop: ForLoopNode,
    whileLoop: WhileLoopNode,
    terminal: TerminalNode
};

const MATH_SYMBOLS = new Set([
    "sqrt", "abs", "max", "min", "pow", "sin", "cos", "tan", "log", "exp", "round", "Math"
]);

function substituteParams(formula, params = {}) {
    let result = formula || "";
    for (const [key, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\b${key}\\b`, "g"), String(value));
    }
    return result;
}

function extractFormulaVars(expression) {
    const matches = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const seen = new Set();
    return matches.filter((name) => {
        if (MATH_SYMBOLS.has(name)) return false;
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
    });
}

function normalizeFormulaLhs(lhs) {
    const cleaned = String(lhs || "").trim().replace(/[^a-zA-Z0-9_]/g, "");
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleaned) ? cleaned : "";
}

// ── SKELETON EDITOR COMPONENT ──

function SkeletonEditorInner({ targetNode, onBack, onSave }) {
    const parentData = targetNode.data;

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [showLibrary, setShowLibrary] = useState(true);
    const reactFlowWrapper = useRef(null);

    // Initialize graph state (either from existing internalGraph or generating terminals)
    useEffect(() => {
        if (parentData.internalGraph && parentData.internalGraph.nodes && parentData.internalGraph.nodes.length > 0) {
            // Load existing
            setNodes(parentData.internalGraph.nodes.map(n => ({
                ...n,
                // Re-bind function for custom expression nodes
                data: {
                    ...n.data,
                    onExpressionChange: (val, lhs) => {
                        setNodes(nds => nds.map(node => {
                            if (node.id === n.id) {
                                // Simple parser to extract unique letters for inputs
                                const vars = val.match(/[a-zA-Z]+/g) || [];
                                const uniqueVars = [...new Set(vars)].filter(v => v !== 'sin' && v !== 'cos' && v !== 'tan' && v !== 'log');
                                const normalizedLhs = normalizeFormulaLhs(lhs);
                                return {
                                    ...node,
                                    data: {
                                        ...node.data,
                                        expression: val,
                                        inputs: uniqueVars,
                                        outputName: normalizedLhs || node.data.outputName
                                    }
                                };
                            }
                            return node;
                        }));
                    }
                }
            })));
            setEdges(parentData.internalGraph.edges || []);
        } else {
            // Generate clean slate terminals
            let initialNodes = [];
            let initialEdges = [];

            // Fallback to ComponentRegistry defaults if no custom override has occurred yet
            const defaultInputs = ComponentRegistry[parentData.type]?.inputs || [];
            const inputs = parentData.customInputs !== undefined ? parentData.customInputs : defaultInputs;

            inputs.forEach((inp, idx) => {
                initialNodes.push({ id: `in_${inp} `, type: "terminal", position: { x: 300 + (idx * 150), y: 50 }, data: { label: inp, type: "input" }, deletable: true });
            });

            const defaultOutputs = ComponentRegistry[parentData.type]?.outputs || [];
            const outputs = parentData.customOutputs !== undefined ? parentData.customOutputs : defaultOutputs;

            outputs.forEach((out, idx) => {
                initialNodes.push({ id: `out_${out} `, type: "terminal", position: { x: 300 + (idx * 150), y: 600 }, data: { label: out, type: "output" }, deletable: true });
            });

            const registry = ComponentRegistry[parentData.type] || {};
            const formulasSource = parentData.customFormulas || registry.formulas || {};
            const defaultParams = registry.defaultParams || {};
            const outputFormulaNodeId = {};

            outputs.forEach((out, idx) => {
                const baseFormula = formulasSource[out];
                if (!baseFormula) return;
                const expression = substituteParams(baseFormula, defaultParams);
                const formulaInputs = extractFormulaVars(expression);
                const formulaNodeId = `math_init_${out}_${Date.now()}_${idx} `;
                outputFormulaNodeId[out] = formulaNodeId;

                initialNodes.push({
                    id: formulaNodeId,
                    type: "mathOp",
                    position: { x: 260 + (idx * 180), y: 320 },
                    data: {
                        label: `${out} = f(x)`,
                        op: "custom",
                        inputs: formulaInputs.length > 0 ? formulaInputs : ['a', 'b'],
                        expression,
                        batchLayer: 0,
                        batchOverride: null,
                        onExpressionChange: (val, lhs) => {
                            setNodes(nds => nds.map(node => {
                                if (node.id === formulaNodeId) {
                                    const vars = val.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
                                    const uniqueVars = [...new Set(vars)].filter(v => !MATH_SYMBOLS.has(v));
                                    const normalizedLhs = normalizeFormulaLhs(lhs);
                                    return {
                                        ...node,
                                        data: {
                                            ...node.data,
                                            expression: val,
                                            inputs: uniqueVars.length > 0 ? uniqueVars : ['a', 'b'],
                                            outputName: normalizedLhs || node.data.outputName
                                        }
                                    };
                                }
                                return node;
                            }));
                        },
                        onBatchOverride: (val) => {
                            setNodes(nds => nds.map(node => (
                                node.id === formulaNodeId
                                    ? { ...node, data: { ...node.data, batchOverride: val } }
                                    : node
                            )));
                        },
                    },
                    deletable: true,
                });

                initialEdges.push({
                    id: `e_${formulaNodeId}_out_${out}_${Date.now()} `,
                    source: formulaNodeId,
                    sourceHandle: "out",
                    target: `out_${out} `,
                    animated: true,
                });
            });

            outputs.forEach((out) => {
                const baseFormula = formulasSource[out];
                if (!baseFormula) return;
                const expression = substituteParams(baseFormula, defaultParams);
                const vars = extractFormulaVars(expression);
                const targetFormulaNodeId = outputFormulaNodeId[out];
                if (!targetFormulaNodeId) return;

                vars.forEach((varName) => {
                    if (inputs.includes(varName)) {
                        initialEdges.push({
                            id: `e_in_${varName}_to_${targetFormulaNodeId}_${Date.now()} `,
                            source: `in_${varName} `,
                            sourceHandle: null,
                            target: targetFormulaNodeId,
                            targetHandle: varName,
                            animated: true,
                        });
                    } else if (outputFormulaNodeId[varName] && outputFormulaNodeId[varName] !== targetFormulaNodeId) {
                        initialEdges.push({
                            id: `e_${outputFormulaNodeId[varName]}_to_${targetFormulaNodeId}_${Date.now()} `,
                            source: outputFormulaNodeId[varName],
                            sourceHandle: "out",
                            target: targetFormulaNodeId,
                            targetHandle: varName,
                            animated: true,
                        });
                    }
                });
            });

            setNodes(initialNodes);
            setEdges(initialEdges);
        }
    }, [parentData]);

    // ── Batch Layer Auto-Computation ──
    // Recomputes execution layers whenever nodes or edges change
    useEffect(() => {
        if (nodes.length === 0) return;
        try {
            const { nodeLayers } = computeExecutionBatches(nodes, edges);
            setNodes(nds => nds.map(n => {
                if (n.type === 'mathOp' || n.type === 'logicOp' || n.type === 'forLoop' || n.type === 'whileLoop') {
                    const autoLayer = nodeLayers[n.id] ?? 0;
                    // Don't touch existing data callbacks, just inject batchLayer
                    if (n.data.batchLayer !== autoLayer) {
                        return { ...n, data: { ...n.data, batchLayer: autoLayer } };
                    }
                }
                return n;
            }));
        } catch (e) {
            // Silently ignore batch computation errors (e.g. during node deletion)
        }
    }, [edges.length, nodes.length]);

    const onConnect = useCallback((params) => {
        setEdges((eds) => addEdge({ ...params, animated: true }, eds));
    }, [setEdges]);

    // Drag & Drop
    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        async (event) => {
            event.preventDefault();
            const opDataStr = event.dataTransfer.getData('application/reactflow-math');
            if (!opDataStr) return;

            const opData = JSON.parse(opDataStr);
            const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();

            // Note: In real app use ReactFlow hook `screenToFlowPosition`
            const position = {
                x: event.clientX - reactFlowBounds.left - 50,
                y: event.clientY - reactFlowBounds.top - 20,
            };

            if (opData.type === 'terminal') {
                const varName = await customPrompt(
                    `New ${opData.op} Variable`,
                    `Enter ${opData.op} variable name(e.g., 'voltage'): `
                );
                if (!varName || !varName.trim()) return;

                const cleanName = varName.trim().replace(/[^a-zA-Z0-9_]/g, '');
                if (!cleanName) return;

                const newNode = {
                    id: `${opData.op}_${cleanName}_${Date.now()} `,
                    type: 'terminal',
                    position,
                    data: { label: cleanName, type: opData.op },
                    deletable: true
                };
                setNodes((nds) => nds.concat(newNode));
                return;
            }

            const newNodeId = `math_${Date.now()} `;

            const derivedExpression = opData.expression || "";
            const providedInputs = Array.isArray(opData.inputs) && opData.inputs.length ? opData.inputs : ['a', 'b'];
            const normalizedOutputName = normalizeFormulaLhs(opData.outputName) || normalizeFormulaLhs(opData.label?.split('=')[0]) || 'out';
            const nodeLabel = opData.label || `${normalizedOutputName} = f(x)`;

            const newNode = {
                id: newNodeId,
                type: opData.type || 'mathOp',
                position,
                data: {
                    label: nodeLabel,
                    op: opData.op,
                    inputs: providedInputs,
                    expression: derivedExpression,
                    outputName: normalizedOutputName,
                    batchLayer: 0,
                    batchOverride: null,
                    condVar: "",
                    operator: opData.type === 'whileLoop' ? "<" : ">",
                    condVal: "",
                    iteratorVar: "i",
                    startRange: 0,
                    endRange: 10,
                    onChange: (key, val) => {
                        setNodes(nds => nds.map(node => {
                            if (node.id === newNodeId) {
                                return { ...node, data: { ...node.data, [key]: val } };
                            }
                            return node;
                        }));
                    },
                    onExpressionChange: (val, lhs) => {
                        setNodes(nds => nds.map(node => {
                            if (node.id === newNodeId) {
                                const vars = val.match(/[a-zA-Z]+/g) || [];
                                const uniqueVars = [...new Set(vars)].filter(v => ['sin', 'cos', 'tan', 'log', 'pi'].indexOf(v.toLowerCase()) === -1);
                                const normalizedLhs = normalizeFormulaLhs(lhs);
                                return {
                                    ...node,
                                    data: {
                                        ...node.data,
                                        expression: val,
                                        inputs: uniqueVars.length > 0 ? uniqueVars : ['a', 'b'],
                                        outputName: normalizedLhs || node.data.outputName
                                    }
                                };
                            }
                            return node;
                        }));
                    },
                    onBatchOverride: (val) => {
                        setNodes(nds => nds.map(node => {
                            if (node.id === newNodeId) {
                                return { ...node, data: { ...node.data, batchOverride: val } };
                            }
                            return node;
                        }));
                    },
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [setNodes]
    );

    const handleSave = () => {
        // Strip out the function references before saving
        const cleanNodes = nodes.map(n => ({ ...n, data: { ...n.data, onExpressionChange: undefined } }));
        onSave({ nodes: cleanNodes, edges });
    };

    const FORMULA_LIBRARY = [
        { label: "Add (+)", op: "add", inputs: ['a', 'b'] },
        { label: "Subtract (-)", op: "sub", inputs: ['a', 'b'] },
        { label: "Multiply (×)", op: "mul", inputs: ['a', 'b'] },
        { label: "Divide (÷)", op: "div", inputs: ['a', 'b'] },
        { label: "Custom Expr [f(x)]", op: "custom", inputs: ['a', 'b'] },
    ];

    const TEMPLATE_FORMULA_LIBRARY = templateFormulaLibrary;

    const LOGIC_LIBRARY = [
        { label: "IF / ELSE", op: "ifelse", type: "logicOp" },
        { label: "FOR LOOP", op: "for", type: "forLoop" },
        { label: "WHILE LOOP", op: "while", type: "whileLoop" },
        { label: "Input Variable", op: "input", type: "terminal" },
        { label: "Output Variable", op: "output", type: "terminal" }
    ];

    return (
        <div className="flex flex-col w-full h-full bg-[#0a101c]">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-3 border-b border-[#a78bfa] border-opacity-30 bg-[#0e1423]">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-[#a5b4fc] hover:text-white transition-colors flex items-center gap-2 font-bold text-[10px] uppercase tracking-wider">
                        EXIT_WORKBENCH
                    </button>
                    <div className="h-6 w-px bg-white bg-opacity-10" />
                    <div className="flex items-center gap-2">
                        <span className="text-[12px] font-mono font-bold text-blue-400">CORE //</span>
                        <div>
                            <h2 className="text-[#e2e8f0] font-bold leading-tight">{parentData.displayName || "Custom Component"}</h2>
                            <p className="text-[#6b7fa0] text-[10px] tracking-widest uppercase">Formula Skeleton Editor</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowLibrary((v) => !v)}
                        title={showLibrary ? "Hide Formula Library" : "Show Formula Library"}
                        style={{
                            height: '28px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: showLibrary ? 'rgba(167, 139, 250, 0.15)' : 'rgba(100, 160, 220, 0.08)',
                            border: `1px solid ${showLibrary ? 'rgba(167, 139, 250, 0.5)' : 'rgba(167, 139, 250, 0.3)'}`,
                            cursor: 'pointer',
                            transition: 'all 0.1s ease',
                            fontSize: '10px',
                            fontWeight: 900,
                            padding: '0 12px',
                            color: showLibrary ? '#c4b5fd' : '#a78bfa',
                            letterSpacing: '0.08em',
                        }}
                    >
                        LIBRARY
                    </button>
                    <button
                        onClick={handleSave}
                        className="bg-[#10b981] hover:bg-[#059669] text-[#ecfdf5] px-6 py-2 rounded-lg font-bold shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all"
                    >
                        SAVE_CORE
                    </button>
                </div>
            </header>

            <div className="flex flex-1 min-h-0 overflow-hidden relative">
                {/* ReactFlow Canvas */}
                <div className="flex-1 relative" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        nodeTypes={nodeTypes}
                        minZoom={0.72}
                        maxZoom={1.5}
                        fitViewOptions={{ minZoom: 0.82, maxZoom: 1.08, padding: 0.14 }}
                        fitView
                        className="skeleton-editor-theme"
                    >
                        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(167, 139, 250, 0.15)" />
                        <Controls />
                    </ReactFlow>
                </div>

                {/* Math Node Library Drawer */}
                <aside
                    className={`absolute top-0 right-0 h-full w-[260px] min-h-0 overflow-hidden border-l border-[#a78bfa] border-opacity-20 bg-[#060a10] p-4 flex flex-col transition-transform duration-200 ease-out z-30 ${showLibrary ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"}`}
                >
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        <p className="text-[#818cf8] text-[11px] font-bold uppercase tracking-widest">Formula Blocks</p>
                        <div className="mt-4 flex flex-col gap-2">
                            {FORMULA_LIBRARY.map((item) => (
                                <div
                                    key={item.op}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('application/reactflow-math', JSON.stringify(item));
                                        e.effectAllowed = 'move';
                                    }}
                                    className="bg-[#0e1423] border border-[#a78bfa] border-opacity-30 p-3 rounded-lg cursor-grab hover:bg-[#1e293b] hover:border-opacity-60 transition-colors shadow-lg"
                                >
                                    <span className="text-[#c4b5fd] font-semibold text-sm">{item.label}</span>
                                </div>
                            ))}
                        </div>

                        <p className="text-[#f472b6] text-[11px] font-bold uppercase tracking-widest mt-6">Logic / Flow</p>
                        <div className="mt-4 flex flex-col gap-2">
                            {LOGIC_LIBRARY.map((item) => (
                                <div
                                    key={item.op}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('application/reactflow-math', JSON.stringify(item));
                                        e.effectAllowed = 'move';
                                    }}
                                    className="bg-[#1f1b2c] border border-[#f472b6] border-opacity-30 p-3 rounded-lg cursor-grab hover:bg-[#2d2442] hover:border-opacity-60 transition-colors shadow-lg"
                                >
                                    <span className="text-[#fbcfe8] font-semibold text-sm">{item.label}</span>
                                </div>
                            ))}
                        </div>

                        {TEMPLATE_FORMULA_LIBRARY.length > 0 && (
                            <>
                                <p className="text-[#fbbf24] text-[11px] font-bold uppercase tracking-widest mt-6">Template Formulas</p>
                                <div className="mt-3 flex flex-col gap-2">
                                    {TEMPLATE_FORMULA_LIBRARY.map((item) => (
                                        <div
                                            key={item.id}
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData(
                                                    'application/reactflow-math',
                                                    JSON.stringify({
                                                        label: item.label,
                                                        expression: item.expression,
                                                        inputs: item.inputs,
                                                        outputName: item.output,
                                                        type: 'mathOp',
                                                        op: 'custom',
                                                    })
                                                );
                                                e.effectAllowed = 'move';
                                            }}
                                            className="bg-[#0b1222] border border-[#fbbf24] border-opacity-30 p-3 rounded-lg cursor-grab hover:bg-[#1d1a2b] hover:border-opacity-70 transition-colors shadow-lg"
                                        >
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[#fde68a] font-semibold text-sm">{item.label}</span>
                                                <span className="text-[10px] text-[#cbd5f5] whitespace-nowrap overflow-hidden text-ellipsis">{item.expression}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="mt-8 p-4 rounded-xl bg-[#4c1d95] bg-opacity-10 border border-[#4c1d95] border-opacity-30">
                            <p className="text-[#a5b4fc] text-xs font-semibold mb-2">💡 Pro Tip</p>
                            <p className="text-[#818cf8] text-[10px] leading-relaxed">
                                Drag the <strong className="text-white">Custom Expr</strong> block to write complex math manually.
                                Inputs automatically generate based on the variables (a, b, c) you type in the box!
                            </p>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

export default function SkeletonEditor(props) {
    return (
        <ReactFlowProvider>
            <SkeletonEditorInner {...props} />
        </ReactFlowProvider>
    );
}
