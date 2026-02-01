/**
 * battle/state.ts
 *
 * Visual state types for BattleScene.
 * These consolidate closure variables into explicit state objects
 * that can be passed to helper functions.
 *
 * Note: This is separate from /src/battle/state.ts which contains
 * pure game state for headless simulations.
 */

import type { Mesh, StandardMaterial } from "@babylonjs/core";
import type { Unit, Team, ActionMode, TurnState } from "../../types";

// =============================================================================
// HIGHLIGHT STATE
// =============================================================================

/**
 * State for tile highlighting system.
 * Tracks which tiles are highlighted and which units are targetable.
 */
export interface HighlightState {
  /** Currently highlighted tile meshes */
  highlightedTiles: Mesh[];
  /** Units that can be attacked from current position */
  attackableUnits: Unit[];
  /** Units that can be healed from current position */
  healableUnits: Unit[];
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
// SHADOW PREVIEW STATE
// =============================================================================

/**
 * State for shadow preview (ghost of unit at target position).
 */
export interface ShadowPreviewState {
  /** Shadow mesh for unit silhouette */
  mesh: Mesh | null;
  /** Shadow base indicator mesh */
  baseMesh: Mesh | null;
  /** Current shadow position (null if no shadow) */
  position: { x: number; z: number } | null;
}

/**
 * Create initial shadow preview state.
 */
export function createShadowPreviewState(): ShadowPreviewState {
  return {
    mesh: null,
    baseMesh: null,
    position: null,
  };
}

// =============================================================================
// ATTACK PREVIEW STATE
// =============================================================================

/**
 * State for attack preview tiles (shown when hovering move destinations).
 */
export interface AttackPreviewState {
  /** Tiles showing potential attack range from hover position */
  tiles: Mesh[];
}

/**
 * Create initial attack preview state.
 */
export function createAttackPreviewState(): AttackPreviewState {
  return {
    tiles: [],
  };
}

// =============================================================================
// INTENT INDICATOR STATE
// =============================================================================

/**
 * State for intent indicators (show pending attack/heal targets).
 */
export interface IntentIndicatorState {
  /** Meshes showing pending action targets */
  indicators: Mesh[];
}

/**
 * Create initial intent indicator state.
 */
export function createIntentIndicatorState(): IntentIndicatorState {
  return {
    indicators: [],
  };
}

// =============================================================================
// COVER VISUAL STATE
// =============================================================================

/**
 * State for cover ability visualization.
 */
export interface CoverVisualState {
  /** Cover border meshes per unit */
  meshesByUnit: Map<Unit, Mesh[]>;
  /** Preview meshes for pending cover action */
  previewMeshes: Mesh[];
  /** Hazard stripe meshes for dual-covered tiles */
  hazardStripeMeshes: Mesh[];
  /** Map of tile positions to covering units */
  tileMap: Map<string, Unit[]>;
}

/**
 * Create initial cover visual state.
 */
export function createCoverVisualState(): CoverVisualState {
  return {
    meshesByUnit: new Map(),
    previewMeshes: [],
    hazardStripeMeshes: [],
    tileMap: new Map(),
  };
}

// =============================================================================
// CORNER INDICATOR STATE
// =============================================================================

/**
 * State for active unit corner indicators.
 */
export interface CornerIndicatorState {
  /** Corner marker meshes */
  meshes: Mesh[];
  /** Material for corner markers (for pulsing animation) */
  material: StandardMaterial | null;
  /** Animation time for pulsing */
  pulseTime: number;
}

/**
 * Create initial corner indicator state.
 */
export function createCornerIndicatorState(): CornerIndicatorState {
  return {
    meshes: [],
    material: null,
    pulseTime: 0,
  };
}

// =============================================================================
// TURN STATE
// =============================================================================

/**
 * State for turn/initiative system.
 */
export interface TurnSystemState {
  /** Currently active unit */
  currentUnit: Unit | null;
  /** Last team that took a turn (for tie-breaking) */
  lastActingTeam: Team | null;
  /** Whether we're in the first round (special alternating order) */
  isFirstRound: boolean;
  /** Queue of units for first round */
  firstRoundQueue: Unit[];
  /** Current turn state for preview/undo system */
  turnState: TurnState | null;
  /** Current action mode */
  actionMode: ActionMode;
}

/**
 * Create initial turn system state.
 */
export function createTurnSystemState(): TurnSystemState {
  return {
    currentUnit: null,
    lastActingTeam: null,
    isFirstRound: true,
    firstRoundQueue: [],
    turnState: null,
    actionMode: "none",
  };
}

// =============================================================================
// CONSOLIDATED VISUAL STATE
// =============================================================================

/**
 * Consolidated visual state for BattleScene.
 * Groups all visual state objects for easy passing to helper functions.
 */
export interface BattleVisualState {
  /** Terrain tile positions (for collision checking) */
  terrainTiles: Set<string>;
  /** Grid offset for world position calculations */
  gridOffset: number;
  /** Highlight state */
  highlights: HighlightState;
  /** Shadow preview state */
  shadowPreview: ShadowPreviewState;
  /** Attack preview state */
  attackPreview: AttackPreviewState;
  /** Intent indicator state */
  intentIndicators: IntentIndicatorState;
  /** Cover visual state */
  coverVisuals: CoverVisualState;
  /** Corner indicator state */
  cornerIndicators: CornerIndicatorState;
  /** Turn system state */
  turnSystem: TurnSystemState;
  /** Whether movement animation is playing */
  isAnimatingMovement: boolean;
  /** Whether scene has been disposed */
  isDisposed: boolean;
  /** Whether game is over */
  isGameOver: boolean;
}

/**
 * Create initial battle visual state.
 */
export function createBattleVisualState(gridOffset: number): BattleVisualState {
  return {
    terrainTiles: new Set(),
    gridOffset,
    highlights: createHighlightState(),
    shadowPreview: createShadowPreviewState(),
    attackPreview: createAttackPreviewState(),
    intentIndicators: createIntentIndicatorState(),
    coverVisuals: createCoverVisualState(),
    cornerIndicators: createCornerIndicatorState(),
    turnSystem: createTurnSystemState(),
    isAnimatingMovement: false,
    isDisposed: false,
    isGameOver: false,
  };
}
