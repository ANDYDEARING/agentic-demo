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

// Reusable temp unit to avoid object allocation in hot loops
const tempUnit: UnitState = {
  id: "", unitClass: "soldier", team: "player1", gridX: 0, gridZ: 0,
  hp: 0, maxHp: 0, attack: 0, healAmount: 0, moveRange: 0, weapon: "pistol",
  speed: 0, speedBonus: 0, accumulator: 0, loadoutIndex: 0,
  isConcealed: false, isCovering: false, coveredTiles: [], actionsUsed: 0,
};

// Reusable maps to avoid allocation per turn
const pendingDamageMap = new Map<string, number>();
const pendingHealingMap = new Map<string, number>();
const pendingKillSet = new Set<string>();

function copyToTempUnit(unit: UnitState, x: number, z: number): UnitState {
  tempUnit.id = unit.id;
  tempUnit.unitClass = unit.unitClass;
  tempUnit.team = unit.team;
  tempUnit.gridX = x;
  tempUnit.gridZ = z;
  tempUnit.hp = unit.hp;
  tempUnit.maxHp = unit.maxHp;
  tempUnit.attack = unit.attack;
  tempUnit.healAmount = unit.healAmount;
  tempUnit.moveRange = unit.moveRange;
  tempUnit.weapon = unit.weapon;
  tempUnit.speed = unit.speed;
  tempUnit.speedBonus = unit.speedBonus;
  tempUnit.accumulator = unit.accumulator;
  tempUnit.loadoutIndex = unit.loadoutIndex;
  tempUnit.isConcealed = unit.isConcealed;
  tempUnit.isCovering = unit.isCovering;
  tempUnit.coveredTiles = unit.coveredTiles;
  tempUnit.actionsUsed = unit.actionsUsed;
  return tempUnit;
}

/**
 * Synchronous AI decision making.
 * Returns all commands the AI wants to execute this turn.
 */
function getAICommands(state: BattleState, unit: UnitState): BattleCommand[] {
  const commands: BattleCommand[] = [];
  let actionsUsed = 0;
  const maxActions = ACTIONS_PER_TURN;

  // Reuse maps instead of allocating new ones
  pendingDamageMap.clear();
  pendingHealingMap.clear();

  // Create a working copy of unit position for planning
  let currentX = unit.gridX;
  let currentZ = unit.gridZ;
  let isConcealed = unit.isConcealed;
  let isCovering = unit.isCovering;

  // Pre-compute damage once
  const unitDamage = Math.round(unit.attack * WEAPON_DATA[unit.weapon].damageMultiplier);

  while (actionsUsed < maxActions) {
    const action = chooseBestAction(
      state,
      unit,
      currentX,
      currentZ,
      actionsUsed,
      maxActions,
      pendingDamageMap,
      pendingHealingMap,
      isConcealed,
      isCovering,
      unitDamage
    );

    if (!action) break;

    commands.push(action);
    actionsUsed++;

    // Update working state for next iteration
    if (action.type === "move") {
      currentX = action.targetX;
      currentZ = action.targetZ;
    } else if (action.type === "conceal") {
      isConcealed = true;
    } else if (action.type === "cover") {
      isCovering = true;
    } else if (action.type === "attack") {
      const current = pendingDamageMap.get(action.targetUnitId) || 0;
      pendingDamageMap.set(action.targetUnitId, current + unitDamage);
    } else if (action.type === "heal") {
      const current = pendingHealingMap.get(action.targetUnitId) || 0;
      pendingHealingMap.set(action.targetUnitId, current + unit.healAmount);
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
  pendingHealing: Map<string, number>,
  isConcealed: boolean,
  isCovering: boolean,
  unitDamage: number
): BattleCommand | null {
  const enemyTeam = unit.team === "player1" ? "player2" : "player1";
  const isMelee = isMeleeWeapon(unit.weapon);
  const actionsLeft = maxActions - actionsUsed;

  // Calculate pending kills - reuse set
  pendingKillSet.clear();
  for (const [enemyId, damage] of pendingDamage) {
    // Inline find for speed
    for (let i = 0; i < state.units.length; i++) {
      const u = state.units[i];
      if (u.id === enemyId && u.hp <= damage) {
        pendingKillSet.add(enemyId);
        break;
      }
    }
  }

  // Get enemies (excluding pending kills) - build inline to avoid extra filter
  const allEnemies: UnitState[] = [];
  for (let i = 0; i < state.units.length; i++) {
    const u = state.units[i];
    if (u.team === enemyTeam && u.hp > 0 && !pendingKillSet.has(u.id)) {
      allEnemies.push(u);
    }
  }

  // Use reusable temp unit instead of spread
  copyToTempUnit(unit, currentX, currentZ);
  const attackableEnemies = getAttackableEnemies(state, tempUnit);

  // Filter in-place style
  const enemies: UnitState[] = [];
  for (let i = 0; i < attackableEnemies.length; i++) {
    if (!pendingKillSet.has(attackableEnemies[i].id)) {
      enemies.push(attackableEnemies[i]);
    }
  }

  const moveTiles = getValidMoveTiles(state, tempUnit, undefined, undefined, pendingKillSet);

  // === 1. KILL CHECK ===
  const killCommand = findKillOpportunity(
    state, unit, actionsLeft, enemies, moveTiles, pendingDamage, unitDamage
  );
  if (killCommand) return killCommand;

  // === 2. CLASS ABILITY ===
  const abilityCommand = getClassAbility(
    state, unit, currentX, currentZ, enemies, moveTiles,
    actionsLeft, isConcealed, isCovering, pendingHealing
  );
  if (abilityCommand) return abilityCommand;

  // === 3. ATTACK if in range ===
  if (enemies.length > 0) {
    return { type: "attack", targetUnitId: selectAttackTarget(enemies).id };
  }

  // === 4. MOVE/POSITION ===
  return getMoveCommand(state, unit, moveTiles, allEnemies, isMelee);
}

function findKillOpportunity(
  state: BattleState,
  unit: UnitState,
  actionsLeft: number,
  enemies: UnitState[],
  moveTiles: { x: number; z: number }[],
  pendingDamage: Map<string, number>,
  unitDamage: number
): BattleCommand | null {
  // Check if we can kill an enemy in range
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const pending = pendingDamage.get(enemy.id) || 0;
    if (enemy.hp <= unitDamage + pending) {
      return { type: "attack", targetUnitId: enemy.id };
    }
  }

  // Check if we can move to kill
  if (actionsLeft >= 2) {
    for (let i = 0; i < moveTiles.length; i++) {
      const tile = moveTiles[i];
      copyToTempUnit(unit, tile.x, tile.z);
      const enemiesFromTile = getAttackableEnemies(state, tempUnit);

      for (let j = 0; j < enemiesFromTile.length; j++) {
        const enemy = enemiesFromTile[j];
        const pending = pendingDamage.get(enemy.id) || 0;
        if (enemy.hp <= unitDamage + pending) {
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
  actionsLeft: number,
  isConcealed: boolean,
  isCovering: boolean,
  pendingHealing: Map<string, number>
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
        if (actionsLeft >= 2 && canReachAttackPosition(state, unit, moveTiles)) {
          return null;
        }
        return { type: "cover" };
      }
      break;

    case "medic":
      return getMedicHealCommand(state, unit, currentX, currentZ, pendingHealing);
  }

  return null;
}

function getMedicHealCommand(
  state: BattleState,
  unit: UnitState,
  currentX: number,
  currentZ: number,
  pendingHealing: Map<string, number>
): BattleCommand | null {
  copyToTempUnit(unit, currentX, currentZ);
  const healable = getHealableAllies(state, tempUnit);

  // Filter out allies who would be at full HP after pending heals
  const needsHealing = healable.filter((ally) => {
    const pending = pendingHealing.get(ally.id) || 0;
    return ally.hp + pending < ally.maxHp;
  });

  if (needsHealing.length > 0) {
    // Prioritize lowest effective HP ratio (accounting for pending heals)
    needsHealing.sort((a, b) => {
      const aEffective = (a.hp + (pendingHealing.get(a.id) || 0)) / a.maxHp;
      const bEffective = (b.hp + (pendingHealing.get(b.id) || 0)) / b.maxHp;
      return aEffective - bEffective;
    });
    return { type: "heal", targetUnitId: needsHealing[0].id };
  }

  return null;
}

function canReachAttackPosition(
  state: BattleState,
  unit: UnitState,
  moveTiles: { x: number; z: number }[]
): boolean {
  for (let i = 0; i < moveTiles.length; i++) {
    const tile = moveTiles[i];
    copyToTempUnit(unit, tile.x, tile.z);
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
  moveTiles: { x: number; z: number }[],
  allEnemies: UnitState[],
  _isMelee: boolean
): BattleCommand | null {
  if (moveTiles.length === 0 || allEnemies.length === 0) return null;

  // Find tile that gets us closest to an enemy attack position
  let bestTile: { x: number; z: number } | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < moveTiles.length; i++) {
    const tile = moveTiles[i];
    copyToTempUnit(unit, tile.x, tile.z);
    const attackable = getAttackableEnemies(state, tempUnit);

    // Score: prioritize tiles where we can attack
    let score = attackable.length * 100;

    // Otherwise, get closer to nearest enemy
    if (attackable.length === 0) {
      let minDist = Infinity;
      for (let j = 0; j < allEnemies.length; j++) {
        const enemy = allEnemies[j];
        const dist = Math.abs(tile.x - enemy.gridX) + Math.abs(tile.z - enemy.gridZ);
        if (dist < minDist) minDist = dist;
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

    // Add unit ID to commands (mutate in place to avoid allocation)
    for (let i = 0; i < commands.length; i++) {
      (commands[i] as BattleCommand & { unitId: string }).unitId = currentUnit!.id;
    }

    // Execute commands
    executeCommands(state, commands as (BattleCommand & { unitId: string })[]);

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
