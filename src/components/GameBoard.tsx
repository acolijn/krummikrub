import { useDroppable } from '@dnd-kit/core';
import type { Board } from '../types';
import { MeldGroup } from './MeldGroup';

interface Props {
  board: Board;
  isHumanTurn: boolean;
  onFlipJoker?: (meldIndex: number, tileId: string) => void;
}

export function GameBoard({ board, isHumanTurn, onFlipJoker }: Props) {
  // Drop zone for creating a new meld
  const { setNodeRef, isOver } = useDroppable({ id: 'new-meld' });

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex flex-wrap gap-3 min-h-[120px]">
        {board.map((meld, i) => (
          <MeldGroup key={i} meld={meld} meldIndex={i} isHumanTurn={isHumanTurn} onFlipJoker={onFlipJoker} />
        ))}
        {/* Drop zone for starting a new meld */}
        {isHumanTurn && (
          <div
            ref={setNodeRef}
            className={`
              flex gap-1 p-2 rounded-lg border border-dashed min-w-[80px] min-h-[64px]
              items-center justify-center text-gray-500 text-sm
              ${isOver ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' : 'border-gray-600'}
            `}
          >
            + new meld
          </div>
        )}
      </div>
    </div>
  );
}
