# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

A tactical RPG prototype (FFT/Front Mission inspired) built to learn agentic AI workflows. Core philosophy: loadout building should be as engaging as battle itself.

## Coding Style

- **Elegance**: Short, robust, clever, small solutions. No bloat.
- **Responsiveness**: Use ratios, not pixels. Layouts must adapt.
- **Reusability**: Extract utilities early. Don't duplicate.
- **Organization**: Reference constants/configs. Never hardcode values.
- **Communication**: Before diving into a rabbit hole that breaks these rules, stop and strategize with the user.

## Commands

```bash
npm run dev      # Start dev server at localhost:5173
npm run build    # Type check + production build
npx tsc --noEmit # Type check only
```

## Technology Stack

- **Babylon.js** - 3D engine (rotatable isometric grid)
- **TypeScript** - Strict mode enabled
- **Vite** - Dev server and bundler
- **Mobile path**: Web → Capacitor → Babylon Native if needed

## Project Structure

```
/docs                    - Requirements and design documents
/src
  /battle               - Pure game logic (headless simulation ready)
    state.ts            - UnitState, BattleState types
    rules.ts            - Movement, LOS, combat, turn system
    commands.ts         - Command pattern for actions
    controllers.ts      - Controller abstraction (Human/AI)
    replay.ts           - Turn recording types for replay/sync
  /scenes
    /battle             - Visual helpers for BattleScene
      terrain.ts        - Grid terrain generation
      animations.ts     - Animation playback, facing system
      unitVisuals.ts    - Unit spawning, HP bars, models
      camera.ts         - Dramatic camera, pan/rotate
      highlights.ts     - Tile highlighting, shadow preview
      coverVisuals.ts   - Cover ability visualization
      ui/*.ts           - UI components (turnOrder, actionButtons, etc.)
      index.ts          - Re-exports all visual helpers
    /loadout            - LoadoutScene helpers
    BattleScene.ts      - Main battle orchestrator (~5400 lines)
    LoadoutScene.ts     - Loadout screen
    TitleScene.ts       - Title screen
  main.ts               - Entry point, engine setup
```

## Battle Architecture (Headless Simulation Ready)

The battle system is split into two layers to support future headless simulations for AI training and balance testing:

### Pure Logic Layer (`/src/battle/`)
Contains game rules with **no Babylon.js dependencies**:
- `state.ts` - Data types for units and battle state
- `rules.ts` - LOS, pathfinding, damage calculation, turn order
- `commands.ts` - Command pattern for queueable actions
- `controllers.ts` - Human vs AI controller abstraction

### Visual Layer (`/src/scenes/battle/`)
Contains rendering code that **only handles visuals**:
- `terrain.ts` - Creates terrain meshes from positions
- `animations.ts` - Plays animations, manages facing
- `unitVisuals.ts` - Spawns 3D models, HP bars
- `camera.ts` - Dramatic camera transitions
- `highlights.ts` - Tile highlighting system
- `coverVisuals.ts` - Cover ability visualization
- `ui/*.ts` - All UI components

### Current State & Future Migration

**Current**: `BattleScene.ts` still contains inline versions of many functions due to closure variable dependencies (`units`, `terrainTiles`, `turnState`, etc.). The extracted modules are imported with `_` prefixes and available but not yet wired up.

**To fully migrate** (enabling headless simulation):
1. Create a `BattleState` object that holds all game state
2. Pass state to extracted functions instead of using closures
3. Replace inline functions with imports from `/src/scenes/battle/`
4. For headless mode: use only `/src/battle/` (pure logic)
5. For visual mode: use both layers, with visual layer calling pure logic

**Example migration pattern**:
```typescript
// Before (closure-based):
function faceClosestEnemy(unit: Unit): void {
  const enemies = units.filter(u => u.team !== unit.team);  // closure
  // ...
}

// After (state-based):
import { faceClosestEnemy } from "./battle";
faceClosestEnemy(unit, battleState.units);  // explicit state
```

**Extracted modules available** (import from `./battle`):
- `createTerrain`, `hasTerrain`
- `playAnimation`, `playIdleAnimation`, `initFacing`, `faceTarget`, `faceClosestEnemy`
- `createUnit`, `updateHpBar`, `applyConcealVisual`, `removeConcealVisual`
- `createBattleCamera`, `transitionToDramaticCamera`, `transitionFromDramaticCamera`
- `createHighlightMaterials`, `highlightTile`, `createShadowPreview`
- `createCoverBorder`, `showCoverPreview`, `updateHazardStripes`
- UI: `createTurnOrderUI`, `createActionButtonsUI`, `createStatusBar`, `showGameOver`, `createTutorialOverlay`

**Pure logic replay types** (import from `../battle/replay`):
- `UnitSnapshot`, `UnitTurnRecord`, `TeamTurnRecord` - serializable for online sync
- `createTeamTurnRecord()`, `createUnitTurnRecord()` - factory functions
- `serializeTeamTurnRecord()`, `deserializeTeamTurnRecord()` - for network transmission

## Architecture Decisions

- **Scenes as functions**: Each screen (title, loadout, battle) is a function that creates and returns a Scene
- **No visual editor**: Everything is code for agentic development compatibility
- **GUI via @babylonjs/gui**: 2D UI overlays on 3D scenes

## Workflow Guidelines

When implementing features:
1. Document requirements in `/docs/requirements.md` first
2. Propose architecture options with trade-offs before major implementations
3. Start with minimal working prototype, iterate based on feedback
4. Keep the game playable at each stage

**Note**: Never run the dev server (`npm run dev`) - the user handles that. Only run `npm run build` to verify TypeScript compiles.

## Open Questions (see docs/requirements.md)

- Turn structure (full team vs alternating activations)
- Match-making approach
- Win conditions
- Unit variety for prototype

## How To Screen & For Nerds Section

The title screen has a "Quick How To" button that shows game instructions. At the bottom is a "For Nerds" button that shows detailed mechanics with **dynamically populated values** from config files.

### Updating the For Nerds Section

When game mechanics change, update `getNerdText()` in `src/scenes/TitleScene.ts`. The function pulls values dynamically from:

- **Stats**: `CLASS_DATA` from `src/types/index.ts` (HP, ATK, Move, Heal per class)
- **Combat**: `MELEE_DAMAGE_MULTIPLIER`, `BOOST_MULTIPLIER` from `src/config/constants.ts`
- **Turn system**: `ACCUMULATOR_THRESHOLD`, `ACTIONS_PER_TURN`, `SPEED_BONUS_PER_UNUSED_ACTION`, `BASE_UNIT_SPEED`
- **Grid**: `GRID_SIZE`

### Ability Logic Reference (for accuracy)

When updating ability descriptions, reference the actual implementation in `src/scenes/BattleScene.ts`:

**COVER (Soldier)** - `toggleCover()`, `checkAndTriggerCoverReaction()`, `endCover()`
- Watches tiles based on weapon (melee: 8 adjacent with LOS for diagonals, ranged: all LOS tiles not adjacent)
- Triggers when enemy completes ANY action in a watched tile (checked via `checkReactions`)
- Ends when: reaction fires, covering unit takes damage, or their next turn starts
- Concealed enemies don't trigger Cover

**CONCEAL (Operator)** - `executeConceal()`
- One-way toggle (cannot manually deactivate)
- Next hit deals 0 damage and breaks conceal (in `executeAttack()`)

**HEAL (Medic)** - `executeHeal()`
- Heals `healAmount` HP (from CLASS_DATA)
- Self or adjacent allies (diagonals need LOS)

### Scrollable Text Implementation

The How To overlay uses `ScrollViewer` from `@babylonjs/gui` with:
- Fixed header (title) and footer (buttons)
- Scrollable middle section containing the text
- `wheelPrecision` for mouse wheel sensitivity
- `barSize`, `barColor` for scrollbar styling

## Conversation Log

### 2026-02-01
- Refactored BattleScene for context optimization and headless simulation prep
  - **Goal**: Break up the 5500-line BattleScene.ts into smaller, reusable modules
  - **Created `/src/scenes/battle/`** with 13 extracted modules:
    - `terrain.ts` - Grid terrain generation algorithm
    - `animations.ts` - Animation playback and facing system
    - `unitVisuals.ts` - Unit spawning, models, HP bars, conceal visuals
    - `camera.ts` - Battle camera, dramatic transitions, pan/rotate toggle
    - `highlights.ts` - Tile highlighting, shadow preview, intent indicators
    - `coverVisuals.ts` - Cover ability visualization, hazard stripes
    - `ui/turnOrder.ts` - Turn order modal and prediction
    - `ui/battleMessages.ts` - Floating battle messages
    - `ui/actionButtons.ts` - Cancel/Execute buttons, queued actions
    - `ui/statusBar.ts` - Current unit status bar
    - `ui/cameraToggle.ts` - Camera mode toggle button
    - `ui/actionCounter.ts` - Action counter display
    - `ui/gameOver.ts` - Game over overlay
    - `index.ts` - Re-exports all modules
  - **Architecture**: Pure game logic in `/src/battle/`, visual rendering in `/src/scenes/battle/`
  - **Current state** (5,442 lines after additional extractions):
    - Animation functions fully migrated (playAnimation, playIdleAnimation, initFacing, setUnitFacing, faceClosestEnemy, faceAverageEnemyPosition)
    - Unit visual functions fully migrated (updateHpBar, setUnitExhausted, setUnitInactive, resetUnitAppearance, applyConcealVisual, removeConcealVisual)
    - Created `/src/scenes/battle/state.ts` with consolidated visual state types (BattleVisualState, HighlightState, etc.)
    - **Pure logic delegated to rules.ts** via state bridge:
      - LOS system (hasLineOfSight, getTilesInLOS, lineRectIntersection) - removed ~150 lines
      - Movement (getValidMoveTiles, getPathToTarget) - removed ~100 lines
      - Attack/heal targeting (getValidAttackTiles, getAdjacentTiles, isAdjacent) - removed ~50 lines
      - Turn order (getEffectiveSpeed) - delegates to rules.ts
    - UI-driven functions (highlights, cover visuals, shadow preview) remain inline - not needed for headless simulation
  - **State bridge pattern**: `getBattleState()` creates a cached BattleState from closure variables, enabling rules.ts functions
  - **Migration pattern**: Pass `units` array to functions that need it (e.g., `faceClosestEnemy(unit, units)`)
  - **Documentation**: Added "Battle Architecture" section to CLAUDE.md

- Fixed iOS audio resume after sleep/background
  - **Problem**: Music wouldn't resume when iOS device woke from sleep, even with user interaction handlers
  - **Root cause**: iOS Safari WebKit quirk - audio context won't re-enable unless there's visible DOM activity
  - **Discovery process**: Added debug overlay to diagnose, found music worked WITH overlay visible but NOT when hidden
  - **What doesn't work**: Hidden elements, off-screen elements, tiny/invisible elements, layout recalc tricks
  - **What works**: A visible on-screen scroll container (`overflow-y: auto`) with innerHTML + scrollTop updates
  - **Solution**: 4x4 pixel black element in bottom-right corner that pulses on visibility change
  - **Location**: `src/main.ts` - `pulseForAudio()` function and iOS Audio Resume Workaround section

- Fixed loadout selections lost on screen rotation
  - **Problem**: Weapon and boost selections weren't carrying forward to battle, especially after device rotation
  - **Root cause (rotation)**: `unitStates` and `selections` were function-scoped, so orientation changes that recreated the scene would reset all customizations to defaults
  - **Root cause (boost)**: `syncSelectionsFromStates()` was missing the `boost` field, so boost selections were never passed to BattleScene
  - **Solution**:
    - Moved `unitStates`, `selections`, `currentTeam`, `isP2Computer` to module-level state
    - Added `resetLoadoutState()` function called when starting battle (so next visit is fresh)
    - Added `boost: state.selectedBoost` to `syncSelectionsFromStates()`
  - **Location**: `src/scenes/LoadoutScene.ts` - module state section and `syncSelectionsFromStates()`

- Bug fixes and AI refactor
  - **Gunshot sound fix**: Added `sound.load()` preloading for all sound effects to ensure first play works
  - **Camera rotation fix**: LoadoutScene preview camera stops auto-rotating permanently once user touches it
  - **Player turn messages**: Shows "Player 1 Turn" / "Player 2 Turn" / "Computer Turn" on team changes (not every unit)
  - **AI refactored to clean 4-step decision flow** (`src/battle/controllers.ts`):
    1. **Kill check** (universal) - prioritizes kills, tracks pending damage across actions
    2. **Class ability** (class-specific) - operator: conceal, soldier: cover only if can't reach+attack, medic: heal
    3. **Attack** (universal) - attack if enemy in range
    4. **Move/Position** (class-specific with default) - medic positions behind allies, others move toward attack positions
  - **Pending kill tracking**: Enemies with lethal pending damage are filtered from targets and pathfinding
  - **Pathfinding through dead enemies**: `getValidMoveTiles()` accepts `ignoreUnitIds` for soon-to-be-dead enemies
  - **Melee pathfinding**: New `selectMoveForMelee()` prioritizes tiles from which unit can actually attack
  - **Soldier smarter cover**: Only covers when can't reach combat within remaining actions
  - **No wasted attacks**: Second action re-evaluates targets excluding pending kills

- Extracted tutorial and replay modules
  - **Tutorial overlay** → `src/scenes/battle/ui/tutorial.ts` (236 lines)
    - Creates the "How to Play" overlay shown on battle start
    - Touch-aware: detects device type and shows appropriate controls
    - Returns controls for programmatic show/hide
  - **Replay data structures** → `src/battle/replay.ts` (139 lines, pure logic layer)
    - `UnitSnapshot`, `UnitTurnRecord`, `TeamTurnRecord` types
    - Factory functions: `createTeamTurnRecord()`, `createUnitTurnRecord()`
    - Serialization helpers for online sync: `serializeTeamTurnRecord()`, `deserializeTeamTurnRecord()`
    - **Future online sync**: These structures are network-ready for sending turn data to server
  - **Replay visual module** → `src/scenes/battle/replay.ts` (197 lines, available but not wired up)
    - `ReplayContext` interface for dependency injection
    - `createReplayButton()` for UI creation
    - Pattern for future decoupling of replay execution
  - **BattleScene.ts**: 5,442 lines (down from 5,655 before extractions)
  - **Net reduction**: 213 lines moved to dedicated modules

### 2026-01-30
- Added "Quick How To" button and overlay to TitleScene
  - **How To overlay**: Shows game instructions with scrollable text
  - **For Nerds section**: Technical details with dynamically populated values from config
    - Unit stats, damage formulas, boost calculations
    - Turn order accumulator system explanation
    - Detailed ability mechanics (Cover, Conceal, Heal)
  - **ScrollViewer implementation**: Fixed header/footer with scrollable middle section
  - **Documented in CLAUDE.md**: How to update For Nerds when mechanics change

### 2026-01-26
- Game mode selection and AI improvements
  - **Title screen mode selection**: Added "Local PvP" and "Local PvE" buttons to TitleScene
  - **AI Controller**: Rewrote AI behavior with class-specific logic:
    - Melee Operatives: Close distance, then strike
    - Ranged Operatives: Shoot twice, or move+shoot, or reposition
    - Soldiers: Use Cover if no target available after moving
    - Operators: Activate Conceal first turn, then act normally
    - Medics: Prioritize healing injured allies, position behind teammates when idle
    - General overrides: Prioritize kill opportunities (2 actions), ranged units back up when enemies adjacent
  - **Fixed diagonal adjacency bugs**: Both `rules.ts` and `BattleScene.ts` now use `isAdjacent()` function for proper cardinal-only checks (ranged weapons exclude adjacent tiles, melee covers cardinal only)
  - **Shadow preview click-through**: Made shadow mesh non-pickable so clicks pass through to tiles (fixes medic self-heal with pending move)
  - **UI improvements**:
    - Hide command menu for AI-controlled units
    - "Computer" label in LoadoutScene for PvE mode
  - **Active unit tile highlighting**: Yellow highlight now persists on active unit's tile throughout their turn
  - **Undo fix**: Tile highlights now properly restore after undoing an action based on current action mode
  - **Game over check**: AI stops acting when win condition is met

### 2026-01-24
- Major BattleScene refactor: animations, LOS, command menu, and abilities
  - **Facing system**: Units face average enemy position on spawn; rotate to face targets before moving/attacking
  - **Animation helpers**: `playAnimation()` and `playIdleAnimation()` for managing animation groups
  - **Animated movement**: Units play Run animation during movement with smooth position lerping
  - **Line of sight system**: Bresenham's line algorithm for LOS checking between tiles
  - **Weapon range rules**:
    - Sword (melee): Can only hit adjacent ordinal tiles (N/S/E/W), always has LOS
    - Gun (ranged): Can hit any tile in LOS, but NOT adjacent tiles
  - **Command menu UI**: Bottom-left panel with Move/Attack/Ability buttons, actions counter, and status preview
  - **Shadow preview system**: Shows ghost of unit at target position when hovering valid move tiles, plus attack preview from shadow position
  - **2-action turn system**: Each unit gets 2 actions per turn (any combination of move/attack/ability); replaced legacy hasMoved/hasAttacked booleans
  - **Abilities**:
    - Heal (Medic): Highlights healable allies, restores HP, plays Interact animation
    - Conceal (Operator): Toggle semi-transparency; when hit while concealed, damage is negated and conceal breaks
    - Cover (Soldier): Toggle coverage; sword users cover 4 adjacent tiles, gun users cover all LOS tiles (not adjacent); pulsing border visualization
  - **Turn summary**: Preview section shows current status (CONCEALED/COVERING) and available actions

### 2026-01-23
- Wired up loadout models to BattleScene
  - Units now spawn as 3D models (soldier/operator/medic) instead of placeholder boxes
  - Team colors from loadout are applied to models (`TeamMain` material) and base indicators
  - Unit customizations (body type, head, hair/eye/skin color, combat style, handedness) carry over
  - Corner indicators and turn text use the team's selected color
  - Removed test adventurer model code
  - Fixed dist folder gitignore (was already tracked, now properly untracked)

### 2026-01-21
- Started conversation logging in CLAUDE.md
- Added team color selector to LoadoutScene
  - 7 colors: Red, Orange, Blue, Green, Purple, Pink, Yellow
  - Each player can select their team color at the top of their panel
  - When one player selects a color, it's disabled (grayed out) for the other player
  - Team color updates the 3D model preview and panel border/title color
  - Colors stored in `Loadout.playerTeamColor` and `Loadout.enemyTeamColor`
