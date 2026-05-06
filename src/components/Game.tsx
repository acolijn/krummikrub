import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useGameStore } from '../store/gameStore';
import { findBestMove } from '../ai/aiPlayer';
import { GameBoard } from './GameBoard';
import { PlayerRack } from './PlayerRack';
import { OpponentRack } from './OpponentRack';
import { DrawPile } from './DrawPile';
import { TileCard } from './TileCard';
import type { Tile, Board, Difficulty } from '../types';
import { cloneBoard, cloneRack, sortMeldForDisplay } from '../game/logic';

export function Game() {
  const store = useGameStore();
  const {
    phase,
    players,
    board,
    drawPile,
    currentPlayerIndex,
    message,
    winner,
    initGame,
    setBoard,
    commitTurn,
    drawTile,
    commitAiTurn,
    nextTurn,
  } = store;

  const [activeTile, setActiveTile] = useState<Tile | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [selectedTileIds, setSelectedTileIds] = useState<string[]>([]);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHumanTurn = currentPlayerIndex === 0 && phase === 'playing';

  // ── AI turn trigger ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    if (currentPlayerIndex === 0) return;

    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);

    aiTimeoutRef.current = setTimeout(() => {
      const player = players[currentPlayerIndex];
      const move = findBestMove(player.rack, board, player.hasInitialMeld, store.difficulty);

      if (move) {
        commitAiTurn(move.board, move.newRack, move.hasInitialMeld);
      } else {
        // Draw a tile
        if (drawPile.length > 0) {
          const [drawn, ...rest] = drawPile;
          useGameStore.setState(s => {
            const ps = [...s.players];
            ps[currentPlayerIndex] = {
              ...ps[currentPlayerIndex],
              rack: [...ps[currentPlayerIndex].rack, drawn],
            };
            return { players: ps, drawPile: rest };
          });
        }
      }

      nextTurn();
    }, 900);

    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, [currentPlayerIndex, phase]);

  // ── Shared tile-move logic (used by both DnD and click) ─────────────────
  function applyMove(tileId: string, destinationId: string) {
    if (!isHumanTurn) return;

    const humanRack = players[0].rack;
    const tileFromRack = humanRack.find(t => t.id === tileId);
    const tileFromBoard = board.flat().find(t => t.id === tileId);
    const tile = tileFromRack ?? tileFromBoard;
    if (!tile) return;

    let newBoard: Board = cloneBoard(board);
    let newRack: Tile[] = cloneRack(humanRack);

    const srcMeldIdx = tileFromBoard
      ? board.findIndex(m => m.some(t => t.id === tileId))
      : -1;
    let splitAddedMeld = false;

    if (tileFromRack) {
      newRack = newRack.filter(t => t.id !== tileId);
    } else if (tileFromBoard) {
      const newMelds: Board = [];
      for (const m of newBoard) {
        const idx = m.findIndex(t => t.id === tileId);
        if (idx === -1) {
          newMelds.push(m);
        } else {
          const left = m.slice(0, idx);
          const right = m.slice(idx + 1);
          if (left.length > 0) newMelds.push(left);
          if (right.length > 0) newMelds.push(right);
          if (left.length > 0 && right.length > 0) splitAddedMeld = true;
        }
      }
      newBoard = newMelds;
    }

    if (destinationId === 'rack') {
      newRack = [...newRack, tile];
    } else if (destinationId === 'new-meld') {
      newBoard = [...newBoard, [tile]];
    } else if (destinationId.startsWith('meld-')) {
      let meldIdx = parseInt(destinationId.replace('meld-', ''), 10);
      if (splitAddedMeld && meldIdx > srcMeldIdx) meldIdx++;
      if (meldIdx >= 0 && meldIdx < newBoard.length) {
        newBoard[meldIdx] = sortMeldForDisplay([...newBoard[meldIdx], tile]);
      } else {
        newBoard = [...newBoard, [tile]];
      }
    }

    setBoard(newBoard, newRack);
  }

  // ── Multi-tile move (used by click-to-place) ────────────────────────────
  function applyMoveMultiple(tileIds: string[], destinationId: string) {
    if (!isHumanTurn || tileIds.length === 0) return;

    const humanRack = players[0].rack;
    let newBoard: Board = cloneBoard(board);
    let newRack: Tile[] = cloneRack(humanRack);
    const tilesToMove: Tile[] = [];

    // Remember destination meld by its tile ids so we can find it after splits
    let destMeldAnchor: string | null = null;
    if (destinationId.startsWith('meld-')) {
      const meldIdx = parseInt(destinationId.replace('meld-', ''), 10);
      if (meldIdx >= 0 && meldIdx < board.length) {
        destMeldAnchor = board[meldIdx].find(t => !tileIds.includes(t.id))?.id ?? null;
      }
    }

    for (const tileId of tileIds) {
      const tileFromRack = newRack.find(t => t.id === tileId);
      const tileFromBoard = !tileFromRack ? newBoard.flat().find(t => t.id === tileId) : null;
      const tile = tileFromRack ?? tileFromBoard;
      if (!tile) continue;
      tilesToMove.push(tile);

      if (tileFromRack) {
        newRack = newRack.filter(t => t.id !== tileId);
      } else {
        const newMelds: Board = [];
        for (const m of newBoard) {
          const idx = m.findIndex(t => t.id === tileId);
          if (idx === -1) { newMelds.push(m); continue; }
          const left = m.slice(0, idx);
          const right = m.slice(idx + 1);
          if (left.length > 0) newMelds.push(left);
          if (right.length > 0) newMelds.push(right);
        }
        newBoard = newMelds;
      }
    }

    if (tilesToMove.length === 0) return;

    if (destinationId === 'rack') {
      newRack = [...newRack, ...tilesToMove];
    } else if (destinationId === 'new-meld') {
      newBoard = [...newBoard, sortMeldForDisplay(tilesToMove)];
    } else if (destMeldAnchor) {
      const destIdx = newBoard.findIndex(m => m.some(t => t.id === destMeldAnchor));
      if (destIdx >= 0) {
        newBoard[destIdx] = sortMeldForDisplay([...newBoard[destIdx], ...tilesToMove]);
      } else {
        newBoard = [...newBoard, sortMeldForDisplay(tilesToMove)];
      }
    }

    setBoard(newBoard, newRack);
  }

  // ── Click-to-select / click-to-place ────────────────────────────────────
  function handleTileClick(tileId: string) {
    if (!isHumanTurn) return;
    setSelectedTileIds(prev =>
      prev.includes(tileId) ? prev.filter(id => id !== tileId) : [...prev, tileId]
    );
  }

  function handleZoneClick(zoneId: string) {
    if (!isHumanTurn || selectedTileIds.length === 0) return;
    applyMoveMultiple(selectedTileIds, zoneId);
    setSelectedTileIds([]);
  }

  // ── DnD sensors ─────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart(event: DragStartEvent) {
    setSelectedTileIds([]); // clear click-selection when dragging starts
    const id = event.active.id as string;
    const all = [...(players[0]?.rack ?? []), ...board.flat()];
    const tile = all.find(t => t.id === id) ?? null;
    setActiveTile(tile);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTile(null);
    if (!isHumanTurn) return;
    const { active, over } = event;
    if (!over) return;
    applyMove(active.id as string, over.id as string);
  }

  function handleCommit() {
    setErrorMsg('');
    const result = commitTurn();
    if (!result.ok) setErrorMsg(result.reason ?? 'Invalid move.');
  }

  function handleDraw() {
    setErrorMsg('');
    drawTile();
  }

  function handleFlipJoker(meldIndex: number, tileId: string) {
    const newBoard = cloneBoard(board);
    const meld = newBoard[meldIndex];
    const idx = meld.findIndex(t => t.id === tileId);
    if (idx === 0) {
      newBoard[meldIndex] = [...meld.slice(1), meld[0]];
    } else if (idx === meld.length - 1) {
      newBoard[meldIndex] = [meld[idx], ...meld.slice(0, idx)];
    }
    setBoard(newBoard, players[0].rack);
  }

  if (phase === 'setup') {
    const difficulties: { value: Difficulty; label: string; desc: string }[] = [
      { value: 'easy',       label: 'Easy',       desc: 'Plays one 3-tile meld per turn' },
      { value: 'medium',     label: 'Medium',     desc: 'Greedy: maximises tiles played' },
      { value: 'expert',     label: 'Expert',     desc: 'Deep search: tries combos of up to 3 melds' },
      { value: 'superhuman', label: 'Superhuman', desc: 'Exhaustive: explores every possible combination — never misses a play' },
    ];
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-8">
        <h1 className="text-5xl font-bold text-white tracking-tight">KrummiKrub</h1>
        <div className="flex flex-col gap-3 w-72">
          {difficulties.map(d => (
            <button
              key={d.value}
              onClick={() => setSelectedDifficulty(d.value)}
              className={`px-5 py-3 rounded-xl border text-left transition-colors ${
                selectedDifficulty === d.value
                  ? 'border-indigo-400 bg-indigo-700 text-white'
                  : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-indigo-500'
              }`}
            >
              <div className="font-semibold">{d.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{d.desc}</div>
            </button>
          ))}
        </div>
        <button
          onClick={() => initGame(selectedDifficulty)}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-lg transition-colors"
        >
          Start Game
        </button>
      </div>
    );
  }

  if (phase === 'ended') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <h1 className="text-4xl font-bold text-white">{message}</h1>
        <p className="text-gray-400">{winner?.name} wins!</p>
        <button
          onClick={() => useGameStore.setState({ phase: 'setup' })}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-lg transition-colors"
        >
          Play Again
        </button>
      </div>
    );
  }

  const human = players[0];
  const opponents = players.slice(1);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col min-h-screen p-3 gap-3">

        {/* Opponents row */}
        <div className="flex gap-4 justify-center">
          {opponents.map((p, i) => (
            <OpponentRack key={p.id} player={p} isActive={currentPlayerIndex === i + 1} />
          ))}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-gray-900 rounded-lg text-sm">
          <span className="text-gray-300">{message}</span>
          <span className="text-gray-500">Draw pile: {drawPile.length}</span>
        </div>

        {/* Board */}
        <GameBoard
          board={board}
          isHumanTurn={isHumanTurn}
          onFlipJoker={isHumanTurn ? handleFlipJoker : undefined}
          selectedTileIds={selectedTileIds}
          onTileClick={handleTileClick}
          onZoneClick={handleZoneClick}
        />

        {/* Error message */}
        {errorMsg && (
          <div className="px-3 py-2 bg-red-900/60 border border-red-700 rounded-lg text-red-300 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Human rack + controls */}
        <div className="flex gap-3 items-start">
          <DrawPile count={drawPile.length} onDraw={handleDraw} disabled={!isHumanTurn} />

          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 font-semibold">{human?.name} ({human?.rack.length} tiles)</span>
              {!human?.hasInitialMeld && (
                <span className="text-xs text-yellow-500 bg-yellow-900/40 px-2 py-0.5 rounded">
                  Need ≥30 pts first play
                </span>
              )}
            </div>
            <PlayerRack
              rack={human?.rack ?? []}
              isHumanTurn={isHumanTurn}
              selectedTileIds={selectedTileIds}
              onTileClick={handleTileClick}
              onRackClick={() => handleZoneClick('rack')}
            />
          </div>

          <button
            onClick={handleCommit}
            disabled={!isHumanTurn}
            className={`
              px-4 py-2 rounded-lg font-semibold text-sm transition-colors self-center
              ${isHumanTurn
                ? 'bg-green-700 hover:bg-green-600 text-white cursor-pointer'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
            `}
          >
            End Turn
          </button>
        </div>
      </div>

      <DragOverlay>
        {activeTile && <TileCard tile={activeTile} />}
      </DragOverlay>
    </DndContext>
  );
}
