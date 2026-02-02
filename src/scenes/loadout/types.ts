import type { UnitClass, UnitCustomization } from "../../types";

// Per-slot unit configuration state
export interface UnitState {
  selectedClass: UnitClass;
  selectedBoost: number;
  selectedWeapon: "sword" | "pistol";
  customization: UnitCustomization;
  hasBeenCustomized: boolean;
}

// Callback registries for preview/card updates
export interface PreviewCallbacks {
  player1: (() => void)[];
  player2: (() => void)[];
}
