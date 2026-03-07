export const ICON_OPTIONS = [
  { value: "🌡️", label: "Thermometer" },
  { value: "🧭", label: "Gauge" },
  { value: "🌊", label: "Flow" },
  { value: "📳", label: "Vibration" },
  { value: "📏", label: "Level" },
  { value: "⚙️", label: "Motor" },
  { value: "🌀", label: "Pump" },
  { value: "🚿", label: "Valve" },
  { value: "💨", label: "Fan" },
  { value: "🔥", label: "Heater" },
  { value: "🗜️", label: "Compressor" },
  { value: "🎛️", label: "Controller" },
  { value: "∑", label: "Formula" },
  { value: "◉", label: "Generic" },
];

export const DEFAULT_ICON = "◉";

const KEYWORD_ICON_RULES = [
  { pattern: /(temp|thermal|heat)/i, icon: "🌡️" },
  { pattern: /(pressure|gauge)/i, icon: "🧭" },
  { pattern: /(flow|rate)/i, icon: "🌊" },
  { pattern: /(vibra|shake)/i, icon: "📳" },
  { pattern: /(level|height)/i, icon: "📏" },
  { pattern: /(motor|rpm)/i, icon: "⚙️" },
  { pattern: /(pump)/i, icon: "🌀" },
  { pattern: /(valve|restrict)/i, icon: "🚿" },
  { pattern: /(fan|air)/i, icon: "💨" },
  { pattern: /(heater|burn|fire)/i, icon: "🔥" },
  { pattern: /(compress)/i, icon: "🗜️" },
  { pattern: /(control|pid)/i, icon: "🎛️" },
  { pattern: /(formula|calc|math|sum|logic)/i, icon: "∑" },
];

export const inferIconFromText = (text = "") => {
  const normalized = String(text || "");
  const match = KEYWORD_ICON_RULES.find((rule) => rule.pattern.test(normalized));
  return match?.icon || DEFAULT_ICON;
};

export const resolveNodeIcon = ({ customIcon, configIcon, type, label }) => {
  return customIcon || configIcon || inferIconFromText(`${type || ""} ${label || ""}`) || DEFAULT_ICON;
};
