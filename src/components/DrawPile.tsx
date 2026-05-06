interface Props {
  count: number;
  onDraw: () => void;
  disabled: boolean;
}

export function DrawPile({ count, onDraw, disabled }: Props) {
  return (
    <button
      onClick={onDraw}
      disabled={disabled}
      className={`
        flex flex-col items-center gap-1 px-3 py-2 rounded-lg border
        ${disabled
          ? 'border-gray-700 text-gray-600 cursor-not-allowed'
          : 'border-indigo-500 text-indigo-300 hover:bg-indigo-900/40 cursor-pointer'}
        transition-colors
      `}
    >
      <span className="text-2xl">🀱</span>
      <span className="text-xs font-semibold">{count} left</span>
      <span className="text-xs">Draw</span>
    </button>
  );
}
