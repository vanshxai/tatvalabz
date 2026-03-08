import React, { useState, useEffect, useRef } from 'react';

// Promise-based helpers to trigger the dialogs from anywhere
export const customAlert = (title, message) => {
    return new Promise((resolve) => {
        window.dispatchEvent(new CustomEvent('showCustomDialog', {
            detail: { type: 'alert', title, message, resolve }
        }));
    });
};

export const customConfirm = (title, message) => {
    return new Promise((resolve) => {
        window.dispatchEvent(new CustomEvent('showCustomDialog', {
            detail: { type: 'confirm', title, message, resolve }
        }));
    });
};

export const customPrompt = (title, message, defaultValue = '') => {
    return new Promise((resolve) => {
        window.dispatchEvent(new CustomEvent('showCustomDialog', {
            detail: { type: 'prompt', title, message, defaultValue, resolve }
        }));
    });
};

const CustomDialog = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [config, setConfig] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef(null);
    const closeTimeoutRef = useRef(null);
    const dialogIdRef = useRef(0);

    useEffect(() => {
        const handler = (e) => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
            dialogIdRef.current += 1;
            setConfig({ ...e.detail, __dialogId: dialogIdRef.current });
            setInputValue(e.detail.defaultValue || '');
            setIsOpen(true);
        };
        window.addEventListener('showCustomDialog', handler);
        return () => {
            window.removeEventListener('showCustomDialog', handler);
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
        };
    }, []);

    // Auto-focus input for prompts
    useEffect(() => {
        if (isOpen && config?.type === 'prompt' && inputRef.current) {
            setTimeout(() => inputRef.current.focus(), 50);
        }
    }, [isOpen, config]);

    const handleClose = (result) => {
        const activeConfig = config;
        setIsOpen(false);
        if (activeConfig?.resolve) {
            activeConfig.resolve(result);
        }
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
        }
        const activeDialogId = activeConfig?.__dialogId;
        closeTimeoutRef.current = setTimeout(() => {
            setConfig((currentConfig) => (
                currentConfig?.__dialogId === activeDialogId ? null : currentConfig
            ));
            closeTimeoutRef.current = null;
        }, 200); // Wait for fade out
    };

    const handleConfirm = () => {
        if (!config) return;
        if (config.type === 'prompt') {
            handleClose(inputValue);
        } else {
            handleClose(true);
        }
    };

    const handleCancel = () => {
        if (!config) return;
        if (config.type === 'prompt') {
            handleClose(null);
        } else {
            handleClose(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') handleCancel();
    };

    if (!config) return null;

    return (
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-150 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{
                background: 'rgba(5, 5, 5, 0.8)',
            }}
        >
            <div
                className={`w-full max-w-sm p-5 shadow-2xl transition-all duration-150 ${isOpen ? 'scale-100' : 'scale-[0.98]'}`}
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-technical)',
                    borderRadius: '4px',
                    boxShadow: 'var(--shadow-node)',
                }}
            >
                {/* Header Icon */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm border"
                        style={{
                            background: config?.type === 'alert' ? 'var(--primary-dim)' :
                                config?.type === 'confirm' ? 'rgba(251, 191, 36, 0.05)' :
                                    'rgba(167, 139, 250, 0.05)',
                            borderColor: config?.type === 'alert' ? 'var(--primary-glow)' :
                                config?.type === 'confirm' ? 'rgba(251, 191, 36, 0.2)' :
                                    'rgba(167, 139, 250, 0.2)',
                            color: config?.type === 'alert' ? 'var(--primary)' :
                                config?.type === 'confirm' ? '#fbbf24' :
                                    '#a855f7',
                        }}
                    >
                        {config?.type === 'alert' ? 'INFO' : config?.type === 'confirm' ? 'WARN' : 'EDIT'}
                    </div>
                    <h2 className="text-sm font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                        {config?.title || 'System Message'}
                    </h2>
                </div>

                {/* Message */}
                {config?.message && (
                    <p className="text-sm text-gray-400 mb-5 whitespace-pre-wrap leading-relaxed">
                        {config.message}
                    </p>
                )}

                {/* Input for Prompt */}
                {config?.type === 'prompt' && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-black/40 border border-white/10 rounded-sm px-3 py-2 text-gray-100 text-xs focus:outline-none focus:border-blue-500/50 transition-all mb-4 font-mono"
                    />
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 mt-2">
                    {config?.type !== 'alert' && (
                        <button
                            onClick={handleCancel}
                            className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase transition-all"
                            style={{
                                color: 'var(--text-muted)',
                                background: 'transparent',
                                border: '1px solid var(--border-technical)',
                            }}
                        >
                            Cancel
                        </button>
                    )}

                    <button
                        onClick={handleConfirm}
                        className="px-4 py-1.5 rounded-sm text-[10px] font-bold uppercase transition-all"
                        style={{
                            color: '#fff',
                            background: config?.type === 'alert' ? 'var(--primary)' :
                                config?.type === 'confirm' ? 'var(--status-err)' :
                                    'var(--primary)',
                            border: 'none',
                        }}
                    >
                        {config?.type === 'alert' ? 'Acknowledge' : config?.type === 'confirm' ? 'Confirm' : 'Save_Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomDialog;
