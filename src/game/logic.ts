import type { Tile, TileColor, Meld, Board } from '../types';

const COLORS: TileColor[] = ['red', 'blue', 'black', 'orange'];

// ─── Tile factory ────────────────────────────────────────────────────────────

function makeTile(color: TileColor, number: number, copy: 'a' | 'b'): Tile {
  return { id: `${color}-${number}-${copy}`, number, color, isJoker: false };
}

function makeJoker(index: number): Tile {
  return { id: `joker-${index}`, number: 0, color: 'red', isJoker: true };
}

export function createShuffledDeck(): Tile[] {
  const tiles: Tile[] = [];
  for (const copy of ['a', 'b'] as const) {
    for (const color of COLORS) {
      for (let n = 1; n <= 13; n++) {
        tiles.push(makeTile(color, n, copy));
      }
    }
  }
  tiles.push(makeJoker(1));
  tiles.push(makeJoker(2));
  return fisherYates(tiles);
}

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealTiles(deck: Tile[], count: number): { hand: Tile[]; remaining: Tile[] } {
  return { hand: deck.slice(0, count), remaining: deck.slice(count) };
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Effective number of a tile within a run context (joker takes the value
 * needed to complete the sequence – passed in explicitly).
 */
export function tileValue(tile: Tile): number {
  return tile.isJoker ? 0 : tile.number;
}

export function meldScore(meld: Meld): number {
  // For jokers in a run, we compute their implied value from context
  let score = 0;
  if (isValidRun(meld)) {
    // find the non-joker anchors to determine the sequence
    const nonJokers = meld.filter(t => !t.isJoker);
    if (nonJokers.length === 0) return 0;
    const minNonJoker = Math.min(...nonJokers.map(t => t.number));
    const start = minNonJoker - meld.indexOf(nonJokers.find(t => t.number === minNonJoker)!);
    meld.forEach((t, i) => {
      score += t.isJoker ? (start + i) : t.number;
    });
  } else {
    // group: all tiles same number, joker = that number
    const nonJokers = meld.filter(t => !t.isJoker);
    const num = nonJokers.length > 0 ? nonJokers[0].number : 0;
    meld.forEach(t => { score += t.isJoker ? num : t.number; });
  }
  return score;
}

export function isValidRun(tiles: Tile[]): boolean {
  if (tiles.length < 3) return false;

  // All same color (ignoring jokers)
  const nonJokers = tiles.filter(t => !t.isJoker);
  if (nonJokers.length === 0) return false;
  const color = nonJokers[0].color;
  if (!nonJokers.every(t => t.color === color)) return false;

  // Determine expected sequence: find lowest number among non-jokers
  // and back-calculate the start value accounting for jokers at the beginning
  // Strategy: try to place jokers to fill gaps
  const numbers = tiles.map(t => t.isJoker ? null : t.number);

  // Find min and max of known values
  const known = numbers.filter(n => n !== null) as number[];
  if (known.length === 0) return false;

  const jokerCount = tiles.length - known.length;

  // The run must span exactly tiles.length consecutive numbers
  // We need to find a starting position such that all known values fit
  // and jokers fill the rest, with values 1–13.
  const span = tiles.length;

  // Try each possible start value
  for (let start = 1; start <= 14 - span; start++) {
    const runNums = Array.from({ length: span }, (_, i) => start + i);
    if (runNums[0] < 1 || runNums[runNums.length - 1] > 13) continue;

    // Check: every known number is in runNums, and no duplicates
    let jokersRemaining = jokerCount;
    let valid = true;
    const usedPositions = new Set<number>();

    for (const t of tiles) {
      if (t.isJoker) continue;
      const idx = runNums.indexOf(t.number);
      if (idx === -1 || usedPositions.has(idx)) { valid = false; break; }
      usedPositions.add(idx);
    }

    if (!valid) continue;

    // Check joker count covers remaining positions
    const filledByKnown = usedPositions.size;
    const neededJokers = span - filledByKnown;
    if (neededJokers === jokersRemaining) return true;
  }

  return false;
}

export function isValidGroup(tiles: Tile[]): boolean {
  if (tiles.length < 3 || tiles.length > 4) return false;
  const nonJokers = tiles.filter(t => !t.isJoker);
  if (nonJokers.length === 0) return false;

  const num = nonJokers[0].number;
  if (!nonJokers.every(t => t.number === num)) return false;

  // All colors must be distinct (among non-jokers)
  const colors = nonJokers.map(t => t.color);
  if (new Set(colors).size !== colors.length) return false;

  return true;
}

export function isValidMeld(tiles: Tile[]): boolean {
  if (tiles.length < 3) return false;
  return isValidRun(tiles) || isValidGroup(tiles);
}

export function isBoardValid(board: Board): boolean {
  return board.every(meld => isValidMeld(meld));
}

export function boardScore(board: Board): number {
  return board.reduce((sum, meld) => sum + meldScore(meld), 0);
}

// ─── Initial meld ─────────────────────────────────────────────────────────────

export function initialMeldScore(melds: Meld[]): number {
  return melds.reduce((sum, m) => sum + meldScore(m), 0);
}

export function meetsInitialMeldRequirement(melds: Meld[]): boolean {
  return melds.every(isValidMeld) && initialMeldScore(melds) >= 30;
}

// ─── Rack utilities ───────────────────────────────────────────────────────────

export function removeTilesFromRack(rack: Tile[], tiles: Tile[]): Tile[] {
  const ids = new Set(tiles.map(t => t.id));
  return rack.filter(t => !ids.has(t.id));
}

// Deep clone helpers for snapshot / revert
export function cloneMeld(meld: Meld): Meld {
  return meld.map(t => ({ ...t }));
}

export function cloneBoard(board: Board): Board {
  return board.map(cloneMeld);
}

export function cloneRack(rack: Tile[]): Tile[] {
  return rack.map(t => ({ ...t }));
}

// ─── Display ordering ─────────────────────────────────────────────────────────

/**
 * Sort a meld for display, correctly placing jokers in their implied sequence
 * position rather than always pushing them to the end.
 *
 * - Group (same number): non-jokers sorted ascending, jokers at end.
 * - Run: find the starting number of the sequence and slot jokers into the
 *   gaps they fill, so 3 ★ 5 displays as [3][★][5] (joker = 4).
 */
export function sortMeldForDisplay(meld: Meld): Meld {
  if (meld.length === 0) return meld;

  const nonJokers = meld.filter(t => !t.isJoker).sort((a, b) => a.number - b.number);
  const jokers = meld.filter(t => t.isJoker);

  if (jokers.length === 0) return nonJokers;

  // Group: all non-jokers share the same number → jokers go at the end
  if (nonJokers.length > 0 && nonJokers.every(t => t.number === nonJokers[0].number)) {
    return [...nonJokers, ...jokers];
  }

  // Run: find the starting position that fits all non-jokers, preferring the
  // highest start so jokers end up on the right (high) end by default.
  const n = meld.length;
  for (let start = 14 - n; start >= 1; start--) {
    const runNums = Array.from({ length: n }, (_, i) => start + i);

    // Map each non-joker to its index in this run
    const slotMap = new Map<number, Tile>(); // runIndex → tile
    let valid = true;
    for (const t of nonJokers) {
      const idx = runNums.indexOf(t.number);
      if (idx === -1 || slotMap.has(idx)) { valid = false; break; }
      slotMap.set(idx, t);
    }
    if (!valid) continue;
    if (n - slotMap.size !== jokers.length) continue;

    // Fill remaining slots with jokers in order
    const result: Meld = [];
    let ji = 0;
    for (let i = 0; i < n; i++) {
      result.push(slotMap.has(i) ? slotMap.get(i)! : jokers[ji++]);
    }
    return result;
  }

  // Fallback (shouldn't happen for a valid meld)
  return [...nonJokers, ...jokers];
}

/**
 * Return true if the joker at jokerIndex in meld (stored in display order)
 * can be moved to the opposite end of the run.
 */
export function canFlipJoker(meld: Meld, jokerIndex: number): boolean {
  if (jokerIndex !== 0 && jokerIndex !== meld.length - 1) return false;
  const tile = meld[jokerIndex];
  if (!tile?.isJoker) return false;

  const nonJokers = meld.filter(t => !t.isJoker).sort((a, b) => a.number - b.number);
  if (nonJokers.length === 0) return false;
  // Groups (all same number) → no flip
  if (nonJokers.every(t => t.number === nonJokers[0].number)) return false;

  if (jokerIndex === 0) {
    // Joker at low end → can move to high end only if max + 1 ≤ 13
    return Math.max(...nonJokers.map(t => t.number)) + 1 <= 13;
  } else {
    // Joker at high end → can move to low end only if min - 1 ≥ 1
    return Math.min(...nonJokers.map(t => t.number)) - 1 >= 1;
  }
}
