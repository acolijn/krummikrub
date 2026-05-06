import type { Tile } from '../types';
import { useDraggable } from '@dnd-kit/core';

interface Props {
  tile: Tile;
  draggable?: boolean;
  small?: boolean;
  faceDown?: boolean;
}

const COLOR_CLASSES: Record<string, string> = {
  red: 'text-red-500 border-red-500',
  blue: 'text-blue-400 border-blue-400',
  black: 'text-gray-100 border-gray-400',
  orange: 'text-orange-400 border-orange-400',
};

export function TileCard({ tile, draggable = false, small = false, faceDown = false }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: tile.id,
    disabled: !draggable,
  });

  const sizeClass = small ? 'w-8 h-10 text-xs' : 'w-10 h-14 text-sm';
  const colorClass = faceDown ? 'bg-indigo-900 border-indigo-700' : `bg-gray-800 border ${COLOR_CLASSES[tile.color] ?? 'text-white border-gray-500'}`;

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      className={`
        ${sizeClass} ${colorClass}
        rounded flex items-center justify-center font-bold select-none
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
        ${isDragging ? 'opacity-30' : 'opacity-100'}
        transition-opacity
      `}
    >
      {faceDown ? (
        <span className="text-indigo-500 text-lg">▪</span>
      ) : tile.isJoker ? (
        <span className="text-yellow-300 text-lg">★</span>
      ) : (
        tile.number
      )}
    </div>
  );
}
