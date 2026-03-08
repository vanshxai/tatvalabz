/**
 * NavBar.jsx — Persistent Collapsible System Rail
 */

import { useState, useEffect, useRef } from "react";

const navItems = [
    {
        id: "workspace",
        label: "Workspace",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
        ),
    },
    {
        id: "saved",
        label: "Saved Projects",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
        ),
    },
    {
        id: "saved_calculations",
        label: "Saved Calculations",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19h16" />
                <path d="M6 16V5a2 2 0 0 1 2-2h6l4 4v9" />
                <path d="M14 3v5h5" />
                <path d="M9 12h6" />
                <path d="M9 9h2" />
            </svg>
        ),
    },
    {
        id: "templates",
        label: "Templates",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
        ),
    },
    { id: "divider-1", type: "divider" },
    {
        id: "settings",
        label: "Settings",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
        ),
    },
    {
        id: "profile",
        label: "Profile",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        ),
    },
    { id: "divider-2", type: "divider" },
    {
        id: "premium",
        label: "Premium",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
        ),
        premium: true,
    },
    {
        id: "help",
        label: "Help & Docs",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
        ),
    },
    { id: "div3", type: "divider" },
    {
        id: "ceo",
        label: "Talk to the CEO",
        href: "https://x.com/electro_vansh",
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        ),
    },
];

export default function NavBar({ activeSection, onSectionChange }) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (open && menuRef.current && !menuRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [open]);

    const handleMouseEnter = () => setOpen(true);
    const handleMouseLeave = () => setOpen(false);

    return (
        <div
            ref={menuRef}
            className="floating-nav-container"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
                position: "fixed",
                top: "66px",
                bottom: "14px",
                left: "12px",
                width: open ? "230px" : "56px",
                zIndex: 1000,
                transition: "width 0.2s ease",
                background: "var(--bg-base)",
                border: "1px solid var(--border-technical)",
                borderRadius: "12px",
                boxShadow: "var(--shadow-node)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
            }}
        >
            <button
                onClick={() => setOpen((v) => !v)}
                className="floating-nav-toggle"
                title={open ? "Close menu" : "Open menu"}
                style={{
                    width: "100%",
                    height: "34px",
                    borderRadius: "0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: open ? "space-between" : "center",
                    background: open ? "var(--primary-dim)" : "var(--bg-surface)",
                    border: "none",
                    borderBottom: "1px solid var(--border-technical)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    color: open ? "var(--primary)" : "var(--text-secondary)",
                    padding: open ? "0 10px" : "0",
                    flexShrink: 0,
                }}
            >
                <span style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.12em", color: open ? "var(--primary)" : "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
                    {open ? "SYSTEM MENU" : "SYS"}
                </span>
                {open && <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: 700 }}>CLOSE</span>}
            </button>

            {open ? (
                <div
                    className="floating-nav-menu"
                    style={{
                        padding: "8px",
                        overflowY: "auto",
                        flex: 1,
                        animation: "navMenuSlideIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                >
                    {navItems.map((item) => {
                        if (item.type === "divider") {
                            return (
                                <div
                                    key={item.id}
                                    style={{
                                        height: "1px",
                                        margin: "6px 8px",
                                        background: "linear-gradient(90deg, transparent, var(--border-technical), transparent)",
                                    }}
                                />
                            );
                        }

                        const isActive = activeSection === item.id;

                        return (
                            <button
                                key={item.id}
                                disabled={item.disabled && !isActive}
                                onClick={() => {
                                    if (item.href) {
                                        window.open(item.href, "_blank", "noopener,noreferrer");
                                    } else {
                                        onSectionChange(item.id);
                                    }
                                    setOpen(false);
                                }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    width: "100%",
                                    padding: "10px 14px",
                                    borderRadius: "10px",
                                    border: "none",
                                    cursor: item.disabled && !isActive ? "not-allowed" : "pointer",
                                    opacity: item.disabled && !isActive ? 0.3 : 1,
                                    background: isActive ? "var(--primary-dim)" : "transparent",
                                    transition: "all 0.15s ease",
                                    textAlign: "left",
                                    position: "relative",
                                }}
                            >
                                {isActive && (
                                    <span style={{
                                        position: "absolute",
                                        left: "4px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        width: "2px",
                                        height: "14px",
                                        background: "var(--primary)",
                                        boxShadow: "0 0 8px var(--primary-glow)",
                                    }} />
                                )}

                                <span style={{
                                    flexShrink: 0,
                                    fontSize: "9px",
                                    fontWeight: 900,
                                    color: isActive ? "var(--primary)" : item.premium ? "var(--status-warn)" : "var(--text-muted)",
                                    transition: "color 0.15s",
                                    display: "flex",
                                    fontFamily: "'JetBrains Mono', monospace",
                                    padding: "2px 6px",
                                    borderRadius: "2px",
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.05)",
                                }}>
                                    {item.id.substring(0, 3).toUpperCase()}
                                </span>

                                <span style={{
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    color: isActive ? "var(--text-primary)" : item.premium ? "var(--status-warn)" : "var(--text-secondary)",
                                    whiteSpace: "nowrap",
                                    fontFamily: "var(--font-body)",
                                }}>
                                    {item.label.toUpperCase()}
                                </span>
                            </button>
                        );
                    })}

                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 14px 6px",
                        borderTop: "1px solid var(--border-technical)",
                        marginTop: "4px",
                    }}>
                        <div style={{
                            width: 14, height: 14, border: "1px solid var(--primary)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "8px", fontWeight: "bold", color: "var(--primary)",
                            borderRadius: "2px",
                        }}>TL</div>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{
                                fontSize: "9px", fontWeight: 700, color: "var(--text-muted)",
                                letterSpacing: "0.1em", textTransform: "uppercase",
                                fontFamily: "var(--font-mono)",
                            }}>TatvaLabz</span>
                            <span style={{ fontSize: "8px", color: "var(--text-muted)", opacity: 0.5 }}>OS_CORE_V1.0</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "8px",
                        paddingTop: "10px",
                        overflowY: "auto",
                    }}
                >
                    {navItems.filter((item) => !item.type).map((item) => {
                        const isActive = activeSection === item.id;
                        return (
                            <button
                                key={item.id}
                                title={item.label}
                                disabled={item.disabled && !isActive}
                                onClick={() => {
                                    if (item.href) {
                                        window.open(item.href, "_blank", "noopener,noreferrer");
                                    } else {
                                        onSectionChange(item.id);
                                    }
                                }}
                                style={{
                                    width: "34px",
                                    height: "34px",
                                    borderRadius: "8px",
                                    border: "none",
                                    background: isActive ? "rgba(34, 211, 238, 0.1)" : "transparent",
                                    color: isActive ? "var(--primary)" : "var(--text-muted)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: item.disabled && !isActive ? "not-allowed" : "pointer",
                                    opacity: item.disabled && !isActive ? 0.3 : 1,
                                }}
                            >
                                {item.icon}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
