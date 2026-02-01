/**
 * Loadout module exports
 *
 * This module contains all components for the LoadoutScene,
 * split into focused files for better maintainability and context efficiency.
 */

export { COLORS } from "./colors";
export { CLASS_INFO, BOOST_INFO, WEAPON_INFO, UNIT_DESIGNATIONS, getUnitDescription } from "./constants";
export type { UnitState, PreviewCallbacks } from "./types";
export { createUnitPreview, type UnitPreviewController, type UnitPreviewConfig } from "./UnitPreview";
export { createCustomizeEditor, type CustomizeEditorController, type CustomizeEditorConfig } from "./CustomizeEditor";
export { createTeamColorSwatches, createTeamHeader, createUnitCard } from "./ui-helpers";
export type { TeamColorSwatchConfig, TeamColorSwatchController, TeamHeaderConfig, TeamHeaderController, UnitCardConfig, UnitCardController } from "./ui-helpers";
