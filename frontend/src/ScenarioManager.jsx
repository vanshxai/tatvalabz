import React, { useState } from 'react';

/**
 * ScenarioManager.jsx — Simulation Orchestrator Panel
 * Handles creating, sequencing, and configuring specific simulation runs.
 */
export default function ScenarioManager({ scenarios, setScenarios, onClose, activeScenarioId, setActiveScenarioId }) {
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

    return (
        <div style={{
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
        }}>
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
                        letterSpacing: '0.1em'
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

                {/* Info Box */}
                <div style={{
                    background: 'var(--primary-dim)',
                    border: '1px solid var(--primary-glow)',
                    borderRadius: '2px',
                    padding: '8px 10px',
                    marginBottom: '16px'
                }}>
                    <p style={{ color: 'var(--primary)', fontSize: '9px', margin: 0, lineHeight: '1.6', fontFamily: "'JetBrains Mono', monospace" }}>
                        WORKFLOW:<br />
                        1. CREATE a scenario below<br />
                        2. SELECT it (click to activate)<br />
                        3. DOUBLE-CLICK any node on canvas<br />
                        4. CONFIGURE sweep ranges in Inspector<br />
                        5. Click EXECUTE to run all scenarios
                    </p>
                </div>

                {/* Scenarios List */}
                <div className="space-y-3 mb-6">
                    {scenarios.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7fa0', fontSize: '12px' }}>
                            <p style={{ fontWeight: 600 }}>No scenarios defined.</p>
                            <p style={{ fontSize: '10px', marginTop: '4px', color: '#4a5568' }}>
                                Create a scenario below, then double-click<br />
                                any node to configure its sweep parameters.
                            </p>
                        </div>
                    ) : (
                        scenarios.map((scenario, index) => {
                            const isSelected = activeScenarioId === scenario.id;
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
                                        <p style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)', fontSize: '8px', margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                                            {Object.keys(scenario.sweeps).length}_OVERRIDES
                                        </p>
                                    </div>
                                    {isSelected && (
                                        <span style={{ fontSize: '7px', color: 'var(--primary)', background: 'var(--primary-dim)', padding: '1px 4px', borderRadius: '1px', border: '1px solid var(--primary-glow)', fontWeight: 'bold' }}>ACTIVE</span>
                                    )}
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
                    <p style={{ fontSize: '8px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 'bold' }}>NEW_SCENARIO</p>
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
                                fontFamily: "'JetBrains Mono', monospace"
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
