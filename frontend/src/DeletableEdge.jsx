/**
 * DeletableEdge.jsx — Industrial Glowing Wire
 * A custom React Flow edge with a glassmorphic delete button
 * that glows on hover for a clean, high-tech look.
 */

import {
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,
    useReactFlow,
} from "@xyflow/react";

export default function DeletableEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    animated,
}) {
    const { setEdges } = useReactFlow();

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const onDelete = (e) => {
        e.stopPropagation();
        setEdges((eds) => eds.filter((edge) => edge.id !== id));
    };

    return (
        <>
            <BaseEdge
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    strokeWidth: 1.5,
                    stroke: "var(--text-muted)",
                    opacity: 0.4,
                    ...style,
                }}
            />
            {/* Technical Data Flow Animation (Bead) */}
            <circle
                r="2"
                fill="var(--primary)"
                style={{
                    offsetPath: `path('${edgePath}')`,
                    animation: "data-bead 3s linear infinite",
                }}
            />
            <EdgeLabelRenderer>
                <div
                    className="edge-delete-btn"
                    style={{
                        position: "absolute",
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: "all",
                    }}
                >
                    <button
                        onClick={onDelete}
                        title="Delete connection"
                        style={{
                            width: "16px", height: "16px", borderRadius: "2px",
                            background: "#000", border: "1px solid var(--status-err)",
                            color: "var(--status-err)", fontSize: "10px", fontWeight: "bold",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                    >
                        ×
                    </button>
                </div>
            </EdgeLabelRenderer>
        </>
    );
}
