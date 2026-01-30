# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

A tactical RPG prototype (FFT/Front Mission inspired) built to learn agentic AI workflows. Core philosophy: loadout building should be as engaging as battle itself.

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
  /scenes               - Babylon.js scene files (TitleScene, LoadoutScene, BattleScene)
  main.ts               - Entry point, engine setup
```

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
