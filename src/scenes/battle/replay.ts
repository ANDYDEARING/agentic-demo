/**
 * battle/replay.ts (visual layer)
 *
 * Replay UI and execution for visualizing previous turns.
 * Uses data structures from /src/battle/replay.ts (pure logic layer).
 */

import { Color3 } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button, Control, TextBlock } from "@babylonjs/gui";
import { BattleCommand } from "../../battle/commands";
import { TeamTurnRecord, UnitSnapshot, hasActionsToReplay } from "../../battle/replay";

// =============================================================================
// TYPES
// =============================================================================

/** Unit reference for replay execution */
export interface ReplayUnit {
  gridX: number;
  gridZ: number;
  hp: number;
}

/** Context needed for replay execution - provided by BattleScene */
export interface ReplayContext {
  /** Find unit by ID string */
  findUnitById: (id: string) => ReplayUnit | undefined;
  /** Create snapshots of all units */
  createUnitSnapshots: () => UnitSnapshot[];
  /** Restore units from snapshots */
  restoreFromSnapshots: (snapshots: UnitSnapshot[]) => void;
  /** Show a battle message */
  showBattleMessage: (text: string, color: Color3) => void;
  /** Get display name for a team */
  getTeamDisplayName: (team: string) => string;
  /** Get team color */
  getTeamColor: (team: string) => Color3;
  /** Execute a unit's commands for replay */
  executeUnitCommands: (unitId: string, commands: BattleCommand[]) => Promise<void>;
  /** Save camera state */
  saveCameraState: () => CameraState;
  /** Restore camera state */
  restoreCameraState: (state: CameraState) => void;
  /** Check if game is over */
  isGameOver: () => boolean;
}

export interface CameraState {
  alpha: number;
  beta: number;
  radius: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

export interface ReplayButton {
  button: Button;
  updateVisibility: () => void;
}

export interface ReplayState {
  previousTeamTurnRecord: TeamTurnRecord | null;
  isReplaying: boolean;
}

// =============================================================================
// REPLAY BUTTON UI
// =============================================================================

/**
 * Create the replay button UI element.
 * Button appears in top-right corner when there's a turn to replay.
 */
export function createReplayButton(
  gui: AdvancedDynamicTexture,
  state: ReplayState,
  context: ReplayContext,
  onReplayStart: () => void,
  onReplayEnd: () => void
): ReplayButton {
  const replayBtn = Button.CreateSimpleButton("replayBtn", "");
  replayBtn.width = "44px";
  replayBtn.height = "44px";
  replayBtn.background = "rgba(40, 40, 50, 0.9)";
  replayBtn.cornerRadius = 22;
  replayBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  replayBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  replayBtn.left = "-15px";
  replayBtn.top = "15px";
  replayBtn.thickness = 2;
  replayBtn.color = "#666666";
  replayBtn.zIndex = 50;
  replayBtn.isPointerBlocker = true;
  replayBtn.isVisible = false;

  const replayIcon = new TextBlock("replayIcon", "↺");
  replayIcon.fontSize = 24;
  replayIcon.color = "#888888";
  replayIcon.isHitTestVisible = false;
  replayBtn.addControl(replayIcon);

  function updateVisibility(): void {
    const canReplay = hasActionsToReplay(state.previousTeamTurnRecord) &&
                      !state.isReplaying &&
                      !context.isGameOver();
    replayBtn.isVisible = canReplay;

    if (canReplay && state.previousTeamTurnRecord) {
      const teamColor = context.getTeamColor(state.previousTeamTurnRecord.team);
      const colorHex = color3ToHex(teamColor);
      replayIcon.color = colorHex;
      replayBtn.color = colorHex;
    }
  }

  replayBtn.onPointerUpObservable.add(async () => {
    if (!state.previousTeamTurnRecord || state.isReplaying || context.isGameOver()) return;

    await executeReplay(state, context, onReplayStart, onReplayEnd);
    updateVisibility();
  });

  gui.addControl(replayBtn);

  return {
    button: replayBtn,
    updateVisibility,
  };
}

// =============================================================================
// REPLAY EXECUTION
// =============================================================================

/**
 * Execute replay of the previous team's turn.
 * Saves current state, restores to turn start, plays actions, then restores current state.
 */
async function executeReplay(
  state: ReplayState,
  context: ReplayContext,
  onReplayStart: () => void,
  onReplayEnd: () => void
): Promise<void> {
  const record = state.previousTeamTurnRecord;
  if (!record || !record.unitSnapshots || record.unitSnapshots.length === 0) {
    console.warn("Cannot replay: no snapshots available for previous turn");
    return;
  }

  state.isReplaying = true;
  onReplayStart();

  // 1. Save current state to restore after replay
  const currentStateSnapshot = context.createUnitSnapshots();
  const savedCameraState = context.saveCameraState();

  // Show "Replaying..." message
  const prevTeamName = context.getTeamDisplayName(record.team);
  const prevTeamColor = context.getTeamColor(record.team);
  context.showBattleMessage(`Replaying ${prevTeamName}...`, prevTeamColor);

  // Brief pause before starting replay
  await sleep(500);

  // 2. Restore to state at start of previous team's turn
  context.restoreFromSnapshots(record.unitSnapshots);

  // 3. Execute each unit's turn
  for (const unitTurn of record.unitTurns) {
    await context.executeUnitCommands(unitTurn.unitId, unitTurn.commands);
    await sleep(300); // Brief pause between units
  }

  // 4. Restore to current state after replay
  context.restoreFromSnapshots(currentStateSnapshot);
  context.restoreCameraState(savedCameraState);

  state.isReplaying = false;
  onReplayEnd();
}

// =============================================================================
// HELPERS
// =============================================================================

function color3ToHex(color: Color3): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
