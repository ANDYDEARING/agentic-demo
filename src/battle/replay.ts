/**
 * battle/replay.ts
 *
 * Pure data structures for recording and replaying battle turns.
 * These structures are serializable for online sync and persistence.
 *
 * NO Babylon.js dependencies - this is part of the headless simulation layer.
 */

import { BattleCommand } from "./commands";
import type { Team } from "../types";

// =============================================================================
// SNAPSHOT TYPES (for state restoration)
// =============================================================================

/**
 * Snapshot of a single unit's state at a point in time.
 * Used to restore state before/after replay.
 */
export interface UnitSnapshot {
  unitId: string;
  gridX: number;
  gridZ: number;
  hp: number;
  isConcealed: boolean;
  isCovering: boolean;
  facingAngle: number;
}

// =============================================================================
// TURN RECORD TYPES (for action recording)
// =============================================================================

/**
 * Record of a single unit's actions during their turn.
 * Commands are stored in execution order.
 */
export interface UnitTurnRecord {
  unitId: string;
  startPosition: { x: number; z: number };
  commands: BattleCommand[];
}

/**
 * Record of all unit actions during a team's complete turn.
 * Includes snapshots for state restoration during replay.
 */
export interface TeamTurnRecord {
  team: Team;
  unitTurns: UnitTurnRecord[];
  /** Snapshot of ALL units at the start of this team's turn (for replay restore) */
  unitSnapshots: UnitSnapshot[];
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an empty team turn record.
 * Call this at the start of a team's turn.
 */
export function createTeamTurnRecord(team: Team, unitSnapshots: UnitSnapshot[]): TeamTurnRecord {
  return {
    team,
    unitTurns: [],
    unitSnapshots,
  };
}

/**
 * Create an empty unit turn record.
 * Call this at the start of a unit's turn.
 */
export function createUnitTurnRecord(unitId: string, startX: number, startZ: number): UnitTurnRecord {
  return {
    unitId,
    startPosition: { x: startX, z: startZ },
    commands: [],
  };
}

/**
 * Add a command to a unit's turn record.
 */
export function recordCommand(record: UnitTurnRecord, command: BattleCommand): void {
  record.commands.push(command);
}

/**
 * Finalize a unit's turn and add it to the team record.
 * Only adds if the unit actually performed actions.
 */
export function finalizeUnitTurn(teamRecord: TeamTurnRecord, unitRecord: UnitTurnRecord): void {
  if (unitRecord.commands.length > 0) {
    teamRecord.unitTurns.push(unitRecord);
  }
}

// =============================================================================
// SERIALIZATION (for network sync)
// =============================================================================

/**
 * Serialize a team turn record to JSON-safe format.
 * Commands are already serializable via commands.ts.
 */
export function serializeTeamTurnRecord(record: TeamTurnRecord): string {
  return JSON.stringify(record);
}

/**
 * Deserialize a team turn record from JSON.
 */
export function deserializeTeamTurnRecord(json: string): TeamTurnRecord {
  return JSON.parse(json) as TeamTurnRecord;
}

// =============================================================================
// REPLAY HELPERS (pure logic)
// =============================================================================

/**
 * Check if a team turn record has any actions to replay.
 */
export function hasActionsToReplay(record: TeamTurnRecord | null): boolean {
  if (!record) return false;
  return record.unitTurns.length > 0 && record.unitSnapshots.length > 0;
}

/**
 * Get summary of a turn record (for debugging/logging).
 */
export function describeTurnRecord(record: TeamTurnRecord): string {
  const unitCount = record.unitTurns.length;
  const totalCommands = record.unitTurns.reduce((sum, ut) => sum + ut.commands.length, 0);
  return `${record.team}: ${unitCount} units, ${totalCommands} commands`;
}
