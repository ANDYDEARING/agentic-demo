/**
 * battle/ui/statusBar.ts
 *
 * Current unit status bar displayed at top center.
 * Shows unit info: designation, class, weapon, boost, HP.
 */

import {
  AdvancedDynamicTexture,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
} from "@babylonjs/gui";
import type { Unit } from "../../../types";
import { getClassData } from "../../../types";
import {
  HP_LOW_THRESHOLD,
  HP_MEDIUM_THRESHOLD,
} from "../../../config";
import { BOOST_INFO } from "../../loadout/constants";
import { HP_BAR_GREEN, HP_BAR_ORANGE, HP_BAR_RED } from "../../../config";
import { WEAPON_DATA } from "../../../config/balance";
import { UNIT_DESIGNATIONS } from "../unitVisuals";

// =============================================================================
// TYPES
// =============================================================================

export interface StatusBarState {
  container: Rectangle;
  line1: TextBlock; // Designation + Class (team color)
  line2: TextBlock; // Weapon + Boost (white)
  hpText: TextBlock; // HP (color-coded)
}

// =============================================================================
// CREATION
// =============================================================================

/**
 * Create the current unit status bar.
 */
export function createStatusBar(
  gui: AdvancedDynamicTexture,
  screenWidth: number
): StatusBarState {
  const statusBarWidth = Math.min(screenWidth - 160, 400);

  const container = new Rectangle("currentUnitStatusBar");
  container.width = `${statusBarWidth}px`;
  container.height = "58px";
  container.background = "rgba(20, 20, 30, 0.8)";
  container.cornerRadius = 8;
  container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  container.top = "15px";
  container.thickness = 0;
  container.isVisible = false;
  container.zIndex = 10;
  gui.addControl(container);

  const stack = new StackPanel("statusStack");
  stack.isVertical = true;
  container.addControl(stack);

  // Line 1: Symbol Class (team color)
  const line1 = new TextBlock("statusLine1");
  line1.text = "";
  line1.fontSize = 12;
  line1.fontWeight = "bold";
  line1.color = "white";
  line1.height = "18px";
  stack.addControl(line1);

  // Line 2: [WEAPON] [BOOST] (white)
  const line2 = new TextBlock("statusLine2");
  line2.text = "";
  line2.fontSize = 11;
  line2.color = "white";
  line2.height = "18px";
  stack.addControl(line2);

  // Line 3: HP (color-coded)
  const hpText = new TextBlock("statusHpText");
  hpText.text = "";
  hpText.fontSize = 11;
  hpText.color = HP_BAR_GREEN;
  hpText.height = "18px";
  stack.addControl(hpText);

  return { container, line1, line2, hpText };
}

// =============================================================================
// UPDATES
// =============================================================================

/**
 * Get HP bar color based on current HP percentage.
 */
function getHpColor(unit: Unit): string {
  const hpPercent = unit.hp / unit.maxHp;
  if (hpPercent < HP_LOW_THRESHOLD) return HP_BAR_RED;
  if (hpPercent < HP_MEDIUM_THRESHOLD) return HP_BAR_ORANGE;
  return HP_BAR_GREEN;
}

/**
 * Update status bar for the current unit.
 */
export function updateStatusBar(
  state: StatusBarState,
  currentUnit: Unit | null
): void {
  if (!currentUnit) {
    state.container.isVisible = false;
    return;
  }

  const designation = UNIT_DESIGNATIONS[currentUnit.loadoutIndex] || "?";
  const className = getClassData(currentUnit.unitClass).name;
  const weaponType = currentUnit.customization?.weapon ?? "pistol";
  const weapon = WEAPON_DATA[weaponType].name.toUpperCase();
  const boostData = BOOST_INFO[currentUnit.boost] || BOOST_INFO[0];

  // Line 1: Symbol Class (team color)
  state.line1.text = `${designation} ${className}`;
  const r = Math.round(currentUnit.teamColor.r * 255)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(currentUnit.teamColor.g * 255)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(currentUnit.teamColor.b * 255)
    .toString(16)
    .padStart(2, "0");
  state.line1.color = `#${r}${g}${b}`;

  // Line 2: [WEAPON] [BOOST] (white)
  state.line2.text = `[${weapon}] [${boostData.name.toUpperCase()}]`;

  // Line 3: HP (color-coded)
  state.hpText.text = `HP: ${currentUnit.hp}/${currentUnit.maxHp}`;
  state.hpText.color = getHpColor(currentUnit);

  state.container.isVisible = true;
}
