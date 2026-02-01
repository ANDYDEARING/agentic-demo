/**
 * scenes/battle/index.ts
 *
 * Re-exports all battle scene visual helpers.
 *
 * ARCHITECTURE NOTE:
 * - Pure game logic lives in /src/battle/ (state, rules, commands, controllers)
 * - Visual/rendering code lives here in /src/scenes/battle/
 * - BattleScene.ts orchestrates both, calling pure logic for game rules
 *   and visual helpers for rendering
 *
 * This separation enables headless simulation by using only /src/battle/.
 */

// =============================================================================
// TERRAIN
// =============================================================================
export {
  createTerrain,
  generateTerrainPositions,
  hasTerrain,
  type TerrainSet,
  type TerrainResult,
} from "./terrain";

// =============================================================================
// ANIMATIONS
// =============================================================================
export {
  playAnimation,
  playIdleAnimation,
  initFacing,
  applyFacing,
  faceTarget,
  faceClosestEnemy,
  faceAverageEnemyPosition,
  setUnitFacing,
} from "./animations";

// =============================================================================
// UNIT VISUALS
// =============================================================================
export {
  createUnit,
  createUnitMaterial,
  updateHpBar,
  setUnitExhausted,
  setUnitInactive,
  resetUnitAppearance,
  moveUnit,
  applyConcealVisual,
  removeConcealVisual,
  UNIT_DESIGNATIONS,
} from "./unitVisuals";

// =============================================================================
// CAMERA
// =============================================================================
export {
  createBattleCamera,
  createDramaticCameraState,
  transitionToDramaticCamera,
  transitionFromDramaticCamera,
  handlePanMovement,
  handlePinchZoom,
  cleanupDramaticCamera,
  type CameraMode,
  type SavedCameraState,
  type DramaticCameraState,
} from "./camera";

// =============================================================================
// HIGHLIGHTS
// =============================================================================
export {
  createHighlightMaterials,
  createHighlightState,
  clearHighlights,
  highlightTile,
  raiseTile,
  lowerTile,
  createShadowPreviewState,
  createShadowPreview,
  clearShadowPreview,
  createIntentIndicatorState,
  createIntentIndicator,
  clearIntentIndicators,
  createAttackPreviewState,
  clearAttackPreview,
  type HighlightMaterials,
  type HighlightState,
  type ShadowPreviewState,
  type IntentIndicatorState,
  type AttackPreviewState,
} from "./highlights";

// =============================================================================
// COVER VISUALS
// =============================================================================
export {
  createCoverVisualsState,
  setCoverTiles,
  clearCoverTilesForUnit,
  getUnitsCoveringTile,
  isTileCoveredByEnemy,
  createCoverBorder,
  clearCoverVisualizationForUnit,
  endCover,
  showCoverPreview,
  clearCoverPreview,
  updateHazardStripes,
  type CoverVisualsState,
} from "./coverVisuals";

// =============================================================================
// UI - TURN ORDER
// =============================================================================
export {
  createTurnOrderUI,
  predictTurnOrder,
  showTurnOrderModal,
  hideTurnOrderModal,
  setupModalScrollHandlers,
  type PredictedTurn,
  type TurnOrderUIState,
} from "./ui/turnOrder";

// =============================================================================
// UI - BATTLE MESSAGES
// =============================================================================
export {
  createBattleMessageUI,
  showBattleMessage,
  cleanupBattleMessage,
  type BattleMessageState,
} from "./ui/battleMessages";

// =============================================================================
// UI - ACTION BUTTONS
// =============================================================================
export {
  createActionButtonsUI,
  showSkipConfirm,
  hideSkipConfirm,
  updateActionButtons,
  updateQueuedActionsDisplay,
  type PendingAction,
  type TurnState,
  type ActionButtonsState,
} from "./ui/actionButtons";

// =============================================================================
// UI - STATUS BAR
// =============================================================================
export {
  createStatusBar,
  updateStatusBar,
  type StatusBarState,
} from "./ui/statusBar";

// =============================================================================
// UI - CAMERA TOGGLE
// =============================================================================
export {
  createCameraToggle,
  updateCameraModeButton,
  toggleCameraMode,
  getCameraMode,
  type CameraToggleState,
} from "./ui/cameraToggle";

// =============================================================================
// UI - ACTION COUNTER
// =============================================================================
export {
  createActionCounter,
  updateActionCounter,
  type ActionCounterState,
} from "./ui/actionCounter";

// =============================================================================
// UI - GAME OVER
// =============================================================================
export { showGameOver } from "./ui/gameOver";

// =============================================================================
// CONSOLIDATED VISUAL STATE
// =============================================================================
export {
  createHighlightState as createVisualHighlightState,
  createShadowPreviewState as createVisualShadowState,
  createAttackPreviewState as createVisualAttackPreviewState,
  createIntentIndicatorState as createVisualIntentState,
  createCoverVisualState,
  createCornerIndicatorState,
  createTurnSystemState,
  createBattleVisualState,
  type HighlightState as VisualHighlightState,
  type ShadowPreviewState as VisualShadowState,
  type AttackPreviewState as VisualAttackPreviewState,
  type IntentIndicatorState as VisualIntentState,
  type CoverVisualState,
  type CornerIndicatorState,
  type TurnSystemState,
  type BattleVisualState,
} from "./state";
