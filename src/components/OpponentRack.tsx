import type { Player } from '../types';
import { TileCard } from './TileCard';

interface Props {
  player: Player;
  isActive: boolean;
}

export function OpponentRack({ player, isActive }: Props) {
  return (
    <div className={`flex flex-col items-center gap-1 p-2 rounded-lg ${isActive ? 'ring-2 ring-yellow-400' : ''}`}>
      <span className="text-xs text-gray-400 font-semibold">{player.name}</span>
      <div className="flex flex-wrap gap-1 justify-center">
        {player.rack.map(tile => (
          <TileCard key={tile.id} tile={tile} faceDown small />
        ))}
      </div>
      <span className="text-xs text-gray-500">{player.rack.length} tiles</span>
    </div>
  );
}
