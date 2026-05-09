import type { Tile, TileColor, Meld, Board, Difficulty } from '../types';
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

// ─── Free joker liberation ───────────────────────────────────────────────────
//
// A "free" joker is one whose board meld stays a valid meld after removing it
// (e.g. the joker in a 4-tile group {5,5,5,★} — drop it and {5,5,5} is still
// a valid group). Greedy-style solvers don't manipulate the board, so without
// help they never retrieve such jokers. We pre-extract free jokers, hand them
// to the solver as bonus rack tiles, then restore any unused ones to their
// original meld in the result.

interface FreeJoker {
  meldIdx: number;
  jokerIdx: number;
  tile: Tile;
}

function findFreeJokers(board: Board): FreeJoker[] {
  const out: FreeJoker[] = [];
  for (let mi = 0; mi < board.length; mi++) {
    const meld = board[mi];
    for (let ji = 0; ji < meld.length; ji++) {
      if (!meld[ji].isJoker) continue;
      const without = meld.filter((_, k) => k !== ji);
      if (isValidMeld(without)) {
        out.push({ meldIdx: mi, jokerIdx: ji, tile: meld[ji] });
        break;
      }
    }
  }
  return out;
}

type GreedySolver = (rack: Tile[], board: Board, rackMelds: Meld[]) => AiMove | null;

function solveWithLiberatedJokers(rack: Tile[], board: Board, solve: GreedySolver): AiMove | null {
  const baseline = solve(rack, board, findValidMeldsFromRack(rack));
  const freeJokers = findFreeJokers(board);
  if (freeJokers.length === 0) return baseline;

  const augmentedRack = [...rack, ...freeJokers.map(f => f.tile)];
  const shrunkBoard: Board = board.map((meld, mi) => {
    const f = freeJokers.find(x => x.meldIdx === mi);
    return f ? meld.filter((_, ji) => ji !== f.jokerIdx) : meld;
  });
  const aug = solve(augmentedRack, shrunkBoard, findValidMeldsFromRack(augmentedRack));
  if (!aug) return baseline;

  const jokerIds = new Set(freeJokers.map(f => f.tile.id));
  const newRackIds = new Set(aug.newRack.map(t => t.id));
  const unused = freeJokers.filter(f => newRackIds.has(f.tile.id));

  // Restore unused jokers to their origin meld — only safe when the meld is
  // unmodified (no extensions added). Otherwise abort and keep the baseline,
  // since we can't claim a joker we didn't actually use.
  for (const f of unused) {
    const target = aug.board[f.meldIdx];
    const originalIds = board[f.meldIdx].filter((_, k) => k !== f.jokerIdx).map(t => t.id);
    const targetIds = new Set(target.map(t => t.id));
    if (originalIds.length !== targetIds.size || !originalIds.every(id => targetIds.has(id))) {
      return baseline;
    }
    aug.board[f.meldIdx] = sortMeldForDisplay([...target, f.tile]);
  }

  aug.newRack = aug.newRack.filter(t => !jokerIds.has(t.id));
  aug.tilesPlaced -= (freeJokers.length - unused.length);

  if (aug.tilesPlaced === 0) return baseline;
  if (!baseline || aug.tilesPlaced > baseline.tilesPlaced) return aug;
  return baseline;
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
 * Superhuman: Pool-partition solver — combines board + rack into one tile pool
 *             and finds the partition into valid melds that places the most
 *             rack tiles. Subsumes every board manipulation (run splits, meld
 *             merges, multi-tile rearrangements, joker repositioning).
 *             Seeded with a greedy lower bound so branch-and-bound prunes
 *             from the first node.
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
    const best = qualifying[0];
    // For superhuman: run the full pool-partition solver on the remaining rack
    // tiles now that the initial meld is committed. This lets the AI rearrange
    // all on-table tiles + remaining rack tiles optimally, not just tack on
    // single tiles one at a time.
    if (difficulty === 'superhuman') {
      const exhaustive = findExhaustiveMove(best.newRack, best.board);
      return exhaustive ?? best;
    }
    // For other difficulties: extend with single-tile board additions.
    // The ≥30 rule is satisfied by the rack-only melds we just laid, so
    // extending other melds with single rack tiles doesn't violate it.
    const ext = applyExtensions(best.board, best.newRack, best.tilesPlaced);
    if (ext.placed > best.tilesPlaced) {
      return { board: ext.board, newRack: ext.rack, tilesPlaced: ext.placed, hasInitialMeld: true };
    }
    return best;
  }

  if (difficulty === 'easy') {
    const minMelds = findValidMeldsFromRack(rack).filter(m => m.length === 3);
    if (minMelds.length === 0) return null;
    const meld = minMelds[0];
    return { board: [...board, meld], newRack: removeTilesFromRack(rack, meld), tilesPlaced: meld.length, hasInitialMeld: true };
  }

  if (difficulty === 'superhuman') {
    return findExhaustiveMove(rack, board);
  }

  if (difficulty === 'expert') {
    return solveWithLiberatedJokers(rack, board, findExpertMove);
  }

  // medium
  return solveWithLiberatedJokers(rack, board, findGreedyMove);
}

/**
 * Find combinations of rack melds that satisfy the initial meld requirement
 * (combined score ≥ 30). Searches subsets of up to 5 disjoint melds so the AI
 * can play e.g. three small groups + a run on its first turn rather than
 * being forced into the smallest qualifying combo.
 */
function findInitialMeldCombinations(rack: Tile[], rackMelds: Meld[], board: Board): AiMove[] {
  const results: AiMove[] = [];
  // High-scoring melds first so we hit ≥30 quickly and surface fat plays early.
  const sorted = [...rackMelds].sort((a, b) => meldScore(b) - meldScore(a));
  const MAX_DEPTH = 5;
  const RESULT_CAP = 500;

  function recurse(start: number, picked: Meld[], usedIds: Set<string>, score: number, tiles: number) {
    if (score >= 30) {
      results.push({
        board: [...board, ...picked],
        newRack: removeTilesFromRack(rack, picked.flat()),
        tilesPlaced: tiles,
        hasInitialMeld: true,
      });
      if (results.length >= RESULT_CAP) return;
    }
    if (picked.length >= MAX_DEPTH) return;
    for (let i = start; i < sorted.length; i++) {
      const m = sorted[i];
      if (m.some(t => usedIds.has(t.id))) continue;
      const next = new Set(usedIds);
      m.forEach(t => next.add(t.id));
      picked.push(m);
      recurse(i + 1, picked, next, score + meldScore(m), tiles + m.length);
      picked.pop();
      if (results.length >= RESULT_CAP) return;
    }
  }
  recurse(0, [], new Set(), 0, 0);

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

// ─── Pool-partition solver (superhuman) ──────────────────────────────────────
//
// The canonical Rummikub move-finding problem: combine all board tiles + rack
// tiles into a single pool, then search for a partition of the pool into valid
// melds that
//   • places every board tile (a board tile can never be discarded), and
//   • maximises the number of rack tiles placed.
//
// This subsumes every ad-hoc board mutation a human would consider — splitting
// runs, merging melds, repositioning jokers, multi-tile re-arrangements — in
// one search.
//
// Branch-and-bound ordered by canonical tile key. At each node the smallest
// unassigned tile T is forced to be the canonical-first tile of its meld
// (smallest color in a group, smallest non-joker number in a run); rack tiles
// may also be dropped (left on the rack). Jokers sort last so they are only
// reached after every real tile has been placed or dropped.

const COLOR_RANK: Record<TileColor, number> = { red: 0, blue: 1, black: 2, orange: 3 };

interface Slot { tile: Tile; isRack: boolean }

function slotKey(s: Slot): number {
  return s.tile.isJoker ? 100000 : COLOR_RANK[s.tile.color] * 100 + s.tile.number;
}

interface PartitionResult {
  melds: Meld[];
  rackIdsPlaced: Set<string>;
}

function findBestPartition(
  boardTiles: Tile[],
  rackTiles: Tile[],
  seed?: { rackUsed: number; melds: Meld[]; rackIds: Set<string> }
): PartitionResult {
  const slots: Slot[] = [
    ...boardTiles.map(t => ({ tile: t, isRack: false } as Slot)),
    ...rackTiles.map(t => ({ tile: t, isRack: true } as Slot)),
  ];
  slots.sort((a, b) => slotKey(a) - slotKey(b) || a.tile.id.localeCompare(b.tile.id));
  const N = slots.length;
  const inUse = new Array<boolean>(N).fill(true);
  const allRackIds = new Set(rackTiles.map(t => t.id));

  // Seed best with a cheap lower-bound (e.g. greedy result) so the bound prune
  // kicks in immediately. -1 means no solution yet.
  let bestRackUsed = seed ? seed.rackUsed : -1;
  let bestMelds: Meld[] = seed ? seed.melds : [];
  let bestRackIds = seed ? seed.rackIds : new Set<string>();
  let nodes = 0;
  const NODE_LIMIT = 1500000;

  function rackCountIn(idxs: number[]): number {
    let c = 0;
    for (const j of idxs) if (slots[j].isRack) c++;
    return c;
  }

  function commit(rackUsed: number, melds: Meld[]) {
    if (rackUsed <= bestRackUsed) return;
    bestRackUsed = rackUsed;
    bestMelds = melds.map(m => sortMeldForDisplay([...m]));
    bestRackIds = new Set();
    for (const m of bestMelds) for (const t of m) {
      if (allRackIds.has(t.id)) bestRackIds.add(t.id);
    }
  }

  function nextActive(from: number): number {
    let i = from;
    while (i < N && !inUse[i]) i++;
    return i;
  }

  function remainingRackCount(from: number): number {
    let c = 0;
    for (let i = from; i < N; i++) if (inUse[i] && slots[i].isRack) c++;
    return c;
  }

  // Groups whose canonical-first (smallest non-joker) tile is slots[idx].
  // Other tiles must share number AND have higher color rank, OR be jokers.
  function enumGroups(idx: number): number[][] {
    const s = slots[idx];
    const num = s.tile.number;
    const myRank = COLOR_RANK[s.tile.color];
    const cands: number[] = [];
    for (let j = idx + 1; j < N; j++) {
      if (!inUse[j]) continue;
      const t = slots[j].tile;
      if (t.isJoker) cands.push(j);
      else if (t.number === num && COLOR_RANK[t.color] > myRank) cands.push(j);
    }
    const out: number[][] = [];
    const usedCols = new Set<TileColor>([s.tile.color]);
    const picked: number[] = [];
    function pick(start: number) {
      if (picked.length >= 2) out.push([idx, ...picked]);
      if (picked.length === 3) return;
      for (let i = start; i < cands.length; i++) {
        const j = cands[i];
        const t = slots[j].tile;
        if (!t.isJoker) {
          if (usedCols.has(t.color)) continue;
          usedCols.add(t.color);
        }
        picked.push(j);
        pick(i + 1);
        picked.pop();
        if (!t.isJoker) usedCols.delete(t.color);
      }
    }
    pick(0);
    return out;
  }

  // Runs whose canonical-first (smallest non-joker) tile is slots[idx].
  // Run start may be ≤ s.number when leading positions are filled by jokers.
  function enumRuns(idx: number): number[][] {
    const s = slots[idx];
    const sNum = s.tile.number;
    const color = s.tile.color;

    const realByNum = new Map<number, number[]>();
    const jokerIdxs: number[] = [];
    for (let j = idx + 1; j < N; j++) {
      if (!inUse[j]) continue;
      const t = slots[j].tile;
      if (t.isJoker) jokerIdxs.push(j);
      else if (t.color === color) {
        const list = realByNum.get(t.number) ?? [];
        list.push(j);
        realByNum.set(t.number, list);
      }
    }

    const out: number[][] = [];
    const positionIdxs: number[] = [];
    const usedReal = new Set<number>();

    function buildPos(pos: number, end: number, jokersUsed: number) {
      if (pos > end) {
        out.push([...positionIdxs]);
        return;
      }
      if (pos === sNum) {
        positionIdxs.push(idx);
        buildPos(pos + 1, end, jokersUsed);
        positionIdxs.pop();
        return;
      }
      const reals = realByNum.get(pos) ?? [];
      for (const r of reals) {
        if (usedReal.has(r)) continue;
        usedReal.add(r);
        positionIdxs.push(r);
        buildPos(pos + 1, end, jokersUsed);
        positionIdxs.pop();
        usedReal.delete(r);
      }
      if (jokersUsed < jokerIdxs.length) {
        const j = jokerIdxs[jokersUsed];
        positionIdxs.push(j);
        buildPos(pos + 1, end, jokersUsed + 1);
        positionIdxs.pop();
      }
    }

    const minStart = Math.max(1, sNum - jokerIdxs.length);
    for (let start = minStart; start <= sNum; start++) {
      const lowJokers = sNum - start;
      if (lowJokers > jokerIdxs.length) continue;
      // Pre-place leading jokers (positions start..sNum-1)
      for (let i = 0; i < lowJokers; i++) positionIdxs.push(jokerIdxs[i]);
      // end must satisfy length ≥ 3 (end ≥ start + 2) AND include anchor (end ≥ sNum).
      const minEnd = Math.max(sNum, start + 2);
      for (let end = minEnd; end <= 13; end++) {
        buildPos(sNum, end, lowJokers);
      }
      for (let i = 0; i < lowJokers; i++) positionIdxs.pop();
    }

    return out;
  }

  function recurse(rackUsed: number, melds: Meld[]) {
    if (++nodes > NODE_LIMIT) return;

    const i = nextActive(0);
    if (i >= N) {
      commit(rackUsed, melds);
      return;
    }

    // Upper-bound prune: can't beat current best even if every remaining rack
    // tile gets placed.
    if (rackUsed + remainingRackCount(i) <= bestRackUsed) return;

    const s = slots[i];

    if (s.tile.isJoker) {
      // We've reached the joker tail. Any remaining mandatory (board) joker
      // means this branch failed — board tiles must always end up in a meld.
      // Otherwise drop all remaining (rack) jokers and commit.
      for (let j = i; j < N; j++) {
        if (inUse[j] && !slots[j].isRack) return;
      }
      commit(rackUsed, melds);
      return;
    }

    // Place s in a meld first; sort candidates by rack-tile count desc so
    // high-yield branches surface earlier and the bound prunes more aggressively.
    // Drop is the last resort (only valid for rack tiles).
    const candidates: number[][] = [...enumGroups(i), ...enumRuns(i)];
    candidates.sort((a, b) => rackCountIn(b) - rackCountIn(a));
    for (const idxs of candidates) {
      let used = 0;
      for (const j of idxs) {
        inUse[j] = false;
        if (slots[j].isRack) used++;
      }
      melds.push(idxs.map(j => slots[j].tile));
      recurse(rackUsed + used, melds);
      melds.pop();
      for (const j of idxs) inUse[j] = true;
    }

    if (s.isRack) {
      inUse[i] = false;
      recurse(rackUsed, melds);
      inUse[i] = true;
    }
  }

  recurse(0, []);

  return { melds: bestMelds, rackIdsPlaced: bestRackIds };
}

// ─── Joker vulnerability & migration ─────────────────────────────────────────
//
// After the pool-partition solver commits its result it may leave jokers in
// positions that opponents can immediately steal:
//   Case 1 — redundant in a group: {4r,4b,4k,★} → removing ★ keeps a valid
//             3-tile group, so any opponent who has the missing color can take it.
//   Case 2 — interior of a splittable run: {3-4-5-★-7-8-9} → both sides are
//             valid melds on their own, so any opponent can split and pocket ★.
//
// Solution: after the solver, try to move each vulnerable joker to a safer
// position elsewhere on the board (end of a run, extending a 3-tile group to 4)
// without changing which rack tiles were played.

function isJokerVulnerable(meld: Meld, jokerPos: number): boolean {
  // Case 1: removing the joker still leaves a valid meld.
  const without = meld.filter((_, k) => k !== jokerPos);
  if (without.length >= 3 && isValidMeld(without)) return true;

  // Case 2: joker is interior to a run and both sides are independently valid.
  if (jokerPos > 0 && jokerPos < meld.length - 1) {
    const left = meld.slice(0, jokerPos);
    const right = meld.slice(jokerPos + 1);
    if (left.length >= 3 && right.length >= 3 && isValidMeld(left) && isValidMeld(right)) {
      return true;
    }
  }
  return false;
}

/**
 * Post-process a solved board by relocating vulnerable jokers to safer spots.
 * Never changes which rack tiles were played — only reshuffles board tiles.
 * Returns the improved board (may be the same object if nothing changed).
 */
function migrateVulnerableJokers(board: Board): Board {
  let current = board.map(m => [...m]); // shallow-copy each meld

  let progress = true;
  while (progress) {
    progress = false;

    outer:
    for (let mi = 0; mi < current.length; mi++) {
      const meld = current[mi];
      for (let ji = 0; ji < meld.length; ji++) {
        if (!meld[ji].isJoker) continue;
        if (!isJokerVulnerable(meld, ji)) continue;

        const joker = meld[ji];

        // Build the "source" board state after extracting the joker.
        // Case 1: just remove it, meld stays intact.
        // Case 2: split into two sub-melds (left / right of joker).
        const without = meld.filter((_, k) => k !== ji);
        let sourceBoard: Meld[];
        if (without.length >= 3 && isValidMeld(without)) {
          // Case 1 — simple removal
          sourceBoard = current.map((m, i) => i === mi ? without : m);
        } else {
          // Case 2 — split
          const left = meld.slice(0, ji);
          const right = meld.slice(ji + 1);
          sourceBoard = [
            ...current.slice(0, mi),
            left,
            right,
            ...current.slice(mi + 1),
          ];
        }

        // Try inserting the joker into every other meld (prepend / append).
        for (let ti = 0; ti < sourceBoard.length; ti++) {
          const target = sourceBoard[ti];
          for (const candidate of [[joker, ...target], [...target, joker]]) {
            if (!isValidMeld(candidate)) continue;
            // Check the joker is NOT vulnerable in its new home.
            const newJokerPos = candidate.indexOf(joker);
            if (isJokerVulnerable(candidate, newJokerPos)) continue;

            const newBoard = sourceBoard.map((m, i) => i === ti ? sortMeldForDisplay(candidate) : m);
            if (!isBoardValid(newBoard)) continue;

            current = newBoard;
            progress = true;
            break outer;
          }
        }
      }
    }
  }

  return current;
}

function findExhaustiveMove(rack: Tile[], board: Board): AiMove | null {
  // Seed the partition with a cheap greedy lower bound so the upper-bound
  // prune kicks in from the first node. The greedy result is a valid
  // (board, rack) split; we just convert it into the partition's frame.
  const rackMelds = findValidMeldsFromRack(rack);
  const greedy = findGreedyMove(rack, board, rackMelds);
  let seed: { rackUsed: number; melds: Meld[]; rackIds: Set<string> } | undefined;
  if (greedy && isBoardValid(greedy.board)) {
    const placedIds = new Set(rack.map(t => t.id).filter(id => !greedy.newRack.some(t => t.id === id)));
    seed = { rackUsed: greedy.tilesPlaced, melds: greedy.board.map(m => sortMeldForDisplay([...m])), rackIds: placedIds };
  }

  const result = findBestPartition(board.flat(), rack, seed);
  if (result.rackIdsPlaced.size === 0) return null;
  // Sanity check — partition must rebuild a valid board.
  if (!isBoardValid(result.melds)) return null;
  // Post-process: move vulnerable jokers to safer positions.
  const safeBoard = migrateVulnerableJokers(result.melds);
  const newRack = rack.filter(t => !result.rackIdsPlaced.has(t.id));
  return {
    board: safeBoard,
    newRack,
    tilesPlaced: result.rackIdsPlaced.size,
    hasInitialMeld: true,
  };
}
