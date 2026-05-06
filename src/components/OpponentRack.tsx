import { useState } from 'react';
import type { Player, TileColor } from '../types';
import { TileCard } from './TileCard';

const COLORS: TileColor[] = ['red', 'blue', 'black', 'orange'];

const COLOR_DOT: Record<TileColor, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-400',
  black: 'bg-gray-300',
  orange: 'bg-orange-400',
};

interface Props {
  player: Player;
  isActive: boolean;
}

export function OpponentRack({ player, isActive }: Props) {
  const [revealed, setRevealed] = useState(false);
  const { rack } = player;

  const rows = COLORS.map(color => {
    const tiles = rack
      .filter(t => !t.isJoker && t.color === color)
      .sort((a, b) => a.number - b.number);
    const slots: (typeof tiles[0] | null)[] = Array(13).fill(null);
    const extras: typeof tiles = [];
    for (const tile of tiles) {
      const idx = tile.number - 1;
      if (slots[idx] === null) slots[idx] = tile; else extras.push(tile);
    }
    return { color, slots, extras };
  });

  const jokers = rack.filter(t => t.isJoker);
  const hasExtras = rows.some(r => r.extras.length > 0) || jokers.length > 0;

  return (
    <div className={`flex flex-col gap-1 p-2 rounded-lg ${isActive ? 'ring-2 ring-yellow-400' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-semibold">{player.name}</span>
        <span className="text-xs text-gray-500">({rack.length} tiles)</span>
        <button
          onClick={() => setRevealed(r => !r)}
          className="text-[10px] text-gray-500 hover:text-gray-300 underline ml-1"
        >
          {revealed ? 'hide' : 'show'}
        </button>
      </div>

      {revealed ? (
        <div className="p-2 rounded-lg border border-gray-600 bg-gray-900/70">
          {rows.map(({ color, slots, extras }) => (
            <div key={color} className="flex items-center gap-1 mb-1 last:mb-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${COLOR_DOT[color]}`} />
              {slots.map((tile, i) =>
                tile
                  ? <TileCard key={tile.id} tile={tile} small />
                  : <div key={i} className="w-8 h-10 rounded border border-dashed border-gray-700 opacity-40" />
              )}
              {extras.map(tile => <TileCard key={tile.id} tile={tile} small />)}
            </div>
          ))}
          {hasExtras && jokers.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <div className="w-2 h-2 flex-shrink-0" />
              {jokers.map(tile => <TileCard key={tile.id} tile={tile} small />)}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {rack.map(tile => <TileCard key={tile.id} tile={tile} faceDown small />)}
        </div>
      )}
    </div>
  );
}
