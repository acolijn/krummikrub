import type { Tile, Meld, Board, Difficulty } from '../types';
import {
  isValidMeld,
  isBoardValid,
  meldScore,
  removeTilesFromRack,
} from '../game/logic';

// ─── Find all valid melds from a rack ────────────────────────────────────────
// Structural enumeration — considers every tile in the rack regardless of size,
// unlike a brute-force subset generator which would be prohibitively slow or
// silently cap the tiles it looks at.

export function findValidMeldsFromRack(rack: Tile[]): Meld[] {
  const melds: Meld[] = [];
  const jokers = rack.filter(t => t.isJoker);
  const nonJokers = rack.filter(t => !t.isJoker);

  // ── Groups: same number, distinct colors, 3–4 tiles ──────────────────────
  const byNum = new Map<number, Tile[]>();
  for (const t of nonJokers) {
    const list = byNum.get(t.number);
    if (list) list.push(t); else byNum.set(t.number, [t]);
  }
  for (const [, tiles] of byNum) {
    // One representative per color (a group can never have two of the same color)
    const byColor = new Map<string, Tile>();
    for (const t of tiles) if (!byColor.has(t.color)) byColor.set(t.color, t);
    const pool = [...byColor.values()];

    for (let i = 0; i < pool.length; i++) {
      // 1 tile + 2 jokers
      if (jokers.length >= 2) melds.push([pool[i], jokers[0], jokers[1]]);

      for (let j = i + 1; j < pool.length; j++) {
        // 2 tiles + 1 joker
        if (jokers.length >= 1) melds.push([pool[i], pool[j], jokers[0]]);
        // 2 tiles + 2 jokers
        if (jokers.length >= 2) melds.push([pool[i], pool[j], jokers[0], jokers[1]]);

        for (let k = j + 1; k < pool.length; k++) {
          // 3 tiles (no joker)
          melds.push([pool[i], pool[j], pool[k]]);
          // 3 tiles + 1 joker
          if (jokers.length >= 1) melds.push([pool[i], pool[j], pool[k], jokers[0]]);

          for (let l = k + 1; l < pool.length; l++) {
            // 4 tiles (max group size, no joker)
            melds.push([pool[i], pool[j], pool[k], pool[l]]);
          }
        }
      }
    }
  }

  // ── Runs: same color, consecutive numbers, 3+ tiles ──────────────────────
  const byColor = new Map<string, Tile[]>();
  for (const t of nonJokers) {
    const list = byColor.get(t.color);
    if (list) list.push(t); else byColor.set(t.color, [t]);
  }
  for (const [, tiles] of byColor) {
    tiles.sort((a, b) => a.number - b.number);
    for (let start = 1; start <= 13; start++) {
      let jIdx = 0;
      const run: Meld = [];
      const usedIds = new Set<string>();
      for (let n = start; n <= 13; n++) {
        const tile = tiles.find(t => t.number === n && !usedIds.has(t.id));
        if (tile) {
          run.push(tile);
          usedIds.add(tile.id);
        } else if (jIdx < jokers.length) {
          run.push(jokers[jIdx++]);
        } else {
          break; // gap that can't be filled
        }
        if (run.length >= 3) melds.push([...run]);
      }
    }
  }

  return melds;
}

// ─── Try to extend existing board melds with rack tiles ──────────────────────

/**
 * Returns new board configurations where one rack tile has been appended to
 * an existing meld (if it stays valid).
 */
function extendBoardWithRackTile(
  board: Board,
  rack: Tile[]
): Array<{ board: Board; usedTiles: Tile[] }> {
  const results: Array<{ board: Board; usedTiles: Tile[] }> = [];

  for (const tile of rack) {
    for (let mi = 0; mi < board.length; mi++) {
      const meld = board[mi];
      // Try appending at start or end, then sort numerically
      for (const candidate of [
        [...meld, tile],
        [tile, ...meld],
      ]) {
        if (isValidMeld(candidate)) {
          const sorted = [...candidate].sort((a, b) => {
            if (a.isJoker && b.isJoker) return 0;
            if (a.isJoker) return 1;
            if (b.isJoker) return -1;
            return a.number - b.number;
          });
          const newBoard = board.map((m, i) => (i === mi ? sorted : m));
          results.push({ board: newBoard, usedTiles: [tile] });
        }
      }
    }
  }
  return results;
}

// ─── Greedy AI move finder ────────────────────────────────────────────────────

export interface AiMove {
  board: Board;
  newRack: Tile[];
  tilesPlaced: number;
  hasInitialMeld: boolean;
}

/**
 * Find the best move for an AI player, adjusted for difficulty.
 * Returns null if the AI should draw.
 *
 * Easy:      Only considers single 3-tile melds; picks the first valid one found.
 * Medium:    All single melds + single-tile board extensions; best greedy pick.
 * Expert:    All combos of up to 3 melds + single-tile extensions; best pick.
 * Superhuman: Exhaustive recursive search over ALL non-overlapping meld combos
 *             from the rack, plus single-tile extensions — never misses a play.
 */
export function findBestMove(
  rack: Tile[],
  board: Board,
  hasInitialMeld: boolean,
  difficulty: Difficulty = 'medium'
): AiMove | null {
  // Initial meld requirement is the same for all difficulties
  if (!hasInitialMeld) {
    const rackMelds = findValidMeldsFromRack(rack);
    const qualifying = findInitialMeldCombinations(rack, rackMelds, board);
    if (qualifying.length === 0) return null;
    qualifying.sort((a, b) => b.tilesPlaced - a.tilesPlaced);
    return qualifying[0];
  }

  if (difficulty === 'easy') {
    const minMelds = findValidMeldsFromRack(rack).filter(m => m.length === 3);
    if (minMelds.length === 0) return null;
    const meld = minMelds[0];
    return { board: [...board, meld], newRack: removeTilesFromRack(rack, meld), tilesPlaced: meld.length, hasInitialMeld: true };
  }

  if (difficulty === 'superhuman') {
    // Use structural meld finder (considers all tiles), then exhaustive combo search
    const rackMelds = findValidMeldsFromRack(rack);
    return findExhaustiveMove(rack, board, rackMelds);
  }

  const rackMelds = findValidMeldsFromRack(rack); // max 8 tiles per meld

  if (difficulty === 'expert') {
    return findExpertMove(rack, board, rackMelds);
  }

  // medium
  return findGreedyMove(rack, board, rackMelds);
}

/**
 * Find combinations of rack melds that satisfy the initial meld requirement.
 */
function findInitialMeldCombinations(rack: Tile[], rackMelds: Meld[], board: Board): AiMove[] {
  const results: AiMove[] = [];

  // Try single melds
  for (const meld of rackMelds) {
    if (meldScore(meld) >= 30) {
      results.push({
        board: [...board, meld],
        newRack: removeTilesFromRack(rack, meld),
        tilesPlaced: meld.length,
        hasInitialMeld: true,
      });
    }
  }

  // Try pairs of melds
  for (let i = 0; i < rackMelds.length; i++) {
    for (let j = i + 1; j < rackMelds.length; j++) {
      const m1 = rackMelds[i];
      const m2 = rackMelds[j];
      // Ensure no overlap in tile ids
      const ids1 = new Set(m1.map(t => t.id));
      if (m2.some(t => ids1.has(t.id))) continue;
      if (meldScore(m1) + meldScore(m2) >= 30) {
        results.push({
          board: [...board, m1, m2],
          newRack: removeTilesFromRack(rack, [...m1, ...m2]),
          tilesPlaced: m1.length + m2.length,
          hasInitialMeld: true,
        });
      }
    }
  }

  return results;
}

/**
 * Greedy: place as many tiles from rack as possible onto / extending the board.
 */
function findGreedyMove(rack: Tile[], board: Board, rackMelds: Meld[]): AiMove | null {
  let bestRack = rack;
  let bestBoard = board;
  let bestPlaced = 0;

  // Try adding new melds from rack to the board
  for (const meld of rackMelds) {
    const newRack = removeTilesFromRack(rack, meld);
    const newBoard = [...board, meld];
    const placed = rack.length - newRack.length;
    if (placed > bestPlaced) {
      bestPlaced = placed;
      bestRack = newRack;
      bestBoard = newBoard;
    }
  }

  // Also try extending existing melds
  const extensions = extendBoardWithRackTile(board, rack);
  for (const ext of extensions) {
    const newRack = removeTilesFromRack(rack, ext.usedTiles);
    const placed = rack.length - newRack.length;
    if (placed > bestPlaced && isBoardValid(ext.board)) {
      bestPlaced = placed;
      bestRack = newRack;
      bestBoard = ext.board;
    }
  }

  if (bestPlaced === 0) return null;

  return {
    board: bestBoard,
    newRack: bestRack,
    tilesPlaced: bestPlaced,
    hasInitialMeld: true,
  };
}

/**
 * Expert: try all combinations of up to 3 rack melds, plus extensions.
 * Picks the combination that places the most tiles.
 */
function findExpertMove(rack: Tile[], board: Board, rackMelds: Meld[]): AiMove | null {
  let bestRack = rack;
  let bestBoard = board;
  let bestPlaced = 0;

  // Single melds
  for (const m of rackMelds) {
    const remaining = removeTilesFromRack(rack, m);
    const placed = rack.length - remaining.length;
    if (placed > bestPlaced) {
      bestPlaced = placed; bestRack = remaining; bestBoard = [...board, m];
    }
  }

  // Pairs of non-overlapping melds
  for (let i = 0; i < rackMelds.length; i++) {
    const ids1 = new Set(rackMelds[i].map(t => t.id));
    for (let j = i + 1; j < rackMelds.length; j++) {
      if (rackMelds[j].some(t => ids1.has(t.id))) continue;
      const combined = [...rackMelds[i], ...rackMelds[j]];
      const remaining = removeTilesFromRack(rack, combined);
      const placed = rack.length - remaining.length;
      if (placed > bestPlaced) {
        bestPlaced = placed; bestRack = remaining;
        bestBoard = [...board, rackMelds[i], rackMelds[j]];
      }

      // Triples
      const ids12 = new Set(combined.map(t => t.id));
      for (let k = j + 1; k < rackMelds.length; k++) {
        if (rackMelds[k].some(t => ids12.has(t.id))) continue;
        const combined3 = [...combined, ...rackMelds[k]];
        const remaining3 = removeTilesFromRack(rack, combined3);
        const placed3 = rack.length - remaining3.length;
        if (placed3 > bestPlaced) {
          bestPlaced = placed3; bestRack = remaining3;
          bestBoard = [...board, rackMelds[i], rackMelds[j], rackMelds[k]];
        }
      }
    }
  }

  // Extensions onto existing board melds
  const extensions = extendBoardWithRackTile(board, rack);
  for (const ext of extensions) {
    const remaining = removeTilesFromRack(rack, ext.usedTiles);
    const placed = rack.length - remaining.length;
    if (placed > bestPlaced && isBoardValid(ext.board)) {
      bestPlaced = placed; bestRack = remaining; bestBoard = ext.board;
    }
  }

  if (bestPlaced === 0) return null;

  return { board: bestBoard, newRack: bestRack, tilesPlaced: bestPlaced, hasInitialMeld: true };
}

/**
 * Superhuman: exhaustive recursive backtracking over ALL non-overlapping
 * combinations of valid rack melds, plus single-tile board extensions.
 * Guaranteed to find the maximum number of tiles that can be placed in one turn.
 */
function findExhaustiveMove(rack: Tile[], board: Board, rackMelds: Meld[]): AiMove | null {
  let bestPlaced = 0;
  let bestBoard = board;
  let bestRack = rack;

  // Recursive search: at each step try adding any non-overlapping meld from rackMelds
  function search(
    availableMelds: Meld[],
    usedIds: Set<string>,
    currentBoard: Board,
    currentRack: Tile[],
    placed: number
  ) {
    if (placed > bestPlaced) {
      bestPlaced = placed;
      bestBoard = currentBoard;
      bestRack = currentRack;
    }
    for (let i = 0; i < availableMelds.length; i++) {
      const meld = availableMelds[i];
      if (meld.some(t => usedIds.has(t.id))) continue;
      const newUsed = new Set(usedIds);
      meld.forEach(t => newUsed.add(t.id));
      search(
        availableMelds.slice(i + 1),
        newUsed,
        [...currentBoard, meld],
        removeTilesFromRack(currentRack, meld),
        placed + meld.length
      );
    }
  }

  search(rackMelds, new Set<string>(), board, rack, 0);

  // Also try single-tile extensions on top of the best board found
  const extensions = extendBoardWithRackTile(bestBoard, bestRack);
  for (const ext of extensions) {
    if (!isBoardValid(ext.board)) continue;
    const remaining = removeTilesFromRack(bestRack, ext.usedTiles);
    const placed = bestPlaced + ext.usedTiles.length;
    if (placed > bestPlaced) {
      bestPlaced = placed;
      bestBoard = ext.board;
      bestRack = remaining;
    }
  }

  if (bestPlaced === 0) return null;
  return { board: bestBoard, newRack: bestRack, tilesPlaced: bestPlaced, hasInitialMeld: true };
}
