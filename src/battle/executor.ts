/**
 * battle/executor.ts
 *
 * Pure command executor for headless simulation.
 * Executes commands on BattleState without visual effects.
 */

import type { BattleState, UnitState } from "./state";
import type { BattleCommand } from "./commands";
import { toGridKey, getUnit } from "./state";
import {
  calculateDamage,
  applyDamage,
  applyHealing,
  getCoverTiles,
  getEnemyCoveringTile,
} from "./rules";

/** Command with unit ID attached for execution */
export type CommandWithUnit = BattleCommand & { unitId: string };

// =============================================================================
// EXECUTION RESULT TYPES
// =============================================================================

export interface ActionResult {
  type: "move" | "attack" | "heal" | "conceal" | "cover";
  success: boolean;
  unitId: string;
  targetId?: string;
  damage?: number;
  healing?: number;
  killed?: boolean;
  concealBroken?: boolean;
  coverTriggered?: boolean;
}

export interface ExecutionResult {
  results: ActionResult[];
  turnEnded: boolean; // True if cover reaction ended turn early
  coverReactionResult?: ActionResult; // The cover reaction attack result
}

// =============================================================================
// HEADLESS EXECUTOR
// =============================================================================

/**
 * Execute a series of commands on the battle state.
 * Modifies state in place, returns results for each action.
 */
export function executeCommands(
  state: BattleState,
  commands: CommandWithUnit[]
): ExecutionResult {
  const results: ActionResult[] = [];
  let turnEnded = false;
  let coverReactionResult: ActionResult | undefined;

  for (const command of commands) {
    if (turnEnded) break;

    const unit = getUnit(state, command.unitId);
    if (!unit || unit.hp <= 0) continue;

    let result: ActionResult | null = null;

    switch (command.type) {
      case "move":
        result = executeMove(state, unit, command.targetX, command.targetZ);
        break;
      case "attack":
        result = executeAttack(state, unit, command.targetUnitId);
        break;
      case "heal":
        result = executeHeal(state, unit, command.targetUnitId);
        break;
      case "conceal":
        result = executeConceal(unit);
        break;
      case "cover":
        result = executeCover(state, unit);
        break;
    }

    if (result) {
      results.push(result);

      // Check for cover reaction after any action
      const reaction = checkCoverReaction(state, unit);
      if (reaction) {
        coverReactionResult = reaction;
        results.push(reaction);
        turnEnded = true;
      }
    }
  }

  return { results, turnEnded, coverReactionResult };
}

/**
 * Execute a single move command.
 */
function executeMove(
  _state: BattleState,
  unit: UnitState,
  targetX: number,
  targetZ: number
): ActionResult {
  unit.gridX = targetX;
  unit.gridZ = targetZ;

  return {
    type: "move",
    success: true,
    unitId: unit.id,
  };
}

/**
 * Execute a single attack command.
 */
function executeAttack(
  state: BattleState,
  attacker: UnitState,
  targetId: string
): ActionResult {
  const defender = getUnit(state, targetId);
  if (!defender || defender.hp <= 0) {
    return { type: "attack", success: false, unitId: attacker.id, targetId };
  }

  // Check if defender is concealed
  if (defender.isConcealed) {
    defender.isConcealed = false;
    return {
      type: "attack",
      success: true,
      unitId: attacker.id,
      targetId,
      damage: 0,
      concealBroken: true,
    };
  }

  // Calculate and apply damage
  const damage = calculateDamage(attacker, defender);
  const killed = applyDamage(defender, damage);

  // Cancel cover when hit
  if (defender.isCovering) {
    endCover(defender);
  }

  // Remove from units array if killed
  if (killed) {
    const index = state.units.indexOf(defender);
    if (index > -1) {
      state.units.splice(index, 1);
    }
  }

  return {
    type: "attack",
    success: true,
    unitId: attacker.id,
    targetId,
    damage,
    killed,
  };
}

/**
 * Execute a single heal command.
 */
function executeHeal(
  state: BattleState,
  healer: UnitState,
  targetId: string
): ActionResult {
  const target = getUnit(state, targetId);
  if (!target || target.hp <= 0) {
    return { type: "heal", success: false, unitId: healer.id, targetId };
  }

  const healing = applyHealing(healer, target);

  return {
    type: "heal",
    success: true,
    unitId: healer.id,
    targetId,
    healing,
  };
}

/**
 * Execute conceal ability.
 */
function executeConceal(unit: UnitState): ActionResult {
  unit.isConcealed = true;

  return {
    type: "conceal",
    success: true,
    unitId: unit.id,
  };
}

/**
 * Execute cover ability.
 */
function executeCover(state: BattleState, unit: UnitState): ActionResult {
  unit.isCovering = true;
  const coverTiles = getCoverTiles(state, unit);
  unit.coveredTiles = coverTiles.map((t) => toGridKey(t.x, t.z));

  return {
    type: "cover",
    success: true,
    unitId: unit.id,
  };
}

/**
 * End cover for a unit.
 */
function endCover(unit: UnitState): void {
  unit.isCovering = false;
  unit.coveredTiles = [];
}

/**
 * Check if unit triggers cover reaction and execute it.
 * Returns the reaction attack result if triggered, null otherwise.
 */
function checkCoverReaction(
  state: BattleState,
  targetUnit: UnitState
): ActionResult | null {
  // Concealed units don't trigger cover
  if (targetUnit.isConcealed) {
    return null;
  }

  const coveringUnit = getEnemyCoveringTile(
    state,
    targetUnit.gridX,
    targetUnit.gridZ,
    targetUnit
  );

  if (!coveringUnit) {
    return null;
  }

  // Execute the cover reaction attack
  const result = executeAttack(state, coveringUnit, targetUnit.id);
  result.coverTriggered = true;

  // End cover after reaction
  endCover(coveringUnit);

  return result;
}

/**
 * Remove dead units from the state.
 * Call this after executing commands if needed.
 */
export function removeDeadUnits(state: BattleState): string[] {
  const deadIds: string[] = [];
  for (let i = state.units.length - 1; i >= 0; i--) {
    if (state.units[i].hp <= 0) {
      deadIds.push(state.units[i].id);
      state.units.splice(i, 1);
    }
  }
  return deadIds;
}
