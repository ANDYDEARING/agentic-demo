/**
 * battle/terrain.ts
 *
 * Pure terrain generation for headless simulation.
 * Extracted from scenes/battle/terrain.ts - no Babylon.js dependencies.
 *
 * Algorithm:
 * 1. Build an edge-hugging corridor from bottom to top
 * 2. Connect each spawn point to the corridor via cardinal paths
 * 3. Place terrain only in unprotected tiles (middle of map)
 */

import {
  GRID_SIZE,
  TERRAIN_COUNT,
  PLAYER1_SPAWN_POSITIONS,
  PLAYER2_SPAWN_POSITIONS,
} from "../config/constants";

export type GridPosition = { x: number; z: number };

/**
 * Generate an edge-hugging corridor from bottom to top.
 * Routes along left or right edge with some variance, leaving middle open.
 */
function generateEdgeCorridor(gridSize: number): GridPosition[] {
  const path: GridPosition[] = [];

  // Pick which edge to favor (left or right)
  const favorLeft = Math.random() < 0.5;

  // Start position: on or near the chosen edge
  let x = favorLeft
    ? Math.floor(Math.random() * 2) // 0 or 1
    : gridSize - 1 - Math.floor(Math.random() * 2); // 6 or 7

  // Walk from z=0 to z=gridSize-1
  for (let z = 0; z < gridSize; z++) {
    path.push({ x, z });

    // Occasionally drift laterally (but stay near edge)
    if (z < gridSize - 1 && Math.random() < 0.3) {
      const driftTowardEdge = Math.random() < 0.6; // Bias toward edge
      if (driftTowardEdge) {
        // Move toward edge
        if (favorLeft && x > 0) x--;
        else if (!favorLeft && x < gridSize - 1) x++;
      } else {
        // Move away from edge (but not too far - stay in outer third)
        const maxDrift = Math.floor(gridSize / 3);
        if (favorLeft && x < maxDrift) x++;
        else if (!favorLeft && x > gridSize - 1 - maxDrift) x--;
      }
    }
  }

  return path;
}

/**
 * Find shortest cardinal path from start to any tile in the target set using BFS.
 * Only uses cardinal directions (no diagonals) since units can't move diagonally.
 */
function findCardinalPathToSet(
  startX: number,
  startZ: number,
  targetSet: Set<string>,
  gridSize: number
): GridPosition[] {
  const startKey = `${startX},${startZ}`;

  // BFS to find shortest cardinal path to any target tile
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const queue: [number, number][] = [[startX, startZ]];
  visited.add(startKey);
  parent.set(startKey, null);

  while (queue.length > 0) {
    const [cx, cz] = queue.shift()!;
    const currentKey = `${cx},${cz}`;

    // Check if we reached a target tile (but not the start itself)
    if (targetSet.has(currentKey) && currentKey !== startKey) {
      // Reconstruct path from start to this target
      const path: GridPosition[] = [];
      let key: string | null = currentKey;
      while (key) {
        const [px, pz] = key.split(",").map(Number);
        path.unshift({ x: px, z: pz });
        key = parent.get(key) || null;
      }
      return path;
    }

    // Explore cardinal neighbors only (no diagonals!)
    const cardinalDirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (const [dx, dz] of cardinalDirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      const key = `${nx},${nz}`;

      // Stay in bounds
      if (nx < 0 || nx >= gridSize || nz < 0 || nz >= gridSize) continue;
      // Don't revisit
      if (visited.has(key)) continue;

      visited.add(key);
      parent.set(key, currentKey);
      queue.push([nx, nz]);
    }
  }

  // No path found (shouldn't happen on open grid) - return just start
  return [{ x: startX, z: startZ }];
}

/**
 * Generate terrain positions using constructive algorithm.
 * Guarantees valid terrain on first try - no retries needed.
 */
export function generateTerrainPositions(
  gridSize: number = GRID_SIZE,
  terrainCount: number = TERRAIN_COUNT,
  spawnPositions: readonly GridPosition[] = [
    ...PLAYER1_SPAWN_POSITIONS,
    ...PLAYER2_SPAWN_POSITIONS,
  ]
): GridPosition[] {
  const protectedTiles = new Set<string>();

  // Step 1: Create main corridor along an edge (leaves middle open for terrain)
  const mainCorridor = generateEdgeCorridor(gridSize);

  // Add main corridor to protected set
  for (const tile of mainCorridor) {
    protectedTiles.add(`${tile.x},${tile.z}`);
  }

  // Step 2: Connect each spawn to the corridor via cardinal path
  for (const spawn of spawnPositions) {
    // Find cardinal path from spawn to nearest protected tile
    const pathToCorridor = findCardinalPathToSet(
      spawn.x,
      spawn.z,
      protectedTiles,
      gridSize
    );

    // Add entire path (including spawn) to protected tiles
    for (const tile of pathToCorridor) {
      protectedTiles.add(`${tile.x},${tile.z}`);
    }

    // Also protect the spawn itself (in case path didn't include it)
    protectedTiles.add(`${spawn.x},${spawn.z}`);
  }

  // Step 3: Verify each spawn has at least one cardinal exit
  for (const spawn of spawnPositions) {
    const cardinalNeighbors = [
      { x: spawn.x - 1, z: spawn.z },
      { x: spawn.x + 1, z: spawn.z },
      { x: spawn.x, z: spawn.z - 1 },
      { x: spawn.x, z: spawn.z + 1 },
    ].filter(
      (n) => n.x >= 0 && n.x < gridSize && n.z >= 0 && n.z < gridSize
    );

    const hasCardinalExit = cardinalNeighbors.some((n) =>
      protectedTiles.has(`${n.x},${n.z}`)
    );

    if (!hasCardinalExit && cardinalNeighbors.length > 0) {
      // Protect a random cardinal neighbor
      const randomNeighbor =
        cardinalNeighbors[Math.floor(Math.random() * cardinalNeighbors.length)];
      protectedTiles.add(`${randomNeighbor.x},${randomNeighbor.z}`);
    }
  }

  // Step 4: Collect eligible tiles for terrain (not protected)
  const eligibleTiles: GridPosition[] = [];
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      if (!protectedTiles.has(`${x},${z}`)) {
        eligibleTiles.push({ x, z });
      }
    }
  }

  // Step 5: Shuffle and select terrain tiles
  for (let i = eligibleTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligibleTiles[i], eligibleTiles[j]] = [eligibleTiles[j], eligibleTiles[i]];
  }

  const count = Math.min(terrainCount, eligibleTiles.length);
  return eligibleTiles.slice(0, count);
}

/**
 * Convert terrain positions to a Set of grid keys for collision checking.
 */
export function createTerrainSet(positions: GridPosition[]): Set<string> {
  const set = new Set<string>();
  for (const { x, z } of positions) {
    set.add(`${x},${z}`);
  }
  return set;
}
