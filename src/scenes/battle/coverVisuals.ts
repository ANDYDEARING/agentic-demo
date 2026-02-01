/**
 * battle/coverVisuals.ts
 *
 * Cover ability visualization system.
 * Handles cover tile borders, preview, and hazard stripes for dual-covered tiles.
 */

import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
} from "@babylonjs/core";
import type { Unit } from "../../types";
import { TILE_SIZE, TILE_GAP, COVER_ACTIVE_ALPHA } from "../../config";

// =============================================================================
// TYPES
// =============================================================================

export interface CoverVisualsState {
  /** Map of unit -> array of cover border meshes */
  meshesByUnit: Map<Unit, Mesh[]>;
  /** Map of "x,z" -> array of units covering that tile */
  coveredTiles: Map<string, Unit[]>;
  /** Preview meshes for pending cover action */
  previewMeshes: Mesh[];
  /** Hazard stripe meshes for dual-covered tiles */
  hazardMeshes: Mesh[];
}

// =============================================================================
// STATE CREATION
// =============================================================================

/**
 * Create initial cover visuals state.
 */
export function createCoverVisualsState(): CoverVisualsState {
  return {
    meshesByUnit: new Map(),
    coveredTiles: new Map(),
    previewMeshes: [],
    hazardMeshes: [],
  };
}

// =============================================================================
// COVER TILES TRACKING
// =============================================================================

/**
 * Register tiles as covered by a unit.
 */
export function setCoverTiles(
  state: CoverVisualsState,
  unit: Unit,
  tiles: { x: number; z: number }[]
): void {
  // Store as "x,z" keys on the unit
  const keys = tiles.map((t) => `${t.x},${t.z}`);

  // Update the covered tiles map
  for (const key of keys) {
    const existing = state.coveredTiles.get(key) || [];
    if (!existing.includes(unit)) {
      existing.push(unit);
      state.coveredTiles.set(key, existing);
    }
  }
}

/**
 * Clear cover tiles for a specific unit.
 */
export function clearCoverTilesForUnit(
  state: CoverVisualsState,
  unit: Unit
): void {
  // Remove unit from all tile entries
  for (const [key, units] of state.coveredTiles.entries()) {
    const index = units.indexOf(unit);
    if (index > -1) {
      units.splice(index, 1);
      if (units.length === 0) {
        state.coveredTiles.delete(key);
      }
    }
  }
}

/**
 * Get the units covering a tile.
 */
export function getUnitsCoveringTile(
  state: CoverVisualsState,
  x: number,
  z: number
): Unit[] {
  return state.coveredTiles.get(`${x},${z}`) || [];
}

/**
 * Check if a tile is covered by an enemy of the given unit.
 */
export function isTileCoveredByEnemy(
  state: CoverVisualsState,
  x: number,
  z: number,
  forUnit: Unit
): Unit | null {
  const coveringUnits = getUnitsCoveringTile(state, x, z);
  for (const u of coveringUnits) {
    if (u.team !== forUnit.team && u.hp > 0 && u.isCovering) {
      return u;
    }
  }
  return null;
}

// =============================================================================
// COVER VISUALIZATION
// =============================================================================

/**
 * Create corner border markers for a covered tile.
 */
export function createCoverBorder(
  state: CoverVisualsState,
  unit: Unit,
  tileX: number,
  tileZ: number,
  color: Color3,
  gridOffset: number,
  scene: Scene
): void {
  const cornerSize = 0.12;
  const cornerThickness = 0.05;
  const cornerHeight = 0.08;
  const tileHalf = (TILE_SIZE - TILE_GAP) / 2;

  const worldX = tileX * TILE_SIZE - gridOffset;
  const worldZ = tileZ * TILE_SIZE - gridOffset;

  const cornerMat = new StandardMaterial(
    `coverCornerMat_${unit.team}_${tileX}_${tileZ}`,
    scene
  );
  cornerMat.diffuseColor = color;
  cornerMat.emissiveColor = color.scale(COVER_ACTIVE_ALPHA);
  cornerMat.alpha = COVER_ACTIVE_ALPHA;

  // Get or create mesh array for this unit
  if (!state.meshesByUnit.has(unit)) {
    state.meshesByUnit.set(unit, []);
  }
  const unitMeshes = state.meshesByUnit.get(unit)!;

  // Create L-shaped corner markers at each corner
  const corners = [
    { x: tileHalf, z: tileHalf }, // Top-right
    { x: -tileHalf, z: tileHalf }, // Top-left
    { x: tileHalf, z: -tileHalf }, // Bottom-right
    { x: -tileHalf, z: -tileHalf }, // Bottom-left
  ];

  for (const corner of corners) {
    // Horizontal part of L
    const hBox = MeshBuilder.CreateBox(
      `coverCornerH_${tileX}_${tileZ}`,
      {
        width: cornerSize,
        height: cornerHeight,
        depth: cornerThickness,
      },
      scene
    );
    hBox.material = cornerMat;
    hBox.position = new Vector3(
      worldX + corner.x - Math.sign(corner.x) * (cornerSize / 2),
      0.08,
      worldZ + corner.z
    );
    hBox.isPickable = false;
    unitMeshes.push(hBox);

    // Vertical part of L
    const vBox = MeshBuilder.CreateBox(
      `coverCornerV_${tileX}_${tileZ}`,
      {
        width: cornerThickness,
        height: cornerHeight,
        depth: cornerSize,
      },
      scene
    );
    vBox.material = cornerMat;
    vBox.position = new Vector3(
      worldX + corner.x,
      0.08,
      worldZ + corner.z - Math.sign(corner.z) * (cornerSize / 2)
    );
    vBox.isPickable = false;
    unitMeshes.push(vBox);
  }
}

/**
 * Clear cover visualization for a specific unit.
 */
export function clearCoverVisualizationForUnit(
  state: CoverVisualsState,
  unit: Unit
): void {
  const meshes = state.meshesByUnit.get(unit);
  if (meshes) {
    for (const mesh of meshes) {
      mesh.dispose();
    }
    state.meshesByUnit.delete(unit);
  }
}

/**
 * End cover for a unit - clears both tiles and visualization.
 */
export function endCover(state: CoverVisualsState, unit: Unit): void {
  unit.isCovering = false;
  clearCoverTilesForUnit(state, unit);
  clearCoverVisualizationForUnit(state, unit);
}

// =============================================================================
// COVER PREVIEW
// =============================================================================

/**
 * Show preview of cover tiles for pending cover action.
 */
export function showCoverPreview(
  state: CoverVisualsState,
  tiles: { x: number; z: number }[],
  color: Color3,
  gridOffset: number,
  scene: Scene
): void {
  clearCoverPreview(state);

  const previewMat = new StandardMaterial("coverPreviewMat", scene);
  previewMat.diffuseColor = color;
  previewMat.emissiveColor = color.scale(0.3);
  previewMat.alpha = 0.3;

  const tileHalf = (TILE_SIZE - TILE_GAP) / 2;
  const cornerSize = 0.1;
  const cornerThickness = 0.04;

  for (const { x, z } of tiles) {
    const worldX = x * TILE_SIZE - gridOffset;
    const worldZ = z * TILE_SIZE - gridOffset;

    // Create simple corner markers for preview
    const corners = [
      { x: tileHalf, z: tileHalf },
      { x: -tileHalf, z: tileHalf },
      { x: tileHalf, z: -tileHalf },
      { x: -tileHalf, z: -tileHalf },
    ];

    for (const corner of corners) {
      const hBox = MeshBuilder.CreateBox(`coverPreviewH_${x}_${z}`, {
        width: cornerSize,
        height: 0.06,
        depth: cornerThickness,
      }, scene);
      hBox.material = previewMat;
      hBox.position = new Vector3(
        worldX + corner.x - Math.sign(corner.x) * (cornerSize / 2),
        0.06,
        worldZ + corner.z
      );
      hBox.isPickable = false;
      state.previewMeshes.push(hBox);

      const vBox = MeshBuilder.CreateBox(`coverPreviewV_${x}_${z}`, {
        width: cornerThickness,
        height: 0.06,
        depth: cornerSize,
      }, scene);
      vBox.material = previewMat;
      vBox.position = new Vector3(
        worldX + corner.x,
        0.06,
        worldZ + corner.z - Math.sign(corner.z) * (cornerSize / 2)
      );
      vBox.isPickable = false;
      state.previewMeshes.push(vBox);
    }
  }
}

/**
 * Clear cover preview meshes.
 */
export function clearCoverPreview(state: CoverVisualsState): void {
  for (const mesh of state.previewMeshes) {
    mesh.dispose();
  }
  state.previewMeshes = [];
}

// =============================================================================
// HAZARD STRIPES (DUAL-COVERED TILES)
// =============================================================================

/**
 * Update hazard stripes for tiles covered by both teams.
 * These are dangerous tiles where entering triggers both covers.
 */
export function updateHazardStripes(
  state: CoverVisualsState,
  gridOffset: number,
  scene: Scene
): void {
  // Clear existing hazard meshes
  for (const mesh of state.hazardMeshes) {
    mesh.dispose();
  }
  state.hazardMeshes = [];

  // Find tiles covered by both teams
  for (const [key, units] of state.coveredTiles.entries()) {
    const aliveUnits = units.filter((u) => u.hp > 0 && u.isCovering);
    const teams = new Set(aliveUnits.map((u) => u.team));

    if (teams.size >= 2) {
      // This tile is covered by both teams - add hazard visual
      const [x, z] = key.split(",").map(Number);
      createHazardStripe(state, x, z, gridOffset, scene);
    }
  }
}

/**
 * Create hazard stripe visual for a dual-covered tile.
 */
function createHazardStripe(
  state: CoverVisualsState,
  tileX: number,
  tileZ: number,
  gridOffset: number,
  scene: Scene
): void {
  const hazardMat = new StandardMaterial(`hazardMat_${tileX}_${tileZ}`, scene);
  hazardMat.diffuseColor = new Color3(1.0, 0.8, 0.0);
  hazardMat.emissiveColor = new Color3(0.5, 0.4, 0.0);
  hazardMat.alpha = 0.5;

  const worldX = tileX * TILE_SIZE - gridOffset;
  const worldZ = tileZ * TILE_SIZE - gridOffset;

  // Create diagonal stripes
  const stripeCount = 3;
  const stripeWidth = 0.08;
  const stripeLength = (TILE_SIZE - TILE_GAP) * 0.8;

  for (let i = 0; i < stripeCount; i++) {
    const offset = (i - 1) * 0.2;

    const stripe = MeshBuilder.CreateBox(
      `hazardStripe_${tileX}_${tileZ}_${i}`,
      {
        width: stripeWidth,
        height: 0.02,
        depth: stripeLength,
      },
      scene
    );
    stripe.material = hazardMat;
    stripe.position = new Vector3(worldX + offset, 0.12, worldZ);
    stripe.rotation.y = Math.PI / 4; // 45 degree angle
    stripe.isPickable = false;
    state.hazardMeshes.push(stripe);
  }
}
