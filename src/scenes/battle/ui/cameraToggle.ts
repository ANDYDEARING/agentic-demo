/**
 * battle/ui/cameraToggle.ts
 *
 * Camera mode toggle button (compass icon).
 * Switches between rotate and pan modes.
 */

import { AdvancedDynamicTexture, Button, Control, TextBlock } from "@babylonjs/gui";
import { ArcRotateCamera } from "@babylonjs/core";
import type { CameraMode } from "../camera";

// =============================================================================
// TYPES
// =============================================================================

export interface CameraToggleState {
  button: Button;
  icon: TextBlock;
  mode: CameraMode;
}

// =============================================================================
// CREATION
// =============================================================================

/**
 * Create the camera mode toggle button.
 */
export function createCameraToggle(
  gui: AdvancedDynamicTexture
): CameraToggleState {
  const button = Button.CreateSimpleButton("compassBtn", "");
  button.width = "44px";
  button.height = "44px";
  button.background = "rgba(40, 40, 50, 0.9)";
  button.cornerRadius = 22;
  button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  button.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  button.left = "-15px";
  button.top = "15px";
  button.thickness = 2;
  button.color = "#666666";
  button.zIndex = 50;
  button.isPointerBlocker = true;

  const icon = new TextBlock("compassIcon", "✥");
  icon.fontSize = 20;
  icon.color = "#888888";
  icon.isHitTestVisible = false;
  button.addControl(icon);

  gui.addControl(button);

  return {
    button,
    icon,
    mode: "rotate",
  };
}

// =============================================================================
// MODE CONTROL
// =============================================================================

/**
 * Update camera mode button appearance.
 */
export function updateCameraModeButton(
  state: CameraToggleState,
  camera: ArcRotateCamera
): void {
  if (state.mode === "rotate") {
    // Gray when inactive (rotate mode)
    state.button.background = "rgba(40, 40, 50, 0.9)";
    state.button.color = "#666666";
    state.icon.color = "#888888";
    camera.attachControl(true);
  } else {
    // Yellow when active (pan mode)
    state.button.background = "rgba(60, 50, 20, 0.9)";
    state.button.color = "#ffcc44";
    state.icon.color = "#ffcc44";
    camera.detachControl();
  }
}

/**
 * Toggle camera mode between rotate and pan.
 */
export function toggleCameraMode(
  state: CameraToggleState,
  camera: ArcRotateCamera
): void {
  state.mode = state.mode === "rotate" ? "pan" : "rotate";
  updateCameraModeButton(state, camera);
}

/**
 * Get current camera mode.
 */
export function getCameraMode(state: CameraToggleState): CameraMode {
  return state.mode;
}
