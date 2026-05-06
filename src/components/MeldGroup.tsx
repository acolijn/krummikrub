import { useDroppable } from '@dnd-kit/core';
import type { Meld } from '../types';
import { TileCard } from './TileCard';
import { isValidMeld, canFlipJoker } from '../game/logic';

interface Props {
  meld: Meld;
  meldIndex: number;
  isHumanTurn: boolean;
  onFlipJoker?: (meldIndex: number, tileId: string) => void;
  selectedTileIds?: string[];
  onTileClick?: (tileId: string) => void;
  onMeldClick?: (meldId: string) => void;
}

export function MeldGroup({ meld, meldIndex, isHumanTurn, onFlipJoker, selectedTileIds, onTileClick, onMeldClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `meld-${meldIndex}` });
  const valid = isValidMeld(meld);
  const meldId = `meld-${meldIndex}`;
  const hasSelection = (selectedTileIds?.length ?? 0) > 0;

  return (
    <div
      ref={setNodeRef}
      onClick={onMeldClick && isHumanTurn && hasSelection ? (e) => { e.stopPropagation(); onMeldClick(meldId); } : undefined}
      className={`
        flex gap-1 p-2 pb-5 rounded-lg border min-w-[80px] min-h-[64px]
        ${isOver ? 'border-yellow-400 bg-yellow-400/10' : 'border-gray-600 bg-gray-800/50'}
        ${!valid ? 'border-red-500 bg-red-900/20' : ''}
        ${isHumanTurn && hasSelection ? 'cursor-pointer hover:border-yellow-500/60' : ''}
      `}
    >
      {meld.map((tile, idx) => {
        const flippable = isHumanTurn && !!onFlipJoker && canFlipJoker(meld, idx);
        return (
          <div key={tile.id} className="relative">
            <TileCard
              tile={tile}
              draggable={isHumanTurn}
              isSelected={selectedTileIds?.includes(tile.id) ?? false}
              onClick={onTileClick}
            />
            {flippable && (
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onFlipJoker!(meldIndex, tile.id); }}
                className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 text-xs text-yellow-400 hover:text-yellow-200 bg-gray-700 hover:bg-gray-600 rounded px-1 leading-4 border border-yellow-700"
                title="Move joker to other end"
              >
                ⇄
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
