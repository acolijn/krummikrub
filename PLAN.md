# Rummikub Webapp — Implementation Plan

## Overview

A browser-based Rummikub game: 1 human player vs. 2 computer players.
Built with React + TypeScript + Vite + Tailwind CSS. No backend required.

---

## Phase 1 — Project Setup

- Scaffold project with Vite (React + TypeScript template)
- Configure Tailwind CSS
- Set up folder structure
- Configure ESLint + Prettier

**Folder structure:**
```
src/
  components/      # React UI components
  game/            # Pure game logic (no React)
  store/           # Zustand state management
  ai/              # Computer player logic
  types/           # Shared TypeScript types
  assets/          # Tile graphics / colors
```

---

## Phase 2 — Core Data Model (`src/types/`)

Define the fundamental types:

- `Tile`: `{ id, number (1–13), color ('red'|'blue'|'black'|'orange'), isJoker }`
- `Meld`: an array of Tiles forming a valid group or run on the board
- `Board`: array of Melds currently on the table
- `Player`: `{ id, name, rack: Tile[], isHuman, hasInitialMeld }`
- `GameState`: players, board, draw pile, current turn, phase, winner

---

## Phase 3 — Game Logic (`src/game/`)

Pure functions, fully unit-testable, no UI dependency.

### 3.1 Tile factory
- Generate the full set: 2× (1–13 in 4 colors) + 2 jokers = 106 tiles
- Shuffle (Fisher-Yates)
- Deal 14 tiles to each player

### 3.2 Validation engine
- `isValidRun(tiles)` — same color, consecutive numbers, min 3
- `isValidGroup(tiles)` — same number, different colors, 3–4 tiles
- `isValidMeld(tiles)` — run or group
- `isBoardValid(board)` — all melds on board are valid
- `meldScore(tiles)` — sum of tile face values (joker = value of replaced tile)

### 3.3 Initial meld rule
- Player's first play must score ≥ 30 points using only tiles from their own rack

### 3.4 Turn logic
- Play tiles from rack onto board (add to existing melds or create new ones)
- Rearranging existing melds is allowed, but the board must be valid at end of turn
- If no valid play: draw one tile, end turn
- Win condition: rack is empty after a valid play

### 3.5 Draw pile management
- Draw tile, reshuffle discarded tiles if pile is empty (house rule: if pile empty, pass)

---

## Phase 4 — State Management (`src/store/`)

Single Zustand store with actions:

- `initGame()` — set up tiles, deal, pick first player
- `playTiles(playerIndex, melds)` — attempt a play, validate, update state
- `drawTile(playerIndex)` — draw from pile, advance turn
- `rearrangeBoard(newBoard)` — human drags tiles around
- `endTurn()` — validate board, commit or revert to snapshot

Key pattern: **snapshot before turn → revert if board invalid at end of turn**

---

## Phase 5 — AI Player (`src/ai/`)

Two-level approach:

### Level 1 — Move finder
- Enumerate all valid subsets of rack tiles that form a valid meld
- Find all ways to extend existing board melds with rack tiles
- Find all ways to split/rearrange board melds to place rack tiles (limited depth)

### Level 2 — Move selector (greedy)
- Prefer plays that empty the most tiles from the rack
- Prefer plays that satisfy the initial meld requirement (≥30)
- Fall back to drawing if no valid play found

AI turn runs synchronously but is triggered with a short `setTimeout` delay for natural pacing.

---

## Phase 6 — UI Components (`src/components/`)

| Component | Responsibility |
|---|---|
| `App` | Root layout, game phase routing |
| `GameBoard` | Displays all melds on the table |
| `MeldGroup` | Renders one meld; drop target for tiles |
| `PlayerRack` | Human player's tile rack |
| `OpponentRack` | Face-down tile count for AI players |
| `TileCard` | Individual tile; draggable (human) or static |
| `DrawPile` | Clickable draw pile with count |
| `StatusBar` | Current turn, messages, score info |
| `GameOver` | Winner announcement, play again |

### Interaction model
- **Drag-and-drop** (HTML5 native or `@dnd-kit/core`) for placing tiles
- Human picks tiles from rack → drops onto board (existing meld or new slot)
- "End Turn" button validates and commits; board reverts on invalid state
- "Draw" button draws a tile and ends turn

---

## Phase 7 — Styling & Polish

- Color-coded tiles: red, blue, black, orange
- Joker: distinct visual (star or gradient)
- Responsive layout: board top, human rack bottom, opponents on sides
- Highlight valid/invalid state during drag
- Simple animations: tile draw, tile placement, AI "thinking" indicator

---

## Phase 8 — Testing

- Unit tests (Vitest) for all game logic functions
- Key scenarios: valid/invalid meld detection, initial meld rule, win detection, AI move finder
- No UI tests initially

---

## Phased Delivery Order

```
Phase 1  →  Phase 2  →  Phase 3  →  Phase 8 (tests)
    →  Phase 4  →  Phase 5  →  Phase 6  →  Phase 7
```

Game logic is built and tested before any UI work begins.

---

## Out of Scope (v1)

- Multiplayer / networking
- Persistent scores / login
- Mobile touch drag-and-drop optimization
- Timer per turn
- Undo history (beyond single-turn revert)
