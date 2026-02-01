/**
 * battle/ui/actionCounter.ts
 *
 * Action counter display below unit designation symbol.
 * Shows remaining actions (e.g., "2/2", "1/2", "0/2").
 */

import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import {
  Scene,
  Vector3,
  Matrix,
  ArcRotateCamera,
  Engine,
} from "@babylonjs/core";
import type { Unit } from "../../../types";
import { ACTIONS_PER_TURN, TILE_SIZE, GRID_SIZE, HP_BAR_ANCHOR_HEIGHT } from "../../../config";
import type { TurnState } from "./actionButtons";

// =============================================================================
// TYPES
// =============================================================================

export interface ActionCounterState {
  text: TextBlock;
}

// =============================================================================
// CREATION
// =============================================================================

/**
 * Create the action counter text element.
 */
export function createActionCounter(
  gui: AdvancedDynamicTexture
): ActionCounterState {
  const text = new TextBlock("actionCounterText");
  text.text = "2/2";
  text.fontSize = 12;
  text.fontWeight = "bold";
  text.color = "#66ff66";
  text.outlineWidth = 2;
  text.outlineColor = "black";
  text.isVisible = false;
  gui.addControl(text);

  return { text };
}

// =============================================================================
// UPDATES
// =============================================================================

/**
 * Update action counter position and display.
 * Call this each frame.
 */
export function updateActionCounter(
  state: ActionCounterState,
  currentUnit: Unit | null,
  turnState: TurnState | null,
  isAI: boolean,
  shadowPosition: { x: number; z: number } | null,
  scene: Scene,
  camera: ArcRotateCamera,
  engine: Engine
): void {
  if (!currentUnit || !turnState || isAI) {
    state.text.isVisible = false;
    return;
  }

  const remaining = turnState.actionsRemaining;
  state.text.text = `${remaining}/${ACTIONS_PER_TURN}`;

  // Color based on remaining actions
  if (remaining >= 2) {
    state.text.color = "#66ff66"; // Green
  } else if (remaining === 1) {
    state.text.color = "#ffff66"; // Yellow
  } else {
    state.text.color = "#ff6666"; // Red
  }

  // Position next to designation symbol
  const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
  const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;
  const gridOffset = (GRID_SIZE * TILE_SIZE) / 2 - TILE_SIZE / 2;

  // Convert world position to screen coordinates
  const worldPos = new Vector3(
    effectiveX * TILE_SIZE - gridOffset,
    HP_BAR_ANCHOR_HEIGHT,
    effectiveZ * TILE_SIZE - gridOffset
  );
  const screenPos = Vector3.Project(
    worldPos,
    Matrix.Identity(),
    scene.getTransformMatrix(),
    camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
  );

  // Position below designation symbol (centered, one line below)
  state.text.left = `${screenPos.x - engine.getRenderWidth() / 2}px`;
  state.text.top = `${screenPos.y - engine.getRenderHeight() / 2 + 5}px`;
  state.text.isVisible = true;
}
