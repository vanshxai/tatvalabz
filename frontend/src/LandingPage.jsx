/**
 * LandingPage.jsx — Glassmorphic Industrial Landing
 * A premium, high-impact landing page with frosted glass cards,
 * industrial typography, and engineered visual effects.
 */

import React, { useState, useEffect } from "react";

export default function LandingPage({ onStart }) {
    const [text, setText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [loopNum, setLoopNum] = useState(0);
    const [typingSpeed, setTypingSpeed] = useState(70);

    const phrases = [
        "digital twins.",
        "engineering systems.",
        "mathematical models.",
        "complex simulations."
    ];

    useEffect(() => {
        const handleType = () => {
            const i = loopNum % phrases.length;
            const fullText = phrases[i];

            if (isDeleting) {
                setText(prev => fullText.substring(0, prev.length - 1));
                setTypingSpeed(50);
            } else {
                setText(prev => fullText.substring(0, prev.length + 1));
                setTypingSpeed(50);
            }

            if (!isDeleting && text === fullText) {
                setTypingSpeed(800);
                setIsDeleting(true);
            } else if (isDeleting && text === "") {
                setIsDeleting(false);
                setLoopNum(prev => prev + 1);
                setTypingSpeed(200);
            }
        };

        const timer = setTimeout(handleType, typingSpeed);
        return () => clearTimeout(timer);
    }, [text, isDeleting, loopNum, typingSpeed]);

    return (
        <div className="relative min-h-screen text-white selection:bg-cyan-500/30 overflow-x-hidden"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

            {/* Inline Styles */}
            <style>
                {`
                    @keyframes blink {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                    }
                    .cursor {
                        display: inline-block;
                        width: 3px;
                        height: 0.75em;
                        background-color: #22d3ee;
                        margin-left: 6px;
                        animation: blink 1s step-end infinite;
                        vertical-align: middle;
                        box-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
                        border-radius: 1px;
                    }
                    @keyframes float-up {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-8px); }
                    }
                    .float-anim {
                        animation: float-up 6s ease-in-out infinite;
                    }
                `}
            </style>

            {/* Background Video */}
            <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
                <video autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ opacity: 0.75 }}>
                    <source src="/tatvalabz_bg.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-0" style={{
                    background: 'linear-gradient(180deg, rgba(6,10,16,0.3) 0%, rgba(6,10,16,0.7) 100%)',
                }} />
            </div>

            {/* ── Navigation ── */}
            <nav className="relative z-20 flex items-center justify-between px-8 py-5 max-w-7xl mx-auto mt-4"
                style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '24px',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                }}
            >
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-blue-600/10 border border-blue-500/30 text-blue-500 backdrop-blur-md">CORE</span>
                    <div className="flex flex-col">
                        <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white m-0">
                            Tatva<span className="text-blue-500">Labz</span>
                        </h1>
                        <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: '#6b7fa0', fontFamily: "'JetBrains Mono', monospace" }}>
                            inspired by conciousness
                        </span>
                    </div>
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center justify-center">
                    <span className="text-lg uppercase tracking-[0.4em] font-black"
                        style={{ color: 'rgba(255, 255, 255, 0.85)', fontFamily: "'JetBrains Mono', monospace" }}>
                        IT'S NOT AI
                    </span>
                </div>

                <button onClick={onStart}
                    style={{
                        padding: '10px 28px',
                        borderRadius: '16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        backdropFilter: 'blur(4px)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.3)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; }}
                >
                    Sign In
                </button>
            </nav>

            {/* ── Hero Section ── */}
            <section className="relative z-10 pt-28 pb-36 px-6 max-w-5xl mx-auto text-center">
                <div className="relative">
                    {/* Beta badge */}
                    <div className="inline-flex items-center gap-2 px-5 py-2 mb-10"
                        style={{
                            borderRadius: '30px',
                            background: 'rgba(34, 211, 238, 0.1)',
                            border: '1px solid rgba(34, 211, 238, 0.25)',
                            color: '#22d3ee',
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            backdropFilter: 'blur(8px)',
                        }}>
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                style={{ background: '#22d3ee' }} />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5"
                                style={{ background: '#22d3ee', boxShadow: '0 0 8px rgba(34, 211, 238, 0.5)' }} />
                        </span>
                        V1.0 · PUBLIC BETA
                    </div>

                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-5 leading-[1.05]">
                        VISUALLY DESIGN <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-amber-400">
                            {text}
                        </span>
                        <span className="cursor"></span>
                    </h1>

                    <p className="text-sm md:text-base max-w-xl mx-auto mb-10 leading-relaxed font-medium tracking-tight"
                        style={{ color: '#cbd5e1' }}>
                        A powerful ENGINEERING INTELLIGENCE <br />
                        with local math processing for zero server latency.
                    </p>

                    <button onClick={onStart}
                        className="group active:scale-95 transition-all outline-none"
                        style={{
                            padding: '18px 48px',
                            borderRadius: '20px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(34, 211, 238, 0.2)',
                            color: '#fff',
                            fontSize: '15px',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.15em',
                            cursor: 'pointer',
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 8px 32px rgba(34, 211, 238, 0.1), inset 0 1px 0 rgba(255,255,255,0.1)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
                            e.currentTarget.style.boxShadow = '0 8px 40px rgba(34, 211, 238, 0.2), inset 0 1px 0 rgba(255,255,255,0.15)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                            e.currentTarget.style.boxShadow = '0 8px 32px rgba(34, 211, 238, 0.1), inset 0 1px 0 rgba(255,255,255,0.1)';
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.2)';
                        }}
                    >
                        Launch Workspace <span className="inline-block group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                </div>
            </section>

            {/* ── The Engineering Gap ── */}
            <section className="relative z-10 py-28 px-6 max-w-6xl mx-auto">
                <div className="text-center mb-20">
                    <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-4">THE ENGINEERING GAP</h2>
                    <p className="text-sm md:text-base max-w-2xl mx-auto font-medium" style={{ color: '#cbd5e1' }}>
                        Why we built TatvaLabz to replace the heavy, boring legacy paradigms.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
                    {/* Legacy Block */}
                    <div className="p-10 relative group overflow-hidden"
                        style={{
                            borderRadius: '24px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                        }}>
                        <div className="absolute top-0 right-0 p-8 text-[10px] font-bold opacity-20 tracking-widest text-red-500">LEGACY_PARADIGM</div>
                        <h4 className="text-xs font-bold uppercase tracking-[0.25em] mb-8"
                            style={{ color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                            Legacy Systems (MATLAB / Ansys)
                        </h4>
                        <ul className="space-y-7">
                            {[
                                { title: "Heavy Desktop Bloat", desc: "Gigabytes of installation, slow startup times, and hardware-locked licenses." },
                                { title: "Boring Manual Effort", desc: "Steep learning curves, complex CLI-heavy paradigms, and \"academic\" interfaces." },
                                { title: "Locked Ecosystems", desc: "Proprietary formats that don't talk to modern web-based industrial stacks." },
                            ].map((item) => (
                                <li key={item.title} className="flex items-start gap-4">
                                    <span className="text-lg mt-0.5" style={{ color: '#ef4444', filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.3))' }}>✕</span>
                                    <div>
                                        <p className="font-black text-xl mb-1 tracking-tight" style={{ color: '#e2e8f0' }}>{item.title}</p>
                                        <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>{item.desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* TatvaLabz Block */}
                    <div className="p-10 relative group overflow-hidden"
                        style={{
                            borderRadius: '24px',
                            background: 'rgba(34, 211, 238, 0.03)',
                            border: '1px solid rgba(22, 189, 216, 0.4)',
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 8px 48px rgba(34, 211, 238, 0.15)',
                        }}>
                        <div className="absolute top-0 right-0 p-8 text-[10px] font-bold opacity-40 tracking-widest text-blue-500">CARBON_INTELLIGENCE</div>
                        <h4 className="text-xs font-bold uppercase tracking-[0.25em] mb-8"
                            style={{ color: '#22d3ee', fontFamily: "'JetBrains Mono', monospace" }}>
                            TatvaLabz Engineering Intel
                        </h4>
                        <ul className="space-y-7">
                            {[
                                { title: "Zero Latency. Zero Install.", desc: "Load instantly in your browser. Math still happens locally on your hardware for privacy and speed." },
                                { title: "Delightful Visual Design", desc: "It's not just a tool; it's an experience. Design DAGs visually with high-frequency feedback loops." },
                                { title: "Modern Industrial Stack", desc: "Built for the future of edge computing. Export code, integrate APIs, and scale without friction." },
                            ].map((item) => (
                                <li key={item.title} className="flex items-start gap-4">
                                    <span className="text-lg mt-0.5" style={{ color: '#22d3ee', filter: 'drop-shadow(0 0 4px rgba(34, 211, 238, 0.4))' }}>✓</span>
                                    <div>
                                        <p className="font-black text-xl mb-1 tracking-tight" style={{ color: '#e2e8f0' }}>{item.title}</p>
                                        <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>{item.desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className="absolute -bottom-24 -right-24 w-64 h-64 rounded-full"
                            style={{ background: 'rgba(167, 139, 250, 0.06)', filter: 'blur(80px)' }} />
                    </div>
                </div>
            </section>

            {/* ── Beyond Simple Math ── */}
            <section className="relative z-10 py-28 px-6 max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-black tracking-tight mb-2">BEYOND SIMPLE MATH</h2>
                    <p className="font-medium" style={{ color: '#94a3b8' }}>Specialized modules for mission-critical industrial simulations.</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    {[
                        { title: "Thermal Dynamics", icon: "🌡️", desc: "Heat transfer & entropy", glowColor: 'rgba(244, 114, 182, 0.15)' },
                        { title: "Control Systems", icon: "⚙️", desc: "PID & State-space tuning", glowColor: 'rgba(34, 211, 238, 0.15)' },
                        { title: "Structural Specs", icon: "🏗️", desc: "Stress-strain analysis", glowColor: 'rgba(167, 139, 250, 0.15)' },
                        { title: "Fluid Mechanics", icon: "🧪", desc: "Flow & pressure modeling", glowColor: 'rgba(251, 191, 36, 0.15)' },
                    ].map((cap, i) => (
                        <div key={i} className="p-6 group overflow-hidden relative transition-all duration-300 border border-white/5 hover:border-white/20"
                            style={{
                                borderRadius: '16px',
                                background: 'rgba(255, 255, 255, 0.02)',
                                backdropFilter: 'blur(8px)',
                                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
                                animationDelay: `${i * 0.1}s`,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(100, 160, 220, 0.2)';
                                e.currentTarget.style.boxShadow = `0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px ${cap.glowColor}`;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(100, 160, 220, 0.06)';
                                e.currentTarget.style.boxShadow = '0 4px 24px rgba(0, 0, 0, 0.2)';
                            }}
                        >
                            <span className="text-4xl mb-6 block group-hover:scale-110 transition-transform"
                                style={{ filter: 'drop-shadow(0 0 6px rgba(34, 211, 238, 0.15))' }}>
                                {cap.icon}
                            </span>
                            <h4 className="font-bold text-base mb-2 relative z-10" style={{ color: '#e2e8f0' }}>{cap.title}</h4>
                            <p className="text-xs font-medium relative z-10" style={{ color: '#94a3b8' }}>{cap.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Privacy at the Local Core ── */}
            <section className="relative z-10 py-28 px-6 max-w-5xl mx-auto">
                <div className="p-14 relative overflow-hidden flex flex-col items-center text-center"
                    style={{
                        borderRadius: '32px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
                    }}
                >
                    {/* Top accent line */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1px]"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.3), transparent)' }} />

                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl mb-8"
                        style={{
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}>
                        🛡️
                    </div>

                    <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-6 leading-tight">
                        PRIVACY AT THE <br />
                        <span style={{ color: '#22d3ee' }}>LOCAL CORE.</span>
                    </h2>

                    <p className="text-lg max-w-2xl mb-12 font-light leading-relaxed" style={{ color: '#cbd5e1' }}>
                        Unlike traditional cloud-heavy SaaS, TatvaLabz uses your hardware's raw power.
                        Your mathematical models never leave your CPU/GPU, ensuring industrial-grade security by default.
                    </p>

                    <div className="flex gap-16 text-center pt-12 w-full justify-center"
                        style={{ borderTop: '1px solid rgba(100, 160, 220, 0.06)' }}>
                        {[
                            { value: "0ms", label: "Server Latency" },
                            { value: "100%", label: "Data Sovereignty" },
                        ].map((stat, i) => (
                            <React.Fragment key={stat.label}>
                                {i > 0 && <div style={{ width: '1px', height: '48px', background: 'rgba(100, 160, 220, 0.08)' }} />}
                                <div>
                                    <p className="text-2xl font-black" style={{ color: '#e2e8f0' }}>{stat.value}</p>
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold mt-1 text-gray-400"
                                        style={{ color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>{stat.label}</p>
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Feature Grid ── */}
            <section id="features" className="relative z-10 py-24 px-6 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { icon: "🌍", title: "Edge Computing", desc: "Math processing happens right on your local CPU/GPU. No data leaves the device, ensuring unmatched privacy and zero server overhead.", hoverBorder: 'rgba(34, 211, 238, 0.4)' },
                        { icon: "🛠️", title: "Visual Builder", desc: "Design complex industrial workflows with our intuitive node-based system. Connect components visually and see mathematical logic manifest in real-time.", hoverBorder: 'rgba(167, 139, 250, 0.4)' },
                        { icon: "🔬", title: "Scientific Accuracy", desc: "Ensuring every simulation adheres to strict physical laws. Our solver is built for mathematical rigor, turning abstract formulas into valid industrial insights.", hoverBorder: 'rgba(251, 191, 36, 0.4)' },
                    ].map((feat) => (
                        <div key={feat.title} className="p-8 group transition-all duration-300 border border-white/5"
                            style={{
                                borderRadius: '24px',
                                background: 'rgba(255, 255, 255, 0.02)',
                                backdropFilter: 'blur(10px)',
                                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = feat.hoverBorder;
                                e.currentTarget.style.background = 'rgba(14, 20, 35, 0.6)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(100, 160, 220, 0.06)';
                                e.currentTarget.style.background = 'rgba(10, 16, 28, 0.45)';
                            }}
                        >
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform duration-500"
                                style={{
                                    background: 'rgba(100, 160, 220, 0.04)',
                                    border: '1px solid rgba(100, 160, 220, 0.08)',
                                }}>
                                {feat.icon}
                            </div>
                            <h3 className="text-lg font-black mb-3 uppercase tracking-tight" style={{ color: '#e2e8f0' }}>
                                {feat.title}
                            </h3>
                            <p className="text-xs leading-relaxed font-medium" style={{ color: '#94a3b8' }}>
                                {feat.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Final CTA ── */}
            <section className="relative z-10 py-36 px-6 max-w-7xl mx-auto text-center"
                style={{ borderTop: '1px solid rgba(100, 160, 220, 0.04)' }}>
                <div className="relative">
                    <div className="absolute inset-0 rounded-full"
                        style={{ background: 'rgba(34, 211, 238, 0.03)', filter: 'blur(120px)' }} />

                    <h2 className="text-5xl md:text-7xl font-black tracking-tighter mb-8 relative z-10">
                        STOP MODELING. <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-amber-400">
                            START SOLVING.
                        </span>
                    </h2>
                    <p className="text-lg md:text-xl max-w-2xl mx-auto mb-14 font-medium tracking-tight relative z-10"
                        style={{ color: '#cbd5e1' }}>
                        Join the engineers building the next generation of industrial intelligence.
                        No setup, no bloat, just pure computation.
                    </p>
                    <button onClick={onStart}
                        className="relative z-10 active:scale-95 transition-all outline-none"
                        style={{
                            padding: '20px 56px',
                            borderRadius: '24px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            color: '#fff',
                            fontSize: '16px',
                            fontWeight: 900,
                            cursor: 'pointer',
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 8px 32px rgba(34, 211, 238, 0.1), inset 0 1px 0 rgba(255,255,255,0.1)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.15em',
                            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                            e.currentTarget.style.boxShadow = '0 8px 48px rgba(34, 211, 238, 0.2), inset 0 1px 0 rgba(255,255,255,0.15)';
                            e.currentTarget.style.transform = 'scale(1.08)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                            e.currentTarget.style.boxShadow = '0 8px 40px rgba(34, 211, 238, 0.1), inset 0 1px 0 rgba(255,255,255,0.1)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        Launch Workspace Now
                    </button>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="relative z-10 py-12 px-8 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8"
                style={{
                    borderTop: '1px solid rgba(100, 160, 220, 0.04)',
                    color: '#94a3b8',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                }}
            >
                <div className="flex items-center gap-4">
                    <span>© 2026 TatvaLabz Inc.</span>
                </div>
                <div className="flex gap-8">
                    <a href="https://x.com/electro_vansh" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 transition-colors"
                        style={{ color: '#94a3b8' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#22d3ee'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                    >
                        Get in touch <span style={{ color: '#22d3ee', fontStyle: 'italic' }}>↗</span>
                    </a>
                </div>
            </footer>
        </div>
    );
}
