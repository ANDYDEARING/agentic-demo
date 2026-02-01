// Loadout scene color palette (matches title screen aesthetic)
export const COLORS = {
  // Backgrounds
  bgDeep: "#0a0a12",
  bgPanel: "#14110f",
  bgUnitRow: "#1a1714",
  bgButton: "#2a2420",
  bgButtonHover: "#3a3025",
  bgPreview: "#0a0a0a",

  // Borders & dividers
  borderWarm: "#3a2a1a",
  borderLight: "#5a4a35",

  // Text
  textPrimary: "#e8c8a0",
  textSecondary: "#a08060",
  textMuted: "#706050",

  // Accents
  accentOrange: "#ff9650",
  accentOrangeDeep: "#c06020",
  accentBlue: "#4080cc",
  accentBlueDeep: "#305080",

  // Interactive states
  selected: "#c06020",
  selectedGlow: "rgba(255, 150, 80, 0.3)",
  disabled: "#404040",
  success: "#508040",
  successHover: "#609050",
} as const;
