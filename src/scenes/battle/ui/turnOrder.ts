/**
 * battle/ui/turnOrder.ts
 *
 * Turn order preview modal and hamburger button.
 * Shows current and upcoming unit turns with their stats.
 */

import {
  AdvancedDynamicTexture,
  Button,
  Control,
  Rectangle,
  ScrollViewer,
  StackPanel,
  TextBlock,
} from "@babylonjs/gui";
import { ArcRotateCamera, Engine } from "@babylonjs/core";
import type { Unit, Team } from "../../../types";
import { getClassData } from "../../../types";
import { ACCUMULATOR_THRESHOLD } from "../../../config";
import { WEAPON_DATA } from "../../../config/balance";
import { BOOST_INFO } from "../../loadout/constants";
import { UNIT_DESIGNATIONS } from "../unitVisuals";
import type { CameraMode } from "../camera";

// =============================================================================
// TYPES
// =============================================================================

export interface PredictedTurn {
  unit: Unit;
  speedBonus: number;
}

export interface TurnOrderUIState {
  button: Button;
  backdrop: Rectangle;
  modal: Rectangle;
  scrollViewer: ScrollViewer;
  stack: StackPanel;
  forfeitBackdrop: Rectangle;
  forfeitPanel: Rectangle;
  modalWasCameraAttached: boolean;
}

// =============================================================================
// TURN PREDICTION
// =============================================================================

/**
 * Predict the next N turns without modifying actual game state.
 */
export function predictTurnOrder(
  units: Unit[],
  count: number,
  isFirstRound: boolean,
  firstRoundQueue: Unit[],
  lastActingTeam: Team | null
): PredictedTurn[] {
  const result: PredictedTurn[] = [];
  const aliveUnits = units.filter((u) => u.hp > 0);
  if (aliveUnits.length === 0) return result;

  // During first round, start with remaining queue entries
  if (isFirstRound && firstRoundQueue.length > 0) {
    for (const unit of firstRoundQueue) {
      if (unit.hp > 0) {
        result.push({ unit, speedBonus: unit.speedBonus });
        if (result.length >= count) return result;
      }
    }
  }

  // Clone accumulators and speed bonuses for simulation
  const simAccumulators = new Map<Unit, number>();
  const simSpeedBonuses = new Map<Unit, number>();
  for (const unit of aliveUnits) {
    simAccumulators.set(unit, isFirstRound ? 0 : unit.accumulator);
    simSpeedBonuses.set(unit, isFirstRound ? 0 : unit.speedBonus);
  }

  // Track simulated "last acting team" for tie-breaking
  let simLastTeam: Team | null = isFirstRound
    ? firstRoundQueue.length > 0
      ? firstRoundQueue[firstRoundQueue.length - 1].team
      : lastActingTeam
    : lastActingTeam;

  const remaining = count - result.length;
  for (let i = 0; i < remaining && aliveUnits.length > 0; i++) {
    const readyUnits: Unit[] = [];

    // Tick until someone is ready
    while (readyUnits.length === 0) {
      for (const unit of aliveUnits) {
        const simBonus = simSpeedBonuses.get(unit) || 0;
        const acc = (simAccumulators.get(unit) || 0) + unit.speed + simBonus;
        simAccumulators.set(unit, acc);
        if (acc >= ACCUMULATOR_THRESHOLD) {
          readyUnits.push(unit);
        }
      }
    }

    // Sort by tie-breakers
    readyUnits.sort((a, b) => {
      if (simLastTeam !== null) {
        if (a.team !== simLastTeam && b.team === simLastTeam) return -1;
        if (b.team !== simLastTeam && a.team === simLastTeam) return 1;
      }
      return a.loadoutIndex - b.loadoutIndex;
    });

    const nextUnit = readyUnits[0];
    result.push({ unit: nextUnit, speedBonus: simSpeedBonuses.get(nextUnit) || 0 });
    simAccumulators.set(nextUnit, 0);
    simSpeedBonuses.set(nextUnit, 0);
    simLastTeam = nextUnit.team;
  }

  return result;
}

// =============================================================================
// UI CREATION
// =============================================================================

/**
 * Create the turn order button and modal.
 */
export function createTurnOrderUI(
  gui: AdvancedDynamicTexture,
  _screenWidth: number,
  screenHeight: number,
  isTouch: boolean
): TurnOrderUIState {
  // Hamburger button - top left
  const button = Button.CreateSimpleButton("turnOrderBtn", "");
  button.width = "44px";
  button.height = "44px";
  button.background = "rgba(40, 40, 50, 0.9)";
  button.cornerRadius = 22;
  button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  button.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  button.left = "15px";
  button.top = "15px";
  button.thickness = 2;
  button.color = "white";
  button.isPointerBlocker = true;
  button.zIndex = 50;

  // Hamburger icon (3 horizontal lines)
  const lineSpacing = 6;
  const lineHeight = 2;
  const lineWidth = 18;

  for (let i = 0; i < 3; i++) {
    const line = new Rectangle(`hamburgerLine${i}`);
    line.width = `${lineWidth}px`;
    line.height = `${lineHeight}px`;
    line.background = "white";
    line.thickness = 0;
    line.isHitTestVisible = false;
    line.top = `${(i - 1) * lineSpacing}px`;
    button.addControl(line);
  }

  gui.addControl(button);

  // Backdrop
  const backdrop = new Rectangle("turnOrderBackdrop");
  backdrop.width = "100%";
  backdrop.height = "100%";
  backdrop.background = "rgba(0, 0, 0, 0.7)";
  backdrop.thickness = 0;
  backdrop.isVisible = false;
  backdrop.zIndex = 100;
  backdrop.isPointerBlocker = true;
  gui.addControl(backdrop);

  // Modal
  const modal = new Rectangle("turnOrderModal");
  modal.width = isTouch ? "280px" : "320px";
  const modalHeight = Math.min(400, screenHeight - 40);
  modal.height = `${modalHeight}px`;
  modal.background = "#0a0a0a";
  modal.cornerRadius = 12;
  modal.thickness = 2;
  modal.color = "#333333";
  modal.isVisible = false;
  modal.zIndex = 101;
  modal.isPointerBlocker = true;
  gui.addControl(modal);

  // Modal header
  const header = new Rectangle("modalHeader");
  header.width = "100%";
  header.height = "50px";
  header.background = "#151515";
  header.thickness = 0;
  header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  modal.addControl(header);

  const title = new TextBlock("modalTitle");
  title.text = "Turn Order";
  title.color = "#ffffff";
  title.fontSize = 18;
  title.fontWeight = "bold";
  header.addControl(title);

  // Scrollable content
  const scrollViewer = new ScrollViewer("turnOrderScroll");
  scrollViewer.width = "100%";
  scrollViewer.height = `${modalHeight - 110}px`;
  scrollViewer.top = "50px";
  scrollViewer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  scrollViewer.thickness = 0;
  scrollViewer.barSize = 0;
  scrollViewer.barColor = "transparent";
  modal.addControl(scrollViewer);

  const stack = new StackPanel("turnOrderStack");
  stack.width = "100%";
  stack.paddingTop = "10px";
  scrollViewer.addControl(stack);

  // Forfeit footer
  const forfeitFooter = new Rectangle("forfeitFooter");
  forfeitFooter.width = "100%";
  forfeitFooter.height = "50px";
  forfeitFooter.background = "#151515";
  forfeitFooter.thickness = 0;
  forfeitFooter.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  modal.addControl(forfeitFooter);

  const forfeitBtn = Button.CreateSimpleButton("forfeitBtn", "Forfeit");
  forfeitBtn.width = "120px";
  forfeitBtn.height = "34px";
  forfeitBtn.background = "#552222";
  forfeitBtn.color = "#ff6666";
  forfeitBtn.cornerRadius = 6;
  forfeitBtn.fontSize = 14;
  forfeitBtn.fontWeight = "bold";
  forfeitBtn.isPointerBlocker = true;
  forfeitBtn.zIndex = 50;
  forfeitFooter.addControl(forfeitBtn);

  // Forfeit confirmation
  const { backdrop: forfeitBackdrop, panel: forfeitPanel } =
    createForfeitConfirmation(gui, isTouch);

  return {
    button,
    backdrop,
    modal,
    scrollViewer,
    stack,
    forfeitBackdrop,
    forfeitPanel,
    modalWasCameraAttached: false,
  };
}

/**
 * Create forfeit confirmation dialog.
 */
function createForfeitConfirmation(
  gui: AdvancedDynamicTexture,
  isTouch: boolean
): { backdrop: Rectangle; panel: Rectangle } {
  const backdrop = new Rectangle("forfeitConfirmBackdrop");
  backdrop.width = "100%";
  backdrop.height = "100%";
  backdrop.background = "rgba(0, 0, 0, 0.8)";
  backdrop.thickness = 0;
  backdrop.isVisible = false;
  backdrop.zIndex = 200;
  backdrop.isPointerBlocker = true;
  gui.addControl(backdrop);

  const panel = new Rectangle("forfeitConfirmPanel");
  panel.width = isTouch ? "260px" : "300px";
  panel.height = "160px";
  panel.background = "#0a0a0a";
  panel.cornerRadius = 12;
  panel.thickness = 2;
  panel.color = "#552222";
  panel.zIndex = 201;
  panel.isVisible = false;
  panel.isPointerBlocker = true;
  gui.addControl(panel);

  const stack = new StackPanel("forfeitConfirmStack");
  stack.isVertical = true;
  stack.width = "100%";
  panel.addControl(stack);

  const title = new TextBlock("forfeitConfirmTitle");
  title.text = "Forfeit Match?";
  title.color = "#ff6666";
  title.fontSize = 18;
  title.fontWeight = "bold";
  title.height = "40px";
  stack.addControl(title);

  const msg = new TextBlock("forfeitConfirmMsg");
  msg.text = "This will end the match.";
  msg.color = "#aaaaaa";
  msg.fontSize = 13;
  msg.height = "30px";
  stack.addControl(msg);

  const btnRow = new StackPanel("forfeitBtnRow");
  btnRow.isVertical = false;
  btnRow.height = "50px";
  btnRow.width = "220px";
  stack.addControl(btnRow);

  const cancelBtn = Button.CreateSimpleButton("forfeitCancelBtn", "Cancel");
  cancelBtn.width = "100px";
  cancelBtn.height = "36px";
  cancelBtn.background = "#333333";
  cancelBtn.color = "white";
  cancelBtn.cornerRadius = 6;
  cancelBtn.fontSize = 14;
  cancelBtn.isPointerBlocker = true;
  btnRow.addControl(cancelBtn);

  const spacer = new Rectangle("forfeitBtnSpacer");
  spacer.width = "20px";
  spacer.height = "1px";
  spacer.thickness = 0;
  btnRow.addControl(spacer);

  const confirmBtn = Button.CreateSimpleButton("forfeitConfirmBtn", "Forfeit");
  confirmBtn.width = "100px";
  confirmBtn.height = "36px";
  confirmBtn.background = "#882222";
  confirmBtn.color = "#ff6666";
  confirmBtn.cornerRadius = 6;
  confirmBtn.fontSize = 14;
  confirmBtn.fontWeight = "bold";
  confirmBtn.isPointerBlocker = true;
  btnRow.addControl(confirmBtn);

  return { backdrop, panel };
}

// =============================================================================
// MODAL CONTROL
// =============================================================================

/**
 * Show the turn order modal.
 */
export function showTurnOrderModal(
  state: TurnOrderUIState,
  currentUnit: Unit | null,
  predicted: PredictedTurn[],
  camera: ArcRotateCamera,
  cameraMode: CameraMode
): void {
  state.modalWasCameraAttached = cameraMode === "rotate";
  camera.detachControl();

  // Populate list
  state.stack.clearControls();

  if (currentUnit) {
    const row = createTurnOrderRow(currentUnit, 0, true);
    state.stack.addControl(row);
  }

  for (let i = 0; i < predicted.length; i++) {
    const row = createTurnOrderRow(
      predicted[i].unit,
      i + 1,
      false,
      predicted[i].speedBonus
    );
    state.stack.addControl(row);
  }

  state.backdrop.isVisible = true;
  state.modal.isVisible = true;
}

/**
 * Hide the turn order modal.
 */
export function hideTurnOrderModal(
  state: TurnOrderUIState,
  camera: ArcRotateCamera
): void {
  state.backdrop.isVisible = false;
  state.modal.isVisible = false;
  if (state.modalWasCameraAttached) {
    camera.attachControl(true);
  }
}

/**
 * Create a row in the turn order list.
 */
function createTurnOrderRow(
  unit: Unit,
  index: number,
  isCurrent: boolean,
  displaySpeedBonus?: number
): Rectangle {
  const row = new Rectangle(`turnOrderRow${index}`);
  row.width = "100%";
  row.height = "58px";
  row.background = isCurrent ? "rgba(255, 200, 100, 0.15)" : "transparent";
  row.thickness = 0;
  row.paddingBottom = "4px";

  // Team color bar
  const colorBar = new Rectangle(`colorBar${index}`);
  colorBar.width = "4px";
  colorBar.height = "50px";
  const r = Math.round(unit.teamColor.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(unit.teamColor.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(unit.teamColor.b * 255).toString(16).padStart(2, "0");
  const teamColorHex = `#${r}${g}${b}`;
  colorBar.background = teamColorHex;
  colorBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  colorBar.left = "5px";
  colorBar.thickness = 0;
  row.addControl(colorBar);

  // Unit name
  const designation = UNIT_DESIGNATIONS[unit.loadoutIndex] || "?";
  const className = getClassData(unit.unitClass).name;

  const nameText = new TextBlock(`nameText${index}`);
  nameText.text = `${designation} ${className}`;
  nameText.color = teamColorHex;
  nameText.fontSize = 14;
  nameText.fontWeight = isCurrent ? "bold" : "normal";
  nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  nameText.left = "20px";
  nameText.top = "-14px";
  row.addControl(nameText);

  // Speed text
  const bonus = displaySpeedBonus ?? unit.speedBonus;
  const baseSpd = unit.speed.toFixed(2);
  const speedText = new TextBlock(`speedText${index}`);
  if (bonus > 0) {
    speedText.text = `Speed: ${baseSpd} (+${bonus.toFixed(2)} skip)`;
    speedText.color = "#aad466";
  } else {
    speedText.text = `Speed: ${baseSpd}`;
    speedText.color = "#888888";
  }
  speedText.fontSize = 11;
  speedText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  speedText.left = "20px";
  speedText.top = "2px";
  row.addControl(speedText);

  // Weapon + Boost text
  const weaponType = unit.customization?.weapon ?? "pistol";
  const weaponName = WEAPON_DATA[weaponType].name;
  const boostData = BOOST_INFO[unit.boost] || BOOST_INFO[0];
  const boostText = new TextBlock(`boostText${index}`);
  boostText.text = `${weaponName}, +${boostData.value}% ${boostData.stat}`;
  boostText.color = "#888888";
  boostText.fontSize = 11;
  boostText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  boostText.left = "20px";
  boostText.top = "16px";
  row.addControl(boostText);

  // Current indicator
  if (isCurrent) {
    const currentLabel = new TextBlock(`currentLabel${index}`);
    currentLabel.text = "NOW";
    currentLabel.color = "#ffcc66";
    currentLabel.fontSize = 10;
    currentLabel.fontWeight = "bold";
    currentLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    currentLabel.left = "-10px";
    row.addControl(currentLabel);
  }

  return row;
}

// =============================================================================
// SCROLL HANDLING
// =============================================================================

/**
 * Set up drag-to-scroll for the modal.
 * Returns cleanup function.
 */
export function setupModalScrollHandlers(
  state: TurnOrderUIState,
  engine: Engine
): () => void {
  let dragging = false;
  let lastY = 0;

  function isInsideModal(clientX: number, clientY: number): boolean {
    const modalCenterX = engine.getRenderWidth() / 2;
    const modalCenterY = engine.getRenderHeight() / 2;
    const modalW = state.modal.widthInPixels;
    const modalH = state.modal.heightInPixels;
    return (
      clientX >= modalCenterX - modalW / 2 &&
      clientX <= modalCenterX + modalW / 2 &&
      clientY >= modalCenterY - modalH / 2 &&
      clientY <= modalCenterY + modalH / 2
    );
  }

  function applyScrollDelta(deltaY: number): void {
    const contentHeight = state.stack.heightInPixels;
    const viewportHeight = state.scrollViewer.heightInPixels;
    const maxScroll = contentHeight - viewportHeight;
    if (maxScroll > 0) {
      const scrollDelta = deltaY / maxScroll;
      const newScroll = Math.max(
        0,
        Math.min(1, state.scrollViewer.verticalBar.value + scrollDelta)
      );
      state.scrollViewer.verticalBar.value = newScroll;
    }
  }

  const touchStart = (e: TouchEvent) => {
    if (!state.modal.isVisible) return;
    if (!isInsideModal(e.touches[0].clientX, e.touches[0].clientY)) return;
    dragging = true;
    lastY = e.touches[0].clientY;
  };

  const touchMove = (e: TouchEvent) => {
    if (!dragging || !state.modal.isVisible) return;
    const deltaY = lastY - e.touches[0].clientY;
    lastY = e.touches[0].clientY;
    applyScrollDelta(deltaY);
    e.preventDefault();
  };

  const touchEnd = () => {
    dragging = false;
  };

  const mouseDown = (e: MouseEvent) => {
    if (!state.modal.isVisible) return;
    if (!isInsideModal(e.clientX, e.clientY)) return;
    dragging = true;
    lastY = e.clientY;
  };

  const mouseMove = (e: MouseEvent) => {
    if (!dragging || !state.modal.isVisible) return;
    const deltaY = lastY - e.clientY;
    lastY = e.clientY;
    applyScrollDelta(deltaY);
    e.preventDefault();
  };

  const mouseUp = () => {
    dragging = false;
  };

  window.addEventListener("touchstart", touchStart, { passive: false });
  window.addEventListener("touchmove", touchMove, { passive: false });
  window.addEventListener("touchend", touchEnd);
  window.addEventListener("touchcancel", touchEnd);
  window.addEventListener("mousedown", mouseDown);
  window.addEventListener("mousemove", mouseMove);
  window.addEventListener("mouseup", mouseUp);

  return () => {
    window.removeEventListener("touchstart", touchStart);
    window.removeEventListener("touchmove", touchMove);
    window.removeEventListener("touchend", touchEnd);
    window.removeEventListener("touchcancel", touchEnd);
    window.removeEventListener("mousedown", mouseDown);
    window.removeEventListener("mousemove", mouseMove);
    window.removeEventListener("mouseup", mouseUp);
  };
}
