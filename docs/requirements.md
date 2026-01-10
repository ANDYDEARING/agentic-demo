# Game Requirements

## Overview

A tactical RPG prototype inspired by Final Fantasy Tactics, Front Mission, and Warhammer. The core philosophy: **loadout building should be as engaging as the battle itself**.

## Target Platforms

- **Demo**: Web browser
- **Future**: Mobile via Capacitor → Babylon Native if needed

## Tech Stack

- **Engine**: Babylon.js
- **Language**: TypeScript
- **Build**: Vite
- **Multiplayer**: TBD (Colyseus, Supabase, or custom WebSocket)
- **Mobile**: Capacitor (later)

## Prototype Scope

### Screens

1. **Title Screen** - Entry point, play/options
2. **Loadout Screen** - Build and save team compositions
3. **Battle Screen** - The tactical grid combat

### Core Features (Prototype)

- [ ] Isometric 3D grid that can rotate (90° increments like FFT)
- [ ] Turn-based tactical combat
- [ ] No character growth/progression (prototype limitation)
- [ ] Multiplayer from day one (2 players)
- [ ] Save/load/share loadouts between players

### Loadout System

Players build teams before battle. This is a core engagement loop, not just a menu.

- Units have stats, equipment, abilities
- Loadouts can be saved locally
- Loadouts can be shared (URL or code)
- Inspiration: CCG deckbuilding, Warhammer army lists

### Combat System (Initial)

- Grid-based movement
- Turn-based (player alternates or unit-by-unit TBD)
- Height matters (terrain elevation)
- Facing may matter (flanking bonuses TBD)

## Non-Goals (Prototype)

- Single-player campaign/story
- Character progression/leveling
- AI opponents (multiplayer only for now)
- Audio/music
- Polish/juice

## Open Questions

1. Turn structure: Full team moves, or alternating unit activations?
2. How are matches made? Lobby? Direct invite?
3. What's the win condition? Eliminate all units? Objectives?
4. Unit variety: How many unit types for prototype?
