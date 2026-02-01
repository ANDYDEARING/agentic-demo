/**
 * battle/camera.ts
 *
 * Camera system for battle scene.
 * Includes dramatic camera transitions and pan/rotate mode toggle.
 */

import {
  Vector3,
  ArcRotateCamera,
} from "@babylonjs/core";
import type { Scene } from "@babylonjs/core";
import {
  TILE_SIZE,
  GRID_SIZE,
  BATTLE_CAMERA_ALPHA,
  BATTLE_CAMERA_BETA,
  BATTLE_CAMERA_RADIUS,
  BATTLE_CAMERA_LOWER_RADIUS_LIMIT,
  BATTLE_CAMERA_UPPER_RADIUS_LIMIT,
  DRAMATIC_CAMERA_BETA,
  DRAMATIC_CAMERA_RADIUS,
  DRAMATIC_CAMERA_TARGET_HEIGHT,
  DRAMATIC_CAMERA_TRANSITION_IN_MS,
  DRAMATIC_CAMERA_TRANSITION_OUT_MS,
} from "../../config";

// =============================================================================
// TYPES
// =============================================================================

export type CameraMode = "rotate" | "pan";

export interface SavedCameraState {
  position: Vector3;
  target: Vector3;
  lowerRadiusLimit: number;
  upperRadiusLimit: number;
}

export interface DramaticCameraState {
  savedCameraState: SavedCameraState | null;
  isDramaticCamera: boolean;
  animationId: number | null;
  currentTargetKey: string | null;
}

// =============================================================================
// CAMERA SETUP
// =============================================================================

/**
 * Create and configure the battle camera.
 * Returns an ArcRotateCamera set to isometric view.
 */
export function createBattleCamera(scene: Scene): ArcRotateCamera {
  const gridOffset = (GRID_SIZE * TILE_SIZE) / 2 - TILE_SIZE / 2;
  const center = new Vector3(0, 0, 0);

  const camera = new ArcRotateCamera(
    "battleCamera",
    BATTLE_CAMERA_ALPHA,
    BATTLE_CAMERA_BETA,
    BATTLE_CAMERA_RADIUS,
    center,
    scene
  );

  camera.target = new Vector3(-gridOffset / 3, 0, -gridOffset / 3);
  camera.lowerRadiusLimit = BATTLE_CAMERA_LOWER_RADIUS_LIMIT;
  camera.upperRadiusLimit = BATTLE_CAMERA_UPPER_RADIUS_LIMIT;
  camera.panningSensibility = 100;

  return camera;
}

// =============================================================================
// DRAMATIC CAMERA SYSTEM
// =============================================================================

/**
 * Create initial dramatic camera state.
 */
export function createDramaticCameraState(): DramaticCameraState {
  return {
    savedCameraState: null,
    isDramaticCamera: false,
    animationId: null,
    currentTargetKey: null,
  };
}

/**
 * Transition camera to dramatic over-the-shoulder view.
 * Used for attacks and abilities.
 *
 * @param camera - The arc rotate camera
 * @param state - The dramatic camera state to update
 * @param attackerX - Attacker grid X
 * @param attackerZ - Attacker grid Z
 * @param targetX - Target grid X
 * @param targetZ - Target grid Z
 * @param gridOffset - Grid offset for world position
 * @returns Promise that resolves when transition completes
 */
export function transitionToDramaticCamera(
  camera: ArcRotateCamera,
  state: DramaticCameraState,
  attackerX: number,
  attackerZ: number,
  targetX: number,
  targetZ: number,
  gridOffset: number
): Promise<void> {
  return new Promise((resolve) => {
    // Check if already focused on this target
    const targetKey = `${attackerX},${attackerZ}->${targetX},${targetZ}`;
    if (state.currentTargetKey === targetKey) {
      // Cancel any ongoing out-transition and stay put
      if (state.animationId !== null) {
        cancelAnimationFrame(state.animationId);
        state.animationId = null;
      }
      state.isDramaticCamera = true;
      resolve();
      return;
    }

    // Cancel any ongoing animation
    if (state.animationId !== null) {
      cancelAnimationFrame(state.animationId);
      state.animationId = null;
    }

    // Save camera state if not already in dramatic mode
    if (!state.isDramaticCamera) {
      state.savedCameraState = {
        position: camera.position.clone(),
        target: camera.target.clone(),
        lowerRadiusLimit: camera.lowerRadiusLimit ?? 1,
        upperRadiusLimit: camera.upperRadiusLimit ?? 100,
      };
    }

    // Disable player controls
    camera.detachControl();
    state.isDramaticCamera = true;
    state.currentTargetKey = targetKey;

    // Remove camera limits for dramatic zoom
    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 100;

    // Kill inertia
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;

    // Calculate world positions
    const attackerWorldX = attackerX * TILE_SIZE - gridOffset;
    const attackerWorldZ = attackerZ * TILE_SIZE - gridOffset;
    const targetWorldX = targetX * TILE_SIZE - gridOffset;
    const targetWorldZ = targetZ * TILE_SIZE - gridOffset;

    const isSelfTarget = attackerX === targetX && attackerZ === targetZ;

    // Camera looks at target at chest height
    const finalTarget = new Vector3(
      targetWorldX,
      DRAMATIC_CAMERA_TARGET_HEIGHT,
      targetWorldZ
    );

    // Calculate camera position
    const camHeight = DRAMATIC_CAMERA_RADIUS * Math.cos(DRAMATIC_CAMERA_BETA);
    const camHorizDist = DRAMATIC_CAMERA_RADIUS * Math.sin(DRAMATIC_CAMERA_BETA);

    let finalCamPos: Vector3;

    if (isSelfTarget) {
      // Self-targeting: use current camera angle
      const angle = camera.alpha;
      finalCamPos = new Vector3(
        targetWorldX + Math.sin(angle) * camHorizDist,
        finalTarget.y + camHeight,
        targetWorldZ + Math.cos(angle) * camHorizDist
      );
    } else {
      // Normal attack: position behind attacker
      const atkDirX = targetWorldX - attackerWorldX;
      const atkDirZ = targetWorldZ - attackerWorldZ;
      const dist = Math.sqrt(atkDirX * atkDirX + atkDirZ * atkDirZ);
      const normX = dist > 0 ? atkDirX / dist : 0;
      const normZ = dist > 0 ? atkDirZ / dist : 1;

      finalCamPos = new Vector3(
        attackerWorldX - normX * camHorizDist,
        finalTarget.y + camHeight,
        attackerWorldZ - normZ * camHorizDist
      );
    }

    // Starting positions
    const startCamPos = camera.position.clone();
    const startTarget = camera.target.clone();

    // Animate transition
    const startTime = performance.now();

    function animateFrame(): void {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / DRAMATIC_CAMERA_TRANSITION_IN_MS, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);

      // Clear inertia every frame
      camera.inertialAlphaOffset = 0;
      camera.inertialBetaOffset = 0;
      camera.inertialRadiusOffset = 0;

      // Interpolate positions
      const newCamPos = Vector3.Lerp(startCamPos, finalCamPos, eased);
      const newTarget = Vector3.Lerp(startTarget, finalTarget, eased);

      camera.target = newTarget;
      camera.setPosition(newCamPos);

      if (t < 1) {
        state.animationId = requestAnimationFrame(animateFrame);
      } else {
        state.animationId = null;
        resolve();
      }
    }

    state.animationId = requestAnimationFrame(animateFrame);
  });
}

/**
 * Transition camera back to saved state.
 *
 * @param camera - The arc rotate camera
 * @param state - The dramatic camera state to update
 * @param cameraMode - Current camera mode (for re-attaching controls)
 * @returns Promise that resolves when transition completes
 */
export function transitionFromDramaticCamera(
  camera: ArcRotateCamera,
  state: DramaticCameraState,
  cameraMode: CameraMode
): Promise<void> {
  return new Promise((resolve) => {
    if (!state.savedCameraState) {
      state.isDramaticCamera = false;
      state.currentTargetKey = null;
      resolve();
      return;
    }

    const startTime = performance.now();
    const startCamPos = camera.position.clone();
    const startTarget = camera.target.clone();

    const endCamPos = state.savedCameraState.position;
    const endTarget = state.savedCameraState.target;

    function animateFrame(): void {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / DRAMATIC_CAMERA_TRANSITION_OUT_MS, 1);
      // Ease in-out cubic
      const eased =
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // Clear inertia
      camera.inertialAlphaOffset = 0;
      camera.inertialBetaOffset = 0;
      camera.inertialRadiusOffset = 0;

      // Interpolate positions
      const newCamPos = Vector3.Lerp(startCamPos, endCamPos, eased);
      const newTarget = Vector3.Lerp(startTarget, endTarget, eased);

      camera.target = newTarget;
      camera.setPosition(newCamPos);

      if (t < 1) {
        state.animationId = requestAnimationFrame(animateFrame);
      } else {
        state.animationId = null;
        state.isDramaticCamera = false;
        state.currentTargetKey = null;

        // Restore camera limits
        const savedLowerLimit =
          state.savedCameraState?.lowerRadiusLimit ??
          BATTLE_CAMERA_LOWER_RADIUS_LIMIT;
        const savedUpperLimit =
          state.savedCameraState?.upperRadiusLimit ??
          BATTLE_CAMERA_UPPER_RADIUS_LIMIT;
        camera.lowerRadiusLimit = savedLowerLimit;
        camera.upperRadiusLimit = savedUpperLimit;
        state.savedCameraState = null;

        // Re-enable controls if in rotate mode
        if (cameraMode === "rotate") {
          camera.attachControl(true);
        }

        resolve();
      }
    }

    state.animationId = requestAnimationFrame(animateFrame);
  });
}

// =============================================================================
// PAN MODE HELPERS
// =============================================================================

/**
 * Handle panning movement.
 * Call this during pointer move when in pan mode.
 */
export function handlePanMovement(
  camera: ArcRotateCamera,
  deltaX: number,
  deltaY: number
): void {
  const panSpeed = 0.05;
  const cosAlpha = Math.cos(camera.alpha);
  const sinAlpha = Math.sin(camera.alpha);

  // Move camera target (drag direction matches movement)
  camera.target.x += (deltaX * cosAlpha + deltaY * sinAlpha) * panSpeed;
  camera.target.z += (-deltaX * sinAlpha + deltaY * cosAlpha) * panSpeed;
}

/**
 * Handle pinch-to-zoom.
 * Call this during touch move with 2 fingers.
 */
export function handlePinchZoom(
  camera: ArcRotateCamera,
  initialDistance: number,
  currentDistance: number,
  initialRadius: number
): void {
  const scale = initialDistance / currentDistance;
  let newRadius = initialRadius * scale;

  // Clamp to limits
  newRadius = Math.max(
    camera.lowerRadiusLimit || 5,
    Math.min(camera.upperRadiusLimit || 50, newRadius)
  );
  camera.radius = newRadius;
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Clean up dramatic camera state.
 * Call this on scene dispose.
 */
export function cleanupDramaticCamera(state: DramaticCameraState): void {
  if (state.animationId !== null) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
}
