# KrummiKrub

A browser-based Rummikub-style tile game — 1 human player vs 2 AI opponents.

Built with React 19 + TypeScript, Vite, Tailwind CSS v4, Zustand, and @dnd-kit.

## Features

- **Drag-and-drop** tile placement onto the board
- **4 AI difficulty levels**
  - *Easy* — plays a single 3-tile meld per turn
  - *Medium* — greedy: maximises tiles played each turn
  - *Expert* — deep search over combinations of up to 3 melds + extensions
  - *Superhuman* — pool-partition solver: combines board + rack into one tile
    pool and finds the partition into valid melds that places the maximum
    number of rack tiles. Subsumes every board manipulation a human would
    consider — run splits, meld merges, multi-tile rearrangements, joker
    repositioning — in a single branch-and-bound search seeded with a greedy
    lower bound. After the initial meld is satisfied, single-tile extensions
    are also applied so spare rack tiles get dumped onto existing melds.
- **Custom player names** — pick your own name and your opponents' names; remembered between sessions
- **Persistent scoreboard** — wins, losses and Rummikub-style points (winner gains opponents' rack values, losers lose their own) are kept across games in your browser
- **Standard Rummikub rules**
  - Initial meld must score ≥ 30 points from your own tiles
  - Passing without playing forces a draw from the pile
  - Board melds are split automatically when you remove a tile from the middle
- **Joker repositioning** — flip a joker between the low and high end of a run with one click
- **Color-coded rack** — tiles organised by color in a 4-row grid so your hand is always easy to read

## Tech stack

| Tool | Version |
|---|---|
| React | 19 |
| TypeScript | 5 |
| Vite | 8 |
| Tailwind CSS | 4 |
| Zustand | 5 |
| @dnd-kit | 6 / 10 |

## Getting started

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build
```

## Project structure

```
src/
  ai/           # AI move-finding logic (all difficulty levels)
  components/   # React components (Game, Board, Rack, Tile, Scoreboard…)
  game/         # Pure game logic (validation, scoring, deck)
  store/        # Zustand game state store + localStorage persistence (names, scores)
  types/        # Shared TypeScript types
```

## Persistence

Player names and the cross-game scoreboard are persisted to `localStorage`
under the keys `krummikrub.playerNames` and `krummikrub.scores`. Clear the
scoreboard from the setup screen, or wipe site data in your browser to reset
both.

## Rules summary

- A **run** is 3+ tiles of the same color in consecutive order.
- A **group** is 3–4 tiles of the same number in different colors.
- Your **first play** must consist entirely of tiles from your own rack totalling ≥ 30 points.
- After that, you may rearrange any tiles already on the board, as long as all melds are valid when you end your turn.
- If you end your turn without placing any tiles, you draw one tile from the pile.

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
