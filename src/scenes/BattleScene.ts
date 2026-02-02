import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  PointerEventTypes,
  SceneLoader,
  AbstractMesh,
  PBRMaterial,
  Matrix,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { AdvancedDynamicTexture, TextBlock, Button, Rectangle, StackPanel, Grid, Control, ScrollViewer } from "@babylonjs/gui";
import { registerActiveMusic } from "../main";
import {
  type Loadout,
  type UnitSelection,
  type UnitCustomization,
  type UnitClass,
  type Team,
  type ActionMode,
  type TurnState,
  type Unit,
  getClassData,
} from "../types";

// Import centralized config - colors and palettes
import {
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
  SCENE_BACKGROUNDS,
  TILE_COLOR_LIGHT,
  TILE_COLOR_DARK,
  TERRAIN_COLOR,
  HIGHLIGHT_SELECTED,
  HIGHLIGHT_VALID_MOVE,
  HIGHLIGHT_ATTACKABLE,
  HIGHLIGHT_HEALABLE,
  HIGHLIGHT_BLOCKED,
  HP_BAR_GREEN,
  HP_BAR_ORANGE,
  HP_BAR_RED,
  HP_BAR_BACKGROUND,
  HP_BAR_BORDER,
  INTENT_COLOR_ATTACK,
  INTENT_COLOR_HEAL,
  INTENT_COLOR_BUFF,
  DEFAULT_TEAM_COLORS,
  SHADOW_BASE_ALPHA,
  SHADOW_UNIT_ALPHA,
  INTENT_INDICATOR_ALPHA,
  COVER_ACTIVE_ALPHA,
  COVER_PREVIEW_ALPHA,
} from "../config";

// Import centralized config - constants
import {
  GRID_SIZE,
  TILE_SIZE,
  TILE_GAP,
  TERRAIN_COUNT,
  PLAYER1_SPAWN_POSITIONS,
  PLAYER2_SPAWN_POSITIONS,
  BATTLE_CAMERA_ALPHA,
  BATTLE_CAMERA_BETA,
  BATTLE_CAMERA_RADIUS,
  BATTLE_CAMERA_LOWER_BETA_LIMIT,
  BATTLE_CAMERA_UPPER_BETA_LIMIT,
  BATTLE_CAMERA_LOWER_RADIUS_LIMIT,
  BATTLE_CAMERA_UPPER_RADIUS_LIMIT,
  MOVEMENT_DURATION_PER_TILE,
  ATTACK_IMPACT_DELAY_MS,
  ACTIONS_PER_TURN,
  ACCUMULATOR_THRESHOLD,
  SPEED_BONUS_PER_UNUSED_ACTION,
  HP_LOW_THRESHOLD,
  HP_MEDIUM_THRESHOLD,
  BATTLE_MODEL_SCALE,
  BATTLE_MODEL_Y_POSITION,
  HP_BAR_ANCHOR_HEIGHT,
  HEAD_VARIANT_COUNT,
  DRAMATIC_CAMERA_RADIUS,
  DRAMATIC_CAMERA_BETA,
  DRAMATIC_CAMERA_TARGET_HEIGHT,
  DRAMATIC_CAMERA_TRANSITION_IN_MS,
  DRAMATIC_CAMERA_TRANSITION_OUT_MS,
  DRAMATIC_CAMERA_HOLD_MS,
  BREAKPOINT_LANDSCAPE_PHONE_HEIGHT,
  BREAKPOINT_TABLET_MIN,
  BREAKPOINT_DESKTOP_MIN,
  BREAKPOINT_SMALL_MOBILE,
} from "../config";

// Import audio config
import { MUSIC, SFX, AUDIO_VOLUMES, LOOP_BUFFER_TIME } from "../config";

// Import balance config
import { isMeleeWeapon, WEAPON_DATA, BOOST_BY_INDEX } from "../config/balance";

// Import utility functions
import { hexToColor3, createMusicPlayer, playSfx, rgbToColor3, type MusicPlayer } from "../utils";

// Module-level music player (persists across orientation reloads)
let battleMusic: MusicPlayer | null = null;

// Import command pattern for action queue
import {
  type ControllerContext,
  type BattleCommand,
  CommandQueue,
  createMoveCommand,
  createAttackCommand,
  createHealCommand,
  createConcealCommand,
  createCoverCommand,
  ControllerManager,
  createLocalPvPControllers,
  createPvEControllers,
  // Pure game logic - state types
  type BattleState,
  type UnitState,
  // Pure game logic - rules (replacing inline versions)
  isAdjacent as rulesIsAdjacent,
  getAdjacentTiles as rulesGetAdjacentTiles,
  hasLineOfSight as rulesHasLineOfSight,
  getTilesInLOS as rulesGetTilesInLOS,
  getValidMoveTiles as rulesGetValidMoveTiles,
  getPathToTarget as rulesGetPathToTarget,
  getValidAttackTiles as rulesGetValidAttackTiles,
  getEffectiveSpeed as rulesGetEffectiveSpeed,
} from "../battle";

// Pure game logic from /src/battle/ is now used directly via the state bridge.
// See: /src/battle/state.ts (UnitState, BattleState)
//      /src/battle/rules.ts (movement, LOS, combat, turns)
//      /src/battle/commands.ts (Command pattern for actions)
//      /src/battle/controllers.ts (Controller abstraction for PvE/PvP)

// =============================================================================
// VISUAL HELPERS (extracted to /src/scenes/battle/)
// =============================================================================
// These modules contain reusable visual helpers. The functions below import
// from them where possible. Some inline code remains due to tight coupling
// with closure variables (units, turnState, etc.).
//
// Available modules:
//   - terrain.ts: Grid terrain generation
//   - animations.ts: Animation playback and facing system
//   - unitVisuals.ts: Unit spawning, HP bars, conceal visuals
//   - camera.ts: Dramatic camera transitions, pan/rotate toggle
//   - highlights.ts: Tile highlighting, shadow preview, intent indicators
//   - coverVisuals.ts: Cover ability visualization
//   - ui/*: Turn order, action buttons, status bar, game over
//
// Import path: import { ... } from "./battle";
// =============================================================================

// Import extracted visual helpers
// Animation functions are pure and can be used directly
// faceClosestEnemy and faceAverageEnemyPosition need units array passed in
import {
  playAnimation,
  playIdleAnimation,
  initFacing,
  faceClosestEnemy,
  faceAverageEnemyPosition,
  setUnitFacing,
  UNIT_DESIGNATIONS,
  updateHpBar,
  setUnitExhausted,
  setUnitInactive,
  resetUnitAppearance,
  applyConcealVisual,
  removeConcealVisual,
  createTutorialOverlay,
} from "./battle";

// Import pure replay data structures (for online sync compatibility)
import type { UnitSnapshot, TeamTurnRecord, UnitTurnRecord } from "../battle/replay";

// Import from loadout constants
import { BOOST_INFO } from "./loadout/constants";

export function createBattleScene(engine: Engine, _canvas: HTMLCanvasElement, loadout: Loadout | null): Scene {
  const scene = new Scene(engine);

  // Disable environment texture to prevent rgbdDecode shader errors
  // PBR materials will use direct lighting only (no IBL reflections)
  scene.environmentTexture = null;

  // Track if scene has been disposed (prevents async operations on disposed scene)
  let sceneDisposed = false;

  // Use centralized scene background color
  const bg = SCENE_BACKGROUNDS.battle;
  scene.clearColor.set(bg.r, bg.g, bg.b, bg.a);

  // ============================================
  // RESPONSIVE SIZING
  // ============================================
  const screenWidth = engine.getRenderWidth();
  const screenHeight = engine.getRenderHeight();
  const isLandscapePhone = screenHeight < BREAKPOINT_LANDSCAPE_PHONE_HEIGHT && screenWidth < BREAKPOINT_DESKTOP_MIN;
  const isMobile = screenWidth < BREAKPOINT_TABLET_MIN && !isLandscapePhone;
  const isTablet = (screenWidth >= BREAKPOINT_TABLET_MIN && screenWidth < BREAKPOINT_DESKTOP_MIN) || isLandscapePhone;
  const isTouch = isMobile || isTablet;

  // Note: We don't reload BattleScene on orientation change since that would
  // lose all battle state (unit positions, HP, turn order). The UI scales
  // reasonably and the 3D scene auto-adjusts via engine.resize().

  // Battle music - using module-level variable for persistence across reloads
  if (!battleMusic) {
    battleMusic = createMusicPlayer(MUSIC.battle, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
  }
  // Only start playing if not already playing
  if (battleMusic.paused) {
    battleMusic.play();
  }
  // Register with global audio manager for pause on background
  registerActiveMusic(battleMusic);

  scene.onDisposeObservable.add(() => {
    sceneDisposed = true;
    // Stop music when leaving battle scene
    if (battleMusic) {
      battleMusic.dispose();
      battleMusic = null;
    }
  });

  // Sound effects
  // Sound effects - using centralized audio paths and volumes
  const sfx = {
    hitLight: new Audio(SFX.hitLight),
    hitMedium: new Audio(SFX.hitMedium),
    hitHeavy: new Audio(SFX.hitHeavy),
    heal: new Audio(SFX.heal),
    swordSwing: new Audio(SFX.swordSwing),
    gunShot: new Audio(SFX.gunShot),
    concealUp: new Audio(SFX.concealUp),
    concealDown: new Audio(SFX.concealDown),
    death: new Audio(SFX.death),
    coverUp: new Audio(SFX.coverUp),
    coverDown: new Audio(SFX.coverDown),
    speedUp: new Audio(SFX.speedUp),
  };
  // Set volume for all sound effects and preload them
  Object.values(sfx).forEach(sound => {
    sound.volume = AUDIO_VOLUMES.sfx;
    sound.load(); // Preload to ensure sounds play on first use
  });
  // Boost quieter effects
  sfx.concealUp.volume = Math.min(1, AUDIO_VOLUMES.sfx * 1.5);
  sfx.concealDown.volume = Math.min(1, AUDIO_VOLUMES.sfx * 1.5);
  // Reduce louder effects
  sfx.gunShot.volume = AUDIO_VOLUMES.sfx * 0.7;
  // Note: playSfx is now imported from utils

  // Camera - using centralized constants for isometric tactical view
  const camera = new ArcRotateCamera(
    "camera",
    BATTLE_CAMERA_ALPHA,
    BATTLE_CAMERA_BETA,
    BATTLE_CAMERA_RADIUS,
    new Vector3(0, 0, 0),
    scene
  );
  // Camera controls will be attached after GUI is initialized
  camera.attachControl(true);
  camera.lowerBetaLimit = BATTLE_CAMERA_LOWER_BETA_LIMIT;
  camera.upperBetaLimit = BATTLE_CAMERA_UPPER_BETA_LIMIT;
  camera.lowerRadiusLimit = BATTLE_CAMERA_LOWER_RADIUS_LIMIT;
  camera.upperRadiusLimit = BATTLE_CAMERA_UPPER_RADIUS_LIMIT;

  new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
  const dirLight = new DirectionalLight("dirLight", new Vector3(-1, -2, -1), scene);
  dirLight.intensity = 0.5;

  // Helper to create matte (non-reflective) tile materials
  // Specular set to black to prevent white reflections when viewed from above
  function createMatteMaterial(name: string, color: Color3): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0, 0, 0);
    return mat;
  }

  // Tile materials - using centralized color config
  const tileMaterialLight = createMatteMaterial("tileLightMat", rgbToColor3(TILE_COLOR_LIGHT));
  const tileMaterialDark = createMatteMaterial("tileDarkMat", rgbToColor3(TILE_COLOR_DARK));

  // Highlight materials - using centralized color config
  const selectedMaterial = createMatteMaterial("selectedMat", rgbToColor3(HIGHLIGHT_SELECTED));
  const validMoveMaterial = createMatteMaterial("validMoveMat", rgbToColor3(HIGHLIGHT_VALID_MOVE));
  const attackableMaterial = createMatteMaterial("attackableMat", rgbToColor3(HIGHLIGHT_ATTACKABLE));
  const healableMaterial = createMatteMaterial("healableMat", rgbToColor3(HIGHLIGHT_HEALABLE));

  const unitMaterials: Record<UnitClass, StandardMaterial> = {
    soldier: createUnitMaterial("soldier", new Color3(0.3, 0.3, 0.8), scene),
    operator: createUnitMaterial("operator", new Color3(0.8, 0.2, 0.2), scene),
    medic: createUnitMaterial("medic", new Color3(0.2, 0.8, 0.3), scene),
  };

  // Create grid
  const tiles: Mesh[][] = [];
  const gridOffset = (GRID_SIZE * TILE_SIZE) / 2 - TILE_SIZE / 2;

  for (let x = 0; x < GRID_SIZE; x++) {
    tiles[x] = [];
    for (let z = 0; z < GRID_SIZE; z++) {
      const tile = MeshBuilder.CreateBox(
        `tile_${x}_${z}`,
        { width: TILE_SIZE - TILE_GAP, height: 0.1, depth: TILE_SIZE - TILE_GAP },
        scene
      );
      tile.position = new Vector3(
        x * TILE_SIZE - gridOffset,
        0,
        z * TILE_SIZE - gridOffset
      );
      tile.material = (x + z) % 2 === 0 ? tileMaterialLight : tileMaterialDark;
      tile.metadata = { type: "tile", gridX: x, gridZ: z };
      tiles[x][z] = tile;
    }
  }

  // ============================================
  // TERRAIN GENERATION
  // ============================================

  // Store terrain positions for collision checking
  const terrainTiles: Set<string> = new Set();

  // ============================================
  // TERRAIN GENERATION - Constructive Algorithm
  // ============================================
  // Instead of generate-and-validate, we:
  // 1. Build a guaranteed main corridor along an edge (not middle)
  // 2. Connect each spawn point to the corridor via cardinal paths
  // 3. Mark all path tiles as "protected"
  // 4. Place terrain only in unprotected tiles (middle of map)
  // This always succeeds and is deterministic with a seed.

  // Combine spawn positions for terrain generation (using config constants)
  const spawnPositions = [...PLAYER1_SPAWN_POSITIONS, ...PLAYER2_SPAWN_POSITIONS];

  /**
   * Generate an edge-hugging corridor from bottom to top.
   * Routes along left or right edge with some variance, leaving middle open.
   */
  function generateEdgeCorridor(): { x: number; z: number }[] {
    const path: { x: number; z: number }[] = [];

    // Pick which edge to favor (left or right)
    const favorLeft = Math.random() < 0.5;

    // Start position: on or near the chosen edge
    let x = favorLeft
      ? Math.floor(Math.random() * 2)  // 0 or 1
      : GRID_SIZE - 1 - Math.floor(Math.random() * 2);  // 6 or 7

    // Walk from z=0 to z=GRID_SIZE-1
    for (let z = 0; z < GRID_SIZE; z++) {
      path.push({ x, z });

      // Occasionally drift laterally (but stay near edge)
      if (z < GRID_SIZE - 1 && Math.random() < 0.3) {
        // Drift toward or away from edge
        const driftTowardEdge = Math.random() < 0.6;  // Bias toward edge
        if (driftTowardEdge) {
          // Move toward edge
          if (favorLeft && x > 0) x--;
          else if (!favorLeft && x < GRID_SIZE - 1) x++;
        } else {
          // Move away from edge (but not too far - stay in outer third)
          const maxDrift = Math.floor(GRID_SIZE / 3);
          if (favorLeft && x < maxDrift) x++;
          else if (!favorLeft && x > GRID_SIZE - 1 - maxDrift) x--;
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
    targetSet: Set<string>
  ): { x: number; z: number }[] {
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
        const path: { x: number; z: number }[] = [];
        let key: string | null = currentKey;
        while (key) {
          const [px, pz] = key.split(",").map(Number);
          path.unshift({ x: px, z: pz });
          key = parent.get(key) || null;
        }
        return path;
      }

      // Explore cardinal neighbors only (no diagonals!)
      const cardinalDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dx, dz] of cardinalDirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        const key = `${nx},${nz}`;

        // Stay in bounds
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        // Don't revisit
        if (visited.has(key)) continue;

        visited.add(key);
        parent.set(key, currentKey);
        queue.push([nx, nz]);
      }
    }

    // No path found (shouldn't happen on open grid) - return just start
    console.warn(`No cardinal path found from (${startX},${startZ}) to corridor`);
    return [{ x: startX, z: startZ }];
  }

  /**
   * Constructive terrain generation algorithm.
   * Guarantees valid terrain on first try - no retries needed.
   */
  function generateTerrainPositions(): { x: number; z: number }[] {
    const protectedTiles = new Set<string>();

    // Step 1: Create main corridor along an edge (leaves middle open for terrain)
    const mainCorridor = generateEdgeCorridor();

    // Add main corridor to protected set
    for (const tile of mainCorridor) {
      protectedTiles.add(`${tile.x},${tile.z}`);
    }

    // Step 2: Connect each spawn to the corridor via cardinal path
    // IMPORTANT: Don't add spawns to protected BEFORE finding paths,
    // otherwise findCardinalPathToSet returns immediately
    for (const spawn of spawnPositions) {
      // Find cardinal path from spawn to nearest protected tile
      const pathToCorridor = findCardinalPathToSet(
        spawn.x, spawn.z,
        protectedTiles
      );

      // Add entire path (including spawn) to protected tiles
      for (const tile of pathToCorridor) {
        protectedTiles.add(`${tile.x},${tile.z}`);
      }

      // Also protect the spawn itself (in case path didn't include it)
      protectedTiles.add(`${spawn.x},${spawn.z}`);
    }

    // Step 3: Verify each spawn has at least one cardinal exit
    // (Should always be true now, but safety check)
    for (const spawn of spawnPositions) {
      const cardinalNeighbors = [
        { x: spawn.x - 1, z: spawn.z },
        { x: spawn.x + 1, z: spawn.z },
        { x: spawn.x, z: spawn.z - 1 },
        { x: spawn.x, z: spawn.z + 1 },
      ].filter(n => n.x >= 0 && n.x < GRID_SIZE && n.z >= 0 && n.z < GRID_SIZE);

      const hasCardinalExit = cardinalNeighbors.some(n =>
        protectedTiles.has(`${n.x},${n.z}`)
      );

      if (!hasCardinalExit && cardinalNeighbors.length > 0) {
        // Protect a random cardinal neighbor
        const randomNeighbor = cardinalNeighbors[
          Math.floor(Math.random() * cardinalNeighbors.length)
        ];
        protectedTiles.add(`${randomNeighbor.x},${randomNeighbor.z}`);
      }
    }

    // Step 4: Collect eligible tiles for terrain (not protected)
    const eligibleTiles: { x: number; z: number }[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
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

    const terrainCount = Math.min(TERRAIN_COUNT, eligibleTiles.length);
    const positions = eligibleTiles.slice(0, terrainCount);

    // Add to terrain tiles set for collision detection
    for (const pos of positions) {
      terrainTiles.add(`${pos.x},${pos.z}`);
    }

    return positions;
  }

  const terrainPositions = generateTerrainPositions();

  // Create terrain cube meshes
  // Terrain material - using centralized color config
  const terrainMaterial = createMatteMaterial("terrainMat", rgbToColor3(TERRAIN_COLOR));

  const tileTopY = 0.05;  // Top surface of tiles (tiles are height 0.1 centered at Y=0)
  const terrainHeight = TILE_SIZE - TILE_GAP;

  for (const { x, z } of terrainPositions) {
    const cube = MeshBuilder.CreateBox(`terrain_${x}_${z}`, {
      width: TILE_SIZE - TILE_GAP,
      height: terrainHeight,
      depth: TILE_SIZE - TILE_GAP,
    }, scene);
    cube.position = new Vector3(
      x * TILE_SIZE - gridOffset,
      tileTopY + terrainHeight / 2,  // Sit on top of tile
      z * TILE_SIZE - gridOffset
    );
    cube.material = terrainMaterial;
    cube.metadata = { type: "terrain", gridX: x, gridZ: z };
  }

  // hasTerrain check is done via getBattleState() which includes terrainTiles

  // ============================================
  // STATE EXTRACTION (for simulations/AI)
  // ============================================
  // These functions extract pure game state for use with /src/battle/ rules.
  // This enables headless simulations without Babylon.js dependencies.

  /**
   * Extract pure UnitState from a visual Unit.
   * Used for simulations, AI, and state synchronization.
   */
  function extractUnitState(unit: Unit, index: number): import("../battle").UnitState {
    return {
      id: `${unit.team}-${index}`,
      unitClass: unit.unitClass,
      team: unit.team,
      gridX: unit.gridX,
      gridZ: unit.gridZ,
      hp: unit.hp,
      maxHp: unit.maxHp,
      attack: unit.attack,
      healAmount: unit.healAmount,
      moveRange: unit.moveRange,
      weapon: unit.customization?.weapon ?? "pistol",
      speed: unit.speed,
      speedBonus: unit.speedBonus,
      accumulator: unit.accumulator,
      loadoutIndex: unit.loadoutIndex,
      isConcealed: unit.isConcealed,
      isCovering: unit.isCovering,
      coveredTiles: [], // TODO: track covered tiles in Unit
      actionsUsed: turnState?.unit === unit ? (ACTIONS_PER_TURN - turnState.actionsRemaining) : 0,
    };
  }

  /**
   * Extract complete BattleState from current game.
   * Used for simulations, AI decision making, and state sync.
   */
  function extractBattleState(): import("../battle").BattleState {
    const currentUnit = turnState?.unit;
    return {
      gridSize: GRID_SIZE,
      terrain: new Set(terrainTiles),
      units: units.map((u, i) => extractUnitState(u, i)),
      currentUnitId: currentUnit ? `${currentUnit.team}-${units.indexOf(currentUnit)}` : null,
      actionsRemaining: turnState?.actionsRemaining ?? 0,
      pendingActions: turnState?.pendingActions.map(a => ({
        type: a.type,
        targetX: a.targetX,
        targetZ: a.targetZ,
        targetUnitId: a.targetUnit ? `${a.targetUnit.team}-${units.indexOf(a.targetUnit)}` : undefined,
        abilityName: a.abilityName,
      })) ?? [],
      originalPosition: turnState?.originalPosition ?? null,
      isGameOver: false, // TODO: track game over state
      winner: null,
    };
  }

  // Note: extractBattleState is defined for AI/simulation use but not currently called.
  // When implementing AI decision-making, call extractBattleState() to get pure game state.

  // GUI - ensure it captures pointer events before the scene
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");
  gui.isForeground = true;

  // Screen border - shows current team color (updated on turn change and game over)
  const screenBorder = new Rectangle("screenBorder");
  screenBorder.width = "100%";
  screenBorder.height = "100%";
  screenBorder.thickness = 4;
  screenBorder.color = "#444444"; // Default gray, updated when game starts
  screenBorder.background = "transparent";
  screenBorder.isHitTestVisible = false;
  screenBorder.zIndex = 100; // Above most UI elements
  gui.addControl(screenBorder);

  function updateScreenBorderColor(color: Color3): void {
    const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
    screenBorder.color = `#${r}${g}${b}`;
  }

  // ============================================
  // TUTORIAL OVERLAY (extracted to ./battle/ui/tutorial.ts)
  // ============================================
  createTutorialOverlay(gui);

  // Units
  const units: Unit[] = [];

  // Current turn state for preview/undo system
  let turnState: TurnState | null = null;
  let currentActionMode: ActionMode = "none";

  // Command queue for pending actions
  const commandQueue = new CommandQueue();

  // Helper to get unit ID (for command serialization)
  // Uses loadoutIndex for stability - array index shifts when units die
  function getUnitId(unit: Unit): string {
    return `${unit.team}-${unit.loadoutIndex}`;
  }

  // Helper to find unit by ID
  function findUnitById(id: string): Unit | undefined {
    const [team, loadoutIndexStr] = id.split("-");
    const loadoutIndex = parseInt(loadoutIndexStr, 10);
    return units.find(u => u.team === team && u.loadoutIndex === loadoutIndex);
  }

  // ============================================
  // STATE BRIDGE (Visual ↔ Pure Logic)
  // ============================================
  // These helpers convert between visual Units and pure UnitState/BattleState
  // to enable using rules.ts functions with minimal overhead.

  /** Convert visual Unit to pure UnitState (lightweight, for rules functions) */
  function toUnitState(unit: Unit): UnitState {
    return {
      id: getUnitId(unit),
      unitClass: unit.unitClass,
      team: unit.team,
      gridX: unit.gridX,
      gridZ: unit.gridZ,
      hp: unit.hp,
      maxHp: unit.maxHp,
      attack: unit.attack,
      healAmount: unit.healAmount,
      moveRange: unit.moveRange,
      weapon: unit.customization?.weapon ?? "pistol",
      speed: unit.speed,
      speedBonus: unit.speedBonus,
      accumulator: unit.accumulator,
      loadoutIndex: unit.loadoutIndex,
      isConcealed: unit.isConcealed,
      isCovering: unit.isCovering,
      coveredTiles: [], // Not tracking in visual Unit yet
      actionsUsed: 0,
    };
  }

  /** Create minimal BattleState from closure variables (cached per frame) */
  let cachedState: BattleState | null = null;
  let cacheFrame = -1;

  function getBattleState(): BattleState {
    // Cache state per render frame to avoid repeated conversions
    const currentFrame = scene.getFrameId();
    if (cachedState && cacheFrame === currentFrame) {
      return cachedState;
    }

    cachedState = {
      gridSize: GRID_SIZE,
      terrain: terrainTiles,
      units: units.filter(u => u.hp > 0).map(toUnitState),
      currentUnitId: currentUnit ? getUnitId(currentUnit) : null,
      actionsRemaining: turnState?.actionsRemaining ?? 0,
      pendingActions: [],
      originalPosition: turnState?.originalPosition ?? null,
      isGameOver: gameOver,
      winner: null,
    };
    cacheFrame = currentFrame;

    return cachedState;
  }

  // ============================================
  // PURE LOGIC WRAPPERS
  // ============================================
  // These wrap rules.ts functions to work with visual Units.
  // Note: Action checks (hasActionsRemaining) are done by callers.

  function isAdjacent(x1: number, z1: number, x2: number, z2: number): boolean {
    return rulesIsAdjacent(x1, z1, x2, z2);
  }

  function hasLineOfSight(fromX: number, fromZ: number, toX: number, toZ: number, excludeUnit?: Unit): boolean {
    const state = getBattleState();
    const excludeId = excludeUnit ? getUnitId(excludeUnit) : undefined;
    return rulesHasLineOfSight(state, fromX, fromZ, toX, toZ, excludeId);
  }

  function getTilesInLOS(fromX: number, fromZ: number, excludeAdjacent: boolean, excludeUnit?: Unit): { x: number; z: number }[] {
    const state = getBattleState();
    const excludeId = excludeUnit ? getUnitId(excludeUnit) : undefined;
    return rulesGetTilesInLOS(state, fromX, fromZ, excludeAdjacent, excludeId);
  }

  function getAdjacentTiles(x: number, z: number): { x: number; z: number }[] {
    const state = getBattleState();
    return rulesGetAdjacentTiles(state, x, z);
  }

  function getValidMoveTilesRaw(unit: Unit, fromX?: number, fromZ?: number): { x: number; z: number }[] {
    const state = getBattleState();
    const unitState = toUnitState(unit);
    return rulesGetValidMoveTiles(state, unitState, fromX, fromZ);
  }

  function getPathToTarget(unit: Unit, fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] {
    const state = getBattleState();
    const unitState = toUnitState(unit);
    return rulesGetPathToTarget(state, unitState, fromX, fromZ, toX, toZ);
  }

  function getValidAttackTiles(unit: Unit, fromX?: number, fromZ?: number): { x: number; z: number; hasLOS: boolean }[] {
    const state = getBattleState();
    const unitState = toUnitState(unit);
    return rulesGetValidAttackTiles(state, unitState, fromX, fromZ);
  }

  // getAttackableEnemies and getHealableAllies use inline versions with action checks
  // that call getValidAttackTiles (which uses rules.ts via wrapper)

  function getEffectiveSpeed(unit: Unit): number {
    return rulesGetEffectiveSpeed(toUnitState(unit));
  }

  // ============================================
  // CONTROLLER SYSTEM
  // ============================================
  // Controllers handle input for each team (human, AI, or network).
  // Default is local PvP (both human). Can be changed for PvE or online play.

  // Create controller manager based on game mode from loadout
  let controllerManager: ControllerManager;
  if (loadout?.gameMode === "local-pve") {
    // PvE mode: human controls one team, AI controls the other
    const humanTeam = loadout.humanTeam || "player1";
    controllerManager = createPvEControllers(humanTeam, "medium");
  } else {
    // Default: local PvP (both teams controlled by humans)
    controllerManager = createLocalPvPControllers();
  }

  /** Get display name for a team (accounts for PvE) */
  function getTeamDisplayName(team: Team): string {
    if (loadout?.gameMode === "local-pve") {
      const humanTeam = loadout.humanTeam || "player1";
      return team === humanTeam ? "Player" : "Computer";
    }
    return team === "player1" ? "Player 1" : "Player 2";
  }

  /** Create controller context for the current turn */
  function createControllerContext(unit: Unit): ControllerContext {
    return {
      state: extractBattleState(),
      unit: extractUnitState(unit, units.indexOf(unit)),
      actionsRemaining: turnState?.actionsRemaining ?? 0,

      issueCommand(command: BattleCommand): boolean {
        if (!turnState || turnState.actionsRemaining <= 0) return false;

        // Get pending move position (if unit has a queued move, use that position)
        let fromX = unit.gridX;
        let fromZ = unit.gridZ;
        for (const action of turnState.pendingActions) {
          if (action.type === "move" && action.targetX !== undefined && action.targetZ !== undefined) {
            fromX = action.targetX;
            fromZ = action.targetZ;
          }
        }

        // Route command to appropriate queue function
        switch (command.type) {
          case "move": {
            // Validate from pending position (works for both human UI and AI)
            const validMoves = getValidMoveTiles(unit, fromX, fromZ);
            const isValid = validMoves.some(t => t.x === command.targetX && t.z === command.targetZ);
            if (isValid) {
              queueMoveAction(unit, command.targetX, command.targetZ);
              return true;
            }
            return false;
          }

          case "attack": {
            const target = findUnitById(command.targetUnitId);
            if (!target) return false;
            // Validate from pending position (works for both human UI and AI)
            const validTargets = getAttackableEnemiesWithLOS(unit, fromX, fromZ);
            if (validTargets.includes(target)) {
              queueAttackAction(unit, target);
              return true;
            }
            return false;
          }

          case "heal": {
            const target = findUnitById(command.targetUnitId);
            if (!target) return false;
            // Validate from pending position (works for both human UI and AI)
            const validTargets = getHealableAllies(unit, fromX, fromZ);
            if (validTargets.includes(target)) {
              queueHealAction(unit, target);
              return true;
            }
            return false;
          }

          case "conceal":
            if (unit.unitClass === "operator" && !unit.isConcealed) {
              queueConcealAction(unit);
              return true;
            }
            return false;

          case "cover":
            if (unit.unitClass === "soldier") {
              queueCoverAction(unit);
              return true;
            }
            return false;
        }
      },

      executeTurn(): void {
        executeQueuedActions();
      },

      undoLastCommand(): void {
        undoLastAction();
      },
    };
  }

  // Callback for when a unit's turn starts (set later by command menu)
  let onTurnStartCallback: ((unit: Unit) => void) | null = null;

  // Animation and facing functions are imported from ./battle/animations.ts
  // playAnimation, playIdleAnimation, initFacing, applyFacing, faceTarget, setUnitFacing
  // faceClosestEnemy and faceAverageEnemyPosition need units array passed in

  // LOS, adjacent tiles, and weapon range functions use wrappers defined
  // in STATE BRIDGE section that delegate to /src/battle/rules.ts

  // Check if a tile is adjacent (including diagonals)
  // isAdjacent and getValidAttackTiles use wrappers defined in STATE BRIDGE section

  // LOS-blocked material (gray for blocked targets)
  // Blocked tile material (no LOS) - using centralized color config
  const blockedMaterial = createMatteMaterial("blockedMat", rgbToColor3(HIGHLIGHT_BLOCKED));


  // ============================================
  // ANIMATED MOVEMENT
  // ============================================

  let isAnimatingMovement = false;

  function animateMovement(unit: Unit, targetX: number, targetZ: number, onComplete?: () => void): void {
    if (!unit.modelRoot) {
      moveUnit(unit, targetX, targetZ, gridOffset);
      onComplete?.();
      return;
    }

    // Get the actual path to follow (avoiding terrain)
    const path = getPathToTarget(unit, unit.gridX, unit.gridZ, targetX, targetZ);

    // Update logical position immediately
    unit.gridX = targetX;
    unit.gridZ = targetZ;

    // Recalculate cover tiles for all covering units (LOS may have changed)
    recalculateAllCoverTiles();

    // If path is just start and end (adjacent move), do simple animation
    if (path.length <= 2) {
      animateAlongPath(unit, path, onComplete);
      return;
    }

    // Animate along the path waypoints
    animateAlongPath(unit, path, onComplete);
  }

  function animateAlongPath(unit: Unit, path: { x: number; z: number }[], onComplete?: () => void): void {
    if (path.length < 2) {
      onComplete?.();
      return;
    }

    isAnimatingMovement = true;
    playAnimation(unit, "Run", true);

    let currentWaypointIndex = 0;
    const durationPerTile = MOVEMENT_DURATION_PER_TILE;
    let segmentElapsed = 0;

    // Set initial facing toward first waypoint (from start position)
    if (path.length > 1) {
      setUnitFacing(unit, path[1].x, path[1].z, path[0].x, path[0].z);
    }

    const moveObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaTime = engine.getDeltaTime() / 1000;
      segmentElapsed += deltaTime;

      const fromWaypoint = path[currentWaypointIndex];
      const toWaypoint = path[currentWaypointIndex + 1];

      const fromWorldX = fromWaypoint.x * TILE_SIZE - gridOffset;
      const fromWorldZ = fromWaypoint.z * TILE_SIZE - gridOffset;
      const toWorldX = toWaypoint.x * TILE_SIZE - gridOffset;
      const toWorldZ = toWaypoint.z * TILE_SIZE - gridOffset;

      const t = Math.min(segmentElapsed / durationPerTile, 1);
      const easeT = t; // Linear for smooth path following

      const currentX = fromWorldX + (toWorldX - fromWorldX) * easeT;
      const currentZ = fromWorldZ + (toWorldZ - fromWorldZ) * easeT;

      unit.modelRoot!.position.x = currentX;
      unit.modelRoot!.position.z = currentZ;
      unit.mesh.position.x = currentX;
      unit.mesh.position.z = currentZ;

      // Move to next waypoint
      if (t >= 1) {
        currentWaypointIndex++;
        segmentElapsed = 0;

        // Update facing for next segment (from current waypoint to next)
        if (currentWaypointIndex + 1 < path.length) {
          const currentWp = path[currentWaypointIndex];
          const nextWp = path[currentWaypointIndex + 1];
          setUnitFacing(unit, nextWp.x, nextWp.z, currentWp.x, currentWp.z);
        }

        // Check if we've reached the end
        if (currentWaypointIndex >= path.length - 1) {
          scene.onBeforeRenderObservable.remove(moveObserver);
          isAnimatingMovement = false;

          // Snap to final position
          const finalWaypoint = path[path.length - 1];
          const finalX = finalWaypoint.x * TILE_SIZE - gridOffset;
          const finalZ = finalWaypoint.z * TILE_SIZE - gridOffset;
          unit.modelRoot!.position.x = finalX;
          unit.modelRoot!.position.z = finalZ;
          unit.mesh.position.x = finalX;
          unit.mesh.position.z = finalZ;

          playIdleAnimation(unit);
          onComplete?.();
        }
      }
    });
  }

  // ============================================
  // SHADOW PREVIEW SYSTEM
  // ============================================

  let shadowMesh: Mesh | null = null;
  let shadowBaseMesh: Mesh | null = null;

  function createShadowPreview(unit: Unit, targetX: number, targetZ: number): void {
    clearShadowPreview();

    // Create semi-transparent base indicator
    shadowBaseMesh = MeshBuilder.CreateCylinder(
      "shadow_base",
      { diameter: 0.8, height: 0.08, tessellation: 24 },
      scene
    );
    const shadowBaseMat = new StandardMaterial("shadowBaseMat", scene);
    shadowBaseMat.diffuseColor = unit.teamColor;
    shadowBaseMat.alpha = SHADOW_BASE_ALPHA;
    shadowBaseMesh.material = shadowBaseMat;
    shadowBaseMesh.position = new Vector3(
      targetX * TILE_SIZE - gridOffset,
      0.1,
      targetZ * TILE_SIZE - gridOffset
    );
    shadowBaseMesh.isPickable = false; // Allow clicks to pass through

    // Create shadow silhouette (simple cylinder for now)
    shadowMesh = MeshBuilder.CreateCylinder(
      "shadow_unit",
      { diameter: 0.5, height: 1.0, tessellation: 12 },
      scene
    );
    const shadowMat = new StandardMaterial("shadowMat", scene);
    shadowMat.diffuseColor = unit.teamColor;
    shadowMat.alpha = SHADOW_UNIT_ALPHA;
    shadowMesh.material = shadowMat;
    shadowMesh.position = new Vector3(
      targetX * TILE_SIZE - gridOffset,
      0.6,
      targetZ * TILE_SIZE - gridOffset
    );
    shadowMesh.isPickable = false; // Allow clicks to pass through
  }

  function clearShadowPreview(): void {
    if (shadowMesh) {
      shadowMesh.dispose();
      shadowMesh = null;
    }
    if (shadowBaseMesh) {
      shadowBaseMesh.dispose();
      shadowBaseMesh = null;
    }
  }

  // ============================================
  // INTENT INDICATOR SYSTEM
  // ============================================

  // Store intent indicator meshes (one per pending attack/heal action)
  const intentIndicators: Mesh[] = [];

  // Create a single intent indicator at target position
  function createIntentIndicator(targetX: number, targetZ: number, color: Color3, stackIndex: number = 0): Mesh {
    const indicator = MeshBuilder.CreateCylinder(
      "intent_indicator",
      { diameter: 0.9, height: 0.06, tessellation: 24 },
      scene
    );
    const indicatorMat = new StandardMaterial("intentMat", scene);
    indicatorMat.diffuseColor = color;
    indicatorMat.emissiveColor = color.scale(0.3);  // Slight glow effect
    indicatorMat.alpha = INTENT_INDICATOR_ALPHA;
    indicator.material = indicatorMat;
    indicator.position = new Vector3(
      targetX * TILE_SIZE - gridOffset,
      0.12 + (stackIndex * 0.08),  // Stack vertically for multiple indicators
      targetZ * TILE_SIZE - gridOffset
    );
    indicator.isPickable = false;  // Don't block clicks
    return indicator;
  }

  // Clear all intent indicators
  function clearIntentIndicators(): void {
    for (const indicator of intentIndicators) {
      indicator.dispose();
    }
    intentIndicators.length = 0;
  }

  // Update intent indicators based on current pending actions
  function updateIntentIndicators(): void {
    clearIntentIndicators();

    if (!turnState) return;

    // Track how many indicators are at each position for stacking
    const positionCounts: Map<string, number> = new Map();

    function getStackIndex(x: number, z: number): number {
      const key = `${x},${z}`;
      const count = positionCounts.get(key) || 0;
      positionCounts.set(key, count + 1);
      return count;
    }

    for (const action of turnState.pendingActions) {
      if (action.type === "attack" && action.targetUnit) {
        // Attack indicator - using centralized color
        const stackIndex = getStackIndex(action.targetUnit.gridX, action.targetUnit.gridZ);
        const indicator = createIntentIndicator(
          action.targetUnit.gridX,
          action.targetUnit.gridZ,
          rgbToColor3(INTENT_COLOR_ATTACK),
          stackIndex
        );
        intentIndicators.push(indicator);
      } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
        // Heal indicator - using centralized color
        const stackIndex = getStackIndex(action.targetUnit.gridX, action.targetUnit.gridZ);
        const indicator = createIntentIndicator(
          action.targetUnit.gridX,
          action.targetUnit.gridZ,
          rgbToColor3(INTENT_COLOR_HEAL),
          stackIndex
        );
        intentIndicators.push(indicator);
      } else if (action.type === "ability" && (action.abilityName === "conceal" || action.abilityName === "cover") && action.targetUnit) {
        // Self-buff indicator - using centralized color
        const stackIndex = getStackIndex(action.targetUnit.gridX, action.targetUnit.gridZ);
        const indicator = createIntentIndicator(
          action.targetUnit.gridX,
          action.targetUnit.gridZ,
          rgbToColor3(INTENT_COLOR_BUFF),
          stackIndex
        );
        intentIndicators.push(indicator);
      }
    }
  }

  // Starting positions for each team - using centralized constants
  const player1Positions = [...PLAYER1_SPAWN_POSITIONS];
  const player2Positions = [...PLAYER2_SPAWN_POSITIONS];

  // Use loadout if provided, otherwise default setup
  const defaultUnits: UnitSelection[] = [{ unitClass: "soldier" }, { unitClass: "operator" }, { unitClass: "medic" }];
  const player1Selections = loadout?.player1 ?? defaultUnits;
  const player2Selections = loadout?.player2 ?? defaultUnits;

  // Get team colors from loadout or use centralized defaults
  const player1TeamColor = loadout?.player1TeamColor
    ? hexToColor3(loadout.player1TeamColor)
    : rgbToColor3(DEFAULT_TEAM_COLORS.player1);
  const player2TeamColor = loadout?.player2TeamColor
    ? hexToColor3(loadout.player2TeamColor)
    : rgbToColor3(DEFAULT_TEAM_COLORS.player2);

  // Spawn units asynchronously
  async function spawnAllUnits(): Promise<void> {
    // Spawn player1 units
    for (let i = 0; i < player1Selections.length; i++) {
      if (sceneDisposed) return; // Stop if scene disposed during spawn
      const pos = player1Positions[i];
      const selection = player1Selections[i];
      const unit = await createUnit(
        selection.unitClass,
        "player1",
        pos.x,
        pos.z,
        scene,
        unitMaterials,
        gridOffset,
        gui,
        i,
        player1TeamColor,
        selection.customization,
        selection.boost
      );
      if (sceneDisposed) return; // Stop if scene disposed during load
      units.push(unit);
    }

    // Spawn player2 units
    for (let i = 0; i < player2Selections.length; i++) {
      if (sceneDisposed) return; // Stop if scene disposed during spawn
      const pos = player2Positions[i];
      const selection = player2Selections[i];
      const unit = await createUnit(
        selection.unitClass,
        "player2",
        pos.x,
        pos.z,
        scene,
        unitMaterials,
        gridOffset,
        gui,
        i,
        player2TeamColor,
        selection.customization,
        selection.boost
      );
      if (sceneDisposed) return; // Stop if scene disposed during load
      units.push(unit);
    }

    // Set initial facing for all units (face average opposing team position)
    for (const unit of units) {
      initFacing(unit);  // Initialize facing config based on handedness
      faceAverageEnemyPosition(unit, units);
      // Show model and HP bar now that facing is correct
      if (unit.modelRoot) {
        unit.modelRoot.setEnabled(true);
      }
      if (unit.hpBarBg) {
        unit.hpBarBg.isVisible = true;
      }
      if (unit.designationLabel) {
        unit.designationLabel.isVisible = true;
      }
    }

    // Start the game after all units are loaded (if scene not disposed)
    if (!sceneDisposed) {
      startGame();
    }
  }

  // Start spawning (game will start when done)
  spawnAllUnits();

  // Game state
  let selectedUnit: Unit | null = null;
  let highlightedTiles: Mesh[] = [];
  let attackableUnits: Unit[] = [];
  let healableUnits: Unit[] = [];
  let gameOver = false;

  // Initiative system - ACCUMULATOR_THRESHOLD imported from config
  let currentUnit: Unit | null = null;
  let lastActingTeam: Team | null = null;
  let lastPlayerTurnTeam: Team | null = null; // For "Player X Turn" messages
  let isFirstRound = true;
  let firstRoundQueue: Unit[] = [];

  // ============================================
  // TURN HISTORY (for replay and online sync)
  // ============================================
  // Types (UnitSnapshot, UnitTurnRecord, TeamTurnRecord) imported from ../battle/replay.ts
  // These are pure data structures designed for network serialization.

  // Current team's turn being recorded
  let currentTeamTurnRecord: TeamTurnRecord | null = null;
  // Current unit's turn being recorded
  let currentUnitTurnRecord: UnitTurnRecord | null = null;
  // Previous team's complete turn (for replay)
  let previousTeamTurnRecord: TeamTurnRecord | null = null;
  // Whether replay is currently playing
  let isReplaying = false;

  /** Create a snapshot of all living units */
  function createUnitSnapshots(): UnitSnapshot[] {
    return units.filter(u => u.hp > 0).map(u => ({
      unitId: getUnitId(u),
      gridX: u.gridX,
      gridZ: u.gridZ,
      hp: u.hp,
      isConcealed: u.isConcealed,
      isCovering: u.isCovering,
      facingAngle: u.facing.currentAngle,
    }));
  }

  /** Restore units to a snapshot state (visual + logical) */
  function restoreFromSnapshots(snapshots: UnitSnapshot[]): void {
    for (const snapshot of snapshots) {
      const unit = findUnitById(snapshot.unitId);
      if (!unit) continue;

      // Restore logical state
      unit.gridX = snapshot.gridX;
      unit.gridZ = snapshot.gridZ;
      unit.hp = snapshot.hp;
      unit.isConcealed = snapshot.isConcealed;
      unit.isCovering = snapshot.isCovering;
      unit.facing.currentAngle = snapshot.facingAngle;

      // Restore visual position
      const worldX = snapshot.gridX * TILE_SIZE - gridOffset;
      const worldZ = snapshot.gridZ * TILE_SIZE - gridOffset;
      if (unit.modelRoot) {
        unit.modelRoot.position.x = worldX;
        unit.modelRoot.position.z = worldZ;
        unit.modelRoot.rotationQuaternion = null;
        unit.modelRoot.rotation.y = snapshot.facingAngle + unit.facing.baseOffset;
      }
      unit.mesh.position.x = worldX;
      unit.mesh.position.z = worldZ;

      // Restore visuals
      updateHpBar(unit);
      if (snapshot.isConcealed) {
        applyConcealVisual(unit);
      } else {
        removeConcealVisual(unit);
      }
    }

    // Clear and rebuild cover visualizations
    for (const u of units) {
      clearCoverTilesForUnit(u);
      clearCoverVisualizationForUnit(u);
    }
    for (const unit of units) {
      if (unit.isCovering && unit.hp > 0) {
        // Recalculate and show cover tiles
        const isMelee = unit.customization?.weapon ? isMeleeWeapon(unit.customization.weapon) : false;
        let coveredTiles: { x: number; z: number }[];
        if (isMelee) {
          coveredTiles = getAdjacentTiles(unit.gridX, unit.gridZ).filter(tile => {
            const isDiagonal = tile.x !== unit.gridX && tile.z !== unit.gridZ;
            return !isDiagonal || hasLineOfSight(unit.gridX, unit.gridZ, tile.x, tile.z, unit);
          });
        } else {
          coveredTiles = getTilesInLOS(unit.gridX, unit.gridZ, true, unit);
        }
        setCoverTiles(unit, coveredTiles);
        for (const { x, z } of coveredTiles) {
          createCoverBorder(unit, x, z, unit.teamColor);
        }
      }
    }
    updateHazardStripes();
  }

  // Active unit corner indicators
  let cornerMeshes: Mesh[] = [];
  let cornerMaterial: StandardMaterial | null = null;
  let pulseTime = 0;

  // getEffectiveSpeed uses wrapper defined in STATE BRIDGE section

  function createCornerIndicators(unit: Unit): void {
    clearCornerIndicators();

    // Use the unit's team color
    const color = unit.teamColor;

    cornerMaterial = new StandardMaterial("cornerMat", scene);
    cornerMaterial.diffuseColor = color;
    cornerMaterial.emissiveColor = color.scale(0.5);

    const cornerLength = 0.2;  // Length of each arm
    const cornerWidth = 0.06;  // Width/thickness of the arms
    const tileHalf = (TILE_SIZE - TILE_GAP) / 2;  // Half tile size

    // Create L-shaped corners at each corner of the tile
    // Each corner needs arms pointing inward toward tile center
    const corners = [
      { x: -tileHalf, z: -tileHalf, armDirX: 1, armDirZ: 1 },   // Bottom-left: arms go +X, +Z
      { x: tileHalf, z: -tileHalf, armDirX: -1, armDirZ: 1 },   // Bottom-right: arms go -X, +Z
      { x: tileHalf, z: tileHalf, armDirX: -1, armDirZ: -1 },   // Top-right: arms go -X, -Z
      { x: -tileHalf, z: tileHalf, armDirX: 1, armDirZ: -1 },   // Top-left: arms go +X, -Z
    ];

    const baseX = unit.gridX * TILE_SIZE - gridOffset;
    const baseZ = unit.gridZ * TILE_SIZE - gridOffset;

    for (const corner of corners) {
      // Horizontal arm (along X)
      const armX = MeshBuilder.CreateBox("cornerArmX", {
        width: cornerLength,
        height: 0.02,
        depth: cornerWidth,
      }, scene);
      armX.material = cornerMaterial;
      armX.position = new Vector3(
        baseX + corner.x + (corner.armDirX * cornerLength / 2),
        0.06,
        baseZ + corner.z + (corner.armDirZ * cornerWidth / 2)
      );
      cornerMeshes.push(armX);

      // Vertical arm (along Z)
      const armZ = MeshBuilder.CreateBox("cornerArmZ", {
        width: cornerWidth,
        height: 0.02,
        depth: cornerLength,
      }, scene);
      armZ.material = cornerMaterial;
      armZ.position = new Vector3(
        baseX + corner.x + (corner.armDirX * cornerWidth / 2),
        0.06,
        baseZ + corner.z + (corner.armDirZ * cornerLength / 2)
      );
      cornerMeshes.push(armZ);
    }
  }

  function clearCornerIndicators(): void {
    for (const mesh of cornerMeshes) {
      mesh.dispose();
    }
    cornerMeshes = [];
    if (cornerMaterial) {
      cornerMaterial.dispose();
      cornerMaterial = null;
    }
  }

  function updateCornerIndicators(unit: Unit): void {
    if (cornerMeshes.length === 0) return;

    // Recreate corners at new position (simpler than repositioning 8 meshes)
    createCornerIndicators(unit);
  }

  // Animation loop for pulsing corners
  scene.onBeforeRenderObservable.add(() => {
    if (cornerMaterial && cornerMeshes.length > 0 && currentUnit) {
      pulseTime += engine.getDeltaTime() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 4); // Pulse 4 times per second

      // Use the current unit's team color
      const baseColor = currentUnit.teamColor;

      cornerMaterial.emissiveColor = baseColor.scale(0.3 + pulse * 0.7);
    }
  });

  function buildFirstRoundQueue(): void {
    // Alternate teams: P1, P2, P1, P2, P1, P2
    // Within team, use loadout order
    const player1Units = units.filter(u => u.team === "player1").sort((a, b) => a.loadoutIndex - b.loadoutIndex);
    const player2Units = units.filter(u => u.team === "player2").sort((a, b) => a.loadoutIndex - b.loadoutIndex);

    firstRoundQueue = [];
    const maxLen = Math.max(player1Units.length, player2Units.length);
    for (let i = 0; i < maxLen; i++) {
      if (player1Units[i]) firstRoundQueue.push(player1Units[i]);
      if (player2Units[i]) firstRoundQueue.push(player2Units[i]);
    }
  }

  function getNextUnitByAccumulator(): Unit | null {
    // Add speed to all accumulators until someone hits threshold
    let readyUnits: Unit[] = [];

    // Keep ticking until at least one unit is ready
    while (readyUnits.length === 0 && units.length > 0) {
      for (const unit of units) {
        unit.accumulator += getEffectiveSpeed(unit);
        if (unit.accumulator >= ACCUMULATOR_THRESHOLD) {
          readyUnits.push(unit);
        }
      }
    }

    if (readyUnits.length === 0) return null;

    // Sort ready units by tie-breakers
    readyUnits.sort((a, b) => {
      // Primary: team that didn't just go
      if (lastActingTeam !== null) {
        if (a.team !== lastActingTeam && b.team === lastActingTeam) return -1;
        if (b.team !== lastActingTeam && a.team === lastActingTeam) return 1;
      }
      // Secondary: loadout index
      return a.loadoutIndex - b.loadoutIndex;
    });

    return readyUnits[0];
  }

  function getNextUnit(): Unit | null {
    if (isFirstRound && firstRoundQueue.length > 0) {
      return firstRoundQueue.shift() ?? null;
    }

    // After first round, use accumulator system
    if (isFirstRound) {
      isFirstRound = false;
      // Reset all accumulators for the new system
      for (const unit of units) {
        unit.accumulator = 0;
      }
    }

    return getNextUnitByAccumulator();
  }

  function startUnitTurn(unit: Unit): void {
    currentUnit = unit;
    unit.hasMoved = false;
    unit.hasAttacked = false;

    // Cancel Cover at the start of this unit's turn (before any actions can be queued)
    if (unit.isCovering) {
      console.log(`${unit.team} ${unit.unitClass}'s Cover ends at start of turn.`);
      playSfx(sfx.coverDown);
      endCover(unit);
    }

    // Reset accumulator after acting
    unit.accumulator = 0;

    // Reset all unit appearances
    for (const u of units) {
      if (u === unit) {
        resetUnitAppearance(u);
      } else {
        setUnitInactive(u);
      }
    }

    // Create pulsing corner indicators for active unit
    createCornerIndicators(unit);

    // Update screen border to current team's color
    updateScreenBorderColor(unit.teamColor);

    // Show player turn message when team changes (or at game start)
    if (unit.team !== lastPlayerTurnTeam) {
      const teamName = getTeamDisplayName(unit.team);
      showBattleMessage(`${teamName} Turn`, unit.teamColor);

      // Save previous team's turn record for replay (if exists)
      if (currentTeamTurnRecord && currentTeamTurnRecord.unitTurns.length > 0) {
        previousTeamTurnRecord = currentTeamTurnRecord;
      }
      // Start new team turn record with snapshot of current state
      currentTeamTurnRecord = {
        team: unit.team,
        unitTurns: [],
        unitSnapshots: createUnitSnapshots(),
      };

      lastPlayerTurnTeam = unit.team;
    }

    // Start recording this unit's turn
    currentUnitTurnRecord = {
      unitId: getUnitId(unit),
      startPosition: { x: unit.gridX, z: unit.gridZ },
      commands: [],
    };

    // Clear command queue for new turn
    commandQueue.clear();

    // Initialize turn state for preview/undo system (using centralized constant)
    turnState = {
      unit,
      actionsRemaining: ACTIONS_PER_TURN,
      pendingActions: [],
      originalPosition: { x: unit.gridX, z: unit.gridZ },
      originalFacing: unit.facing.currentAngle,
    };

    // Call turn start callback (for command menu update and highlighting)
    if (onTurnStartCallback) {
      onTurnStartCallback(unit);
    }

    // Note: highlightAllAvailableActions() is called in onTurnStartCallback
    // which handles all highlighting including medic green self-heal

    // Notify controller that turn has started
    // This allows AI/network controllers to take over
    const context = createControllerContext(unit);
    controllerManager.notifyTurnStart(unit.team, context);
  }

  function endCurrentUnitTurn(): void {
    const unit = currentUnit;
    if (!unit) return;

    // Save unit's turn record to team record (for replay)
    if (currentUnitTurnRecord && currentUnitTurnRecord.commands.length > 0 && currentTeamTurnRecord) {
      currentTeamTurnRecord.unitTurns.push(currentUnitTurnRecord);
    }
    currentUnitTurnRecord = null;

    // Calculate speed bonus based on unused actions (using centralized constant)
    const unusedActions = turnState?.actionsRemaining ?? 0;
    unit.speedBonus = unusedActions * SPEED_BONUS_PER_UNUSED_ACTION;

    // Show speed boost message if skipping actions
    if (unusedActions >= 2) {
      showBattleMessage("Super Speed Boost!", unit.teamColor);
      playSfx(sfx.speedUp);
    } else if (unusedActions === 1) {
      showBattleMessage("Speed Boost!", unit.teamColor);
      playSfx(sfx.speedUp);
    }

    // Clear turn state
    turnState = null;
    currentActionMode = "none";

    // Mark as exhausted visually
    setUnitExhausted(unit);

    // Clear corner indicators and previews
    clearCornerIndicators();
    clearShadowPreview();
    clearAttackPreview();
    clearIntentIndicators();

    // Notify controller that turn ended
    controllerManager.notifyTurnEnd(unit.team);

    lastActingTeam = unit.team;
    selectedUnit = null;
    currentUnit = null;
    clearHighlights();

    const nextUnit = getNextUnit();
    if (nextUnit) {
      startUnitTurn(nextUnit);
      nextUnit.speedBonus = 0;
    }
  }

  function startGame(): void {
    buildFirstRoundQueue();
    const firstUnit = getNextUnit();
    if (firstUnit) {
      startUnitTurn(firstUnit);
      firstUnit.speedBonus = 0; // Clear any initial bonus
    }
  }

  function getDefaultTileMaterial(x: number, z: number): StandardMaterial {
    return (x + z) % 2 === 0 ? tileMaterialLight : tileMaterialDark;
  }

  function clearHighlights(): void {
    for (const tile of highlightedTiles) {
      const { gridX, gridZ } = tile.metadata;
      tile.material = getDefaultTileMaterial(gridX, gridZ);
    }
    highlightedTiles = [];
    attackableUnits = [];
    healableUnits = [];

    // Always keep the active unit's tile highlighted yellow
    highlightActiveUnitTile();
  }

  // Highlight just the active unit's current tile (or shadow position) yellow
  function highlightActiveUnitTile(): void {
    if (!currentUnit) return;

    // Use shadow position if there's a pending move, otherwise current position
    const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
    const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;

    const tile = tiles[effectiveX][effectiveZ];
    tile.material = selectedMaterial;

    // Track it so it can be cleared properly later
    if (!highlightedTiles.includes(tile)) {
      highlightedTiles.push(tile);
    }
  }

  function hasActionsRemaining(): boolean {
    return turnState !== null && turnState.actionsRemaining > 0;
  }

  function getValidMoveTiles(unit: Unit, fromX?: number, fromZ?: number): { x: number; z: number }[] {
    if (!hasActionsRemaining()) return [];
    // Delegates to rules.ts via wrapper (BFS pathfinding algorithm)
    return getValidMoveTilesRaw(unit, fromX, fromZ);
  }

  // getPathToTarget delegates to rules.ts via wrapper defined in STATE BRIDGE section


  function getHealableAllies(unit: Unit, fromX?: number, fromZ?: number): Unit[] {
    // Only medic can heal, needs actions remaining
    // Heal works on self or all 8 adjacent tiles with LOS (diagonals require LOS check)
    if (unit.healAmount <= 0 || !hasActionsRemaining()) return [];

    // Use shadow position if pending move, otherwise use provided or current position
    const hasPendingMove = shadowPosition !== null;
    const effectiveX = fromX ?? shadowPosition?.x ?? unit.gridX;
    const effectiveZ = fromZ ?? shadowPosition?.z ?? unit.gridZ;

    return units.filter(u => {
      if (u.team !== unit.team) return false; // Must be same team
      if (u.hp >= u.maxHp) return false; // Already at full health

      // For the healer themselves with a pending move:
      // They can self-heal but only by clicking the shadow position (distance 0 from effective)
      if (u === unit && hasPendingMove) {
        return true;
      }

      // Self-heal (distance 0) is always allowed
      if (u.gridX === effectiveX && u.gridZ === effectiveZ) {
        return true;
      }

      // Check if ally is adjacent (including diagonals)
      if (!isAdjacent(effectiveX, effectiveZ, u.gridX, u.gridZ)) {
        return false;
      }

      // Diagonals require LOS check, ordinals always have LOS
      const isDiagonal = u.gridX !== effectiveX && u.gridZ !== effectiveZ;
      const hasLOS = isDiagonal ? hasLineOfSight(effectiveX, effectiveZ, u.gridX, u.gridZ, unit) : true;
      return hasLOS;
    });
  }

  function highlightValidActions(unit: Unit): void {
    clearHighlights();

    // Use shadow position if there's a pending move, otherwise use current position
    const effectiveX = shadowPosition?.x ?? unit.gridX;
    const effectiveZ = shadowPosition?.z ?? unit.gridZ;

    // Highlight move tiles from effective position
    const validTiles = getValidMoveTiles(unit, effectiveX, effectiveZ);
    for (const { x, z } of validTiles) {
      const tile = tiles[x][z];
      tile.material = validMoveMaterial;
      highlightedTiles.push(tile);
    }

    // Highlight effective position (shadow or current)
    const currentTile = tiles[effectiveX][effectiveZ];
    currentTile.material = selectedMaterial;
    highlightedTiles.push(currentTile);

    // Highlight healable allies (support only, from effective position)
    healableUnits = getHealableAllies(unit, effectiveX, effectiveZ);
    for (const ally of healableUnits) {
      const tile = tiles[ally.gridX][ally.gridZ];
      tile.material = healableMaterial;
      highlightedTiles.push(tile);
    }
  }

  // Highlight attack targets with LOS consideration (for attack mode)
  function highlightAttackTargets(unit: Unit, fromX?: number, fromZ?: number): void {
    clearHighlights();
    attackableUnits = [];

    if (!hasActionsRemaining()) return;

    const x = fromX ?? unit.gridX;
    const z = fromZ ?? unit.gridZ;

    // Get valid attack tiles with LOS info
    const attackTiles = getValidAttackTiles(unit, x, z);

    // Check each player2
    for (const player2 of units) {
      if (player2.team === unit.team) continue;
      if (player2.hp <= 0) continue;

      // Find if this player2's tile is in our attack tiles
      const tileInfo = attackTiles.find(t => t.x === player2.gridX && t.z === player2.gridZ);
      if (tileInfo) {
        const tile = tiles[player2.gridX][player2.gridZ];
        if (tileInfo.hasLOS) {
          tile.material = attackableMaterial;
          attackableUnits.push(player2);
        } else {
          tile.material = blockedMaterial;
        }
        highlightedTiles.push(tile);
      }
    }

    // Highlight current position (or shadow position)
    const positionTile = tiles[x][z];
    positionTile.material = selectedMaterial;
    highlightedTiles.push(positionTile);
  }

  // Get attackable enemies with LOS check
  function getAttackableEnemiesWithLOS(unit: Unit, fromX?: number, fromZ?: number): Unit[] {
    if (!hasActionsRemaining()) return [];

    const x = fromX ?? unit.gridX;
    const z = fromZ ?? unit.gridZ;

    const attackTiles = getValidAttackTiles(unit, x, z);

    return units.filter(enemy => {
      if (enemy.team === unit.team) return false;
      if (enemy.hp <= 0) return false;

      const tileInfo = attackTiles.find(t => t.x === enemy.gridX && t.z === enemy.gridZ);
      return tileInfo?.hasLOS ?? false;
    });
  }

  // ============================================
  // ABILITY FUNCTIONS
  // ============================================

  // Highlight healable allies for Medic's Heal ability
  // Works on self or all 8 adjacent tiles with LOS (diagonals require LOS check)
  function highlightHealTargets(unit: Unit, fromX?: number, fromZ?: number): void {
    clearHighlights();
    healableUnits = [];

    if (!hasActionsRemaining() || unit.healAmount <= 0) return;

    // Use shadow position if pending move, otherwise current position
    const hasPendingMove = shadowPosition !== null;
    const effectiveX = fromX ?? shadowPosition?.x ?? unit.gridX;
    const effectiveZ = fromZ ?? shadowPosition?.z ?? unit.gridZ;

    // Can heal self or adjacent allies (all 8 directions with LOS)
    for (const ally of units) {
      if (ally.team !== unit.team) continue;
      if (ally.hp >= ally.maxHp) continue;  // Already at full health

      // For the healer themselves with a pending move:
      // They can self-heal by clicking the shadow position, not their original position
      if (ally === unit && hasPendingMove) {
        // Highlight the shadow position for self-heal (effective position)
        const tile = tiles[effectiveX][effectiveZ];
        tile.material = healableMaterial;
        highlightedTiles.push(tile);
        healableUnits.push(ally);
        continue;
      }

      // Self-heal (distance 0) is always allowed
      if (ally.gridX === effectiveX && ally.gridZ === effectiveZ) {
        const tile = tiles[ally.gridX][ally.gridZ];
        tile.material = healableMaterial;
        highlightedTiles.push(tile);
        healableUnits.push(ally);
        continue;
      }

      // Check if ally is adjacent (including diagonals)
      if (!isAdjacent(effectiveX, effectiveZ, ally.gridX, ally.gridZ)) {
        continue;
      }

      // Diagonals require LOS check, ordinals always have LOS
      const isDiagonal = ally.gridX !== effectiveX && ally.gridZ !== effectiveZ;
      const hasLOS = isDiagonal ? hasLineOfSight(effectiveX, effectiveZ, ally.gridX, ally.gridZ, unit) : true;

      if (hasLOS) {
        const tile = tiles[ally.gridX][ally.gridZ];
        tile.material = healableMaterial;
        highlightedTiles.push(tile);
        healableUnits.push(ally);
      }
    }

    // Highlight effective position if not already highlighted
    const currentTile = tiles[effectiveX][effectiveZ];
    if (!highlightedTiles.includes(currentTile)) {
      currentTile.material = selectedMaterial;
      highlightedTiles.push(currentTile);
    }
  }

  // ============================================
  // UNIFIED ACTION HIGHLIGHTING (Mobile-friendly UI)
  // Shows all available actions at once: moves, attacks, and self-ability
  // ============================================

  function highlightAllAvailableActions(unit: Unit): void {
    clearHighlights();

    // Always clear target arrays to prevent stale data
    attackableUnits = [];
    healableUnits = [];

    // Always update action buttons (even if no actions remain)
    updateActionButtons();

    if (!hasActionsRemaining()) return;

    // Use shadow position if there's a pending move, otherwise current position
    const effectiveX = shadowPosition?.x ?? unit.gridX;
    const effectiveZ = shadowPosition?.z ?? unit.gridZ;

    // 1. Highlight valid move tiles (blue)
    const validTiles = getValidMoveTiles(unit, effectiveX, effectiveZ);
    for (const { x, z } of validTiles) {
      const tile = tiles[x][z];
      tile.material = validMoveMaterial;
      highlightedTiles.push(tile);
    }

    // 2. Highlight attackable enemies (red)
    const attackTiles = getValidAttackTiles(unit, effectiveX, effectiveZ);

    for (const enemy of units) {
      if (enemy.team === unit.team) continue;
      if (enemy.hp <= 0) continue;

      const tileInfo = attackTiles.find(t => t.x === enemy.gridX && t.z === enemy.gridZ);
      if (tileInfo?.hasLOS) {
        const tile = tiles[enemy.gridX][enemy.gridZ];
        tile.material = attackableMaterial;
        highlightedTiles.push(tile);
        attackableUnits.push(enemy);
      }
    }

    // 3. Highlight self for ability (based on class)
    const currentTile = tiles[effectiveX][effectiveZ];
    const classData = getClassData(unit.unitClass);

    if (classData.ability === "Heal" && unit.hp < unit.maxHp) {
      // Medic can self-heal - green highlight
      currentTile.material = healableMaterial;
    } else if (classData.ability === "Conceal" && !unit.isConcealed) {
      // Operator can conceal - yellow highlight
      currentTile.material = selectedMaterial;
    } else if (classData.ability === "Cover" && !unit.isCovering) {
      // Soldier can cover - yellow highlight
      currentTile.material = selectedMaterial;
    } else {
      // Default: yellow selected highlight
      currentTile.material = selectedMaterial;
    }
    highlightedTiles.push(currentTile);

    // 4. Also highlight healable allies for Medic
    if (classData.ability === "Heal") {
      const allies = getHealableAllies(unit, effectiveX, effectiveZ);
      for (const ally of allies) {
        if (ally !== unit) { // Skip self, already handled above
          const tile = tiles[ally.gridX][ally.gridZ];
          tile.material = healableMaterial;
          highlightedTiles.push(tile);
        }
      }
      // Include self in healableUnits if damaged
      if (unit.hp < unit.maxHp) {
        healableUnits = allies.includes(unit) ? allies : [...allies, unit];
      } else {
        healableUnits = allies;
      }
    }

    // Update action buttons visibility
    updateActionButtons();
  }

  // Conceal visual functions are imported from ./battle/unitVisuals.ts
  // applyConcealVisual, removeConcealVisual

  // Cover tiles tracking for visual display - per unit
  const coverMeshesByUnit: Map<Unit, Mesh[]> = new Map();
  // Preview meshes for pending cover actions
  let coverPreviewMeshes: Mesh[] = [];
  // Hazard stripe meshes for dual-covered tiles
  let hazardStripeMeshes: Mesh[] = [];
  // Cover tile map: tracks which tiles are covered and by which units (allows multiple)
  // Key: "x,z", Value: array of units covering that tile
  const coverTileMap: Map<string, Unit[]> = new Map();

  // Add tiles to the cover map for a unit
  function setCoverTiles(unit: Unit, tiles: { x: number; z: number }[]): void {
    for (const { x, z } of tiles) {
      const key = `${x},${z}`;
      const existing = coverTileMap.get(key) || [];
      if (!existing.includes(unit)) {
        existing.push(unit);
      }
      coverTileMap.set(key, existing);
    }
  }

  // Clear cover tiles for a specific unit
  function clearCoverTilesForUnit(unit: Unit): void {
    for (const [key, coveringUnits] of coverTileMap.entries()) {
      const index = coveringUnits.indexOf(unit);
      if (index !== -1) {
        coveringUnits.splice(index, 1);
        if (coveringUnits.length === 0) {
          coverTileMap.delete(key);
        }
      }
    }
  }

  // Get the enemy unit covering a tile (returns first enemy found, null if no enemy is covering)
  function getEnemyCoveringTile(x: number, z: number, forUnit: Unit): Unit | null {
    const coveringUnits = coverTileMap.get(`${x},${z}`);
    if (!coveringUnits) return null;
    for (const coveringUnit of coveringUnits) {
      if (coveringUnit.team !== forUnit.team && coveringUnit.hp > 0) {
        return coveringUnit;
      }
    }
    return null;
  }

  // Check if a tile is covered by both teams
  function isTileDualCovered(x: number, z: number): { player1Color?: Color3; player2Color?: Color3 } | null {
    const coveringUnits = coverTileMap.get(`${x},${z}`);
    if (!coveringUnits || coveringUnits.length < 2) return null;

    let player1Color: Color3 | undefined;
    let player2Color: Color3 | undefined;

    for (const unit of coveringUnits) {
      if (unit.team === "player1" && unit.hp > 0) {
        player1Color = unit.teamColor;
      } else if (unit.team === "player2" && unit.hp > 0) {
        player2Color = unit.teamColor;
      }
    }

    if (player1Color && player2Color) {
      return { player1Color, player2Color };
    }
    return null;
  }

  // Update hazard stripes for all dual-covered tiles
  function updateHazardStripes(): void {
    // Clear existing hazard meshes
    for (const mesh of hazardStripeMeshes) {
      mesh.dispose();
    }
    hazardStripeMeshes = [];

    // Find all dual-covered tiles and create hazard stripes
    for (const [key] of coverTileMap.entries()) {
      const [xStr, zStr] = key.split(",");
      const x = parseInt(xStr);
      const z = parseInt(zStr);
      const dualCover = isTileDualCovered(x, z);
      if (dualCover) {
        createDualCoverCorners(x, z, dualCover.player1Color!, dualCover.player2Color!);
      }
    }
  }

  // Create corner markers for dual-covered tile (no Z-fighting)
  function createDualCoverCorners(tileX: number, tileZ: number, color1: Color3, color2: Color3): void {
    const cornerSize = 0.12;
    const cornerThickness = 0.05;
    const cornerHeight = 0.08;
    const tileHalf = (TILE_SIZE - TILE_GAP) / 2;

    const worldX = tileX * TILE_SIZE - gridOffset;
    const worldZ = tileZ * TILE_SIZE - gridOffset;

    // Create materials for both colors
    const mat1 = new StandardMaterial(`dualMat1_${tileX}_${tileZ}`, scene);
    mat1.diffuseColor = color1;
    mat1.emissiveColor = color1.scale(0.4);
    mat1.alpha = 0.4;

    const mat2 = new StandardMaterial(`dualMat2_${tileX}_${tileZ}`, scene);
    mat2.diffuseColor = color2;
    mat2.emissiveColor = color2.scale(0.4);
    mat2.alpha = 0.4;

    // Create corner markers - alternating colors at each corner
    // Each corner has an L-shape made of two boxes
    const corners = [
      { x: tileHalf, z: tileHalf, mat: mat1 },     // Top-right - color1
      { x: -tileHalf, z: tileHalf, mat: mat2 },    // Top-left - color2
      { x: tileHalf, z: -tileHalf, mat: mat2 },    // Bottom-right - color2
      { x: -tileHalf, z: -tileHalf, mat: mat1 },   // Bottom-left - color1
    ];

    for (const corner of corners) {
      // Horizontal part of L - slightly larger to cover underlying corners
      const hBox = MeshBuilder.CreateBox(`dualCornerH_${tileX}_${tileZ}`, {
        width: cornerSize + 0.02,
        height: cornerHeight,
        depth: cornerThickness + 0.01,
      }, scene);
      hBox.material = corner.mat;
      hBox.position = new Vector3(
        worldX + corner.x - Math.sign(corner.x) * cornerSize / 2,
        0.09,  // Just above single-team corners (0.08)
        worldZ + corner.z
      );
      hBox.isPickable = false;
      hazardStripeMeshes.push(hBox);

      // Vertical part of L
      const vBox = MeshBuilder.CreateBox(`dualCornerV_${tileX}_${tileZ}`, {
        width: cornerThickness + 0.01,
        height: cornerHeight,
        depth: cornerSize + 0.02,
      }, scene);
      vBox.material = corner.mat;
      vBox.position = new Vector3(
        worldX + corner.x,
        0.09,
        worldZ + corner.z - Math.sign(corner.z) * cornerSize / 2
      );
      vBox.isPickable = false;
      hazardStripeMeshes.push(vBox);
    }
  }

  // End cover for a unit (clears state, visualization, and map)
  function endCover(unit: Unit): void {
    unit.isCovering = false;
    clearCoverTilesForUnit(unit);
    clearCoverVisualizationForUnit(unit);
    updateHazardStripes();  // Recalculate dual-covered tiles
  }

  // Recalculate cover tiles for all covering units (called after any movement)
  function recalculateAllCoverTiles(): void {
    for (const unit of units) {
      if (!unit.isCovering || unit.hp <= 0) continue;

      // Clear existing cover for this unit
      clearCoverTilesForUnit(unit);
      clearCoverVisualizationForUnit(unit);

      // Recalculate covered tiles based on current positions
      const isMelee = unit.customization?.weapon ? isMeleeWeapon(unit.customization.weapon) : false;
      let coveredTiles: { x: number; z: number }[];

      if (isMelee) {
        // Sword: Cover all 8 adjacent tiles with LOS check for diagonals
        coveredTiles = getAdjacentTiles(unit.gridX, unit.gridZ).filter(tile => {
          const isDiagonal = tile.x !== unit.gridX && tile.z !== unit.gridZ;
          return !isDiagonal || hasLineOfSight(unit.gridX, unit.gridZ, tile.x, tile.z, unit);
        });
      } else {
        // Gun: recalculate LOS with current unit positions
        coveredTiles = getTilesInLOS(unit.gridX, unit.gridZ, true, unit);
      }

      // Re-add to cover map and recreate visualization
      setCoverTiles(unit, coveredTiles);
      for (const { x, z } of coveredTiles) {
        createCoverBorder(unit, x, z, unit.teamColor);
      }
    }

    // Update dual-covered tile indicators
    updateHazardStripes();
  }

  // Clear cover visualization for a specific unit only
  function clearCoverVisualizationForUnit(unit: Unit): void {
    const meshes = coverMeshesByUnit.get(unit);
    if (meshes) {
      for (const mesh of meshes) {
        mesh.dispose();
      }
      coverMeshesByUnit.delete(unit);
    }
  }

  // Clear cover preview meshes
  function clearCoverPreview(): void {
    for (const mesh of coverPreviewMeshes) {
      mesh.dispose();
    }
    coverPreviewMeshes = [];
  }

  // Show cover preview for pending action (semi-transparent)
  function showCoverPreview(unit: Unit, fromX: number, fromZ: number): void {
    clearCoverPreview();

    const isMelee = unit.customization?.weapon ? isMeleeWeapon(unit.customization.weapon) : false;
    let tiles: { x: number; z: number }[];

    if (isMelee) {
      // Sword: Cover all 8 adjacent tiles with LOS check for diagonals
      tiles = getAdjacentTiles(fromX, fromZ).filter(tile => {
        const isDiagonal = tile.x !== fromX && tile.z !== fromZ;
        return !isDiagonal || hasLineOfSight(fromX, fromZ, tile.x, tile.z, unit);
      });
    } else {
      tiles = getTilesInLOS(fromX, fromZ, true, unit);
    }

    // Create preview borders (more transparent than active cover)
    for (const { x, z } of tiles) {
      createCoverBorderPreview(x, z, unit.teamColor);
    }
  }

  // Create a preview border (more transparent) - uses corner style
  function createCoverBorderPreview(tileX: number, tileZ: number, color: Color3): void {
    const cornerSize = 0.12;
    const cornerThickness = 0.05;
    const cornerHeight = 0.08;
    const tileHalf = (TILE_SIZE - TILE_GAP) / 2;

    const worldX = tileX * TILE_SIZE - gridOffset;
    const worldZ = tileZ * TILE_SIZE - gridOffset;

    const cornerMat = new StandardMaterial(`coverPreviewMat_${tileX}_${tileZ}`, scene);
    cornerMat.diffuseColor = color;
    cornerMat.emissiveColor = color.scale(COVER_PREVIEW_ALPHA);
    cornerMat.alpha = COVER_PREVIEW_ALPHA;  // More transparent for preview

    // Create L-shaped corner markers at each corner
    const corners = [
      { x: tileHalf, z: tileHalf },
      { x: -tileHalf, z: tileHalf },
      { x: tileHalf, z: -tileHalf },
      { x: -tileHalf, z: -tileHalf },
    ];

    for (const corner of corners) {
      const hBox = MeshBuilder.CreateBox(`coverPreviewH_${tileX}_${tileZ}`, {
        width: cornerSize,
        height: cornerHeight,
        depth: cornerThickness,
      }, scene);
      hBox.material = cornerMat;
      hBox.position = new Vector3(
        worldX + corner.x - Math.sign(corner.x) * cornerSize / 2,
        0.08,
        worldZ + corner.z
      );
      hBox.isPickable = false;
      coverPreviewMeshes.push(hBox);

      const vBox = MeshBuilder.CreateBox(`coverPreviewV_${tileX}_${tileZ}`, {
        width: cornerThickness,
        height: cornerHeight,
        depth: cornerSize,
      }, scene);
      vBox.material = cornerMat;
      vBox.position = new Vector3(
        worldX + corner.x,
        0.08,
        worldZ + corner.z - Math.sign(corner.z) * cornerSize / 2
      );
      vBox.isPickable = false;
      coverPreviewMeshes.push(vBox);
    }
  }

  // Check if a unit triggers cover reaction and execute it
  // Returns true if cover was triggered (caller should end turn)
  // Concealed units do not trigger cover at all
  function checkAndTriggerCoverReaction(targetUnit: Unit, onComplete: () => void): boolean {
    // Concealed units don't trigger cover
    if (targetUnit.isConcealed) {
      return false;
    }

    const coveringUnit = getEnemyCoveringTile(targetUnit.gridX, targetUnit.gridZ, targetUnit);
    if (!coveringUnit) {
      return false;
    }

    console.log(`${coveringUnit.team} ${coveringUnit.unitClass} triggers Cover reaction on ${targetUnit.team} ${targetUnit.unitClass}!`);
    showBattleMessage("Cover Counter!", coveringUnit.teamColor);

    // Execute the cover reaction attack
    executeAttack(coveringUnit, targetUnit, () => {
      // End cover after reaction
      endCover(coveringUnit);
      onComplete();
    });

    return true;
  }

  function createCoverBorder(unit: Unit, tileX: number, tileZ: number, color: Color3): void {
    const cornerSize = 0.12;
    const cornerThickness = 0.05;
    const cornerHeight = 0.08;
    const tileHalf = (TILE_SIZE - TILE_GAP) / 2;

    const worldX = tileX * TILE_SIZE - gridOffset;
    const worldZ = tileZ * TILE_SIZE - gridOffset;

    const cornerMat = new StandardMaterial(`coverCornerMat_${unit.team}_${tileX}_${tileZ}`, scene);
    cornerMat.diffuseColor = color;
    cornerMat.emissiveColor = color.scale(COVER_ACTIVE_ALPHA);
    cornerMat.alpha = COVER_ACTIVE_ALPHA;

    // Get or create mesh array for this unit
    if (!coverMeshesByUnit.has(unit)) {
      coverMeshesByUnit.set(unit, []);
    }
    const unitMeshes = coverMeshesByUnit.get(unit)!;

    // Create L-shaped corner markers at each corner
    const corners = [
      { x: tileHalf, z: tileHalf },     // Top-right
      { x: -tileHalf, z: tileHalf },    // Top-left
      { x: tileHalf, z: -tileHalf },    // Bottom-right
      { x: -tileHalf, z: -tileHalf },   // Bottom-left
    ];

    for (const corner of corners) {
      // Horizontal part of L
      const hBox = MeshBuilder.CreateBox(`coverCornerH_${tileX}_${tileZ}`, {
        width: cornerSize,
        height: cornerHeight,
        depth: cornerThickness,
      }, scene);
      hBox.material = cornerMat;
      hBox.position = new Vector3(
        worldX + corner.x - Math.sign(corner.x) * cornerSize / 2,
        0.08,
        worldZ + corner.z
      );
      hBox.isPickable = false;
      unitMeshes.push(hBox);

      // Vertical part of L
      const vBox = MeshBuilder.CreateBox(`coverCornerV_${tileX}_${tileZ}`, {
        width: cornerThickness,
        height: cornerHeight,
        depth: cornerSize,
      }, scene);
      vBox.material = cornerMat;
      vBox.position = new Vector3(
        worldX + corner.x,
        0.08,
        worldZ + corner.z - Math.sign(corner.z) * cornerSize / 2
      );
      vBox.isPickable = false;
      unitMeshes.push(vBox);
    }
  }

  function isValidMove(x: number, z: number): boolean {
    return highlightedTiles.some(tile => {
      const meta = tile.metadata;
      return meta.gridX === x && meta.gridZ === z && tile.material === validMoveMaterial;
    });
  }

  // Unit visual state functions imported from ./battle/unitVisuals.ts:
  // setUnitExhausted, setUnitInactive, resetUnitAppearance

  function checkWinCondition(): void {
    const player1Units = units.filter(u => u.team === "player1");
    const player2Units = units.filter(u => u.team === "player2");

    if (player2Units.length === 0) {
      gameOver = true;
      controllerManager.notifyGameEnd("player1");
      showGameOver(player1TeamColor, getTeamDisplayName("player1"));
    } else if (player1Units.length === 0) {
      gameOver = true;
      controllerManager.notifyGameEnd("player2");
      showGameOver(player2TeamColor, getTeamDisplayName("player2"));
    }
  }

  function showGameOver(winningColor: Color3, winnerName: string): void {
    // Update screen border to winner's color
    updateScreenBorderColor(winningColor);

    const overlay = new Rectangle();
    overlay.width = "100%";
    overlay.height = "100%";
    overlay.thickness = 0; // No border on overlay (screen border handles it)
    overlay.background = "rgba(0,0,0,0.7)";
    overlay.zIndex = 300; // Above battle messages (100) and other UI
    gui.addControl(overlay);

    const container = new StackPanel();
    container.width = screenWidth < BREAKPOINT_SMALL_MOBILE ? "95%" : "600px";
    container.height = "250px";
    overlay.addControl(container);

    // Convert Color3 to hex
    const r = Math.round(winningColor.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(winningColor.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(winningColor.b * 255).toString(16).padStart(2, '0');
    const colorHex = `#${r}${g}${b}`;

    const text = new TextBlock();
    text.text = `${winnerName}\nWins!`;
    text.color = colorHex;
    text.fontSize = screenWidth < BREAKPOINT_SMALL_MOBILE ? 48 : 72;
    text.width = "100%";
    text.height = "150px";
    text.fontWeight = "bold";
    text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    text.textWrapping = true;
    container.addControl(text);

    // Back to loadout button
    const backBtn = Button.CreateSimpleButton("backBtn", "Back to Loadout");
    backBtn.width = "200px";
    backBtn.height = "50px";
    backBtn.paddingTop = "20px";
    backBtn.color = "white";
    backBtn.background = "#444444";
    backBtn.cornerRadius = 10;
    backBtn.fontSize = 18;
    backBtn.onPointerClickObservable.add(() => {
      // Import dynamically to avoid circular dependency
      import("../main").then(main => {
        main.switchToLoadout();
      });
    });
    container.addControl(backBtn);
  }

  // updateHpBar imported from ./battle/unitVisuals.ts
  // updateTurnIndicator removed - info now shown in command menu popup

  function canSelectUnit(unit: Unit): boolean {
    // Can only select the current unit whose turn it is
    return unit === currentUnit;
  }

  // Shadow position tracking for attack preview
  let shadowPosition: { x: number; z: number } | null = null;

  // Attack preview tiles when hovering during move mode
  let attackPreviewTiles: Mesh[] = [];

  function clearAttackPreview(): void {
    for (const tile of attackPreviewTiles) {
      const { gridX, gridZ } = tile.metadata;
      // Only reset if not part of main highlights
      if (!highlightedTiles.includes(tile)) {
        tile.material = getDefaultTileMaterial(gridX, gridZ);
      }
    }
    attackPreviewTiles = [];
  }

  // Hover handling removed - mobile-focused, select only
  // Shadow preview now only appears when a move tile is clicked

  // Track if we're executing queued actions
  let isExecutingActions = false;

  // Queue a move action instead of executing immediately
  function queueMoveAction(unit: Unit, targetX: number, targetZ: number): void {
    if (!turnState || !hasActionsRemaining()) return;

    // Add command to queue
    commandQueue.enqueue(createMoveCommand(targetX, targetZ));

    // Also add to pending actions (for UI preview compatibility)
    turnState.pendingActions.push({
      type: "move",
      targetX,
      targetZ,
    });

    // Show shadow at target position
    createShadowPreview(unit, targetX, targetZ);
    shadowPosition = { x: targetX, z: targetZ };

    // Consume an action (for UI display)
    turnState.actionsRemaining--;

    // Update cover preview if there's a pending cover action
    updateCoverPreview();

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue an attack action instead of executing immediately
  function queueAttackAction(_attacker: Unit, defender: Unit): void {
    if (!turnState || !hasActionsRemaining()) return;

    // Add command to queue
    commandQueue.enqueue(createAttackCommand(getUnitId(defender)));

    // Also add to pending actions (for UI preview compatibility)
    turnState.pendingActions.push({
      type: "attack",
      targetUnit: defender,
    });

    // Consume an action (for UI display)
    turnState.actionsRemaining--;

    // Update intent indicators (red for attack)
    updateIntentIndicators();

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue a heal action instead of executing immediately
  function queueHealAction(_healer: Unit, target: Unit): void {
    if (!turnState || !hasActionsRemaining()) return;

    // Add command to queue
    commandQueue.enqueue(createHealCommand(getUnitId(target)));

    // Also add to pending actions (for UI preview compatibility)
    turnState.pendingActions.push({
      type: "ability",
      abilityName: "heal",
      targetUnit: target,
    });

    // Consume an action (for UI display)
    turnState.actionsRemaining--;

    // Update intent indicators (green for heal)
    updateIntentIndicators();

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue a conceal action instead of executing immediately
  function queueConcealAction(unit: Unit): void {
    if (!turnState || !hasActionsRemaining()) return;

    // Don't allow queuing if already concealed
    if (unit.isConcealed) {
      console.log(`${unit.team} ${unit.unitClass} is already Concealed.`);
      return;
    }

    // Add command to queue
    commandQueue.enqueue(createConcealCommand());

    // Also add to pending actions (for UI preview compatibility)
    turnState.pendingActions.push({
      type: "ability",
      abilityName: "conceal",
      targetUnit: unit,  // Self-targeting
    });

    // Consume an action
    turnState.actionsRemaining--;

    // Update intent indicators (blue for self-buff)
    updateIntentIndicators();

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue a cover action instead of executing immediately
  function queueCoverAction(unit: Unit): void {
    if (!turnState || !hasActionsRemaining()) return;

    // Add command to queue
    commandQueue.enqueue(createCoverCommand());

    // Also add to pending actions (for UI preview compatibility)
    turnState.pendingActions.push({
      type: "ability",
      abilityName: "cover",
      targetUnit: unit,  // Self-targeting
    });

    // Consume an action
    turnState.actionsRemaining--;

    // Show cover preview from effective position (considering pending moves)
    updateCoverPreview();

    // Update intent indicators (blue for self-buff)
    updateIntentIndicators();

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Update cover preview based on pending actions
  function updateCoverPreview(): void {
    clearCoverPreview();
    if (!turnState) return;

    // Find if there's a pending cover action
    const coverAction = turnState.pendingActions.find(a => a.type === "ability" && a.abilityName === "cover");
    if (!coverAction) return;

    const unit = turnState.unit;

    // Find the final position (last move in queue, or current position)
    let finalX = unit.gridX;
    let finalZ = unit.gridZ;
    for (const action of turnState.pendingActions) {
      if (action.type === "move" && action.targetX !== undefined && action.targetZ !== undefined) {
        finalX = action.targetX;
        finalZ = action.targetZ;
      }
    }

    // Show preview at final position
    showCoverPreview(unit, finalX, finalZ);
  }

  // Execute all queued actions sequentially
  // Alternative: Use processCommandQueue(commandQueue, commandExecutor) for command-based execution
  function executeQueuedActions(): void {
    if (!turnState || turnState.pendingActions.length === 0) {
      endCurrentUnitTurn();
      return;
    }

    isExecutingActions = true;
    const unit = turnState.unit;
    const actions = [...turnState.pendingActions];

    // Record commands for replay (convert visual actions to serializable commands)
    if (currentUnitTurnRecord && !isReplaying) {
      for (const action of actions) {
        if (action.type === "move" && action.targetX !== undefined && action.targetZ !== undefined) {
          currentUnitTurnRecord.commands.push(createMoveCommand(action.targetX, action.targetZ));
        } else if (action.type === "attack" && action.targetUnit) {
          currentUnitTurnRecord.commands.push(createAttackCommand(getUnitId(action.targetUnit)));
        } else if (action.type === "ability") {
          if (action.abilityName === "heal" && action.targetUnit) {
            currentUnitTurnRecord.commands.push(createHealCommand(getUnitId(action.targetUnit)));
          } else if (action.abilityName === "conceal") {
            currentUnitTurnRecord.commands.push(createConcealCommand());
          } else if (action.abilityName === "cover") {
            currentUnitTurnRecord.commands.push(createCoverCommand());
          }
        }
      }
    }

    // Note: This uses inline action processing for visual animations.
    // For headless simulation, use: processCommandQueue(commandQueue, commandExecutor);

    clearShadowPreview();
    clearAttackPreview();
    clearIntentIndicators();
    clearCoverPreview();
    shadowPosition = null;

    // Helper to get the camera target key for an action
    // Returns null for actions that don't use dramatic camera (like move)
    function getCameraTargetKey(action: typeof actions[0]): string | null {
      if (action.type === "attack" && action.targetUnit) {
        return `${unit.gridX},${unit.gridZ}->${action.targetUnit.gridX},${action.targetUnit.gridZ}`;
      } else if (action.type === "ability") {
        if (action.abilityName === "heal" && action.targetUnit) {
          return `${unit.gridX},${unit.gridZ}->${action.targetUnit.gridX},${action.targetUnit.gridZ}`;
        } else if (action.abilityName === "conceal" || action.abilityName === "cover") {
          return `${unit.gridX},${unit.gridZ}->${unit.gridX},${unit.gridZ}`;
        }
      }
      return null;
    }

    // Check if we should transition camera out after completing action at index
    function shouldTransitionOutAfter(index: number): boolean {
      const currentKey = getCameraTargetKey(actions[index]);
      if (!currentKey) return false; // No camera for this action

      // Look ahead to next action
      if (index + 1 < actions.length) {
        const nextKey = getCameraTargetKey(actions[index + 1]);
        if (nextKey === currentKey) {
          return false; // Next action has same target, don't transition out
        }
      }
      return true; // Different target or no more actions, transition out
    }

    // Helper to check cover reaction after an action completes
    // If cover is triggered, ends turn immediately; otherwise continues to next action
    // Concealed units do not trigger cover
    function afterActionWithCoverCheck(nextIndex: number): void {
      // Check if the acting unit is in a covered tile
      if (unit.hp > 0) {  // Only check if unit is still alive
        const coverTriggered = checkAndTriggerCoverReaction(unit, () => {
          // Cover reaction complete - end turn immediately (skip remaining actions)
          faceClosestEnemy(unit, units);
          isExecutingActions = false;
          endCurrentUnitTurn();
        });
        if (coverTriggered) {
          return; // Cover reaction is handling the turn end
        }
      }
      // No cover triggered, continue to next action
      processNextAction(nextIndex);
    }

    function processNextAction(index: number): void {
      if (index >= actions.length) {
        faceClosestEnemy(unit, units);
        isExecutingActions = false;
        endCurrentUnitTurn();
        return;
      }

      const action = actions[index];

      if (action.type === "move" && action.targetX !== undefined && action.targetZ !== undefined) {
        // Execute move with animation
        animateMovement(unit, action.targetX, action.targetZ, () => {
          updateCornerIndicators(unit);
          afterActionWithCoverCheck(index + 1);
        });
      } else if (action.type === "attack" && action.targetUnit) {
        // Check if target is still alive (may have been killed by previous action)
        if (action.targetUnit.hp <= 0) {
          // If we're in dramatic camera mode (previous action skipped camera out), transition out now
          if (isDramaticCamera) {
            transitionFromDramaticCamera().then(() => processNextAction(index + 1));
          } else {
            processNextAction(index + 1);
          }
          return;
        }
        // Execute attack - skip camera out if next action has same target
        const skipCameraOut = !shouldTransitionOutAfter(index);
        executeAttack(unit, action.targetUnit, () => {
          afterActionWithCoverCheck(index + 1);
        }, skipCameraOut);
      } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
        // Execute heal - skip camera out if next action has same target
        const skipCameraOut = !shouldTransitionOutAfter(index);
        executeHeal(unit, action.targetUnit, () => {
          afterActionWithCoverCheck(index + 1);
        }, skipCameraOut);
      } else if (action.type === "ability" && action.abilityName === "conceal") {
        // Execute conceal - skip camera out if next action has same target
        const skipCameraOut = !shouldTransitionOutAfter(index);
        executeConceal(unit, () => {
          afterActionWithCoverCheck(index + 1);
        }, skipCameraOut);
      } else if (action.type === "ability" && action.abilityName === "cover") {
        // Execute cover - find final position from any remaining move actions
        let finalX = unit.gridX;
        let finalZ = unit.gridZ;
        for (let i = index + 1; i < actions.length; i++) {
          const futureAction = actions[i];
          if (futureAction.type === "move" && futureAction.targetX !== undefined && futureAction.targetZ !== undefined) {
            finalX = futureAction.targetX;
            finalZ = futureAction.targetZ;
          }
        }
        // Skip camera out if next action has same target
        const skipCameraOut = !shouldTransitionOutAfter(index);
        executeCover(unit, () => {
          afterActionWithCoverCheck(index + 1);
        }, finalX, finalZ, skipCameraOut);
      } else {
        // Unknown action, skip
        processNextAction(index + 1);
      }
    }

    // Start processing
    processNextAction(0);
  }

  // Execute attack (called during execution phase)
  // Now includes dramatic camera transition for cinematic effect
  // skipCameraOut: if true, don't transition camera out (next action has same target)
  // replayOnly: if true, only play visuals/sounds/camera - skip all state changes
  function executeAttack(attacker: Unit, defender: Unit, onComplete: () => void, skipCameraOut = false): void {
    // Helper to finish the action (with or without camera transition)
    const finishAction = () => {
      if (skipCameraOut) {
        setTimeout(() => onComplete(), DRAMATIC_CAMERA_HOLD_MS);
      } else {
        setTimeout(() => {
          transitionFromDramaticCamera().then(() => onComplete());
        }, DRAMATIC_CAMERA_HOLD_MS);
      }
    };

    // Start dramatic camera transition, then execute attack
    transitionToDramaticCamera(
      attacker.gridX,
      attacker.gridZ,
      defender.gridX,
      defender.gridZ
    ).then(() => {
      setUnitFacing(attacker, defender.gridX, defender.gridZ);

      // Play attack animation based on combat style
      const isMelee = attacker.customization?.weapon ? isMeleeWeapon(attacker.customization.weapon) : false;
      const attackAnim = isMelee ? "Sword_Slash" : "Gun_Shoot";

      // Play swing/shot sound immediately with animation
      playSfx(isMelee ? sfx.swordSwing : sfx.gunShot);

      // Play attacker animation, then apply damage after a delay for impact
      playAnimation(attacker, attackAnim, false, () => {
        playIdleAnimation(attacker);
      });

      // Delay the impact to sync with attack animation (300ms for impact moment)
      setTimeout(() => {
        // Check if defender is concealed
        if (defender.isConcealed) {
          defender.isConcealed = false;
          removeConcealVisual(defender);
          console.log(`${defender.team} ${defender.unitClass}'s Conceal was broken! Damage negated!`);
          showBattleMessage("Conceal Broken!", defender.teamColor);
          playSfx(sfx.concealDown);
          // Light hit sound for conceal break
          playSfx(sfx.hitLight);

          playAnimation(defender, "HitRecieve", false, () => {
            playIdleAnimation(defender);
            finishAction();
          });
          return;
        }

        // Apply damage using weapon's damage multiplier
        const attackerWeapon = attacker.customization?.weapon ?? "pistol";
        const damage = Math.round(attacker.attack * WEAPON_DATA[attackerWeapon].damageMultiplier);
        const isMeleeAttack = isMeleeWeapon(attackerWeapon);
        defender.hp = Math.max(0, defender.hp - damage);
        console.log(`${attacker.team} ${attacker.unitClass} attacks ${defender.team} ${defender.unitClass} for ${damage} damage! (${defender.hp}/${defender.maxHp} HP)`);

        // Hit sounds based on weapon type
        if (isMeleeAttack) playSfx(sfx.hitHeavy);
        else playSfx(sfx.hitMedium);

        updateHpBar(defender);

        // Update status bar if current unit's HP changed
        if (defender === currentUnit) {
          updateCurrentUnitStatusBar();
        }

        // Cancel cover when hit (even if surviving)
        if (defender.isCovering) {
          console.log(`${defender.team} ${defender.unitClass}'s Cover is broken by being hit!`);
          showBattleMessage("Cover Broken!", defender.teamColor);
          playSfx(sfx.coverDown);
          endCover(defender);
        }

        if (defender.hp <= 0) {
          console.log(`${defender.team} ${defender.unitClass} was defeated!`);
          showBattleMessage("Unit Down!", defender.teamColor);
          playSfx(sfx.death);

          playAnimation(defender, "Death", false, () => {
            // During replay, don't dispose meshes - we'll restore state after
            if (!isReplaying) {
              defender.mesh.dispose();
              if (defender.hpBar) defender.hpBar.dispose();
              if (defender.hpBarBg) defender.hpBarBg.dispose();
              if (defender.designationLabel) defender.designationLabel.dispose();
              if (defender.modelRoot) defender.modelRoot.dispose();
              if (defender.animationGroups) defender.animationGroups.forEach(ag => ag.dispose());
            }
            finishAction();
          });

          // During replay, don't modify game state arrays
          if (!isReplaying) {
            const index = units.indexOf(defender);
            if (index > -1) units.splice(index, 1);
            const queueIndex = firstRoundQueue.indexOf(defender);
            if (queueIndex > -1) firstRoundQueue.splice(queueIndex, 1);

            checkWinCondition();
          }
        } else {
          playAnimation(defender, "HitRecieve", false, () => {
            playIdleAnimation(defender);
            finishAction();
          });
        }
      }, ATTACK_IMPACT_DELAY_MS); // Delay for attack animation to reach impact
    });
  }

  // Execute heal (called during execution phase)
  // skipCameraOut: if true, don't transition camera out (next action has same target)
  function executeHeal(healer: Unit, target: Unit, onComplete: () => void, skipCameraOut = false): void {
    // Helper to finish the action
    const finishAction = () => {
      if (skipCameraOut) {
        setTimeout(() => onComplete(), DRAMATIC_CAMERA_HOLD_MS);
      } else {
        setTimeout(() => {
          transitionFromDramaticCamera().then(() => onComplete());
        }, DRAMATIC_CAMERA_HOLD_MS);
      }
    };
    // Dramatic camera - behind healer looking at target
    transitionToDramaticCamera(healer.gridX, healer.gridZ, target.gridX, target.gridZ).then(() => {
      if (healer !== target) {
        setUnitFacing(healer, target.gridX, target.gridZ);
      }

      // Apply HP change (will be restored after replay if isReplaying)
      const healedAmount = Math.min(healer.healAmount, target.maxHp - target.hp);
      target.hp += healedAmount;
      console.log(`${healer.team} ${healer.unitClass} heals ${target.team} ${target.unitClass} for ${healedAmount} HP! (${target.hp}/${target.maxHp} HP)`);
      updateHpBar(target);

      // Update status bar if current unit's HP changed
      if (target === currentUnit && !isReplaying) {
        updateCurrentUnitStatusBar();
      }

      showBattleMessage("Heal!", healer.teamColor);
      playSfx(sfx.heal);

      if (healer.modelMeshes) {
        const weaponMeshes = healer.modelMeshes.filter(m =>
          m.name.toLowerCase().includes("sword") || m.name.toLowerCase().includes("pistol")
        );
        weaponMeshes.forEach(m => m.setEnabled(false));

        playAnimation(healer, "Interact", false, () => {
          const isMelee = healer.customization?.weapon ? isMeleeWeapon(healer.customization.weapon) : false;
          healer.modelMeshes?.forEach(m => {
            if (m.name.toLowerCase().includes("sword")) m.setEnabled(isMelee);
            else if (m.name.toLowerCase().includes("pistol")) m.setEnabled(!isMelee);
          });
          playIdleAnimation(healer);
          finishAction();
        });
      } else {
        finishAction();
      }
    });
  }

  // Execute conceal ability (called during execution phase)
  // skipCameraOut: if true, don't transition camera out (next action has same target)
  function executeConceal(unit: Unit, onComplete: () => void, skipCameraOut = false): void {
    // Helper to finish the action
    const finishAction = () => {
      if (skipCameraOut) {
        setTimeout(() => onComplete(), DRAMATIC_CAMERA_HOLD_MS);
      } else {
        setTimeout(() => {
          transitionFromDramaticCamera().then(() => onComplete());
        }, DRAMATIC_CAMERA_HOLD_MS);
      }
    };
    // Always turn conceal ON (never toggle off) - during replay state will be restored after
    if (unit.isConcealed && !isReplaying) {
      console.log(`${unit.team} ${unit.unitClass} is already Concealed.`);
      onComplete();
      return;
    }

    // Dramatic camera for self-targeting ability
    transitionToDramaticCamera(unit.gridX, unit.gridZ, unit.gridX, unit.gridZ).then(() => {
      // Apply state change (will be restored after replay if isReplaying)
      unit.isConcealed = true;
      applyConcealVisual(unit);
      console.log(`${unit.team} ${unit.unitClass} activates Conceal!`);
      showBattleMessage("Conceal!", unit.teamColor);
      playSfx(sfx.concealUp);

      // Play interact animation
      if (unit.modelMeshes) {
        const weaponMeshes = unit.modelMeshes.filter(m =>
          m.name.toLowerCase().includes("sword") || m.name.toLowerCase().includes("pistol")
        );
        weaponMeshes.forEach(m => m.setEnabled(false));

        playAnimation(unit, "Interact", false, () => {
          const isMelee = unit.customization?.weapon ? isMeleeWeapon(unit.customization.weapon) : false;
          unit.modelMeshes?.forEach(m => {
            if (m.name.toLowerCase().includes("sword")) {
              m.setEnabled(isMelee);
            } else if (m.name.toLowerCase().includes("pistol")) {
              m.setEnabled(!isMelee);
            }
          });
          playIdleAnimation(unit);
          finishAction();
        });
      } else {
        finishAction();
      }
    });
  }

  // Execute cover ability (called during execution phase)
  // fromX/fromZ allow specifying a different position (e.g., if there's a pending move after cover)
  // skipCameraOut: if true, don't transition camera out (next action has same target)
  function executeCover(unit: Unit, onComplete: () => void, fromX?: number, fromZ?: number, skipCameraOut = false): void {
    // Helper to finish the action
    const finishAction = () => {
      if (skipCameraOut) {
        setTimeout(() => onComplete(), DRAMATIC_CAMERA_HOLD_MS);
      } else {
        setTimeout(() => {
          transitionFromDramaticCamera().then(() => onComplete());
        }, DRAMATIC_CAMERA_HOLD_MS);
      }
    };

    // Dramatic camera for self-targeting ability
    transitionToDramaticCamera(unit.gridX, unit.gridZ, unit.gridX, unit.gridZ).then(() => {
      // Apply state changes (will be restored after replay if isReplaying)
      unit.isCovering = !unit.isCovering;

      // Clear existing cover for this unit only
      clearCoverTilesForUnit(unit);
      clearCoverVisualizationForUnit(unit);
      clearCoverPreview();  // Clear any pending preview

      // Use provided position or current position
      const coverX = fromX ?? unit.gridX;
      const coverZ = fromZ ?? unit.gridZ;

      if (unit.isCovering) {
        // Get covered tiles based on weapon type
        const isMelee = unit.customization?.weapon ? isMeleeWeapon(unit.customization.weapon) : false;
        let coveredTiles: { x: number; z: number }[];

        if (isMelee) {
          // Sword: Cover all 8 adjacent tiles with LOS check for diagonals
          coveredTiles = getAdjacentTiles(coverX, coverZ).filter(tile => {
            const isDiagonal = tile.x !== coverX && tile.z !== coverZ;
            return !isDiagonal || hasLineOfSight(coverX, coverZ, tile.x, tile.z, unit);
          });
        } else {
          // Gun: Cover all tiles in LOS that they could shoot (not adjacent)
          coveredTiles = getTilesInLOS(coverX, coverZ, true, unit);
        }

        // Add to cover map and create visualization
        setCoverTiles(unit, coveredTiles);
        for (const { x, z } of coveredTiles) {
          createCoverBorder(unit, x, z, unit.teamColor);
        }
        updateHazardStripes();  // Check for dual-covered tiles

        console.log(`${unit.team} ${unit.unitClass} activates Cover! (${coveredTiles.length} tiles)`);
        showBattleMessage("Cover Activated!", unit.teamColor);
        playSfx(sfx.coverUp);
      } else {
        updateHazardStripes();  // Update after deactivation
        console.log(`${unit.team} ${unit.unitClass} deactivates Cover.`);
      }

      // Play interact animation
      if (unit.modelMeshes) {
        const weaponMeshes = unit.modelMeshes.filter(m =>
          m.name.toLowerCase().includes("sword") || m.name.toLowerCase().includes("pistol")
        );
        weaponMeshes.forEach(m => m.setEnabled(false));

        playAnimation(unit, "Interact", false, () => {
          const isMelee = unit.customization?.weapon ? isMeleeWeapon(unit.customization.weapon) : false;
          unit.modelMeshes?.forEach(m => {
            if (m.name.toLowerCase().includes("sword")) {
              m.setEnabled(isMelee);
            } else if (m.name.toLowerCase().includes("pistol")) {
              m.setEnabled(!isMelee);
            }
          });
          playIdleAnimation(unit);
          finishAction();
        });
      } else {
        finishAction();
      }
    });
  }

  // ============================================
  // UNDO SYSTEM
  // ============================================

  // Undo the last queued action
  function undoLastAction(): void {
    if (!turnState || turnState.pendingActions.length === 0) return;

    // Pop from both queues
    const lastCommand = commandQueue.pop();
    const lastAction = turnState.pendingActions.pop();
    turnState.actionsRemaining++;

    // If it was a move, clear the shadow preview and update cover preview
    if (lastAction?.type === "move" || lastCommand?.type === "move") {
      clearShadowPreview();
      shadowPosition = null;
      updateCoverPreview();  // Update in case cover depends on position
    }

    // If it was a cover action, clear the cover preview
    if (lastAction?.type === "ability" && lastAction.abilityName === "cover") {
      clearCoverPreview();
    }
    if (lastCommand?.type === "cover") {
      clearCoverPreview();
    }

    // Update intent indicators to reflect remaining actions
    updateIntentIndicators();

    updateCommandMenu();

    // Restore highlights based on current action mode
    if (selectedUnit && currentUnit) {
      const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
      const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;

      switch (currentActionMode) {
        case "move":
          highlightValidActions(selectedUnit);
          break;
        case "attack":
          highlightAttackTargets(selectedUnit, effectiveX, effectiveZ);
          break;
        case "ability":
          highlightHealTargets(selectedUnit, effectiveX, effectiveZ);
          break;
        default:
          // No specific mode, just ensure active tile is highlighted
          clearHighlights();
          break;
      }
    }
  }

  // Click handling - infers action from what was clicked (no popup menu mode)
  scene.onPointerObservable.add((pointerInfo) => {
    if (gameOver) return;
    if (isAnimatingMovement || isExecutingActions || isDramaticCamera) return;  // Block input during animations
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;

    const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
    if (!pickedMesh) return;

    const metadata = pickedMesh.metadata;

    if (metadata?.type === "tile") {
      const { gridX, gridZ } = metadata;

      // Must have a selected unit with actions remaining to take actions
      if (!selectedUnit || !currentUnit || selectedUnit !== currentUnit) return;
      if (!hasActionsRemaining()) return;

      // Priority 1: Check if there's an attackable enemy on this tile
      const attackTarget = attackableUnits.find(u => u.gridX === gridX && u.gridZ === gridZ);
      if (attackTarget) {
        queueAttackAction(selectedUnit, attackTarget);
        return;
      }

      // Priority 2: Check if there's a healable ally on this tile
      const healTarget = healableUnits.find(u => u.gridX === gridX && u.gridZ === gridZ);
      if (healTarget && healTarget !== selectedUnit) {
        queueHealAction(selectedUnit, healTarget);
        return;
      }

      // Priority 3: Check if clicking unit's effective position (or shadow) for ability
      const effectiveX = shadowPosition?.x ?? selectedUnit.gridX;
      const effectiveZ = shadowPosition?.z ?? selectedUnit.gridZ;
      if (gridX === effectiveX && gridZ === effectiveZ) {
        // Clicking on self/shadow position - queue ability
        const classData = getClassData(selectedUnit.unitClass);
        // Only if ability is available (not already active)
        if (classData.ability === "Heal" && selectedUnit.hp < selectedUnit.maxHp) {
          queueHealAction(selectedUnit, selectedUnit);
        } else if (classData.ability === "Conceal" && !selectedUnit.isConcealed) {
          queueConcealAction(selectedUnit);
        } else if (classData.ability === "Cover" && !selectedUnit.isCovering) {
          queueCoverAction(selectedUnit);
        }
        return;
      }

      // Priority 4: Check if it's a valid move tile
      if (isValidMove(gridX, gridZ)) {
        queueMoveAction(selectedUnit, gridX, gridZ);
        return;
      }

      // Clicked an invalid tile - do nothing (don't deselect in no-popup mode)
    } else if (metadata?.type === "unit") {
      const clickedUnit = units.find(u =>
        u.mesh === pickedMesh ||
        u.modelMeshes?.includes(pickedMesh as AbstractMesh)
      );
      if (!clickedUnit) return;

      // If clicking an attackable enemy
      if (selectedUnit && attackableUnits.includes(clickedUnit)) {
        queueAttackAction(selectedUnit, clickedUnit);
        return;
      }

      // If clicking a healable ally (not self)
      if (selectedUnit && healableUnits.includes(clickedUnit) && clickedUnit !== selectedUnit) {
        queueHealAction(selectedUnit, clickedUnit);
        return;
      }

      // If clicking self (current unit) - queue ability
      if (selectedUnit && clickedUnit === selectedUnit) {
        const classData = getClassData(selectedUnit.unitClass);
        // Only if ability is available
        if (classData.ability === "Heal" && selectedUnit.hp < selectedUnit.maxHp) {
          queueHealAction(selectedUnit, selectedUnit);
        } else if (classData.ability === "Conceal" && !selectedUnit.isConcealed) {
          queueConcealAction(selectedUnit);
        } else if (classData.ability === "Cover" && !selectedUnit.isCovering) {
          queueCoverAction(selectedUnit);
        }
        return;
      }

      // Try to select a different unit (if it's the current unit's turn)
      if (canSelectUnit(clickedUnit)) {
        selectedUnit = clickedUnit;
        highlightAllAvailableActions(clickedUnit);
      }
    }
  });

  // Turn indicator removed - all info now in command menu popup

  // ============================================
  // CAMERA STATE
  // ============================================
  // Camera is always in rotate mode for single-touch
  // Two-finger gestures handle pan (translation) and pinch-to-zoom automatically

  // ============================================
  // DRAMATIC CAMERA SYSTEM
  // ============================================
  // When attacks are executed, camera zooms behind the attacker
  // looking at the target for a more cinematic feel

  interface SavedCameraState {
    position: Vector3;
    target: Vector3;
    lowerRadiusLimit: number;
    upperRadiusLimit: number;
  }

  let savedCameraState: SavedCameraState | null = null;
  let isDramaticCamera = false;
  let dramaticCameraAnimationId: number | null = null;
  // Track current dramatic camera target to avoid duplicate transitions
  let currentDramaticTargetKey: string | null = null;

  /**
   * Animates camera to a position behind the attacker, looking at the target.
   * Creates an over-the-shoulder dramatic view for attacks.
   * Returns a promise that resolves when the transition is complete.
   */
  function transitionToDramaticCamera(
    attackerX: number,
    attackerZ: number,
    targetX: number,
    targetZ: number
  ): Promise<void> {
    return new Promise((resolve) => {
      // Check if we're already focused on this target (avoid duplicate transitions)
      const targetKey = `${attackerX},${attackerZ}->${targetX},${targetZ}`;
      if (currentDramaticTargetKey === targetKey) {
        // Cancel any ongoing out-transition and stay put
        if (dramaticCameraAnimationId !== null) {
          cancelAnimationFrame(dramaticCameraAnimationId);
          dramaticCameraAnimationId = null;
        }
        isDramaticCamera = true; // Ensure we stay in dramatic mode
        resolve();
        return;
      }

      // Cancel any ongoing animation before starting new one
      if (dramaticCameraAnimationId !== null) {
        cancelAnimationFrame(dramaticCameraAnimationId);
        dramaticCameraAnimationId = null;
      }

      // Only save camera state if not already in dramatic mode
      if (!isDramaticCamera) {
        savedCameraState = {
          position: camera.position.clone(),
          target: camera.target.clone(),
          lowerRadiusLimit: camera.lowerRadiusLimit ?? 1,
          upperRadiusLimit: camera.upperRadiusLimit ?? 100,
        };
      }

      // Disable player controls during dramatic sequence
      camera.detachControl();
      isDramaticCamera = true;
      currentDramaticTargetKey = targetKey;

      // Temporarily remove camera limits for dramatic zoom
      camera.lowerRadiusLimit = 1;
      camera.upperRadiusLimit = 100;

      // Kill any inertia that might fight our animation
      camera.inertialAlphaOffset = 0;
      camera.inertialBetaOffset = 0;
      camera.inertialRadiusOffset = 0;
      camera.inertialPanningX = 0;
      camera.inertialPanningY = 0;

      // Calculate world positions
      const attackerWorldX = attackerX * TILE_SIZE - gridOffset;
      const attackerWorldZ = attackerZ * TILE_SIZE - gridOffset;
      const targetWorldX = targetX * TILE_SIZE - gridOffset;
      const targetWorldZ = targetZ * TILE_SIZE - gridOffset;

      // Check if self-targeting (e.g., medic self-heal)
      const isSelfTarget = attackerX === targetX && attackerZ === targetZ;

      // Camera looks at the target at chest height
      const finalTarget = new Vector3(targetWorldX, DRAMATIC_CAMERA_TARGET_HEIGHT, targetWorldZ);

      // Calculate camera position
      const camHeight = DRAMATIC_CAMERA_RADIUS * Math.cos(DRAMATIC_CAMERA_BETA);
      const camHorizDist = DRAMATIC_CAMERA_RADIUS * Math.sin(DRAMATIC_CAMERA_BETA);

      let finalCamPos: Vector3;

      if (isSelfTarget) {
        // Self-targeting: position camera at a fixed angle around the unit
        // Use the current camera's horizontal angle as a starting point
        const angle = camera.alpha;
        finalCamPos = new Vector3(
          targetWorldX + Math.sin(angle) * camHorizDist,
          finalTarget.y + camHeight,
          targetWorldZ + Math.cos(angle) * camHorizDist
        );
      } else {
        // Normal attack: position camera behind attacker
        const atkDirX = targetWorldX - attackerWorldX;
        const atkDirZ = targetWorldZ - attackerWorldZ;
        const dist = Math.sqrt(atkDirX * atkDirX + atkDirZ * atkDirZ);
        const normX = dist > 0 ? atkDirX / dist : 0;
        const normZ = dist > 0 ? atkDirZ / dist : 1;

        finalCamPos = new Vector3(
          attackerWorldX - normX * camHorizDist,
          finalTarget.y + camHeight,
          attackerWorldZ - normZ * camHorizDist
        );
      }

      // Get starting camera world position
      const startCamPos = camera.position.clone();
      const startTarget = camera.target.clone();

      // Animate the transition using world positions
      const startTime = performance.now();

      function animateFrame(): void {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / DRAMATIC_CAMERA_TRANSITION_IN_MS, 1);
        // Ease out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - t, 3);

        // Clear inertia every frame to prevent fighting
        camera.inertialAlphaOffset = 0;
        camera.inertialBetaOffset = 0;
        camera.inertialRadiusOffset = 0;

        // Interpolate world positions
        const newCamPos = Vector3.Lerp(startCamPos, finalCamPos, eased);
        const newTarget = Vector3.Lerp(startTarget, finalTarget, eased);

        // Set target first, then use setPosition to update camera
        camera.target = newTarget;
        camera.setPosition(newCamPos);

        if (t < 1) {
          dramaticCameraAnimationId = requestAnimationFrame(animateFrame);
        } else {
          dramaticCameraAnimationId = null;
          resolve();
        }
      }

      dramaticCameraAnimationId = requestAnimationFrame(animateFrame);
    });
  }

  /**
   * Transitions camera back to its saved state before the dramatic sequence.
   * Returns a promise that resolves when the transition is complete.
   */
  function transitionFromDramaticCamera(): Promise<void> {
    return new Promise((resolve) => {
      if (!savedCameraState) {
        isDramaticCamera = false;
        currentDramaticTargetKey = null;
        resolve();
        return;
      }

      const startTime = performance.now();
      const startCamPos = camera.position.clone();
      const startTarget = camera.target.clone();

      const endCamPos = savedCameraState.position;
      const endTarget = savedCameraState.target;

      function animateFrame(): void {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / DRAMATIC_CAMERA_TRANSITION_OUT_MS, 1);
        // Ease in-out cubic for smooth transition
        const eased = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Clear inertia every frame
        camera.inertialAlphaOffset = 0;
        camera.inertialBetaOffset = 0;
        camera.inertialRadiusOffset = 0;

        // Interpolate world positions
        const newCamPos = Vector3.Lerp(startCamPos, endCamPos, eased);
        const newTarget = Vector3.Lerp(startTarget, endTarget, eased);

        camera.target = newTarget;
        camera.setPosition(newCamPos);

        if (t < 1) {
          dramaticCameraAnimationId = requestAnimationFrame(animateFrame);
        } else {
          dramaticCameraAnimationId = null;
          isDramaticCamera = false;
          currentDramaticTargetKey = null;

          // Restore camera limits (grab values before nulling)
          const savedLowerLimit = savedCameraState?.lowerRadiusLimit ?? BATTLE_CAMERA_LOWER_RADIUS_LIMIT;
          const savedUpperLimit = savedCameraState?.upperRadiusLimit ?? BATTLE_CAMERA_UPPER_RADIUS_LIMIT;
          camera.lowerRadiusLimit = savedLowerLimit;
          camera.upperRadiusLimit = savedUpperLimit;
          savedCameraState = null;

          // Re-enable camera controls
          camera.attachControl(true);

          resolve();
        }
      }

      dramaticCameraAnimationId = requestAnimationFrame(animateFrame);
    });
  }

  // Replay button - top right, replays previous team's turn
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
  replayBtn.isVisible = false; // Hidden until there's a turn to replay

  const replayIcon = new TextBlock("replayIcon", "↺");
  replayIcon.fontSize = 24;
  replayIcon.color = "#888888";
  replayIcon.isHitTestVisible = false;
  replayBtn.addControl(replayIcon);

  function updateReplayButtonVisibility(): void {
    // Show replay button only when there's a previous turn to replay and not currently replaying
    replayBtn.isVisible = previousTeamTurnRecord !== null && !isReplaying && !gameOver;
    if (replayBtn.isVisible) {
      // Color based on previous team
      const teamColor = previousTeamTurnRecord!.team === "player1" ? player1TeamColor : player2TeamColor;
      const r = Math.round(teamColor.r * 255).toString(16).padStart(2, '0');
      const g = Math.round(teamColor.g * 255).toString(16).padStart(2, '0');
      const b = Math.round(teamColor.b * 255).toString(16).padStart(2, '0');
      const colorHex = `#${r}${g}${b}`;
      replayIcon.color = colorHex;
      replayBtn.color = colorHex;
    }
  }

  // Replay the previous team's turn with full state reset and re-execution
  // This executes through the exact same logic as normal gameplay for accurate replay
  async function replayPreviousTurn(): Promise<void> {
    if (!previousTeamTurnRecord || isReplaying || gameOver) return;
    if (!previousTeamTurnRecord.unitSnapshots || previousTeamTurnRecord.unitSnapshots.length === 0) {
      console.warn("Cannot replay: no snapshots available for previous turn");
      return;
    }

    isReplaying = true;
    replayBtn.isVisible = false;

    // 1. Save current state to restore after replay
    const currentStateSnapshot = createUnitSnapshots();
    const savedCameraAlpha = camera.alpha;
    const savedCameraBeta = camera.beta;
    const savedCameraRadius = camera.radius;
    const savedCameraTarget = camera.target.clone();

    // Show "Replaying..." message
    const prevTeamName = getTeamDisplayName(previousTeamTurnRecord.team);
    const prevTeamColor = previousTeamTurnRecord.team === "player1" ? player1TeamColor : player2TeamColor;
    showBattleMessage(`Replaying ${prevTeamName}...`, prevTeamColor);

    // Brief pause before starting replay
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Restore to state at start of previous team's turn
    restoreFromSnapshots(previousTeamTurnRecord.unitSnapshots);

    // 3. Execute each unit's turn through the normal execution flow
    for (const unitTurn of previousTeamTurnRecord.unitTurns) {
      const unit = findUnitById(unitTurn.unitId);
      if (!unit) continue;

      // Convert commands to visual action format used by executeQueuedActions
      await executeUnitTurnForReplay(unit, unitTurn.commands);

      // Brief pause between units
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // 4. Restore to current state after replay
    restoreFromSnapshots(currentStateSnapshot);

    // Restore camera
    camera.alpha = savedCameraAlpha;
    camera.beta = savedCameraBeta;
    camera.radius = savedCameraRadius;
    camera.target = savedCameraTarget;

    isReplaying = false;
    updateReplayButtonVisibility();
  }

  // Execute a unit's commands for replay, using the same logic as normal gameplay
  // This includes camera optimization (staying zoomed for same target)
  function executeUnitTurnForReplay(unit: Unit, commands: BattleCommand[]): Promise<void> {
    return new Promise(resolve => {
      if (commands.length === 0) {
        resolve();
        return;
      }

      // Track unit position through replay for proper camera targeting
      let currentX = unit.gridX;
      let currentZ = unit.gridZ;

      // Helper to get camera target key (same as in executeQueuedActions)
      function getCameraTargetKey(cmd: BattleCommand): string | null {
        if (cmd.type === "attack") {
          const target = findUnitById(cmd.targetUnitId);
          if (target) return `${currentX},${currentZ}->${target.gridX},${target.gridZ}`;
        } else if (cmd.type === "heal") {
          const target = findUnitById(cmd.targetUnitId);
          if (target) return `${currentX},${currentZ}->${target.gridX},${target.gridZ}`;
        } else if (cmd.type === "conceal" || cmd.type === "cover") {
          return `${currentX},${currentZ}->${currentX},${currentZ}`;
        }
        return null;
      }

      // Check if camera should transition out after this command
      function shouldTransitionOutAfter(index: number): boolean {
        const currentKey = getCameraTargetKey(commands[index]);
        if (!currentKey) return false;
        if (index + 1 < commands.length) {
          // Peek at next command's target (after updating position if current is move)
          let peekX = currentX;
          let peekZ = currentZ;
          if (commands[index].type === "move") {
            peekX = commands[index].targetX;
            peekZ = commands[index].targetZ;
          }
          // Temporarily update for peek
          const savedX = currentX;
          const savedZ = currentZ;
          currentX = peekX;
          currentZ = peekZ;
          const nextKey = getCameraTargetKey(commands[index + 1]);
          currentX = savedX;
          currentZ = savedZ;
          if (nextKey === currentKey) return false;
        }
        return true;
      }

      function processNext(index: number): void {
        if (index >= commands.length) {
          faceClosestEnemy(unit, units);
          resolve();
          return;
        }

        const command = commands[index];
        const skipCameraOut = !shouldTransitionOutAfter(index);

        switch (command.type) {
          case "move":
            // Use the same animateMovement function as normal gameplay
            animateMovement(unit, command.targetX, command.targetZ, () => {
              currentX = command.targetX;
              currentZ = command.targetZ;
              processNext(index + 1);
            });
            break;

          case "attack": {
            const target = findUnitById(command.targetUnitId);
            if (target && target.hp > 0) {
              executeAttack(unit, target, () => processNext(index + 1), skipCameraOut);
            } else {
              // Target dead or not found, skip
              if (isDramaticCamera) {
                transitionFromDramaticCamera().then(() => processNext(index + 1));
              } else {
                processNext(index + 1);
              }
            }
            break;
          }

          case "heal": {
            const target = findUnitById(command.targetUnitId);
            if (target) {
              executeHeal(unit, target, () => processNext(index + 1), skipCameraOut);
            } else {
              processNext(index + 1);
            }
            break;
          }

          case "conceal":
            executeConceal(unit, () => processNext(index + 1), skipCameraOut);
            break;

          case "cover":
            executeCover(unit, () => processNext(index + 1), currentX, currentZ, skipCameraOut);
            break;

          default:
            processNext(index + 1);
        }
      }

      processNext(0);
    });
  }

  replayBtn.onPointerUpObservable.add(() => {
    replayPreviousTurn();
  });

  // Clean up dramatic camera animation on scene dispose
  scene.onDisposeObservable.add(() => {
    if (dramaticCameraAnimationId !== null) {
      cancelAnimationFrame(dramaticCameraAnimationId);
      dramaticCameraAnimationId = null;
    }
  });

  // Show replay button in top-right corner
  gui.addControl(replayBtn);
  updateReplayButtonVisibility();

  // ============================================
  // TURN ORDER PREVIEW (Next Up indicator + modal)
  // ============================================

  // Function to predict turn order without modifying actual state
  interface PredictedTurn {
    unit: Unit;
    speedBonus: number; // The speed bonus the unit had when reaching this turn
  }

  function predictTurnOrder(count: number): PredictedTurn[] {
    const result: PredictedTurn[] = [];
    const aliveUnits = units.filter(u => u.hp > 0);
    if (aliveUnits.length === 0) return result;

    // During first round, start with remaining queue entries
    if (isFirstRound && firstRoundQueue.length > 0) {
      for (let i = 0; i < firstRoundQueue.length; i++) {
        if (firstRoundQueue[i].hp > 0) {
          result.push({ unit: firstRoundQueue[i], speedBonus: firstRoundQueue[i].speedBonus });
          if (result.length >= count) return result;
        }
      }
      // Fall through to accumulator prediction for remaining slots
    }

    // Clone accumulators and speed bonuses for simulation
    const simAccumulators = new Map<Unit, number>();
    const simSpeedBonuses = new Map<Unit, number>();
    for (const unit of aliveUnits) {
      // If we consumed the first round queue above, all units start at 0
      simAccumulators.set(unit, isFirstRound ? 0 : unit.accumulator);
      simSpeedBonuses.set(unit, isFirstRound ? 0 : unit.speedBonus);
    }

    // Track simulated "last acting team" for tie-breaking
    let simLastTeam: Team | null = isFirstRound
      ? (firstRoundQueue.length > 0 ? firstRoundQueue[firstRoundQueue.length - 1].team : lastActingTeam)
      : lastActingTeam;

    const remaining = count - result.length;
    for (let i = 0; i < remaining && aliveUnits.length > 0; i++) {
      const readyUnits: Unit[] = [];

      // Tick until someone is ready
      while (readyUnits.length === 0) {
        for (const unit of aliveUnits) {
          const simBonus = simSpeedBonuses.get(unit) || 0;
          const acc = (simAccumulators.get(unit) || 0) + unit.speed + simBonus;
          simAccumulators.set(unit, acc);
          if (acc >= ACCUMULATOR_THRESHOLD) {
            readyUnits.push(unit);
          }
        }
      }

      // Sort by tie-breakers
      readyUnits.sort((a, b) => {
        if (simLastTeam !== null) {
          if (a.team !== simLastTeam && b.team === simLastTeam) return -1;
          if (b.team !== simLastTeam && a.team === simLastTeam) return 1;
        }
        return a.loadoutIndex - b.loadoutIndex;
      });

      const nextUnit = readyUnits[0];
      result.push({ unit: nextUnit, speedBonus: simSpeedBonuses.get(nextUnit) || 0 });
      simAccumulators.set(nextUnit, 0); // Reset after acting
      simSpeedBonuses.set(nextUnit, 0); // Consume speed bonus after acting
      simLastTeam = nextUnit.team;
    }

    return result;
  }

  // Turn order button in top left - hamburger menu icon, opens modal
  const turnOrderBtn = Button.CreateSimpleButton("turnOrderBtn", "");
  turnOrderBtn.width = "44px";
  turnOrderBtn.height = "44px";
  turnOrderBtn.background = "rgba(40, 40, 50, 0.9)";
  turnOrderBtn.cornerRadius = 22;
  turnOrderBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  turnOrderBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  turnOrderBtn.left = "15px";
  turnOrderBtn.top = "15px";
  turnOrderBtn.thickness = 2;
  turnOrderBtn.color = "white";
  turnOrderBtn.isPointerBlocker = true;
  turnOrderBtn.zIndex = 50;

  // Hamburger icon (3 horizontal lines) - positioned absolutely for precise control
  const lineSpacing = 6; // pixels between line centers
  const lineHeight = 2;
  const lineWidth = 18;

  for (let i = 0; i < 3; i++) {
    const line = new Rectangle(`hamburgerLine${i}`);
    line.width = `${lineWidth}px`;
    line.height = `${lineHeight}px`;
    line.background = "white";
    line.thickness = 0;
    line.isHitTestVisible = false;
    // Center the 3 lines: offsets are -6, 0, +6 from center
    line.top = `${(i - 1) * lineSpacing}px`;
    turnOrderBtn.addControl(line);
  }

  gui.addControl(turnOrderBtn);

  // Current unit status bar - top center, between hamburger and toggle
  // Same width calculation as queue panel below
  const statusBarWidth = Math.min(screenWidth - 160, 400);
  const currentUnitStatusBar = new Rectangle("currentUnitStatusBar");
  currentUnitStatusBar.width = `${statusBarWidth}px`;
  currentUnitStatusBar.height = "58px";
  currentUnitStatusBar.background = "rgba(20, 20, 30, 0.8)";
  currentUnitStatusBar.cornerRadius = 8;
  currentUnitStatusBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  currentUnitStatusBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  currentUnitStatusBar.top = "15px";
  currentUnitStatusBar.thickness = 0;
  currentUnitStatusBar.isVisible = false;
  currentUnitStatusBar.zIndex = 10;
  gui.addControl(currentUnitStatusBar);

  // Status bar with three lines
  const statusStack = new StackPanel("statusStack");
  statusStack.isVertical = true;
  currentUnitStatusBar.addControl(statusStack);

  // Line 1: Symbol Class (team color)
  const statusLine1 = new TextBlock("statusLine1");
  statusLine1.text = "";
  statusLine1.fontSize = 12;
  statusLine1.fontWeight = "bold";
  statusLine1.color = "white";
  statusLine1.height = "18px";
  statusStack.addControl(statusLine1);

  // Line 2: [WEAPON] [BOOST] (white)
  const statusLine2 = new TextBlock("statusLine2");
  statusLine2.text = "";
  statusLine2.fontSize = 11;
  statusLine2.color = "white";
  statusLine2.height = "18px";
  statusStack.addControl(statusLine2);

  // Line 3: HP (color-coded)
  const statusHpText = new TextBlock("statusHpText");
  statusHpText.text = "";
  statusHpText.fontSize = 11;
  statusHpText.color = HP_BAR_GREEN;
  statusHpText.height = "18px";
  statusStack.addControl(statusHpText);

  function getHpColor(unit: Unit): string {
    const hpPercent = unit.hp / unit.maxHp;
    if (hpPercent < HP_LOW_THRESHOLD) return HP_BAR_RED;
    if (hpPercent < HP_MEDIUM_THRESHOLD) return HP_BAR_ORANGE;
    return HP_BAR_GREEN;
  }

  function updateCurrentUnitStatusBar(): void {
    if (!currentUnit) {
      currentUnitStatusBar.isVisible = false;
      return;
    }

    const designation = UNIT_DESIGNATIONS[currentUnit.loadoutIndex] || "?";
    const className = getClassData(currentUnit.unitClass).name;
    const weaponType = currentUnit.customization?.weapon ?? "pistol";
    const weapon = WEAPON_DATA[weaponType].name.toUpperCase();
    const boostData = BOOST_INFO[currentUnit.boost] || BOOST_INFO[0];

    // Line 1: Symbol Class (team color)
    statusLine1.text = `${designation} ${className}`;
    const r = Math.round(currentUnit.teamColor.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(currentUnit.teamColor.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(currentUnit.teamColor.b * 255).toString(16).padStart(2, '0');
    statusLine1.color = `#${r}${g}${b}`;

    // Line 2: [WEAPON] [BOOST] (white)
    statusLine2.text = `[${weapon}] [${boostData.name.toUpperCase()}]`;

    // Line 3: HP (color-coded)
    statusHpText.text = `HP: ${currentUnit.hp}/${currentUnit.maxHp}`;
    statusHpText.color = getHpColor(currentUnit);

    currentUnitStatusBar.isVisible = true;
  }

  // Turn order modal
  const turnOrderBackdrop = new Rectangle("turnOrderBackdrop");
  turnOrderBackdrop.width = "100%";
  turnOrderBackdrop.height = "100%";
  turnOrderBackdrop.background = "rgba(0, 0, 0, 0.7)";
  turnOrderBackdrop.thickness = 0;
  turnOrderBackdrop.isVisible = false;
  turnOrderBackdrop.zIndex = 100;
  turnOrderBackdrop.isPointerBlocker = true;
  gui.addControl(turnOrderBackdrop);

  const turnOrderModal = new Rectangle("turnOrderModal");
  turnOrderModal.width = isTouch ? "280px" : "320px";
  const modalHeight = Math.min(400, screenHeight - 40);
  turnOrderModal.height = `${modalHeight}px`;
  turnOrderModal.background = "#0a0a0a";
  turnOrderModal.cornerRadius = 12;
  turnOrderModal.thickness = 2;
  turnOrderModal.color = "#333333";
  turnOrderModal.isVisible = false;
  turnOrderModal.zIndex = 101;
  turnOrderModal.isPointerBlocker = true;
  gui.addControl(turnOrderModal);

  // Modal header
  const modalHeader = new Rectangle("modalHeader");
  modalHeader.width = "100%";
  modalHeader.height = "50px";
  modalHeader.background = "#151515";
  modalHeader.thickness = 0;
  modalHeader.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  turnOrderModal.addControl(modalHeader);

  const modalTitle = new TextBlock("modalTitle");
  modalTitle.text = "Turn Order";
  modalTitle.color = "#ffffff";
  modalTitle.fontSize = 18;
  modalTitle.fontWeight = "bold";
  modalHeader.addControl(modalTitle);

  // Scrollable turn order list (drag to scroll, no visible scrollbar)
  const turnOrderScroll = new ScrollViewer("turnOrderScroll");
  turnOrderScroll.width = "100%";
  turnOrderScroll.height = `${modalHeight - 110}px`;
  turnOrderScroll.top = "50px";
  turnOrderScroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  turnOrderScroll.thickness = 0;
  turnOrderScroll.barSize = 0;
  turnOrderScroll.barColor = "transparent";
  turnOrderModal.addControl(turnOrderScroll);

  const turnOrderStack = new StackPanel("turnOrderStack");
  turnOrderStack.width = "100%";
  turnOrderStack.paddingTop = "10px";
  turnOrderScroll.addControl(turnOrderStack);

  // Forfeit button footer
  const forfeitFooter = new Rectangle("forfeitFooter");
  forfeitFooter.width = "100%";
  forfeitFooter.height = "50px";
  forfeitFooter.background = "#151515";
  forfeitFooter.thickness = 0;
  forfeitFooter.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  turnOrderModal.addControl(forfeitFooter);

  const forfeitBtn = Button.CreateSimpleButton("forfeitBtn", "Forfeit");
  forfeitBtn.width = "120px";
  forfeitBtn.height = "34px";
  forfeitBtn.background = "#552222";
  forfeitBtn.color = "#ff6666";
  forfeitBtn.cornerRadius = 6;
  forfeitBtn.fontSize = 14;
  forfeitBtn.fontWeight = "bold";
  forfeitBtn.isPointerBlocker = true;
  forfeitBtn.zIndex = 50;
  forfeitFooter.addControl(forfeitBtn);

  // Forfeit confirmation modal
  const forfeitConfirmBackdrop = new Rectangle("forfeitConfirmBackdrop");
  forfeitConfirmBackdrop.width = "100%";
  forfeitConfirmBackdrop.height = "100%";
  forfeitConfirmBackdrop.background = "rgba(0, 0, 0, 0.8)";
  forfeitConfirmBackdrop.thickness = 0;
  forfeitConfirmBackdrop.isVisible = false;
  forfeitConfirmBackdrop.zIndex = 200;
  forfeitConfirmBackdrop.isPointerBlocker = true;
  gui.addControl(forfeitConfirmBackdrop);

  const forfeitConfirmPanel = new Rectangle("forfeitConfirmPanel");
  forfeitConfirmPanel.width = isTouch ? "260px" : "300px";
  forfeitConfirmPanel.height = "160px";
  forfeitConfirmPanel.background = "#0a0a0a";
  forfeitConfirmPanel.cornerRadius = 12;
  forfeitConfirmPanel.thickness = 2;
  forfeitConfirmPanel.color = "#552222";
  forfeitConfirmPanel.zIndex = 201;
  forfeitConfirmPanel.isVisible = false;
  forfeitConfirmPanel.isPointerBlocker = true;
  gui.addControl(forfeitConfirmPanel);

  const forfeitConfirmStack = new StackPanel("forfeitConfirmStack");
  forfeitConfirmStack.isVertical = true;
  forfeitConfirmStack.width = "100%";
  forfeitConfirmPanel.addControl(forfeitConfirmStack);

  const forfeitConfirmTitle = new TextBlock("forfeitConfirmTitle");
  forfeitConfirmTitle.text = "Forfeit Match?";
  forfeitConfirmTitle.color = "#ff6666";
  forfeitConfirmTitle.fontSize = 18;
  forfeitConfirmTitle.fontWeight = "bold";
  forfeitConfirmTitle.height = "40px";
  forfeitConfirmStack.addControl(forfeitConfirmTitle);

  const forfeitConfirmMsg = new TextBlock("forfeitConfirmMsg");
  forfeitConfirmMsg.text = "This will end the match.";
  forfeitConfirmMsg.color = "#aaaaaa";
  forfeitConfirmMsg.fontSize = 13;
  forfeitConfirmMsg.height = "30px";
  forfeitConfirmStack.addControl(forfeitConfirmMsg);

  const forfeitBtnRow = new StackPanel("forfeitBtnRow");
  forfeitBtnRow.isVertical = false;
  forfeitBtnRow.height = "50px";
  forfeitBtnRow.width = "220px";
  forfeitConfirmStack.addControl(forfeitBtnRow);

  const forfeitCancelBtn = Button.CreateSimpleButton("forfeitCancelBtn", "Cancel");
  forfeitCancelBtn.width = "100px";
  forfeitCancelBtn.height = "36px";
  forfeitCancelBtn.background = "#333333";
  forfeitCancelBtn.color = "white";
  forfeitCancelBtn.cornerRadius = 6;
  forfeitCancelBtn.fontSize = 14;
  forfeitCancelBtn.isPointerBlocker = true;
  forfeitBtnRow.addControl(forfeitCancelBtn);

  // Spacer
  const forfeitBtnSpacer = new Rectangle("forfeitBtnSpacer");
  forfeitBtnSpacer.width = "20px";
  forfeitBtnSpacer.height = "1px";
  forfeitBtnSpacer.thickness = 0;
  forfeitBtnRow.addControl(forfeitBtnSpacer);

  const forfeitConfirmBtn = Button.CreateSimpleButton("forfeitConfirmBtn", "Forfeit");
  forfeitConfirmBtn.width = "100px";
  forfeitConfirmBtn.height = "36px";
  forfeitConfirmBtn.background = "#882222";
  forfeitConfirmBtn.color = "#ff6666";
  forfeitConfirmBtn.cornerRadius = 6;
  forfeitConfirmBtn.fontSize = 14;
  forfeitConfirmBtn.fontWeight = "bold";
  forfeitConfirmBtn.isPointerBlocker = true;
  forfeitBtnRow.addControl(forfeitConfirmBtn);

  // Forfeit button handlers
  forfeitBtn.onPointerUpObservable.add(() => {
    hideTurnOrderModal();
    forfeitConfirmBackdrop.isVisible = true;
    forfeitConfirmPanel.isVisible = true;
  });

  forfeitCancelBtn.onPointerUpObservable.add(() => {
    forfeitConfirmBackdrop.isVisible = false;
    forfeitConfirmPanel.isVisible = false;
  });

  forfeitConfirmBackdrop.onPointerClickObservable.add(() => {
    forfeitConfirmBackdrop.isVisible = false;
    forfeitConfirmPanel.isVisible = false;
  });

  forfeitConfirmBtn.onPointerUpObservable.add(() => {
    forfeitConfirmBackdrop.isVisible = false;
    forfeitConfirmPanel.isVisible = false;
    gameOver = true;
    // The forfeiting team is the current unit's team; the other team wins
    if (currentUnit && currentUnit.team === "player1") {
      controllerManager.notifyGameEnd("player2");
      showGameOver(player2TeamColor, getTeamDisplayName("player2"));
    } else {
      controllerManager.notifyGameEnd("player1");
      showGameOver(player1TeamColor, getTeamDisplayName("player1"));
    }
  });

  // Custom drag-to-scroll for turn order modal using window events
  // (scene.onPointerObservable is blocked by GUI's isPointerBlocker)
  let modalDragging = false;
  let modalLastY = 0;

  function isInsideModal(clientX: number, clientY: number): boolean {
    const modalCenterX = engine.getRenderWidth() / 2;
    const modalCenterY = engine.getRenderHeight() / 2;
    const modalW = turnOrderModal.widthInPixels;
    const modalH = turnOrderModal.heightInPixels;
    return (
      clientX >= modalCenterX - modalW / 2 &&
      clientX <= modalCenterX + modalW / 2 &&
      clientY >= modalCenterY - modalH / 2 &&
      clientY <= modalCenterY + modalH / 2
    );
  }

  function applyScrollDelta(deltaY: number): void {
    const contentHeight = turnOrderStack.heightInPixels;
    const viewportHeight = turnOrderScroll.heightInPixels;
    const maxScroll = contentHeight - viewportHeight;
    if (maxScroll > 0) {
      const scrollDelta = deltaY / maxScroll;
      const newScroll = Math.max(0, Math.min(1, turnOrderScroll.verticalBar.value + scrollDelta));
      turnOrderScroll.verticalBar.value = newScroll;
    }
  }

  // Touch handlers
  const modalTouchStart = (e: TouchEvent) => {
    if (!turnOrderModal.isVisible) return;
    if (!isInsideModal(e.touches[0].clientX, e.touches[0].clientY)) return;
    modalDragging = true;
    modalLastY = e.touches[0].clientY;
  };

  const modalTouchMove = (e: TouchEvent) => {
    if (!modalDragging || !turnOrderModal.isVisible) return;
    const deltaY = modalLastY - e.touches[0].clientY;
    modalLastY = e.touches[0].clientY;
    applyScrollDelta(deltaY);
    e.preventDefault();
  };

  const modalTouchEnd = () => {
    modalDragging = false;
  };

  // Mouse handlers (desktop support)
  const modalMouseDown = (e: MouseEvent) => {
    if (!turnOrderModal.isVisible) return;
    if (!isInsideModal(e.clientX, e.clientY)) return;
    modalDragging = true;
    modalLastY = e.clientY;
  };

  const modalMouseMove = (e: MouseEvent) => {
    if (!modalDragging || !turnOrderModal.isVisible) return;
    const deltaY = modalLastY - e.clientY;
    modalLastY = e.clientY;
    applyScrollDelta(deltaY);
    e.preventDefault();
  };

  const modalMouseUp = () => {
    modalDragging = false;
  };

  window.addEventListener("touchstart", modalTouchStart, { passive: false });
  window.addEventListener("touchmove", modalTouchMove, { passive: false });
  window.addEventListener("touchend", modalTouchEnd);
  window.addEventListener("touchcancel", modalTouchEnd);
  window.addEventListener("mousedown", modalMouseDown);
  window.addEventListener("mousemove", modalMouseMove);
  window.addEventListener("mouseup", modalMouseUp);

  scene.onDisposeObservable.add(() => {
    window.removeEventListener("touchstart", modalTouchStart);
    window.removeEventListener("touchmove", modalTouchMove);
    window.removeEventListener("touchend", modalTouchEnd);
    window.removeEventListener("touchcancel", modalTouchEnd);
    window.removeEventListener("mousedown", modalMouseDown);
    window.removeEventListener("mousemove", modalMouseMove);
    window.removeEventListener("mouseup", modalMouseUp);
  });

  // No-op: turn order info is now only shown in modal (hamburger button)
  function updateNextUpIndicator(): void {
    // Hamburger button doesn't show dynamic text
  }

  let modalWasCameraAttached = false;

  function showTurnOrderModal(): void {
    // Remember camera state and detach so touch doesn't move the map
    modalWasCameraAttached = true; // Always true now (no pan mode toggle)
    camera.detachControl();

    // Populate turn order list
    turnOrderStack.clearControls();

    // Show current unit first
    if (currentUnit) {
      const currentRow = createTurnOrderRow(currentUnit, 0, true);
      turnOrderStack.addControl(currentRow);
    }

    // Predict next several turns
    const predicted = predictTurnOrder(6); // Show rolling 6 upcoming turns
    for (let i = 0; i < predicted.length; i++) {
      const row = createTurnOrderRow(predicted[i].unit, i + 1, false, predicted[i].speedBonus);
      turnOrderStack.addControl(row);
    }

    turnOrderBackdrop.isVisible = true;
    turnOrderModal.isVisible = true;
  }

  function hideTurnOrderModal(): void {
    turnOrderBackdrop.isVisible = false;
    turnOrderModal.isVisible = false;
    // Restore camera state from before modal opened
    if (modalWasCameraAttached) {
      camera.attachControl(true);
    }
  }

  function createTurnOrderRow(unit: Unit, index: number, isCurrent: boolean, displaySpeedBonus?: number): Rectangle {
    const row = new Rectangle(`turnOrderRow${index}`);
    row.width = "100%";
    row.height = "58px";
    row.background = isCurrent ? "rgba(255, 200, 100, 0.15)" : "transparent";
    row.thickness = 0;
    row.paddingBottom = "4px";

    // Team color indicator
    const colorBar = new Rectangle(`colorBar${index}`);
    colorBar.width = "4px";
    colorBar.height = "50px";
    const r = Math.round(unit.teamColor.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(unit.teamColor.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(unit.teamColor.b * 255).toString(16).padStart(2, '0');
    const teamColorHex = `#${r}${g}${b}`;
    colorBar.background = teamColorHex;
    colorBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    colorBar.left = "5px";
    colorBar.thickness = 0;
    row.addControl(colorBar);

    // Unit name - team colored
    const designation = UNIT_DESIGNATIONS[unit.loadoutIndex] || "?";
    const className = getClassData(unit.unitClass).name;

    const nameText = new TextBlock(`nameText${index}`);
    nameText.text = `${designation} ${className}`;
    nameText.color = teamColorHex;
    nameText.fontSize = 14;
    nameText.fontWeight = isCurrent ? "bold" : "normal";
    nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.left = "20px";
    nameText.top = "-14px";
    row.addControl(nameText);

    // Speed text (show bonus separately if present)
    // Use provided displaySpeedBonus (from simulation) if available, otherwise unit's actual bonus
    const bonus = displaySpeedBonus ?? unit.speedBonus;
    const baseSpd = unit.speed.toFixed(2);
    const speedText = new TextBlock(`speedText${index}`);
    if (bonus > 0) {
      speedText.text = `Speed: ${baseSpd} (+${bonus.toFixed(2)} skip)`;
      speedText.color = "#aad466"; // Greenish to highlight bonus
    } else {
      speedText.text = `Speed: ${baseSpd}`;
      speedText.color = "#888888";
    }
    speedText.fontSize = 11;
    speedText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    speedText.left = "20px";
    speedText.top = "2px";
    row.addControl(speedText);

    // Weapon + Boost text
    const weaponType = unit.customization?.weapon ?? "pistol";
    const weaponName = WEAPON_DATA[weaponType].name;
    const boostData = BOOST_INFO[unit.boost] || BOOST_INFO[0];
    const boostText = new TextBlock(`boostText${index}`);
    boostText.text = `${weaponName}, +${boostData.value}% ${boostData.stat}`;
    boostText.color = "#888888";
    boostText.fontSize = 11;
    boostText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    boostText.left = "20px";
    boostText.top = "16px";
    row.addControl(boostText);

    // Current indicator
    if (isCurrent) {
      const currentLabel = new TextBlock(`currentLabel${index}`);
      currentLabel.text = "NOW";
      currentLabel.color = "#ffcc66";
      currentLabel.fontSize = 10;
      currentLabel.fontWeight = "bold";
      currentLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      currentLabel.left = "-10px";
      row.addControl(currentLabel);
    }

    return row;
  }

  // Event handlers
  turnOrderBtn.onPointerUpObservable.add(() => {
    showTurnOrderModal();
  });

  // Click backdrop to close modal
  turnOrderBackdrop.onPointerClickObservable.add(() => {
    hideTurnOrderModal();
  });

  // ============================================
  // ACTION BUTTONS (Cancel & Execute)
  // ============================================

  // Cancel button - bottom left
  const cancelBtn = Button.CreateSimpleButton("cancelBtn", "✕");
  cancelBtn.width = "50px";
  cancelBtn.height = "50px";
  cancelBtn.background = "#3a2020";
  cancelBtn.color = "#ff6666";
  cancelBtn.cornerRadius = 25;
  cancelBtn.fontSize = 24;
  cancelBtn.fontWeight = "bold";
  cancelBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  cancelBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  cancelBtn.left = "15px";
  cancelBtn.top = "-15px";
  cancelBtn.thickness = 2;
  cancelBtn.isVisible = false;
  cancelBtn.isPointerBlocker = true;
  cancelBtn.zIndex = 50;
  gui.addControl(cancelBtn);

  cancelBtn.onPointerUpObservable.add(() => {
    if (!currentUnit || !turnState) return;

    // Clear the command queue
    commandQueue.clear();
    turnState.pendingActions = [];
    turnState.actionsRemaining = ACTIONS_PER_TURN;

    // Remove shadow preview
    clearShadowPreview();
    shadowPosition = null;

    // Clear cover preview
    clearCoverPreview();

    // Clear intent indicators
    clearIntentIndicators();

    // Re-highlight available actions
    highlightAllAvailableActions(currentUnit);

    // Update action buttons (they should hide since queue is empty)
    updateActionButtons();
  });

  // Execute button - bottom right
  const executeBtn = Button.CreateSimpleButton("executeBtn", "✓");
  executeBtn.width = "50px";
  executeBtn.height = "50px";
  executeBtn.background = "#203a20";
  executeBtn.color = "#66ff66";
  executeBtn.cornerRadius = 25;
  executeBtn.fontSize = 24;
  executeBtn.fontWeight = "bold";
  executeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  executeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  executeBtn.left = "-15px";
  executeBtn.top = "-15px";
  executeBtn.thickness = 2;
  executeBtn.isVisible = false;
  executeBtn.isPointerBlocker = true;
  executeBtn.zIndex = 50;
  gui.addControl(executeBtn);

  // Pulse animation state for execute button (only when all actions used - green state)
  let executePulseTime = 0;

  scene.onBeforeRenderObservable.add(() => {
    const allActionsUsed = turnState && turnState.actionsRemaining === 0;
    const shouldPulse = executeBtn.isVisible && allActionsUsed;

    if (shouldPulse) {
      executePulseTime += engine.getDeltaTime() / 1000;
      const pulse = 0.6 + 0.4 * Math.sin(executePulseTime * 4);
      executeBtn.background = `rgba(32, 80, 32, ${pulse})`;
      executeBtn.color = `rgba(102, 255, 102, ${0.7 + 0.3 * pulse})`;
    } else {
      executePulseTime = 0;
      // Don't override colors here - updateActionButtons handles that
    }
  });

  // Skip confirmation popup
  const skipConfirmBackdrop = new Rectangle("skipConfirmBackdrop");
  skipConfirmBackdrop.width = "100%";
  skipConfirmBackdrop.height = "100%";
  skipConfirmBackdrop.background = "rgba(0, 0, 0, 0.5)";
  skipConfirmBackdrop.thickness = 0;
  skipConfirmBackdrop.isVisible = false;
  skipConfirmBackdrop.zIndex = 100;
  gui.addControl(skipConfirmBackdrop);

  const skipConfirmPanel = new Rectangle("skipConfirmPanel");
  skipConfirmPanel.width = "280px";
  skipConfirmPanel.height = "120px";
  skipConfirmPanel.background = "#1a1a2a";
  skipConfirmPanel.cornerRadius = 12;
  skipConfirmPanel.thickness = 2;
  skipConfirmPanel.color = "#ffff66";
  skipConfirmPanel.zIndex = 101;
  gui.addControl(skipConfirmPanel);
  skipConfirmPanel.isVisible = false;

  const skipConfirmStack = new StackPanel("skipConfirmStack");
  skipConfirmStack.isVertical = true;
  skipConfirmPanel.addControl(skipConfirmStack);

  const skipConfirmText = new TextBlock("skipConfirmText");
  skipConfirmText.text = "Skip action for Speed Boost?";
  skipConfirmText.fontSize = 14;
  skipConfirmText.color = "white";
  skipConfirmText.height = "50px";
  skipConfirmText.textWrapping = true;
  skipConfirmStack.addControl(skipConfirmText);

  const skipConfirmBtnRow = new StackPanel("skipConfirmBtnRow");
  skipConfirmBtnRow.isVertical = false;
  skipConfirmBtnRow.height = "50px";
  skipConfirmStack.addControl(skipConfirmBtnRow);

  const skipConfirmNo = Button.CreateSimpleButton("skipConfirmNo", "Cancel");
  skipConfirmNo.width = "100px";
  skipConfirmNo.height = "36px";
  skipConfirmNo.background = "#2a2a2a";
  skipConfirmNo.color = "#aaaaaa";
  skipConfirmNo.cornerRadius = 8;
  skipConfirmNo.fontSize = 14;
  skipConfirmNo.paddingRight = "10px";
  skipConfirmBtnRow.addControl(skipConfirmNo);

  const skipConfirmYes = Button.CreateSimpleButton("skipConfirmYes", "Yes, Skip");
  skipConfirmYes.width = "100px";
  skipConfirmYes.height = "36px";
  skipConfirmYes.background = "#3a3a20";
  skipConfirmYes.color = "#ffff66";
  skipConfirmYes.cornerRadius = 8;
  skipConfirmYes.fontSize = 14;
  skipConfirmYes.paddingLeft = "10px";
  skipConfirmBtnRow.addControl(skipConfirmYes);

  function showSkipConfirm(): void {
    if (!turnState) return;
    const unusedActions = turnState.actionsRemaining;
    const speedBoost = unusedActions * SPEED_BONUS_PER_UNUSED_ACTION;
    const actionWord = unusedActions === 1 ? "action" : "actions";
    skipConfirmText.text = `Skip ${unusedActions} ${actionWord} for Speed Boost?\n(+${speedBoost.toFixed(2)})`;
    skipConfirmBackdrop.isVisible = true;
    skipConfirmPanel.isVisible = true;
  }

  function hideSkipConfirm(): void {
    skipConfirmBackdrop.isVisible = false;
    skipConfirmPanel.isVisible = false;
  }

  skipConfirmYes.onPointerClickObservable.add(() => {
    hideSkipConfirm();
    executeQueuedActions();
  });

  skipConfirmNo.onPointerClickObservable.add(() => {
    hideSkipConfirm();
  });

  skipConfirmBackdrop.onPointerClickObservable.add(() => {
    hideSkipConfirm();
  });

  executeBtn.onPointerUpObservable.add(() => {
    if (!currentUnit || !turnState) return;

    // If there are unused actions, show confirmation popup
    if (turnState.actionsRemaining > 0) {
      showSkipConfirm();
    } else {
      // All actions used, just execute
      executeQueuedActions();
    }
  });

  // Update action button visibility and style
  function updateActionButtons(): void {
    const hasQueuedActions = !!(turnState && turnState.pendingActions.length > 0);
    const isHumanTurn = !!(currentUnit && !controllerManager.isAI(currentUnit.team));
    const allActionsUsed = turnState && turnState.actionsRemaining === 0;

    cancelBtn.isVisible = isHumanTurn && hasQueuedActions;
    executeBtn.isVisible = isHumanTurn; // Always show during human turn
    queuedActionsPanel.isVisible = isHumanTurn && hasQueuedActions;

    // Update execute button appearance:
    // - Green checkmark when all actions are used (ready to execute)
    // - Yellow skip when actions remain (will show confirmation)
    if (executeBtn.textBlock) {
      if (allActionsUsed) {
        // Green checkmark - all actions used, ready to execute
        executeBtn.textBlock.text = "✓";
        executeBtn.textBlock.top = "0px";
        executeBtn.textBlock.left = "0px";
        executeBtn.background = "#203a20";
        executeBtn.color = "#66ff66";
      } else {
        // Yellow skip - has unused actions
        executeBtn.textBlock.text = "»";
        executeBtn.textBlock.top = "-2px";
        executeBtn.textBlock.left = "1px";
        executeBtn.background = "#3a3a20";
        executeBtn.color = "#ffff66";
      }
    }

    updateQueuedActionsDisplay();
  }

  // ============================================
  // ACTION COUNTER (Below designation symbol)
  // ============================================

  const actionCounterText = new TextBlock("actionCounterText");
  actionCounterText.text = "2/2";
  actionCounterText.fontSize = 12;
  actionCounterText.fontWeight = "bold";
  actionCounterText.color = "#66ff66";
  actionCounterText.outlineWidth = 2;
  actionCounterText.outlineColor = "black";
  actionCounterText.isVisible = false;
  gui.addControl(actionCounterText);

  function updateActionCounter(): void {
    if (!currentUnit || !turnState || controllerManager.isAI(currentUnit.team)) {
      actionCounterText.isVisible = false;
      return;
    }

    const remaining = turnState.actionsRemaining;
    actionCounterText.text = `${remaining}/${ACTIONS_PER_TURN}`;

    // Color based on remaining actions
    if (remaining >= 2) {
      actionCounterText.color = "#66ff66"; // Green
    } else if (remaining === 1) {
      actionCounterText.color = "#ffff66"; // Yellow
    } else {
      actionCounterText.color = "#ff6666"; // Red
    }

    // Position next to designation symbol (to the right of it)
    const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
    const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;
    const gridOffset = (GRID_SIZE * TILE_SIZE) / 2 - TILE_SIZE / 2;

    // Convert world position to screen coordinates
    const worldPos = new Vector3(
      effectiveX * TILE_SIZE - gridOffset,
      HP_BAR_ANCHOR_HEIGHT,
      effectiveZ * TILE_SIZE - gridOffset
    );
    const screenPos = Vector3.Project(
      worldPos,
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
    );

    // Position below designation symbol (centered, one line below)
    actionCounterText.left = `${screenPos.x - engine.getRenderWidth() / 2}px`;
    actionCounterText.top = `${screenPos.y - engine.getRenderHeight() / 2 + 5}px`;
    actionCounterText.isVisible = true;
  }

  // Update action counter position each frame
  scene.onBeforeRenderObservable.add(() => {
    updateActionCounter();
  });

  // ============================================
  // QUEUED ACTIONS DISPLAY (Bottom Center)
  // ============================================

  // Queue panel sits between cancel (left) and execute (right) buttons
  // Buttons are 50px wide with 15px margin = 65px, add 10px gap = 75px clear on each side
  const queuePanelWidth = Math.min(screenWidth - 160, 400); // Leave 80px each side, cap at 400px
  const queuedActionsPanel = new Rectangle("queuedActionsPanel");
  queuedActionsPanel.height = "50px";
  queuedActionsPanel.adaptHeightToChildren = true;
  queuedActionsPanel.background = "rgba(20, 20, 30, 0.8)";
  queuedActionsPanel.cornerRadius = 8;
  queuedActionsPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  queuedActionsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  queuedActionsPanel.top = "-15px";
  queuedActionsPanel.thickness = 0;
  queuedActionsPanel.width = `${queuePanelWidth}px`;
  queuedActionsPanel.paddingLeft = "10px";
  queuedActionsPanel.paddingRight = "10px";
  queuedActionsPanel.isVisible = false;

  const queuedActionsStack = new StackPanel("queuedActionsStack");
  queuedActionsStack.isVertical = true;
  queuedActionsStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  queuedActionsStack.paddingTop = "6px";
  queuedActionsStack.paddingBottom = "6px";
  queuedActionsPanel.addControl(queuedActionsStack);

  gui.addControl(queuedActionsPanel);

  // ============================================
  // BATTLE MESSAGE UI (above queued actions)
  // ============================================

  const battleMessageText = new TextBlock("battleMessage");
  battleMessageText.fontSize = 28;
  battleMessageText.fontWeight = "bold";
  battleMessageText.color = "#ffffff";
  battleMessageText.outlineColor = "#000000";
  battleMessageText.outlineWidth = 3;
  battleMessageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  battleMessageText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  battleMessageText.top = "-80px"; // Above the queued actions panel
  battleMessageText.isVisible = false;
  battleMessageText.zIndex = 100; // Above health bars and symbols
  gui.addControl(battleMessageText);

  let battleMessageTimeout: ReturnType<typeof setTimeout> | null = null;
  let battleMessageAnimationId: number | null = null;

  /**
   * Show a battle message with team color and swoop animation
   * @param text The message to display
   * @param teamColor The Color3 of the relevant team
   */
  function showBattleMessage(text: string, teamColor: Color3): void {
    // Cancel any existing message
    if (battleMessageTimeout) {
      clearTimeout(battleMessageTimeout);
      battleMessageTimeout = null;
    }
    if (battleMessageAnimationId !== null) {
      cancelAnimationFrame(battleMessageAnimationId);
      battleMessageAnimationId = null;
    }

    // Set text and color
    battleMessageText.text = text;
    battleMessageText.color = teamColor.toHexString();
    battleMessageText.isVisible = true;

    // Animation state
    const startTime = performance.now();
    const swoopInDuration = 200; // ms to swoop in from left
    const holdDuration = 1600; // ms to hold in center
    const swoopOutDuration = 200; // ms to swoop out to right
    const totalDuration = swoopInDuration + holdDuration + swoopOutDuration;

    function animate(): void {
      const elapsed = performance.now() - startTime;

      if (elapsed < swoopInDuration) {
        // Swoop in from left
        const t = elapsed / swoopInDuration;
        const easeOut = 1 - Math.pow(1 - t, 3); // Cubic ease out
        const offsetX = -300 * (1 - easeOut);
        battleMessageText.left = `${offsetX}px`;
        battleMessageAnimationId = requestAnimationFrame(animate);
      } else if (elapsed < swoopInDuration + holdDuration) {
        // Hold in center
        battleMessageText.left = "0px";
        battleMessageAnimationId = requestAnimationFrame(animate);
      } else if (elapsed < totalDuration) {
        // Swoop out to right
        const t = (elapsed - swoopInDuration - holdDuration) / swoopOutDuration;
        const easeIn = Math.pow(t, 3); // Cubic ease in
        const offsetX = 300 * easeIn;
        battleMessageText.left = `${offsetX}px`;
        battleMessageAnimationId = requestAnimationFrame(animate);
      } else {
        // Animation complete
        battleMessageText.isVisible = false;
        battleMessageText.left = "0px";
        battleMessageAnimationId = null;
      }
    }

    battleMessageAnimationId = requestAnimationFrame(animate);
  }

  function updateQueuedActionsDisplay(): void {
    queuedActionsStack.clearControls();

    if (!currentUnit || !turnState || turnState.pendingActions.length === 0) {
      return;
    }

    const total = ACTIONS_PER_TURN;
    const unitDesignation = UNIT_DESIGNATIONS[currentUnit.loadoutIndex] || "?";
    const unitClassName = getClassData(currentUnit.unitClass).name;

    // Track cumulative HP changes across queued actions
    const hpDeltas = new Map<Unit, number>();
    // Track units whose conceal will be broken by earlier queued attacks
    const concealBroken = new Set<Unit>();

    for (let i = 0; i < turnState.pendingActions.length; i++) {
      const action = turnState.pendingActions[i];
      const n = i + 1;
      const actionLine = new TextBlock();
      actionLine.fontSize = 12;
      actionLine.textWrapping = true;
      actionLine.resizeToFit = true;

      if (action.type === "move") {
        actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Move`;
        actionLine.color = "#88ccff";
      } else if (action.type === "attack" && action.targetUnit) {
        const target = action.targetUnit;
        const targetDesignation = UNIT_DESIGNATIONS[target.loadoutIndex] || "?";
        const targetClass = getClassData(target.unitClass).name;
        const currentWeapon = currentUnit.customization?.weapon ?? "pistol";
        const isMelee = isMeleeWeapon(currentWeapon);
        const baseDamage = Math.round(currentUnit.attack * WEAPON_DATA[currentWeapon].damageMultiplier);
        // Check if target is concealed (and conceal hasn't been broken by earlier action)
        const targetIsConcealed = target.isConcealed && !concealBroken.has(target);
        const damage = targetIsConcealed ? 0 : baseDamage;
        if (targetIsConcealed) {
          concealBroken.add(target); // Mark conceal as broken for subsequent actions
        }
        const pendingHp = Math.max(0, Math.min(target.maxHp, target.hp + (hpDeltas.get(target) || 0)));
        const newHp = Math.max(0, pendingHp - damage);
        hpDeltas.set(target, (hpDeltas.get(target) || 0) + (newHp - pendingHp));
        const verb = isMelee ? "Strike" : "Shoot";
        const concealNote = targetIsConcealed ? " (Conceal)" : "";
        actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} ${verb} ${targetDesignation} ${targetClass} ${pendingHp}→${newHp}${concealNote}`;
        actionLine.color = "#ff6666";
      } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
        const target = action.targetUnit;
        const healAmt = currentUnit.healAmount;
        const pendingHp = Math.max(0, Math.min(target.maxHp, target.hp + (hpDeltas.get(target) || 0)));
        const newHp = Math.min(target.maxHp, pendingHp + healAmt);
        hpDeltas.set(target, (hpDeltas.get(target) || 0) + (newHp - pendingHp));
        if (target === currentUnit) {
          actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Heal ${pendingHp}→${newHp}`;
        } else {
          const targetDesignation = UNIT_DESIGNATIONS[target.loadoutIndex] || "?";
          const targetClass = getClassData(target.unitClass).name;
          actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Heal ${targetDesignation} ${targetClass} ${pendingHp}→${newHp}`;
        }
        actionLine.color = "#66ff66";
      } else if (action.type === "ability" && action.abilityName === "conceal") {
        actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Conceal`;
        actionLine.color = "#ffff66";
      } else if (action.type === "ability" && action.abilityName === "cover") {
        actionLine.text = `Action ${n} of ${total}: ${unitDesignation} ${unitClassName} Cover`;
        actionLine.color = "#ffff66";
      }

      queuedActionsStack.addControl(actionLine);
    }
  }

  // ============================================
  // COMMAND MENU UI
  // ============================================

  // Main menu container - bottom left
  const commandMenu = new Rectangle("commandMenu");
  commandMenu.width = "200px";
  commandMenu.height = "340px";
  commandMenu.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  commandMenu.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  commandMenu.left = "20px";
  commandMenu.top = "-20px";
  commandMenu.background = "#1a1a2e";
  commandMenu.cornerRadius = 10;
  commandMenu.thickness = 2;
  commandMenu.color = "#4488ff";  // Will be updated to team color
  commandMenu.isVisible = false;
  gui.addControl(commandMenu);

  // Menu layout
  const menuStack = new StackPanel("menuStack");
  menuStack.width = "100%";
  menuStack.paddingTop = "10px";
  menuStack.paddingLeft = "10px";
  menuStack.paddingRight = "10px";
  commandMenu.addControl(menuStack);

  // Unit name header
  const menuUnitName = new TextBlock("menuUnitName");
  menuUnitName.text = "SOLDIER";
  menuUnitName.color = "#ffffff";
  menuUnitName.fontSize = 18;
  menuUnitName.fontWeight = "bold";
  menuUnitName.height = "30px";
  menuUnitName.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  menuStack.addControl(menuUnitName);

  // Actions remaining text
  const menuActionsText = new TextBlock("menuActionsText");
  menuActionsText.text = "Actions: 2/2";
  menuActionsText.color = "#aaaaaa";
  menuActionsText.fontSize = 12;
  menuActionsText.height = "20px";
  menuActionsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  menuStack.addControl(menuActionsText);

  // Separator
  const menuSeparator1 = new Rectangle("menuSeparator1");
  menuSeparator1.width = "90%";
  menuSeparator1.height = "2px";
  menuSeparator1.background = "#333355";
  menuSeparator1.thickness = 0;
  menuStack.addControl(menuSeparator1);

  // Action buttons container
  const actionButtonsStack = new StackPanel("actionButtons");
  actionButtonsStack.width = "100%";
  actionButtonsStack.height = "100px";
  actionButtonsStack.paddingTop = "5px";
  menuStack.addControl(actionButtonsStack);

  // Move button
  const moveBtn = Button.CreateSimpleButton("moveBtn", "Move");
  moveBtn.width = "100%";
  moveBtn.height = "28px";
  moveBtn.color = "white";
  moveBtn.background = "#335588";
  moveBtn.cornerRadius = 5;
  moveBtn.fontSize = 14;
  moveBtn.paddingBottom = "3px";
  moveBtn.onPointerClickObservable.add(() => {
    if (currentUnit && !isAnimatingMovement && !isDramaticCamera) {
      currentActionMode = "move";
      selectedUnit = currentUnit;
      highlightValidActions(currentUnit);
    }
  });
  actionButtonsStack.addControl(moveBtn);

  // Attack button
  const attackBtn = Button.CreateSimpleButton("attackBtn", "Attack");
  attackBtn.width = "100%";
  attackBtn.height = "28px";
  attackBtn.color = "white";
  attackBtn.background = "#883333";
  attackBtn.cornerRadius = 5;
  attackBtn.fontSize = 14;
  attackBtn.paddingBottom = "3px";
  attackBtn.onPointerClickObservable.add(() => {
    if (currentUnit && !isAnimatingMovement && !isDramaticCamera) {
      currentActionMode = "attack";
      selectedUnit = currentUnit;
      // Highlight attack targets from shadow position (if pending move) or current position
      const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
      const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;
      highlightAttackTargets(currentUnit, effectiveX, effectiveZ);
    }
  });
  actionButtonsStack.addControl(attackBtn);

  // Ability button (changes based on unit type)
  const abilityBtn = Button.CreateSimpleButton("abilityBtn", "Ability");
  abilityBtn.width = "100%";
  abilityBtn.height = "28px";
  abilityBtn.color = "white";
  abilityBtn.background = "#338855";
  abilityBtn.cornerRadius = 5;
  abilityBtn.fontSize = 14;
  abilityBtn.onPointerClickObservable.add(() => {
    if (currentUnit && !isAnimatingMovement && !isDramaticCamera && hasActionsRemaining()) {
      if (currentUnit.unitClass === "medic") {
        // Heal mode - highlight healable allies
        currentActionMode = "ability";
        selectedUnit = currentUnit;
        highlightHealTargets(currentUnit);
      } else if (currentUnit.unitClass === "operator") {
        // Conceal - queue as action
        queueConcealAction(currentUnit);
      } else if (currentUnit.unitClass === "soldier") {
        // Cover - queue as action
        queueCoverAction(currentUnit);
      }
    }
  });
  actionButtonsStack.addControl(abilityBtn);

  // Separator
  const menuSeparator2 = new Rectangle("menuSeparator2");
  menuSeparator2.width = "90%";
  menuSeparator2.height = "2px";
  menuSeparator2.background = "#333355";
  menuSeparator2.thickness = 0;
  menuStack.addControl(menuSeparator2);

  // Turn preview section
  const previewLabel = new TextBlock("previewLabel");
  previewLabel.text = "Turn Preview:";
  previewLabel.color = "#888888";
  previewLabel.fontSize = 11;
  previewLabel.height = "18px";
  previewLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  previewLabel.paddingTop = "5px";
  menuStack.addControl(previewLabel);

  const previewText = new TextBlock("previewText");
  previewText.text = "(no actions queued)";
  previewText.color = "#aaaaaa";
  previewText.fontSize = 11;
  previewText.height = "80px";
  previewText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  previewText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  previewText.textWrapping = true;
  menuStack.addControl(previewText);

  // Bottom buttons (Undo / Execute)
  const bottomButtonsGrid = new Grid("bottomButtons");
  bottomButtonsGrid.width = "100%";
  bottomButtonsGrid.height = "35px";
  bottomButtonsGrid.addColumnDefinition(0.5);
  bottomButtonsGrid.addColumnDefinition(0.5);
  bottomButtonsGrid.addRowDefinition(1);
  menuStack.addControl(bottomButtonsGrid);

  const undoBtn = Button.CreateSimpleButton("undoBtn", "Undo");
  undoBtn.width = "95%";
  undoBtn.height = "28px";
  undoBtn.color = "#ff8888";
  undoBtn.background = "#442222";
  undoBtn.cornerRadius = 5;
  undoBtn.fontSize = 12;
  undoBtn.onPointerClickObservable.add(() => {
    undoLastAction();
  });
  bottomButtonsGrid.addControl(undoBtn, 0, 0);

  const menuExecuteBtn = Button.CreateSimpleButton("menuExecuteBtn", "Execute");
  menuExecuteBtn.width = "95%";
  menuExecuteBtn.height = "28px";
  menuExecuteBtn.color = "white";
  menuExecuteBtn.background = "#338833";
  menuExecuteBtn.cornerRadius = 5;
  menuExecuteBtn.fontSize = 12;
  menuExecuteBtn.onPointerClickObservable.add(() => {
    if (currentUnit && !isExecutingActions && !isDramaticCamera) {
      executeQueuedActions();
    }
  });
  bottomButtonsGrid.addControl(menuExecuteBtn, 0, 1);

  // Pulse the menu execute button when actions are queued
  let menuExecutePulseTime = 0;
  scene.onBeforeRenderObservable.add(() => {
    const shouldPulse = turnState && turnState.pendingActions.length > 0 && turnState.actionsRemaining === 0;
    if (shouldPulse) {
      menuExecutePulseTime += engine.getDeltaTime() / 1000;
      const pulse = 0.7 + 0.3 * Math.sin(menuExecutePulseTime * 4);
      const g = Math.round(0x88 * pulse);
      const gHex = g.toString(16).padStart(2, '0');
      menuExecuteBtn.background = `#33${gHex}33`;
    } else {
      menuExecutePulseTime = 0;
      menuExecuteBtn.background = "#338833";
    }
  });

  // Function to update menu for current unit
  // Note: Command menu is now hidden - using simplified action buttons instead
  function updateCommandMenu(): void {
    // Always hide command menu - we use the new mobile UI
    commandMenu.isVisible = false;

    if (!currentUnit) {
      return;
    }

    // Hide menu for AI-controlled units
    if (controllerManager.isAI(currentUnit.team)) {
      return;
    }

    // Keep the rest of the function for updating internal state (but menu stays hidden)

    // Position menu based on team (P1 = left, P2 = right)
    if (currentUnit.team === "player1") {
      commandMenu.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      commandMenu.left = "20px";
    } else {
      commandMenu.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      commandMenu.left = "-20px";  // Negative moves it left from right edge
    }
    // Force layout update
    commandMenu.markAsDirty();

    // Update team color border
    const r = Math.round(currentUnit.teamColor.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(currentUnit.teamColor.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(currentUnit.teamColor.b * 255).toString(16).padStart(2, '0');
    commandMenu.color = `#${r}${g}${b}`;

    // Update unit header: designation + class + speed
    const classData = getClassData(currentUnit.unitClass);
    const designation = UNIT_DESIGNATIONS[currentUnit.loadoutIndex] || "?";
    const speed = getEffectiveSpeed(currentUnit).toFixed(2);
    menuUnitName.text = `${designation} ${classData.name}, Speed ${speed}`;

    // Update ability button from class data
    if (abilityBtn.textBlock) {
      abilityBtn.textBlock.text = classData.ability;
    }

    // Update attack button based on combat style
    if (attackBtn.textBlock) {
      const isMelee = currentUnit.customization?.weapon ? isMeleeWeapon(currentUnit.customization.weapon) : false;
      attackBtn.textBlock.text = isMelee ? "Strike" : "Shoot";
    }

    // Update actions text from turnState (using centralized constant)
    const remaining = turnState?.actionsRemaining ?? 0;
    menuActionsText.text = `Actions: ${remaining}/${ACTIONS_PER_TURN}`;

    // Update preview section
    updateMenuPreview();
  }

  function updateMenuPreview(): void {
    if (!currentUnit || !turnState) {
      previewText.text = "";
      return;
    }

    const lines: string[] = [];

    // Show queued actions
    if (turnState.pendingActions.length > 0) {
      lines.push("Queued:");
      for (const action of turnState.pendingActions) {
        if (action.type === "move") {
          lines.push(`  Move to (${action.targetX},${action.targetZ})`);
        } else if (action.type === "attack" && action.targetUnit) {
          const targetName = getClassData(action.targetUnit.unitClass).name;
          const isMelee = currentUnit.customization?.weapon ? isMeleeWeapon(currentUnit.customization.weapon) : false;
          const attackVerb = isMelee ? "Strike" : "Shoot";
          lines.push(`  ${attackVerb} ${targetName}`);
        } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
          const targetName = action.targetUnit === currentUnit ? "self" : getClassData(action.targetUnit.unitClass).name;
          lines.push(`  Heal ${targetName}`);
        } else if (action.type === "ability" && action.abilityName === "conceal") {
          lines.push(`  Conceal`);
        } else if (action.type === "ability" && action.abilityName === "cover") {
          lines.push(`  Cover`);
        }
      }
    }

    // Show unit status effects
    if (currentUnit.isConcealed) {
      lines.push("* CONCEALED");
    }
    if (currentUnit.isCovering) {
      lines.push("* COVERING");
    }

    // Show action status
    const remaining = turnState.actionsRemaining;
    if (remaining > 0 && turnState.pendingActions.length < 2) {
      lines.push(`${remaining} action(s) left`);
    }

    previewText.text = lines.join("\n");
  }

  // Register turn start callback
  onTurnStartCallback = () => {
    updateNextUpIndicator();
    updateActionButtons();
    updateCurrentUnitStatusBar();
    updateReplayButtonVisibility();

    // Auto-select the current unit and show all available actions
    if (currentUnit && !controllerManager.isAI(currentUnit.team)) {
      selectedUnit = currentUnit;
      highlightAllAvailableActions(currentUnit);
    }

    // Hide command menu - using simplified action buttons instead
    commandMenu.isVisible = false;
  };

  // Game is initialized when spawnAllUnits completes (calls startGame)

  return scene;
}

// Helper to disable IBL/environment features on PBR materials to prevent RGBD shader issues
function disableMaterialIBL(meshes: AbstractMesh[]): void {
  meshes.forEach(m => {
    if (m.material && (m.material as PBRMaterial).reflectionTexture !== undefined) {
      const mat = m.material as PBRMaterial;
      mat.reflectionTexture = null;
      mat.environmentIntensity = 0;
    }
  });
}

function createUnitMaterial(name: string, color: Color3, scene: Scene): StandardMaterial {
  const mat = new StandardMaterial(`${name}Mat`, scene);
  mat.diffuseColor = color;
  return mat;
}

// Map unit types to model file names
function getModelFileName(unitClass: UnitClass, isMale: boolean): string {
  const gender = isMale ? "m" : "f";
  const classData = getClassData(unitClass);
  return `${classData.modelFile}_${gender}.glb`;
}

async function createUnit(
  unitClass: UnitClass,
  team: Team,
  gridX: number,
  gridZ: number,
  scene: Scene,
  _materials: Record<UnitClass, StandardMaterial>,  // Kept for API compatibility
  gridOffset: number,
  gui: AdvancedDynamicTexture,
  loadoutIndex: number,
  teamColor: Color3,
  customization?: UnitCustomization,
  boost?: number
): Promise<Unit> {
  const classData = getClassData(unitClass);

  // Default customization if not provided
  const c: UnitCustomization = customization ?? {
    body: "male",
    weapon: "pistol",
    handedness: "right",
    head: 0,
    hairColor: 0,
    eyeColor: 2,
    skinTone: 4,
  };

  // Load 3D model
  const isMale = c.body === "male";
  const modelFile = getModelFileName(unitClass, isMale);
  const result = await SceneLoader.ImportMeshAsync("", `${import.meta.env.BASE_URL}models/`, modelFile, scene);

  const modelRoot = result.meshes[0];
  const modelMeshes = result.meshes;
  const animationGroups = result.animationGroups;

  // Disable IBL features to prevent RGBD shader timeout issues
  disableMaterialIBL(modelMeshes);

  // Hide model initially until facing is set (prevents wrong-direction flash)
  modelRoot.setEnabled(false);

  // Position and scale the model - using centralized constants
  modelRoot.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    BATTLE_MODEL_Y_POSITION,
    gridZ * TILE_SIZE - gridOffset
  );
  modelRoot.scaling = new Vector3(
    c.handedness === "right" ? -BATTLE_MODEL_SCALE : BATTLE_MODEL_SCALE,
    BATTLE_MODEL_SCALE,
    BATTLE_MODEL_SCALE
  );

  // Apply customizations to the model
  // Head visibility (using centralized constant)
  for (let i = 0; i < HEAD_VARIANT_COUNT; i++) {
    const headName = `Head_00${i + 1}`;
    const headMeshes = modelMeshes.filter(m => m.name.includes(headName));
    headMeshes.forEach(mesh => mesh.setEnabled(i === c.head));
  }

  // Weapon visibility based on weapon type
  const swordMeshes = modelMeshes.filter(m => m.name.toLowerCase().includes("sword"));
  const pistolMeshes = modelMeshes.filter(m => m.name.toLowerCase().includes("pistol"));
  const isMelee = isMeleeWeapon(c.weapon);
  swordMeshes.forEach(m => m.setEnabled(isMelee));
  pistolMeshes.forEach(m => m.setEnabled(!isMelee));

  // Apply colors to materials
  modelMeshes.forEach(mesh => {
    if (!mesh.material) return;
    const mat = mesh.material as PBRMaterial;
    const matName = mat.name;

    if (matName === "MainSkin") {
      mat.albedoColor = hexToColor3(SKIN_TONES[c.skinTone] || SKIN_TONES[4]);
    } else if (matName === "MainHair") {
      mat.albedoColor = hexToColor3(HAIR_COLORS[c.hairColor] || HAIR_COLORS[0]);
    } else if (matName === "MainEye") {
      mat.albedoColor = hexToColor3(EYE_COLORS[c.eyeColor] || EYE_COLORS[2]);
    } else if (matName === "TeamMain") {
      mat.albedoColor = teamColor;
    }
  });

  // Set metadata for click detection
  modelMeshes.forEach(mesh => {
    mesh.metadata = { type: "unit", unitClass, team };
  });

  // Start idle animation
  animationGroups.forEach(ag => ag.stop());
  const idleAnim = isMelee
    ? animationGroups.find(ag => ag.name === "Idle_Sword")
    : animationGroups.find(ag => ag.name === "Idle_Gun");
  idleAnim?.start(true);

  // Create an invisible mesh for HP bar linkage (positioned at model's head height)
  const hpBarAnchor = MeshBuilder.CreateBox(`${team}_${unitClass}_anchor_${gridX}_${gridZ}`, { size: 0.01 }, scene);
  hpBarAnchor.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    HP_BAR_ANCHOR_HEIGHT,
    gridZ * TILE_SIZE - gridOffset
  );
  hpBarAnchor.isVisible = false;
  hpBarAnchor.metadata = { type: "unit", unitClass, team };

  // HP bar background - using centralized colors
  const hpBarBg = new Rectangle();
  hpBarBg.width = "34px";
  hpBarBg.height = "6px";
  hpBarBg.background = HP_BAR_BACKGROUND;
  hpBarBg.thickness = 1;
  hpBarBg.color = HP_BAR_BORDER;
  hpBarBg.isVisible = false;  // Hide until model is ready
  gui.addControl(hpBarBg);
  hpBarBg.linkWithMesh(hpBarAnchor);
  hpBarBg.linkOffsetY = -50;

  // HP bar fill - using centralized colors
  const hpBar = new Rectangle();
  hpBar.width = "30px";
  hpBar.height = "4px";
  hpBar.background = HP_BAR_GREEN;
  hpBar.horizontalAlignment = Rectangle.HORIZONTAL_ALIGNMENT_LEFT;
  hpBar.left = "2px";
  hpBarBg.addControl(hpBar);

  // Unit designation (Greek symbol) under HP bar in team color
  const designation = UNIT_DESIGNATIONS[loadoutIndex] || "?";
  const designationText = new TextBlock(`designation_${team}_${loadoutIndex}`);
  designationText.text = designation;
  designationText.fontSize = 14;
  designationText.fontWeight = "bold";
  // Convert teamColor to hex
  const tr = Math.round(teamColor.r * 255).toString(16).padStart(2, '0');
  const tg = Math.round(teamColor.g * 255).toString(16).padStart(2, '0');
  const tb = Math.round(teamColor.b * 255).toString(16).padStart(2, '0');
  designationText.color = `#${tr}${tg}${tb}`;
  designationText.outlineWidth = 2;
  designationText.outlineColor = "black";
  designationText.isVisible = false; // Hide until model is ready
  gui.addControl(designationText);
  designationText.linkWithMesh(hpBarAnchor);
  designationText.linkOffsetY = -32; // Below the HP bar

  const originalColor = teamColor.clone();

  // Apply boost multipliers based on boost index using BOOST_BY_INDEX
  const boostIndex = boost ?? 0;
  const boostData = BOOST_BY_INDEX[boostIndex];
  const hpMultiplier = boostData.stat === "hp" ? 1 + boostData.multiplier : 1;
  const attackMultiplier = boostData.stat === "attack" ? 1 + boostData.multiplier : 1;
  const speedMultiplier = boostData.stat === "speed" ? 1 + boostData.multiplier : 1;

  const boostedHp = Math.round(classData.hp * hpMultiplier);
  const boostedAttack = Math.round(classData.attack * attackMultiplier);
  const boostedSpeed = classData.speed * speedMultiplier;

  return {
    mesh: hpBarAnchor,  // Use anchor as the main "mesh" for positioning
    unitClass,
    team,
    gridX,
    gridZ,
    moveRange: classData.moveRange,
    hp: boostedHp,
    maxHp: boostedHp,
    attack: boostedAttack,
    healAmount: classData.healAmount,
    hpBar,
    hpBarBg,
    designationLabel: designationText,
    originalColor,
    hasMoved: false,
    hasAttacked: false,
    speed: boostedSpeed,
    speedBonus: 0,
    accumulator: 0,
    loadoutIndex,
    boost: boost ?? 0,
    modelRoot,
    modelMeshes,
    animationGroups,
    customization: c,
    teamColor,
    facing: {  // Will be initialized via initFacing after spawn
      currentAngle: 0,
      baseOffset: 0,
      isFlipped: false
    },
    isConcealed: false,
    isCovering: false,
  };
}

function moveUnit(unit: Unit, newX: number, newZ: number, gridOffset: number): void {
  unit.gridX = newX;
  unit.gridZ = newZ;

  const newPosX = newX * TILE_SIZE - gridOffset;
  const newPosZ = newZ * TILE_SIZE - gridOffset;

  // Move HP bar anchor (using centralized height constant)
  unit.mesh.position = new Vector3(newPosX, HP_BAR_ANCHOR_HEIGHT, newPosZ);

  // Move 3D model (using centralized Y position constant)
  if (unit.modelRoot) {
    unit.modelRoot.position = new Vector3(newPosX, BATTLE_MODEL_Y_POSITION, newPosZ);
  }
}
