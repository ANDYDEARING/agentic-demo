/**
 * scenes/battle/terrain.ts
 *
 * Visual terrain rendering for the battle grid.
 * Uses pure terrain generation from /src/battle/terrain.ts.
 */

import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
} from "@babylonjs/core";
import { TILE_SIZE, TILE_GAP, TERRAIN_COLOR } from "../../config";
import { rgbToColor3 } from "../../utils";

// Import pure terrain generation from battle logic layer
import { generateTerrainPositions } from "../../battle/terrain";

// Re-export for backwards compatibility
export { generateTerrainPositions };

/** Set of terrain tile keys ("x,z" format) for collision checking */
export type TerrainSet = Set<string>;

/** Interface for terrain generation result */
export interface TerrainResult {
  terrainTiles: TerrainSet;
  meshes: Mesh[];
}

/**
 * Create terrain meshes and return the terrain set for collision detection.
 */
export function createTerrain(
  scene: Scene,
  gridOffset: number
): TerrainResult {
  const terrainTiles: TerrainSet = new Set();
  const meshes: Mesh[] = [];

  // Generate positions
  const positions = generateTerrainPositions();

  // Create material
  const terrainMaterial = new StandardMaterial("terrainMat", scene);
  terrainMaterial.diffuseColor = rgbToColor3(TERRAIN_COLOR);
  terrainMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

  const tileTopY = 0.05; // Top surface of tiles
  const terrainHeight = TILE_SIZE - TILE_GAP;

  // Create meshes
  for (const { x, z } of positions) {
    terrainTiles.add(`${x},${z}`);

    const cube = MeshBuilder.CreateBox(
      `terrain_${x}_${z}`,
      {
        width: TILE_SIZE - TILE_GAP,
        height: terrainHeight,
        depth: TILE_SIZE - TILE_GAP,
      },
      scene
    );
    cube.position = new Vector3(
      x * TILE_SIZE - gridOffset,
      tileTopY + terrainHeight / 2,
      z * TILE_SIZE - gridOffset
    );
    cube.material = terrainMaterial;
    cube.metadata = { type: "terrain", gridX: x, gridZ: z };
    meshes.push(cube);
  }

  return { terrainTiles, meshes };
}

/** Check if a tile has terrain */
export function hasTerrain(terrainTiles: TerrainSet, x: number, z: number): boolean {
  return terrainTiles.has(`${x},${z}`);
}
