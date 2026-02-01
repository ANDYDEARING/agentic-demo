/**
 * battle/highlights.ts
 *
 * Tile highlighting system for movement, attacks, and abilities.
 * Includes shadow preview and intent indicators.
 */

import {
  Scene,
  Vector3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  PBRMaterial,
} from "@babylonjs/core";
import type { Unit } from "../../types";
import {
  TILE_SIZE,
  BATTLE_MODEL_SCALE,
  BATTLE_MODEL_Y_POSITION,
} from "../../config";

// =============================================================================
// TYPES
// =============================================================================

export interface HighlightMaterials {
  validMove: StandardMaterial;
  attackTarget: StandardMaterial;
  healTarget: StandardMaterial;
  activeUnit: StandardMaterial;
}

export interface HighlightState {
  highlightedTiles: Mesh[];
  attackableUnits: Unit[];
  healableUnits: Unit[];
}

// =============================================================================
// MATERIAL CREATION
// =============================================================================

/**
 * Create materials for tile highlighting.
 */
export function createHighlightMaterials(scene: Scene): HighlightMaterials {
  const validMove = new StandardMaterial("validMoveMat", scene);
  validMove.diffuseColor = new Color3(0.2, 0.6, 1.0);
  validMove.alpha = 0.5;

  const attackTarget = new StandardMaterial("attackTargetMat", scene);
  attackTarget.diffuseColor = new Color3(1.0, 0.3, 0.3);
  attackTarget.alpha = 0.6;

  const healTarget = new StandardMaterial("healTargetMat", scene);
  healTarget.diffuseColor = new Color3(0.3, 1.0, 0.3);
  healTarget.alpha = 0.6;

  const activeUnit = new StandardMaterial("activeUnitMat", scene);
  activeUnit.diffuseColor = new Color3(1.0, 0.9, 0.3);
  activeUnit.alpha = 0.6;

  return { validMove, attackTarget, healTarget, activeUnit };
}

/**
 * Create initial highlight state.
 */
export function createHighlightState(): HighlightState {
  return {
    highlightedTiles: [],
    attackableUnits: [],
    healableUnits: [],
  };
}

// =============================================================================
// TILE HIGHLIGHTING
// =============================================================================

/**
 * Raise tile to highlighted position.
 */
export function raiseTile(tile: Mesh): void {
  tile.position.y = 0.1;
}

/**
 * Lower tile to default position.
 */
export function lowerTile(tile: Mesh): void {
  tile.position.y = 0.05;
}

/**
 * Clear all highlighted tiles.
 *
 * @param state - Highlight state to clear
 * @param getTileMaterial - Function to get the default material for a tile
 */
export function clearHighlights(
  state: HighlightState,
  getTileMaterial: (x: number, z: number) => StandardMaterial
): void {
  for (const tile of state.highlightedTiles) {
    const { gridX, gridZ } = tile.metadata;
    tile.material = getTileMaterial(gridX, gridZ);
    lowerTile(tile);
  }
  state.highlightedTiles = [];
  state.attackableUnits = [];
  state.healableUnits = [];
}

/**
 * Highlight a tile with a specific material.
 */
export function highlightTile(
  tile: Mesh,
  material: StandardMaterial,
  state: HighlightState
): void {
  tile.material = material;
  raiseTile(tile);
  if (!state.highlightedTiles.includes(tile)) {
    state.highlightedTiles.push(tile);
  }
}

// =============================================================================
// SHADOW PREVIEW
// =============================================================================

export interface ShadowPreviewState {
  mesh: Mesh | null;
  position: { x: number; z: number } | null;
}

/**
 * Create initial shadow preview state.
 */
export function createShadowPreviewState(): ShadowPreviewState {
  return {
    mesh: null,
    position: null,
  };
}

/**
 * Create shadow preview mesh at target position.
 */
export function createShadowPreview(
  unit: Unit,
  targetX: number,
  targetZ: number,
  gridOffset: number,
  state: ShadowPreviewState
): void {
  // Clear existing shadow
  if (state.mesh) {
    state.mesh.dispose();
    state.mesh = null;
  }

  if (!unit.modelRoot) return;

  // Clone the model hierarchy for the shadow
  const shadowRoot = unit.modelRoot.clone(
    `shadow_${unit.unitClass}_${targetX}_${targetZ}`,
    null
  );

  if (!shadowRoot) return;

  // Position at target
  shadowRoot.position = new Vector3(
    targetX * TILE_SIZE - gridOffset,
    BATTLE_MODEL_Y_POSITION,
    targetZ * TILE_SIZE - gridOffset
  );

  // Copy rotation
  shadowRoot.rotationQuaternion = null;
  shadowRoot.rotation.y = unit.modelRoot.rotation.y;

  // Copy scale
  shadowRoot.scaling = unit.modelRoot.scaling.clone();
  shadowRoot.setEnabled(true);

  // Make all child meshes semi-transparent and non-pickable
  shadowRoot.getChildMeshes().forEach((mesh) => {
    if (mesh.material) {
      const mat = mesh.material.clone(`shadow_${mesh.material.name}`);
      if (mat) {
        (mat as PBRMaterial | StandardMaterial).alpha = 0.3;
        mesh.material = mat;
      }
    }
    mesh.isPickable = false;
  });

  state.mesh = shadowRoot as Mesh;
  state.position = { x: targetX, z: targetZ };
}

/**
 * Clear shadow preview.
 */
export function clearShadowPreview(state: ShadowPreviewState): void {
  if (state.mesh) {
    state.mesh.dispose();
    state.mesh = null;
  }
  state.position = null;
}

// =============================================================================
// INTENT INDICATORS
// =============================================================================

export interface IntentIndicatorState {
  indicators: Mesh[];
}

/**
 * Create initial intent indicator state.
 */
export function createIntentIndicatorState(): IntentIndicatorState {
  return { indicators: [] };
}

/**
 * Clear all intent indicators.
 */
export function clearIntentIndicators(state: IntentIndicatorState): void {
  for (const indicator of state.indicators) {
    indicator.dispose();
  }
  state.indicators = [];
}

/**
 * Create an intent indicator above a unit.
 *
 * @param targetUnit - The unit being targeted
 * @param color - Color of the indicator (red for attack, green for heal, blue for self)
 * @param scene - The scene
 * @param state - Intent indicator state
 * @param gridOffset - Grid offset for positioning
 */
export function createIntentIndicator(
  targetUnit: Unit,
  color: Color3,
  scene: Scene,
  state: IntentIndicatorState,
  gridOffset: number
): void {
  // Create a small sphere above the target
  const indicator = MeshBuilder.CreateSphere(
    `intent_${targetUnit.team}_${targetUnit.loadoutIndex}`,
    { diameter: 0.15 },
    scene
  );

  const mat = new StandardMaterial(`intentMat_${targetUnit.loadoutIndex}`, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = color.scale(0.5);
  indicator.material = mat;

  // Position above the unit
  indicator.position = new Vector3(
    targetUnit.gridX * TILE_SIZE - gridOffset,
    BATTLE_MODEL_SCALE * 2 + 0.3,
    targetUnit.gridZ * TILE_SIZE - gridOffset
  );

  indicator.isPickable = false;
  state.indicators.push(indicator);
}

// =============================================================================
// ATTACK PREVIEW (during move hover)
// =============================================================================

export interface AttackPreviewState {
  tiles: Mesh[];
}

/**
 * Create initial attack preview state.
 */
export function createAttackPreviewState(): AttackPreviewState {
  return { tiles: [] };
}

/**
 * Clear attack preview tiles.
 */
export function clearAttackPreview(
  state: AttackPreviewState,
  highlightState: HighlightState,
  getTileMaterial: (x: number, z: number) => StandardMaterial
): void {
  for (const tile of state.tiles) {
    const { gridX, gridZ } = tile.metadata;
    // Only reset if not part of main highlights
    if (!highlightState.highlightedTiles.includes(tile)) {
      tile.material = getTileMaterial(gridX, gridZ);
    }
  }
  state.tiles = [];
}
