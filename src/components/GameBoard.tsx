import { useDroppable } from '@dnd-kit/core';
import type { Board } from '../types';
import { MeldGroup } from './MeldGroup';

interface Props {
  board: Board;
  isHumanTurn: boolean;
  onFlipJoker?: (meldIndex: number, tileId: string) => void;
  selectedTileIds?: string[];
  onTileClick?: (tileId: string) => void;
  onZoneClick?: (zoneId: string) => void;
}

export function GameBoard({ board, isHumanTurn, onFlipJoker, selectedTileIds, onTileClick, onZoneClick }: Props) {
  // Drop zone for creating a new meld
  const { setNodeRef, isOver } = useDroppable({ id: 'new-meld' });
  const hasSelection = (selectedTileIds?.length ?? 0) > 0;

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex flex-wrap gap-3 min-h-[120px]">
        {board.map((meld, i) => (
          <MeldGroup
            key={i}
            meld={meld}
            meldIndex={i}
            isHumanTurn={isHumanTurn}
            onFlipJoker={onFlipJoker}
            selectedTileIds={selectedTileIds}
            onTileClick={onTileClick}
            onMeldClick={onZoneClick}
          />
        ))}
        {/* Drop zone / click zone for starting a new meld */}
        {isHumanTurn && (
          <div
            ref={setNodeRef}
            onClick={hasSelection && onZoneClick ? () => onZoneClick('new-meld') : undefined}
            className={`
              flex gap-1 p-2 rounded-lg border border-dashed min-w-[80px] min-h-[64px]
              items-center justify-center text-gray-500 text-sm
              ${isOver ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-gray-600'}
              ${hasSelection ? 'cursor-pointer hover:border-yellow-500/60 hover:text-yellow-500' : ''}
            `}
          >
            + new meld
          </div>
        )}
      </div>
    </div>
  );
}
