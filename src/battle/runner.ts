/**
 * battle/runner.ts
 *
 * Headless battle runner for simulation.
 * Runs complete battles synchronously without visuals.
 */

import type { BattleState, UnitState } from "./state";
import type { BattleCommand } from "./commands";
import type { UnitClass, Team, WeaponType } from "../types";
import { isMeleeWeapon, WEAPON_DATA, BOOST_BY_INDEX, CLASS_BASE_STATS } from "../config/balance";
import { createBattleState } from "./state";
import {
  getNextUnitByAccumulator,
  checkWinCondition,
  getValidMoveTiles,
  getAttackableEnemies,
  getHealableAllies,
} from "./rules";
import { executeCommands } from "./executor";
import { generateTerrainPositions, createTerrainSet } from "./terrain";
import {
  GRID_SIZE,
  PLAYER1_SPAWN_POSITIONS,
  PLAYER2_SPAWN_POSITIONS,
  ACTIONS_PER_TURN,
  SPEED_BONUS_PER_UNUSED_ACTION,
} from "../config/constants";

// =============================================================================
// LOADOUT TYPES
// =============================================================================

export interface UnitLoadout {
  unitClass: UnitClass;
  weapon: WeaponType;
  boost: number; // 0=HP, 1=ATK, 2=Speed
}

export interface BattleResult {
  winner: "player1" | "player2" | null;
  turnCount: number;
  p1Loadout: UnitLoadout[];
  p2Loadout: UnitLoadout[];
}

// =============================================================================
// RANDOM LOADOUT GENERATION
// =============================================================================

const ALL_CLASSES: UnitClass[] = ["soldier", "operator", "medic"];
const ALL_WEAPONS: WeaponType[] = ["sword", "pistol"];
const ALL_BOOSTS = [0, 1, 2];

export function generateRandomLoadout(): UnitLoadout[] {
  return [0, 1, 2].map(() => ({
    unitClass: ALL_CLASSES[Math.floor(Math.random() * ALL_CLASSES.length)],
    weapon: ALL_WEAPONS[Math.floor(Math.random() * ALL_WEAPONS.length)],
    boost: ALL_BOOSTS[Math.floor(Math.random() * ALL_BOOSTS.length)],
  }));
}

// =============================================================================
// UNIT CREATION
// =============================================================================

function createUnitFromLoadout(
  loadout: UnitLoadout,
  team: Team,
  loadoutIndex: number,
  spawnX: number,
  spawnZ: number
): UnitState {
  const baseStats = CLASS_BASE_STATS[loadout.unitClass];
  const boost = BOOST_BY_INDEX[loadout.boost];

  // Apply boost multipliers
  const hpMultiplier = boost.stat === "hp" ? 1 + boost.multiplier : 1;
  const attackMultiplier = boost.stat === "attack" ? 1 + boost.multiplier : 1;
  const speedMultiplier = boost.stat === "speed" ? 1 + boost.multiplier : 1;

  return {
    id: `${team}-${loadoutIndex}`,
    unitClass: loadout.unitClass,
    team,
    gridX: spawnX,
    gridZ: spawnZ,
    hp: Math.round(baseStats.hp * hpMultiplier),
    maxHp: Math.round(baseStats.hp * hpMultiplier),
    attack: Math.round(baseStats.attack * attackMultiplier),
    healAmount: baseStats.healAmount,
    moveRange: baseStats.moveRange,
    weapon: loadout.weapon,
    speed: baseStats.speed * speedMultiplier,
    speedBonus: 0,
    accumulator: 0,
    loadoutIndex,
    isConcealed: false,
    isCovering: false,
    coveredTiles: [],
    actionsUsed: 0,
  };
}

// =============================================================================
// AI DECISION MAKING (SYNCHRONOUS)
// =============================================================================

/**
 * Synchronous AI decision making.
 * Returns all commands the AI wants to execute this turn.
 */
function getAICommands(state: BattleState, unit: UnitState): BattleCommand[] {
  const commands: BattleCommand[] = [];
  let actionsUsed = 0;
  const maxActions = ACTIONS_PER_TURN;
  const pendingDamage = new Map<string, number>();

  // Create a working copy of unit position for planning
  let currentX = unit.gridX;
  let currentZ = unit.gridZ;
  let isConcealed = unit.isConcealed;
  let isCovering = unit.isCovering;

  while (actionsUsed < maxActions) {
    const action = chooseBestAction(
      state,
      unit,
      currentX,
      currentZ,
      actionsUsed,
      maxActions,
      pendingDamage,
      isConcealed,
      isCovering
    );

    if (!action) break;

    commands.push(action);
    actionsUsed++;

    // Update working state for next iteration
    if (action.type === "move") {
      currentX = action.targetX;
      currentZ = action.targetZ;
    }
    if (action.type === "conceal") {
      isConcealed = true;
    }
    if (action.type === "cover") {
      isCovering = true;
    }
    if (action.type === "attack") {
      const damage = Math.round(unit.attack * WEAPON_DATA[unit.weapon].damageMultiplier);
      const current = pendingDamage.get(action.targetUnitId) || 0;
      pendingDamage.set(action.targetUnitId, current + damage);
    }
  }

  return commands;
}

function chooseBestAction(
  state: BattleState,
  unit: UnitState,
  currentX: number,
  currentZ: number,
  actionsUsed: number,
  maxActions: number,
  pendingDamage: Map<string, number>,
  isConcealed: boolean,
  isCovering: boolean
): BattleCommand | null {
  const enemyTeam = unit.team === "player1" ? "player2" : "player1";
  const isMelee = isMeleeWeapon(unit.weapon);
  const actionsLeft = maxActions - actionsUsed;

  // Calculate pending kills
  const pendingKillIds = new Set<string>();
  for (const [enemyId, damage] of pendingDamage) {
    const enemy = state.units.find((u) => u.id === enemyId);
    if (enemy && enemy.hp <= damage) {
      pendingKillIds.add(enemyId);
    }
  }

  // Get enemies (excluding pending kills)
  const allEnemies = state.units.filter(
    (u) => u.team === enemyTeam && u.hp > 0 && !pendingKillIds.has(u.id)
  );

  // Create temp state with current position for queries
  const tempUnit = { ...unit, gridX: currentX, gridZ: currentZ };
  const enemies = getAttackableEnemies(state, tempUnit).filter(
    (e) => !pendingKillIds.has(e.id)
  );
  const moveTiles = getValidMoveTiles(
    state,
    tempUnit,
    undefined,
    undefined,
    pendingKillIds
  );

  // === 1. KILL CHECK ===
  const killCommand = findKillOpportunity(
    state,
    unit,
    currentX,
    currentZ,
    actionsLeft,
    enemies,
    moveTiles,
    allEnemies,
    pendingDamage
  );
  if (killCommand) return killCommand;

  // === 2. CLASS ABILITY ===
  const abilityCommand = getClassAbility(
    state,
    unit,
    currentX,
    currentZ,
    enemies,
    moveTiles,
    allEnemies,
    actionsLeft,
    isConcealed,
    isCovering
  );
  if (abilityCommand) return abilityCommand;

  // === 3. ATTACK if in range ===
  if (enemies.length > 0) {
    const target = selectAttackTarget(enemies);
    return { type: "attack", targetUnitId: target.id };
  }

  // === 4. MOVE/POSITION ===
  return getMoveCommand(state, unit, currentX, currentZ, moveTiles, allEnemies, isMelee);
}

function findKillOpportunity(
  state: BattleState,
  unit: UnitState,
  _currentX: number,
  _currentZ: number,
  actionsLeft: number,
  enemies: UnitState[],
  moveTiles: { x: number; z: number }[],
  _allEnemies: UnitState[],
  pendingDamage: Map<string, number>
): BattleCommand | null {
  const damage = Math.round(unit.attack * WEAPON_DATA[unit.weapon].damageMultiplier);

  // Check if we can kill an enemy in range
  for (const enemy of enemies) {
    const pending = pendingDamage.get(enemy.id) || 0;
    if (enemy.hp <= damage + pending) {
      return { type: "attack", targetUnitId: enemy.id };
    }
  }

  // Check if we can move to kill
  if (actionsLeft >= 2) {
    for (const tile of moveTiles) {
      const tempUnit = { ...unit, gridX: tile.x, gridZ: tile.z };
      const enemiesFromTile = getAttackableEnemies(state, tempUnit);

      for (const enemy of enemiesFromTile) {
        const pending = pendingDamage.get(enemy.id) || 0;
        if (enemy.hp <= damage + pending) {
          return { type: "move", targetX: tile.x, targetZ: tile.z };
        }
      }
    }
  }

  return null;
}

function getClassAbility(
  state: BattleState,
  unit: UnitState,
  currentX: number,
  currentZ: number,
  enemies: UnitState[],
  moveTiles: { x: number; z: number }[],
  allEnemies: UnitState[],
  actionsLeft: number,
  isConcealed: boolean,
  isCovering: boolean
): BattleCommand | null {
  switch (unit.unitClass) {
    case "operator":
      if (!isConcealed) {
        return { type: "conceal" };
      }
      break;

    case "soldier":
      if (!isCovering) {
        if (enemies.length > 0) return null;
        if (actionsLeft >= 2 && canReachAttackPosition(state, unit, currentX, currentZ, moveTiles, allEnemies)) {
          return null;
        }
        return { type: "cover" };
      }
      break;

    case "medic":
      return getMedicHealCommand(state, unit, currentX, currentZ, actionsLeft);
  }

  return null;
}

function getMedicHealCommand(
  state: BattleState,
  unit: UnitState,
  currentX: number,
  currentZ: number,
  _actionsLeft: number
): BattleCommand | null {
  const tempUnit = { ...unit, gridX: currentX, gridZ: currentZ };
  const healable = getHealableAllies(state, tempUnit);

  if (healable.length > 0) {
    // Prioritize lowest HP ally
    healable.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    return { type: "heal", targetUnitId: healable[0].id };
  }

  return null;
}

function canReachAttackPosition(
  state: BattleState,
  unit: UnitState,
  _currentX: number,
  _currentZ: number,
  moveTiles: { x: number; z: number }[],
  _allEnemies: UnitState[]
): boolean {
  for (const tile of moveTiles) {
    const tempUnit = { ...unit, gridX: tile.x, gridZ: tile.z };
    if (getAttackableEnemies(state, tempUnit).length > 0) {
      return true;
    }
  }
  return false;
}

function selectAttackTarget(enemies: UnitState[]): UnitState {
  // Prioritize lowest HP enemy
  return enemies.reduce((a, b) => (a.hp < b.hp ? a : b));
}

function getMoveCommand(
  state: BattleState,
  unit: UnitState,
  _currentX: number,
  _currentZ: number,
  moveTiles: { x: number; z: number }[],
  allEnemies: UnitState[],
  _isMelee: boolean
): BattleCommand | null {
  if (moveTiles.length === 0 || allEnemies.length === 0) return null;

  // Find tile that gets us closest to an enemy attack position
  let bestTile: { x: number; z: number } | null = null;
  let bestScore = -Infinity;

  for (const tile of moveTiles) {
    const tempUnit = { ...unit, gridX: tile.x, gridZ: tile.z };
    const attackable = getAttackableEnemies(state, tempUnit);

    // Score: prioritize tiles where we can attack
    let score = attackable.length * 100;

    // Otherwise, get closer to nearest enemy
    if (attackable.length === 0) {
      let minDist = Infinity;
      for (const enemy of allEnemies) {
        const dist = Math.abs(tile.x - enemy.gridX) + Math.abs(tile.z - enemy.gridZ);
        minDist = Math.min(minDist, dist);
      }
      score = -minDist; // Negative so closer is better
    }

    if (score > bestScore) {
      bestScore = score;
      bestTile = tile;
    }
  }

  if (bestTile) {
    return { type: "move", targetX: bestTile.x, targetZ: bestTile.z };
  }

  return null;
}

// =============================================================================
// BATTLE RUNNER
// =============================================================================

const MAX_TURNS = 100; // Prevent infinite loops

export function runBattle(
  p1Loadout: UnitLoadout[],
  p2Loadout: UnitLoadout[]
): BattleResult {
  // Initialize state
  const state = createBattleState(GRID_SIZE);

  // Generate and set terrain
  const terrainPositions = generateTerrainPositions();
  state.terrain = createTerrainSet(terrainPositions);

  // Create units
  const p1Spawns = PLAYER1_SPAWN_POSITIONS;
  const p2Spawns = PLAYER2_SPAWN_POSITIONS;

  for (let i = 0; i < 3; i++) {
    state.units.push(
      createUnitFromLoadout(p1Loadout[i], "player1", i, p1Spawns[i].x, p1Spawns[i].z)
    );
    state.units.push(
      createUnitFromLoadout(p2Loadout[i], "player2", i, p2Spawns[i].x, p2Spawns[i].z)
    );
  }

  // Build first round queue (alternating teams)
  const firstRoundQueue: UnitState[] = [];
  for (let i = 0; i < 3; i++) {
    const p1Unit = state.units.find((u) => u.id === `player1-${i}`);
    const p2Unit = state.units.find((u) => u.id === `player2-${i}`);
    if (p1Unit) firstRoundQueue.push(p1Unit);
    if (p2Unit) firstRoundQueue.push(p2Unit);
  }

  let turnCount = 0;
  let isFirstRound = true;
  let firstRoundIndex = 0;

  // Game loop
  while (turnCount < MAX_TURNS) {
    // Check win condition
    const winStatus = checkWinCondition(state);
    if (winStatus.isOver) {
      return {
        winner: winStatus.winner,
        turnCount,
        p1Loadout,
        p2Loadout,
      };
    }

    // Get next unit
    let currentUnit: UnitState | null = null;

    if (isFirstRound && firstRoundIndex < firstRoundQueue.length) {
      currentUnit = firstRoundQueue[firstRoundIndex];
      // Skip dead units
      while (currentUnit && currentUnit.hp <= 0 && firstRoundIndex < firstRoundQueue.length) {
        firstRoundIndex++;
        currentUnit = firstRoundQueue[firstRoundIndex] || null;
      }
      if (firstRoundIndex >= firstRoundQueue.length) {
        isFirstRound = false;
      }
    }

    if (!isFirstRound || !currentUnit) {
      isFirstRound = false;
      currentUnit = getNextUnitByAccumulator(state);
    }

    if (!currentUnit) {
      // No units left
      break;
    }

    // Clear cover from previous turn
    currentUnit.isCovering = false;
    currentUnit.coveredTiles = [];

    // Reset accumulator
    currentUnit.accumulator = 0;

    // Get AI commands
    const commands = getAICommands(state, currentUnit);

    // Add unit ID to commands
    const commandsWithUnit = commands.map((cmd) => ({
      ...cmd,
      unitId: currentUnit!.id,
    }));

    // Execute commands
    executeCommands(state, commandsWithUnit);

    // Apply speed bonus for unused actions
    const actionsUsed = commands.length;
    const unusedActions = ACTIONS_PER_TURN - actionsUsed;
    if (unusedActions > 0) {
      currentUnit.speedBonus = unusedActions * SPEED_BONUS_PER_UNUSED_ACTION;
    } else {
      currentUnit.speedBonus = 0;
    }

    // Advance first round index
    if (isFirstRound) {
      firstRoundIndex++;
      if (firstRoundIndex >= firstRoundQueue.length) {
        isFirstRound = false;
      }
    }

    turnCount++;
  }

  // Timeout - determine winner by remaining HP
  const p1Hp = state.units
    .filter((u) => u.team === "player1" && u.hp > 0)
    .reduce((sum, u) => sum + u.hp, 0);
  const p2Hp = state.units
    .filter((u) => u.team === "player2" && u.hp > 0)
    .reduce((sum, u) => sum + u.hp, 0);

  return {
    winner: p1Hp > p2Hp ? "player1" : p2Hp > p1Hp ? "player2" : null,
    turnCount,
    p1Loadout,
    p2Loadout,
  };
}
