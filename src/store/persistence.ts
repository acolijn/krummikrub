import type { Tile } from '../types';

const NAMES_KEY = 'krummikrub.playerNames';
const SCORES_KEY = 'krummikrub.scores';

export interface PlayerNames {
  human: string;
  ai1: string;
  ai2: string;
}

export interface ScoreRow {
  name: string;
  wins: number;
  losses: number;
  points: number;
  games: number;
}

export type Scoreboard = Record<string, ScoreRow>;

const DEFAULT_NAMES: PlayerNames = {
  human: 'You',
  ai1: 'Computer 1',
  ai2: 'Computer 2',
};

export function loadNames(): PlayerNames {
  try {
    const raw = localStorage.getItem(NAMES_KEY);
    if (!raw) return { ...DEFAULT_NAMES };
    const parsed = JSON.parse(raw) as Partial<PlayerNames>;
    return {
      human: parsed.human?.trim() || DEFAULT_NAMES.human,
      ai1: parsed.ai1?.trim() || DEFAULT_NAMES.ai1,
      ai2: parsed.ai2?.trim() || DEFAULT_NAMES.ai2,
    };
  } catch {
    return { ...DEFAULT_NAMES };
  }
}

export function saveNames(names: PlayerNames): void {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch {
    // ignore quota / private mode errors
  }
}

export function loadScores(): Scoreboard {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Scoreboard;
  } catch {
    return {};
  }
}

export function saveScores(scores: Scoreboard): void {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
  } catch {
    // ignore
  }
}

export function clearScores(): void {
  try {
    localStorage.removeItem(SCORES_KEY);
  } catch {
    // ignore
  }
}

// Joker held = 30 penalty points (standard Rummikub).
export function rackPoints(rack: Tile[]): number {
  return rack.reduce((sum, t) => sum + (t.isJoker ? 30 : t.number), 0);
}

export function recordGame(
  participants: string[],
  winnerName: string,
  rackPointsByName: Record<string, number>
): Scoreboard {
  const scores = loadScores();
  // Winner earns sum of opponents' remaining rack points; losers lose their own rack points.
  const winnerGain = Object.entries(rackPointsByName)
    .filter(([name]) => name !== winnerName)
    .reduce((sum, [, pts]) => sum + pts, 0);

  for (const name of participants) {
    const row = scores[name] ?? { name, wins: 0, losses: 0, points: 0, games: 0 };
    row.games += 1;
    if (name === winnerName) {
      row.wins += 1;
      row.points += winnerGain;
    } else {
      row.losses += 1;
      row.points -= rackPointsByName[name] ?? 0;
    }
    scores[name] = row;
  }
  saveScores(scores);
  return scores;
}
