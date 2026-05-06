import type { Tile, Meld, Board, Difficulty } from '../types';
import {
  isValidMeld,
  isBoardValid,
  meldScore,
  removeTilesFromRack,
  sortMeldForDisplay,
} from '../game/logic';

// ─── Find all valid melds from a rack ────────────────────────────────────────
// Structural enumeration — considers every tile in the rack regardless of size,
// unlike a brute-force subset generator which would be prohibitively slow or
// silently cap the tiles it looks at.

export function findValidMeldsFromRack(rack: Tile[]): Meld[] {
  const results: Meld[] = [];
  const seen = new Set<string>();
  const jokers = rack.filter(t => t.isJoker);
  const nonJokers = rack.filter(t => !t.isJoker);

  // Deduplicate by sorted tile-id key so the same tile set isn't added twice.
  function add(meld: Meld) {
    const key = meld.map(t => t.id).sort().join('|');
    if (!seen.has(key)) { seen.add(key); results.push(meld); }
  }

  // ── Groups: same number, distinct colors, 3–4 tiles ──────────────────────
  const byNum = new Map<number, Tile[]>();
  for (const t of nonJokers) {
    const list = byNum.get(t.number);
    if (list) list.push(t); else byNum.set(t.number, [t]);
  }
  for (const [, tiles] of byNum) {
    const byColor = new Map<string, Tile>();
    for (const t of tiles) if (!byColor.has(t.color)) byColor.set(t.color, t);
    const pool = [...byColor.values()];

    for (let i = 0; i < pool.length; i++) {
      // 1 tile + 2 jokers
      if (jokers.length >= 2) add([pool[i], jokers[0], jokers[1]]);
      for (let j = i + 1; j < pool.length; j++) {
        // 2 tiles + each individual joker (KEY FIX: use each joker separately so
        // two different 1-joker melds can be combined in the exhaustive search)
        for (const jk of jokers) add([pool[i], pool[j], jk]);
        if (jokers.length >= 2) add([pool[i], pool[j], jokers[0], jokers[1]]);
        for (let k = j + 1; k < pool.length; k++) {
          add([pool[i], pool[j], pool[k]]);
          for (const jk of jokers) add([pool[i], pool[j], pool[k], jk]);
          for (let l = k + 1; l < pool.length; l++) {
            add([pool[i], pool[j], pool[k], pool[l]]);
          }
        }
      }
    }
  }

  // ── Runs: same color, consecutive numbers, 3+ tiles ──────────────────────
  // Build a run template (Tile | null for joker slots) from each start position.
  // For runs needing 1 joker, emit once per available joker tile so two
  // independent 1-joker runs are distinguishable by their joker tile id.
  const byColor = new Map<string, Tile[]>();
  for (const t of nonJokers) {
    const list = byColor.get(t.color);
    if (list) list.push(t); else byColor.set(t.color, [t]);
  }
  for (const [, colorTiles] of byColor) {
    colorTiles.sort((a, b) => a.number - b.number);
    for (let start = 1; start <= 13; start++) {
      const template: Array<Tile | null> = [];
      const usedNums = new Set<number>();
      let jokersNeeded = 0;
      for (let n = start; n <= 13; n++) {
        const tile = colorTiles.find(t => t.number === n && !usedNums.has(n));
        if (tile) {
          template.push(tile);
          usedNums.add(n);
        } else if (jokersNeeded < jokers.length) {
          template.push(null); // joker slot
          jokersNeeded++;
        } else {
          break;
        }
        if (template.length >= 3) {
          if (jokersNeeded === 0) {
            add([...template] as Tile[]);
          } else if (jokersNeeded === 1) {
            // Emit with each available joker so two runs can each get their own
            for (const jk of jokers) add(template.map(s => s ?? jk));
          } else {
            let ji = 0;
            add(template.map(s => s ?? jokers[ji++]));
          }
        }
      }
    }
  }

  return results;
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
      for (const candidate of [[tile, ...meld], [...meld, tile]]) {
        if (isValidMeld(candidate)) {
          // Use sortMeldForDisplay so jokers land in their proper interior slot
          const sorted = sortMeldForDisplay(candidate);
          const newBoard = board.map((m, i) => (i === mi ? sorted : m));
          results.push({ board: newBoard, usedTiles: [tile] });
        }
      }
    }
  }
  return results;
}

/** Iteratively apply single-tile board extensions until no more are possible. */
function applyExtensions(
  board: Board,
  rack: Tile[],
  placed: number
): { board: Board; rack: Tile[]; placed: number } {
  let cur = { board, rack, placed };
  let improved = true;
  while (improved) {
    improved = false;
    for (const ext of extendBoardWithRackTile(cur.board, cur.rack)) {
      if (!isBoardValid(ext.board)) continue;
      cur = {
        board: ext.board,
        rack: removeTilesFromRack(cur.rack, ext.usedTiles),
        placed: cur.placed + ext.usedTiles.length,
      };
      improved = true;
      break; // restart with updated board
    }
  }
  return cur;
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
 * Tries all single melds AND all pairs of non-overlapping melds so the AI
 * doesn't greedily consume the joker in a run when it could serve a second meld.
 */
function findGreedyMove(rack: Tile[], board: Board, rackMelds: Meld[]): AiMove | null {
  let bestRack = rack;
  let bestBoard = board;
  let bestPlaced = 0;

  // Single melds
  for (const meld of rackMelds) {
    const newRack = removeTilesFromRack(rack, meld);
    const placed = rack.length - newRack.length;
    if (placed > bestPlaced) {
      bestPlaced = placed; bestRack = newRack; bestBoard = [...board, meld];
    }
  }

  // Pairs of non-overlapping melds (catches joker-in-one + real-meld-in-other)
  for (let i = 0; i < rackMelds.length; i++) {
    const ids1 = new Set(rackMelds[i].map(t => t.id));
    for (let j = i + 1; j < rackMelds.length; j++) {
      if (rackMelds[j].some(t => ids1.has(t.id))) continue;
      const combined = [...rackMelds[i], ...rackMelds[j]];
      const newRack = removeTilesFromRack(rack, combined);
      const placed = rack.length - newRack.length;
      if (placed > bestPlaced) {
        bestPlaced = placed; bestRack = newRack;
        bestBoard = [...board, rackMelds[i], rackMelds[j]];
      }
    }
  }

  // Iterative extensions
  const ext = applyExtensions(bestBoard, bestRack, bestPlaced);
  if (ext.placed > bestPlaced) {
    bestPlaced = ext.placed; bestBoard = ext.board; bestRack = ext.rack;
  }

  if (bestPlaced === 0) return null;
  return { board: bestBoard, newRack: bestRack, tilesPlaced: bestPlaced, hasInitialMeld: true };
}

/**
 * Expert: try all combinations of up to 3 rack melds, plus extensions.
 * Picks the combination that places the most tiles.
 */
function findExpertMove(rack: Tile[], board: Board, rackMelds: Meld[]): AiMove | null {
  let bestRack = rack;
  let bestBoard = board;
  let bestPlaced = 0;

  for (const m of rackMelds) {
    const remaining = removeTilesFromRack(rack, m);
    const placed = rack.length - remaining.length;
    if (placed > bestPlaced) {
      bestPlaced = placed; bestRack = remaining; bestBoard = [...board, m];
    }
  }

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

  // Iterative extensions on top of best new-meld combo
  const ext = applyExtensions(bestBoard, bestRack, bestPlaced);
  if (ext.placed > bestPlaced) {
    bestPlaced = ext.placed; bestBoard = ext.board; bestRack = ext.rack;
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
  // Secondary score: penalise jokers sitting at the exposed ends of runs
  // (a human can steal an end-joker by placing the real tile there).
  function endJokerPenalty(b: Board): number {
    let n = 0;
    for (const meld of b) {
      if (meld.length < 3) continue;
      if (meld[0]?.isJoker) n++;
      if (meld[meld.length - 1]?.isJoker) n++;
    }
    return n;
  }

  let bestScore = -1;
  let bestPlaced = 0;
  let bestBoard = board;
  let bestRack = rack;

  function score(placed: number, b: Board) { return placed * 1000 - endJokerPenalty(b); }

  function search(
    availableMelds: Meld[],
    usedIds: Set<string>,
    currentBoard: Board,
    currentRack: Tile[],
    placed: number
  ) {
    const s = score(placed, currentBoard);
    if (s > bestScore) {
      bestScore = s; bestPlaced = placed; bestBoard = currentBoard; bestRack = currentRack;
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

  // Iterative single-tile extensions on top of the best meld combo
  const ext = applyExtensions(bestBoard, bestRack, bestPlaced);
  if (score(ext.placed, ext.board) > bestScore) {
    bestPlaced = ext.placed; bestBoard = ext.board; bestRack = ext.rack;
  }

  if (bestPlaced === 0) return null;
  return { board: bestBoard, newRack: bestRack, tilesPlaced: bestPlaced, hasInitialMeld: true };
}
