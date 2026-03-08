import React, { useState } from 'react';

/**
 * ScenarioManager.jsx — Simulation Orchestrator Panel
 * Handles creating, sequencing, and configuring specific simulation runs.
 */
export default function ScenarioManager({
    scenarios,
    setScenarios,
    onClose = () => { },
    activeScenarioId,
    setActiveScenarioId,
    embedded = false,
    onBuild = () => { },
    onRun = () => { },
    onRunAll = () => { },
    onOpenResults = () => { },
    onSaveExperiment = () => { },
    isRunning = false,
    hasCompiledGraph = false,
    lastRunRecord = null,
}) {
    const [newScenarioName, setNewScenarioName] = useState('');

    const handleAddScenario = (e) => {
        e.preventDefault();
        if (!newScenarioName.trim()) return;

        const newScenario = {
            id: `scenario_${Date.now()}`,
            name: newScenarioName.trim(),
            sweeps: {}, // Isolated sweep configs for this scenario
            isActive: true
        };

        setScenarios(prev => {
            const up = [...prev, newScenario];
            // Auto-select if first
            if (up.length === 1 && setActiveScenarioId) setActiveScenarioId(newScenario.id);
            return up;
        });
        setNewScenarioName('');
    };

    const handleDeleteScenario = (id) => {
        setScenarios(prev => {
            const up = prev.filter(s => s.id !== id);
            if (activeScenarioId === id && setActiveScenarioId) {
                setActiveScenarioId(up.length > 0 ? up[0].id : null);
            }
            return up;
        });
    };

    const handleToggleScenarioActive = (id) => {
        setScenarios(prev => prev.map((s) => (
            s.id === id ? { ...s, isActive: !s.isActive } : s
        )));
    };

    const handleDuplicateScenario = (id) => {
        setScenarios(prev => {
            const src = prev.find((s) => s.id === id);
            if (!src) return prev;
            const copy = {
                ...src,
                id: `scenario_${Date.now()}`,
                name: `${src.name} Copy`,
                sweeps: JSON.parse(JSON.stringify(src.sweeps || {})),
            };
            return [copy, ...prev];
        });
    };

    const countOverrides = (scenario) =>
        Object.values(scenario?.sweeps || {}).reduce((sum, nodeCfg) => {
            const vars = Object.keys(nodeCfg || {}).length;
            return sum + vars;
        }, 0);

    const getScenarioStatus = (scenario) => {
        if (isRunning && scenario?.isActive) return { label: "RUNNING", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)" };
        if (!scenario?.isActive) return { label: "INACTIVE", color: "#64748b", bg: "rgba(100,116,139,0.10)", border: "rgba(100,116,139,0.30)" };
        if (!hasCompiledGraph) return { label: "DRAFT", color: "#cbd5e1", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.26)" };
        if (lastRunRecord) return { label: "COMPLETED", color: "#34d399", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)" };
        return { label: "READY", color: "#60a5fa", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)" };
    };

    const containerStyle = embedded
        ? {
            position: 'relative',
            width: '100%',
            height: '100%',
            background: 'transparent',
            border: 'none',
            borderRadius: '0',
            boxShadow: 'none',
            zIndex: 'auto',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }
        : {
            position: 'absolute',
            top: 60,
            right: 16,
            bottom: 16,
            width: '320px',
            background: 'var(--bg-base)',
            border: '1px solid var(--border-technical)',
            borderRadius: '4px',
            boxShadow: 'var(--shadow-node)',
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        };

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-technical)',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-black/40 border border-white/10" style={{ color: 'var(--primary)' }}>
                        ORCH
                    </span>
                    <h2 style={{
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        fontWeight: '700',
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: '0.1em',
                        fontFamily: "var(--font-heading)",
                    }}>Orchestrator</h2>
                </div>
                <button
                    onClick={onClose}
                    className="nodrag"
                    style={{
                        background: 'rgba(0,0,0,0.2)', border: 'none', color: '#ddd6fe',
                        width: '28px', height: '28px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyItems: 'center',
                        cursor: 'pointer', fontSize: '14px', transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.4)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.2)'}
                >
                    ✕
                </button>
            </div>

            {/* List & Controls */}
            <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar">
                <div style={{
                    background: 'rgba(15, 23, 38, 0.72)',
                    border: '1px solid rgba(100, 160, 220, 0.15)',
                    borderRadius: '2px',
                    padding: '8px',
                    marginBottom: '12px',
                }}>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={onBuild}
                            disabled={isRunning}
                            style={{
                                background: 'var(--primary)',
                                color: '#fff',
                                border: '1px solid var(--primary-glow)',
                                borderRadius: '2px',
                                padding: '4px 8px',
                                fontSize: '9px',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                cursor: isRunning ? 'wait' : 'pointer',
                            }}
                        >
                            {isRunning ? 'BUSY' : 'BUILD'}
                        </button>
                        <button
                            onClick={onRun}
                            disabled={!hasCompiledGraph || isRunning}
                            style={{
                                background: (!hasCompiledGraph || isRunning) ? 'rgba(100,160,220,0.06)' : 'rgba(16,185,129,0.14)',
                                color: (!hasCompiledGraph || isRunning) ? '#64748b' : '#6ee7b7',
                                border: `1px solid ${(!hasCompiledGraph || isRunning) ? 'rgba(100,160,220,0.18)' : 'rgba(16,185,129,0.35)'}`,
                                borderRadius: '2px',
                                padding: '4px 8px',
                                fontSize: '9px',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                cursor: (!hasCompiledGraph || isRunning) ? 'not-allowed' : 'pointer',
                            }}
                        >
                            RUN
                        </button>
                        <button
                            onClick={onRunAll}
                            disabled={!hasCompiledGraph || isRunning}
                            style={{
                                background: (!hasCompiledGraph || isRunning) ? 'rgba(100,160,220,0.06)' : 'rgba(14,165,233,0.12)',
                                color: (!hasCompiledGraph || isRunning) ? '#64748b' : '#7dd3fc',
                                border: `1px solid ${(!hasCompiledGraph || isRunning) ? 'rgba(100,160,220,0.18)' : 'rgba(14,165,233,0.30)'}`,
                                borderRadius: '2px',
                                padding: '4px 8px',
                                fontSize: '9px',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                cursor: (!hasCompiledGraph || isRunning) ? 'not-allowed' : 'pointer',
                            }}
                        >
                            RUN ALL
                        </button>
                        <button
                            onClick={onOpenResults}
                            style={{
                                background: 'rgba(100,160,220,0.09)',
                                color: '#c5d5e8',
                                border: '1px solid rgba(100,160,220,0.25)',
                                borderRadius: '2px',
                                padding: '4px 8px',
                                fontSize: '9px',
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                                cursor: 'pointer',
                            }}
                        >
                            COMPARE
                        </button>
                        <button
                            onClick={onSaveExperiment}
                            style={{
                                background: 'rgba(167,139,250,0.12)',
                                color: '#c4b5fd',
                                border: '1px solid rgba(167,139,250,0.30)',
                                borderRadius: '2px',
                                padding: '4px 8px',
                                fontSize: '9px',
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                                cursor: 'pointer',
                            }}
                        >
                            SAVE EXPERIMENT
                        </button>
                    </div>
                    <p style={{ color: '#7e93ad', fontSize: '9px', margin: '6px 0 0 0', fontFamily: "var(--font-mono)" }}>
                        Build graph, configure experiment variable ranges in Inspector, then run active scenarios.
                    </p>
                </div>

                {/* Info Box */}
                <div style={{
                    background: 'var(--primary-dim)',
                    border: '1px solid var(--primary-glow)',
                    borderRadius: '2px',
                    padding: '8px 10px',
                    marginBottom: '16px'
                }}>
                    <p style={{ color: 'var(--primary)', fontSize: '9px', margin: 0, lineHeight: '1.6', fontFamily: "var(--font-mono)" }}>
                        WORKFLOW:<br />
                        1. CREATE a scenario below<br />
                        2. SELECT it (click to activate)<br />
                        3. DOUBLE-CLICK any node on canvas<br />
                        4. CONFIGURE experiment variable ranges in Inspector<br />
                        5. Use RUN / RUN ALL for execution
                    </p>
                </div>

                {/* Scenarios List */}
                <div className="space-y-3 mb-6">
                    {scenarios.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7fa0', fontSize: '12px' }}>
                            <p style={{ fontWeight: 600 }}>No scenarios defined.</p>
                            <p style={{ fontSize: '10px', marginTop: '4px', color: '#4a5568' }}>
                                Create a scenario below, then double-click<br />
                                any node to configure experiment variable ranges.
                            </p>
                        </div>
                    ) : (
                        scenarios.map((scenario, index) => {
                            const isSelected = activeScenarioId === scenario.id;
                            const status = getScenarioStatus(scenario);
                            const overrideCount = countOverrides(scenario);
                            return (
                                <div key={scenario.id}
                                    onClick={() => setActiveScenarioId && setActiveScenarioId(scenario.id)}
                                    style={{
                                        background: isSelected ? 'var(--primary-dim)' : 'rgba(255,255,255,0.01)',
                                        border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-technical)'}`,
                                        borderRadius: '2px',
                                        padding: '8px 10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        cursor: 'pointer',
                                        transition: 'all 0.1s'
                                    }}>
                                    <div style={{
                                        width: '18px', height: '18px', borderRadius: '1px',
                                        background: isSelected ? 'var(--primary)' : 'var(--bg-elevated)',
                                        color: isSelected ? '#fff' : 'var(--text-muted)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '9px', fontWeight: 'bold'
                                    }}>
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, margin: '0 0 1px 0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                            {scenario.name}
                                        </h3>
                                        <p style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)', fontSize: '8px', margin: 0, fontFamily: "var(--font-mono)" }}>
                                            {overrideCount} variables • {Object.keys(scenario.sweeps || {}).length} nodes
                                        </p>
                                    </div>
                                    <span style={{
                                        fontSize: '7px',
                                        color: status.color,
                                        background: status.bg,
                                        padding: '1px 5px',
                                        borderRadius: '1px',
                                        border: `1px solid ${status.border}`,
                                        fontWeight: 'bold',
                                    }}>{status.label}</span>
                                    <button onClick={(e) => { e.stopPropagation(); handleToggleScenarioActive(scenario.id); }}
                                        style={{
                                            background: 'transparent', border: '1px solid rgba(100,160,220,0.25)', color: '#93c5fd',
                                            cursor: 'pointer', padding: '1px 4px', fontSize: '7px', fontWeight: 'bold', borderRadius: '1px'
                                        }}
                                    >
                                        {scenario.isActive ? 'ON' : 'OFF'}
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDuplicateScenario(scenario.id); }}
                                        style={{
                                            background: 'transparent', border: '1px solid rgba(100,160,220,0.25)', color: '#c5d5e8',
                                            cursor: 'pointer', padding: '1px 4px', fontSize: '7px', fontWeight: 'bold', borderRadius: '1px'
                                        }}
                                    >
                                        CPY
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteScenario(scenario.id); }}
                                        style={{
                                            background: 'transparent', border: 'none', color: 'var(--status-err)',
                                            cursor: 'pointer', padding: '2px', opacity: 0.5, fontSize: '8px', fontWeight: 'bold'
                                        }}
                                    >
                                        DEL
                                    </button>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Add New Form */}
                <form onSubmit={handleAddScenario} className="mt-auto" style={{
                    background: 'rgba(0,0,0,0.3)',
                    padding: '10px',
                    borderRadius: '2px',
                    border: '1px solid var(--border-technical)'
                }}>
                    <p style={{ fontSize: '8px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 'bold' }}>NEW_EXPERIMENT_SCENARIO</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newScenarioName}
                            onChange={(e) => setNewScenarioName(e.target.value)}
                            placeholder="NAME_SCAN"
                            style={{
                                flex: 1,
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-technical)',
                                borderRadius: '1px',
                                padding: '6px 10px',
                                color: 'var(--text-primary)',
                                fontSize: '11px',
                                outline: 'none',
                                fontFamily: "var(--font-mono)"
                            }}
                        />
                        <button type="submit" style={{
                            background: 'var(--primary)', cursor: 'pointer',
                            color: 'white', border: 'none', borderRadius: '1px',
                            padding: '0 12px', fontSize: '10px', fontWeight: 'bold',
                            textTransform: 'uppercase'
                        }}>
                            ADD
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
