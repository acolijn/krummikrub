import { create } from 'zustand';
import type { GameState, Player, Board, Meld, Tile, Difficulty } from '../types';
import {
  createShuffledDeck,
  dealTiles,
  isBoardValid,
  cloneBoard,
  cloneRack,
  meetsInitialMeldRequirement,
  sortMeldForDisplay,
} from '../game/logic';

interface GameStore extends GameState {
  initGame: (difficulty?: Difficulty) => void;
  // Human places/rearranges tiles: provides the full new board + remaining rack
  setBoard: (board: Board, rack: Tile[]) => void;
  // Human ends their turn – validates and commits, or reverts
  commitTurn: () => { ok: boolean; reason?: string };
  // Human draws a tile instead of playing
  drawTile: () => void;
  // Called by AI engine to commit an AI turn
  commitAiTurn: (board: Board, rack: Tile[], hasInitialMeld: boolean) => void;
  // Advance to next player (called after AI commits)
  nextTurn: () => void;
}

const PLAYER_NAMES = ['You', 'Computer 1', 'Computer 2'];

function makePlayer(id: number, name: string, isHuman: boolean, rack: Tile[]): Player {
  return { id, name, rack, isHuman, hasInitialMeld: false };
}

export const useGameStore = create<GameStore>((set, get) => ({
  phase: 'setup',
  difficulty: 'medium',
  players: [],
  board: [],
  drawPile: [],
  currentPlayerIndex: 0,
  turnSnapshot: null,
  winner: null,
  message: '',

  initGame: (difficulty: Difficulty = 'medium') => {
    let deck = createShuffledDeck();
    const players: Player[] = [];
    for (let i = 0; i < 3; i++) {
      const { hand, remaining } = dealTiles(deck, 14);
      deck = remaining;
      players.push(makePlayer(i, PLAYER_NAMES[i], i === 0, hand));
    }
    const humanRack = players[0].rack;
    set({
      phase: 'playing',
      difficulty,
      players,
      board: [],
      drawPile: deck,
      currentPlayerIndex: 0,
      turnSnapshot: { board: [], rack: cloneRack(humanRack) },
      winner: null,
      message: "Your turn — play tiles or draw.",
    });
  },

  setBoard: (board, rack) => {
    set(state => {
      const players = [...state.players];
      players[0] = { ...players[0], rack };
      return { board, players };
    });
  },

  commitTurn: () => {
    const state = get();
    const human = state.players[0];
    const snapshot = state.turnSnapshot!;

    // If no tiles were played (rack unchanged, board unchanged), force a draw
    const tilesPlayed = snapshot.rack.filter(t => !human.rack.some(r => r.id === t.id));
    if (tilesPlayed.length === 0) {
      if (state.drawPile.length === 0) {
        // Nothing to draw either — just pass
        set({
          currentPlayerIndex: 1,
          message: `Draw pile empty. ${PLAYER_NAMES[1]} is thinking…`,
        });
      } else {
        const [drawn, ...remaining] = state.drawPile;
        set(s => {
          const players = [...s.players];
          players[0] = { ...players[0], rack: [...players[0].rack, drawn] };
          return {
            players,
            drawPile: remaining,
            currentPlayerIndex: 1,
            message: `You drew a tile. ${PLAYER_NAMES[1]} is thinking…`,
          };
        });
      }
      return { ok: true };
    }

    // Check board validity
    if (!isBoardValid(state.board)) {
      // Revert
      if (state.turnSnapshot) {
        set(s => {
          const players = [...s.players];
          players[0] = { ...players[0], rack: cloneRack(state.turnSnapshot!.rack) };
          return { board: cloneBoard(state.turnSnapshot!.board), players };
        });
      }
      return { ok: false, reason: 'Board is not valid. Turn reverted.' };
    }

    // Tiles that were on the board at turn start must still be on the board.
    // Rearranging is fine; pulling a board tile back to the rack is not.
    const finalBoardIds = new Set(state.board.flat().map(t => t.id));
    const missing = snapshot.board.flat().filter(t => !finalBoardIds.has(t.id));
    if (missing.length > 0) {
      set(s => {
        const players = [...s.players];
        players[0] = { ...players[0], rack: cloneRack(snapshot.rack) };
        return { board: cloneBoard(snapshot.board), players };
      });
      return { ok: false, reason: 'Tiles already on the board cannot be moved back to your rack.' };
    }

    // Check initial meld requirement
    const tilesPlayedIds = new Set(human.rack.map(r => r.id));
    const tilesPlayedCheck = snapshot.rack.filter(t => !tilesPlayedIds.has(t.id));
    if (!human.hasInitialMeld && tilesPlayedCheck.length > 0) {
      // Tiles played this turn must only come from the rack (no reusing board tiles)
      // and must total ≥30 by themselves
      // Simplified: collect melds that contain only tiles from original rack
      const originalIds = new Set(snapshot.rack.map(t => t.id));
      const newMelds: Meld[] = state.board.filter(meld =>
        meld.every(t => originalIds.has(t.id))
      );
      if (!meetsInitialMeldRequirement(newMelds)) {
        // Revert
        set(s => {
          const players = [...s.players];
          players[0] = { ...players[0], rack: cloneRack(snapshot.rack) };
          return { board: cloneBoard(snapshot.board), players };
        });
        return { ok: false, reason: 'Initial meld must score at least 30 points from your own tiles.' };
      }
    }

    // Check win condition
    const updatedHuman = { ...human, hasInitialMeld: true };
    if (updatedHuman.rack.length === 0) {
      set(s => {
        const players = [...s.players];
        players[0] = updatedHuman;
        return { players, phase: 'ended', winner: updatedHuman, message: 'You win! 🎉' };
      });
      return { ok: true };
    }

    // Commit turn, advance to next player
    set(s => {
      const players = [...s.players];
      players[0] = { ...players[0], hasInitialMeld: true };
      return {
        players,
        currentPlayerIndex: 1,
        turnSnapshot: null,
        message: `${PLAYER_NAMES[1]} is thinking…`,
      };
    });

    return { ok: true };
  },

  drawTile: () => {
    set(state => {
      if (state.drawPile.length === 0) {
        // No tiles to draw – just pass
        return {
          currentPlayerIndex: 1,
          message: `Draw pile empty. ${PLAYER_NAMES[1]} is thinking…`,
        };
      }
      const [drawn, ...remaining] = state.drawPile;
      const players = [...state.players];
      players[0] = { ...players[0], rack: [...players[0].rack, drawn] };
      return {
        players,
        drawPile: remaining,
        currentPlayerIndex: 1,
        message: `You drew a tile. ${PLAYER_NAMES[1]} is thinking…`,
      };
    });
  },

  commitAiTurn: (board, rack, hasInitialMeld) => {
    set(state => {
      const idx = state.currentPlayerIndex;
      const players = [...state.players];
      players[idx] = { ...players[idx], rack, hasInitialMeld };

      const displayBoard = board.map(m => sortMeldForDisplay(m));

      // Check win
      if (rack.length === 0) {
        return {
          board: displayBoard,
          players,
          phase: 'ended',
          winner: players[idx],
          message: `${players[idx].name} wins!`,
        };
      }

      return { board: displayBoard, players };
    });
  },

  nextTurn: () => {
    set(state => {
      if (state.phase === 'ended') return {};
      const next = (state.currentPlayerIndex + 1) % 3;
      if (next === 0) {
        // Back to human
        const humanRack = state.players[0].rack;
        return {
          currentPlayerIndex: 0,
          turnSnapshot: { board: cloneBoard(state.board), rack: cloneRack(humanRack) },
          message: "Your turn — play tiles or draw.",
        };
      }
      return {
        currentPlayerIndex: next,
        message: `${PLAYER_NAMES[next]} is thinking…`,
      };
    });
  },
}));
