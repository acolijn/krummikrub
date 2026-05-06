export type TileColor = 'red' | 'blue' | 'black' | 'orange';

export interface Tile {
  id: string;         // unique e.g. "red-5-a"
  number: number;     // 1–13, 0 for joker
  color: TileColor;
  isJoker: boolean;
}

// A meld is an ordered array of tiles forming a valid group or run
export type Meld = Tile[];

// The board is a list of melds
export type Board = Meld[];

export type GamePhase =
  | 'setup'      // initial deal
  | 'playing'    // game in progress
  | 'ended';     // someone won

export type Difficulty = 'easy' | 'medium' | 'expert' | 'superhuman';

export interface Player {
  id: number;
  name: string;
  rack: Tile[];
  isHuman: boolean;
  hasInitialMeld: boolean;  // has completed the first ≥30 point meld
}

export interface GameState {
  phase: GamePhase;
  difficulty: Difficulty;
  players: Player[];
  board: Board;
  drawPile: Tile[];
  currentPlayerIndex: number;
  // snapshot of board + racks at start of human's turn (for revert)
  turnSnapshot: { board: Board; rack: Tile[] } | null;
  winner: Player | null;
  message: string;
}
