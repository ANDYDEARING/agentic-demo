/**
 * battle/ui/actionButtons.ts
 *
 * Bottom action buttons: Cancel (X) and Execute/Skip (checkmark/arrow).
 * Includes skip confirmation popup and queued actions display.
 */

import {
  AdvancedDynamicTexture,
  Button,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
} from "@babylonjs/gui";
import type { Unit } from "../../../types";
import { getClassData } from "../../../types";
import {
  ACTIONS_PER_TURN,
  SPEED_BONUS_PER_UNUSED_ACTION,
} from "../../../config";
import { isMeleeWeapon, WEAPON_DATA } from "../../../config/balance";
import { UNIT_DESIGNATIONS } from "../unitVisuals";

// =============================================================================
// TYPES
// =============================================================================

export interface PendingAction {
  type: "move" | "attack" | "ability";
  targetX?: number;
  targetZ?: number;
  targetUnit?: Unit;
  abilityName?: string;
}

export interface TurnState {
  unit: Unit;
  actionsRemaining: number;
  pendingActions: PendingAction[];
}

export interface ActionButtonsState {
  cancelBtn: Button;
  executeBtn: Button;
  queuedPanel: Rectangle;
  queuedStack: StackPanel;
  skipBackdrop: Rectangle;
  skipPanel: Rectangle;
  skipText: TextBlock;
}

// =============================================================================
// CREATION
// =============================================================================

/**
 * Create action buttons UI.
 */
export function createActionButtonsUI(
  gui: AdvancedDynamicTexture,
  screenWidth: number
): ActionButtonsState {
  // Cancel button - bottom left
  const cancelBtn = Button.CreateSimpleButton("cancelBtn", "✕");
  cancelBtn.width = "50px";
  cancelBtn.height = "50px";
  cancelBtn.background = "#3a2020";
  cancelBtn.color = "#ff6666";
  cancelBtn.cornerRadius = 25;
  cancelBtn.fontSize = 24;
  cancelBtn.fontWeight = "bold";
  cancelBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  cancelBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  cancelBtn.left = "15px";
  cancelBtn.top = "-15px";
  cancelBtn.thickness = 2;
  cancelBtn.isVisible = false;
  cancelBtn.isPointerBlocker = true;
  cancelBtn.zIndex = 50;
  gui.addControl(cancelBtn);

  // Execute button - bottom right
  const executeBtn = Button.CreateSimpleButton("executeBtn", "✓");
  executeBtn.width = "50px";
  executeBtn.height = "50px";
  executeBtn.background = "#203a20";
  executeBtn.color = "#66ff66";
  executeBtn.cornerRadius = 25;
  executeBtn.fontSize = 24;
  executeBtn.fontWeight = "bold";
  executeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  executeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  executeBtn.left = "-15px";
  executeBtn.top = "-15px";
  executeBtn.thickness = 2;
  executeBtn.isVisible = false;
  executeBtn.isPointerBlocker = true;
  executeBtn.zIndex = 50;
  gui.addControl(executeBtn);

  // Queued actions panel - bottom center
  const queuePanelWidth = Math.min(screenWidth - 160, 400);
  const queuedPanel = new Rectangle("queuedActionsPanel");
  queuedPanel.height = "50px";
  queuedPanel.adaptHeightToChildren = true;
  queuedPanel.background = "rgba(20, 20, 30, 0.8)";
  queuedPanel.cornerRadius = 8;
  queuedPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  queuedPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  queuedPanel.top = "-15px";
  queuedPanel.thickness = 0;
  queuedPanel.width = `${queuePanelWidth}px`;
  queuedPanel.paddingLeft = "10px";
  queuedPanel.paddingRight = "10px";
  queuedPanel.isVisible = false;

  const queuedStack = new StackPanel("queuedActionsStack");
  queuedStack.isVertical = true;
  queuedStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  queuedStack.paddingTop = "6px";
  queuedStack.paddingBottom = "6px";
  queuedPanel.addControl(queuedStack);

  gui.addControl(queuedPanel);

  // Skip confirmation popup
  const { backdrop: skipBackdrop, panel: skipPanel, text: skipText } =
    createSkipConfirmation(gui);

  return {
    cancelBtn,
    executeBtn,
    queuedPanel,
    queuedStack,
    skipBackdrop,
    skipPanel,
    skipText,
  };
}

/**
 * Create skip confirmation dialog.
 */
function createSkipConfirmation(gui: AdvancedDynamicTexture): {
  backdrop: Rectangle;
  panel: Rectangle;
  text: TextBlock;
} {
  const backdrop = new Rectangle("skipConfirmBackdrop");
  backdrop.width = "100%";
  backdrop.height = "100%";
  backdrop.background = "rgba(0, 0, 0, 0.5)";
  backdrop.thickness = 0;
  backdrop.isVisible = false;
  backdrop.zIndex = 100;
  gui.addControl(backdrop);

  const panel = new Rectangle("skipConfirmPanel");
  panel.width = "280px";
  panel.height = "120px";
  panel.background = "#1a1a2a";
  panel.cornerRadius = 12;
  panel.thickness = 2;
  panel.color = "#ffff66";
  panel.zIndex = 101;
  panel.isVisible = false;
  gui.addControl(panel);

  const stack = new StackPanel("skipConfirmStack");
  stack.isVertical = true;
  panel.addControl(stack);

  const text = new TextBlock("skipConfirmText");
  text.text = "Skip action for Speed Boost?";
  text.fontSize = 14;
  text.color = "white";
  text.height = "50px";
  text.textWrapping = true;
  stack.addControl(text);

  const btnRow = new StackPanel("skipConfirmBtnRow");
  btnRow.isVertical = false;
  btnRow.height = "50px";
  stack.addControl(btnRow);

  const noBtn = Button.CreateSimpleButton("skipConfirmNo", "Cancel");
  noBtn.width = "100px";
  noBtn.height = "36px";
  noBtn.background = "#2a2a2a";
  noBtn.color = "#aaaaaa";
  noBtn.cornerRadius = 8;
  noBtn.fontSize = 14;
  noBtn.paddingRight = "10px";
  btnRow.addControl(noBtn);

  const yesBtn = Button.CreateSimpleButton("skipConfirmYes", "Yes, Skip");
  yesBtn.width = "100px";
  yesBtn.height = "36px";
  yesBtn.background = "#3a3a20";
  yesBtn.color = "#ffff66";
  yesBtn.cornerRadius = 8;
  yesBtn.fontSize = 14;
  yesBtn.paddingLeft = "10px";
  btnRow.addControl(yesBtn);

  return { backdrop, panel, text };
}

// =============================================================================
// SKIP CONFIRMATION
// =============================================================================

/**
 * Show skip confirmation popup.
 */
export function showSkipConfirm(
  state: ActionButtonsState,
  actionsRemaining: number
): void {
  const speedBoost = actionsRemaining * SPEED_BONUS_PER_UNUSED_ACTION;
  const actionWord = actionsRemaining === 1 ? "action" : "actions";
  state.skipText.text = `Skip ${actionsRemaining} ${actionWord} for Speed Boost?\n(+${speedBoost.toFixed(2)})`;
  state.skipBackdrop.isVisible = true;
  state.skipPanel.isVisible = true;
}

/**
 * Hide skip confirmation popup.
 */
export function hideSkipConfirm(state: ActionButtonsState): void {
  state.skipBackdrop.isVisible = false;
  state.skipPanel.isVisible = false;
}

// =============================================================================
// BUTTON STATE UPDATES
// =============================================================================

/**
 * Update action button visibility and appearance.
 */
export function updateActionButtons(
  state: ActionButtonsState,
  turnState: TurnState | null,
  isHumanTurn: boolean
): void {
  const hasQueuedActions = !!(
    turnState && turnState.pendingActions.length > 0
  );
  const allActionsUsed = turnState && turnState.actionsRemaining === 0;

  state.cancelBtn.isVisible = isHumanTurn && hasQueuedActions;
  state.executeBtn.isVisible = isHumanTurn;
  state.queuedPanel.isVisible = isHumanTurn && hasQueuedActions;

  // Update execute button appearance
  if (state.executeBtn.textBlock) {
    if (allActionsUsed) {
      // Green checkmark - all actions used
      state.executeBtn.textBlock.text = "✓";
      state.executeBtn.textBlock.top = "0px";
      state.executeBtn.textBlock.left = "0px";
      state.executeBtn.background = "#203a20";
      state.executeBtn.color = "#66ff66";
    } else {
      // Yellow skip - has unused actions
      state.executeBtn.textBlock.text = "»";
      state.executeBtn.textBlock.top = "-2px";
      state.executeBtn.textBlock.left = "1px";
      state.executeBtn.background = "#3a3a20";
      state.executeBtn.color = "#ffff66";
    }
  }
}

// =============================================================================
// QUEUED ACTIONS DISPLAY
// =============================================================================

/**
 * Update the queued actions display panel.
 */
export function updateQueuedActionsDisplay(
  state: ActionButtonsState,
  currentUnit: Unit | null,
  turnState: TurnState | null
): void {
  state.queuedStack.clearControls();

  if (!currentUnit || !turnState || turnState.pendingActions.length === 0) {
    return;
  }

  const total = ACTIONS_PER_TURN;
  const unitDesignation = UNIT_DESIGNATIONS[currentUnit.loadoutIndex] || "?";
  const unitClassName = getClassData(currentUnit.unitClass).name;

  // Track cumulative HP changes and conceal breaks
  const hpDeltas = new Map<Unit, number>();
  const concealBroken = new Set<Unit>();

  for (let i = 0; i < turnState.pendingActions.length; i++) {
    const action = turnState.pendingActions[i];
    const n = i + 1;
    const actionLine = new TextBlock();
    actionLine.fontSize = 12;
    actionLine.textWrapping = true;
    actionLine.resizeToFit = true;

    if (action.type === "move") {
      actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Move`;
      actionLine.color = "#88ccff";
    } else if (action.type === "attack" && action.targetUnit) {
      const target = action.targetUnit;
      const targetDesignation = UNIT_DESIGNATIONS[target.loadoutIndex] || "?";
      const targetClass = getClassData(target.unitClass).name;
      const weaponType = currentUnit.customization?.weapon ?? "pistol";
      const isMelee = isMeleeWeapon(weaponType);
      const baseDamage = Math.round(currentUnit.attack * WEAPON_DATA[weaponType].damageMultiplier);

      // Check concealed status
      const targetIsConcealed =
        target.isConcealed && !concealBroken.has(target);
      const damage = targetIsConcealed ? 0 : baseDamage;
      if (targetIsConcealed) {
        concealBroken.add(target);
      }

      const pendingHp = Math.max(
        0,
        Math.min(target.maxHp, target.hp + (hpDeltas.get(target) || 0))
      );
      const newHp = Math.max(0, pendingHp - damage);
      hpDeltas.set(target, (hpDeltas.get(target) || 0) + (newHp - pendingHp));

      const verb = isMelee ? "Strike" : "Shoot";
      const concealNote = targetIsConcealed ? " (Conceal)" : "";
      actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} ${verb} ${targetDesignation} ${targetClass} ${pendingHp}→${newHp}${concealNote}`;
      actionLine.color = "#ff6666";
    } else if (
      action.type === "ability" &&
      action.abilityName === "heal" &&
      action.targetUnit
    ) {
      const target = action.targetUnit;
      const healAmt = currentUnit.healAmount;
      const pendingHp = Math.max(
        0,
        Math.min(target.maxHp, target.hp + (hpDeltas.get(target) || 0))
      );
      const newHp = Math.min(target.maxHp, pendingHp + healAmt);
      hpDeltas.set(target, (hpDeltas.get(target) || 0) + (newHp - pendingHp));

      if (target === currentUnit) {
        actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Heal ${pendingHp}→${newHp}`;
      } else {
        const targetDesignation =
          UNIT_DESIGNATIONS[target.loadoutIndex] || "?";
        const targetClass = getClassData(target.unitClass).name;
        actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Heal ${targetDesignation} ${targetClass} ${pendingHp}→${newHp}`;
      }
      actionLine.color = "#66ff66";
    } else if (action.type === "ability" && action.abilityName === "conceal") {
      actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Conceal`;
      actionLine.color = "#ffff66";
    } else if (action.type === "ability" && action.abilityName === "cover") {
      actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Cover`;
      actionLine.color = "#ffff66";
    }

    state.queuedStack.addControl(actionLine);
  }
}
