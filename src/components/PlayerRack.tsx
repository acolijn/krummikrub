import type { Tile, TileColor } from '../types';
import { TileCard } from './TileCard';
import { useDroppable } from '@dnd-kit/core';

const COLORS: TileColor[] = ['red', 'blue', 'black', 'orange'];

const COLOR_LABEL: Record<TileColor, string> = {
  red: 'R', blue: 'B', black: 'K', orange: 'O',
};

const COLOR_DOT: Record<TileColor, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-400',
  black: 'bg-gray-300',
  orange: 'bg-orange-400',
};

interface Props {
  rack: Tile[];
  isHumanTurn: boolean;
  selectedTileIds?: string[];
  onTileClick?: (tileId: string) => void;
  onRackClick?: () => void;
}

function EmptySlot({ onClick }: { onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`w-8 h-10 rounded border border-dashed border-gray-700 opacity-40 ${onClick ? 'cursor-pointer hover:opacity-70' : ''}`}
    />
  );
}

export function PlayerRack({ rack, isHumanTurn, selectedTileIds, onTileClick, onRackClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'rack' });
  const hasSelection = (selectedTileIds?.length ?? 0) > 0;
  const jokers = rack.filter(t => t.isJoker);

  const rows = COLORS.map(color => {
    const tiles = rack
      .filter(t => !t.isJoker && t.color === color)
      .sort((a, b) => a.number - b.number);

    // First copy of each number → fixed slot; second copy → extras on right
    const slots: (Tile | null)[] = Array(13).fill(null);
    const extras: Tile[] = [];
    for (const tile of tiles) {
      const idx = tile.number - 1;
      if (slots[idx] === null) {
        slots[idx] = tile;
      } else {
        extras.push(tile);
      }
    }
    return { color, slots, extras };
  });

  const hasExtras = rows.some(r => r.extras.length > 0) || jokers.length > 0;

  return (
    <div
      ref={setNodeRef}
      onClick={onRackClick && hasSelection ? onRackClick : undefined}
      className={`
        p-3 rounded-xl border
        ${isOver ? 'border-yellow-400 bg-yellow-400/10' : 'border-gray-600 bg-gray-900/70'}
        ${hasSelection ? 'cursor-pointer' : ''}
      `}
    >
      {rows.map(({ color, slots, extras }, rowIdx) => (
        <div key={color} className="flex items-center gap-1 mb-1 last:mb-0">
          {/* Color indicator */}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${COLOR_DOT[color]}`} title={COLOR_LABEL[color]} />

          {/* Fixed slots 1–13 */}
          {slots.map((tile, i) =>
            tile
              ? <TileCard key={tile.id} tile={tile} draggable={isHumanTurn} small isSelected={selectedTileIds?.includes(tile.id) ?? false} onClick={onTileClick} />
              : <EmptySlot key={i} onClick={onRackClick && hasSelection ? onRackClick : undefined} />
          )}

          {/* Separator before right section */}
          {hasExtras && (
            <div className="w-px h-8 bg-gray-600 mx-1 flex-shrink-0" />
          )}

          {/* Duplicate tiles */}
          {extras.map(tile => (
            <TileCard key={tile.id} tile={tile} draggable={isHumanTurn} small isSelected={selectedTileIds?.includes(tile.id) ?? false} onClick={onTileClick} />
          ))}

          {/* Jokers on top row */}
          {rowIdx === 0 && jokers.map(tile => (
            <TileCard key={tile.id} tile={tile} draggable={isHumanTurn} small isSelected={selectedTileIds?.includes(tile.id) ?? false} onClick={onTileClick} />
          ))}
        </div>
      ))}

      {rack.length === 0 && (
        <span className="text-gray-500 text-sm">Empty rack</span>
      )}
    </div>
  );
}
