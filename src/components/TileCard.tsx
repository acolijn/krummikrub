import type { Tile } from '../types';
import { useDraggable } from '@dnd-kit/core';

interface Props {
  tile: Tile;
  draggable?: boolean;
  small?: boolean;
  faceDown?: boolean;
  isSelected?: boolean;
  onClick?: (tileId: string) => void;
}

const COLOR_CLASSES: Record<string, string> = {
  red: 'text-red-500 border-red-500',
  blue: 'text-blue-400 border-blue-400',
  black: 'text-gray-100 border-gray-400',
  orange: 'text-orange-400 border-orange-400',
};

// Small symbol in the top-right corner for colorblind accessibility
const COLOR_SYMBOLS: Record<string, string> = {
  red:    '●',  // circle
  blue:   '■',  // square
  black:  '▲',  // triangle
  orange: '◆',  // diamond
};

export function TileCard({ tile, draggable = false, small = false, faceDown = false, isSelected = false, onClick }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: tile.id,
    disabled: !draggable,
  });

  const sizeClass = small ? 'w-8 h-10 text-xs' : 'w-10 h-14 text-sm';
  const colorClass = faceDown ? 'bg-indigo-900 border-indigo-700' : `bg-gray-800 border ${COLOR_CLASSES[tile.color] ?? 'text-white border-gray-500'}`;
  const selectedClass = isSelected ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-900 -translate-y-1' : '';
  const symbol = COLOR_SYMBOLS[tile.color];

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(tile.id); } : undefined}
      className={`
        relative ${sizeClass} ${colorClass} ${selectedClass}
        rounded flex items-center justify-center font-bold select-none
        ${draggable || onClick ? 'cursor-pointer' : ''}
        ${isDragging ? 'opacity-30' : 'opacity-100'}
        transition-all
      `}
    >
      {!faceDown && !tile.isJoker && symbol && (
        <span className={`absolute top-0.5 right-0.5 leading-none ${small ? 'text-[6px]' : 'text-[7px]'} opacity-70`}>
          {symbol}
        </span>
      )}
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
