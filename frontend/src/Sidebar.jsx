/**
 * Sidebar.jsx — Compact Component Palette
 * Shows only component names and icons for clean, fast browsing.
 */

import ComponentRegistry from "./ComponentRegistry";
import { DEFAULT_ICON, resolveNodeIcon } from "./IconCatalog";

export default function Sidebar({ customComponents = [] }) {
  const onDragStart = (event, componentType) => {
    event.dataTransfer.setData("application/reactflow", componentType);
    event.dataTransfer.effectAllowed = "move";
  };

  const customComponentKeys = new Set(customComponents.map(c => c.registryKey));

  const allComponents = [
    ...Object.entries(ComponentRegistry)
      .filter(([type]) => !customComponentKeys.has(type))
      .map(([type, config]) => ({
        type, config, isCustomSaved: false,
      })),
    ...customComponents.map((comp) => ({
      type: comp.registryKey,
      config: {
        label: comp.label,
        inputs: comp.inputs,
        outputs: comp.outputs,
        formulas: comp.formulas,
        defaultParams: comp.defaultParams || {},
        icon: resolveNodeIcon({
          customIcon: comp.icon || "",
          configIcon: "",
          type: comp.registryKey,
          label: comp.label,
        }) || DEFAULT_ICON,
      },
      isCustomSaved: true, compId: comp.id,
    })),
  ];

  return (
    <div className="flex flex-col gap-1.5 select-none">
      {/* Header */}
      <div className="mb-2 px-1">
        <h2 className="text-[9px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: 'var(--primary)' }}>
          CORE_MODULES
        </h2>
        <p className="text-[9px] text-muted font-mono opacity-60">
          select_node // drag_to_canvas
        </p>
      </div>

      {/* Component Cards — compact */}
      {allComponents.map(({ type, config, isCustomSaved, compId }) => {
        const resolvedIcon = resolveNodeIcon({
          customIcon: config.icon || "",
          configIcon: "",
          type,
          label: config.label,
        }) || DEFAULT_ICON;
        return (
        <div
          key={type}
          draggable
          onDragStart={(e) => onDragStart(e, type)}
          className="group cursor-grab active:cursor-grabbing transition-all duration-150 flex items-center gap-2.5"
          style={{
            background: 'var(--bg-surface)',
            border: `1px solid ${isCustomSaved ? 'var(--primary-glow)' : 'var(--border-technical)'}`,
            borderRadius: '4px',
            padding: '4px 8px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--primary)';
            e.currentTarget.style.background = 'var(--bg-elevated)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isCustomSaved ? 'var(--primary-glow)' : 'var(--border-technical)';
            e.currentTarget.style.background = 'var(--bg-surface)';
          }}
        >
          {/* Icon */}
          <span className="text-[8px] font-bold shrink-0 px-1 py-0.5 bg-black/40 border border-white/5 rounded-sm" style={{ color: 'var(--primary)' }}>
            {resolvedIcon}
          </span>

          {/* Label */}
          <span className="font-semibold text-[11px] truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
            {config.label}
          </span>

          {/* I/O count badge */}
          <span style={{
            fontSize: '8px', padding: '1px 4px', borderRadius: '2px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-technical)',
            color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600, flexShrink: 0,
          }}>
            {config.inputs.length}/{config.outputs.length}
          </span>

        </div>
      )})}
    </div>
  );
}
