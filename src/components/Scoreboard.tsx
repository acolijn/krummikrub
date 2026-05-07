import { useState } from 'react';
import { clearScores, type Scoreboard as ScoreboardData } from '../store/persistence';

interface Props {
  scores: ScoreboardData;
  onCleared?: () => void;
}

export function Scoreboard({ scores, onCleared }: Props) {
  const [confirming, setConfirming] = useState(false);
  const rows = Object.values(scores).sort((a, b) => b.points - a.points);

  if (rows.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic">No games played yet.</div>
    );
  }

  function handleClear() {
    if (!confirming) { setConfirming(true); return; }
    clearScores();
    setConfirming(false);
    onCleared?.();
  }

  return (
    <div className="flex flex-col gap-2 w-full max-w-md">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Scoreboard</h2>
        <button
          onClick={handleClear}
          className="text-xs text-gray-400 hover:text-red-400 transition-colors"
        >
          {confirming ? 'Click again to confirm' : 'Reset'}
        </button>
      </div>
      <table className="w-full text-sm bg-gray-900 rounded-lg overflow-hidden">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700">
            <th className="text-left px-3 py-2">Player</th>
            <th className="px-3 py-2">W</th>
            <th className="px-3 py-2">L</th>
            <th className="px-3 py-2 text-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-b border-gray-800 last:border-0">
              <td className="px-3 py-2 text-white">{r.name}</td>
              <td className="px-3 py-2 text-center text-green-400">{r.wins}</td>
              <td className="px-3 py-2 text-center text-red-400">{r.losses}</td>
              <td className={`px-3 py-2 text-right font-mono ${r.points >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                {r.points > 0 ? '+' : ''}{r.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
