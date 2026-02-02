/**
 * battle/index.ts
 *
 * Battle system exports - pure game logic without Babylon.js dependencies.
 * Use these modules for headless simulations, AI, and game balancing.
 */

// Command pattern
export {
  type BattleCommand,
  type MoveCommand,
  type AttackCommand,
  type HealCommand,
  type ConcealCommand,
  type CoverCommand,
  type CommandExecutor,
  createMoveCommand,
  createAttackCommand,
  createHealCommand,
  createConcealCommand,
  createCoverCommand,
  CommandQueue,
  processCommandQueue,
  isValidMoveCommand,
  describeCommand,
} from "./commands";

// State types and helpers
export {
  type GridPosition,
  type GridKey,
  type UnitState,
  type QueuedAction,
  type ActionType,
  type BattleState,
  toGridKey,
  fromGridKey,
  createBattleState,
  getUnit,
  getCurrentUnit,
  getTeamUnits,
  getUnitAt,
  hasTerrain,
  isInBounds,
  isBlocked,
} from "./state";

// Game rules
export {
  // Grid helpers
  isAdjacent,
  isDiagonal,
  getAdjacentTiles,

  // Line of sight
  hasLineOfSight,
  getTilesInLOS,

  // Movement
  getValidMoveTiles,
  getPathToTarget,

  // Combat - targeting
  getValidAttackTiles,
  getAttackableEnemies,
  getHealableAllies,

  // Combat - damage
  calculateDamage,
  applyDamage,
  applyHealing,

  // Turn system
  getEffectiveSpeed,
  getNextUnitByAccumulator,

  // Win condition
  checkWinCondition,

  // Cover system
  getCoverTiles,
  getEnemyCoveringTile,
} from "./rules";

// Controllers
export {
  type Controller,
  type ControllerContext,
  type IssueCommandFn,
  type ExecuteTurnFn,
  type AIDifficulty,
  type SendCommandFn,
  HumanController,
  AIController,
  NetworkController,
  ControllerManager,
  createLocalPvPControllers,
  createPvEControllers,
  createSimulationControllers,
} from "./controllers";

// Terrain generation (pure, no Babylon.js)
export {
  type GridPosition as TerrainGridPosition,
  generateTerrainPositions,
  createTerrainSet,
} from "./terrain";

// Headless command executor
export {
  type ActionResult,
  type ExecutionResult,
  type CommandWithUnit,
  executeCommands,
  removeDeadUnits,
} from "./executor";

// Headless battle runner
export {
  type UnitLoadout,
  type BattleResult,
  generateRandomLoadout,
  runBattle,
} from "./runner";

// Simulation and statistics
export {
  type SimulationStats,
  runSimulation,
  printStats,
} from "./simulation";
